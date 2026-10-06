//! System-browser sign-in.
//!
//! Discord's login page is allowed to call `http://127.0.0.1`. After the user
//! finishes password, captcha, and 2FA on discord.com, Discord's own `/handoff`
//! page creates a one-time grant and posts it to a loopback port named in that
//! page's `rpc` query. Lark exchanges the grant for a user session and returns
//! it to the shell. The shell stores it in the macOS Keychain or Windows
//! Credential Manager.
//!
//! This path does not open a webview and does not keep a cookie jar. The
//! separate login window that reads a session out of Discord's page is untouched.

use std::future::Future;
use std::net::Ipv4Addr;
use std::time::Duration;

use rand::rngs::OsRng;
use rand::RngCore;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio::time::timeout;
use zeroize::{Zeroize, Zeroizing};

use super::rest::explain_transport;
use crate::normalize_user_token;
use crate::redact::redact;

const EXCHANGE_URL: &str = "https://discord.com/api/v9/auth/handoff/exchange";
const RPC_VERSION: &str = "1";
const COMMAND: &str = "BROWSER_HANDOFF";
const DONE_URL: &str = "https://discord.com/handoff?done=true";
pub const BROWSER_LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
pub const TIMEOUT_DETAIL: &str =
    "The browser sign-in timed out. Finish it on Discord's page, or try again.";

const DISCORD_ORIGINS: &[&str] = &[
    "https://discord.com",
    "https://discordapp.com",
    "https://ptb.discord.com",
    "https://canary.discord.com",
];

const MAX_HEADER: usize = 8 * 1024;
const MAX_BODY: usize = 8 * 1024;
const READ_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub enum GrantError {
    Cancelled,
    TimedOut,
    Failed(String),
}

impl GrantError {
    pub fn detail(&self) -> Option<&str> {
        match self {
            GrantError::Cancelled => None,
            GrantError::TimedOut => Some(TIMEOUT_DETAIL),
            GrantError::Failed(message) => Some(message.as_str()),
        }
    }
}

pub fn new_handoff_key() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format_uuid(&bytes)
}

pub async fn bind_loopback() -> Result<TcpListener, String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .map_err(|_| "Couldn't listen on 127.0.0.1 for Discord's sign-in grant.".to_string())?;
    let addr = listener
        .local_addr()
        .map_err(|_| "Couldn't read the loopback sign-in port.".to_string())?;
    if addr.ip() != Ipv4Addr::LOCALHOST {
        return Err("The sign-in listener was not bound to 127.0.0.1.".into());
    }
    Ok(listener)
}

/// Discord login in the system browser. The redirect brings a signed-in session
/// to `/handoff`, which is the page that calls 127.0.0.1.
pub fn browser_login_url(port: u16, key: &str) -> Result<String, String> {
    if port == 0 {
        return Err("The loopback sign-in port was not assigned.".into());
    }
    if !key_ok(key) {
        return Err("The sign-in grant id was not valid.".into());
    }
    let handoff = format!("/handoff?rpc={port}&key={key}");
    Ok(format!(
        "https://discord.com/login?redirect_to={}",
        urlencoding::encode(&handoff)
    ))
}

pub fn is_browser_login_url(url: &str) -> bool {
    let Some(redirect) = url.strip_prefix("https://discord.com/login?redirect_to=") else {
        return false;
    };
    if url.to_ascii_lowercase().contains("token") || redirect.contains('&') {
        return false;
    }
    let Ok(decoded) = urlencoding::decode(redirect) else {
        return false;
    };
    let Some(query) = decoded.strip_prefix("/handoff?rpc=") else {
        return false;
    };
    let Some((port, key)) = query.split_once("&key=") else {
        return false;
    };
    port.parse::<u16>().ok().is_some_and(|port| port != 0) && key_ok(key)
}

pub async fn finish_browser_login(
    listener: TcpListener,
    key: String,
    stop: watch::Receiver<bool>,
    timeout: Duration,
) -> Result<String, GrantError> {
    let key_for_exchange = key.clone();
    finish_with(listener, key, stop, timeout, move |mut handoff| {
        let key = key_for_exchange.clone();
        async move {
            let result = exchange_handoff(&key, &handoff).await;
            handoff.zeroize();
            result
        }
    })
    .await
}

pub async fn finish_with<F, Fut>(
    listener: TcpListener,
    key: String,
    mut stop: watch::Receiver<bool>,
    wait_for: Duration,
    exchange: F,
) -> Result<String, GrantError>
where
    F: Fn(Zeroizing<String>) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    if !key_ok(&key) {
        return Err(GrantError::Failed(
            "The sign-in grant id was not valid.".into(),
        ));
    }
    if stop_requested(&mut stop) {
        return Err(GrantError::Cancelled);
    }
    let port = listener
        .local_addr()
        .map_err(|_| GrantError::Failed("Couldn't read the loopback sign-in port.".into()))?
        .port();
    let deadline = tokio::time::Instant::now() + wait_for;
    loop {
        if stop_requested(&mut stop) {
            return Err(GrantError::Cancelled);
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(GrantError::TimedOut);
        }
        let accepted = tokio::select! {
            changed = stop.changed() => {
                if changed.is_err() || *stop.borrow() {
                    return Err(GrantError::Cancelled);
                }
                continue;
            }
            _ = tokio::time::sleep(remaining) => return Err(GrantError::TimedOut),
            accepted = listener.accept() => accepted,
        };
        let Ok((mut stream, peer)) = accepted else {
            continue;
        };
        if peer.ip() != Ipv4Addr::LOCALHOST {
            continue;
        }
        let step = match read_request(&mut stream).await {
            Ok(request) => classify(&request, port),
            Err(()) => Step::Ignore,
        };
        match step {
            Step::Ignore => {}
            Step::Reply(response) => {
                let _ = write_response(&mut stream, &response).await;
            }
            Step::Grant { handoff, reply } => {
                let handoff = Zeroizing::new(handoff);
                let exchange_fut = exchange(handoff.clone());
                tokio::pin!(exchange_fut);
                let exchanged = tokio::select! {
                    changed = stop.changed() => {
                        if changed.is_err() || *stop.borrow() {
                            drop(handoff);
                            let _ = write_response(
                                &mut stream,
                                &reply.error("The sign-in was cancelled."),
                            )
                            .await;
                            return Err(GrantError::Cancelled);
                        }
                        exchange_fut.await
                    }
                    result = &mut exchange_fut => result,
                };
                match exchanged {
                    Ok(raw) => {
                        let mut raw = raw;
                        let token = normalize_user_token(&raw);
                        raw.zeroize();
                        drop(handoff);
                        match token {
                            Ok(token) => {
                                let _ = write_response(&mut stream, &reply.ready()).await;
                                return Ok(token);
                            }
                            Err(_) => {
                                let _ = write_response(
                                    &mut stream,
                                    &reply.error("Discord's sign-in grant was not a user session."),
                                )
                                .await;
                                return Err(GrantError::Failed(
                                    "Discord's sign-in grant was not a user session.".into(),
                                ));
                            }
                        }
                    }
                    Err(message) => {
                        let message = redact_known(&message, &[&key, handoff.as_str()]);
                        drop(handoff);
                        let _ = write_response(&mut stream, &reply.error(&message)).await;
                        return Err(GrantError::Failed(message));
                    }
                }
            }
        }
    }
}

pub async fn exchange_handoff(key: &str, handoff_token: &str) -> Result<String, String> {
    exchange_at(EXCHANGE_URL, key, handoff_token).await
}

pub async fn exchange_at(url: &str, key: &str, handoff_token: &str) -> Result<String, String> {
    if !key_ok(key) {
        return Err("The sign-in grant id was not valid.".into());
    }
    if !acceptable_grant(handoff_token) {
        return Err("Discord's sign-in grant was empty.".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("Lark/2.2.4 (personal client)")
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not finish the browser sign-in.".to_string())?;
    let response = client
        .post(url)
        .json(&json!({
            "key": key,
            "handoff_token": handoff_token
        }))
        .send()
        .await
        .map_err(|err| {
            if err.is_redirect() {
                return "Discord redirected the sign-in grant. Lark did not follow it.".into();
            }
            explain_transport(&redact(&err.to_string(), &[key, handoff_token]))
        })?;
    let status = response.status().as_u16();
    if response.status().is_redirection() {
        return Err("Discord redirected the sign-in grant. Lark did not follow it.".into());
    }
    let mut body = response.text().await.unwrap_or_default();
    let result = session_from_exchange(status, &body, key, handoff_token);
    body.zeroize();
    result
}

fn session_from_exchange(
    status: u16,
    body: &str,
    key: &str,
    handoff_token: &str,
) -> Result<String, String> {
    let value: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    if !(200..300).contains(&status) {
        return Err(grant_failure(status, &value, key, handoff_token));
    }
    let token = value
        .get("token")
        .and_then(|item| item.as_str())
        .unwrap_or("");
    normalize_user_token(token)
        .map_err(|_| "Discord's sign-in grant was not a user session.".to_string())
}

fn grant_failure(status: u16, value: &Value, key: &str, handoff_token: &str) -> String {
    let message = redact(
        value
            .get("message")
            .and_then(|item| item.as_str())
            .unwrap_or(""),
        &[key, handoff_token],
    );
    if message.to_ascii_lowercase().contains("captcha") {
        return "Discord asked for a captcha before finishing the browser sign-in. Finish it on Discord's page, or use Sign in with Discord.".into();
    }
    match status {
        401 | 403 => {
            "Discord did not accept the sign-in grant. Sign in again in the browser.".into()
        }
        429 => "Discord rate limited the sign-in grant. Wait a moment and try again.".into(),
        _ => format!("Discord did not finish the browser sign-in (HTTP {status})."),
    }
}

fn stop_requested(stop: &mut watch::Receiver<bool>) -> bool {
    *stop.borrow()
}

fn key_ok(key: &str) -> bool {
    let bytes = key.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, byte)| match index {
        8 | 13 | 18 | 23 => *byte == b'-',
        _ => byte.is_ascii_hexdigit(),
    })
}

fn acceptable_grant(token: &str) -> bool {
    (8..=2048).contains(&token.len())
        && token
            .chars()
            .all(|ch| ch.is_ascii() && !ch.is_ascii_control() && !ch.is_whitespace())
}

fn format_uuid(bytes: &[u8; 16]) -> String {
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    )
}

struct RawRequest {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

enum Step {
    Ignore,
    Reply(HttpResponse),
    Grant { handoff: String, reply: Reply },
}

struct Reply {
    origin: Option<String>,
    redirect: bool,
}

impl Reply {
    fn ready(&self) -> HttpResponse {
        if self.redirect {
            HttpResponse::redirect(DONE_URL)
        } else {
            HttpResponse::json(200, self.origin.clone(), r#"{"evt":"READY","data":{}}"#)
        }
    }

    fn error(&self, message: &str) -> HttpResponse {
        if self.redirect {
            return HttpResponse::html(
                400,
                "<!DOCTYPE html><meta charset=\"utf-8\"><title>Lark</title><p>Lark could not accept that sign-in grant. Return to Discord and try again.</p>",
            );
        }
        let body = json!({
            "evt": "ERROR",
            "data": { "code": 1000, "message": message }
        });
        HttpResponse::json(200, self.origin.clone(), &body.to_string())
    }
}

struct HttpResponse {
    status: u16,
    reason: &'static str,
    headers: Vec<(String, String)>,
    body: String,
}

impl HttpResponse {
    fn json(status: u16, origin: Option<String>, body: &str) -> Self {
        let mut headers = cors_headers(origin);
        headers.push(("content-type".into(), "application/json".into()));
        headers.push(("cache-control".into(), "no-store".into()));
        headers.push(("content-length".into(), body.len().to_string()));
        headers.push(("connection".into(), "close".into()));
        Self {
            status,
            reason: reason(status),
            headers,
            body: body.to_string(),
        }
    }

    fn redirect(location: &str) -> Self {
        Self {
            status: 302,
            reason: "Found",
            headers: vec![
                ("location".into(), location.into()),
                ("cache-control".into(), "no-store".into()),
                ("content-length".into(), "0".into()),
                ("connection".into(), "close".into()),
            ],
            body: String::new(),
        }
    }

    fn html(status: u16, body: &str) -> Self {
        Self {
            status,
            reason: reason(status),
            headers: vec![
                ("content-type".into(), "text/html; charset=utf-8".into()),
                ("cache-control".into(), "no-store".into()),
                ("content-length".into(), body.len().to_string()),
                ("connection".into(), "close".into()),
            ],
            body: body.to_string(),
        }
    }

    fn empty(status: u16, origin: Option<String>) -> Self {
        let mut headers = cors_headers(origin);
        headers.push(("content-length".into(), "0".into()));
        headers.push(("connection".into(), "close".into()));
        headers.push(("cache-control".into(), "no-store".into()));
        Self {
            status,
            reason: reason(status),
            headers,
            body: String::new(),
        }
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        302 => "Found",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    }
}

fn cors_headers(origin: Option<String>) -> Vec<(String, String)> {
    let mut headers = vec![
        (
            "access-control-allow-methods".into(),
            "GET, POST, OPTIONS".into(),
        ),
        ("access-control-allow-headers".into(), "content-type".into()),
        ("access-control-allow-private-network".into(), "true".into()),
        ("vary".into(), "Origin".into()),
    ];
    if let Some(origin) = origin {
        headers.push(("access-control-allow-origin".into(), origin));
    }
    headers
}

fn classify(request: &RawRequest, port: u16) -> Step {
    if !host_ok(&request.headers, port) {
        return Step::Reply(HttpResponse::empty(403, None));
    }
    let (path, query) = split_target(&request.target);
    if path != "/rpc" {
        return Step::Reply(HttpResponse::empty(404, None));
    }
    let origin = header(&request.headers, "origin");
    let discord_origin = origin.filter(|value| discord_origin(value));
    if request.method == "OPTIONS" {
        if discord_origin.is_none() {
            return Step::Reply(HttpResponse::empty(403, None));
        }
        return Step::Reply(HttpResponse::empty(204, discord_origin.clone()));
    }
    if query_param(query, "v").as_deref() != Some(RPC_VERSION) {
        return Step::Reply(HttpResponse::empty(404, discord_origin.clone()));
    }
    let parsed = if request.method == "POST" {
        if discord_origin.is_none() {
            return Step::Reply(HttpResponse::empty(403, None));
        }
        parse_rpc_json(&request.body)
    } else if request.method == "GET" {
        query_param(query, "payload").and_then(|payload| parse_rpc_text(&payload))
    } else {
        None
    };
    let Some(call) = parsed else {
        return Step::Reply(HttpResponse::empty(400, discord_origin.clone()));
    };
    if call.cmd != COMMAND {
        return Step::Reply(HttpResponse::empty(404, discord_origin.clone()));
    }
    let reply = Reply {
        origin: discord_origin.clone(),
        redirect: request.method == "GET",
    };
    match call.handoff_token {
        Some(token) if acceptable_grant(&token) => Step::Grant {
            handoff: token,
            reply,
        },
        _ => Step::Reply(reply.error("Discord's sign-in grant was empty.")),
    }
}

struct RpcCall {
    cmd: String,
    handoff_token: Option<String>,
}

fn parse_rpc_json(body: &[u8]) -> Option<RpcCall> {
    let mut text = String::from_utf8(body.to_vec()).ok()?;
    let call = parse_rpc_text(&text);
    text.zeroize();
    call
}

fn parse_rpc_text(text: &str) -> Option<RpcCall> {
    let value: RpcBody = serde_json::from_str(text).ok()?;
    Some(RpcCall {
        cmd: value.cmd.unwrap_or_default(),
        handoff_token: value.args.and_then(|args| args.handoff_token),
    })
}

#[derive(Deserialize)]
struct RpcBody {
    cmd: Option<String>,
    args: Option<RpcArgs>,
}

#[derive(Deserialize)]
struct RpcArgs {
    #[serde(rename = "handoffToken")]
    handoff_token: Option<String>,
}

fn host_ok(headers: &[(String, String)], port: u16) -> bool {
    let Some(host) = header(headers, "host") else {
        return false;
    };
    host == "127.0.0.1" || host == format!("127.0.0.1:{port}")
}

fn discord_origin(origin: &str) -> bool {
    DISCORD_ORIGINS.contains(&origin)
}

fn header(headers: &[(String, String)], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.clone())
}

fn split_target(target: &str) -> (&str, &str) {
    target.split_once('?').unwrap_or((target, ""))
}

fn query_param(query: &str, name: &str) -> Option<String> {
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let Ok(key) = urlencoding::decode(key) else {
            continue;
        };
        if key == name {
            return urlencoding::decode(value)
                .ok()
                .map(|item| item.into_owned());
        }
    }
    None
}

async fn read_request(stream: &mut TcpStream) -> Result<RawRequest, ()> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    let header_end = loop {
        if buf.len() > MAX_HEADER {
            return Err(());
        }
        let n = match timeout(READ_TIMEOUT, stream.read(&mut tmp)).await {
            Ok(Ok(0)) | Ok(Err(_)) | Err(_) => return Err(()),
            Ok(Ok(n)) => n,
        };
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = buf.windows(4).position(|window| window == b"\r\n\r\n") {
            break pos;
        }
    };
    let head = String::from_utf8(buf[..header_end].to_vec()).map_err(|_| ())?;
    let mut lines = head.split("\r\n");
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("").to_string();
    if method.is_empty() || target.is_empty() {
        return Err(());
    }
    let mut headers = Vec::new();
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }
    let length = content_length(&headers).unwrap_or(0);
    if length > MAX_BODY {
        return Err(());
    }
    let mut body = buf[header_end + 4..].to_vec();
    while body.len() < length {
        let n = match timeout(READ_TIMEOUT, stream.read(&mut tmp)).await {
            Ok(Ok(0)) | Ok(Err(_)) | Err(_) => return Err(()),
            Ok(Ok(n)) => n,
        };
        body.extend_from_slice(&tmp[..n]);
        if body.len() > MAX_BODY {
            return Err(());
        }
    }
    body.truncate(length);
    Ok(RawRequest {
        method,
        target,
        headers,
        body,
    })
}

fn content_length(headers: &[(String, String)]) -> Option<usize> {
    header(headers, "content-length")?.parse().ok()
}

async fn write_response(stream: &mut TcpStream, response: &HttpResponse) -> Result<(), ()> {
    let mut bytes = format!("HTTP/1.1 {} {}\r\n", response.status, response.reason);
    for (name, value) in &response.headers {
        if value
            .chars()
            .any(|ch| ch.is_ascii_control() || ch == '\r' || ch == '\n')
        {
            continue;
        }
        bytes.push_str(name);
        bytes.push_str(": ");
        bytes.push_str(value);
        bytes.push_str("\r\n");
    }
    bytes.push_str("\r\n");
    timeout(READ_TIMEOUT, stream.write_all(bytes.as_bytes()))
        .await
        .map_err(|_| ())?
        .map_err(|_| ())?;
    if !response.body.is_empty() {
        timeout(READ_TIMEOUT, stream.write_all(response.body.as_bytes()))
            .await
            .map_err(|_| ())?
            .map_err(|_| ())?;
    }
    let _ = stream.shutdown().await;
    Ok(())
}

fn redact_known(message: &str, secrets: &[&str]) -> String {
    redact(message, secrets)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    const USER: &str = "MTIzNDU2Nzg5.QUJDREVGR0g.a1b2c3d4e5f6g7h8";
    const HANDOFF: &str = "handoff-secret-value";

    #[test]
    fn login_url_is_discord_and_names_the_loopback_handoff() {
        let key = new_handoff_key();
        assert!(key_ok(&key));
        let url = browser_login_url(54321, &key).unwrap();
        assert!(is_browser_login_url(&url));
        assert!(url.starts_with("https://discord.com/login?redirect_to="));
        assert_eq!(url.matches('&').count(), 0);
        assert!(!url.to_ascii_lowercase().contains("token"));
        assert!(!url.contains(HANDOFF));
        let redirect = urlencoding::decode(
            url.strip_prefix("https://discord.com/login?redirect_to=")
                .unwrap(),
        )
        .unwrap();
        assert_eq!(redirect.as_ref(), format!("/handoff?rpc=54321&key={key}"));
        assert!(browser_login_url(0, &key).is_err());
        assert!(browser_login_url(1, "not-a-key").is_err());
        assert!(!is_browser_login_url(
            "https://evil.example/login?redirect_to=%2Fhandoff"
        ));
        assert!(!is_browser_login_url(&format!(
            "https://discord.com/login?redirect_to=%2Fhandoff%3Frpc%3D1%26key%3D{key}&token=1"
        )));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn listener_is_loopback_only() {
        let listener = bind_loopback().await.unwrap();
        let addr = listener.local_addr().unwrap();
        assert_eq!(addr.ip(), Ipv4Addr::LOCALHOST);
        assert_ne!(addr.port(), 0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn discord_post_exchanges_once_and_the_response_hides_the_grant() {
        let listener = bind_loopback().await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let key = new_handoff_key();
        let (stop_tx, stop_rx) = watch::channel(false);
        let server_key = key.clone();
        let server = tokio::spawn(async move {
            finish_with(
                listener,
                server_key,
                stop_rx,
                Duration::from_secs(5),
                |got| async move {
                    assert_eq!(got.as_str(), HANDOFF);
                    Ok(USER.to_string())
                },
            )
            .await
        });

        let options = send_http(
            port,
            &format!(
                "OPTIONS /rpc?v=1 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://discord.com\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Private-Network: true\r\nContent-Length: 0\r\n\r\n"
            ),
        )
        .await;
        assert_eq!(status_code(&options.status), "204", "{}", options.status);
        assert!(header_has(
            &options.headers,
            "access-control-allow-origin",
            "https://discord.com"
        ));
        assert!(header_has(
            &options.headers,
            "access-control-allow-private-network",
            "true"
        ));

        let evil = json!({
            "cmd": COMMAND,
            "args": { "handoffToken": HANDOFF },
            "nonce": "n-evil"
        })
        .to_string();
        let rejected = send_http(
            port,
            &format!(
                "POST /rpc?v=1 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://evil.example\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{evil}",
                evil.len()
            ),
        )
        .await;
        assert_eq!(status_code(&rejected.status), "403", "{}", rejected.status);
        assert!(!header_has(
            &rejected.headers,
            "access-control-allow-origin",
            "https://evil.example"
        ));

        let empty = json!({
            "cmd": COMMAND,
            "args": { "handoffToken": "" },
            "nonce": "n-empty"
        })
        .to_string();
        let waiting = send_http(
            port,
            &format!(
                "POST /rpc?v=1 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://discord.com\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{empty}",
                empty.len()
            ),
        )
        .await;
        assert!(waiting.body.contains("\"evt\":\"ERROR\""));
        assert!(!waiting.body.contains(USER));

        let raw = json!({ "token": USER }).to_string();
        let ignored = send_http(
            port,
            &format!(
                "POST /rpc?v=1 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://discord.com\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{raw}",
                raw.len()
            ),
        )
        .await;
        assert!(!ignored.body.contains(USER));

        let body = json!({
            "cmd": COMMAND,
            "args": { "handoffToken": HANDOFF, "fingerprint": "fp" },
            "nonce": "n1"
        })
        .to_string();
        let ready = send_http(
            port,
            &format!(
                "POST /rpc?v=1 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://discord.com\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            ),
        )
        .await;
        assert_eq!(status_code(&ready.status), "200", "{}", ready.status);
        assert!(ready.body.contains("\"evt\":\"READY\""));
        assert!(!ready.body.contains(HANDOFF));
        assert!(!ready.body.contains(USER));
        assert!(header_has(&ready.headers, "cache-control", "no-store"));

        let token = server.await.unwrap().unwrap();
        assert_eq!(token, USER);
        drop(stop_tx);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn get_redirects_to_discord_and_not_to_the_callback() {
        let listener = bind_loopback().await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let key = new_handoff_key();
        let (_stop_tx, stop_rx) = watch::channel(false);
        let server = tokio::spawn(async move {
            finish_with(
                listener,
                key,
                stop_rx,
                Duration::from_secs(5),
                |got| async move {
                    assert_eq!(got.as_str(), HANDOFF);
                    Ok(USER.to_string())
                },
            )
            .await
        });
        let payload_json = json!({
            "cmd": COMMAND,
            "args": { "handoffToken": HANDOFF },
            "nonce": "n-get"
        })
        .to_string();
        let payload = urlencoding::encode(&payload_json);
        let callback = urlencoding::encode("https://evil.example/steal?token=1");
        let response = send_http(
            port,
            &format!(
                "GET /rpc?v=1&payload={payload}&callback={callback} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"
            ),
        )
        .await;
        assert_eq!(status_code(&response.status), "302", "{}", response.status);
        assert!(header_has(
            &response.headers,
            "location",
            "https://discord.com/handoff?done=true"
        ));
        assert!(!response
            .headers
            .iter()
            .any(|line| line.contains("evil.example")));
        assert!(!response.body.contains(HANDOFF));
        assert!(!response.body.contains(USER));
        assert_eq!(server.await.unwrap().unwrap(), USER);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn exchange_reads_the_session_and_hides_it_when_discord_rejects_it() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            let request = String::from_utf8_lossy(&buf[..n]);
            assert!(request.contains(HANDOFF));
            assert!(request.contains("\"handoff_token\""));
            let body = format!(r#"{{"token":"{USER}","user":{{"id":"1"}}}}"#);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(response.as_bytes()).await.unwrap();
        });
        let key = new_handoff_key();
        let got = exchange_at(
            &format!("http://{addr}/auth/handoff/exchange"),
            &key,
            HANDOFF,
        )
        .await
        .unwrap();
        assert_eq!(got, USER);

        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _ = sock.read(&mut buf).await.unwrap();
            let body = format!(r#"{{"message":"bad {HANDOFF}","code":50014}}"#);
            let response = format!(
                "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(response.as_bytes()).await.unwrap();
        });
        let err = exchange_at(
            &format!("http://{addr}/auth/handoff/exchange"),
            &key,
            HANDOFF,
        )
        .await
        .unwrap_err();
        assert!(err.contains("did not accept"));
        assert!(!err.contains(HANDOFF));
        assert!(!err.contains(USER));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancel_stops_the_listener_without_a_session() {
        let listener = bind_loopback().await.unwrap();
        let (stop_tx, stop_rx) = watch::channel(false);
        let server = tokio::spawn(async move {
            finish_with(
                listener,
                new_handoff_key(),
                stop_rx,
                Duration::from_secs(5),
                |_| async { Ok(USER.to_string()) },
            )
            .await
        });
        stop_tx.send(true).unwrap();
        match server.await.unwrap() {
            Err(GrantError::Cancelled) => {}
            other => panic!("expected cancel, got {}", other.is_ok()),
        }
    }

    struct HttpSeen {
        status: String,
        headers: Vec<String>,
        body: String,
    }

    async fn send_http(port: u16, request: &str) -> HttpSeen {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut buf = Vec::new();
        let mut tmp = [0u8; 1024];
        loop {
            match timeout(Duration::from_secs(3), stream.read(&mut tmp)).await {
                Ok(Ok(0)) | Err(_) => break,
                Ok(Err(_)) => break,
                Ok(Ok(n)) => buf.extend_from_slice(&tmp[..n]),
            }
            if buf.windows(4).any(|window| window == b"\r\n\r\n") {
                let head_end = buf
                    .windows(4)
                    .position(|window| window == b"\r\n\r\n")
                    .unwrap();
                let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
                let length = head
                    .lines()
                    .find_map(|line| {
                        line.split_once(':')
                            .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                            .and_then(|(_, value)| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if buf.len() >= head_end + 4 + length {
                    break;
                }
            }
        }
        let text = String::from_utf8_lossy(&buf).to_string();
        let (head, body) = text.split_once("\r\n\r\n").unwrap_or((text.as_str(), ""));
        let mut lines = head.split("\r\n");
        HttpSeen {
            status: lines.next().unwrap_or("").to_string(),
            headers: lines.map(|line| line.to_string()).collect(),
            body: body.to_string(),
        }
    }

    fn status_code(line: &str) -> &str {
        line.split_whitespace().nth(1).unwrap_or("")
    }

    fn header_has(headers: &[String], name: &str, value: &str) -> bool {
        headers.iter().any(|line| {
            line.split_once(':')
                .is_some_and(|(key, got)| key.eq_ignore_ascii_case(name) && got.trim() == value)
        })
    }
}
