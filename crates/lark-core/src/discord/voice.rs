//! Discord voice transport: UDP discovery, RTP, and the AEAD modes Discord requires.
//!
//! Preferred mode is `aead_aes256_gcm_rtpsize`. `aead_xchacha20_poly1305_rtpsize` is
//! always supported because the voice gateway guarantees it. Deprecated XSalsa modes
//! are refused. The 32-bit packet nonce is appended to the payload and placed in the
//! first bytes of the cipher nonce, with the rest zeroed.

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce as AesNonce};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};

pub const OPUS_SILENCE: &[u8] = &[0xF8, 0xFF, 0xFE];
pub const VOICE_GATEWAY_VERSION: &str = "8";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CipherMode {
    Aes256GcmRtpSize,
    XChaCha20Poly1305RtpSize,
}

impl CipherMode {
    pub fn name(self) -> &'static str {
        match self {
            Self::Aes256GcmRtpSize => "aead_aes256_gcm_rtpsize",
            Self::XChaCha20Poly1305RtpSize => "aead_xchacha20_poly1305_rtpsize",
        }
    }
}

/// Prefer AES-GCM when the voice server offers it. Otherwise require XChaCha20.
pub fn choose_mode(offered: &[String]) -> Option<CipherMode> {
    if offered.iter().any(|mode| mode == "aead_aes256_gcm_rtpsize") {
        return Some(CipherMode::Aes256GcmRtpSize);
    }
    if offered
        .iter()
        .any(|mode| mode == "aead_xchacha20_poly1305_rtpsize")
    {
        return Some(CipherMode::XChaCha20Poly1305RtpSize);
    }
    None
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
    let suffix = nonce.to_be_bytes();
    let cipher_text = match mode {
        CipherMode::Aes256GcmRtpSize => {
            let mut raw = [0u8; 12];
            raw[..4].copy_from_slice(&suffix);
            let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
            cipher
                .encrypt(
                    AesNonce::from_slice(&raw),
                    Payload {
                        msg: opus,
                        aad: header,
                    },
                )
                .map_err(|_| ())?
        }
        CipherMode::XChaCha20Poly1305RtpSize => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(&suffix);
            let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| ())?;
            cipher
                .encrypt(
                    XNonce::from_slice(&raw),
                    Payload {
                        msg: opus,
                        aad: header,
                    },
                )
                .map_err(|_| ())?
        }
    };
    let mut packet = Vec::with_capacity(header.len() + cipher_text.len() + 4);
    packet.extend_from_slice(header);
    packet.extend_from_slice(&cipher_text);
    packet.extend_from_slice(&suffix);
    Ok(packet)
}

pub fn decrypt_voice(
    mode: CipherMode,
    key: &[u8; 32],
    packet: &[u8],
) -> Result<Vec<u8>, ()> {
    if packet.len() < 12 + 16 + 4 {
        return Err(());
    }
    let (body, suffix) = packet.split_at(packet.len() - 4);
    let header_len = rtp_header_len(body).ok_or(())?;
    if body.len() < header_len + 16 {
        return Err(());
    }
    let (header, cipher_text) = body.split_at(header_len);
    let mut nonce_bytes = [0u8; 4];
    nonce_bytes.copy_from_slice(suffix);
    match mode {
        CipherMode::Aes256GcmRtpSize => {
            let mut raw = [0u8; 12];
            raw[..4].copy_from_slice(&nonce_bytes);
            let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
            cipher
                .decrypt(
                    AesNonce::from_slice(&raw),
                    Payload {
                        msg: cipher_text,
                        aad: header,
                    },
                )
                .map_err(|_| ())
        }
        CipherMode::XChaCha20Poly1305RtpSize => {
            let mut raw = [0u8; 24];
            raw[..4].copy_from_slice(&nonce_bytes);
            let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| ())?;
            cipher
                .decrypt(
                    XNonce::from_slice(&raw),
                    Payload {
                        msg: cipher_text,
                        aad: header,
                    },
                )
                .map_err(|_| ())
        }
    }
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
            "max_dave_protocol_version": 0
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

pub fn voice_heartbeat(now_ms: u64, seq_ack: Option<i64>) -> String {
    serde_json::json!({
        "op": 3,
        "d": { "t": now_ms, "seq_ack": seq_ack.unwrap_or(-1) }
    })
    .to_string()
}

/// Cheap high-pass gate. Samples under the noise floor are attenuated.
/// This is not a neural denoiser and it does not cancel echo.
pub fn suppress_noise(samples: &mut [f32]) {
    let mut prev = 0f32;
    for sample in samples.iter_mut() {
        let high = *sample - prev;
        prev = *sample;
        if high.abs() < 0.02 {
            *sample = high * 0.2;
        } else {
            *sample = high;
        }
    }
}

/// Energy detector for voice activity. Higher sensitivity hears quieter speech.
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
    let threshold = 0.12 * (1.0 - sensitivity / 100.0) + 0.0004;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; 32] {
        let mut key = [0u8; 32];
        for (i, byte) in key.iter_mut().enumerate() {
            *byte = i as u8;
        }
        key
    }

    #[test]
    fn prefers_aes_and_requires_xchacha() {
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
        assert_eq!(choose_mode(&["xsalsa20_poly1305".into()]), None);
    }

    #[test]
    fn both_required_modes_round_trip() {
        let header = rtp_header(7, 96_000, 42);
        assert_eq!(header[0], 0x80);
        assert_eq!(header[1], 0x78);
        let opus = b"not-really-opus-but-round-trips";
        for mode in [CipherMode::Aes256GcmRtpSize, CipherMode::XChaCha20Poly1305RtpSize] {
            let packet = encrypt_voice(mode, &key(), &header, opus, 9).unwrap();
            assert_eq!(&packet[packet.len() - 4..], &9u32.to_be_bytes());
            let plain = decrypt_voice(mode, &key(), &packet).unwrap();
            assert_eq!(plain, opus);
        }
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
        assert_eq!(voice_reconnect_delay_ms(0), 1_000);
        assert_eq!(voice_reconnect_delay_ms(8), 20_000);
    }

    #[test]
    fn noise_gate_quiets_a_hum() {
        let mut hum = vec![0.005f32; 32];
        suppress_noise(&mut hum);
        assert!(hum.iter().all(|sample| sample.abs() < 0.005));
        let mut spike = vec![0f32; 8];
        spike[4] = 0.4;
        suppress_noise(&mut spike);
        assert!(spike[4].abs() > 0.1);
    }
}
