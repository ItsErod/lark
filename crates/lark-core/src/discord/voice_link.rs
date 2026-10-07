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
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::voice::{
    choose_mode, dave_protocol_version, encrypt_voice, ip_discovery_request, parse_dave_server_binary,
    parse_ip_discovery, rtp_header, select_protocol, speaking_payload, voice_close_error,
    voice_error_should_stop, voice_gateway_url, voice_heartbeat, voice_heartbeat_interval_ms,
    voice_identify, voice_opcode_ends_session, voice_reconnect_delay_ms, CipherMode, OPUS_SILENCE,
};
use crate::soundboard::SoundMix;

use super::voice_dave::{DaveCall, DaveWire};
use super::voice_media::{start_media, VoiceAudio};

pub struct VoiceHello {
    pub endpoint: String,
    pub server_id: String,
    pub channel_id: String,
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
    board: Arc<Mutex<SoundMix>>,
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
        match voice_once(&hello, &mut cancel, &mut speaking, &audio, &volumes, &board, &mut emit).await {
            Ok(()) => {
                emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
                return;
            }
            Err(err) => {
                if err == "Cancelled" || watched(&cancel) {
                    emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
                    return;
                }
                if voice_error_should_stop(&err) {
                    let detail = err.trim_start_matches("fatal:").to_string();
                    emit(VoiceLinkEvent::Status { state: "reconnecting".into(), detail, epoch: hello.epoch });
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
    board: &Arc<Mutex<SoundMix>>,
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

    let mut beat = Heartbeat::new();
    let mut seq_ack: Option<i64> = None;
    let mut inbox = HandshakeInbox::default();
    let ready = read_ready(&mut read, &mut write, cancel, &mut beat, &mut seq_ack, &mut inbox).await?;
    let ssrc = ready.get("ssrc").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let ip = ready.get("ip").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let port = ready.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
    if ip.is_empty() || port == 0 || ssrc == 0 {
        return Err("Voice ready was incomplete".into());
    }

    let udp = UdpSocket::bind("0.0.0.0:0").await.map_err(|err| err.to_string())?;
    udp.connect((ip.as_str(), port)).await.map_err(|err| err.to_string())?;
    udp.send(&ip_discovery_request(ssrc)).await.map_err(|err| err.to_string())?;
    let (address, discovered_port) = discover_ip(&udp, &mut read, &mut write, cancel, &mut beat, &mut seq_ack, &mut inbox).await?;

    let offered: Vec<String> = ready
        .get("modes")
        .and_then(|v| v.as_array())
        .map(|modes| modes.iter().filter_map(|m| m.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let mode = choose_mode(&offered).ok_or_else(|| "fatal:No supported voice encryption".to_string())?;
    write
        .send(Message::Text(select_protocol(&address, discovered_port, mode)))
        .await
        .map_err(|_| "Select protocol failed".to_string())?;

    let description = next_op(&mut read, &mut write, cancel, &mut beat, &mut seq_ack, &mut inbox, 4, Duration::from_secs(8)).await?;
    let chosen = description.get("mode").and_then(|v| v.as_str()).unwrap_or(mode.name());
    let mode = choose_mode(&[chosen.to_string()]).ok_or_else(|| "fatal:No supported voice encryption".to_string())?;
    let key = secret_key(&description).ok_or_else(|| "Voice key missing".to_string())?;
    let mut dave = start_dave(hello, dave_protocol_version(&description))?;
    if let Some(dave) = dave.as_mut() {
        replay_inbox(dave, &mut inbox, &mut seq_ack)?;
        flush_dave(&mut write, dave).await?;
    }
    let _ = write.send(Message::Text(speaking_payload(ssrc, false, false))).await;

    let ssrc_users = Arc::new(Mutex::new(HashMap::new()));
    let pipe = start_media(mode, key, ssrc, audio.clone(), speaking.clone(), volumes.clone(), ssrc_users.clone(), board.clone()).ok();
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

    if beat.every.is_none() {
        beat.note_hello(0);
    }
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
        let until_keepalive = if inbound_tx.is_some() { Duration::from_secs(60) } else { next_keepalive.saturating_duration_since(Instant::now()) };
        let wait = beat.until().min(until_keepalive);
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
                if beat.due() {
                    let _ = write.send(Message::Text(voice_heartbeat(now_ms(), seq_ack))).await;
                    beat.sent();
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
                    Message::Close(frame) => return Err(close_error(frame)),
                    Message::Ping(payload) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Message::Text(text) => {
                        handle_gateway_text(&text, hello, &ssrc_users, &mut seq_ack, dave.as_mut(), emit)?;
                        if let Some(dave) = dave.as_mut() {
                            flush_dave(&mut write, dave).await?;
                        }
                    }
                    Message::Binary(bytes) => {
                        if let Some((seq, _, _)) = parse_dave_server_binary(&bytes) {
                            seq_ack = Some(i64::from(seq));
                        }
                        if let Some(dave) = dave.as_mut() {
                            dave.ingest_binary(&bytes);
                            flush_dave(&mut write, dave).await?;
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
    dave: Option<&mut DaveCall>,
    emit: &mut F,
) -> Result<(), String>
where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let Ok(value) = serde_json::from_str::<Value>(text) else { return Ok(()) };
    if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
        *seq_ack = Some(seq);
    }
    let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
    if voice_opcode_ends_session(op) {
        return Err("Voice session replaced".into());
    }
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
    } else if op == 13 {
        if let Some(id) = value.pointer("/d/user_id").and_then(json_snowflake) {
            if let Some(dave) = dave {
                dave.forget_user(id);
            }
            emit(VoiceLinkEvent::Speaking {
                user_id: id.to_string(),
                speaking: false,
                epoch: hello.epoch,
            });
        }
    } else if let Some(dave) = dave {
        apply_dave_json(dave, &value)?;
    }
    Ok(())
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

struct Heartbeat {
    every: Option<Duration>,
    next: Option<Instant>,
}

impl Heartbeat {
    fn new() -> Self {
        Self { every: None, next: None }
    }

    fn note_hello(&mut self, raw: u64) {
        if self.every.is_some() {
            return;
        }
        let every = Duration::from_millis(voice_heartbeat_interval_ms(raw));
        self.every = Some(every);
        self.next = Some(Instant::now() + every / 2);
    }

    fn until(&self) -> Duration {
        self.next
            .map(|at| at.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_secs(60))
    }

    fn due(&self) -> bool {
        self.next.is_some_and(|at| Instant::now() >= at)
    }

    fn sent(&mut self) {
        if let Some(every) = self.every {
            self.next = Some(Instant::now() + every);
        }
    }
}

#[derive(Default)]
struct HandshakeInbox {
    binary: Vec<Vec<u8>>,
    text: Vec<Value>,
}

impl HandshakeInbox {
    fn note_text(&mut self, value: Value) {
        let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
        if matches!(op, 11 | 12 | 13 | 21 | 22 | 24) {
            self.text.push(value);
        }
    }
}

async fn read_ready<R, W>(
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heartbeat,
    seq_ack: &mut Option<i64>,
    inbox: &mut HandshakeInbox,
) -> Result<Value, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        let frame = next_message(read, write, cancel, beat, seq_ack, deadline).await?;
        match frame {
            Message::Text(text) => {
                let value: Value = serde_json::from_str(&text).map_err(|_| "Bad voice payload".to_string())?;
                let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
                if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
                    *seq_ack = Some(seq);
                }
                if op == 8 {
                    let raw = value.pointer("/d/heartbeat_interval").and_then(|v| v.as_u64()).unwrap_or(0);
                    beat.note_hello(raw);
                } else if op == 2 {
                    return value.get("d").cloned().ok_or_else(|| "Voice payload missing data".to_string());
                } else {
                    inbox.note_text(value);
                }
            }
            Message::Binary(bytes) => {
                if let Some((seq, _, _)) = parse_dave_server_binary(&bytes) {
                    *seq_ack = Some(i64::from(seq));
                }
                inbox.binary.push(bytes);
            }
            Message::Ping(payload) => {
                write.send(Message::Pong(payload)).await.map_err(|_| "Voice gateway closed".to_string())?;
            }
            Message::Close(frame) => return Err(close_error(frame)),
            _ => {}
        }
    }
}

async fn next_op<R, W>(
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heartbeat,
    seq_ack: &mut Option<i64>,
    inbox: &mut HandshakeInbox,
    want: i64,
    limit: Duration,
) -> Result<Value, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let deadline = Instant::now() + limit;
    loop {
        let frame = next_message(read, write, cancel, beat, seq_ack, deadline).await?;
        match frame {
            Message::Text(text) => {
                let value: Value = serde_json::from_str(&text).map_err(|_| "Bad voice payload".to_string())?;
                let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
                if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
                    *seq_ack = Some(seq);
                }
                if op == 8 {
                    let raw = value.pointer("/d/heartbeat_interval").and_then(|v| v.as_u64()).unwrap_or(0);
                    beat.note_hello(raw);
                } else if op == want {
                    return value.get("d").cloned().ok_or_else(|| "Voice payload missing data".to_string());
                } else {
                    inbox.note_text(value);
                }
            }
            Message::Binary(bytes) => {
                if let Some((seq, _, _)) = parse_dave_server_binary(&bytes) {
                    *seq_ack = Some(i64::from(seq));
                }
                inbox.binary.push(bytes);
            }
            Message::Ping(payload) => {
                write.send(Message::Pong(payload)).await.map_err(|_| "Voice gateway closed".to_string())?;
            }
            Message::Close(frame) => return Err(close_error(frame)),
            _ => {}
        }
    }
}

async fn next_message<R, W>(
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heartbeat,
    seq_ack: &mut Option<i64>,
    deadline: Instant,
) -> Result<Message, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    loop {
        if watched(cancel) {
            return Err("Cancelled".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("Voice handshake timed out".into());
        }
        let wait = beat.until().min(remaining);
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || watched(cancel) {
                    return Err("Cancelled".into());
                }
            }
            _ = tokio::time::sleep(wait) => {
                if beat.due() {
                    write
                        .send(Message::Text(voice_heartbeat(now_ms(), *seq_ack)))
                        .await
                        .map_err(|_| "Voice heartbeat failed".to_string())?;
                    beat.sent();
                }
            }
            frame = read.next() => {
                let Some(frame) = frame else { return Err("Voice gateway closed".into()); };
                return frame.map_err(|_| "Voice gateway closed".to_string());
            }
        }
    }
}

async fn discover_ip<R, W>(
    udp: &UdpSocket,
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heartbeat,
    seq_ack: &mut Option<i64>,
    inbox: &mut HandshakeInbox,
) -> Result<(String, u16), String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut buf = [0u8; 128];
    loop {
        if watched(cancel) {
            return Err("Cancelled".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("UDP discovery timed out".into());
        }
        let wait = beat.until().min(remaining);
        tokio::select! {
            _ = tokio::time::sleep(wait) => {
                if beat.due() {
                    write
                        .send(Message::Text(voice_heartbeat(now_ms(), *seq_ack)))
                        .await
                        .map_err(|_| "Voice heartbeat failed".to_string())?;
                    beat.sent();
                }
            }
            frame = read.next() => {
                let Some(frame) = frame else { return Err("Voice gateway closed".into()); };
                let frame = frame.map_err(|_| "Voice gateway closed".to_string())?;
                match frame {
                    Message::Close(frame) => return Err(close_error(frame)),
                    Message::Ping(payload) => {
                        write.send(Message::Pong(payload)).await.map_err(|_| "Voice gateway closed".to_string())?;
                    }
                    Message::Text(text) => {
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
                                *seq_ack = Some(seq);
                            }
                            let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
                            if op == 8 {
                                let raw = value.pointer("/d/heartbeat_interval").and_then(|v| v.as_u64()).unwrap_or(0);
                                beat.note_hello(raw);
                            } else {
                                inbox.note_text(value);
                            }
                        }
                    }
                    Message::Binary(bytes) => {
                        if let Some((seq, _, _)) = parse_dave_server_binary(&bytes) {
                            *seq_ack = Some(i64::from(seq));
                        }
                        inbox.binary.push(bytes);
                    }
                    _ => {}
                }
            }
            received = udp.recv(&mut buf) => {
                let size = received.map_err(|err| err.to_string())?;
                return parse_ip_discovery(&buf[..size]).ok_or_else(|| "Bad discovery response".to_string());
            }
        }
    }
}

fn start_dave(hello: &VoiceHello, version: u16) -> Result<Option<DaveCall>, String> {
    if version == 0 {
        return Ok(None);
    }
    let user_id = snowflake(&hello.user_id).ok_or_else(|| "fatal:Voice user id was not a snowflake".to_string())?;
    let channel = if hello.channel_id.is_empty() { hello.server_id.as_str() } else { hello.channel_id.as_str() };
    let channel_id = snowflake(channel).ok_or_else(|| "fatal:Voice channel id was not a snowflake".to_string())?;
    Ok(Some(DaveCall::start(user_id, channel_id, version)?))
}

fn replay_inbox(dave: &mut DaveCall, inbox: &mut HandshakeInbox, seq_ack: &mut Option<i64>) -> Result<(), String> {
    for value in inbox.text.drain(..) {
        apply_dave_json(dave, &value)?;
    }
    for bytes in inbox.binary.drain(..) {
        if let Some((seq, _, _)) = parse_dave_server_binary(&bytes) {
            *seq_ack = Some(i64::from(seq));
        }
        dave.ingest_binary(&bytes);
    }
    Ok(())
}

fn apply_dave_json(dave: &mut DaveCall, value: &Value) -> Result<(), String> {
    let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
    let data = value.get("d");
    match op {
        11 => {
            let ids = data.and_then(|item| item.get("user_ids")).and_then(|item| item.as_array()).map(|list| {
                list.iter().filter_map(json_snowflake).collect::<Vec<_>>()
            });
            if let Some(ids) = ids {
                dave.note_users(ids);
            }
        }
        12 => {
            if let Some(id) = data.and_then(|item| item.get("user_id")).and_then(json_snowflake) {
                dave.note_users([id]);
            }
        }
        13 => {
            if let Some(id) = data.and_then(|item| item.get("user_id")).and_then(json_snowflake) {
                dave.forget_user(id);
            }
        }
        21 => {
            let version = data.and_then(|item| item.get("protocol_version")).and_then(|v| v.as_u64()).unwrap_or(0) as u16;
            let transition = data.and_then(|item| item.get("transition_id")).and_then(|v| v.as_u64()).unwrap_or(0) as u16;
            dave.prepare_transition(version, transition);
        }
        22 => {
            let transition = data.and_then(|item| item.get("transition_id")).and_then(|v| v.as_u64()).unwrap_or(0) as u16;
            dave.execute_transition(transition);
        }
        24 => {
            let version = data.and_then(|item| item.get("protocol_version")).and_then(|v| v.as_u64()).unwrap_or(1) as u16;
            let epoch = data.and_then(|item| item.get("epoch")).and_then(|v| v.as_u64()).unwrap_or(0);
            dave.prepare_epoch(version, epoch)?;
        }
        _ => {}
    }
    Ok(())
}

async fn flush_dave<W>(write: &mut W, dave: &mut DaveCall) -> Result<(), String>
where
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    for message in dave.take_outbound() {
        let frame = match message {
            DaveWire::Text(text) => Message::Text(text),
            DaveWire::Binary(bytes) => Message::Binary(bytes),
        };
        write.send(frame).await.map_err(|_| "DAVE write failed".to_string())?;
    }
    Ok(())
}

fn close_error(frame: Option<tokio_tungstenite::tungstenite::protocol::CloseFrame>) -> String {
    let code = frame.as_ref().map(|item| u16::from(item.code)).unwrap_or(1005);
    let reason = frame.map(|item| item.reason.to_string()).unwrap_or_default();
    voice_close_error(code, &reason)
}

fn snowflake(value: &str) -> Option<u64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    value.parse().ok()
}

fn json_snowflake(value: &Value) -> Option<u64> {
    value.as_u64().or_else(|| value.as_str().and_then(snowflake))
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
