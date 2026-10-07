//! Stream voice connection for Go Live.
//!
//! This socket is separate from the call. It identifies with `video: true`,
//! selects H.264 (and VP8/VP9/AV1 when the client can decode them), then sends
//! opcode 12. RTP is encrypted with the same AEAD modes and DAVE session as
//! voice. RTCP PLI asks for an IDR; NACK replays packets from a short window.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::    stream::{
    decrypt_rtcp, encrypt_rtp, h264_codec, packetize_h264, parse_rtcp, soundshare_payload, ssrcs_from_ready,
    stream_identify, stream_select_protocol, video_attributes, video_timestamp_step, CodecSupport,
    H264Assembler, RtcpFeedback, VideoSpan,
};
use super::voice::{
    choose_mode, dave_protocol_version, ip_discovery_request, parse_dave_server_binary, parse_ip_discovery,
    voice_close_error, voice_error_should_stop, voice_gateway_url, voice_heartbeat, voice_heartbeat_interval_ms,
    voice_reconnect_delay_ms, CipherMode, OPUS_SILENCE,
};
use super::voice_dave::{DaveCall, DaveWire};
use super::voice_media::AppOpus;

const HISTORY: usize = 256;

pub struct StreamHello {
    pub endpoint: String,
    pub server_id: String,
    pub channel_id: String,
    pub user_id: String,
    pub session_id: String,
    pub token: String,
    pub publish: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u8,
    pub bitrate: u32,
}

#[derive(Debug, Clone)]
pub enum StreamLinkEvent {
    Status { state: String, detail: String },
    Frame { annex_b: Vec<u8> },
}

pub async fn maintain_stream<F>(
    hello: StreamHello,
    mut cancel: watch::Receiver<bool>,
    mut paused: watch::Receiver<bool>,
    mut quality: watch::Receiver<VideoSpan>,
    mut frames: mpsc::UnboundedReceiver<Vec<u8>>,
    mut audio: mpsc::UnboundedReceiver<Vec<f32>>,
    force_idr: Arc<AtomicBool>,
    mut emit: F,
) where
    F: FnMut(StreamLinkEvent) + Send,
{
    let mut attempt = 0u32;
    loop {
        if *cancel.borrow() {
            emit(StreamLinkEvent::Status { state: "stopped".into(), detail: String::new() });
            return;
        }
        let state = if attempt == 0 { "connecting" } else { "reconnecting" };
        emit(StreamLinkEvent::Status { state: state.into(), detail: String::new() });
        match stream_once(
            &hello,
            &mut cancel,
            &mut paused,
            &mut quality,
            &mut frames,
            &mut audio,
            &force_idr,
            &mut emit,
        )
        .await
        {
            Ok(()) => {
                emit(StreamLinkEvent::Status { state: "stopped".into(), detail: String::new() });
                return;
            }
            Err(err) => {
                if err == "Cancelled" || *cancel.borrow() {
                    emit(StreamLinkEvent::Status { state: "stopped".into(), detail: String::new() });
                    return;
                }
                if voice_error_should_stop(&err) {
                    let detail = err.trim_start_matches("fatal:").to_string();
                    emit(StreamLinkEvent::Status { state: "failed".into(), detail });
                    return;
                }
                let delay = voice_reconnect_delay_ms(attempt);
                attempt = attempt.saturating_add(1);
                emit(StreamLinkEvent::Status { state: "reconnecting".into(), detail: err });
                tokio::select! {
                    _ = cancel.changed() => {
                        if *cancel.borrow() {
                            emit(StreamLinkEvent::Status { state: "stopped".into(), detail: String::new() });
                            return;
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_millis(delay)) => {}
                }
            }
        }
    }
}

async fn stream_once<F>(
    hello: &StreamHello,
    cancel: &mut watch::Receiver<bool>,
    paused: &mut watch::Receiver<bool>,
    quality: &mut watch::Receiver<VideoSpan>,
    frames: &mut mpsc::UnboundedReceiver<Vec<u8>>,
    audio: &mut mpsc::UnboundedReceiver<Vec<f32>>,
    force_idr: &Arc<AtomicBool>,
    emit: &mut F,
) -> Result<(), String>
where
    F: FnMut(StreamLinkEvent) + Send,
{
    let url = voice_gateway_url(&hello.endpoint).ok_or_else(|| "Bad stream endpoint".to_string())?;
    let (socket, _) = connect_async(url).await.map_err(|_| "Stream gateway refused the connection".to_string())?;
    let (mut write, mut read) = socket.split();
    let identify = stream_identify(&hello.server_id, &hello.user_id, &hello.session_id, &hello.token, hello.publish);
    write.send(Message::Text(identify)).await.map_err(|_| "Stream identify failed".to_string())?;

    let mut beat = Heart::new();
    let mut seq_ack: Option<i64> = None;
    let ready = read_ready(&mut read, &mut write, cancel, &mut beat, &mut seq_ack).await?;
    let (audio_ssrc, video_ssrc, rtx_ssrc) = ssrcs_from_ready(&ready).ok_or_else(|| "Stream ready was incomplete".to_string())?;
    let ip = ready.get("ip").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let port = ready.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
    if ip.is_empty() || port == 0 {
        return Err("Stream ready was incomplete".into());
    }

    let udp = UdpSocket::bind("0.0.0.0:0").await.map_err(|err| err.to_string())?;
    udp.connect((ip.as_str(), port)).await.map_err(|err| err.to_string())?;
    udp.send(&ip_discovery_request(audio_ssrc)).await.map_err(|err| err.to_string())?;
    let (address, discovered) = discover(&udp, &mut read, &mut write, cancel, &mut beat, &mut seq_ack).await?;

    let offered: Vec<String> = ready
        .get("modes")
        .and_then(|v| v.as_array())
        .map(|modes| modes.iter().filter_map(|item| item.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let mode = choose_mode(&offered).ok_or_else(|| "fatal:No supported stream encryption".to_string())?;
    write
        .send(Message::Text(stream_select_protocol(&address, discovered, mode, CodecSupport::watch())))
        .await
        .map_err(|_| "Stream select protocol failed".to_string())?;
    let description = next_op(&mut read, &mut write, cancel, &mut beat, &mut seq_ack, 4, Duration::from_secs(8)).await?;
    let chosen = description.get("mode").and_then(|v| v.as_str()).unwrap_or(mode.name());
    let mode = choose_mode(&[chosen.to_string()]).ok_or_else(|| "fatal:No supported stream encryption".to_string())?;
    let key = secret_key(&description).ok_or_else(|| "Stream key missing".to_string())?;
    let mut dave = start_dave(hello, dave_protocol_version(&description))?;
    if let Some(dave) = dave.as_mut() {
        flush_dave(&mut write, dave).await?;
    }

    let mut span = VideoSpan {
        width: hello.width.max(2),
        height: hello.height.max(2),
        fps: hello.fps.max(1),
        bitrate: hello.bitrate.max(1),
        active: hello.publish && !*paused.borrow(),
        preset_height: 0,
    };
    if hello.publish {
        let _ = write
            .send(Message::Text(video_attributes(audio_ssrc, video_ssrc, rtx_ssrc, span)))
            .await;
    }
    emit(StreamLinkEvent::Status { state: "live".into(), detail: mode.name().into() });

    let udp = Arc::new(udp);
    let mut sequence = 1u16;
    let mut timestamp = 0u32;
    let mut nonce = 1u32;
    let mut audio_seq = 1u16;
    let mut audio_ts = 0u32;
    let mut history: VecDeque<(u16, Vec<u8>)> = VecDeque::new();
    let mut assembler = H264Assembler::new();
    let mut opus = AppOpus::new().ok();
    let mut pcm: VecDeque<f32> = VecDeque::new();
    let mut sharing_audio = false;
    let payload_type = h264_codec().payload_type;
    let mut packet = [0u8; 4096];
    if beat.every.is_none() {
        beat.note_hello(0);
    }

    loop {
        if *cancel.borrow() {
            return Ok(());
        }
        let udp_recv = udp.clone();
        let udp_send = udp.clone();
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    return Ok(());
                }
            }
            changed = paused.changed() => {
                if changed.is_err() {
                    return Ok(());
                }
                span.active = hello.publish && !*paused.borrow();
                if hello.publish {
                    let _ = write.send(Message::Text(video_attributes(audio_ssrc, video_ssrc, rtx_ssrc, span))).await;
                }
            }
            changed = quality.changed() => {
                if changed.is_err() {
                    continue;
                }
                let next = *quality.borrow();
                if next.width > 0 && next.height > 0 && next.fps > 0 {
                    span.width = next.width;
                    span.height = next.height;
                    span.fps = next.fps;
                    span.bitrate = next.bitrate;
                    span.preset_height = next.preset_height;
                }
                if hello.publish {
                    let _ = write.send(Message::Text(video_attributes(audio_ssrc, video_ssrc, rtx_ssrc, span))).await;
                }
            }
            frame = frames.recv() => {
                let Some(access) = frame else { continue };
                if !hello.publish || *paused.borrow() {
                    continue;
                }
                let step = video_timestamp_step(span.fps);
                let packets = packetize_h264(&access, video_ssrc, payload_type, &mut sequence, timestamp);
                timestamp = timestamp.wrapping_add(step);
                for item in packets {
                    let encrypted = encrypt_rtp(mode, &key, &item.header, &item.payload, nonce).map_err(|_| "Stream encrypt failed".to_string())?;
                    nonce = nonce.wrapping_add(1);
                    if udp_send.send(&encrypted).await.is_err() {
                        return Err("Stream UDP send failed".into());
                    }
                    history.push_back((item.sequence, encrypted));
                    while history.len() > HISTORY {
                        history.pop_front();
                    }
                }
            }
            samples = audio.recv() => {
                if let Some(samples) = samples {
                    pcm.extend(samples);
                }
                if let Some(encoder) = opus.as_mut() {
                    while pcm.len() >= 960 {
                        let frame: Vec<f32> = pcm.drain(..960).collect();
                        let active = frame.iter().any(|sample| sample.abs() > 0.01);
                        if active != sharing_audio {
                            sharing_audio = active;
                            let _ = write.send(Message::Text(soundshare_payload(audio_ssrc, active))).await;
                        }
                        let pcm_i16 = encoder.frame_from_f32(&frame);
                        let opus_packet = if active {
                            encoder.encode(&pcm_i16).unwrap_or_else(|_| OPUS_SILENCE.to_vec())
                        } else {
                            OPUS_SILENCE.to_vec()
                        };
                        let header = super::voice::rtp_header(audio_seq, audio_ts, audio_ssrc);
                        audio_seq = audio_seq.wrapping_add(1);
                        audio_ts = audio_ts.wrapping_add(960);
                        if let Ok(encrypted) = encrypt_rtp(mode, &key, &header, &opus_packet, nonce) {
                            nonce = nonce.wrapping_add(1);
                            let _ = udp_send.send(&encrypted).await;
                        }
                    }
                }
            }
            incoming = read.next() => {
                let Some(frame) = incoming else { return Err("Stream gateway closed".into()) };
                let frame = frame.map_err(|_| "Stream gateway closed".to_string())?;
                match frame {
                    Message::Close(frame) => return Err(close_error(frame)),
                    Message::Ping(payload) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Message::Text(text) => {
                        handle_text(&text, dave.as_mut(), &mut seq_ack)?;
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
            received = udp_recv.recv(&mut packet) => {
                let Ok(size) = received else { continue };
                handle_udp(&packet[..size], mode, &key, video_ssrc, &mut history, &udp_send, &mut assembler, force_idr, emit).await;
            }
            _ = tokio::time::sleep(beat.until()) => {
                if beat.due() {
                    let _ = write.send(Message::Text(voice_heartbeat(now_ms(), seq_ack))).await;
                    beat.sent();
                }
            }
        }
    }
}

async fn handle_udp<F>(
    packet: &[u8],
    mode: CipherMode,
    key: &[u8; 32],
    video_ssrc: u32,
    history: &mut VecDeque<(u16, Vec<u8>)>,
    udp: &UdpSocket,
    assembler: &mut H264Assembler,
    force_idr: &Arc<AtomicBool>,
    emit: &mut F,
) where
    F: FnMut(StreamLinkEvent) + Send,
{
    if packet.len() < 12 {
        return;
    }
    if packet[1] == 200 || packet[1] == 201 || packet[1] == 205 || packet[1] == 206 || (packet[1] >= 192 && packet[1] <= 223) {
        let plain = decrypt_rtcp(mode, key, packet).unwrap_or_else(|_| packet.to_vec());
        for feedback in parse_rtcp(&plain) {
            match feedback {
                RtcpFeedback::Pli { media_ssrc } if media_ssrc == video_ssrc || media_ssrc == 0 => {
                    force_idr.store(true, Ordering::Relaxed);
                }
                RtcpFeedback::Nack { media_ssrc, sequences } if media_ssrc == video_ssrc => {
                    for seq in sequences {
                        if let Some((_, bytes)) = history.iter().find(|(item, _)| *item == seq) {
                            let _ = udp.send(bytes).await;
                        }
                    }
                }
                _ => {}
            }
        }
        return;
    }
    let Ok(payload) = super::voice::decrypt_voice(mode, key, packet) else { return };
    let marker = packet.get(1).map(|byte| byte & 0x80 != 0).unwrap_or(false);
    if let Some(unit) = assembler.push(&payload, marker) {
        emit(StreamLinkEvent::Frame { annex_b: unit });
    }
}

fn handle_text(text: &str, dave: Option<&mut DaveCall>, seq_ack: &mut Option<i64>) -> Result<(), String> {
    let Ok(value) = serde_json::from_str::<Value>(text) else { return Ok(()) };
    if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
        *seq_ack = Some(seq);
    }
    if let Some(dave) = dave {
        apply_dave(dave, &value)?;
    }
    Ok(())
}

struct Heart {
    every: Option<Duration>,
    next: Option<Instant>,
}

impl Heart {
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
        self.next.map(|at| at.saturating_duration_since(Instant::now())).unwrap_or(Duration::from_secs(60))
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

async fn read_ready<R, W>(
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heart,
    seq_ack: &mut Option<i64>,
) -> Result<Value, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    next_op(read, write, cancel, beat, seq_ack, 2, Duration::from_secs(8)).await
}

async fn next_op<R, W>(
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heart,
    seq_ack: &mut Option<i64>,
    want: i64,
    limit: Duration,
) -> Result<Value, String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let deadline = Instant::now() + limit;
    loop {
        if *cancel.borrow() {
            return Err("Cancelled".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("Stream handshake timed out".into());
        }
        tokio::select! {
            _ = cancel.changed() => {
                if *cancel.borrow() {
                    return Err("Cancelled".into());
                }
            }
            _ = tokio::time::sleep(beat.until().min(remaining)) => {
                if beat.due() {
                    write.send(Message::Text(voice_heartbeat(now_ms(), *seq_ack))).await.map_err(|_| "Stream heartbeat failed".to_string())?;
                    beat.sent();
                }
            }
            frame = read.next() => {
                let Some(frame) = frame else { return Err("Stream gateway closed".into()) };
                let frame = frame.map_err(|_| "Stream gateway closed".to_string())?;
                match frame {
                    Message::Text(text) => {
                        let value: Value = serde_json::from_str(&text).map_err(|_| "Bad stream payload".to_string())?;
                        let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
                        if let Some(seq) = value.get("seq").and_then(|v| v.as_i64()) {
                            *seq_ack = Some(seq);
                        }
                        if op == 8 {
                            let raw = value.pointer("/d/heartbeat_interval").and_then(|v| v.as_u64()).unwrap_or(0);
                            beat.note_hello(raw);
                        } else if op == want {
                            return value.get("d").cloned().ok_or_else(|| "Stream payload missing data".to_string());
                        }
                    }
                    Message::Ping(payload) => {
                        write.send(Message::Pong(payload)).await.map_err(|_| "Stream gateway closed".to_string())?;
                    }
                    Message::Close(frame) => return Err(close_error(frame)),
                    _ => {}
                }
            }
        }
    }
}

async fn discover<R, W>(
    udp: &UdpSocket,
    read: &mut R,
    write: &mut W,
    cancel: &mut watch::Receiver<bool>,
    beat: &mut Heart,
    seq_ack: &mut Option<i64>,
) -> Result<(String, u16), String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    W: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut buf = [0u8; 74];
    loop {
        if *cancel.borrow() {
            return Err("Cancelled".into());
        }
        if Instant::now() >= deadline {
            return Err("Stream IP discovery timed out".into());
        }
        tokio::select! {
            _ = cancel.changed() => {
                if *cancel.borrow() {
                    return Err("Cancelled".into());
                }
            }
            _ = tokio::time::sleep(beat.until().min(Duration::from_millis(200))) => {
                if beat.due() {
                    let _ = write.send(Message::Text(voice_heartbeat(now_ms(), *seq_ack))).await;
                    beat.sent();
                }
            }
            received = udp.recv(&mut buf) => {
                if let Ok(size) = received {
                    if let Some(found) = parse_ip_discovery(&buf[..size]) {
                        return Ok(found);
                    }
                }
            }
            frame = read.next() => {
                if let Some(Ok(Message::Text(text))) = frame {
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if value.get("op").and_then(|v| v.as_i64()) == Some(8) {
                            let raw = value.pointer("/d/heartbeat_interval").and_then(|v| v.as_u64()).unwrap_or(0);
                            beat.note_hello(raw);
                        }
                    }
                }
            }
        }
    }
}

fn start_dave(hello: &StreamHello, version: u16) -> Result<Option<DaveCall>, String> {
    if version == 0 {
        return Ok(None);
    }
    let user_id = snowflake(&hello.user_id).ok_or_else(|| "fatal:Stream user id was not a snowflake".to_string())?;
    let channel = if hello.channel_id.is_empty() { hello.server_id.as_str() } else { hello.channel_id.as_str() };
    let channel_id = snowflake(channel).ok_or_else(|| "fatal:Stream channel id was not a snowflake".to_string())?;
    Ok(Some(DaveCall::start(user_id, channel_id, version)?))
}

fn apply_dave(dave: &mut DaveCall, value: &Value) -> Result<(), String> {
    let op = value.get("op").and_then(|v| v.as_i64()).unwrap_or(-1);
    let data = value.get("d");
    match op {
        11 => {
            if let Some(ids) = data.and_then(|item| item.get("user_ids")).and_then(|item| item.as_array()) {
                dave.note_users(ids.iter().filter_map(json_snowflake));
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
    W: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
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

fn snowflake(value: &str) -> Option<u64> {
    let id = value.parse::<u64>().ok()?;
    if id == 0 { None } else { Some(id) }
}

fn json_snowflake(value: &Value) -> Option<u64> {
    value.as_u64().or_else(|| value.as_str().and_then(|text| text.parse().ok())).filter(|id| *id != 0)
}

fn close_error(frame: Option<tokio_tungstenite::tungstenite::protocol::CloseFrame>) -> String {
    let code = frame.as_ref().map(|item| u16::from(item.code)).unwrap_or(1005);
    let reason = frame.map(|item| item.reason.to_string()).unwrap_or_default();
    voice_close_error(code, &reason)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
