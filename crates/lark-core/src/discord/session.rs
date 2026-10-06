//! Discord sign-in shaped like Spotifast's browser grant.
//!
//! Spotifast opens Spotify's account page and receives a one-time grant on a
//! loopback port. It does not read page storage. Discord will not redirect a
//! user session to that port, and its OAuth consent screen cannot grant the
//! session a full client needs. Discord's own page is allowed to call
//! `http://127.0.0.1`, so the login window posts the session from Discord's
//! auth response there. The password stays on Discord's page.

use std::collections::HashMap;
use std::io;
use std::net::{Ipv4Addr, TcpListener as StdTcpListener};
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use zeroize::Zeroize;

use crate::normalize_user_token;

const SESSION_PATH: &str = "/session";
const MAX_HEADERS: usize = 8 * 1024;
const MAX_BODY: usize = 4 * 1024;
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const READ_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionError {
    Cancelled,
    TimedOut,
    Bind,
    Io,
}

impl SessionError {
    pub fn message(self) -> &'static str {
        match self {
            Self::Cancelled => {
                "The Discord login window was closed before Discord returned a session."
            }
            Self::TimedOut => {
                "Discord's login page did not return a session. Finish password, captcha, and any code in that window, then try again."
            }
            Self::Bind => "Lark couldn't open a local port for Discord's sign-in.",
            Self::Io => "The sign-in listener stopped before Discord returned a session.",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Retain {
    Kept,
    Missing,
    Different,
}

pub fn bind_loopback() -> Result<(StdTcpListener, u16), SessionError> {
    let listener =
        StdTcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|_| SessionError::Bind)?;
    let port = listener
        .local_addr()
        .map_err(|_| SessionError::Bind)?
        .port();
    Ok((listener, port))
}

pub fn random_state() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn install_script(port: u16, state: &str) -> String {
    let state_json = serde_json::to_string(state).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        "{source}\ntry {{\n  const host = String(location.hostname || \"\").toLowerCase();\n  const discord = host === \"discord.com\" || host.endsWith(\".discord.com\") || host === \"discordapp.com\" || host.endsWith(\".discordapp.com\");\n  if (discord) installLarkSessionHandoff({{ port: {port}, state: {state_json} }});\n}} catch (err) {{}}\n",
        source = include_str!("session_handoff.js"),
    )
}

pub fn credential_retain_failure(store: &str) -> String {
    format!(
        "{store} did not retain the Discord session. Unlock it and sign in again. Lark did not try to connect without a saved session."
    )
}

pub fn retain_status(stored: Option<&str>, expected: &str) -> Retain {
    match stored {
        None => Retain::Missing,
        Some(value) if same_secret(value, expected) => Retain::Kept,
        Some(_) => Retain::Different,
    }
}

pub fn same_secret(left: &str, right: &str) -> bool {
    let (left, right) = (left.as_bytes(), right.as_bytes());
    let mut diff = left.len() ^ right.len();
    let len = left.len().max(right.len());
    for index in 0..len {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        diff |= (a ^ b) as usize;
    }
    diff == 0
}

pub async fn accept_grant(
    listener: StdTcpListener,
    expected_state: &str,
    cancel: watch::Receiver<bool>,
) -> Result<String, SessionError> {
    accept_grant_for(listener, expected_state, cancel, LOGIN_TIMEOUT).await
}

pub async fn accept_grant_for(
    listener: StdTcpListener,
    expected_state: &str,
    mut cancel: watch::Receiver<bool>,
    timeout: Duration,
) -> Result<String, SessionError> {
    listener
        .set_nonblocking(true)
        .map_err(|_| SessionError::Io)?;
    let listener = TcpListener::from_std(listener).map_err(|_| SessionError::Io)?;
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);
    loop {
        if *cancel.borrow() {
            return Err(SessionError::Cancelled);
        }
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, addr) = accepted.map_err(|_| SessionError::Io)?;
                if !addr.ip().is_loopback() {
                    continue;
                }
                if let Some(token) = take_grant(stream, expected_state).await {
                    return Ok(token);
                }
            }
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    return Err(SessionError::Cancelled);
                }
            }
            _ = &mut deadline => return Err(SessionError::TimedOut),
        }
    }
}

async fn take_grant(mut stream: TcpStream, expected_state: &str) -> Option<String> {
    let request = match read_request(&mut stream).await {
        Ok(request) => request,
        Err(_) => return None,
    };
    let origin = request
        .headers
        .get("origin")
        .map(String::as_str)
        .filter(|origin| origin_allowed(origin));
    if request.method == "OPTIONS" && request.path == SESSION_PATH {
        let status = if origin.is_some() { 204 } else { 403 };
        let _ = write_response(&mut stream, status, origin, &[]).await;
        return None;
    }
    if request.method != "POST" || request.path != SESSION_PATH || origin.is_none() {
        let _ = write_response(&mut stream, 404, origin, &[]).await;
        return None;
    }
    let Some(mut grant) = parse_grant(&request.body) else {
        let _ = write_response(&mut stream, 400, origin, &[]).await;
        return None;
    };
    let state_ok = same_secret(&grant.state, expected_state) && !expected_state.is_empty();
    grant.state.zeroize();
    if !state_ok {
        grant.token.zeroize();
        let _ = write_response(&mut stream, 400, origin, &[]).await;
        return None;
    }
    let token = match normalize_user_token(&grant.token) {
        Ok(token) => token,
        Err(_) => {
            grant.token.zeroize();
            let _ = write_response(&mut stream, 400, origin, &[]).await;
            return None;
        }
    };
    grant.token.zeroize();
    let _ = write_response(&mut stream, 204, origin, &[]).await;
    Some(token)
}

#[derive(Deserialize)]
struct GrantBody {
    state: String,
    token: String,
}

struct Grant {
    state: String,
    token: String,
}

fn parse_grant(body: &[u8]) -> Option<Grant> {
    let text = std::str::from_utf8(body).ok()?;
    let mut parsed = serde_json::from_str::<GrantBody>(text).ok()?;
    if parsed.state.len() > 128 || parsed.token.len() > 800 {
        parsed.state.zeroize();
        parsed.token.zeroize();
        return None;
    }
    Some(Grant {
        state: parsed.state,
        token: parsed.token,
    })
}

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl Drop for Request {
    fn drop(&mut self) {
        self.body.fill(0);
    }
}

async fn read_request(stream: &mut TcpStream) -> io::Result<Request> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    let header_end = loop {
        if buf.len() > MAX_HEADERS {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "headers"));
        }
        let read = tokio::time::timeout(READ_TIMEOUT, stream.read(&mut tmp))
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "headers"))??;
        if read == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "closed"));
        }
        buf.extend_from_slice(&tmp[..read]);
        if let Some(pos) = find_header_end(&buf) {
            break pos;
        }
    };
    let header_text = std::str::from_utf8(&buf[..header_end])
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "headers"))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "request"))?;
    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "header"));
        };
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_ascii_uppercase();
    let target = parts.next().unwrap_or("");
    let path = target
        .split(['?', '#'])
        .next()
        .unwrap_or(target)
        .to_string();
    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_BODY {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "body"));
    }
    let mut body = buf[header_end..].to_vec();
    while body.len() < content_length {
        let read = tokio::time::timeout(READ_TIMEOUT, stream.read(&mut tmp))
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "body"))??;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..read]);
    }
    if body.len() < content_length {
        return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "body"));
    }
    body.truncate(content_length);
    Ok(Request {
        method,
        path,
        headers,
        body,
    })
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|pos| pos + 4)
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    origin: Option<&str>,
    body: &[u8],
) -> io::Result<()> {
    let reason = match status {
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    };
    let mut headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n",
        body.len()
    );
    if let Some(origin) = origin {
        headers.push_str("Access-Control-Allow-Origin: ");
        headers.push_str(origin);
        headers.push_str("\r\nVary: Origin\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Private-Network: true\r\nAccess-Control-Max-Age: 600\r\n");
    }
    headers.push_str("\r\n");
    stream.write_all(headers.as_bytes()).await?;
    if !body.is_empty() {
        stream.write_all(body).await?;
    }
    let _ = stream.shutdown().await;
    Ok(())
}

pub fn origin_allowed(origin: &str) -> bool {
    if origin.is_empty()
        || origin
            .chars()
            .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return false;
    }
    let Some(rest) = origin.strip_prefix("https://") else {
        return false;
    };
    if rest.contains('/') || rest.contains('@') || rest.contains('\\') || rest.contains('%') {
        return false;
    }
    let host = rest.split(':').next().unwrap_or("");
    discord_host(host)
}

fn discord_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == "discord.com"
        || host.ends_with(".discord.com")
        || host == "discordapp.com"
        || host.ends_with(".discordapp.com")
}

#[cfg(test)]
mod tests {
    use super::*;

    const USER: &str = "MTIzNDU2Nzg5.QUJDREVGR0g.a1b2c3d4e5f6g7h8";

    #[test]
    fn install_script_is_a_handoff_not_a_storage_poll() {
        let script = install_script(43123, "state-value");
        assert!(script.contains("installLarkSessionHandoff"));
        assert!(script.contains("43123"));
        assert!(script.contains("\"state-value\""));
        assert!(script.contains("127.0.0.1"));
        let lower = script.to_ascii_lowercase();
        assert!(!lower.contains("localstorage"));
        assert!(!lower.contains("sessionstorage"));
        assert!(!lower.contains("setinterval"));
        assert!(!lower.contains("console."));
        assert!(!script.contains(USER));
        let quoted = install_script(1, "a\"b</script>");
        assert!(quoted.contains("\"a\\\"b</script>\""));
        assert!(!quoted.contains("state: a\"b"));
    }

    #[test]
    fn messages_do_not_claim_the_keychain_is_empty() {
        for error in [
            SessionError::Cancelled,
            SessionError::TimedOut,
            SessionError::Bind,
            SessionError::Io,
        ] {
            let message = error.message();
            assert!(!message.contains("No token saved"));
            assert!(!message.contains(USER));
        }
        let retain = credential_retain_failure("macOS Keychain");
        assert!(retain.contains("macOS Keychain"));
        assert!(retain.contains("did not retain"));
        assert!(retain.contains("did not try to connect"));
        assert!(!retain.contains("No token saved"));
        assert!(!retain.contains(USER));
    }

    #[test]
    fn retain_status_compares_without_echoing_the_secret() {
        assert_eq!(retain_status(None, USER), Retain::Missing);
        assert_eq!(retain_status(Some(USER), USER), Retain::Kept);
        assert_eq!(
            retain_status(Some("other-value-not-the-token"), USER),
            Retain::Different
        );
        assert!(same_secret("abc", "abc"));
        assert!(!same_secret("abc", "abd"));
        assert!(!same_secret("abc", "abcd"));
    }

    #[test]
    fn origins_are_discord_https_only() {
        assert!(origin_allowed("https://discord.com"));
        assert!(origin_allowed("https://ptb.discord.com"));
        assert!(origin_allowed("https://canary.discord.com"));
        assert!(origin_allowed("https://discordapp.com"));
        assert!(!origin_allowed("http://discord.com"));
        assert!(!origin_allowed("https://evil.example"));
        assert!(!origin_allowed("https://discord.com.evil.example"));
        assert!(!origin_allowed("https://discord.com\r\nX: y"));
        assert!(!origin_allowed("https://user:token@discord.com"));
        assert!(!origin_allowed("https://discord.com/channels"));
        assert!(!origin_allowed(""));
    }

    #[tokio::test]
    async fn loopback_accepts_one_matching_grant_and_rejects_the_rest() {
        let (listener, port) = bind_loopback().unwrap();
        let (cancel_tx, cancel_rx) = watch::channel(false);
        let expected = "state-1".to_string();
        let task_state = expected.clone();
        let task = tokio::spawn(async move {
            accept_grant_for(listener, &task_state, cancel_rx, Duration::from_secs(5)).await
        });

        let preflight = exchange(
            port,
            "OPTIONS /session HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://discord.com\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Private-Network: true\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(preflight.starts_with("HTTP/1.1 204"));
        assert!(preflight.contains("Access-Control-Allow-Private-Network: true"));
        assert!(preflight.contains("Access-Control-Allow-Origin: https://discord.com"));

        let evil = exchange(
            port,
            "OPTIONS /session HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(evil.starts_with("HTTP/1.1 403"));
        assert!(!evil.contains(USER));

        let wrong_state = body_request(port, "https://ptb.discord.com", "nope", USER);
        let wrong = exchange(port, &wrong_state).await;
        assert!(wrong.starts_with("HTTP/1.1 400"));
        assert!(!wrong.contains(USER));

        let query = format!(
            "GET /session?token={USER} HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://discord.com\r\nConnection: close\r\n\r\n"
        );
        let ignored = exchange(port, &query).await;
        assert!(ignored.starts_with("HTTP/1.1 404"));
        assert!(!ignored.contains(USER));

        let bad = body_request(port, "https://discord.com", &expected, "not a token");
        let rejected = exchange(port, &bad).await;
        assert!(rejected.starts_with("HTTP/1.1 400"));
        assert!(!rejected.contains("not a token"));

        let good = body_request(port, "https://canary.discord.com", &expected, USER);
        let accepted = exchange(port, &good).await;
        assert!(accepted.starts_with("HTTP/1.1 204"));
        assert!(!accepted.contains(USER));
        let token = task.await.unwrap().unwrap();
        assert_eq!(token, USER);
        let _ = cancel_tx.send(true);
    }

    #[tokio::test]
    async fn cancel_ends_the_listener_without_a_grant() {
        let (listener, _port) = bind_loopback().unwrap();
        let (cancel_tx, cancel_rx) = watch::channel(false);
        let task = tokio::spawn(async move {
            accept_grant_for(listener, "state", cancel_rx, Duration::from_secs(5)).await
        });
        cancel_tx.send(true).unwrap();
        let error = task.await.unwrap().unwrap_err();
        assert_eq!(error, SessionError::Cancelled);
        assert!(!error.message().contains("No token saved"));
    }

    fn body_request(port: u16, origin: &str, state: &str, token: &str) -> String {
        let body = serde_json::json!({ "state": state, "token": token }).to_string();
        format!(
            "POST /session HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {origin}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    async fn exchange(port: u16, request: &str) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        stream.write_all(request.as_bytes()).await.unwrap();
        let _ = stream.shutdown().await;
        let mut buf = Vec::new();
        let _ = tokio::time::timeout(Duration::from_secs(2), stream.read_to_end(&mut buf)).await;
        String::from_utf8(buf).unwrap_or_default()
    }
}
