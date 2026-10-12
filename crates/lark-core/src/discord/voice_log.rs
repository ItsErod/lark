//! Voice diagnostics the user can copy from Settings → Voice & Video.
//!
//! The log records handshake steps, close codes, and packet counters. It does
//! not record tokens, secret keys, or audio.

use std::sync::mpsc;

#[derive(Debug)]
pub struct VoiceLog {
    pub steps: Vec<String>,
    pub udp_in: u64,
    pub udp_out: u64,
    pub opus_in: u64,
    pub opus_out: u64,
    pub dave_open_fail: u64,
    pub dave_seal_skip: u64,
    pub close_code: Option<u16>,
    pub close_reason: String,
    pub input_error: String,
    pub output_error: String,
    pub opus_error: String,
    pub input_open: bool,
    pub output_open: bool,
    pub mode: String,
    pub dave_version: u16,
    pub heartbeat_ms: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub packets_lost: u64,
    pub jitter_ms: f64,
    pub bitrate: u64,
    pub ping_ms: u64,
    last_seq: Option<u16>,
    last_in_ms: u64,
    window_ms: u64,
    window_bytes: u64,
    pub last_opus_out: Vec<u8>,
    pub last_opus_in: Vec<u8>,
    pub inject: Option<mpsc::SyncSender<Vec<u8>>>,
}

impl Default for VoiceLog {
    fn default() -> Self {
        Self {
            steps: Vec::new(),
            udp_in: 0,
            udp_out: 0,
            opus_in: 0,
            opus_out: 0,
            dave_open_fail: 0,
            dave_seal_skip: 0,
            close_code: None,
            close_reason: String::new(),
            input_error: String::new(),
            output_error: String::new(),
            opus_error: String::new(),
            input_open: false,
            output_open: false,
            mode: String::new(),
            dave_version: 0,
            heartbeat_ms: 0,
            bytes_in: 0,
            bytes_out: 0,
            packets_lost: 0,
            jitter_ms: 0.0,
            bitrate: 0,
            ping_ms: 0,
            last_seq: None,
            last_in_ms: 0,
            window_ms: 0,
            window_bytes: 0,
            last_opus_out: Vec::new(),
            last_opus_in: Vec::new(),
            inject: None,
        }
    }
}

impl VoiceLog {
    pub fn push(&mut self, step: impl Into<String>) {
        let line = step.into();
        if self.steps.last().is_some_and(|prev| prev == &line) {
            return;
        }
        self.steps.push(line);
        if self.steps.len() > 80 {
            let extra = self.steps.len() - 80;
            self.steps.drain(..extra);
        }
    }

    pub fn note_udp_out(&mut self, bytes: usize) {
        self.udp_out = self.udp_out.saturating_add(1);
        self.bytes_out = self.bytes_out.saturating_add(bytes as u64);
        self.note_bytes(bytes as u64);
    }

    pub fn note_udp_in(&mut self, bytes: usize, seq: Option<u16>) {
        self.udp_in = self.udp_in.saturating_add(1);
        self.bytes_in = self.bytes_in.saturating_add(bytes as u64);
        self.note_bytes(bytes as u64);
        if let Some(seq) = seq {
            if let Some(prev) = self.last_seq {
                let gap = seq.wrapping_sub(prev);
                if gap > 1 {
                    self.packets_lost = self.packets_lost.saturating_add(u64::from(gap - 1));
                }
            }
            self.last_seq = Some(seq);
        }
        let now = now_ms();
        if self.last_in_ms > 0 {
            let delta = now.saturating_sub(self.last_in_ms) as f64;
            let drift = (delta - 20.0).abs();
            self.jitter_ms += (drift - self.jitter_ms) / 16.0;
        }
        self.last_in_ms = now;
    }

    pub fn note_ping(&mut self, ms: u64) {
        self.ping_ms = ms;
    }

    fn note_bytes(&mut self, bytes: u64) {
        let now = now_ms();
        if self.window_ms == 0 || now.saturating_sub(self.window_ms) >= 1000 {
            self.bitrate = self.window_bytes.saturating_mul(8);
            self.window_ms = now;
            self.window_bytes = bytes;
        } else {
            self.window_bytes = self.window_bytes.saturating_add(bytes);
        }
    }

    pub fn export(&self) -> String {
        let close = match self.close_code {
            Some(code) if self.close_reason.is_empty() => format!("{code}"),
            Some(code) => format!("{code} {}", self.close_reason),
            None => "none".into(),
        };
        let mic = device_line(self.input_open, &self.input_error);
        let speakers = device_line(self.output_open, &self.output_error);
        let opus = if self.opus_error.is_empty() { "ok".into() } else { self.opus_error.clone() };
        let dave = if self.dave_version == 0 {
            "transport only".into()
        } else {
            format!("v{}", self.dave_version)
        };
        let mut text = format!(
            "Lark voice diagnostics\n\
             mode: {mode}\n\
             dave: {dave}\n\
             heartbeat_ms: {beat}\n\
             udp in: {udp_in}\n\
             udp out: {udp_out}\n\
             opus in: {opus_in}\n\
             opus out: {opus_out}\n\
             dave open failures: {open_fail}\n\
             dave seal skipped: {seal_skip}\n\
             close: {close}\n\
             microphone: {mic}\n\
             speakers: {speakers}\n\
             opus: {opus}\n\
             packets: {packets}\n\
             bitrate: {bitrate}\n\
             loss: {loss}\n\
             jitter_ms: {jitter:.1}\n\
             ping_ms: {ping}\n\
             Game Mode does not scale the voice heartbeat. The socket wakes at least once a second so a coalesced timer still sends Opcode 3 on Hello's interval.\n\
             Voice does not launch PowerShell, cmd, or reg.exe. The Defender change does not alter the voice path.\n\
             steps:\n",
            packets = self.udp_in.saturating_add(self.udp_out),
            bitrate = self.bitrate,
            loss = self.packets_lost,
            jitter = self.jitter_ms,
            ping = self.ping_ms,
            mode = if self.mode.is_empty() { "none" } else { self.mode.as_str() },
            beat = self.heartbeat_ms,
            udp_in = self.udp_in,
            udp_out = self.udp_out,
            opus_in = self.opus_in,
            opus_out = self.opus_out,
            open_fail = self.dave_open_fail,
            seal_skip = self.dave_seal_skip,
        );
        if self.steps.is_empty() {
            text.push_str("- no voice attempt yet\n");
        } else {
            for step in &self.steps {
                text.push_str("- ");
                text.push_str(step);
                text.push('\n');
            }
        }
        text
    }
}

pub fn rtp_seq(packet: &[u8]) -> Option<u16> {
    if packet.len() < 4 || packet[0] >> 6 != 2 {
        return None;
    }
    Some(u16::from_be_bytes([packet[2], packet[3]]))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn device_line(open: bool, error: &str) -> String {
    if !error.is_empty() {
        format!("closed ({error})")
    } else if open {
        "open".into()
    } else {
        "not opened".into()
    }
}

pub fn log_step(log: &impl std::ops::Deref<Target = std::sync::Mutex<VoiceLog>>, step: impl Into<String>) {
    if let Ok(mut guard) = log.lock() {
        guard.push(step);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_keeps_the_header_and_appends_link_stats() {
        let mut log = VoiceLog::default();
        log.note_udp_out(100);
        log.note_udp_in(120, Some(1));
        log.note_udp_in(120, Some(4));
        log.note_ping(28);
        let text = log.export();
        assert!(text.starts_with("Lark voice diagnostics"));
        assert!(text.contains("packets: 3"));
        assert!(text.contains("loss: 2"));
        assert!(text.contains("ping_ms: 28"));
        assert_eq!(rtp_seq(&[0x80, 0x00, 0x01, 0x02]), Some(258));
    }
}
