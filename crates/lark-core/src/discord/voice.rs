//! Discord voice transport: UDP discovery, RTP, and the transport ciphers.
//!
//! Preferred mode is `aead_aes256_gcm_rtpsize`, then `aead_xchacha20_poly1305_rtpsize`.
//! Discord removed the legacy XSalsa20 modes; selecting one closes the gateway with
//! 4016. AEAD nonces are a 32-bit counter appended to the packet and padded with zeros.
//! The XSalsa helpers remain so an already-captured packet can still be decoded.

use std::time::Duration;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce as AesNonce};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::Rng;
use xsalsa20poly1305::aead::Aead as XSalsaAead;
use xsalsa20poly1305::{Nonce as XSalsaNonce, XSalsa20Poly1305};

pub const OPUS_SILENCE: &[u8] = &[0xF8, 0xFF, 0xFE];
pub const VOICE_GATEWAY_VERSION: &str = "8";
/// Highest DAVE protocol version this client can negotiate. Zero means "no DAVE",
/// which the voice gateway now rejects with close code 4017.
pub const MAX_DAVE_PROTOCOL_VERSION: u16 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CipherMode {
    Aes256GcmRtpSize,
    XChaCha20Poly1305RtpSize,
    XSalsa20Poly1305Lite,
    XSalsa20Poly1305Suffix,
    XSalsa20Poly1305,
}

impl CipherMode {
    pub fn name(self) -> &'static str {
        match self {
            Self::Aes256GcmRtpSize => "aead_aes256_gcm_rtpsize",
            Self::XChaCha20Poly1305RtpSize => "aead_xchacha20_poly1305_rtpsize",
            Self::XSalsa20Poly1305Lite => "xsalsa20_poly1305_lite",
            Self::XSalsa20Poly1305Suffix => "xsalsa20_poly1305_suffix",
            Self::XSalsa20Poly1305 => "xsalsa20_poly1305",
        }
    }

    fn suffix_len(self) -> usize {
        match self {
            Self::XSalsa20Poly1305Suffix => 24,
            Self::XSalsa20Poly1305 => 0,
            _ => 4,
        }
    }
}

/// Prefer AES-GCM, then XChaCha20. XSalsa20 is no longer a voice mode Discord accepts.
pub fn choose_mode(offered: &[String]) -> Option<CipherMode> {
    const ORDER: &[(&str, CipherMode)] = &[
        ("aead_aes256_gcm_rtpsize", CipherMode::Aes256GcmRtpSize),
        ("aead_xchacha20_poly1305_rtpsize", CipherMode::XChaCha20Poly1305RtpSize),
    ];
    ORDER.iter().find_map(|(name, mode)| {
        if offered.iter().any(|item| item == name) {
            Some(*mode)
        } else {
            None
        }
    })
}

pub fn rtp_header(sequence: u16, timestamp: u32, ssrc: u32) -> [u8; 12] {
    let mut header = [0u8; 12];
    header[0] = 0x80;
    header[1] = 0x78;
    header[2..4].copy_from_slice(&sequence.to_be_bytes());
    header[4..8].copy_from_slice(&timestamp.to_be_bytes());
    header[8..12].copy_from_slice(&ssrc.to_be_bytes());
    header
}

pub fn encrypt_voice(
    mode: CipherMode,
    key: &[u8; 32],
    header: &[u8],
    opus: &[u8],
    nonce: u32,
) -> Result<Vec<u8>, ()> {
    let counter = nonce.to_be_bytes();
    let mut suffix24 = [0u8; 24];
    if mode == CipherMode::XSalsa20Poly1305Suffix {
        rand::thread_rng().fill(&mut suffix24);
    }
    let cipher_text = seal(mode, key, header, opus, &counter, &suffix24)?;
    let suffix = &suffix_bytes(mode, &counter, &suffix24);
    let mut packet = Vec::with_capacity(header.len() + cipher_text.len() + suffix.len());
    packet.extend_from_slice(header);
    packet.extend_from_slice(&cipher_text);
    packet.extend_from_slice(suffix);
    Ok(packet)
}

/// One RTP-size voice packet. The speaking and audio-level extensions sit inside
/// the ciphertext. The preamble (`0xBEDE` plus one length word) stays in the clear.
pub fn encrypt_audio(
    mode: CipherMode,
    key: &[u8; 32],
    sequence: u16,
    timestamp: u32,
    ssrc: u32,
    media: &[u8],
    nonce: u32,
    speaking: bool,
) -> Result<Vec<u8>, ()> {
    if !matches!(mode, CipherMode::Aes256GcmRtpSize | CipherMode::XChaCha20Poly1305RtpSize) {
        let header = rtp_header(sequence, timestamp, ssrc);
        return encrypt_voice(mode, key, &header, media, nonce);
    }
    let mut header = rtp_header(sequence, timestamp, ssrc);
    header[0] |= 0x10;
    let mut aad = Vec::with_capacity(16);
    aad.extend_from_slice(&header);
    aad.extend_from_slice(&[0xBE, 0xDE, 0x00, 0x01]);
    let level = if speaking { 0x80 } else { 0x7F };
    let flags = if speaking { 1u32 } else { 0 };
    let ext = [0x10, level, 0x90, speaking_extension(flags)];
    let mut plain = Vec::with_capacity(4 + media.len());
    plain.extend_from_slice(&ext);
    plain.extend_from_slice(media);
    encrypt_voice(mode, key, &aad, &plain, nonce)
}

/// Discord packs the opcode 5 speaking flags into the one-byte RTP extension.
pub fn speaking_extension(flags: u32) -> u8 {
    (((flags & 0x03) << 1) | ((flags & 0x04) >> 2)) as u8
}

pub fn decrypt_voice(mode: CipherMode, key: &[u8; 32], packet: &[u8]) -> Result<Vec<u8>, ()> {
    let suffix_len = mode.suffix_len();
    if packet.len() < 12 + 16 + suffix_len {
        return Err(());
    }
    let (body, suffix) = packet.split_at(packet.len() - suffix_len);
    // RTP-size AEAD authenticates the fixed header, CSRCs, and the 4-byte
    // extension preamble. Extension elements ride inside the ciphertext.
    let aead = matches!(mode, CipherMode::Aes256GcmRtpSize | CipherMode::XChaCha20Poly1305RtpSize);
    let header_len = if aead {
        aead_aad_len(body).ok_or(())?
    } else {
        rtp_header_len(body).ok_or(())?
    };
    if body.len() < header_len + 16 {
        return Err(());
    }
    let (header, cipher_text) = body.split_at(header_len);
    let mut counter = [0u8; 4];
    let mut suffix24 = [0u8; 24];
    match mode {
        CipherMode::XSalsa20Poly1305Suffix => {
            suffix24.copy_from_slice(suffix);
        }
        CipherMode::XSalsa20Poly1305 => {}
        _ => counter.copy_from_slice(suffix),
    }
    let mut plain = open(mode, key, header, cipher_text, &counter, &suffix24)?;
    if aead {
        strip_rtp_padding(body[0], &mut plain);
        let ext = extension_payload_len(body);
        if plain.len() < ext {
            return Err(());
        }
        plain.drain(..ext);
    }
    Ok(plain)
}

/// Clear AEAD additional data: 12-byte header, CSRCs, and the extension preamble.
pub fn aead_aad_len(packet: &[u8]) -> Option<usize> {
    if packet.len() < 12 || packet[0] >> 6 != 2 {
        return None;
    }
    let cc = (packet[0] & 0x0f) as usize;
    let mut len = 12 + cc * 4;
    if packet[0] & 0x10 != 0 {
        if packet.len() < len + 4 {
            return None;
        }
        len += 4;
    }
    Some(len)
}

/// Extension element bytes that follow the preamble inside an AEAD plaintext.
pub fn extension_payload_len(packet: &[u8]) -> usize {
    if packet.len() < 12 || packet[0] >> 6 != 2 || packet[0] & 0x10 == 0 {
        return 0;
    }
    let start = 12 + (packet[0] & 0x0f) as usize * 4;
    if packet.len() < start + 4 {
        return 0;
    }
    u16::from_be_bytes([packet[start + 2], packet[start + 3]]) as usize * 4
}

fn strip_rtp_padding(flags: u8, plain: &mut Vec<u8>) {
    if flags & 0x20 == 0 || plain.is_empty() {
        return;
    }
    let pad = plain.last().copied().unwrap_or(0) as usize;
    // A padding bit with a length that does not fit is not RFC padding.
    // Dropping the frame here threw away audio that had already authenticated.
    if pad == 0 || pad > plain.len() {
        return;
    }
    plain.truncate(plain.len() - pad);
}

/// RTCP packet types live in 192..=223. They share the RTP version bits.
pub fn is_rtcp(packet: &[u8]) -> bool {
    packet.len() >= 8 && packet[0] >> 6 == 2 && (192..=223).contains(&packet[1])
}

/// Discord audio uses payload type 120 (`0x78`). Other RTP-looking datagrams
/// are not a media sequence.
pub fn opus_payload(packet: &[u8]) -> bool {
    packet.len() >= 12 && packet[0] >> 6 == 2 && packet[1] & 0x7f == 0x78 && !is_rtcp(packet)
}

fn suffix_bytes<'a>(mode: CipherMode, counter: &'a [u8; 4], suffix24: &'a [u8; 24]) -> &'a [u8] {
    match mode {
        CipherMode::XSalsa20Poly1305Suffix => suffix24,
        CipherMode::XSalsa20Poly1305 => &[],
        _ => counter,
    }
}

fn seal(
    mode: CipherMode,
    key: &[u8; 32],
    header: &[u8],
    opus: &[u8],
    counter: &[u8; 4],
    suffix24: &[u8; 24],
) -> Result<Vec<u8>, ()> {
    match mode {
        CipherMode::Aes256GcmRtpSize => {
            let mut raw = [0u8; 12];
            raw[..4].copy_from_slice(counter);
            let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
            cipher
                .encrypt(AesNonce::from_slice(&raw), Payload { msg: opus, aad: header })
                .map_err(|_| ())
        }
        CipherMode::XChaCha20Poly1305RtpSize => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(counter);
            let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| ())?;
            cipher
                .encrypt(XNonce::from_slice(&raw), Payload { msg: opus, aad: header })
                .map_err(|_| ())
        }
        CipherMode::XSalsa20Poly1305Lite => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(counter);
            xsalsa(key, &raw, opus)
        }
        CipherMode::XSalsa20Poly1305Suffix => xsalsa(key, suffix24, opus),
        CipherMode::XSalsa20Poly1305 => {
            let mut raw = [0u8; 24];
            let n = header.len().min(12);
            raw[..n].copy_from_slice(&header[..n]);
            xsalsa(key, &raw, opus)
        }
    }
}

fn open(
    mode: CipherMode,
    key: &[u8; 32],
    header: &[u8],
    cipher_text: &[u8],
    counter: &[u8; 4],
    suffix24: &[u8; 24],
) -> Result<Vec<u8>, ()> {
    match mode {
        CipherMode::Aes256GcmRtpSize => {
            let mut raw = [0u8; 12];
            raw[..4].copy_from_slice(counter);
            let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
            cipher
                .decrypt(
                    AesNonce::from_slice(&raw),
                    Payload { msg: cipher_text, aad: header },
                )
                .map_err(|_| ())
        }
        CipherMode::XChaCha20Poly1305RtpSize => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(counter);
            let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| ())?;
            cipher
                .decrypt(
                    XNonce::from_slice(&raw),
                    Payload { msg: cipher_text, aad: header },
                )
                .map_err(|_| ())
        }
        CipherMode::XSalsa20Poly1305Lite => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(counter);
            xsalsa_open(key, &raw, cipher_text)
        }
        CipherMode::XSalsa20Poly1305Suffix => xsalsa_open(key, suffix24, cipher_text),
        CipherMode::XSalsa20Poly1305 => {
            let mut raw = [0u8; 24];
            let n = header.len().min(12);
            raw[..n].copy_from_slice(&header[..n]);
            xsalsa_open(key, &raw, cipher_text)
        }
    }
}

fn xsalsa(key: &[u8; 32], nonce: &[u8; 24], opus: &[u8]) -> Result<Vec<u8>, ()> {
    let cipher = XSalsa20Poly1305::new_from_slice(key).map_err(|_| ())?;
    XSalsaAead::encrypt(&cipher, XSalsaNonce::from_slice(nonce), opus).map_err(|_| ())
}

fn xsalsa_open(key: &[u8; 32], nonce: &[u8; 24], cipher_text: &[u8]) -> Result<Vec<u8>, ()> {
    let cipher = XSalsa20Poly1305::new_from_slice(key).map_err(|_| ())?;
    XSalsaAead::decrypt(&cipher, XSalsaNonce::from_slice(nonce), cipher_text).map_err(|_| ())
}

/// RTP size modes leave the header (and any CSRCs or extension preamble) unencrypted.
fn rtp_header_len(packet: &[u8]) -> Option<usize> {
    if packet.len() < 12 || packet[0] >> 6 != 2 {
        return None;
    }
    let cc = (packet[0] & 0x0f) as usize;
    let mut len = 12 + cc * 4;
    if packet[0] & 0x10 != 0 {
        if packet.len() < len + 4 {
            return None;
        }
        let ext_len = u16::from_be_bytes([packet[len + 2], packet[len + 3]]) as usize;
        len += 4 + ext_len * 4;
    }
    Some(len)
}

pub fn ip_discovery_request(ssrc: u32) -> [u8; 74] {
    let mut packet = [0u8; 74];
    packet[0..2].copy_from_slice(&1u16.to_be_bytes());
    packet[2..4].copy_from_slice(&70u16.to_be_bytes());
    packet[4..8].copy_from_slice(&ssrc.to_be_bytes());
    packet
}

pub fn parse_ip_discovery(packet: &[u8]) -> Option<(String, u16)> {
    if packet.len() < 74 {
        return None;
    }
    let kind = u16::from_be_bytes([packet[0], packet[1]]);
    if kind != 2 {
        return None;
    }
    let address = packet[8..72]
        .iter()
        .take_while(|byte| **byte != 0)
        .copied()
        .collect::<Vec<_>>();
    let address = String::from_utf8(address).ok()?;
    if address.is_empty() || address.len() > 64 {
        return None;
    }
    let port = u16::from_be_bytes([packet[72], packet[73]]);
    Some((address, port))
}

pub fn voice_gateway_url(endpoint: &str) -> Option<String> {
    let host = endpoint.trim().trim_end_matches('/').trim_end_matches(":443");
    if host.is_empty() || host.contains('/') || host.contains(' ') {
        return None;
    }
    Some(format!("wss://{host}/?v={VOICE_GATEWAY_VERSION}"))
}

pub fn voice_identify(server_id: &str, user_id: &str, session_id: &str, token: &str) -> String {
    serde_json::json!({
        "op": 0,
        "d": {
            "server_id": server_id,
            "user_id": user_id,
            "session_id": session_id,
            "token": token,
            "max_dave_protocol_version": MAX_DAVE_PROTOCOL_VERSION
        }
    })
    .to_string()
}

pub fn select_protocol(address: &str, port: u16, mode: CipherMode) -> String {
    serde_json::json!({
        "op": 1,
        "d": {
            "protocol": "udp",
            "data": {
                "address": address,
                "port": port,
                "mode": mode.name()
            }
        }
    })
    .to_string()
}

pub fn speaking_payload(ssrc: u32, speaking: bool, priority: bool) -> String {
    let mut flags = 0u32;
    if speaking {
        flags |= 1;
    }
    if priority {
        flags |= 1 << 2;
    }
    serde_json::json!({
        "op": 5,
        "d": { "speaking": flags, "delay": 0, "ssrc": ssrc }
    })
    .to_string()
}

pub fn voice_resume(server_id: &str, session_id: &str, token: &str, seq_ack: Option<i64>) -> String {
    serde_json::json!({
        "op": 7,
        "d": {
            "server_id": server_id,
            "session_id": session_id,
            "token": token,
            "seq_ack": seq_ack.unwrap_or(-1)
        }
    })
    .to_string()
}

/// Windows can coalesce a long sleep into one late wake. The voice task sleeps
/// at most one second, then sends Opcode 3 only when Hello's interval is due.
pub fn voice_poll_slice(wait: Duration) -> Duration {
    wait.min(Duration::from_secs(1))
}

/// Hello's `heartbeat_interval`, in milliseconds.
///
/// A zero value uses Discord's documented 41250ms example. The floor only stops
/// a 0ms clock from spinning; it does not lift a short interval up to 3 seconds.
/// Game Mode is not an input: slowing this clock drops the voice gateway.
pub fn voice_heartbeat_interval_ms(hello_ms: u64) -> u64 {
    if hello_ms == 0 {
        return 41_250;
    }
    hello_ms.clamp(250, 120_000)
}

/// The interval from Opcode 8 Hello. Ready's `heartbeat_interval` is a legacy
/// placeholder (often `1`) and must not replace Hello.
pub fn voice_interval_from_hello(hello_ms: Option<u64>, ready_ms: Option<u64>) -> u64 {
    let _ready_placeholder = ready_ms;
    voice_heartbeat_interval_ms(hello_ms.unwrap_or(0))
}

/// Close codes that will not succeed on another attempt with the same client.
pub fn voice_close_should_stop(code: u16) -> bool {
    matches!(code, 4004 | 4011 | 4012 | 4014 | 4016 | 4017 | 4020 | 4021 | 4022)
}

pub fn voice_close_error(code: u16, reason: &str) -> String {
    let reason = reason.trim();
    let detail = if reason.is_empty() {
        format!("Voice gateway closed ({code})")
    } else {
        format!("Voice gateway closed ({code}): {reason}")
    };
    if voice_close_should_stop(code) {
        format!("fatal:{detail}")
    } else {
        detail
    }
}

pub fn voice_error_should_stop(err: &str) -> bool {
    err.starts_with("fatal:")
}

/// Opcode 9 is Resumed. Opcode 13 is another member leaving. Neither ends our session.
pub fn voice_opcode_ends_session(op: i64) -> bool {
    let _ = op;
    false
}

pub fn dave_protocol_version(description: &serde_json::Value) -> u16 {
    description
        .get("dave_protocol_version")
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
        .min(u16::MAX as u64) as u16
}

/// Server binary DAVE frames are `[seq: u16be][opcode][payload]`.
pub fn parse_dave_server_binary(bytes: &[u8]) -> Option<(u16, u8, &[u8])> {
    if bytes.len() < 3 {
        return None;
    }
    let seq = u16::from_be_bytes([bytes[0], bytes[1]]);
    let opcode = bytes[2];
    if !matches!(opcode, 25 | 27 | 29 | 30) {
        return None;
    }
    Some((seq, opcode, &bytes[3..]))
}

pub fn dave_key_package_frame(package: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(1 + package.len());
    frame.push(26);
    frame.extend_from_slice(package);
    frame
}

pub fn dave_commit_welcome_frame(commit: &[u8], welcome: Option<&[u8]>) -> Vec<u8> {
    let extra = welcome.map(|bytes| bytes.len()).unwrap_or(0);
    let mut frame = Vec::with_capacity(1 + commit.len() + extra);
    frame.push(28);
    frame.extend_from_slice(commit);
    if let Some(welcome) = welcome {
        frame.extend_from_slice(welcome);
    }
    frame
}

pub fn dave_transition_ready(transition_id: u16) -> String {
    serde_json::json!({
        "op": 23,
        "d": { "transition_id": transition_id }
    })
    .to_string()
}

pub fn dave_invalid_commit(transition_id: u16) -> String {
    serde_json::json!({
        "op": 31,
        "d": { "transition_id": transition_id }
    })
    .to_string()
}

pub fn voice_heartbeat(now_ms: u64, seq_ack: Option<i64>) -> String {
    serde_json::json!({
        "op": 3,
        "d": { "t": now_ms, "seq_ack": seq_ack.unwrap_or(-1) }
    })
    .to_string()
}

/// Energy detector for voice activity. Higher sensitivity hears quieter speech.
///
/// Sensitivity 45 is the default. Its gate sits under a quiet voice after the
/// gain cap, and above the level a gain-capped room tone can reach.
pub fn voice_active(samples: &[f32], sensitivity: u8) -> bool {
    if samples.is_empty() {
        return false;
    }
    let mut sum = 0f32;
    for sample in samples {
        sum += sample * sample;
    }
    let rms = (sum / samples.len() as f32).sqrt();
    let sensitivity = sensitivity.min(100) as f32;
    // Sensitivity 45 sits near 0.022. That is under a quiet voice after the
    // gain cap (about 0.04) and above a gain-capped room tone (about 0.004).
    let threshold = 0.04 * (1.0 - sensitivity / 100.0) + 0.0004;
    rms >= threshold
}

pub fn voice_reconnect_delay_ms(attempt: u32) -> u64 {
    let shift = attempt.min(5);
    (1_000u64 << shift).min(20_000)
}

pub fn main_voice_state(guild_id: Option<&str>, channel_id: Option<&str>, mute: bool, deaf: bool) -> String {
    serde_json::json!({
        "op": 4,
        "d": {
            "guild_id": guild_id,
            "channel_id": channel_id,
            "self_mute": mute,
            "self_deaf": deaf
        }
    })
    .to_string()
}

/// Voice state that also carries camera and a stage request-to-speak timestamp.
/// `main_voice_state` stays the audio-only payload.
pub fn main_voice_state_video(
    guild_id: Option<&str>,
    channel_id: Option<&str>,
    mute: bool,
    deaf: bool,
    video: bool,
    request_to_speak: Option<&str>,
) -> String {
    let mut data = serde_json::json!({
        "guild_id": guild_id,
        "channel_id": channel_id,
        "self_mute": mute,
        "self_deaf": deaf,
        "self_video": video
    });
    if let Some(stamp) = request_to_speak {
        data["request_to_speak_timestamp"] = serde_json::json!(stamp);
    }
    serde_json::json!({ "op": 4, "d": data }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_voice_state_adds_the_camera_without_changing_the_audio_payload() {
        let audio = main_voice_state(Some("1"), Some("2"), false, false);
        assert!(audio.contains("\"self_mute\":false"));
        assert!(!audio.contains("self_video"));
        let video = main_voice_state_video(Some("1"), Some("2"), true, false, true, Some("2026-10-12T00:00:00.000Z"));
        assert!(video.contains("\"self_video\":true"));
        assert!(video.contains("request_to_speak_timestamp"));
        assert!(video.contains("\"op\":4"));
    }

    fn key() -> [u8; 32] {
        let mut key = [0u8; 32];
        for (i, byte) in key.iter_mut().enumerate() {
            *byte = i as u8;
        }
        key
    }

    #[test]
    fn prefers_aes_then_xchacha_and_rejects_removed_xsalsa() {
        assert_eq!(
            choose_mode(&["aead_xchacha20_poly1305_rtpsize".into(), "xsalsa20_poly1305".into()]),
            Some(CipherMode::XChaCha20Poly1305RtpSize)
        );
        assert_eq!(
            choose_mode(&[
                "aead_xchacha20_poly1305_rtpsize".into(),
                "aead_aes256_gcm_rtpsize".into()
            ]),
            Some(CipherMode::Aes256GcmRtpSize)
        );
        assert_eq!(
            choose_mode(&["xsalsa20_poly1305".into(), "xsalsa20_poly1305_lite".into()]),
            None
        );
        assert_eq!(choose_mode(&["xsalsa20_poly1305".into()]), None);
        assert_eq!(choose_mode(&["xsalsa20_poly1305_suffix".into()]), None);
        assert_eq!(choose_mode(&["nope".into()]), None);
    }

    #[test]
    fn every_transport_mode_round_trips_once() {
        let header = rtp_header(7, 96_000, 42);
        assert_eq!(header[0], 0x80);
        assert_eq!(header[1], 0x78);
        let opus = b"not-really-opus-but-round-trips";
        for mode in [
            CipherMode::Aes256GcmRtpSize,
            CipherMode::XChaCha20Poly1305RtpSize,
            CipherMode::XSalsa20Poly1305Lite,
            CipherMode::XSalsa20Poly1305Suffix,
            CipherMode::XSalsa20Poly1305,
        ] {
            let packet = encrypt_voice(mode, &key(), &header, opus, 9).unwrap();
            assert!(packet.starts_with(&header));
            assert_eq!(packet.windows(header.len()).filter(|win| *win == header).count(), 1);
            if mode.suffix_len() == 4 {
                assert_eq!(&packet[packet.len() - 4..], &9u32.to_be_bytes());
            }
            if mode == CipherMode::XSalsa20Poly1305Suffix {
                assert_eq!(packet.len(), header.len() + opus.len() + 16 + 24);
            }
            let plain = decrypt_voice(mode, &key(), &packet).unwrap();
            assert_eq!(plain, opus);
        }
    }

    #[test]
    fn aead_rtpsize_encrypts_extension_elements_and_returns_only_opus() {
        let mut header = rtp_header(4, 960, 99);
        header[0] |= 0x10;
        header[0] |= 0x01;
        let mut aad = header.to_vec();
        aad.extend_from_slice(&77u32.to_be_bytes());
        aad.extend_from_slice(&[0xBE, 0xDE, 0x00, 0x01]);
        let ext = [0x10u8, 0x80, 0x90, 0x02];
        let opus = b"opus-after-the-extension";
        let mut plain = ext.to_vec();
        plain.extend_from_slice(opus);
        for mode in [CipherMode::Aes256GcmRtpSize, CipherMode::XChaCha20Poly1305RtpSize] {
            let packet = encrypt_voice(mode, &key(), &aad, &plain, 7).unwrap();
            assert_eq!(aead_aad_len(&packet).unwrap(), aad.len());
            assert_eq!(extension_payload_len(&packet), 4);
            assert_eq!(decrypt_voice(mode, &key(), &packet).unwrap(), opus);
        }
        let mut padded = plain.clone();
        padded.extend_from_slice(&[0, 0, 3]);
        let mut padded_header = aad.clone();
        padded_header[0] |= 0x20;
        let packet = encrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &padded_header, &padded, 8).unwrap();
        assert_eq!(decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &packet).unwrap(), opus);
        let mut marked = rtp_header(9, 960, 5);
        marked[0] |= 0x20;
        let odd = b"abc\xff";
        let odd_packet = encrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &marked, odd, 11).unwrap();
        assert_eq!(decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &odd_packet).unwrap(), odd);
        assert!(is_rtcp(&[0x80, 200, 0, 1, 0, 0, 0, 1]));
        assert!(!is_rtcp(&header));
        assert!(opus_payload(&packet));
        assert!(!opus_payload(&[0x80, 0x00, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]));
        let packet = encrypt_audio(CipherMode::Aes256GcmRtpSize, &key(), 4, 960, 42, opus, 3, true).unwrap();
        assert_eq!(packet[0] & 0x10, 0x10);
        assert_eq!(extension_payload_len(&packet), 4);
        assert_eq!(decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &packet).unwrap(), opus);
        let quiet = encrypt_audio(CipherMode::XChaCha20Poly1305RtpSize, &key(), 5, 1_920, 42, opus, 4, false).unwrap();
        assert_eq!(decrypt_voice(CipherMode::XChaCha20Poly1305RtpSize, &key(), &quiet).unwrap(), opus);
    }

    #[test]
    fn discovery_packet_and_voice_url() {
        let packet = ip_discovery_request(99);
        assert_eq!(&packet[0..2], &1u16.to_be_bytes());
        assert_eq!(&packet[2..4], &70u16.to_be_bytes());
        let mut response = packet;
        response[0..2].copy_from_slice(&2u16.to_be_bytes());
        let address = b"203.0.113.8";
        response[8..8 + address.len()].copy_from_slice(address);
        response[72..74].copy_from_slice(&50_000u16.to_be_bytes());
        assert_eq!(
            parse_ip_discovery(&response).unwrap(),
            ("203.0.113.8".into(), 50_000)
        );
        assert_eq!(voice_poll_slice(Duration::from_secs(41)), Duration::from_secs(1));
        assert_eq!(voice_poll_slice(Duration::from_millis(200)), Duration::from_millis(200));
        assert_eq!(
            voice_gateway_url("example.discord.gg:443").unwrap(),
            "wss://example.discord.gg/?v=8"
        );
        assert!(voice_gateway_url("").is_none());
    }

    #[test]
    fn payloads_stay_on_the_voice_opcodes() {
        let identify = voice_identify("g", "u", "s", "tok");
        assert!(identify.contains("\"op\":0"));
        assert!(identify.contains("tok"));
        assert!(identify.contains("\"max_dave_protocol_version\":1"));
        assert!(!identify.contains("\"max_dave_protocol_version\":0"));
        let select = select_protocol("203.0.113.8", 50_000, CipherMode::Aes256GcmRtpSize);
        assert!(select.contains("aead_aes256_gcm_rtpsize"));
        assert!(select.contains("\"protocol\":\"udp\""));
        let speaking = speaking_payload(42, true, false);
        assert!(speaking.contains("\"speaking\":1"));
        let quiet = speaking_payload(42, false, false);
        assert!(quiet.contains("\"speaking\":0"));
        let resume = voice_resume("g", "s", "tok", Some(3));
        assert!(resume.contains("\"op\":7"));
        assert!(resume.contains("\"seq_ack\":3"));
        let state = main_voice_state(Some("g"), None, true, false);
        assert!(state.contains("\"op\":4"));
        assert!(state.contains("\"self_mute\":true"));
    }

    #[test]
    fn activity_and_reconnect_are_bounded() {
        let loud = vec![0.2f32; 48];
        let quiet = vec![0.001f32; 48];
        assert!(voice_active(&loud, 10));
        assert!(!voice_active(&quiet, 10));
        assert!(voice_active(&quiet, 100));
        let speech = vec![0.08f32; 48];
        let room = vec![0.01f32; 48];
        assert!(voice_active(&speech, 45));
        assert!(!voice_active(&room, 45));
        assert!(voice_active(&vec![0.04f32; 48], 45));
        assert!(!voice_active(&vec![0.004f32; 48], 45));
        assert_eq!(speaking_extension(1), 0x02);
        assert_eq!(voice_reconnect_delay_ms(0), 1_000);
        assert_eq!(voice_reconnect_delay_ms(8), 20_000);
    }

    #[test]
    fn hello_interval_is_not_slowed_or_replaced_by_the_ready_placeholder() {
        assert_eq!(voice_interval_from_hello(Some(41_250), Some(1)), 41_250);
        assert_eq!(voice_interval_from_hello(Some(1_000), Some(1)), 1_000);
        assert_eq!(voice_interval_from_hello(None, Some(1)), 41_250);
        assert_eq!(voice_heartbeat_interval_ms(1), 250);
        assert_eq!(voice_heartbeat_interval_ms(0), 41_250);
        assert_eq!(crate::discord::gateway::heartbeat_millis(41_250), 41_250);
        assert_eq!(crate::discord::gateway::heartbeat_millis(1_000), 5_000);
    }

    #[test]
    fn fatal_voice_closes_stop_and_member_opcodes_do_not() {
        assert!(voice_close_should_stop(4017));
        assert!(voice_close_should_stop(4016));
        assert!(voice_close_should_stop(4014));
        assert!(voice_close_should_stop(4021));
        assert!(!voice_close_should_stop(4015));
        assert!(!voice_close_should_stop(4009));
        let dave = voice_close_error(4017, "E2EE/DAVE protocol required");
        assert!(voice_error_should_stop(&dave));
        assert!(dave.contains("4017"));
        assert!(!voice_error_should_stop(&voice_close_error(4015, "crashed")));
        assert!(!voice_opcode_ends_session(9));
        assert!(!voice_opcode_ends_session(13));
        assert!(!voice_opcode_ends_session(5));
    }

    #[test]
    fn dave_frames_and_session_description_version() {
        let description = serde_json::json!({"mode": "aead_aes256_gcm_rtpsize", "dave_protocol_version": 1});
        assert_eq!(dave_protocol_version(&description), 1);
        assert_eq!(dave_protocol_version(&serde_json::json!({})), 0);
        let frame = dave_key_package_frame(&[0xAA, 0xBB]);
        assert_eq!(frame, vec![26, 0xAA, 0xBB]);
        let commit = dave_commit_welcome_frame(&[1, 2], Some(&[3]));
        assert_eq!(commit, vec![28, 1, 2, 3]);
        let ready = dave_transition_ready(0);
        assert!(ready.contains("\"op\":23"));
        assert!(ready.contains("\"transition_id\":0"));
        let invalid = dave_invalid_commit(32);
        assert!(invalid.contains("\"op\":31"));
        let mut binary = vec![0x00, 0x0A, 25, 9, 8];
        assert_eq!(parse_dave_server_binary(&binary), Some((10, 25, &[9, 8][..])));
        binary[2] = 26;
        assert!(parse_dave_server_binary(&binary).is_none());
        assert!(parse_dave_server_binary(&[1, 2]).is_none());
    }

}
