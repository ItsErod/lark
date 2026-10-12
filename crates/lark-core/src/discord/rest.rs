use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderMap, AUTHORIZATION};
use reqwest::multipart::{Form, Part};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{watch, Mutex};

use crate::ratelimit::{
    backed_off_retry_ms, jitter_ms, retry_after_to_ms, route_key, should_send_typing, RateHeaders,
    RateLimiter,
};
use crate::redact::redact;

use super::guild_admin::{build_admin_call, GuildAdminRequest};
use super::shell::{encode_guild_folders, invite_code_ok, invite_from_json, ClientFolder, ClientInvite};
use super::types::{
    channel_to_client, friends_from_relationships, member_to_client, message_to_client,
    profile_from_value, role_to_client, safe_file_name, snowflake_ok, validate_outgoing,
    ClientChannel, ClientEmoji, ClientMember, ClientMessage, ClientProfile, ClientRole,
    DiscordChannel, DiscordMember, DiscordMessage, DiscordRole, DiscordUser,
};

const API: &str = "https://discord.com/api/v10";
const NOTE_LIMIT: usize = 256;

/// Discord notes are short. Drop a NUL and keep the first 256 characters.
pub fn clamp_note(note: &str) -> String {
    note.chars().filter(|ch| *ch != '\0').take(NOTE_LIMIT).collect()
}

pub fn note_from_value(value: &Value) -> String {
    value.get("note").and_then(|item| item.as_str()).map(clamp_note).unwrap_or_default()
}

/// Nonce Discord will echo on MESSAGE_CREATE. Empty, long, or odd values are omitted.
pub fn usable_nonce(nonce: Option<&str>) -> Option<String> {
    let text = nonce?.trim();
    if text.is_empty() || text.len() > 25 {
        return None;
    }
    if !text.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
        return None;
    }
    Some(text.to_string())
}

pub fn outgoing_payload(content: &str, channel_id: &str, reply_to: Option<&str>, nonce: Option<&str>) -> Value {
    let mut payload = json!({ "content": content });
    if let Some(reply_to) = reply_to {
        payload["message_reference"] = json!({
            "message_id": reply_to,
            "channel_id": channel_id,
            "fail_if_not_exists": false
        });
    }
    if let Some(nonce) = usable_nonce(nonce) {
        payload["nonce"] = Value::String(nonce);
    }
    payload
}

type ChannelResult = Result<Vec<ClientChannel>, String>;
type ChannelTx = watch::Sender<Option<ChannelResult>>;
type ChannelRx = watch::Receiver<Option<ChannelResult>>;

#[derive(Debug, thiserror::Error)]
pub enum RestError {
    #[error("{0}")]
    Message(String),
    #[error("Discord rate limited the request (HTTP 429). Wait a moment and try again.")]
    RateLimited,
    #[error("not connected")]
    Offline,
}

impl RestError {
    pub fn is_unauthorized(&self) -> bool {
        match self {
            RestError::Message(message) => message.contains("HTTP 401"),
            _ => false,
        }
    }
}

/// A Discord HTTP status, with the API `message` field if it had one.
/// The message must already be redacted.
pub fn explain_api_status(status: u16, discord_message: &str) -> String {
    let extra = if discord_message.trim().is_empty() {
        String::new()
    } else {
        format!(" Discord said: {}.", discord_message.trim())
    };
    match status {
        401 => format!(
            "Discord rejected the token (HTTP 401).{extra} It may be expired, revoked, or still wrapped in quotes. Lark sent it only to discord.com."
        ),
        403 => format!(
            "Discord refused the request (HTTP 403).{extra} The token was only sent to discord.com. A 403 here is Discord or Cloudflare blocking the call, not a failed Keychain write."
        ),
        429 => "Discord rate limited the sign-in check (HTTP 429). Wait a moment and try again.".into(),
        _ => format!("Discord returned HTTP {status}.{extra}"),
    }
}

/// A failure before Discord returned a status. `detail` must already be redacted.
pub fn explain_transport(detail: &str) -> String {
    let lower = detail.to_ascii_lowercase();
    if lower.contains("dns")
        || lower.contains("failed to lookup")
        || lower.contains("name or service not known")
        || lower.contains("nodename nor servname")
    {
        return format!(
            "Could not resolve discord.com. Check the network connection. {}",
            safe_detail(detail)
        );
    }
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        return format!(
            "The TLS connection to discord.com failed. {}",
            safe_detail(detail)
        );
    }
    if lower.contains("timed out") || lower.contains("timeout") {
        return "The connection to discord.com timed out. Check the network and try again.".into();
    }
    if lower.contains("connection refused")
        || lower.contains("network is unreachable")
        || lower.contains("os error")
    {
        return format!(
            "Could not reach discord.com. A firewall may be blocking Lark. {}",
            safe_detail(detail)
        );
    }
    format!(
        "The request to Discord failed before a response arrived. {}",
        safe_detail(detail)
    )
}

fn safe_detail(detail: &str) -> String {
    let detail = detail.trim();
    if detail.is_empty() || detail.len() > 180 {
        String::new()
    } else {
        detail.to_string()
    }
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
    /// One in-flight `GET /guilds/{id}/channels` per guild. Followers wait on it.
    channel_fetches: StdMutex<HashMap<String, ChannelRx>>,
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
                if attempt.previous().len() >= 2
                    || !is_discord_api_host(attempt.url().host_str().unwrap_or(""))
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
            channel_fetches: StdMutex::new(HashMap::new()),
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
        let role = {
            let mut inflight = self
                .channel_fetches
                .lock()
                .unwrap_or_else(|err| err.into_inner());
            if let Some(rx) = inflight.get(guild_id).cloned() {
                ChannelFetch::Follow(rx)
            } else {
                let (tx, rx) = watch::channel(None);
                inflight.insert(guild_id.to_string(), rx);
                ChannelFetch::Lead(tx)
            }
        };
        match role {
            ChannelFetch::Follow(mut rx) => loop {
                if let Some(result) = rx.borrow().clone() {
                    return result.map_err(RestError::Message);
                }
                if rx.changed().await.is_err() {
                    return Err(RestError::Message("Could not read channels".into()));
                }
            },
            ChannelFetch::Lead(tx) => {
                let mut lead = ChannelLead {
                    rest: self,
                    id: guild_id,
                    tx: Some(tx),
                };
                let result = self.fetch_guild_channels(guild_id).await;
                let shared = match &result {
                    Ok(channels) => Ok(channels.clone()),
                    Err(err) => Err(err.to_string()),
                };
                if let Some(tx) = lead.tx.take() {
                    let _ = tx.send(Some(shared));
                }
                drop(lead);
                result
            }
        }
    }

    async fn fetch_guild_channels(&self, guild_id: &str) -> Result<Vec<ClientChannel>, RestError> {
        let path = format!("/guilds/{guild_id}/channels");
        let route = route_key("GET", "/guilds/{guild.id}/channels", guild_id);
        let value = self
            .send_json(Method::GET, &route, guild_id, &path, None)
            .await?;
        let channels: Vec<DiscordChannel> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read channels".into()))?;
        Ok(channels
            .iter()
            .map(super::types::channel_to_client)
            .collect())
    }

    pub async fn roles(&self, guild_id: &str) -> Result<Vec<ClientRole>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/roles");
        let route = route_key("GET", "/guilds/{guild.id}/roles", guild_id);
        let value = self
            .send_json(Method::GET, &route, guild_id, &path, None)
            .await?;
        let roles: Vec<DiscordRole> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read roles".into()))?;
        Ok(roles.iter().map(role_to_client).collect())
    }

    pub async fn private_channels(&self) -> Result<Vec<ClientChannel>, RestError> {
        let value = self
            .send_json(
                Method::GET,
                "GET /users/@me/channels",
                "me",
                "/users/@me/channels",
                None,
            )
            .await?;
        let channels: Vec<DiscordChannel> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read direct messages".into()))?;
        Ok(channels
            .iter()
            .map(super::types::channel_to_client)
            .filter(|channel| channel.kind == "dm" || channel.kind == "group")
            .collect())
    }

    pub async fn relationships(&self) -> Result<Vec<ClientMember>, RestError> {
        let value = self
            .send_json(
                Method::GET,
                "GET /users/@me/relationships",
                "me",
                "/users/@me/relationships",
                None,
            )
            .await?;
        Ok(friends_from_relationships(&value, None))
    }

    /// A note only the signed-in account can see. Discord returns 404 when there is none.
    pub async fn user_note(&self, user_id: &str) -> Result<String, RestError> {
        self.ensure_snowflake(user_id)?;
        let path = format!("/users/@me/notes/{user_id}");
        let response = self
            .send(Method::GET, "GET /users/@me/notes/{user.id}", &path, None, &[])
            .await?;
        if response.status().as_u16() == 404 {
            return Ok(String::new());
        }
        let value = Self::json_body(response, &self.token).await?;
        Ok(note_from_value(&value))
    }

    pub async fn set_user_note(&self, user_id: &str, note: &str) -> Result<(), RestError> {
        self.ensure_snowflake(user_id)?;
        let note = clamp_note(note);
        let path = format!("/users/@me/notes/{user_id}");
        self.send_json(
            Method::PUT,
            "PUT /users/@me/notes/{user.id}",
            "me",
            &path,
            Some(json!({ "note": note })),
        )
        .await?;
        Ok(())
    }

    pub async fn open_dm(&self, user_id: &str) -> Result<ClientChannel, RestError> {
        self.ensure_snowflake(user_id)?;
        let value = self
            .send_json(
                Method::POST,
                "POST /users/@me/channels",
                "me",
                "/users/@me/channels",
                Some(json!({ "recipient_id": user_id })),
            )
            .await?;
        let channel: DiscordChannel = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not open that conversation".into()))?;
        Ok(super::types::channel_to_client(&channel))
    }

    pub async fn user_profile(
        &self,
        user_id: &str,
        guild_id: Option<&str>,
    ) -> Result<ClientProfile, RestError> {
        self.ensure_snowflake(user_id)?;
        let guild = guild_id.filter(|id| snowflake_ok(id));
        let path = match guild {
            Some(guild) => format!(
                "/users/{user_id}/profile?with_mutual_guilds=true&with_mutual_friends_count=true&guild_id={guild}"
            ),
            None => format!(
                "/users/{user_id}/profile?with_mutual_guilds=true&with_mutual_friends_count=true"
            ),
        };
        let route = route_key("GET", "/users/{user.id}/profile", user_id);
        let value = self
            .send_json(Method::GET, &route, user_id, &path, None)
            .await?;
        profile_from_value(&value)
            .ok_or_else(|| RestError::Message("Could not read that profile".into()))
    }

    pub async fn members(&self, guild_id: &str) -> Result<Vec<ClientMember>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/members?limit=100");
        let route = route_key("GET", "/guilds/{guild.id}/members", guild_id);
        let value = self
            .send_json(Method::GET, &route, guild_id, &path, None)
            .await?;
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
        let path = messages_path(channel_id, before);
        let route = route_key("GET", "/channels/{channel.id}/messages", channel_id);
        let value = self
            .send_json(Method::GET, &route, channel_id, &path, None)
            .await?;
        let messages: Vec<DiscordMessage> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read messages".into()))?;
        Ok(messages.iter().map(message_to_client).collect())
    }

    /// One mark-read for the channel the user is looking at. Not a bulk sweep.
    pub async fn ack_message(&self, channel_id: &str, message_id: &str) -> Result<(), RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        let path = format!("/channels/{channel_id}/messages/{message_id}/ack");
        let route = route_key(
            "POST",
            "/channels/{channel.id}/messages/{message.id}/ack",
            channel_id,
        );
        self.send_json(
            Method::POST,
            &route,
            channel_id,
            &path,
            Some(json!({"token": null})),
        )
        .await?;
        Ok(())
    }

    pub async fn pins(&self, channel_id: &str) -> Result<Vec<ClientMessage>, RestError> {
        self.ensure_snowflake(channel_id)?;
        let path = format!("/channels/{channel_id}/pins");
        let route = route_key("GET", "/channels/{channel.id}/pins", channel_id);
        let value = self
            .send_json(Method::GET, &route, channel_id, &path, None)
            .await?;
        let messages: Vec<DiscordMessage> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read pins".into()))?;
        Ok(messages.iter().map(message_to_client).collect())
    }

    pub async fn set_pin(
        &self,
        channel_id: &str,
        message_id: &str,
        pinned: bool,
    ) -> Result<(), RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        let method = if pinned { Method::PUT } else { Method::DELETE };
        let verb = if pinned { "PUT" } else { "DELETE" };
        let route = route_key(verb, "/channels/{channel.id}/pins/{message.id}", channel_id);
        let path = format!("/channels/{channel_id}/pins/{message_id}");
        let response = self.send(method, &route, &path, None, &[]).await?;
        if response.status().is_success() || response.status().as_u16() == 204 {
            return Ok(());
        }
        let _ = Self::json_body(response, &self.token).await?;
        Ok(())
    }

    pub async fn emojis(&self, guild_id: &str) -> Result<Vec<ClientEmoji>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/emojis");
        let route = route_key("GET", "/guilds/{guild.id}/emojis", guild_id);
        let value = self
            .send_json(Method::GET, &route, guild_id, &path, None)
            .await?;
        let emojis: Vec<GuildEmoji> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read emoji".into()))?;
        Ok(emojis
            .into_iter()
            .filter(|emoji| emoji.available && snowflake_ok(&emoji.id) && !emoji.name.is_empty())
            .map(|emoji| ClientEmoji {
                id: emoji.id,
                name: emoji.name,
                animated: emoji.animated,
            })
            .collect())
    }

    pub async fn active_threads(&self, channel_id: &str) -> Result<Vec<ClientChannel>, RestError> {
        self.ensure_snowflake(channel_id)?;
        let path = format!("/channels/{channel_id}/threads/active");
        let route = route_key("GET", "/channels/{channel.id}/threads/active", channel_id);
        let value = self
            .send_json(Method::GET, &route, channel_id, &path, None)
            .await?;
        let threads = value
            .get("threads")
            .cloned()
            .unwrap_or(Value::Array(Vec::new()));
        let threads: Vec<DiscordChannel> = serde_json::from_value(threads)
            .map_err(|_| RestError::Message("Could not read threads".into()))?;
        Ok(threads
            .iter()
            .map(super::types::channel_to_client)
            .collect())
    }

    pub async fn search_guild(
        &self,
        guild_id: &str,
        query: &str,
    ) -> Result<Vec<ClientMessage>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let query = query.trim();
        if query.is_empty() || query.len() > 80 {
            return Err(RestError::Message("Search needs a short query.".into()));
        }
        let path = format!(
            "/guilds/{guild_id}/messages/search?content={}",
            urlencoding::encode(query)
        );
        let route = route_key("GET", "/guilds/{guild.id}/messages/search", guild_id);
        let value = self
            .send_json(Method::GET, &route, guild_id, &path, None)
            .await?;
        let mut out = Vec::new();
        if let Some(groups) = value.get("messages").and_then(|v| v.as_array()) {
            for group in groups {
                let Some(first) = group.as_array().and_then(|items| items.first()) else {
                    continue;
                };
                if let Ok(message) = serde_json::from_value::<DiscordMessage>(first.clone()) {
                    out.push(message_to_client(&message));
                }
            }
        }
        Ok(out)
    }

    pub async fn send_message(
        &self,
        channel_id: &str,
        content: &str,
        reply_to: Option<&str>,
        nonce: Option<&str>,
        files: &[OutFile],
        limit_bytes: u64,
    ) -> Result<ClientMessage, RestError> {
        self.ensure_snowflake(channel_id)?;
        if let Some(reply_to) = reply_to {
            self.ensure_snowflake(reply_to)?;
        }
        let total: u64 = files.iter().map(|f| f.bytes.len() as u64).sum();
        validate_outgoing(content, files.len(), total, limit_bytes)
            .map_err(RestError::Message)?;
        let route = route_key("POST", "/channels/{channel.id}/messages", channel_id);
        let path = format!("/channels/{channel_id}/messages");
        let payload = outgoing_payload(content, channel_id, reply_to, nonce);
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
        validate_outgoing(content, 0, 0, crate::clip_fit::NITRO_LIMIT).map_err(RestError::Message)?;
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

    pub async fn delete_message(
        &self,
        channel_id: &str,
        message_id: &str,
    ) -> Result<(), RestError> {
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
        let path = format!("/channels/{channel_id}/messages/{message_id}/reactions/{encoded}/@me");
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

    pub async fn invite_preview(&self, code: &str) -> Result<ClientInvite, RestError> {
        self.ensure_invite(code)?;
        let path = format!("/invites/{code}?with_counts=true");
        let value = self
            .send_json(Method::GET, "GET /invites/{code}", "invites", &path, None)
            .await?;
        Ok(invite_from_json(code, &value))
    }

    pub async fn accept_invite(&self, code: &str) -> Result<ClientInvite, RestError> {
        self.ensure_invite(code)?;
        let path = format!("/invites/{code}");
        let value = self
            .send_json(Method::POST, "POST /invites/{code}", "invites", &path, Some(json!({})))
            .await?;
        Ok(invite_from_json(code, &value))
    }

    pub async fn set_channel_collapsed(
        &self,
        guild_id: &str,
        channel_id: &str,
        collapsed: bool,
    ) -> Result<(), RestError> {
        self.ensure_snowflake(guild_id)?;
        self.ensure_snowflake(channel_id)?;
        let path = format!("/users/@me/guilds/{guild_id}/settings");
        let route = route_key("PATCH", "/users/@me/guilds/{guild.id}/settings", guild_id);
        let body = json!({
            "channel_overrides": {
                channel_id: { "collapsed": collapsed }
            }
        });
        self.send_json(Method::PATCH, &route, guild_id, &path, Some(body))
            .await?;
        Ok(())
    }

    /// Write preloaded user settings `guild_folders` (field 14), where the official client stores the rail.
    pub async fn set_guild_folders(&self, folders: &[ClientFolder]) -> Result<(), RestError> {
        let settings = encode_guild_folders(folders).map_err(RestError::Message)?;
        let path = "/users/@me/settings-proto/1";
        let route = route_key("PATCH", "/users/@me/settings-proto/1", "me");
        self.send_json(
            Method::PATCH,
            &route,
            "me",
            path,
            Some(json!({ "settings": settings })),
        )
        .await?;
        Ok(())
    }

    pub async fn guild_admin(&self, request: GuildAdminRequest) -> Result<Value, RestError> {
        let call = build_admin_call(&request).map_err(RestError::Message)?;
        let value = if let Some(file) = call.file.as_ref() {
            let upload = OutFile {
                name: file.name.clone(),
                mime: file.mime.clone(),
                bytes: file.bytes.clone(),
            };
            let response = self
                .send(call.method, &call.route, &call.path, call.body, std::slice::from_ref(&upload))
                .await?;
            Self::json_body(response, &self.token).await?
        } else {
            self.send_json(call.method, &call.route, &call.major, &call.path, call.body)
                .await?
        };
        if !call.channel_shaped || value.is_null() {
            return Ok(value);
        }
        let channel: DiscordChannel = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read that channel".into()))?;
        serde_json::to_value(channel_to_client(&channel))
            .map_err(|_| RestError::Message("Could not read that channel".into()))
    }

    fn ensure_invite(&self, code: &str) -> Result<(), RestError> {
        if invite_code_ok(code) {
            Ok(())
        } else {
            Err(RestError::Message("That invite link is not valid.".into()))
        }
    }

    fn ensure_snowflake(&self, value: &str) -> Result<(), RestError> {
        if snowflake_ok(value) {
            Ok(())
        } else {
            Err(RestError::Message(
                "That id is not a Discord snowflake".into(),
            ))
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
        let mut network_attempts = 0u32;
        let mut waits = 0u32;
        let mut rate_limits = 0u32;
        loop {
            if network_attempts >= 6 || waits >= 8 {
                return Err(RestError::RateLimited);
            }
            let decision = {
                let mut limiter = self.limiter.lock().await;
                limiter.reserve(route, now_ms())
            };
            if let crate::ratelimit::Decision::Wait { delay_ms, reason } = decision {
                waits += 1;
                let delay = delay_ms.min(60_000);
                eprintln!("lark-rest: waiting {delay}ms on {route} ({reason:?})");
                tokio::time::sleep(Duration::from_millis(delay)).await;
                continue;
            }
            network_attempts += 1;
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
                    self.limiter.lock().await.complete_attempt(route);
                    let text = redact(&err.to_string(), &[&self.token]);
                    log_line(&format!("request failed: {text}"));
                    return Err(RestError::Message(explain_transport(&text)));
                }
            };
            let status = response.status().as_u16();
            let parsed_headers = rate_headers(response.headers());
            if status == 429 {
                let text = response.text().await.unwrap_or_default();
                let parsed: TooMany = serde_json::from_str(&text).unwrap_or(TooMany {
                    retry_after: 1.0,
                    global: false,
                });
                let retry_ms = retry_after_to_ms(parsed.retry_after);
                let delay = backed_off_retry_ms(
                    retry_ms,
                    rate_limits,
                    jitter_ms(
                        now_ms().wrapping_add(u64::from(rate_limits)),
                        retry_ms.max(200) / 5,
                    ),
                );
                rate_limits = rate_limits.saturating_add(1);
                eprintln!(
                    "lark-rest: 429 on {route} retry_after_ms={retry_ms} wait_ms={delay} global={}",
                    parsed.global
                );
                let mut limiter = self.limiter.lock().await;
                if let Some(parsed) = parsed_headers {
                    limiter.observe_headers(route, &parsed, now_ms());
                }
                limiter.observe_429(route, delay, parsed.global, now_ms());
                limiter.complete_attempt(route);
                continue;
            }
            {
                let mut limiter = self.limiter.lock().await;
                if let Some(parsed) = parsed_headers {
                    limiter.observe_headers(route, &parsed, now_ms());
                }
                limiter.complete_attempt(route);
            }
            return Ok(response);
        }
    }

    async fn json_body(response: reqwest::Response, token: &str) -> Result<Value, RestError> {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            let message = serde_json::from_str::<DiscordError>(&text)
                .map(|body| body.message)
                .unwrap_or_default();
            let message = redact(&message, &[token]);
            return Err(RestError::Message(explain_api_status(
                status.as_u16(),
                &message,
            )));
        }
        if text.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text)
            .map_err(|_| RestError::Message("Discord returned an unexpected payload".into()))
    }

    async fn optional_json(&self, method: Method, route: &str, path: &str) -> Option<Value> {
        self.send_json(method, route, "threads", path, None).await.ok()
    }

    /// Active threads plus archived public and private lists. A 403 on a private list is empty.
    pub async fn thread_index(&self, channel_id: &str) -> Result<super::types::ClientThreadIndex, RestError> {
        self.ensure_snowflake(channel_id)?;
        let parent_path = format!("/channels/{channel_id}");
        let parent_route = route_key("GET", "/channels/{channel.id}", channel_id);
        let parent_value = self
            .send_json(Method::GET, &parent_route, channel_id, &parent_path, None)
            .await?;
        let parent = super::types::forum_parent_from_value(&parent_value)
            .ok_or_else(|| RestError::Message("Could not read that channel".into()))?;
        let mut threads = Vec::new();
        let mut seen = std::collections::HashSet::new();
        // Active threads are listed for the whole guild, then filtered to this parent.
        // There is no /channels/{id}/threads/active route.
        if let Some(guild_id) = parent_value.get("guild_id").and_then(|item| item.as_str()) {
            if self.ensure_snowflake(guild_id).is_ok() {
                let path = format!("/guilds/{guild_id}/threads/active");
                let route = route_key("GET", "/guilds/{guild.id}/threads/active", guild_id);
                if let Some(value) = self.optional_json(Method::GET, &route, &path).await {
                    for thread in super::types::threads_for_parent(&value, channel_id) {
                        if seen.insert(thread.id.clone()) {
                            threads.push(thread);
                        }
                    }
                }
            }
        }
        let lists = [
            (
                format!("/channels/{channel_id}/threads/archived/public"),
                "/channels/{channel.id}/threads/archived/public",
            ),
            (
                format!("/channels/{channel_id}/threads/archived/private"),
                "/channels/{channel.id}/threads/archived/private",
            ),
            (
                format!("/channels/{channel_id}/users/@me/threads/archived/private"),
                "/channels/{channel.id}/users/@me/threads/archived/private",
            ),
        ];
        for (path, template) in lists {
            let route = route_key("GET", template, channel_id);
            let Some(value) = self.optional_json(Method::GET, &route, &path).await else {
                continue;
            };
            for thread in super::types::threads_for_parent(&value, channel_id) {
                if seen.insert(thread.id.clone()) {
                    threads.push(thread);
                }
            }
        }
        Ok(super::types::ClientThreadIndex { parent, threads })
    }

    pub async fn start_thread(
        &self,
        channel_id: &str,
        message_id: Option<&str>,
        name: &str,
        kind: Option<i32>,
        auto_archive_duration: Option<i32>,
        invitable: Option<bool>,
        content: Option<&str>,
        applied_tags: &[String],
        route_name: &str,
        parent_kind: Option<i32>,
        parent_flags: i32,
        files: &[OutFile],
    ) -> Result<super::types::ClientThreadRecord, RestError> {
        let planned = super::types::thread_create_request(
            channel_id,
            message_id,
            name,
            kind,
            auto_archive_duration,
            invitable,
            content,
            applied_tags,
            route_name,
            parent_kind,
            parent_flags,
            !files.is_empty(),
        )
        .map_err(RestError::Message)?;
        let mut body = planned.body;
        if !files.is_empty() {
            let attachments: Vec<Value> = files
                .iter()
                .enumerate()
                .map(|(index, file)| json!({ "id": index, "filename": safe_file_name(&file.name) }))
                .collect();
            if let Some(message) = body.get_mut("message") {
                message["attachments"] = Value::Array(attachments);
            }
        }
        let template = if route_name == "from-message" {
            "/channels/{channel.id}/messages/{message.id}/threads"
        } else {
            "/channels/{channel.id}/threads"
        };
        let route = route_key("POST", template, channel_id);
        let response = self
            .send(Method::POST, &route, &planned.path, Some(body), files)
            .await?;
        let value = Self::json_body(response, &self.token).await?;
        super::types::thread_record_from_value(&value)
            .ok_or_else(|| RestError::Message("Could not read the new thread".into()))
    }

    pub async fn edit_thread(&self, thread_id: &str, archived: bool) -> Result<super::types::ClientThreadRecord, RestError> {
        self.ensure_snowflake(thread_id)?;
        let path = format!("/channels/{thread_id}");
        let route = route_key("PATCH", "/channels/{channel.id}", thread_id);
        let value = self
            .send_json(Method::PATCH, &route, thread_id, &path, Some(json!({ "archived": archived })))
            .await?;
        super::types::thread_record_from_value(&value)
            .ok_or_else(|| RestError::Message("Could not update that thread".into()))
    }

    pub async fn thread_members(&self, thread_id: &str) -> Result<Vec<super::types::ClientThreadMember>, RestError> {
        self.ensure_snowflake(thread_id)?;
        let path = format!("/channels/{thread_id}/thread-members?with_member=true");
        let route = route_key("GET", "/channels/{channel.id}/thread-members", thread_id);
        let value = self.send_json(Method::GET, &route, thread_id, &path, None).await?;
        let members = value
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(super::types::thread_member_from_value)
            .collect();
        Ok(members)
    }

    pub async fn join_thread(&self, thread_id: &str) -> Result<(), RestError> {
        self.thread_member_me(thread_id, Method::PUT, "PUT").await
    }

    pub async fn leave_thread(&self, thread_id: &str) -> Result<(), RestError> {
        self.thread_member_me(thread_id, Method::DELETE, "DELETE").await
    }

    async fn thread_member_me(&self, thread_id: &str, method: Method, verb: &str) -> Result<(), RestError> {
        self.ensure_snowflake(thread_id)?;
        let path = format!("/channels/{thread_id}/thread-members/@me");
        let route = route_key(verb, "/channels/{channel.id}/thread-members/@me", thread_id);
        let _ = self.send_json(method, &route, thread_id, &path, None).await?;
        Ok(())
    }

    /// Follow is thread-member flags: 2 is all messages, 4 is only mentions.
    pub async fn follow_thread(&self, thread_id: &str, follow: bool) -> Result<(), RestError> {
        self.ensure_snowflake(thread_id)?;
        let path = format!("/channels/{thread_id}/thread-members/@me/settings");
        let route = route_key("PUT", "/channels/{channel.id}/thread-members/@me/settings", thread_id);
        let flags = if follow { 2 } else { 4 };
        let _ = self
            .send_json(Method::PUT, &route, thread_id, &path, Some(json!({ "flags": flags })))
            .await?;
        Ok(())
    }

    pub async fn set_thread_member(&self, thread_id: &str, user_id: &str, add: bool) -> Result<(), RestError> {
        self.ensure_snowflake(thread_id)?;
        self.ensure_snowflake(user_id)?;
        let path = format!("/channels/{thread_id}/thread-members/{user_id}");
        let verb = if add { "PUT" } else { "DELETE" };
        let route = route_key(verb, "/channels/{channel.id}/thread-members/{user.id}", thread_id);
        let method = if add { Method::PUT } else { Method::DELETE };
        let _ = self.send_json(method, &route, thread_id, &path, None).await?;
        Ok(())
    }

    pub async fn follow_forum(&self, guild_id: &str, channel_id: &str, follow: bool) -> Result<(), RestError> {
        self.ensure_snowflake(guild_id)?;
        self.ensure_snowflake(channel_id)?;
        let path = format!("/users/@me/guilds/{guild_id}/settings");
        let route = route_key("PATCH", "/users/@me/guilds/{guild.id}/settings", guild_id);
        let override_value = if follow {
            json!({ "muted": false, "message_notifications": 0 })
        } else {
            json!({ "muted": true, "message_notifications": 1 })
        };
        let _ = self
            .send_json(
                Method::PATCH,
                &route,
                guild_id,
                &path,
                Some(json!({ "channel_overrides": { channel_id: override_value } })),
            )
            .await?;
        Ok(())
    }

    pub async fn create_poll(
        &self,
        channel_id: &str,
        question: &str,
        answers: &[(String, Option<String>)],
        duration: i32,
        allow_multiselect: bool,
    ) -> Result<super::types::ClientPoll, RestError> {
        self.ensure_snowflake(channel_id)?;
        let body = super::types::poll_message_body(question, answers, duration, allow_multiselect).map_err(RestError::Message)?;
        let path = format!("/channels/{channel_id}/messages");
        let route = route_key("POST", "/channels/{channel.id}/messages", channel_id);
        let value = self.send_json(Method::POST, &route, channel_id, &path, Some(body)).await?;
        super::types::poll_from_message(&value).ok_or_else(|| RestError::Message("Could not read that poll".into()))
    }

    pub async fn vote_poll(&self, channel_id: &str, message_id: &str, answer_id: i64) -> Result<(), RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        if answer_id <= 0 {
            return Err(RestError::Message("That answer is missing.".into()));
        }
        let path = format!("/channels/{channel_id}/polls/{message_id}/answers/{answer_id}");
        let route = route_key("PUT", "/channels/{channel.id}/polls/{message.id}/answers/{answer.id}", channel_id);
        let _ = self.send_json(Method::PUT, &route, channel_id, &path, None).await?;
        Ok(())
    }

    pub async fn end_poll(&self, channel_id: &str, message_id: &str) -> Result<super::types::ClientPoll, RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        let path = format!("/channels/{channel_id}/polls/{message_id}/expire");
        let route = route_key("POST", "/channels/{channel.id}/polls/{message.id}/expire", channel_id);
        let value = self.send_json(Method::POST, &route, channel_id, &path, None).await?;
        super::types::poll_from_message(&value).ok_or_else(|| RestError::Message("Could not end that poll".into()))
    }

    pub async fn poll_voters(
        &self,
        channel_id: &str,
        message_id: &str,
        answer_id: i64,
    ) -> Result<Vec<super::types::ClientPollVoter>, RestError> {
        self.ensure_snowflake(channel_id)?;
        self.ensure_snowflake(message_id)?;
        let path = format!("/channels/{channel_id}/polls/{message_id}/answers/{answer_id}?limit=25");
        let route = route_key("GET", "/channels/{channel.id}/polls/{message.id}/answers/{answer.id}", channel_id);
        let value = self.send_json(Method::GET, &route, channel_id, &path, None).await?;
        Ok(super::types::poll_voters_from_value(&value))
    }

    pub async fn scheduled_events(&self, guild_id: &str) -> Result<Vec<super::types::ClientScheduledEvent>, RestError> {
        self.ensure_snowflake(guild_id)?;
        let path = format!("/guilds/{guild_id}/scheduled-events?with_user_count=true");
        let route = route_key("GET", "/guilds/{guild.id}/scheduled-events", guild_id);
        let value = self.send_json(Method::GET, &route, guild_id, &path, None).await?;
        Ok(super::types::events_from_value(&value))
    }

    pub async fn create_scheduled_event(&self, guild_id: &str, body: Value) -> Result<super::types::ClientScheduledEvent, RestError> {
        self.ensure_snowflake(guild_id)?;
        if body.get("privacy_level").and_then(|item| item.as_i64()) != Some(2) {
            return Err(RestError::Message("Events are visible to the server.".into()));
        }
        let path = format!("/guilds/{guild_id}/scheduled-events");
        let route = route_key("POST", "/guilds/{guild.id}/scheduled-events", guild_id);
        let value = self.send_json(Method::POST, &route, guild_id, &path, Some(body)).await?;
        super::types::event_from_value(&value).ok_or_else(|| RestError::Message("Could not create that event".into()))
    }

    pub async fn rsvp_event(&self, guild_id: &str, event_id: &str, interested: bool) -> Result<(), RestError> {
        self.ensure_snowflake(guild_id)?;
        self.ensure_snowflake(event_id)?;
        let path = format!("/guilds/{guild_id}/scheduled-events/{event_id}/users/@me");
        let verb = if interested { "PUT" } else { "DELETE" };
        let route = route_key(verb, "/guilds/{guild.id}/scheduled-events/{event.id}/users/@me", guild_id);
        let method = if interested { Method::PUT } else { Method::DELETE };
        let _ = self.send_json(method, &route, guild_id, &path, None).await?;
        Ok(())
    }

    pub async fn start_scheduled_event(&self, guild_id: &str, event_id: &str) -> Result<super::types::ClientScheduledEvent, RestError> {
        self.ensure_snowflake(guild_id)?;
        self.ensure_snowflake(event_id)?;
        let path = format!("/guilds/{guild_id}/scheduled-events/{event_id}");
        let route = route_key("PATCH", "/guilds/{guild.id}/scheduled-events/{event.id}", guild_id);
        let value = self
            .send_json(Method::PATCH, &route, guild_id, &path, Some(json!({ "status": 2 })))
            .await?;
        super::types::event_from_value(&value).ok_or_else(|| RestError::Message("Could not start that event".into()))
    }

    pub async fn ack_bulk(&self, states: &[(String, String)]) -> Result<(), RestError> {
        let body = super::types::ack_bulk_body(states).map_err(RestError::Message)?;
        let route = route_key("POST", "/read-states/ack-bulk", "read-states");
        let _ = self
            .send_json(Method::POST, &route, "read-states", "/read-states/ack-bulk", Some(body))
            .await?;
        Ok(())
    }

    pub async fn mentions(&self) -> Result<Vec<ClientMessage>, RestError> {
        let value = self
            .send_json(Method::GET, "GET /users/@me/mentions", "me", "/users/@me/mentions?limit=25", None)
            .await?;
        let messages: Vec<DiscordMessage> = serde_json::from_value(value)
            .map_err(|_| RestError::Message("Could not read mentions".into()))?;
        Ok(messages.iter().map(message_to_client).collect())
    }

    pub async fn friend_requests(&self) -> Result<Vec<super::types::ClientFriendRequest>, RestError> {
        let value = self
            .send_json(Method::GET, "GET /users/@me/relationships", "me", "/users/@me/relationships", None)
            .await?;
        Ok(super::types::friend_requests_from_value(&value))
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

#[derive(Deserialize)]
struct GuildEmoji {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    animated: bool,
    #[serde(default = "emoji_available")]
    available: bool,
}

fn emoji_available() -> bool {
    true
}

/// Newest page on open, and the previous page when `before` is the oldest id on screen.
pub fn messages_path(channel_id: &str, before: Option<&str>) -> String {
    match before {
        Some(before) => format!("/channels/{channel_id}/messages?limit=20&before={before}"),
        None => format!("/channels/{channel_id}/messages?limit=20"),
    }
}

pub fn api_url(path: &str) -> Result<String, RestError> {
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err(RestError::Message(
            "Refusing to build that request URL".into(),
        ));
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

enum ChannelFetch {
    Lead(ChannelTx),
    Follow(ChannelRx),
}

/// Removes the in-flight slot if the leader is cancelled before it publishes.
struct ChannelLead<'a> {
    rest: &'a DiscordRest,
    id: &'a str,
    tx: Option<ChannelTx>,
}

impl Drop for ChannelLead<'_> {
    fn drop(&mut self) {
        if let Some(tx) = self.tx.take() {
            let _ = tx.send(Some(Err("Could not read channels".into())));
        }
        self.rest
            .channel_fetches
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .remove(self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_history_asks_for_the_newest_page() {
        assert_eq!(
            messages_path("100000000000000023", None),
            "/channels/100000000000000023/messages?limit=20"
        );
        assert_eq!(
            messages_path("100000000000000023", Some("100000000000000230")),
            "/channels/100000000000000023/messages?limit=20&before=100000000000000230"
        );
    }

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
        assert_eq!(reaction_emoji_path("lark", Some("99")), "lark:99");
    }

    #[test]
    fn send_payload_carries_the_nonce() {
        let payload = outgoing_payload("test", "100000000000000022", None, Some("local-abc"));
        assert_eq!(payload["content"], "test");
        assert_eq!(payload["nonce"], "local-abc");
        assert!(payload.get("message_reference").is_none());
        let reply = outgoing_payload("test", "100000000000000022", Some("100000000000000001"), Some(" "));
        assert!(reply.get("nonce").is_none());
        assert_eq!(reply["message_reference"]["message_id"], "100000000000000001");
        assert!(outgoing_payload("test", "1", None, Some("no spaces")).get("nonce").is_none());
        assert!(outgoing_payload("test", "1", None, Some(&"n".repeat(26))).get("nonce").is_none());
    }

    #[test]
    fn notes_are_capped_and_read_from_the_payload() {
        assert_eq!(clamp_note("  hello\0"), "  hello");
        assert_eq!(clamp_note(&"n".repeat(300)).chars().count(), 256);
        assert_eq!(note_from_value(&json!({"note": "booth"})), "booth");
        assert!(note_from_value(&json!({})).is_empty());
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
    fn api_errors_name_the_status_and_hide_the_token() {
        let token = "mfa.super-secret-token-value";
        let cleaned = crate::redact::redact(&format!("401: Unauthorized {token}"), &[token]);
        let unauthorized = explain_api_status(401, &cleaned);
        assert!(unauthorized.contains("HTTP 401"));
        assert!(!unauthorized.contains(token));
        let forbidden = explain_api_status(403, "error code: 1010");
        assert!(forbidden.contains("HTTP 403"));
        assert!(forbidden.contains("Cloudflare") || forbidden.contains("403"));
        let down = explain_transport("dns error: failed to lookup address information");
        assert!(down.contains("resolve discord.com"));
        let tls = explain_transport("tls handshake error: certificate verify failed");
        assert!(tls.contains("TLS"));
        assert!(RestError::Message(unauthorized).is_unauthorized());
        assert!(!RestError::RateLimited.is_unauthorized());
    }

    #[test]
    fn debug_does_not_include_the_token() {
        let client = DiscordRest::new("super-secret-token-value".into()).unwrap();
        let rendered = format!("{client:?}");
        assert!(!rendered.contains("super-secret-token-value"));
        assert!(rendered.contains("[redacted]"));
    }
}
