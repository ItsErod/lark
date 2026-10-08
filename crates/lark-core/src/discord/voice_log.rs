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
             Game Mode does not scale the voice heartbeat. The socket wakes at least once a second so a coalesced timer still sends Opcode 3 on Hello's interval.\n\
             Voice does not launch PowerShell, cmd, or reg.exe. The Defender change does not alter the voice path.\n\
             steps:\n",
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
