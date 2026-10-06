//! Voice gateway v8 and the UDP media socket.
//!
//! After the handshake, a dedicated thread captures the microphone, encodes Opus,
//! and decrypts incoming speech. This task only keeps the gateway and UDP socket
//! alive. Reconnects use the same capped delay as the main gateway.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::net::UdpSocket;
use tokio::sync::watch;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::voice::{
    choose_mode, encrypt_voice, ip_discovery_request, parse_ip_discovery, rtp_header,
    select_protocol, speaking_payload, voice_gateway_url, voice_heartbeat, voice_identify,
    voice_reconnect_delay_ms, CipherMode, OPUS_SILENCE,
};
use super::voice_media::{start_media, VoiceAudio};

pub struct VoiceHello {
    pub endpoint: String,
    pub server_id: String,
    pub user_id: String,
    pub session_id: String,
    pub token: String,
    pub epoch: u64,
}

#[derive(Debug, Clone)]
pub enum VoiceLinkEvent {
    Status { state: String, detail: String, epoch: u64 },
    Speaking { user_id: String, speaking: bool, epoch: u64 },
}

fn watched(rx: &watch::Receiver<bool>) -> bool {
    *rx.borrow()
}

pub async fn maintain_voice<F>(
    hello: VoiceHello,
    mut cancel: watch::Receiver<bool>,
    mut speaking: watch::Receiver<bool>,
    audio: watch::Receiver<VoiceAudio>,
    volumes: Arc<Mutex<HashMap<String, f32>>>,
    mut emit: F,
) where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let mut attempt = 0u32;
    loop {
        if watched(&cancel) {
            emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
            return;
        }
        let state = if attempt == 0 { "connecting" } else { "reconnecting" };
        emit(VoiceLinkEvent::Status { state: state.into(), detail: String::new(), epoch: hello.epoch });
        match voice_once(&hello, &mut cancel, &mut speaking, &audio, &volumes, &mut emit).await {
            Ok(()) => {
                emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
                return;
            }
            Err(err) => {
                if err == "Cancelled" || watched(&cancel) {
                    emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
                    return;
                }
                let delay = voice_reconnect_delay_ms(attempt);
                attempt = attempt.saturating_add(1);
                emit(VoiceLinkEvent::Status { state: "reconnecting".into(), detail: err, epoch: hello.epoch });
                tokio::select! {
                    changed = cancel.changed() => {
                        if changed.is_err() || watched(&cancel) {
                            emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
                            return;
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_millis(delay)) => {}
                }
            }
        }
    }
}

async fn voice_once<F>(
    hello: &VoiceHello,
    cancel: &mut watch::Receiver<bool>,
    speaking: &mut watch::Receiver<bool>,
    audio: &watch::Receiver<VoiceAudio>,
    volumes: &Arc<Mutex<HashMap<String, f32>>>,
    emit: &mut F,
) -> Result<(), String>
where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let url = voice_gateway_url(&hello.endpoint).ok_or_else(|| "Bad voice endpoint".to_string())?;
    let (socket, _) = connect_async(url).await.map_err(|_| "Voice gateway refused the connection".to_string())?;
    let (mut write, mut read) = socket.split();
    let identify = voice_identify(&hello.server_id, &hello.user_id, &hello.session_id, &hello.token);
    write.send(Message::Text(identify)).await.map_err(|_| "Voice identify failed".to_string())?;

    let (ready, hello_interval) = read_ready(&mut read, cancel).await?;
    let ssrc = ready.get("ssrc").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let ip = ready.get("ip").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let port = ready.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
    let interval = ready
        .get("heartbeat_interval")
        .and_then(|v| v.as_u64())
        .filter(|value| *value > 0)
        .or(hello_interval)
        .unwrap_or(15_000)
        .max(3_000);
    if ip.is_empty() || port == 0 || ssrc == 0 {
        return Err("Voice ready was incomplete".into());
    }

    let udp = UdpSocket::bind("0.0.0.0:0").await.map_err(|err| err.to_string())?;
    udp.connect((ip.as_str(), port)).await.map_err(|err| err.to_string())?;
    udp.send(&ip_discovery_request(ssrc)).await.map_err(|err| err.to_string())?;
    let mut discovery = [0u8; 128];
    let size = timeout(Duration::from_secs(5), udp.recv(&mut discovery))
        .await
        .map_err(|_| "UDP discovery timed out".to_string())?
        .map_err(|err| err.to_string())?;
    let (address, discovered_port) = parse_ip_discovery(&discovery[..size]).ok_or_else(|| "Bad discovery response".to_string())?;

    let offered: Vec<String> = ready
        .get("modes")
        .and_then(|v| v.as_array())
        .map(|modes| modes.iter().filter_map(|m| m.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let mode = choose_mode(&offered).ok_or_else(|| "No supported voice encryption".to_string())?;
    write
        .send(Message::Text(select_protocol(&address, discovered_port, mode)))
        .await
        .map_err(|_| "Select protocol failed".to_string())?;

    let description = next_op(&mut read, cancel, 4, Duration::from_secs(8)).await?;
    let chosen = description.get("mode").and_then(|v| v.as_str()).unwrap_or(mode.name());
    let mode = choose_mode(&[chosen.to_string()]).unwrap_or(mode);
    let key = secret_key(&description).ok_or_else(|| "Voice key missing".to_string())?;
    let _ = write.send(Message::Text(speaking_payload(ssrc, false, false))).await;

    let ssrc_users = Arc::new(Mutex::new(HashMap::new()));
    let pipe = start_media(mode, key, ssrc, audio.clone(), speaking.clone(), volumes.clone(), ssrc_users.clone()).ok();
    let detail = if pipe.is_some() { mode.name().to_string() } else { "Voice audio did not start".into() };
    let (mut outbound_rx, mut inbound_tx, mut speaking_rx, _media) = match pipe {
        Some(mut pipe) => {
            let outbound = std::mem::replace(&mut pipe.outbound, empty_unbounded());
            let speaking_events = std::mem::replace(&mut pipe.speaking, empty_speaking());
            let inbound = pipe.inbound.clone();
            (Some(outbound), Some(inbound), Some(speaking_events), Some(pipe))
        }
        None => (None, None, None, None),
    };
    emit(VoiceLinkEvent::Status { state: "connected".into(), detail, epoch: hello.epoch });

    let mut seq_ack: Option<i64> = None;
    let mut next_heartbeat = Instant::now() + Duration::from_millis(interval);
    let mut next_keepalive = Instant::now() + Duration::from_secs(5);
    let mut fallback_seq = 0u16;
    let mut fallback_ts = 0u32;
    let mut fallback_nonce = 0u32;
    let udp = Arc::new(udp);
    let mut packet = [0u8; 4096];

    loop {
        if watched(cancel) {
            return Ok(());
        }
        let until_heartbeat = next_heartbeat.saturating_duration_since(Instant::now());
        let until_keepalive = if inbound_tx.is_some() { Duration::from_secs(60) } else { next_keepalive.saturating_duration_since(Instant::now()) };
        let wait = until_heartbeat.min(until_keepalive);
        let udp_keepalive = udp.clone();
        let udp_recv = udp.clone();
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || watched(cancel) {
                    return Ok(());
                }
            }
            _ = tokio::time::sleep(wait) => {
                let now = Instant::now();
                if now >= next_heartbeat {
                    let _ = write.send(Message::Text(voice_heartbeat(now_ms(), seq_ack))).await;
                    next_heartbeat = now + Duration::from_millis(interval);
                }
                if inbound_tx.is_none() && now >= next_keepalive {
                    if send_silence(&udp_keepalive, mode, &key, ssrc, &mut fallback_seq, &mut fallback_ts, &mut fallback_nonce).await.is_err() {
                        return Err("UDP send failed".into());
                    }
                    next_keepalive = now + Duration::from_secs(5);
                }
            }
            incoming = read.next() => {
                let Some(frame) = incoming else { return Err("Voice gateway closed".into()); };
                let frame = frame.map_err(|_| "Voice gateway closed".to_string())?;
                match frame {
                    Message::Close(_) => return Err("Voice gateway closed".into()),
                    Message::Ping(payload) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Message::Text(text) => {
                        if let Some(err) = handle_gateway_text(&text, hello, &ssrc_users, &mut seq_ack, emit) {
                            return Err(err);
                        }
                    }
                    _ => {}
                }
            }
            spoken = recv_speaking(speaking_rx.as_mut()) => {
                match spoken {
                    Some(talking) => {
                        let _ = write.send(Message::Text(speaking_payload(ssrc, talking, false))).await;
                        emit(VoiceLinkEvent::Speaking { user_id: hello.user_id.clone(), speaking: talking, epoch: hello.epoch });
                    }
                    None => speaking_rx = None,
                }
            }
            packet_out = recv_outbound(outbound_rx.as_mut()) => {
                match packet_out {
                    Some(bytes) => {
                        if udp_keepalive.send(&bytes).await.is_err() {
                            return Err("UDP send failed".into());
                        }
                    }
                    None => {
                        outbound_rx = None;
                        inbound_tx = None;
                    }
                }
            }
            received = udp_recv.recv(&mut packet) => {
                if let Ok(size) = received {
                    if size > 12 {
                        if let Some(inbound) = inbound_tx.as_ref() {
                            let _ = inbound.try_send(packet[..size].to_vec());
                        }
                    }
                }
            }
        }
    }
}

fn empty_speaking() -> tokio::sync::mpsc::UnboundedReceiver<bool> {
    let (_, rx) = tokio::sync::mpsc::unbounded_channel();
    rx
}

fn empty_unbounded() -> tokio::sync::mpsc::UnboundedReceiver<Vec<u8>> {
    let (_, rx) = tokio::sync::mpsc::unbounded_channel();
    rx
}

async fn recv_speaking(rx: Option<&mut tokio::sync::mpsc::UnboundedReceiver<bool>>) -> Option<bool> {
    match rx {
        Some(rx) => rx.recv().await,
        None => std::future::pending().await,
    }
}

async fn recv_outbound(rx: Option<&mut tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>>) -> Option<Vec<u8>> {
    match rx {
        Some(rx) => rx.recv().await,
        None => std::future::pending().await,
    }
}

fn handle_gateway_text<F>(
    text: &str,
    hello: &VoiceHello,
    ssrc_users: &Mutex<HashMap<u32, String>>,
    seq_ack: &mut Option<i64>,
    emit: &mut F,
) -> Option<String>
where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let Ok(value) = serde_json::from_str::<Value>(text) else { return None };
    if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
        *seq_ack = Some(seq);
    }
    let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
    if op == 5 {
        if let Some(data) = value.get("d") {
            let user_id = data.get("user_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let flags = data.get("speaking").and_then(|v| v.as_u64()).unwrap_or(0);
            if let Some(remote_ssrc) = data.get("ssrc").and_then(|v| v.as_u64()) {
                if !user_id.is_empty() {
                    if let Ok(mut map) = ssrc_users.lock() {
                        map.insert(remote_ssrc as u32, user_id.clone());
                    }
                }
            }
            if !user_id.is_empty() {
                emit(VoiceLinkEvent::Speaking {
                    user_id,
                    speaking: flags & 1 == 1,
                    epoch: hello.epoch,
                });
            }
        }
    } else if op == 9 || op == 13 {
        return Some("Voice session replaced".into());
    }
    None
}

async fn send_silence(
    udp: &UdpSocket,
    mode: CipherMode,
    key: &[u8; 32],
    ssrc: u32,
    seq: &mut u16,
    timestamp: &mut u32,
    nonce: &mut u32,
) -> Result<(), ()> {
    let header = rtp_header(*seq, *timestamp, ssrc);
    let packet = encrypt_voice(mode, key, &header, OPUS_SILENCE, *nonce)?;
    udp.send(&packet).await.map_err(|_| ())?;
    *seq = seq.wrapping_add(1);
    *timestamp = timestamp.wrapping_add(960);
    *nonce = nonce.wrapping_add(1);
    Ok(())
}

async fn read_ready<R>(read: &mut R, cancel: &mut watch::Receiver<bool>) -> Result<(Value, Option<u64>), String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut hello_interval = None;
    loop {
        if watched(cancel) {
            return Err("Cancelled".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("Voice handshake timed out".into());
        }
        let frame = timeout(remaining, read.next()).await.map_err(|_| "Voice handshake timed out".to_string())?;
        let Some(frame) = frame else { return Err("Voice gateway closed".into()); };
        let frame = frame.map_err(|_| "Voice gateway closed".to_string())?;
        let Message::Text(text) = frame else { continue };
        let value: Value = serde_json::from_str(&text).map_err(|_| "Bad voice payload".to_string())?;
        let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
        if op == 8 {
            hello_interval = value.pointer("/d/heartbeat_interval").and_then(|v| v.as_u64()).filter(|v| *v > 0);
        } else if op == 2 {
            let data = value.get("d").cloned().ok_or_else(|| "Voice payload missing data".to_string())?;
            return Ok((data, hello_interval));
        }
    }
}

async fn next_op<R>(read: &mut R, cancel: &mut watch::Receiver<bool>, want: i64, limit: Duration) -> Result<Value, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let deadline = Instant::now() + limit;
    loop {
        if watched(cancel) {
            return Err("Cancelled".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("Voice handshake timed out".into());
        }
        let frame = timeout(remaining, read.next()).await.map_err(|_| "Voice handshake timed out".to_string())?;
        let Some(frame) = frame else { return Err("Voice gateway closed".into()); };
        let frame = frame.map_err(|_| "Voice gateway closed".to_string())?;
        let Message::Text(text) = frame else { continue };
        let value: Value = serde_json::from_str(&text).map_err(|_| "Bad voice payload".to_string())?;
        let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
        if op == want {
            return value.get("d").cloned().ok_or_else(|| "Voice payload missing data".to_string());
        }
    }
}

fn secret_key(description: &Value) -> Option<[u8; 32]> {
    let list = description.get("secret_key")?.as_array()?;
    if list.len() < 32 {
        return None;
    }
    let mut key = [0u8; 32];
    for (index, byte) in key.iter_mut().enumerate() {
        *byte = list[index].as_u64()? as u8;
    }
    Some(key)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
