//! DAVE session on the voice gateway.
//!
//! Advertising protocol version 1 is what keeps Discord from closing the socket
//! with 4017. After select-protocol ack, a pending member sends an MLS key package
//! (opcode 26) and answers external-sender, proposal, commit, and welcome frames
//! so the gateway does not drop the call.

use std::collections::HashSet;
use std::time::Duration;

use dave::{
    MediaFrame, MediaType, Opus, PassthroughMode, ProcessProposalsError, ProposalsOperation, Session, SessionConfig,
    SessionIdentity, SessionOptions, SetExternalSenderError, OPUS_SILENCE_FRAME,
};

use super::voice::{
    dave_commit_welcome_frame, dave_invalid_commit, dave_key_package_frame, dave_transition_ready,
    parse_dave_server_binary, MAX_DAVE_PROTOCOL_VERSION,
};

#[derive(Debug)]
pub enum DaveWire {
    Text(String),
    Binary(Vec<u8>),
}

pub struct DaveCall {
    session: Session,
    user_id: u64,
    channel_id: u64,
    external_sender: Option<Vec<u8>>,
    external_ready: bool,
    key_package_sent: bool,
    roster: HashSet<u64>,
    roster_seen: bool,
    proposals: Vec<Vec<u8>>,
    welcome: Option<(u16, Vec<u8>)>,
    commit: Option<(u16, Vec<u8>)>,
    outbound: Vec<DaveWire>,
    /// Send-side transport-only. Receive passthrough is the session's own mode:
    /// it turns on for a downgrade and for the ten seconds after an execute.
    passthrough: bool,
    pending_version: u16,
    executed: Option<u16>,
    readied: HashSet<u16>,
    trace: Vec<String>,
}

impl DaveCall {
    pub fn start(user_id: u64, channel_id: u64, protocol_version: u16) -> Result<Self, String> {
        if protocol_version == 0 {
            return Err("fatal:DAVE version was missing".into());
        }
        if protocol_version > MAX_DAVE_PROTOCOL_VERSION {
            return Err(format!("fatal:DAVE protocol {protocol_version} is newer than this client"));
        }
        let session = Session::new(SessionConfig {
            self_user_id: user_id,
            channel_id,
            options: SessionOptions { identity: SessionIdentity::Ephemeral },
        })
        .map_err(|err| format!("fatal:DAVE session failed to start ({err})"))?;
        let mut call = Self {
            session,
            user_id,
            channel_id,
            external_sender: None,
            external_ready: false,
            key_package_sent: false,
            roster: HashSet::from([user_id]),
            roster_seen: false,
            proposals: Vec::new(),
            welcome: None,
            commit: None,
            outbound: Vec::new(),
            passthrough: false,
            pending_version: protocol_version,
            executed: None,
            readied: HashSet::new(),
            trace: Vec::new(),
        };
        call.trace("session started");
        call.queue_key_package()?;
        Ok(call)
    }

    pub fn take_outbound(&mut self) -> Vec<DaveWire> {
        std::mem::take(&mut self.outbound)
    }

    pub fn drain_trace(&mut self) -> Vec<String> {
        std::mem::take(&mut self.trace)
    }

    pub fn passthrough(&self) -> bool {
        self.passthrough
    }

    pub fn sender_ready(&self) -> bool {
        self.session.sender_ready()
    }

    pub fn pending_proposals(&self) -> usize {
        self.proposals.len()
    }

    /// Encrypt one Opus frame for the current MLS epoch.
    ///
    /// Silence from the SFU (`0xF8 0xFF 0xFE`) is not a DAVE frame. A sender that
    /// is not ready yet returns an error so the transport does not ship plaintext
    /// into an end-to-end call.
    pub fn seal_opus(&mut self, opus: &[u8]) -> Result<Vec<u8>, ()> {
        if opus == OPUS_SILENCE_FRAME && !self.session.sender_ready() && self.passthrough {
            return Ok(opus.to_vec());
        }
        if self.passthrough {
            return Ok(opus.to_vec());
        }
        if !self.session.sender_ready() {
            self.trace("seal skipped; sender ratchet is not active");
            return Err(());
        }
        let mut out = Vec::with_capacity(opus.len() + 32);
        self.session
            .encrypt_into(MediaFrame::<Opus>::new(opus), &mut out)
            .map_err(|_| ())?;
        if out.is_empty() || !frame_has_dave_marker(&out) {
            return Err(());
        }
        Ok(out)
    }

    /// Decrypt one received Opus frame after the transport cipher.
    pub fn open_opus(&mut self, user_id: u64, frame: &[u8]) -> Result<Vec<u8>, ()> {
        if frame == OPUS_SILENCE_FRAME {
            return Ok(frame.to_vec());
        }
        match self.session.decrypt(user_id, MediaType::Audio, frame) {
            Ok(plain) if !plain.is_empty() => Ok(plain),
            Ok(_) => Err(()),
            Err(_) if self.passthrough && !frame_has_dave_marker(frame) => Ok(frame.to_vec()),
            Err(_) => Err(()),
        }
    }

    pub fn note_users(&mut self, ids: impl IntoIterator<Item = u64>) {
        for id in ids {
            self.roster.insert(id);
        }
        self.roster_seen = true;
        let _ = self.pump();
    }

    pub fn forget_user(&mut self, id: u64) {
        if id != self.user_id {
            self.roster.remove(&id);
        }
    }

    pub fn ingest_binary(&mut self, bytes: &[u8]) {
        let Some((_seq, opcode, payload)) = parse_dave_server_binary(bytes) else { return };
        match opcode {
            25 => {
                let next = payload.to_vec();
                if self.external_sender.as_ref() != Some(&next) {
                    self.external_sender = Some(next);
                    self.external_ready = false;
                    self.trace("external sender received");
                }
            }
            27 => self.proposals.push(payload.to_vec()),
            29 => {
                if let Some((id, body)) = split_transition(payload) {
                    self.commit = Some((id, body.to_vec()));
                }
            }
            30 => {
                if let Some((id, body)) = split_transition(payload) {
                    self.welcome = Some((id, body.to_vec()));
                }
            }
            _ => {}
        }
        let _ = self.pump();
    }

    pub fn prepare_transition(&mut self, protocol_version: u16, transition_id: u16) {
        self.trace(format!("prepare transition {transition_id} protocol {protocol_version}"));
        self.pending_version = protocol_version;
        if protocol_version == 0 {
            // Downgrade: receivers pass plaintext through immediately. Senders
            // keep the old ratchet until execute, except transition 0 which
            // the gateway never follows with opcode 22.
            self.session.set_passthrough_mode(PassthroughMode::Enabled);
            if transition_id == 0 {
                self.passthrough = true;
                self.executed = Some(0);
            }
            self.ready(transition_id);
            return;
        }
        if transition_id == 0 {
            // Re-initialization. The gateway does not send opcode 22 for this id.
            self.execute_transition(0);
            self.ready(0);
        }
    }

    pub fn execute_transition(&mut self, transition_id: u16) {
        self.executed = Some(transition_id);
        let _ = self.pump();
        let activated = self.session.activate_staged_sender();
        if self.pending_version == 0 {
            self.passthrough = true;
            self.session.set_passthrough_mode(PassthroughMode::Enabled);
        } else {
            self.passthrough = false;
            self.session
                .set_passthrough_mode(PassthroughMode::DisabledAfter(Duration::from_secs(10)));
        }
        let ready = activated || self.session.sender_ready() || self.passthrough;
        self.trace(format!(
            "execute transition {transition_id} sender {}",
            if ready { "ready" } else { "pending" }
        ));
    }

    pub fn prepare_epoch(&mut self, _protocol_version: u16, epoch: u64) -> Result<(), String> {
        if epoch != 1 {
            return Ok(());
        }
        self.recreate()?;
        self.external_ready = false;
        self.key_package_sent = false;
        self.proposals.clear();
        self.welcome = None;
        self.commit = None;
        self.executed = None;
        self.readied.clear();
        self.pump()
    }

    fn recreate(&mut self) -> Result<(), String> {
        self.session = Session::new(SessionConfig {
            self_user_id: self.user_id,
            channel_id: self.channel_id,
            options: SessionOptions { identity: SessionIdentity::Ephemeral },
        })
        .map_err(|err| format!("fatal:DAVE session failed to restart ({err})"))?;
        self.executed = None;
        self.readied.clear();
        Ok(())
    }

    fn queue_key_package(&mut self) -> Result<(), String> {
        let package = self
            .session
            .create_key_package()
            .map_err(|err| format!("fatal:DAVE key package failed ({err})"))?;
        if package.is_empty() {
            return Err("fatal:DAVE key package was empty".into());
        }
        self.outbound.push(DaveWire::Binary(dave_key_package_frame(&package)));
        self.key_package_sent = true;
        self.trace(format!("key package queued ({} bytes)", package.len()));
        Ok(())
    }

    fn pump(&mut self) -> Result<(), String> {
        if let Some(bytes) = self.external_sender.clone() {
            if !self.external_ready {
                match self.session.set_external_sender(&bytes) {
                    Ok(()) => {
                        self.external_ready = true;
                        self.trace("external sender accepted");
                    }
                    Err(SetExternalSenderError::AlreadyInGroup) => {
                        self.external_ready = true;
                    }
                    Err(err) => self.trace(format!("external sender rejected ({err})")),
                }
            }
        }
        if !self.key_package_sent {
            self.queue_key_package()?;
        }
        // Proposals add or remove members, so they wait for the roster.
        // A welcome or commit is how a pending member joins and must not.
        if self.external_ready && self.roster_seen {
            let pending = std::mem::take(&mut self.proposals);
            let mut retry = Vec::new();
            for payload in pending {
                match self.apply_proposals(&payload) {
                    ProposalApply::Done => {}
                    ProposalApply::Later => retry.push(payload),
                }
            }
            self.proposals.splice(0..0, retry);
        }
        if !self.external_ready {
            return Ok(());
        }
        if let Some((id, welcome)) = self.welcome.clone() {
            self.welcome = None;
            if self.session.process_welcome(&welcome).is_ok() {
                self.trace(format!("welcome {id} joined"));
                if self.executed == Some(id) {
                    let _ = self.session.activate_staged_sender();
                }
                self.ready(id);
            } else {
                self.fail_transition(id)?;
            }
        }
        if let Some((id, commit)) = self.commit.clone() {
            self.commit = None;
            if self.session.process_commit(&commit).is_ok() {
                self.trace(format!("commit {id} merged"));
                if self.executed == Some(id) {
                    let _ = self.session.activate_staged_sender();
                }
                self.ready(id);
            } else {
                self.fail_transition(id)?;
            }
        }
        Ok(())
    }

    fn apply_proposals(&mut self, payload: &[u8]) -> ProposalApply {
        let Some((&operation, rest)) = payload.split_first() else { return ProposalApply::Done };
        let operation = match operation {
            0 => ProposalsOperation::Append,
            1 => ProposalsOperation::Revoke,
            _ => return ProposalApply::Done,
        };
        let expected = self.roster.iter().copied().collect::<Vec<_>>();
        match self.session.process_proposals(operation, rest, expected.as_slice()) {
            Ok(Some(commit)) => {
                self.trace("commit welcome queued");
                self.outbound.push(DaveWire::Binary(dave_commit_welcome_frame(
                    &commit.commit,
                    commit.welcome.as_deref(),
                )));
                ProposalApply::Done
            }
            Ok(None) => ProposalApply::Done,
            Err(ProcessProposalsError::NoGroup | ProcessProposalsError::UnexpectedUser(_)) => ProposalApply::Later,
            Err(err) => {
                self.trace(format!("proposals dropped ({err})"));
                ProposalApply::Done
            }
        }
    }

    fn ready(&mut self, transition_id: u16) {
        if !self.readied.insert(transition_id) {
            return;
        }
        self.outbound.push(DaveWire::Text(dave_transition_ready(transition_id)));
    }

    fn fail_transition(&mut self, transition_id: u16) -> Result<(), String> {
        self.outbound.push(DaveWire::Text(dave_invalid_commit(transition_id)));
        self.recreate()?;
        self.external_ready = false;
        self.key_package_sent = false;
        self.pump()
    }
}

enum ProposalApply {
    Done,
    Later,
}

fn frame_has_dave_marker(frame: &[u8]) -> bool {
    frame.len() >= 2 && frame[frame.len() - 2] == 0xFA && frame[frame.len() - 1] == 0xFA
}

impl DaveCall {
    fn trace(&mut self, step: impl Into<String>) {
        let line = step.into();
        if self.trace.last().is_some_and(|prev| prev == &line) {
            return;
        }
        self.trace.push(line);
    }
}

fn split_transition(payload: &[u8]) -> Option<(u16, &[u8])> {
    if payload.len() < 2 {
        return None;
    }
    let id = u16::from_be_bytes([payload[0], payload[1]]);
    Some((id, &payload[2..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call() -> DaveCall {
        DaveCall::start(1_090_123_456_789_012_345, 1_090_123_456_789_012_346, 1).unwrap()
    }

    #[test]
    fn a_required_session_sends_a_real_key_package() {
        let mut session = call();
        let outbound = session.take_outbound();
        assert_eq!(outbound.len(), 1);
        match &outbound[0] {
            DaveWire::Binary(frame) => {
                assert_eq!(frame[0], 26);
                assert!(frame.len() > 64, "key package was only {} bytes", frame.len());
            }
            DaveWire::Text(text) => panic!("expected a binary key package, got {text}"),
        }
    }

    #[test]
    fn transition_zero_is_acked_immediately_and_epoch_one_sends_a_fresh_package() {
        let mut session = call();
        session.take_outbound();
        session.prepare_transition(0, 0);
        assert!(session.passthrough());
        let ready = session.take_outbound();
        match &ready[0] {
            DaveWire::Text(text) => {
                assert!(text.contains("\"op\":23"));
                assert!(text.contains("\"transition_id\":0"));
            }
            DaveWire::Binary(_) => panic!("transition ready is json"),
        }
        session.prepare_epoch(1, 1).unwrap();
        let again = session.take_outbound();
        assert!(again.iter().any(|item| matches!(item, DaveWire::Binary(frame) if frame.first() == Some(&26) && frame.len() > 64)));
    }

    #[test]
    fn garbage_binary_does_not_drop_the_session() {
        let mut session = call();
        session.take_outbound();
        session.ingest_binary(&[0, 1]);
        session.ingest_binary(&[0, 9, 27]);
        assert!(session.take_outbound().is_empty());
    }

    #[test]
    fn transition_zero_on_protocol_one_does_not_enable_plaintext() {
        let mut session = call();
        session.take_outbound();
        session.prepare_transition(1, 0);
        assert!(!session.passthrough());
        let ready = session.take_outbound();
        match &ready[0] {
            DaveWire::Text(text) => assert!(text.contains("\"transition_id\":0")),
            DaveWire::Binary(_) => panic!("transition ready is json"),
        }
        assert!(session.seal_opus(&[0x11, 0x22, 0x33, 0x44]).is_err());
    }

    #[test]
    fn proposals_wait_until_the_external_sender_and_roster_exist() {
        let mut session = call();
        session.take_outbound();
        session.ingest_binary(&[0x00, 0x01, 27, 0, 1, 2, 3]);
        assert_eq!(session.pending_proposals(), 1);
        session.note_users([1]);
        assert_eq!(session.pending_proposals(), 1, "a proposal must not be dropped before the group exists");
    }

    #[test]
    fn a_downgrade_sends_plaintext_only_after_execute() {
        let mut session = call();
        session.take_outbound();
        session.prepare_transition(0, 4);
        assert!(!session.passthrough());
        assert!(session.seal_opus(&[1, 2, 3]).is_err());
        let ready = session.take_outbound();
        assert!(matches!(&ready[0], DaveWire::Text(text) if text.contains("\"op\":23")));
        session.execute_transition(4);
        assert!(session.passthrough());
        assert_eq!(session.seal_opus(&[1, 2, 3]).unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn a_newer_protocol_than_we_support_is_fatal() {
        let err = match DaveCall::start(1, 2, 2) {
            Err(err) => err,
            Ok(_) => panic!("a newer protocol must be rejected"),
        };
        assert!(err.starts_with("fatal:"));
    }
}
