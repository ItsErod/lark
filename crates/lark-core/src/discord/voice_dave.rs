//! DAVE session on the voice gateway.
//!
//! Advertising protocol version 1 is what keeps Discord from closing the socket
//! with 4017. After select-protocol ack, a pending member sends an MLS key package
//! (opcode 26) and answers external-sender, proposal, commit, and welcome frames
//! so the gateway does not drop the call.

use std::collections::HashSet;
use std::time::Duration;

use dave::{PassthroughMode, ProposalsOperation, Session, SessionConfig, SessionIdentity, SessionOptions};

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
        };
        call.queue_key_package()?;
        Ok(call)
    }

    pub fn take_outbound(&mut self) -> Vec<DaveWire> {
        std::mem::take(&mut self.outbound)
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
                self.external_sender = Some(payload.to_vec());
                self.external_ready = false;
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
        if transition_id == 0 || protocol_version == 0 {
            self.session.set_passthrough_mode(PassthroughMode::Enabled);
            self.ready(transition_id);
        }
    }

    pub fn execute_transition(&mut self, transition_id: u16) {
        let _ = self.session.activate_staged_sender();
        if transition_id == 0 {
            self.session
                .set_passthrough_mode(PassthroughMode::DisabledAfter(Duration::from_secs(10)));
        }
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
        self.pump()
    }

    fn recreate(&mut self) -> Result<(), String> {
        self.session = Session::new(SessionConfig {
            self_user_id: self.user_id,
            channel_id: self.channel_id,
            options: SessionOptions { identity: SessionIdentity::Ephemeral },
        })
        .map_err(|err| format!("fatal:DAVE session failed to restart ({err})"))?;
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
        Ok(())
    }

    fn pump(&mut self) -> Result<(), String> {
        if let Some(bytes) = self.external_sender.clone() {
            if !self.external_ready && self.session.set_external_sender(&bytes).is_ok() {
                self.external_ready = true;
            }
        }
        if !self.key_package_sent {
            self.queue_key_package()?;
        }
        if !self.external_ready || !self.roster_seen {
            return Ok(());
        }
        let pending = std::mem::take(&mut self.proposals);
        for payload in pending {
            self.apply_proposals(&payload);
        }
        if let Some((id, welcome)) = self.welcome.clone() {
            self.welcome = None;
            if self.session.process_welcome(&welcome).is_ok() {
                self.ready(id);
            } else {
                self.fail_transition(id)?;
            }
        }
        if let Some((id, commit)) = self.commit.clone() {
            self.commit = None;
            if self.session.process_commit(&commit).is_ok() {
                self.ready(id);
            } else {
                self.fail_transition(id)?;
            }
        }
        Ok(())
    }

    fn apply_proposals(&mut self, payload: &[u8]) {
        let Some((&operation, rest)) = payload.split_first() else { return };
        let operation = match operation {
            0 => ProposalsOperation::Append,
            1 => ProposalsOperation::Revoke,
            _ => return,
        };
        let expected = self.roster.iter().copied().collect::<Vec<_>>();
        if let Ok(Some(commit)) = self.session.process_proposals(operation, rest, expected.as_slice()) {
            self.outbound.push(DaveWire::Binary(dave_commit_welcome_frame(
                &commit.commit,
                commit.welcome.as_deref(),
            )));
        }
    }

    fn ready(&mut self, transition_id: u16) {
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
    fn a_newer_protocol_than_we_support_is_fatal() {
        let err = match DaveCall::start(1, 2, 2) {
            Err(err) => err,
            Ok(_) => panic!("a newer protocol must be rejected"),
        };
        assert!(err.starts_with("fatal:"));
    }
}
