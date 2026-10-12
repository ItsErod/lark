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
    choose_mode, dave_protocol_version, ip_discovery_request, parse_dave_server_binary, parse_ip_discovery,
    select_protocol, speaking_payload, voice_close_error, voice_error_should_stop, voice_gateway_url,
    voice_heartbeat, voice_heartbeat_interval_ms, voice_identify, voice_opcode_ends_session, voice_poll_slice,
    voice_reconnect_delay_ms,
};
use crate::soundboard::SoundMix;

use super::voice_camera::{CameraInbox, CameraSender};
use super::voice_dave::{DaveCall, DaveWire};
use super::voice_log::{log_step, VoiceLog};
use super::voice_media::{start_media, VoiceAudio, VoiceWire};

pub struct VoiceHello {
    pub endpoint: String,
    pub server_id: String,
    pub channel_id: String,
    pub user_id: String,
    pub session_id: String,
    pub token: String,
    pub epoch: u64,
    pub camera: Arc<CameraInbox>,
}

#[derive(Debug, Clone)]
pub enum VoiceLinkEvent {
    Status { state: String, detail: String, epoch: u64 },
    Speaking { user_id: String, speaking: bool, epoch: u64 },
    Ping { ping_ms: u64, endpoint: String, epoch: u64 },
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
    log: Arc<Mutex<VoiceLog>>,
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
        log_step(&log, format!("voice {state}"));
        emit(VoiceLinkEvent::Status { state: state.into(), detail: String::new(), epoch: hello.epoch });
        match voice_once(&hello, &mut cancel, &mut speaking, &audio, &volumes, &board, &log, &mut emit).await {
            Ok(()) => {
                emit(VoiceLinkEvent::Status { state: "left".into(), detail: String::new(), epoch: hello.epoch });
                return;
            }
            Err(err) => {
                if err != "Cancelled" {
                    note_failure(&log, &err);
                }
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
    log: &Arc<Mutex<VoiceLog>>,
    emit: &mut F,
) -> Result<(), String>
where
    F: FnMut(VoiceLinkEvent) + Send,
{
    let url = voice_gateway_url(&hello.endpoint).ok_or_else(|| "Bad voice endpoint".to_string())?;
    log_step(log, "voice websocket connecting");
    let (socket, _) = connect_async(url).await.map_err(|_| "Voice gateway refused the connection".to_string())?;
    log_step(log, "voice websocket open");
    drive_voice(hello, socket, cancel, speaking, audio, volumes, board, log, emit).await
}

async fn drive_voice<S, F>(
    hello: &VoiceHello,
    socket: S,
    cancel: &mut watch::Receiver<bool>,
    speaking: &mut watch::Receiver<bool>,
    audio: &watch::Receiver<VoiceAudio>,
    volumes: &Arc<Mutex<HashMap<String, f32>>>,
    board: &Arc<Mutex<SoundMix>>,
    log: &Arc<Mutex<VoiceLog>>,
    emit: &mut F,
) -> Result<(), String>
where
    S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
        + futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error>
        + Unpin,
    F: FnMut(VoiceLinkEvent) + Send,
{
    let (mut write, mut read) = socket.split();
    let identify = voice_identify(&hello.server_id, &hello.user_id, &hello.session_id, &hello.token);
    write.send(Message::Text(identify)).await.map_err(|_| "Voice identify failed".to_string())?;
    log_step(log, "identify sent");

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
    log_step(log, format!("ready ssrc {ssrc}"));
    if let Some(every) = beat.every {
        let ms = every.as_millis() as u64;
        if let Ok(mut guard) = log.lock() {
            guard.heartbeat_ms = ms;
            guard.push(format!("hello heartbeat {ms}ms"));
        }
    }

    let udp = UdpSocket::bind("0.0.0.0:0").await.map_err(|err| err.to_string())?;
    udp.connect((ip.as_str(), port)).await.map_err(|err| err.to_string())?;
    udp.send(&ip_discovery_request(ssrc)).await.map_err(|err| err.to_string())?;
    log_step(log, "udp discovery sent");
    let (address, discovered_port) = discover_ip(&udp, ssrc, &mut read, &mut write, cancel, &mut beat, &mut seq_ack, &mut inbox, log).await?;
    log_step(log, format!("udp discovery {address}:{discovered_port}"));

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
    log_step(log, format!("select protocol {}", mode.name()));

    let description = next_op(&mut read, &mut write, cancel, &mut beat, &mut seq_ack, &mut inbox, 4, Duration::from_secs(8)).await?;
    let chosen = description.get("mode").and_then(|v| v.as_str()).unwrap_or(mode.name());
    let mode = choose_mode(&[chosen.to_string()]).ok_or_else(|| "fatal:No supported voice encryption".to_string())?;
    let key = secret_key(&description).ok_or_else(|| "Voice key missing".to_string())?;
    let dave_version = dave_protocol_version(&description);
    if let Ok(mut guard) = log.lock() {
        guard.mode = mode.name().to_string();
        guard.dave_version = dave_version;
        guard.push(format!("session description dave v{dave_version}"));
    }
    let dave = start_dave(hello, dave_version, log)?;
    if let Some(dave) = dave.as_ref() {
        replay_inbox(dave, &mut inbox, &mut seq_ack)?;
        publish_dave(&mut write, dave, log).await?;
    }
    let _ = write.send(Message::Text(speaking_payload(ssrc, false, false))).await;
    log_step(log, "speaking 0");

    let ssrc_users = Arc::new(Mutex::new(HashMap::new()));
    let pipe = match start_media(
        mode,
        key,
        ssrc,
        audio.clone(),
        speaking.clone(),
        volumes.clone(),
        ssrc_users.clone(),
        board.clone(),
        dave.clone(),
        log.clone(),
    ) {
        Ok(pipe) => Some(pipe),
        Err(err) => {
            log_step(log, format!("audio thread failed: {err}"));
            None
        }
    };
    let detail = if pipe.is_some() { mode.name().to_string() } else { "Voice audio did not start".into() };
    let (mut wire_rx, mut inbound_tx, _media) = match pipe {
        Some(mut pipe) => {
            let outbound = std::mem::replace(&mut pipe.outbound, empty_wire());
            let inbound = pipe.inbound.clone();
            (Some(outbound), Some(inbound), Some(pipe))
        }
        None => (None, None, None),
    };
    log_step(log, "connected");
    emit(VoiceLinkEvent::Status { state: "connected".into(), detail, epoch: hello.epoch });

    if beat.every.is_none() {
        beat.note_hello(0);
    }
    let udp = Arc::new(udp);
    let mut packet = [0u8; 4096];
    let mut camera_tx = CameraSender::default();

    loop {
        if watched(cancel) {
            return Ok(());
        }
        if let Some(payload) = camera_tx.note_active(hello.camera.active(), ssrc) {
            let _ = write.send(Message::Text(payload)).await;
        }
        for sealed in camera_tx.take_packets(mode, &key, ssrc, &hello.camera) {
            if udp.send(&sealed).await.is_err() {
                return Err("UDP send failed".into());
            }
        }
        let wait = beat.until();
        let udp_send = udp.clone();
        let udp_recv = udp.clone();
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || watched(cancel) {
                    return Ok(());
                }
            }
            _ = tokio::time::sleep(wait) => {
                if beat.due() {
                    let _ = write.send(Message::Text(voice_heartbeat(now_ms(), seq_ack))).await;
                    beat.sent();
                }
            }
            _ = hello.camera.notified() => {}
            incoming = read.next() => {
                let Some(frame) = incoming else { return Err("Voice gateway closed".into()); };
                let frame = frame.map_err(|_| "Voice gateway closed".to_string())?;
                match frame {
                    Message::Close(frame) => return Err(close_error(frame)),
                    Message::Ping(payload) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Message::Text(text) => {
                        if let Some(ms) = voice_ping_ms(&text, &mut beat) {
                            emit(VoiceLinkEvent::Ping { ping_ms: ms, endpoint: hello.endpoint.clone(), epoch: hello.epoch });
                        }
                        handle_gateway_text(&text, hello, &ssrc_users, &mut seq_ack, dave.as_ref(), emit)?;
                        if let Some(dave) = dave.as_ref() {
                            publish_dave(&mut write, dave, log).await?;
                        }
                    }
                    Message::Binary(bytes) => {
                        if let Some((seq, opcode, _)) = parse_dave_server_binary(&bytes) {
                            seq_ack = Some(i64::from(seq));
                            log_step(log, format!("dave opcode {opcode}"));
                        }
                        if let Some(dave) = dave.as_ref() {
                            if let Ok(mut call) = dave.lock() {
                                call.ingest_binary(&bytes);
                            }
                            publish_dave(&mut write, dave, log).await?;
                        }
                    }
                    _ => {}
                }
            }
            wire = recv_wire(wire_rx.as_mut()) => {
                match wire {
                    Some(VoiceWire::Speaking(talking)) => {
                        write
                            .send(Message::Text(speaking_payload(ssrc, talking, false)))
                            .await
                            .map_err(|_| "Speaking update failed".to_string())?;
                        log_step(log, if talking { "speaking 1" } else { "speaking 0" });
                        emit(VoiceLinkEvent::Speaking { user_id: hello.user_id.clone(), speaking: talking, epoch: hello.epoch });
                    }
                    Some(VoiceWire::Packet(bytes)) => {
                        if udp_send.send(&bytes).await.is_err() {
                            return Err("UDP send failed".into());
                        }
                        if let Ok(mut guard) = log.lock() {
                            guard.udp_out = guard.udp_out.saturating_add(1);
                        }
                    }
                    None => {
                        wire_rx = None;
                        inbound_tx = None;
                    }
                }
            }
            received = udp_recv.recv(&mut packet) => {
                if let Ok(size) = received {
                    if let Ok(mut guard) = log.lock() {
                        guard.udp_in = guard.udp_in.saturating_add(1);
                    }
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

fn empty_wire() -> tokio::sync::mpsc::UnboundedReceiver<VoiceWire> {
    let (_, rx) = tokio::sync::mpsc::unbounded_channel();
    rx
}

async fn recv_wire(rx: Option<&mut tokio::sync::mpsc::UnboundedReceiver<VoiceWire>>) -> Option<VoiceWire> {
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
    dave: Option<&Arc<Mutex<DaveCall>>>,
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
                if let Ok(mut call) = dave.lock() {
                    call.forget_user(id);
                }
            }
            emit(VoiceLinkEvent::Speaking {
                user_id: id.to_string(),
                speaking: false,
                epoch: hello.epoch,
            });
        }
    } else if let Some(dave) = dave {
        if let Ok(mut call) = dave.lock() {
            apply_dave_json(&mut call, &value)?;
        }
    }
    Ok(())
}

struct Heartbeat {
    every: Option<Duration>,
    next: Option<Instant>,
    sent_at: Option<Instant>,
}

impl Heartbeat {
    fn new() -> Self {
        Self { every: None, next: None, sent_at: None }
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
        let wait = self
            .next
            .map(|at| at.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_secs(60));
        voice_poll_slice(wait)
    }

    fn due(&self) -> bool {
        self.next.is_some_and(|at| Instant::now() >= at)
    }

    fn sent(&mut self) {
        self.sent_at = Some(Instant::now());
        if let Some(every) = self.every {
            self.next = Some(Instant::now() + every);
        }
    }
}

fn voice_ping_ms(text: &str, beat: &mut Heartbeat) -> Option<u64> {
    let value: Value = serde_json::from_str(text).ok()?;
    if value.get("op").and_then(|item| item.as_i64()) != Some(6) {
        return None;
    }
    let sent = beat.sent_at.take()?;
    Some(sent.elapsed().as_millis() as u64)
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
    ssrc: u32,
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heartbeat,
    seq_ack: &mut Option<i64>,
    inbox: &mut HandshakeInbox,
    log: &Arc<Mutex<VoiceLog>>,
) -> Result<(String, u16), String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut next_probe = Instant::now() + Duration::from_millis(250);
    let mut buf = [0u8; 128];
    loop {
        if watched(cancel) {
            return Err("Cancelled".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("UDP discovery timed out".into());
        }
        let probe_in = next_probe.saturating_duration_since(Instant::now());
        let wait = beat.until().min(remaining).min(probe_in);
        tokio::select! {
            _ = tokio::time::sleep(wait) => {
                if beat.due() {
                    write
                        .send(Message::Text(voice_heartbeat(now_ms(), *seq_ack)))
                        .await
                        .map_err(|_| "Voice heartbeat failed".to_string())?;
                    beat.sent();
                }
                if Instant::now() >= next_probe {
                    udp.send(&ip_discovery_request(ssrc)).await.map_err(|err| err.to_string())?;
                    log_step(log, "udp discovery resent");
                    next_probe = Instant::now() + Duration::from_millis(250);
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

fn start_dave(hello: &VoiceHello, version: u16, log: &Arc<Mutex<VoiceLog>>) -> Result<Option<Arc<Mutex<DaveCall>>>, String> {
    if version == 0 {
        log_step(log, "dave skipped; protocol 0");
        return Ok(None);
    }
    let user_id = snowflake(&hello.user_id).ok_or_else(|| "fatal:Voice user id was not a snowflake".to_string())?;
    let channel = if hello.channel_id.is_empty() { hello.server_id.as_str() } else { hello.channel_id.as_str() };
    let channel_id = snowflake(channel).ok_or_else(|| "fatal:Voice channel id was not a snowflake".to_string())?;
    let mut call = DaveCall::start(user_id, channel_id, version)?;
    for step in call.drain_trace() {
        log_step(log, step);
    }
    Ok(Some(Arc::new(Mutex::new(call))))
}

fn replay_inbox(dave: &Arc<Mutex<DaveCall>>, inbox: &mut HandshakeInbox, seq_ack: &mut Option<i64>) -> Result<(), String> {
    let Ok(mut dave) = dave.lock() else { return Err("DAVE lock failed".into()) };
    for value in inbox.text.drain(..) {
        apply_dave_json(&mut dave, &value)?;
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

async fn publish_dave<W>(write: &mut W, dave: &Arc<Mutex<DaveCall>>, log: &Arc<Mutex<VoiceLog>>) -> Result<(), String>
where
    W: futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let (wires, traces) = {
        let Ok(mut call) = dave.lock() else { return Ok(()) };
        (call.take_outbound(), call.drain_trace())
    };
    for step in traces {
        log_step(log, step);
    }
    for message in wires {
        let frame = match message {
            DaveWire::Text(text) => Message::Text(text),
            DaveWire::Binary(bytes) => Message::Binary(bytes),
        };
        write.send(frame).await.map_err(|_| "DAVE write failed".to_string())?;
    }
    Ok(())
}

fn note_failure(log: &Arc<Mutex<VoiceLog>>, err: &str) {
    let text = err.trim_start_matches("fatal:");
    if let Ok(mut guard) = log.lock() {
        if let Some(code) = close_code_in(text) {
            guard.close_code = Some(code);
            if let Some((_, reason)) = text.split_once("): ") {
                guard.close_reason = reason.to_string();
            }
        }
        guard.push(text.to_string());
    }
}

fn close_code_in(text: &str) -> Option<u16> {
    let marker = "closed (";
    let start = text.find(marker)? + marker.len();
    let end = start + text[start..].find(')')?;
    text[start..end].parse().ok()
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

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    use futures_util::{SinkExt, StreamExt};
    use openmls::prelude::{
        tls_codec::{Deserialize, DeserializeBytes, Serialize},
        BasicCredential, Ciphersuite, ExternalProposal, ExternalSender, GroupEpoch, GroupId, KeyPackageIn,
        MlsMessageIn, OpenMlsProvider, ProtocolVersion, SenderExtensionIndex, VLBytes,
    };
    use openmls_basic_credential::SignatureKeyPair;
    use openmls_rust_crypto::OpenMlsRustCrypto;
    use serde_json::Value;
    use tokio::net::{TcpListener, TcpStream, UdpSocket};
    use tokio::sync::watch;
    use tokio_tungstenite::{accept_async, client_async, tungstenite::Message};

    use super::super::voice::{decrypt_voice, encrypt_voice, rtp_header, CipherMode};
    use super::super::voice_dave::{DaveCall, DaveWire};
    use super::super::voice_log::VoiceLog;
    use super::super::voice_media::VoiceAudio;
    use super::{drive_voice, VoiceHello, VoiceLinkEvent};
    use crate::soundboard::SoundMix;

    const CLIENT_ID: u64 = 111;
    const PEER_ID: u64 = 222;
    const CHANNEL_ID: u64 = 333;
    const TRANSITION: u16 = 7;
    const MIC: &[u8] = b"opus-frame-from-mic";
    const PEER_OPUS: &[u8] = b"opus-from-peer";

    #[tokio::test]
    async fn mock_voice_server_round_trips_encrypted_opus() {
        let result = tokio::time::timeout(Duration::from_secs(25), round_trip()).await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(err)) => panic!("{err}"),
            Err(_) => panic!("voice handshake timed out"),
        }
    }

    async fn round_trip() -> Result<(), String> {
        let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|err| err.to_string())?;
        let addr = listener.local_addr().map_err(|err| err.to_string())?;
        let udp = UdpSocket::bind("127.0.0.1:0").await.map_err(|err| err.to_string())?;
        let udp_port = udp.local_addr().map_err(|err| err.to_string())?.port();
        let (external, proposal, peer) = gateway_add()?;
        let log = Arc::new(std::sync::Mutex::new(VoiceLog::default()));
        let secret = secret_key();

        let server = mock_server(listener, udp, udp_port, external, proposal, peer, log.clone(), secret);
        let client = client_drive(addr, log.clone());
        let (server, client) = tokio::join!(server, client);
        if let Err(err) = &server {
            let text = log.lock().map(|guard| guard.export()).unwrap_or_default();
            return Err(format!("{err}\nclient: {client:?}\n{text}"));
        }
        let text = log.lock().map(|guard| guard.export()).unwrap_or_default();
        if text.contains("super-secret-voice-token") || text.contains("secret_key") {
            return Err(format!("diagnostics leaked a secret\n{text}"));
        }
        if !text.contains("Lark voice diagnostics") {
            return Err(text);
        }
        Ok(())
    }

    async fn client_drive(addr: SocketAddr, log: Arc<std::sync::Mutex<VoiceLog>>) -> Result<(), String> {
        let tcp = TcpStream::connect(addr).await.map_err(|err| err.to_string())?;
        let (socket, _) = client_async(format!("ws://{addr}/?v=8"), tcp).await.map_err(|err| err.to_string())?;
        let (_cancel_tx, mut cancel) = watch::channel(false);
        let (_speaking_tx, mut speaking) = watch::channel(false);
        let (_audio_tx, audio) = watch::channel(VoiceAudio::default());
        let volumes = Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
        let board = Arc::new(std::sync::Mutex::new(SoundMix::new()));
        let hello = VoiceHello {
            endpoint: "127.0.0.1".into(),
            server_id: "444".into(),
            channel_id: CHANNEL_ID.to_string(),
            user_id: CLIENT_ID.to_string(),
            session_id: "session".into(),
            token: "super-secret-voice-token".into(),
            epoch: 1,
            camera: Arc::new(crate::discord::voice_camera::CameraInbox::new()),
        };
        drive_voice(&hello, socket, &mut cancel, &mut speaking, &audio, &volumes, &board, &log, &mut |_event: VoiceLinkEvent| {}).await
    }

    async fn mock_server(
        listener: TcpListener,
        udp: UdpSocket,
        udp_port: u16,
        external: Vec<u8>,
        proposal: Vec<u8>,
        mut peer: DaveCall,
        log: Arc<std::sync::Mutex<VoiceLog>>,
        secret: [u8; 32],
    ) -> Result<(), String> {
        let (tcp, _) = listener.accept().await.map_err(|err| err.to_string())?;
        let socket = accept_async(tcp).await.map_err(|err| err.to_string())?;
        let (mut write, mut read) = socket.split();

        let identify = next_text(&mut read).await?;
        let version = identify.pointer("/d/max_dave_protocol_version").and_then(|v| v.as_u64());
        if version != Some(1) {
            return Err(format!("identify did not offer DAVE v1: {identify}"));
        }
        send_json(&mut write, serde_json::json!({"op": 8, "d": {"heartbeat_interval": 1000}})).await?;
        send_json(
            &mut write,
            serde_json::json!({
                "op": 2,
                "d": {
                    "ssrc": 42,
                    "ip": "127.0.0.1",
                    "port": udp_port,
                    "modes": ["aead_aes256_gcm_rtpsize", "aead_xchacha20_poly1305_rtpsize"],
                    "heartbeat_interval": 1
                }
            }),
        )
        .await?;

        let client_addr = finish_discovery(&mut read, &udp).await?;
        let description = serde_json::json!({
            "op": 4,
            "d": {
                "mode": "aead_aes256_gcm_rtpsize",
                "secret_key": secret.to_vec(),
                "dave_protocol_version": 1
            }
        });
        send_json(&mut write, description).await?;

        let key_package = next_binary(&mut read, 26).await?;
        if key_package.len() < 64 {
            return Err(format!("key package was only {} bytes", key_package.len()));
        }
        send_json(&mut write, serde_json::json!({"op": 11, "d": {"user_ids": ["111", "222"]}})).await?;
        write.send(Message::Binary(dave_server(1, 25, &external))).await.map_err(|err| err.to_string())?;
        write.send(Message::Binary(dave_server(2, 27, &proposal))).await.map_err(|err| err.to_string())?;

        let commit_frame = next_binary(&mut read, 28).await?;
        let (commit, welcome) = split_commit_welcome(&commit_frame[1..])?;
        if welcome.is_empty() {
            return Err("commit had no welcome for the added member".into());
        }
        let mut announce = Vec::new();
        announce.extend_from_slice(&TRANSITION.to_be_bytes());
        announce.extend_from_slice(commit);
        write.send(Message::Binary(dave_server(3, 29, &announce))).await.map_err(|err| err.to_string())?;

        let ready = next_text(&mut read).await?;
        if ready.get("op").and_then(|v| v.as_i64()) != Some(23) {
            return Err(format!("expected transition ready, got {ready}"));
        }
        send_json(&mut write, serde_json::json!({"op": 22, "d": {"transition_id": TRANSITION}})).await?;

        peer.ingest_binary(&dave_server(1, 25, &external));
        peer.note_users([CLIENT_ID, PEER_ID]);
        let mut welcome_body = Vec::new();
        welcome_body.extend_from_slice(&TRANSITION.to_be_bytes());
        welcome_body.extend_from_slice(welcome);
        peer.ingest_binary(&dave_server(4, 30, &welcome_body));
        peer.execute_transition(TRANSITION);
        if !peer.sender_ready() {
            return Err(format!("peer sender ratchet was not ready: {:?}", peer.drain_trace()));
        }

        wait_log(&log, "execute transition 7 sender ready").await?;
        let inject = log.lock().map_err(|err| err.to_string())?.inject.clone().ok_or("audio inject was not installed")?;
        inject.send(MIC.to_vec()).map_err(|_| "audio inject closed".to_string())?;

        let mode = CipherMode::Aes256GcmRtpSize;
        let outbound = wait_udp_opus(&mut read, &udp, &secret, mode, &mut peer).await?;
        if outbound != MIC {
            return Err(format!("outbound opus was {outbound:?}"));
        }

        send_json(
            &mut write,
            serde_json::json!({"op": 5, "d": {"speaking": 1, "delay": 0, "ssrc": 99, "user_id": "222"}}),
        )
        .await?;
        let pause = Instant::now();
        while pause.elapsed() < Duration::from_millis(150) {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(150)) => break,
                frame = read.next() => {
                    let _ = frame;
                }
            }
        }
        let sealed = peer.seal_opus(PEER_OPUS).map_err(|_| "peer could not seal opus")?;
        let header = rtp_header(1, 960, 99);
        let packet = encrypt_voice(mode, &secret, &header, &sealed, 1).map_err(|_| "peer transport encrypt failed")?;
        udp.send_to(&packet, client_addr).await.map_err(|err| err.to_string())?;

        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(5) {
                let text = log.lock().map(|guard| guard.export()).unwrap_or_default();
                return Err(format!("inbound opus did not arrive\n{text}"));
            }
            if log.lock().map(|guard| guard.last_opus_in == PEER_OPUS).unwrap_or(false) {
                break;
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(20)) => {}
                frame = read.next() => {
                    if frame.is_none() {
                        return Err("client closed before inbound audio".into());
                    }
                }
            }
        }
        Ok(())
    }

    async fn finish_discovery<R>(read: &mut R, udp: &UdpSocket) -> Result<SocketAddr, String>
    where
        R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        let mut client_addr = None;
        let mut selected = false;
        let mut buf = [0u8; 256];
        let start = Instant::now();
        while client_addr.is_none() || !selected {
            if start.elapsed() > Duration::from_secs(5) {
                return Err("discovery or select protocol timed out".into());
            }
            tokio::select! {
                received = udp.recv_from(&mut buf) => {
                    let (size, addr) = received.map_err(|err| err.to_string())?;
                    if size < 8 {
                        continue;
                    }
                    let response = discovery_response(42, "127.0.0.1", addr.port());
                    udp.send_to(&response, addr).await.map_err(|err| err.to_string())?;
                    client_addr = Some(addr);
                }
                frame = read.next() => {
                    let frame = frame.ok_or("client closed during discovery")?.map_err(|err| err.to_string())?;
                    if let Some(text) = text_of(&frame) {
                        let value: Value = serde_json::from_str(text).map_err(|err| err.to_string())?;
                        let op = value.get("op").and_then(|v| v.as_i64());
                        if op == Some(31) {
                            return Err(format!("client sent invalid commit during discovery: {text}"));
                        }
                        if op == Some(1) {
                            let mode = value.pointer("/d/data/mode").and_then(|v| v.as_str()).unwrap_or("");
                            if mode != "aead_aes256_gcm_rtpsize" && mode != "aead_xchacha20_poly1305_rtpsize" {
                                return Err(format!("select protocol mode {mode}"));
                            }
                            let port = value.pointer("/d/data/port").and_then(|v| v.as_u64());
                            if let Some(addr) = client_addr {
                                if port != Some(u64::from(addr.port())) {
                                    return Err(format!("select protocol port {port:?} did not match discovery"));
                                }
                            }
                            selected = true;
                        }
                    }
                }
            }
        }
        client_addr.ok_or_else(|| "missing client udp address".to_string())
    }

    async fn wait_udp_opus<R>(
        read: &mut R,
        udp: &UdpSocket,
        secret: &[u8; 32],
        mode: CipherMode,
        peer: &mut DaveCall,
    ) -> Result<Vec<u8>, String>
    where
        R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        let mut buf = [0u8; 2048];
        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(5) {
                return Err("outbound opus did not arrive".into());
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(20)) => {}
                frame = read.next() => {
                    let frame = frame.ok_or("client closed before outbound audio")?.map_err(|err| err.to_string())?;
                    if let Some(text) = text_of(&frame) {
                        if text.contains("\"op\":31") {
                            return Err(format!("client rejected the commit: {text}"));
                        }
                    }
                }
                received = udp.recv_from(&mut buf) => {
                    let (size, _) = received.map_err(|err| err.to_string())?;
                    let Ok(sealed) = decrypt_voice(mode, secret, &buf[..size]) else { continue };
                    let Ok(opus) = peer.open_opus(CLIENT_ID, &sealed) else { continue };
                    if opus == MIC {
                        return Ok(opus);
                    }
                }
            }
        }
    }

    async fn next_text<R>(read: &mut R) -> Result<Value, String>
    where
        R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        loop {
            let frame = next_message(read).await?;
            if let Some(text) = text_of(&frame) {
                let value: Value = serde_json::from_str(text).map_err(|err| err.to_string())?;
                let op = value.get("op").and_then(|v| v.as_i64());
                if op == Some(3) || op == Some(5) {
                    continue;
                }
                if op == Some(31) {
                    return Err(format!("client sent invalid commit: {text}"));
                }
                return Ok(value);
            }
        }
    }

    async fn next_binary<R>(read: &mut R, opcode: u8) -> Result<Vec<u8>, String>
    where
        R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        loop {
            let frame = next_message(read).await?;
            match frame {
                Message::Binary(bytes) if bytes.first() == Some(&opcode) => return Ok(bytes),
                Message::Binary(_) => continue,
                Message::Text(text) => {
                    if text.contains("\"op\":31") {
                        return Err(format!("client sent invalid commit: {text}"));
                    }
                }
                _ => continue,
            }
        }
    }

    async fn next_message<R>(read: &mut R) -> Result<Message, String>
    where
        R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        let frame = tokio::time::timeout(Duration::from_secs(8), read.next())
            .await
            .map_err(|_| "timed out waiting for the client".to_string())?
            .ok_or_else(|| "client closed".to_string())?
            .map_err(|err| err.to_string())?;
        if let Message::Ping(payload) = frame {
            return Ok(Message::Pong(payload));
        }
        Ok(frame)
    }

    async fn send_json<W>(write: &mut W, value: Value) -> Result<(), String>
    where
        W: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    {
        write.send(Message::Text(value.to_string())).await.map_err(|err| err.to_string())
    }

    async fn wait_log(log: &std::sync::Mutex<VoiceLog>, needle: &str) -> Result<(), String> {
        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(8) {
                let text = log.lock().map(|guard| guard.export()).unwrap_or_default();
                return Err(format!("missing log step {needle}\n{text}"));
            }
            let found = log.lock().map(|guard| guard.steps.iter().any(|step| step.contains(needle))).unwrap_or(false);
            if found {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    fn text_of(frame: &Message) -> Option<&str> {
        match frame {
            Message::Text(text) => Some(text.as_str()),
            _ => None,
        }
    }

    fn dave_server(seq: u16, opcode: u8, payload: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(3 + payload.len());
        out.extend_from_slice(&seq.to_be_bytes());
        out.push(opcode);
        out.extend_from_slice(payload);
        out
    }

    fn discovery_response(ssrc: u32, address: &str, port: u16) -> [u8; 74] {
        let mut packet = [0u8; 74];
        packet[0..2].copy_from_slice(&2u16.to_be_bytes());
        packet[2..4].copy_from_slice(&70u16.to_be_bytes());
        packet[4..8].copy_from_slice(&ssrc.to_be_bytes());
        let bytes = address.as_bytes();
        packet[8..8 + bytes.len()].copy_from_slice(bytes);
        packet[72..74].copy_from_slice(&port.to_be_bytes());
        packet
    }

    fn secret_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        for (index, byte) in key.iter_mut().enumerate() {
            *byte = (index as u8).wrapping_add(1);
        }
        key
    }

    fn split_commit_welcome(payload: &[u8]) -> Result<(&[u8], &[u8]), String> {
        let (_message, welcome) = MlsMessageIn::tls_deserialize_bytes(payload).map_err(|err| err.to_string())?;
        let commit_len = payload.len() - welcome.len();
        Ok((&payload[..commit_len], welcome))
    }

    fn gateway_add() -> Result<(Vec<u8>, Vec<u8>, DaveCall), String> {
        let ciphersuite = Ciphersuite::MLS_128_DHKEMP256_AES128GCM_SHA256_P256;
        let signer = SignatureKeyPair::new(ciphersuite.signature_algorithm()).map_err(|err| err.to_string())?;
        let credential = BasicCredential::new(999u64.to_be_bytes().to_vec()).into();
        let external = ExternalSender::new(signer.public().into(), credential);
        let external_bytes = external.tls_serialize_detached().map_err(|err| err.to_string())?;

        let mut peer = DaveCall::start(PEER_ID, CHANNEL_ID, 1)?;
        let package = match peer.take_outbound().into_iter().next() {
            Some(DaveWire::Binary(frame)) => frame,
            Some(DaveWire::Text(_)) | None => return Err("peer key package missing".into()),
        };
        if package.first() != Some(&26) {
            return Err("peer key package opcode".into());
        }
        let crypto = OpenMlsRustCrypto::default();
        let key_package = KeyPackageIn::tls_deserialize(&mut &package[1..])
            .map_err(|err| err.to_string())?
            .validate(crypto.crypto(), ProtocolVersion::Mls10)
            .map_err(|err| err.to_string())?;
        let proposal = ExternalProposal::new_add::<OpenMlsRustCrypto>(
            key_package,
            GroupId::from_slice(&CHANNEL_ID.to_be_bytes()),
            GroupEpoch::from(0u64),
            &signer,
            SenderExtensionIndex::new(0),
        )
        .map_err(|err| err.to_string())?;
        let messages = VLBytes::new(proposal.tls_serialize_detached().map_err(|err| err.to_string())?)
            .tls_serialize_detached()
            .map_err(|err| err.to_string())?;
        let mut payload = vec![0u8];
        payload.extend_from_slice(&messages);
        Ok((external_bytes, payload, peer))
    }

    #[test]
    fn diagnostics_do_not_include_the_transport_key() {
        let mut log = VoiceLog::default();
        log.mode = "aead_aes256_gcm_rtpsize".into();
        log.dave_version = 1;
        log.push("identify sent");
        log.close_code = Some(4014);
        log.close_reason = "disconnected".into();
        let text = log.export();
        assert!(text.starts_with("Lark voice diagnostics"));
        assert!(text.contains("close: 4014 disconnected"));
        assert!(text.contains("identify sent"));
        assert!(!text.contains("secret"));
    }
}
