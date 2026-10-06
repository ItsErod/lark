//! Discord's mobile QR login (remote auth), not OAuth2.
//! The decrypted token is returned to the shell and is never placed on a status event.

use std::time::{Duration, Instant};

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use rand::rngs::OsRng;
use rsa::pkcs8::EncodePublicKey;
use rsa::{Oaep, RsaPrivateKey, RsaPublicKey};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::watch;
use tokio_tungstenite::{
    connect_async, tungstenite::client::IntoClientRequest, tungstenite::Message,
};

use super::rest::{explain_api_status, explain_transport};
use crate::redact::redact;
use crate::token::normalize_user_token;

const GATEWAY: &str = "wss://remote-auth-gateway.discord.gg/?v=2";
const EXCHANGE: &str = "https://discord.com/api/v10/users/@me/remote-auth/login";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrUpdate {
    pub phase: String,
    pub svg: String,
    pub detail: String,
    pub username: String,
}

impl QrUpdate {
    fn qr(svg: String) -> Self {
        Self {
            phase: "qr".into(),
            svg,
            detail: String::new(),
            username: String::new(),
        }
    }

    fn scanned(username: String) -> Self {
        Self {
            phase: "scanned".into(),
            svg: String::new(),
            detail: String::new(),
            username,
        }
    }

    fn failed(detail: impl Into<String>) -> Self {
        Self {
            phase: "failed".into(),
            svg: String::new(),
            detail: detail.into(),
            username: String::new(),
        }
    }
}

pub enum QrOutcome {
    Ready(String),
    Cancelled,
}

struct Handshake {
    private: RsaPrivateKey,
    public_b64: String,
    fingerprint: String,
}

impl Handshake {
    fn generate() -> Result<Self, String> {
        let private = RsaPrivateKey::new(&mut OsRng, 2048)
            .map_err(|_| "Could not prepare QR login.".to_string())?;
        let public = RsaPublicKey::from(&private);
        let der = public
            .to_public_key_der()
            .map_err(|_| "Could not prepare QR login.".to_string())?;
        let public_b64 = STANDARD.encode(der.as_bytes());
        let fingerprint = fingerprint_of(der.as_bytes());
        Ok(Self {
            private,
            public_b64,
            fingerprint,
        })
    }

    fn init_payload(&self) -> String {
        json!({ "op": "init", "encoded_public_key": self.public_b64 }).to_string()
    }

    fn prove_nonce(&self, encrypted_nonce: &str) -> Result<String, String> {
        let nonce = self.decrypt_b64(encrypted_nonce)?;
        let proof = URL_SAFE_NO_PAD.encode(nonce);
        Ok(json!({ "op": "nonce_proof", "nonce": proof }).to_string())
    }

    fn accept_fingerprint(&self, fingerprint: &str) -> bool {
        fingerprint == self.fingerprint
    }

    fn qr_url(&self) -> String {
        format!("https://discord.com/ra/{}", self.fingerprint)
    }

    fn decrypt_user(&self, encrypted: &str) -> Result<String, String> {
        let bytes = self.decrypt_b64(encrypted)?;
        let text = String::from_utf8(bytes)
            .map_err(|_| "Discord's QR response could not be read.".to_string())?;
        let mut parts = text.splitn(4, ':');
        let username = parts.nth(3).unwrap_or("").trim().to_string();
        if username.is_empty() {
            Ok("your account".into())
        } else {
            Ok(username)
        }
    }

    fn decrypt_token(&self, encrypted: &str) -> Result<String, String> {
        let bytes = self.decrypt_b64(encrypted)?;
        let text = String::from_utf8(bytes)
            .map_err(|_| "Discord's QR response could not be read.".to_string())?;
        normalize_user_token(&text).map_err(|_| {
            "Discord finished QR login, but the decrypted session was not a user token.".to_string()
        })
    }

    fn decrypt_b64(&self, encoded: &str) -> Result<Vec<u8>, String> {
        let bytes = STANDARD
            .decode(encoded.trim())
            .or_else(|_| URL_SAFE_NO_PAD.decode(encoded.trim()))
            .map_err(|_| "Discord's QR response could not be read.".to_string())?;
        self.private
            .decrypt(Oaep::new::<Sha256>(), &bytes)
            .map_err(|_| "Discord's QR response could not be read.".to_string())
    }
}

fn fingerprint_of(spki_der: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(spki_der))
}

pub fn qr_svg(text: &str) -> Result<String, String> {
    if text.len() > 256 || text.chars().any(|ch| ch.is_control()) {
        return Err("Could not draw the QR code.".into());
    }
    let code = qrcode::QrCode::new(text.as_bytes())
        .map_err(|_| "Could not draw the QR code.".to_string())?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(232, 232)
        .quiet_zone(true)
        .build();
    let start = svg
        .find("<svg")
        .ok_or_else(|| "Could not draw the QR code.".to_string())?;
    Ok(svg[start..].to_string())
}

pub fn remote_auth_request() -> Result<tokio_tungstenite::tungstenite::http::Request<()>, String> {
    let mut request = GATEWAY
        .into_client_request()
        .map_err(|_| "Could not start QR login.".to_string())?;
    let headers = request.headers_mut();
    headers.insert(
        "Origin",
        "https://discord.com"
            .parse()
            .map_err(|_| "Could not start QR login.".to_string())?,
    );
    headers.insert(
        "User-Agent",
        "Lark/0.1.0 (personal client)"
            .parse()
            .map_err(|_| "Could not start QR login.".to_string())?,
    );
    Ok(request)
}

enum Step {
    Token(String),
    Cancelled,
    Retry(String),
}

pub async fn login_with_qr<F>(
    mut emit: F,
    mut stop: watch::Receiver<bool>,
) -> Result<QrOutcome, String>
where
    F: FnMut(QrUpdate) + Send,
{
    loop {
        if *stop.borrow() {
            return Ok(QrOutcome::Cancelled);
        }
        match one_session(&mut emit, &mut stop).await {
            Ok(Step::Token(token)) => return Ok(QrOutcome::Ready(token)),
            Ok(Step::Cancelled) => return Ok(QrOutcome::Cancelled),
            Ok(Step::Retry(detail)) => emit(QrUpdate::failed(detail)),
            Err(detail) if terminal_qr_failure(&detail) => return Err(detail),
            Err(detail) => emit(QrUpdate::failed(detail)),
        }
        tokio::select! {
            changed = stop.changed() => {
                if changed.is_err() || *stop.borrow() {
                    return Ok(QrOutcome::Cancelled);
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(2)) => {}
        }
    }
}

async fn one_session<F>(emit: &mut F, stop: &mut watch::Receiver<bool>) -> Result<Step, String>
where
    F: FnMut(QrUpdate),
{
    let handshake = Handshake::generate()?;
    let request = remote_auth_request()?;
    let (socket, _) = connect_async(request)
        .await
        .map_err(|err| explain_transport(&redact(&err.to_string(), &[])))?;
    let (mut write, mut read) = socket.split();
    let mut interval = Duration::from_millis(41_250);
    let mut next_heartbeat = Instant::now() + interval;
    let mut saw_hello = false;
    let mut waiting_for_ack = false;

    loop {
        if *stop.borrow() {
            return Ok(Step::Cancelled);
        }
        let wait = next_heartbeat.saturating_duration_since(Instant::now());
        tokio::select! {
            changed = stop.changed() => {
                if changed.is_err() || *stop.borrow() {
                    return Ok(Step::Cancelled);
                }
            }
            _ = tokio::time::sleep(wait), if saw_hello => {
                if let Err(detail) = begin_heartbeat(&mut waiting_for_ack) {
                    return Ok(Step::Retry(detail.into()));
                }
                if write.send(Message::Text(r#"{"op":"heartbeat"}"#.into())).await.is_err() {
                    return Ok(Step::Retry("The QR connection dropped. Trying again.".into()));
                }
                next_heartbeat = Instant::now() + interval;
            }
            frame = read.next() => {
                let Some(frame) = frame else {
                    return Ok(Step::Retry("The QR connection closed. Trying again.".into()));
                };
                let frame = frame.map_err(|err| explain_transport(&err.to_string()))?;
                match frame {
                    Message::Close(frame) => {
                        let code = frame.as_ref().map(|item| u16::from(item.code)).unwrap_or(0);
                        return Ok(Step::Retry(qr_close_message(code)));
                    }
                    Message::Text(text) => {
                        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                        let op = value.get("op").and_then(|op| op.as_str()).unwrap_or("");
                        match op {
                            "heartbeat_ack" => note_heartbeat_ack(&mut waiting_for_ack),
                            "hello" => {
                                let ms = value.get("heartbeat_interval").and_then(|v| v.as_u64()).unwrap_or(41_250);
                                interval = Duration::from_millis(ms.max(1_000));
                                next_heartbeat = Instant::now() + interval;
                                saw_hello = true;
                                if write.send(Message::Text(handshake.init_payload())).await.is_err() {
                                    return Ok(Step::Retry("The QR connection dropped. Trying again.".into()));
                                }
                            }
                            "nonce_proof" => {
                                let encrypted = value.get("encrypted_nonce").and_then(|v| v.as_str()).unwrap_or("");
                                let proof = handshake.prove_nonce(encrypted)?;
                                if write.send(Message::Text(proof)).await.is_err() {
                                    return Ok(Step::Retry("The QR connection dropped. Trying again.".into()));
                                }
                            }
                            "pending_remote_init" => {
                                let fingerprint = value.get("fingerprint").and_then(|v| v.as_str()).unwrap_or("");
                                if !handshake.accept_fingerprint(fingerprint) {
                                    return Ok(Step::Retry("Discord's QR fingerprint did not match this device. Trying again.".into()));
                                }
                                let url = handshake.qr_url();
                                let svg = qr_svg(&url)?;
                                emit(QrUpdate::qr(svg));
                            }
                            "pending_ticket" => {
                                let encrypted = value.get("encrypted_user_payload").and_then(|v| v.as_str()).unwrap_or("");
                                let username = handshake.decrypt_user(encrypted).unwrap_or_else(|_| "your account".into());
                                emit(QrUpdate::scanned(username));
                            }
                            "pending_login" => {
                                let ticket = value.get("ticket").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if ticket.is_empty() {
                                    return Ok(Step::Retry("Discord did not send a QR login ticket. Trying again.".into()));
                                }
                                let token = exchange_ticket(&ticket, &handshake).await?;
                                return Ok(Step::Token(token));
                            }
                            "cancel" => {
                                return Ok(Step::Retry("The sign-in was cancelled on your phone. A new QR code is coming.".into()));
                            }
                            _ => {}
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

fn begin_heartbeat(waiting_for_ack: &mut bool) -> Result<(), &'static str> {
    if *waiting_for_ack {
        return Err("The QR connection stopped answering. Trying again.");
    }
    *waiting_for_ack = true;
    Ok(())
}

fn note_heartbeat_ack(waiting_for_ack: &mut bool) {
    *waiting_for_ack = false;
}

fn terminal_qr_failure(detail: &str) -> bool {
    let lower = detail.to_ascii_lowercase();
    lower.contains("captcha") || lower.contains("http 401") || lower.contains("http 403")
}

fn qr_close_message(code: u16) -> String {
    match code {
        4000 => "Discord rejected the QR login version. Trying again.".into(),
        4001 => "Discord could not read the QR handshake. Trying again.".into(),
        4002 => "Discord rejected the QR handshake. Trying again.".into(),
        4003 => "The QR code expired. A new one is coming.".into(),
        _ => format!("The QR connection closed ({code}). Trying again."),
    }
}

async fn exchange_ticket(ticket: &str, handshake: &Handshake) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Lark/0.1.0 (personal client)")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not finish QR login.".to_string())?;
    let response = client
        .post(EXCHANGE)
        .json(&json!({ "ticket": ticket }))
        .send()
        .await
        .map_err(|err| explain_transport(&redact(&err.to_string(), &[ticket])))?;
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    let body = redact(&body, &[ticket]);
    if !(200..300).contains(&status) {
        let lower = body.to_ascii_lowercase();
        if lower.contains("captcha") {
            return Err(
                "Discord asked for a captcha before finishing QR login. Use Sign in with Discord or Sign in in your browser. Password, 2FA, and the captcha stay on Discord's own page."
                    .into(),
            );
        }
        let message = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|item| item.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();
        return Err(explain_api_status(status, &message));
    }
    let encrypted = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("encrypted_token")
                .and_then(|item| item.as_str())
                .map(|s| s.to_string())
        })
        .ok_or_else(|| "Discord's QR login response did not include a session.".to_string())?;
    handshake.decrypt_token(&encrypted)
}

pub fn qr_update_hides_secrets(update: &QrUpdate, secret: &str) -> bool {
    let encoded = serde_json::to_string(update).unwrap_or_default();
    secret.len() < 8 || !encoded.contains(secret)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::traits::PublicKeyParts;

    fn roundtrip_encrypt(public: &RsaPublicKey, plaintext: &[u8]) -> String {
        let cipher = public
            .encrypt(&mut OsRng, Oaep::new::<Sha256>(), plaintext)
            .unwrap();
        STANDARD.encode(cipher)
    }

    #[test]
    fn fingerprint_matches_the_public_key_and_qr_url() {
        let handshake = Handshake::generate().unwrap();
        let der = STANDARD.decode(&handshake.public_b64).unwrap();
        assert_eq!(handshake.fingerprint, fingerprint_of(&der));
        assert!(handshake.accept_fingerprint(&handshake.fingerprint));
        assert!(!handshake.accept_fingerprint("different"));
        let url = handshake.qr_url();
        assert_eq!(
            url,
            format!("https://discord.com/ra/{}", handshake.fingerprint)
        );
        assert!(!url.contains("token"));
        let svg = qr_svg(&url).unwrap();
        assert!(svg.starts_with("<svg"));
        assert!(!svg.contains("<script"));
        assert!(!svg.to_ascii_lowercase().contains("token="));
    }

    #[test]
    fn nonce_user_and_token_roundtrip_without_leaking_into_updates() {
        let handshake = Handshake::generate().unwrap();
        let public = RsaPublicKey::from(&handshake.private);
        assert_eq!(public.size() * 8, 2048);
        let proof = handshake
            .prove_nonce(&roundtrip_encrypt(&public, b"nonce-bytes"))
            .unwrap();
        let proof_value: Value = serde_json::from_str(&proof).unwrap();
        assert_eq!(proof_value["op"], "nonce_proof");
        assert_eq!(proof_value["nonce"], URL_SAFE_NO_PAD.encode(b"nonce-bytes"));
        let user = format!("852892297661906993:0:0:ada");
        assert_eq!(
            handshake
                .decrypt_user(&roundtrip_encrypt(&public, user.as_bytes()))
                .unwrap(),
            "ada"
        );
        let token = "MTIzNDU2Nzg5.QUJDREVGR0g.a1b2c3d4e5f6g7h8";
        assert_eq!(
            handshake
                .decrypt_token(&roundtrip_encrypt(
                    &public,
                    format!("\"{token}\"").as_bytes()
                ))
                .unwrap(),
            token
        );
        let update = QrUpdate::scanned("ada".into());
        assert!(qr_update_hides_secrets(&update, token));
        let failed = QrUpdate::failed("The QR code expired. A new one is coming.");
        let encoded = serde_json::to_string(&failed).unwrap();
        assert!(!encoded.contains(token));
        assert_eq!(failed.phase, "failed");
    }

    #[test]
    fn remote_auth_socket_names_discord_and_not_a_token() {
        let request = remote_auth_request().unwrap();
        let uri = request.uri().to_string();
        assert!(uri.starts_with("wss://remote-auth-gateway.discord.gg/?v=2"));
        assert!(!uri.to_ascii_lowercase().contains("token"));
        assert_eq!(
            request.headers().get("origin").unwrap(),
            "https://discord.com"
        );
        assert!(request
            .headers()
            .get("user-agent")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("Lark"));
    }

    #[test]
    fn a_missed_heartbeat_ack_ends_the_qr_session() {
        let mut waiting = false;
        assert!(begin_heartbeat(&mut waiting).is_ok());
        assert!(waiting);
        let missed = begin_heartbeat(&mut waiting).unwrap_err();
        assert!(missed.to_ascii_lowercase().contains("stopped answering"));
        note_heartbeat_ack(&mut waiting);
        assert!(!waiting);
        assert!(begin_heartbeat(&mut waiting).is_ok());
    }

    #[tokio::test(flavor = "current_thread")]
    #[ignore = "opens a Discord remote-auth session"]
    async fn gateway_returns_a_live_qr() {
        let (stop_tx, stop_rx) = watch::channel(false);
        let svg = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let svg_cb = svg.clone();
        let stop_slot = std::sync::Arc::new(std::sync::Mutex::new(Some(stop_tx)));
        let stop_cb = stop_slot.clone();
        let run = login_with_qr(
            move |update| {
                if update.phase == "qr" && update.svg.starts_with("<svg") {
                    *svg_cb.lock().unwrap_or_else(|err| err.into_inner()) = update.svg;
                    if let Some(tx) = stop_cb.lock().unwrap_or_else(|err| err.into_inner()).take() {
                        let _ = tx.send(true);
                    }
                }
            },
            stop_rx,
        );
        let outcome = tokio::time::timeout(Duration::from_secs(30), run)
            .await
            .expect("QR gateway timed out");
        let outcome = outcome.expect("QR gateway failed");
        assert!(matches!(outcome, QrOutcome::Cancelled));
        let drawn = svg.lock().unwrap_or_else(|err| err.into_inner()).clone();
        assert!(drawn.starts_with("<svg"));
        assert!(!drawn.to_ascii_lowercase().contains("<script"));
        assert!(!drawn.to_ascii_lowercase().contains("javascript:"));
    }

    #[test]
    fn close_codes_are_specific() {
        assert!(qr_close_message(4003).contains("expired"));
        assert!(qr_close_message(4002).contains("handshake"));
    }

    #[test]
    fn captcha_and_auth_failures_stop_instead_of_retrying() {
        assert!(terminal_qr_failure(
            "Discord asked for a captcha before finishing QR login."
        ));
        assert!(terminal_qr_failure(
            "Discord rejected the token (HTTP 401)."
        ));
        assert!(!terminal_qr_failure(
            "The QR code expired. A new one is coming."
        ));
    }
}
