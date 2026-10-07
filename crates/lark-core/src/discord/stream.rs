//! Discord Go Live.
//!
//! A stream is a second voice connection. The main gateway opens it with opcode
//! 18, pauses it with 22, and closes it with 19. The stream socket negotiates
//! its own SSRCs and video codecs, then carries H.264 as encrypted RTP. Game
//! Mode does not slow this clock: a throttled stream is a frozen share.

use super::voice::{encrypt_voice, rtp_header, CipherMode, MAX_DAVE_PROTOCOL_VERSION};
use serde::Serialize;

pub const OP_STREAM_CREATE: i64 = 18;
pub const OP_STREAM_DELETE: i64 = 19;
pub const OP_STREAM_WATCH: i64 = 20;
pub const OP_STREAM_SET_PAUSED: i64 = 22;
pub const OP_VIDEO: i64 = 12;

/// RTP payload budget. Encryption adds a 16-byte tag and a 4-byte nonce, so the
/// UDP datagram stays under a typical 1280-byte path MTU.
pub const MAX_RTP_PAYLOAD: usize = 1200;
const FU_A: u8 = 28;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamKind {
    Guild,
    Call,
}

impl StreamKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Guild => "guild",
            Self::Call => "call",
        }
    }
}

/// `guild:{guild}:{channel}:{user}` or `call:{channel}:{user}`.
pub fn stream_key(kind: StreamKind, guild_id: Option<&str>, channel_id: &str, user_id: &str) -> String {
    match kind {
        StreamKind::Guild => format!(
            "guild:{}:{}:{}",
            guild_id.unwrap_or(""),
            channel_id,
            user_id
        ),
        StreamKind::Call => format!("call:{channel_id}:{user_id}"),
    }
}

pub fn parse_stream_key(key: &str) -> Option<(StreamKind, String, String, String)> {
    let parts: Vec<&str> = key.split(':').collect();
    match parts.as_slice() {
        ["guild", guild, channel, user] if !channel.is_empty() && !user.is_empty() => {
            Some((StreamKind::Guild, (*guild).to_string(), (*channel).to_string(), (*user).to_string()))
        }
        ["call", channel, user] if !channel.is_empty() && !user.is_empty() => {
            Some((StreamKind::Call, String::new(), (*channel).to_string(), (*user).to_string()))
        }
        _ => None,
    }
}

pub fn stream_create_payload(kind: StreamKind, guild_id: Option<&str>, channel_id: &str) -> String {
    let guild = match kind {
        StreamKind::Guild => guild_id.filter(|id| !id.is_empty()),
        StreamKind::Call => None,
    };
    serde_json::json!({
        "op": OP_STREAM_CREATE,
        "d": {
            "type": kind.name(),
            "guild_id": guild,
            "channel_id": channel_id,
            "preferred_region": null
        }
    })
    .to_string()
}

pub fn stream_delete_payload(stream_key: &str) -> String {
    serde_json::json!({
        "op": OP_STREAM_DELETE,
        "d": { "stream_key": stream_key }
    })
    .to_string()
}

pub fn stream_watch_payload(stream_key: &str) -> String {
    serde_json::json!({
        "op": OP_STREAM_WATCH,
        "d": { "stream_key": stream_key }
    })
    .to_string()
}

pub fn stream_set_paused_payload(stream_key: &str, paused: bool) -> String {
    serde_json::json!({
        "op": OP_STREAM_SET_PAUSED,
        "d": { "stream_key": stream_key, "paused": paused }
    })
    .to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamDispatch {
    Create {
        stream_key: String,
        paused: bool,
        region: String,
    },
    Server {
        stream_key: String,
        endpoint: String,
        token: String,
        guild_id: String,
    },
    Update {
        stream_key: String,
        paused: bool,
    },
    Delete {
        stream_key: String,
    },
}

pub fn parse_stream_dispatch(name: &str, data: &serde_json::Value) -> Option<StreamDispatch> {
    let stream_key = json_string(data, "stream_key");
    if stream_key.is_empty() {
        return None;
    }
    match name {
        "STREAM_CREATE" => Some(StreamDispatch::Create {
            stream_key,
            paused: data.get("paused").and_then(|v| v.as_bool()).unwrap_or(false),
            region: json_string(data, "region"),
        }),
        "STREAM_SERVER_UPDATE" => {
            let endpoint = json_string(data, "endpoint");
            let token = json_string(data, "token");
            if endpoint.is_empty() || token.is_empty() {
                return None;
            }
            Some(StreamDispatch::Server {
                stream_key,
                endpoint,
                token,
                guild_id: json_string(data, "guild_id"),
            })
        }
        "STREAM_UPDATE" => Some(StreamDispatch::Update {
            stream_key,
            paused: data.get("paused").and_then(|v| v.as_bool()).unwrap_or(false),
        }),
        "STREAM_DELETE" => Some(StreamDispatch::Delete { stream_key }),
        _ => None,
    }
}

fn json_string(data: &serde_json::Value, key: &str) -> String {
    data.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoCodec {
    pub name: &'static str,
    pub payload_type: u8,
    pub rtx_payload_type: u8,
    pub priority: u16,
    pub encode: bool,
    pub decode: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CodecSupport {
    pub vp8: bool,
    pub vp9: bool,
    pub av1: bool,
}

impl CodecSupport {
    /// H.264 is the encode path. The others are offered when this machine can
    /// decode them, which the watch path does through the browser.
    pub fn watch() -> Self {
        Self { vp8: true, vp9: true, av1: true }
    }
}

/// Opus, then H.264. VP8, VP9, and AV1 follow when `support` says the client
/// can handle them. Payload types match the desktop client's select-protocol list.
pub fn stream_codecs(support: CodecSupport) -> Vec<VideoCodec> {
    let mut codecs = vec![
        VideoCodec {
            name: "opus",
            payload_type: 120,
            rtx_payload_type: 0,
            priority: 1000,
            encode: true,
            decode: true,
        },
        VideoCodec {
            name: "H264",
            payload_type: 101,
            rtx_payload_type: 102,
            priority: 1000,
            encode: true,
            decode: true,
        },
    ];
    if support.vp8 {
        codecs.push(VideoCodec {
            name: "VP8",
            payload_type: 103,
            rtx_payload_type: 104,
            priority: 2000,
            encode: false,
            decode: true,
        });
    }
    if support.vp9 {
        codecs.push(VideoCodec {
            name: "VP9",
            payload_type: 105,
            rtx_payload_type: 106,
            priority: 3000,
            encode: false,
            decode: true,
        });
    }
    if support.av1 {
        codecs.push(VideoCodec {
            name: "AV1",
            payload_type: 107,
            rtx_payload_type: 108,
            priority: 4000,
            encode: false,
            decode: true,
        });
    }
    codecs
}

pub fn h264_codec() -> VideoCodec {
    stream_codecs(CodecSupport { vp8: false, vp9: false, av1: false })
        .into_iter()
        .find(|codec| codec.name == "H264")
        .expect("H.264 is always offered")
}

pub fn stream_identify(
    server_id: &str,
    user_id: &str,
    session_id: &str,
    token: &str,
    publish: bool,
) -> String {
    let mut data = serde_json::json!({
        "server_id": server_id,
        "user_id": user_id,
        "session_id": session_id,
        "token": token,
        "video": true,
        "max_dave_protocol_version": MAX_DAVE_PROTOCOL_VERSION
    });
    if publish {
        data["streams"] = serde_json::json!([
            { "type": "video", "rid": "100", "quality": 100, "active": true }
        ]);
    }
    serde_json::json!({ "op": 0, "d": data }).to_string()
}

pub fn stream_select_protocol(address: &str, port: u16, mode: CipherMode, support: CodecSupport) -> String {
    let codecs: Vec<serde_json::Value> = stream_codecs(support)
        .into_iter()
        .map(|codec| {
            let mut value = serde_json::json!({
                "name": codec.name,
                "type": if codec.name == "opus" { "audio" } else { "video" },
                "priority": codec.priority,
                "payload_type": codec.payload_type,
                "encode": codec.encode,
                "decode": codec.decode
            });
            if codec.rtx_payload_type != 0 {
                value["rtx_payload_type"] = serde_json::json!(codec.rtx_payload_type);
            }
            value
        })
        .collect();
    serde_json::json!({
        "op": 1,
        "d": {
            "protocol": "udp",
            "data": {
                "address": address,
                "port": port,
                "mode": mode.name()
            },
            "codecs": codecs
        }
    })
    .to_string()
}

/// Video and RTX SSRCs are distinct from the audio SSRC Ready assigned.
pub fn video_ssrcs(audio_ssrc: u32) -> (u32, u32) {
    let video = audio_ssrc.wrapping_add(1).max(1);
    let mut rtx = audio_ssrc.wrapping_add(2).max(1);
    if rtx == video {
        rtx = rtx.wrapping_add(1).max(1);
    }
    if video == audio_ssrc {
        return video_ssrcs(audio_ssrc.wrapping_add(1));
    }
    (video, rtx)
}

/// Ready may assign the video SSRCs. Otherwise the client picks them.
pub fn ssrcs_from_ready(ready: &serde_json::Value) -> Option<(u32, u32, u32)> {
    let audio = ready.get("ssrc").and_then(|v| v.as_u64())? as u32;
    if audio == 0 {
        return None;
    }
    let streams = ready.get("streams").and_then(|v| v.as_array());
    if let Some(streams) = streams {
        for stream in streams {
            let video = stream.get("ssrc").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let rtx = stream.get("rtx_ssrc").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            if video != 0 && rtx != 0 && video != audio && rtx != audio && video != rtx {
                return Some((audio, video, rtx));
            }
        }
    }
    let (video, rtx) = video_ssrcs(audio);
    Some((audio, video, rtx))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSpan {
    pub width: u32,
    pub height: u32,
    pub fps: u8,
    pub bitrate: u32,
    pub active: bool,
    /// 0 keeps Source. Otherwise the picker height, not the fitted output height.
    #[serde(default)]
    pub preset_height: u32,
}

/// Voice opcode 12. One fixed-resolution video stream at rid 100.
pub fn video_attributes(audio_ssrc: u32, video_ssrc: u32, rtx_ssrc: u32, span: VideoSpan) -> String {
    serde_json::json!({
        "op": OP_VIDEO,
        "d": {
            "audio_ssrc": audio_ssrc,
            "video_ssrc": video_ssrc,
            "rtx_ssrc": rtx_ssrc,
            "streams": [{
                "type": "video",
                "rid": "100",
                "ssrc": video_ssrc,
                "active": span.active,
                "quality": 100,
                "rtx_ssrc": rtx_ssrc,
                "max_bitrate": span.bitrate,
                "max_framerate": span.fps,
                "max_resolution": {
                    "type": "fixed",
                    "width": span.width,
                    "height": span.height
                }
            }]
        }
    })
    .to_string()
}

/// App audio on the stream connection uses the soundshare speaking bit.
pub fn soundshare_payload(ssrc: u32, active: bool) -> String {
    serde_json::json!({
        "op": 5,
        "d": { "speaking": if active { 2 } else { 0 }, "delay": 0, "ssrc": ssrc }
    })
    .to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RtpPacket {
    pub sequence: u16,
    pub timestamp: u32,
    pub marker: bool,
    pub header: Vec<u8>,
    pub payload: Vec<u8>,
}

pub fn video_header(sequence: u16, timestamp: u32, ssrc: u32, payload_type: u8, marker: bool) -> [u8; 12] {
    let mut header = rtp_header(sequence, timestamp, ssrc);
    header[1] = payload_type & 0x7f;
    if marker {
        header[1] |= 0x80;
    }
    header
}

/// Split an access unit into NAL units. Annex-B start codes and AVCC lengths both work.
pub fn split_nals(access_unit: &[u8]) -> Vec<Vec<u8>> {
    if access_unit.is_empty() {
        return Vec::new();
    }
    if access_unit.windows(3).any(|win| win == [0, 0, 1]) {
        return split_annex_b(access_unit);
    }
    if let Some(nals) = split_avcc(access_unit) {
        return nals;
    }
    vec![access_unit.to_vec()]
}

fn split_annex_b(bytes: &[u8]) -> Vec<Vec<u8>> {
    let mut starts = Vec::new();
    let mut index = 0;
    while index + 3 < bytes.len() {
        if bytes[index..].starts_with(&[0, 0, 0, 1]) {
            starts.push(index + 4);
            index += 4;
        } else if bytes[index..].starts_with(&[0, 0, 1]) {
            starts.push(index + 3);
            index += 3;
        } else {
            index += 1;
        }
    }
    let mut nals = Vec::new();
    for (offset, start) in starts.iter().copied().enumerate() {
        let end = starts.get(offset + 1).copied().unwrap_or(bytes.len());
        let mut end = end;
        if end >= 4 && bytes.get(end - 4..end) == Some(&[0, 0, 0, 1]) {
            end -= 4;
        } else if end >= 3 && bytes.get(end - 3..end) == Some(&[0, 0, 1]) {
            end -= 3;
        }
        if end > start {
            nals.push(bytes[start..end].to_vec());
        }
    }
    nals
}

fn split_avcc(bytes: &[u8]) -> Option<Vec<Vec<u8>>> {
    let mut nals = Vec::new();
    let mut offset = 0;
    while offset + 4 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[offset..offset + 4].try_into().ok()?) as usize;
        offset += 4;
        if len == 0 || offset + len > bytes.len() {
            return None;
        }
        nals.push(bytes[offset..offset + len].to_vec());
        offset += len;
    }
    if offset != bytes.len() || nals.is_empty() {
        return None;
    }
    Some(nals)
}

/// Packetize one access unit. The last packet of the unit has the RTP marker bit.
pub fn packetize_h264(
    access_unit: &[u8],
    ssrc: u32,
    payload_type: u8,
    sequence: &mut u16,
    timestamp: u32,
) -> Vec<RtpPacket> {
    let nals = split_nals(access_unit);
    let mut packets = Vec::new();
    let last = nals.len().saturating_sub(1);
    for (index, nal) in nals.iter().enumerate() {
        if nal.is_empty() {
            continue;
        }
        let marker_nal = index == last;
        packets.extend(packetize_nal(nal, ssrc, payload_type, sequence, timestamp, marker_nal));
    }
    packets
}

fn packetize_nal(
    nal: &[u8],
    ssrc: u32,
    payload_type: u8,
    sequence: &mut u16,
    timestamp: u32,
    marker_nal: bool,
) -> Vec<RtpPacket> {
    if nal.len() <= MAX_RTP_PAYLOAD {
        let seq = *sequence;
        *sequence = sequence.wrapping_add(1);
        let header = video_header(seq, timestamp, ssrc, payload_type, marker_nal);
        return vec![RtpPacket {
            sequence: seq,
            timestamp,
            marker: marker_nal,
            header: header.to_vec(),
            payload: nal.to_vec(),
        }];
    }
    let nal_header = nal[0];
    let nal_type = nal_header & 0x1f;
    let fu_indicator = (nal_header & 0xe0) | FU_A;
    let body = &nal[1..];
    let chunk = MAX_RTP_PAYLOAD.saturating_sub(2).max(1);
    let mut packets = Vec::new();
    let mut offset = 0;
    while offset < body.len() {
        let end = (offset + chunk).min(body.len());
        let start = offset == 0;
        let finish = end == body.len();
        let mut fu_header = nal_type & 0x1f;
        if start {
            fu_header |= 0x80;
        }
        if finish {
            fu_header |= 0x40;
        }
        let mut payload = Vec::with_capacity(2 + (end - offset));
        payload.push(fu_indicator);
        payload.push(fu_header);
        payload.extend_from_slice(&body[offset..end]);
        let marker = marker_nal && finish;
        let seq = *sequence;
        *sequence = sequence.wrapping_add(1);
        let header = video_header(seq, timestamp, ssrc, payload_type, marker);
        packets.push(RtpPacket {
            sequence: seq,
            timestamp,
            marker,
            header: header.to_vec(),
            payload,
        });
        offset = end;
    }
    packets
}

/// Rebuild Annex-B access units from RTP payloads. FU-A fragments stay buffered
/// until the end bit arrives.
#[derive(Debug, Default)]
pub struct H264Assembler {
    nal: Vec<u8>,
    open: bool,
    unit: Vec<u8>,
}

impl H264Assembler {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, payload: &[u8], marker: bool) -> Option<Vec<u8>> {
        if payload.is_empty() {
            return None;
        }
        let nal_type = payload[0] & 0x1f;
        if nal_type == FU_A {
            if payload.len() < 2 {
                return None;
            }
            let fu = payload[1];
            let start = fu & 0x80 != 0;
            let end = fu & 0x40 != 0;
            let reconstructed = (payload[0] & 0xe0) | (fu & 0x1f);
            if start {
                self.nal.clear();
                self.nal.push(reconstructed);
                self.open = true;
            }
            if self.open {
                self.nal.extend_from_slice(&payload[2..]);
            }
            if end && self.open {
                self.open = false;
                let nal = std::mem::take(&mut self.nal);
                self.push_nal(nal);
            }
        } else if nal_type > 0 && nal_type < 24 {
            self.push_nal(payload.to_vec());
        }
        if marker && !self.unit.is_empty() {
            return Some(std::mem::take(&mut self.unit));
        }
        None
    }

    fn push_nal(&mut self, nal: Vec<u8>) {
        if nal.is_empty() {
            return;
        }
        self.unit.extend_from_slice(&[0, 0, 0, 1]);
        self.unit.extend_from_slice(&nal);
    }
}

/// 90 kHz timestamp step for one frame.
pub fn video_timestamp_step(fps: u8) -> u32 {
    let fps = u32::from(fps.max(1));
    90_000 / fps
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RtcpFeedback {
    Pli { media_ssrc: u32 },
    Nack { media_ssrc: u32, sequences: Vec<u16> },
}

pub fn build_pli(sender_ssrc: u32, media_ssrc: u32) -> Vec<u8> {
    let mut packet = vec![0u8; 12];
    packet[0] = 0x81;
    packet[1] = 206;
    packet[2..4].copy_from_slice(&2u16.to_be_bytes());
    packet[4..8].copy_from_slice(&sender_ssrc.to_be_bytes());
    packet[8..12].copy_from_slice(&media_ssrc.to_be_bytes());
    packet
}

pub fn build_nack(sender_ssrc: u32, media_ssrc: u32, sequences: &[u16]) -> Vec<u8> {
    let mut sorted = sequences.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let mut blocks: Vec<(u16, u16)> = Vec::new();
    for seq in sorted {
        if let Some((pid, blp)) = blocks.last_mut() {
            let delta = seq.wrapping_sub(*pid);
            if (1..=16).contains(&delta) {
                *blp |= 1 << (delta - 1);
                continue;
            }
        }
        blocks.push((seq, 0));
    }
    let length = (2 + blocks.len()) as u16;
    let mut packet = Vec::with_capacity(12 + blocks.len() * 4);
    packet.push(0x81);
    packet.push(205);
    packet.extend_from_slice(&length.to_be_bytes());
    packet.extend_from_slice(&sender_ssrc.to_be_bytes());
    packet.extend_from_slice(&media_ssrc.to_be_bytes());
    for (pid, blp) in blocks {
        packet.extend_from_slice(&pid.to_be_bytes());
        packet.extend_from_slice(&blp.to_be_bytes());
    }
    packet
}

pub fn parse_rtcp(packet: &[u8]) -> Vec<RtcpFeedback> {
    let mut out = Vec::new();
    let mut offset = 0;
    while offset + 8 <= packet.len() {
        let word = u16::from_be_bytes([packet[offset + 2], packet[offset + 3]]) as usize;
        let size = (word + 1) * 4;
        if offset + size > packet.len() {
            break;
        }
        let body = &packet[offset..offset + size];
        let fmt = body[0] & 0x1f;
        let pt = body[1];
        if body.len() >= 12 {
            let media = u32::from_be_bytes([body[8], body[9], body[10], body[11]]);
            if pt == 206 && fmt == 1 {
                out.push(RtcpFeedback::Pli { media_ssrc: media });
            } else if pt == 205 && fmt == 1 {
                let mut sequences = Vec::new();
                let mut cursor = 12;
                while cursor + 4 <= body.len() {
                    let pid = u16::from_be_bytes([body[cursor], body[cursor + 1]]);
                    let blp = u16::from_be_bytes([body[cursor + 2], body[cursor + 3]]);
                    sequences.push(pid);
                    for bit in 0..16 {
                        if blp & (1 << bit) != 0 {
                            sequences.push(pid.wrapping_add(bit + 1));
                        }
                    }
                    cursor += 4;
                }
                if !sequences.is_empty() {
                    out.push(RtcpFeedback::Nack { media_ssrc: media, sequences });
                }
            }
        }
        offset += size;
    }
    out
}

/// RTCP uses the first 8 bytes as additional data, then the same AEAD tag and
/// 4-byte nonce suffix as voice RTP.
pub fn encrypt_rtcp(mode: CipherMode, key: &[u8; 32], packet: &[u8], nonce: u32) -> Result<Vec<u8>, ()> {
    if packet.len() < 8 {
        return Err(());
    }
    let (header, body) = packet.split_at(8);
    encrypt_voice(mode, key, header, body, nonce)
}

pub fn decrypt_rtcp(mode: CipherMode, key: &[u8; 32], packet: &[u8]) -> Result<Vec<u8>, ()> {
    if packet.len() < 8 + 16 + 4 {
        return Err(());
    }
    let header = &packet[..8];
    let mut counter = [0u8; 4];
    counter.copy_from_slice(&packet[packet.len() - 4..]);
    let cipher_text = &packet[8..packet.len() - 4];
    let body = open_rtcp(mode, key, header, cipher_text, &counter)?;
    let mut full = header.to_vec();
    full.extend_from_slice(&body);
    Ok(full)
}

fn open_rtcp(mode: CipherMode, key: &[u8; 32], header: &[u8], cipher_text: &[u8], counter: &[u8; 4]) -> Result<Vec<u8>, ()> {
    use aes_gcm::aead::{Aead, Payload};
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce as AesNonce};
    use chacha20poly1305::{XChaCha20Poly1305, XNonce};
    match mode {
        CipherMode::Aes256GcmRtpSize => {
            let mut raw = [0u8; 12];
            raw[..4].copy_from_slice(counter);
            let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
            cipher
                .decrypt(AesNonce::from_slice(&raw), Payload { msg: cipher_text, aad: header })
                .map_err(|_| ())
        }
        CipherMode::XChaCha20Poly1305RtpSize => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(counter);
            let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| ())?;
            cipher
                .decrypt(XNonce::from_slice(&raw), Payload { msg: cipher_text, aad: header })
                .map_err(|_| ())
        }
        _ => Err(()),
    }
}

pub fn encrypt_rtp(mode: CipherMode, key: &[u8; 32], header: &[u8], payload: &[u8], nonce: u32) -> Result<Vec<u8>, ()> {
    encrypt_voice(mode, key, header, payload, nonce)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SharePreset {
    /// 720, 1080, 1440, 2160, or 0 for the capture's own size.
    pub height: u32,
    pub fps: u8,
}

pub fn snap_share_height(value: &str) -> u32 {
    match value.trim().to_ascii_lowercase().as_str() {
        "720" | "720p" => 720,
        "1080" | "1080p" => 1080,
        "1440" | "1440p" => 1440,
        "2160" | "2160p" | "4k" => 2160,
        "source" => 0,
        _ => 1080,
    }
}

pub fn snap_share_fps(value: u8) -> u8 {
    match value {
        15 => 15,
        60 => 60,
        _ => 30,
    }
}

pub fn preset_size(height: u32) -> (u32, u32) {
    match height {
        720 => (1280, 720),
        1440 => (2560, 1440),
        2160 => (3840, 2160),
        _ => (1920, 1080),
    }
}

/// Even capture size, capped so a 5K display does not ask the encoder for more
/// than 4K unless the user picked Source. Source keeps the capture size.
pub fn output_size(preset: SharePreset, source_w: u32, source_h: u32) -> (u32, u32) {
    if preset.height == 0 {
        return even_size(source_w.max(2), source_h.max(2));
    }
    let (width, height) = preset_size(preset.height);
    if source_w == 0 || source_h == 0 {
        return (width, height);
    }
    let scale = (width as f32 / source_w as f32).min(height as f32 / source_h as f32).min(1.0);
    even_size(((source_w as f32) * scale).round() as u32, ((source_h as f32) * scale).round() as u32)
}

fn even_size(width: u32, height: u32) -> (u32, u32) {
    let width = width.max(2) & !1;
    let height = height.max(2) & !1;
    (width, height)
}

/// Bitrate for each resolution and frame rate Discord's picker offers.
/// Source scales from the 1080p row by pixel count.
pub fn share_bitrate(width: u32, height: u32, fps: u8) -> u32 {
    let fps = snap_share_fps(fps);
    const TABLE: &[(u32, u8, u32)] = &[
        (720, 15, 1_500_000),
        (720, 30, 2_500_000),
        (720, 60, 4_500_000),
        (1080, 15, 2_500_000),
        (1080, 30, 4_500_000),
        (1080, 60, 6_000_000),
        (1440, 15, 4_500_000),
        (1440, 30, 8_000_000),
        (1440, 60, 10_000_000),
        (2160, 15, 8_000_000),
        (2160, 30, 15_000_000),
        (2160, 60, 20_000_000),
    ];
    if let Some((_, _, bitrate)) = TABLE.iter().find(|(row, rate, _)| *row == height && *rate == fps) {
        return *bitrate;
    }
    let reference = 4_500_000u64 * u64::from(width.max(2)) * u64::from(height.max(2)) / (1920 * 1080);
    let scaled = reference * u64::from(fps) / 30;
    scaled.clamp(800_000, 25_000_000) as u32
}

pub fn preset_bitrate(preset: SharePreset, source_w: u32, source_h: u32) -> u32 {
    let (width, height) = output_size(preset, source_w, source_h);
    if preset.height == 0 {
        share_bitrate(width, height, preset.fps)
    } else {
        share_bitrate(preset_size(preset.height).0, preset.height, preset.fps)
    }
}

/// One step down: 60 → 30 → 15, then the next smaller resolution at 60.
/// 720p15 stays put. `game_mode` is ignored on purpose.
pub fn adapt_preset(preset: SharePreset, game_mode: bool) -> (SharePreset, Option<String>) {
    let _game_mode = game_mode;
    let next = step_down(preset);
    if next == preset {
        return (preset, Some("720p at 15 fps is as low as this stream goes.".into()));
    }
    let from = preset_label(preset);
    let to = preset_label(next);
    (
        next,
        Some(format!("The encoder or uplink could not hold {from}, so this stream dropped to {to}.")),
    )
}

fn step_down(preset: SharePreset) -> SharePreset {
    let height = if preset.height == 0 { 2160 } else { preset.height };
    let fps = snap_share_fps(preset.fps);
    if fps == 60 {
        return SharePreset { height, fps: 30 };
    }
    if fps == 30 {
        return SharePreset { height, fps: 15 };
    }
    let shorter = match height {
        2160 => 1440,
        1440 => 1080,
        1080 => 720,
        _ => 720,
    };
    if shorter == height {
        SharePreset { height: 720, fps: 15 }
    } else {
        SharePreset { height: shorter, fps: 60 }
    }
}

pub fn preset_label(preset: SharePreset) -> String {
    let name = if preset.height == 0 {
        "Source".to_string()
    } else {
        format!("{}p", preset.height)
    };
    format!("{name} at {} fps", snap_share_fps(preset.fps))
}

/// Frame pacing for the stream. A still screen and Game Mode both leave this alone.
pub fn stream_frame_interval_ms(fps: u8, game_mode: bool) -> u64 {
    let _game_mode = game_mode;
    1000 / u64::from(snap_share_fps(fps).max(1))
}

/// The stream encoder is its own session: CBR, no B-frames, a short IDR period.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamEncoderProfile {
    pub cbr: bool,
    pub b_frames: u8,
    pub low_latency: bool,
    pub idr_interval_frames: u32,
}

pub fn stream_encoder_profile(fps: u8) -> StreamEncoderProfile {
    let fps = u32::from(snap_share_fps(fps));
    StreamEncoderProfile {
        cbr: true,
        b_frames: 0,
        low_latency: true,
        idr_interval_frames: fps.saturating_mul(2).max(2),
    }
}

pub fn preferred_encoder(os: &str, choice: &str) -> &'static str {
    let choice = choice.trim().to_ascii_lowercase();
    match (os, choice.as_str()) {
        ("macos", "videotoolbox") => "videotoolbox",
        ("windows", "nvenc") => "nvenc",
        ("windows", "amf") => "amf",
        ("windows", "qsv") => "qsv",
        ("windows", "media-foundation") => "media-foundation",
        _ => "auto",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; 32] {
        let mut key = [7u8; 32];
        key[0] = 1;
        key
    }

    #[test]
    fn gateway_ops_create_pause_and_delete_a_guild_stream() {
        let key = stream_key(StreamKind::Guild, Some("10"), "20", "30");
        assert_eq!(key, "guild:10:20:30");
        assert_eq!(
            parse_stream_key(&key),
            Some((StreamKind::Guild, "10".into(), "20".into(), "30".into()))
        );
        let call = stream_key(StreamKind::Call, None, "20", "30");
        assert_eq!(call, "call:20:30");
        let create = stream_create_payload(StreamKind::Guild, Some("10"), "20");
        assert!(create.contains("\"op\":18"));
        assert!(create.contains("\"type\":\"guild\""));
        assert!(create.contains("\"guild_id\":\"10\""));
        assert!(create.contains("\"preferred_region\":null"));
        let dm = stream_create_payload(StreamKind::Call, None, "20");
        assert!(dm.contains("\"type\":\"call\""));
        assert!(dm.contains("\"guild_id\":null"));
        let paused = stream_set_paused_payload(&key, true);
        assert!(paused.contains("\"op\":22"));
        assert!(paused.contains("\"paused\":true"));
        let delete = stream_delete_payload(&key);
        assert!(delete.contains("\"op\":19"));
        assert!(delete.contains(&key));
        let watch = stream_watch_payload(&key);
        assert!(watch.contains("\"op\":20"));
    }

    #[test]
    fn dispatches_carry_the_stream_server() {
        let create = parse_stream_dispatch(
            "STREAM_CREATE",
            &serde_json::json!({"stream_key": "guild:1:2:3", "paused": false, "region": "us-east"}),
        );
        assert!(matches!(create, Some(StreamDispatch::Create { paused: false, .. })));
        let server = parse_stream_dispatch(
            "STREAM_SERVER_UPDATE",
            &serde_json::json!({"stream_key": "guild:1:2:3", "endpoint": "a.discord.media:443", "token": "tok", "guild_id": "1"}),
        );
        match server {
            Some(StreamDispatch::Server { endpoint, token, .. }) => {
                assert_eq!(endpoint, "a.discord.media:443");
                assert_eq!(token, "tok");
            }
            other => panic!("unexpected {other:?}"),
        }
        assert!(parse_stream_dispatch(
            "STREAM_SERVER_UPDATE",
            &serde_json::json!({"stream_key": "guild:1:2:3", "endpoint": "", "token": "tok"})
        )
        .is_none());
        assert!(matches!(
            parse_stream_dispatch("STREAM_UPDATE", &serde_json::json!({"stream_key": "call:2:3", "paused": true})),
            Some(StreamDispatch::Update { paused: true, .. })
        ));
        assert!(matches!(
            parse_stream_dispatch("STREAM_DELETE", &serde_json::json!({"stream_key": "call:2:3"})),
            Some(StreamDispatch::Delete { .. })
        ));
    }

    #[test]
    fn identify_and_codecs_negotiate_h264_and_the_optional_set() {
        let identify = stream_identify("10", "30", "sess", "tok", true);
        assert!(identify.contains("\"op\":0"));
        assert!(identify.contains("\"video\":true"));
        assert!(identify.contains("\"max_dave_protocol_version\":1"));
        assert!(identify.contains("\"rid\":\"100\""));
        let watch = stream_identify("10", "30", "sess", "tok", false);
        assert!(!watch.contains("\"streams\""));
        let select = stream_select_protocol("203.0.113.8", 50_000, CipherMode::Aes256GcmRtpSize, CodecSupport::watch());
        assert!(select.contains("\"op\":1"));
        assert!(select.contains("aead_aes256_gcm_rtpsize"));
        for name in ["opus", "H264", "VP8", "VP9", "AV1"] {
            assert!(select.contains(name), "{name} missing");
        }
        assert!(select.contains("\"payload_type\":101"));
        assert!(select.contains("\"rtx_payload_type\":102"));
        let h264_only = stream_codecs(CodecSupport { vp8: false, vp9: false, av1: false });
        assert_eq!(h264_only.len(), 2);
        assert!(h264_only.iter().any(|codec| codec.name == "H264" && codec.encode && codec.decode));
    }

    #[test]
    fn video_attributes_use_opcode_12_and_distinct_ssrcs() {
        let ready = serde_json::json!({"ssrc": 50});
        let (audio, video, rtx) = ssrcs_from_ready(&ready).unwrap();
        assert_eq!(audio, 50);
        assert_ne!(video, audio);
        assert_ne!(rtx, audio);
        assert_ne!(video, rtx);
        let assigned = serde_json::json!({"ssrc": 50, "streams": [{"ssrc": 80, "rtx_ssrc": 81, "type": "video"}]});
        assert_eq!(ssrcs_from_ready(&assigned), Some((50, 80, 81)));
        let span = VideoSpan { width: 1920, height: 1080, fps: 60, bitrate: 6_000_000, active: true, preset_height: 1080 };
        let payload = video_attributes(audio, video, rtx, span);
        assert!(payload.contains("\"op\":12"));
        assert!(payload.contains("\"max_bitrate\":6000000"));
        assert!(payload.contains("\"max_framerate\":60"));
        assert!(payload.contains("\"type\":\"fixed\""));
        assert!(payload.contains("\"width\":1920"));
        assert!(payload.contains("\"rid\":\"100\""));
        assert!(payload.contains("\"active\":true"));
        let quiet = soundshare_payload(audio, true);
        assert!(quiet.contains("\"speaking\":2"));
    }

    #[test]
    fn h264_fu_a_round_trips_and_encrypts_with_the_voice_cipher() {
        let mut nal = vec![0x65];
        nal.extend(std::iter::repeat(0x11).take(3_000));
        let unit = {
            let mut annex = vec![0, 0, 0, 1];
            annex.extend_from_slice(&nal);
            annex
        };
        let mut sequence = 9u16;
        let packets = packetize_h264(&unit, 77, 101, &mut sequence, 90_000);
        assert!(packets.len() > 2);
        assert!(packets.iter().rev().skip(1).all(|packet| !packet.marker));
        assert!(packets.last().unwrap().marker);
        assert_eq!(packets[0].payload[0] & 0x1f, FU_A);
        assert_ne!(packets[0].payload[1] & 0x80, 0);
        assert_ne!(packets.last().unwrap().payload[1] & 0x40, 0);
        assert_eq!(packets[0].header[1] & 0x7f, 101);
        assert_eq!(packets.last().unwrap().header[1] & 0x80, 0x80);
        let mut asm = H264Assembler::new();
        let mut rebuilt = None;
        for packet in &packets {
            rebuilt = asm.push(&packet.payload, packet.marker).or(rebuilt);
        }
        let rebuilt = rebuilt.expect("access unit");
        assert!(rebuilt.starts_with(&[0, 0, 0, 1]));
        assert_eq!(&rebuilt[4..], nal.as_slice());

        let small = packetize_h264(&[0x67, 0x42, 0x00], 77, 101, &mut sequence, 90_000);
        assert_eq!(small.len(), 1);
        assert!(small[0].marker);
        assert_eq!(small[0].payload[0] & 0x1f, 7);

        let mode = CipherMode::Aes256GcmRtpSize;
        let encrypted = encrypt_rtp(mode, &key(), &packets[0].header, &packets[0].payload, 4).unwrap();
        let opened = super::super::voice::decrypt_voice(mode, &key(), &encrypted).unwrap();
        assert_eq!(opened, packets[0].payload);
    }

    #[test]
    fn rtcp_pli_and_nack_round_trip_under_the_same_aead() {
        let pli = build_pli(9, 77);
        assert_eq!(pli[1], 206);
        assert!(matches!(parse_rtcp(&pli)[0], RtcpFeedback::Pli { media_ssrc: 77 }));
        let nack = build_nack(9, 77, &[10, 12, 11, 40]);
        assert_eq!(nack[1], 205);
        match &parse_rtcp(&nack)[0] {
            RtcpFeedback::Nack { sequences, .. } => {
                assert!(sequences.contains(&10));
                assert!(sequences.contains(&11));
                assert!(sequences.contains(&12));
                assert!(sequences.contains(&40));
            }
            other => panic!("unexpected {other:?}"),
        }
        let mode = CipherMode::XChaCha20Poly1305RtpSize;
        let sealed = encrypt_rtcp(mode, &key(), &pli, 8).unwrap();
        let opened = decrypt_rtcp(mode, &key(), &sealed).unwrap();
        assert_eq!(opened, pli);
    }

    #[test]
    fn bitrate_table_scales_with_resolution_and_frame_rate() {
        let heights = [720u32, 1080, 1440, 2160];
        let rates = [15u8, 30, 60];
        for height in heights {
            let (width, _) = preset_size(height);
            let mut previous = 0;
            for fps in rates {
                let bitrate = share_bitrate(width, height, fps);
                assert!(bitrate > previous, "{height}p {fps} should exceed the slower rate");
                previous = bitrate;
            }
        }
        for fps in rates {
            let mut previous = 0;
            for height in heights {
                let bitrate = share_bitrate(preset_size(height).0, height, fps);
                assert!(bitrate > previous, "{height}p should exceed the smaller frame at {fps}");
                previous = bitrate;
            }
        }
        assert_eq!(share_bitrate(1920, 1080, 60), 6_000_000);
        assert_eq!(share_bitrate(1280, 720, 30), 2_500_000);
        assert_eq!(share_bitrate(3840, 2160, 60), 20_000_000);
        let source = share_bitrate(2560, 1600, 30);
        assert!(source > share_bitrate(1920, 1080, 30));
        assert_eq!(snap_share_height("source"), 0);
        assert_eq!(snap_share_fps(15), 15);
        assert_eq!(snap_share_fps(45), 30);
    }

    #[test]
    fn adaptation_steps_down_and_ignores_game_mode() {
        let start = SharePreset { height: 1080, fps: 60 };
        let (next, note) = adapt_preset(start, true);
        assert_eq!(next, SharePreset { height: 1080, fps: 30 });
        assert!(note.unwrap().contains("1080p at 30 fps"));
        let (again, _) = adapt_preset(next, false);
        assert_eq!(again.fps, 15);
        let (dropped, _) = adapt_preset(SharePreset { height: 1080, fps: 15 }, true);
        assert_eq!(dropped, SharePreset { height: 720, fps: 60 });
        let floor = SharePreset { height: 720, fps: 15 };
        let (stays, note) = adapt_preset(floor, true);
        assert_eq!(stays, floor);
        assert!(note.unwrap().contains("720p"));
        assert_eq!(stream_frame_interval_ms(60, true), stream_frame_interval_ms(60, false));
        assert_eq!(stream_frame_interval_ms(30, true), 33);
        assert_eq!(stream_frame_interval_ms(15, false), 66);
        let profile = stream_encoder_profile(60);
        assert!(profile.cbr);
        assert_eq!(profile.b_frames, 0);
        assert!(profile.low_latency);
        assert_eq!(profile.idr_interval_frames, 120);
        assert_eq!(preferred_encoder("windows", "nvenc"), "nvenc");
        assert_eq!(preferred_encoder("macos", "nvenc"), "auto");
        assert_eq!(preferred_encoder("macos", "videotoolbox"), "videotoolbox");
    }
}
