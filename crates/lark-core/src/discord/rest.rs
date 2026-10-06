use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderMap, AUTHORIZATION};
use reqwest::multipart::{Form, Part};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::ratelimit::{route_key, retry_after_to_ms, should_send_typing, RateHeaders, RateLimiter};
use crate::redact::redact;

use super::types::{
    member_to_client, message_to_client, role_to_client, safe_file_name, snowflake_ok,
    validate_outgoing, ClientChannel, ClientMember, ClientMessage, ClientRole, DiscordChannel,
    DiscordMember, DiscordMessage, DiscordRole, DiscordUser,
};

const API: &str = "https://discord.com/api/v10";

#[derive(Debug, thiserror::Error)]
pub enum RestError {
    #[error("{0}")]
    Message(String),
    #[error("rate limited")]
    RateLimited,
    #[error("not connected")]
    Offline,
}

pub struct OutFile {
    pub name: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

pub struct DiscordRest {
    http: reqwest::Client,
    token: String,
    limiter: Mutex<RateLimiter>,
    typing_at: Mutex<HashMap<String, u64>>,
}

impl std::fmt::Debug for DiscordRest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("DiscordRest { token: [redacted] }")
    }
}

impl DiscordRest {
    pub fn new(token: String) -> Result<Self, RestError> {
        let http = reqwest::Client::builder()
            .user_agent("Lark/0.1.0 (personal client)")
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 2 || !is_discord_api_host(attempt.url().host_str().unwrap_or(""))
                {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| RestError::Message("Could not start HTTP client".into()))?;
        Ok(Self {
            http,
            token,
            limiter: Mutex::new(RateLimiter::new()),
            typing_at: Mutex::new(HashMap::new()),
        })
    }

    pub async fn current_user(&self) -> Result<super::types::ClientUser, RestError> {
        let value = self
            .send_json(Method::GET, "GET /users/@me", "me", "/users/@me", None)
            .await?;
        let user: DiscordUser = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read the account profile".into()))?;
        Ok(super::types::user_to_client(&user))
    }

    pub async fn guild_channels(&self, guild_id: &str) -> Result<Vec<ClientChannel>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/channels");
        let route = route_key("GET", "/guilds/{guild.id}/channels", guild_id);
        let value = self
            .send_json(Method::GET, &route, guild_id, &path, None)
            .await?;
        let channels: Vec<DiscordChannel> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read channels".into()))?;
        Ok(channels.iter().map(super::types::channel_to_client).collect())
    }

    pub async fn roles(&self, guild_id: &str) -> Result<Vec<ClientRole>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/roles");
        let route = route_key("GET", "/guilds/{guild.id}/roles", guild_id);
        let value = self.send_json(Method::GET, &route, guild_id, &path, None).await?;
        let roles: Vec<DiscordRole> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read roles".into()))?;
        Ok(roles.iter().map(role_to_client).collect())
    }

    pub async fn members(&self, guild_id: &str) -> Result<Vec<ClientMember>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/members?limit=100");
        let route = route_key("GET", "/guilds/{guild.id}/members", guild_id);
        let value = self.send_json(Method::GET, &route, guild_id, &path, None).await?;
        let members: Vec<DiscordMember> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read members".into()))?;
        Ok(members.iter().filter_map(member_to_client).collect())
    }

    pub async fn messages(
        &self,
        channel_id: &str,
        before: Option<&str>,
    ) -> Result<Vec<ClientMessage>, RestError> {
        self.ensure_snowflake(channel_id)?;
        if let Some(before) = before {
            self.ensure_snowflake(before)?;
        }
        let path = match before {
            Some(before) => format!("/channels/{channel_id}/messages?limit=50&before={before}"),
            None => format!("/channels/{channel_id}/messages?limit=50"),
        };
        let route = route_key("GET", "/channels/{channel.id}/messages", channel_id);
        let value = self
            .send_json(Method::GET, &route, channel_id, &path, None)
            .await?;
        let messages: Vec<DiscordMessage> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read messages".into()))?;
        Ok(messages.iter().map(message_to_client).collect())
    }

    pub async fn send_message(
        &self,
        channel_id: &str,
        content: &str,
        reply_to: Option<&str>,
        files: &[OutFile],
    ) -> Result<ClientMessage, RestError> {
        self.ensure_snowflake(channel_id)?;
        if let Some(reply_to) = reply_to {
            self.ensure_snowflake(reply_to)?;
        }
        let total: u64 = files.iter().map(|f| f.bytes.len() as u64).sum();
        validate_outgoing(content, files.len(), total).map_err(|m| RestError::Message(m.into()))?;
        let route = route_key("POST", "/channels/{channel.id}/messages", channel_id);
        let path = format!("/channels/{channel_id}/messages");
        let mut payload = json!({ "content": content });
        if let Some(reply_to) = reply_to {
            payload["message_reference"] = json!({
                "message_id": reply_to,
                "channel_id": channel_id,
                "fail_if_not_exists": false
            });
        }
        let response = self
            .send(Method::POST, &route, &path, Some(payload), files)
            .await?;
        let value = Self::json_body(response, &self.token).await?;
        let message: DiscordMessage = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read the sent message".into()))?;
        Ok(message_to_client(&message))
    }

    pub async fn edit_message(
        &self,
        channel_id: &str,
        message_id: &str,
        content: &str,
    ) -> Result<ClientMessage, RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        validate_outgoing(content, 0, 0).map_err(|m| RestError::Message(m.into()))?;
        let route = route_key(
            "PATCH",
            "/channels/{channel.id}/messages/{message.id}",
            channel_id,
        );
        let path = format!("/channels/{channel_id}/messages/{message_id}");
        let response = self
            .send(
                Method::PATCH,
                &route,
                &path,
                Some(json!({ "content": content })),
                &[],
            )
            .await?;
        let value = Self::json_body(response, &self.token).await?;
        let message: DiscordMessage = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read the edited message".into()))?;
        Ok(message_to_client(&message))
    }

    pub async fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<(), RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        let route = route_key(
            "DELETE",
            "/channels/{channel.id}/messages/{message.id}",
            channel_id,
        );
        let path = format!("/channels/{channel_id}/messages/{message_id}");
        let response = self.send(Method::DELETE, &route, &path, None, &[]).await?;
        if response.status().is_success() || response.status().as_u16() == 204 {
            return Ok(());
        }
        let _ = Self::json_body(response, &self.token).await?;
        Ok(())
    }

    pub async fn toggle_reaction(
        &self,
        channel_id: &str,
        message_id: &str,
        emoji: &str,
        emoji_id: Option<&str>,
        add: bool,
    ) -> Result<(), RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        let encoded = reaction_emoji_path(emoji, emoji_id);
        let path = format!(
            "/channels/{channel_id}/messages/{message_id}/reactions/{encoded}/@me"
        );
        let route = route_key(
            if add { "PUT" } else { "DELETE" },
            "/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me",
            channel_id,
        );
        let method = if add { Method::PUT } else { Method::DELETE };
        let response = self.send(method, &route, &path, None, &[]).await?;
        if response.status().is_success() || response.status().as_u16() == 204 {
            return Ok(());
        }
        let _ = Self::json_body(response, &self.token).await?;
        Ok(())
    }

    pub async fn typing(&self, channel_id: &str) -> Result<(), RestError> {
        self.ensure_snowflake(channel_id)?;
        let now = now_ms();
        let mut typing = self.typing_at.lock().await;
        if !should_send_typing(typing.get(channel_id).copied(), now) {
            return Ok(());
        }
        typing.insert(channel_id.to_string(), now);
        drop(typing);
        let route = route_key("POST", "/channels/{channel.id}/typing", channel_id);
        let path = format!("/channels/{channel_id}/typing");
        let response = self.send(Method::POST, &route, &path, None, &[]).await?;
        if response.status().is_success() || response.status().as_u16() == 204 {
            return Ok(());
        }
        let _ = Self::json_body(response, &self.token).await?;
        Ok(())
    }

    fn ensure_snowflake(&self, value: &str) -> Result<(), RestError> {
        if snowflake_ok(value) {
            Ok(())
        } else {
            Err(RestError::Message("That id is not a Discord snowflake".into()))
        }
    }

    async fn send_json(
        &self,
        method: Method,
        route: &str,
        _major: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, RestError> {
        let response = self.send(method, route, path, body, &[]).await?;
        Self::json_body(response, &self.token).await
    }

    async fn send(
        &self,
        method: Method,
        route: &str,
        path: &str,
        body: Option<Value>,
        files: &[OutFile],
    ) -> Result<reqwest::Response, RestError> {
        let url = api_url(path)?;
        for attempt in 0..6 {
            let decision = {
                let mut limiter = self.limiter.lock().await;
                limiter.reserve(route, now_ms())
            };
            if let crate::ratelimit::Decision::Wait { delay_ms, .. } = decision {
                tokio::time::sleep(Duration::from_millis(delay_ms.min(60_000))).await;
                continue;
            }
            let mut request = self.http.request(method.clone(), &url);
            request = request.header(AUTHORIZATION, &self.token);
            if files.is_empty() {
                if let Some(body) = &body {
                    request = request.json(body);
                }
            } else if let Some(body) = &body {
                let mut form = Form::new().text("payload_json", body.to_string());
                for (index, file) in files.iter().enumerate() {
                    form = form.part(format!("files[{index}]"), file_part(file));
                }
                request = request.multipart(form);
            }
            let response = match request.send().await {
                Ok(response) => response,
                Err(err) => {
                    let text = redact(&err.to_string(), &[&self.token]);
                    log_line(&format!("request failed: {text}"));
                    return Err(RestError::Message(
                        "The request to Discord failed. Check the connection and try again.".into(),
                    ));
                }
            };
            if let Some(parsed) = rate_headers(response.headers()) {
                self.limiter
                    .lock()
                    .await
                    .observe_headers(route, &parsed, now_ms());
            }
            if response.status().as_u16() == 429 {
                let text = response.text().await.unwrap_or_default();
                let parsed: TooMany = serde_json::from_str(&text).unwrap_or(TooMany {
                    retry_after: 1.0,
                    global: false,
                });
                self.limiter.lock().await.observe_429(
                    route,
                    retry_after_to_ms(parsed.retry_after),
                    parsed.global,
                    now_ms(),
                );
                if attempt == 5 {
                    return Err(RestError::RateLimited);
                }
                continue;
            }
            return Ok(response);
        }
        Err(RestError::RateLimited)
    }

    async fn json_body(response: reqwest::Response, token: &str) -> Result<Value, RestError> {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            let message = serde_json::from_str::<DiscordError>(&text)
                .map(|body| body.message)
                .unwrap_or_else(|_| format!("HTTP {}", status.as_u16()));
            let message = redact(&message, &[token]);
            return Err(RestError::Message(format!(
                "Discord returned {}: {message}",
                status.as_u16()
            )));
        }
        if text.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text).map_err(|_| RestError::Message("Discord returned an unexpected payload".into()))
    }
}

#[derive(Deserialize)]
struct TooMany {
    retry_after: f64,
    #[serde(default)]
    global: bool,
}

#[derive(Deserialize)]
struct DiscordError {
    #[serde(default)]
    message: String,
}

pub fn api_url(path: &str) -> Result<String, RestError> {
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err(RestError::Message("Refusing to build that request URL".into()));
    }
    Ok(format!("{API}{path}"))
}

pub fn is_discord_api_host(host: &str) -> bool {
    host == "discord.com"
}

fn file_part(file: &OutFile) -> Part {
    let name = safe_file_name(&file.name);
    let mime = if file.mime.is_empty() {
        "application/octet-stream"
    } else {
        file.mime.as_str()
    };
    let bytes = file.bytes.clone();
    let part = Part::bytes(bytes.clone()).file_name(name.clone());
    match part.mime_str(mime) {
        Ok(part) => part,
        Err(_) => Part::bytes(bytes).file_name(name),
    }
}

pub fn reaction_emoji_path(name: &str, id: Option<&str>) -> String {
    match id {
        Some(id) if !id.is_empty() => {
            format!("{}:{}", urlencoding::encode(name), urlencoding::encode(id))
        }
        _ => urlencoding::encode(name).into_owned(),
    }
}

pub fn rate_headers(headers: &HeaderMap) -> Option<RateHeaders> {
    let limit = header_u32(headers, "x-ratelimit-limit")?;
    let remaining = header_u32(headers, "x-ratelimit-remaining").unwrap_or(0);
    let reset_after = header_f64(headers, "x-ratelimit-reset-after").unwrap_or(0.0);
    let bucket = headers
        .get("x-ratelimit-bucket")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let global = headers.get("x-ratelimit-global").is_some();
    Some(RateHeaders {
        limit,
        remaining,
        reset_after_ms: retry_after_to_ms(reset_after),
        bucket,
        global,
    })
}

fn header_u32(headers: &HeaderMap, name: &str) -> Option<u32> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
}

fn header_f64(headers: &HeaderMap, name: &str) -> Option<f64> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn log_line(line: &str) {
    eprintln!("{line}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_urls_stay_on_discord() {
        assert_eq!(
            api_url("/users/@me").unwrap(),
            "https://discord.com/api/v10/users/@me"
        );
        assert!(api_url("https://evil.example").is_err());
        assert!(api_url("/users/../../evil").is_err());
        assert!(is_discord_api_host("discord.com"));
        assert!(!is_discord_api_host("discord.com.evil.example"));
        assert!(!is_discord_api_host("example.com"));
    }

    #[test]
    fn reaction_paths_are_encoded() {
        assert_eq!(reaction_emoji_path("🔥", None), "%F0%9F%94%A5");
        assert_eq!(
            reaction_emoji_path("lark", Some("99")),
            "lark:99"
        );
    }

    #[test]
    fn parses_rate_limit_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-limit", "5".parse().unwrap());
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset-after", "1.25".parse().unwrap());
        headers.insert("x-ratelimit-bucket", "abc".parse().unwrap());
        let parsed = rate_headers(&headers).unwrap();
        assert_eq!(parsed.limit, 5);
        assert_eq!(parsed.remaining, 0);
        assert_eq!(parsed.reset_after_ms, 1_250);
        assert_eq!(parsed.bucket.as_deref(), Some("abc"));
        assert!(!parsed.global);
    }

    #[test]
    fn debug_does_not_include_the_token() {
        let client = DiscordRest::new("super-secret-token-value".into()).unwrap();
        let rendered = format!("{client:?}");
        assert!(!rendered.contains("super-secret-token-value"));
        assert!(rendered.contains("[redacted]"));
    }
}
