//! Voice gateway v8 and the UDP media socket.
//!
//! Speech samples are not encoded here: linking libopus would add a native
//! codec and a capture thread. The socket still completes Discord's handshake,
//! encrypts an Opus silence keepalive when the map would otherwise go idle, and
//! sets the speaking flag from push-to-talk or voice activity. Reconnects use
//! the same capped delay as the main gateway.

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

pub struct VoiceHello {
    pub endpoint: String,
    pub server_id: String,
    pub user_id: String,
    pub session_id: String,
    pub token: String,
}

#[derive(Debug, Clone)]
pub enum VoiceLinkEvent {
    Status { state: String, detail: String },
    Speaking { user_id: String, speaking: bool },
}

fn watched(rx: &watch::Receiver<bool>) -> bool {
    *rx.borrow()
}

pub async fn maintain_voice<F>(
    hello: VoiceHello,
    mut cancel: watch::Receiver<bool>,
    mut speaking: watch::Receiver<bool>,
    mut emit: F,
) where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let mut attempt = 0u32;
    loop {
        if watched(&cancel) {
            emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new() });
            return;
        }
        let state = if attempt == 0 { "connecting" } else { "reconnecting" };
        emit(VoiceLinkEvent::Status { state: state.into(), detail: String::new() });
        match voice_once(&hello, &mut cancel, &mut speaking, &mut emit).await {
            Ok(()) => {
                emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new() });
                return;
            }
            Err(err) => {
                let delay = voice_reconnect_delay_ms(attempt);
                attempt = attempt.saturating_add(1);
                emit(VoiceLinkEvent::Status { state: "reconnecting".into(), detail: err });
                tokio::select! {
                    changed = cancel.changed() => {
                        if changed.is_err() || watched(&cancel) {
                            emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new() });
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
    emit: &mut F,
) -> Result<(), String>
where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let url = voice_gateway_url(&hello.endpoint).ok_or_else(|| "Bad voice endpoint".to_string())?;
    let (socket, _) = connect_async(url).await.map_err(|_| "Voice gateway refused the connection".to_string())?;
    let (mut write, mut read) = socket.split();
    let identify = voice_identify(&hello.server_id, &hello.user_id, &hello.session_id, &hello.token);
    write
        .send(Message::Text(identify))
        .await
        .map_err(|_| "Voice identify failed".to_string())?;

    let ready = next_op(&mut read, cancel, 2, Duration::from_secs(8)).await?;
    let ssrc = ready.get("ssrc").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let ip = ready.get("ip").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let port = ready.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
    let interval = ready
        .get("heartbeat_interval")
        .and_then(|v| v.as_u64())
        .unwrap_or(15_000)
        .max(3_000);
    if ip.is_empty() || port == 0 || ssrc == 0 {
        return Err("Voice ready was incomplete".into());
    }

    let udp = UdpSocket::bind("0.0.0.0:0").await.map_err(|err| err.to_string())?;
    udp.connect((ip.as_str(), port)).await.map_err(|err| err.to_string())?;
    udp.send(&ip_discovery_request(ssrc)).await.map_err(|err| err.to_string())?;
    let mut packet = [0u8; 128];
    let size = timeout(Duration::from_secs(5), udp.recv(&mut packet))
        .await
        .map_err(|_| "UDP discovery timed out".to_string())?
        .map_err(|err| err.to_string())?;
    let (address, discovered_port) = parse_ip_discovery(&packet[..size]).ok_or_else(|| "Bad discovery response".to_string())?;

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
    let mut want_speaking = watched(speaking);
    write
        .send(Message::Text(speaking_payload(ssrc, want_speaking, false)))
        .await
        .map_err(|_| "Speaking update failed".to_string())?;
    emit(VoiceLinkEvent::Status { state: "connected".into(), detail: mode.name().into() });

    let mut seq = 0u16;
    let mut timestamp = 0u32;
    let mut nonce = 0u32;
    let mut seq_ack: Option<i64> = None;
    let mut next_heartbeat = Instant::now() + Duration::from_millis(interval);
    let mut next_keepalive = Instant::now() + Duration::from_secs(5);

    loop {
        let until_heartbeat = next_heartbeat.saturating_duration_since(Instant::now());
        let until_keepalive = next_keepalive.saturating_duration_since(Instant::now());
        let wait = until_heartbeat.min(until_keepalive);
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || watched(cancel) {
                    return Ok(());
                }
            }
            changed = speaking.changed() => {
                if changed.is_ok() {
                    want_speaking = watched(speaking);
                    let _ = write.send(Message::Text(speaking_payload(ssrc, want_speaking, false))).await;
                }
            }
            _ = tokio::time::sleep(wait) => {
                let now = Instant::now();
                if now >= next_heartbeat {
                    let _ = write.send(Message::Text(voice_heartbeat(now_ms(), seq_ack))).await;
                    next_heartbeat = now + Duration::from_millis(interval);
                }
                if now >= next_keepalive {
                    if send_silence(&udp, mode, &key, ssrc, &mut seq, &mut timestamp, &mut nonce).await.is_err() {
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
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
                                seq_ack = Some(seq);
                            }
                            let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
                            if op == 5 {
                                if let Some(data) = value.get("d") {
                                    let user_id = data.get("user_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let flags = data.get("speaking").and_then(|v| v.as_u64()).unwrap_or(0);
                                    if !user_id.is_empty() {
                                        emit(VoiceLinkEvent::Speaking { user_id, speaking: flags & 1 == 1 });
                                    }
                                }
                            } else if op == 9 || op == 13 {
                                return Err("Voice session replaced".into());
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
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
    let body = encrypt_voice(mode, key, &header, OPUS_SILENCE, *nonce)?;
    let mut packet = Vec::with_capacity(header.len() + body.len());
    packet.extend_from_slice(&header);
    packet.extend_from_slice(&body);
    udp.send(&packet).await.map_err(|_| ())?;
    *seq = seq.wrapping_add(1);
    *timestamp = timestamp.wrapping_add(960);
    *nonce = nonce.wrapping_add(1);
    Ok(())
}

async fn next_op<R>(read: &mut R, cancel: &mut watch::Receiver<bool>, want: i64, limit: Duration) -> Result<Value, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let deadline = Instant::now() + limit;
    loop {
        if watched(&cancel) {
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
