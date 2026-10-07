use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::redact::redact;

use super::shell::{
    access_from_guild, folder_snapshot, guild_prefs, my_roles_from_merged, read_markers,
    ClientFolder, ClientGuildAccess, ClientGuildPref,
};
use super::types::{
    activity_parts, channel_kind_name, channel_to_client, friends_from_relationships,
    guild_to_client, message_to_client, parse_guild_voice_states, parse_voice_state, role_to_client,
    roster_from_chunk, roster_from_guild, user_to_client, ClientChannel, ClientGuild, ClientMember,
    ClientMessage, ClientRole, ClientUser, ClientVoiceState, DiscordChannel, DiscordGuild,
    DiscordMessage, DiscordRole, DiscordUser,
};

/// Guilds, presence, messages, reactions, typing, and direct messages.
/// The privileged guild-members intent stays off. User sessions identify
/// without intents, the way the official client does, and the member sidebar
/// subscribes with opcode 14 (lazy guild ranges).
pub const CLIENT_INTENTS: u64 = (1 << 0)
    | (1 << 8)
    | (1 << 9)
    | (1 << 10)
    | (1 << 11)
    | (1 << 12)
    | (1 << 13)
    | (1 << 14)
    | (1 << 15);

pub fn intents_without_message_content(intents: u64) -> u64 {
    intents & !(1 << 15)
}

pub fn intents_without_presence(intents: u64) -> u64 {
    intents & !(1 << 8)
}

/// Lazy user notes only. Heavier capabilities rewrite the READY payload
/// (deduped users, a split supplemental payload) and are left off.
pub const USER_CAPABILITIES: u64 = 1 << 0;

pub fn gateway_url() -> &'static str {
    "wss://gateway.discord.gg/?v=10&encoding=json"
}

/// Channels that arrived on the same gateway payload as the guild.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GuildChannelSnapshot {
    pub guild_id: String,
    pub channels: Vec<ClientChannel>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientEvent {
    Status {
        state: String,
        detail: String,
    },
    Ready {
        user: ClientUser,
        guilds: Vec<ClientGuild>,
        dms: Vec<ClientChannel>,
        /// Present when READY included channel lists. Empty for unavailable guilds.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        guild_channels: Vec<GuildChannelSnapshot>,
    },
    Channels {
        guild_id: String,
        channels: Vec<ClientChannel>,
        /// False when one channel was created or edited. True replaces the list.
        replace: bool,
    },
    MessageCreate {
        message: ClientMessage,
    },
    MessageUpdate {
        channel_id: String,
        message_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        edited: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        embeds: Option<Vec<super::types::ClientEmbed>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        attachments: Option<Vec<super::types::ClientAttachment>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        stickers: Option<Vec<super::types::ClientSticker>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reactions: Option<Vec<super::types::ClientReaction>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        mention_ids: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        mention_users: Option<Vec<super::types::ClientMention>>,
    },
    MessageDelete {
        channel_id: String,
        message_id: String,
    },
    Reaction {
        channel_id: String,
        message_id: String,
        user_id: String,
        emoji: String,
        emoji_id: Option<String>,
        added: bool,
    },
    Typing {
        channel_id: String,
        user_id: String,
        username: String,
    },
    Presence {
        guild_id: String,
        user_id: String,
        status: String,
        custom: String,
        activity: String,
    },
    ReadState {
        channel_id: String,
        last_message_id: String,
        mention_count: u32,
    },
    VoiceServer {
        guild_id: String,
        endpoint: String,
        token: String,
    },
    VoiceState(ClientVoiceState),
    VoiceStates {
        guild_id: String,
        states: Vec<ClientVoiceState>,
    },
    Threads {
        guild_id: String,
        channel_id: String,
        threads: Vec<ClientChannel>,
    },
    Roles {
        guild_id: String,
        roles: Vec<super::types::ClientRole>,
    },
    Guild {
        guild: ClientGuild,
    },
    Members {
        guild_id: String,
        members: Vec<ClientMember>,
    },
    /// One GUILD_MEMBER_LIST_UPDATE. The shell applies the ops in order.
    MemberList {
        guild_id: String,
        list_id: String,
        member_count: u32,
        online_count: u32,
        groups: Vec<ClientMemberGroup>,
        ops: Vec<MemberListOp>,
    },
    Role {
        guild_id: String,
        role: ClientRole,
        removed: bool,
    },
    DirectChannel {
        channel: ClientChannel,
        removed: bool,
    },
    Friends {
        friends: Vec<ClientMember>,
    },
    FriendRemoved {
        user_id: String,
    },
    /// A note stored on the signed-in account. Other people cannot read it.
    UserNote {
        user_id: String,
        note: String,
    },
    Folders {
        folders: Vec<ClientFolder>,
    },
    GuildAccess {
        access: ClientGuildAccess,
    },
    GuildNotify {
        entries: Vec<ClientGuildPref>,
    },
    ChannelGone {
        guild_id: String,
        channel_id: String,
    },
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientMemberGroup {
    pub id: String,
    pub count: u32,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MemberListItem {
    Group { id: String, count: u32 },
    Member { member: ClientMember },
    Empty,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(tag = "op", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MemberListOp {
    Sync {
        range: [u32; 2],
        items: Vec<MemberListItem>,
    },
    Insert {
        index: u32,
        item: MemberListItem,
    },
    Update {
        index: u32,
        item: MemberListItem,
    },
    Delete {
        index: u32,
    },
    Invalidate {
        range: [u32; 2],
    },
}

#[derive(Debug)]
enum SessionEnd {
    Shutdown,
    Reconnect {
        detail: String,
        /// Drop the session id and identify fresh. Resume would be rejected.
        invalidate: bool,
        close_code: Option<u16>,
    },
    /// Stop and show `detail` on the sign-in screen. Do not reconnect.
    Stop(String),
    DisallowedIntent,
}

fn reconnect(detail: impl Into<String>) -> SessionEnd {
    SessionEnd::Reconnect {
        detail: detail.into(),
        invalidate: false,
        close_code: None,
    }
}

struct Session {
    id: String,
    seq: Option<u64>,
    user_id: String,
}

#[derive(Debug, Clone)]
pub enum GatewayCommand {
    VoiceState {
        guild_id: Option<String>,
        channel_id: Option<String>,
        mute: bool,
        deaf: bool,
    },
    Presence {
        status: String,
        custom: String,
    },
    /// Subscribe to a channel's member-list ranges. Opcode 14.
    /// Empty `ranges` clears the subscription for that guild.
    SubscribeMembers {
        guild_id: String,
        channel_id: String,
        ranges: Vec<(u32, u32)>,
    },
}

pub fn gateway_command_payload(command: &GatewayCommand) -> String {
    match command {
        GatewayCommand::VoiceState {
            guild_id,
            channel_id,
            mute,
            deaf,
        } => {
            super::voice::main_voice_state(guild_id.as_deref(), channel_id.as_deref(), *mute, *deaf)
        }
        GatewayCommand::SubscribeMembers {
            guild_id,
            channel_id,
            ranges,
        } => lazy_guild_payload(guild_id, channel_id, ranges),
        GatewayCommand::Presence { status, custom } => {
            let activities = if custom.is_empty() {
                Vec::<serde_json::Value>::new()
            } else {
                vec![serde_json::json!({
                    "name": "Custom Status",
                    "type": 4,
                    "state": custom
                })]
            };
            serde_json::json!({
                "op": 3,
                "d": {
                    "since": null,
                    "activities": activities,
                    "status": status,
                    "afk": false
                }
            })
            .to_string()
        }
    }
}

fn lazy_guild_payload(guild_id: &str, channel_id: &str, ranges: &[(u32, u32)]) -> String {
    let mut channels = serde_json::Map::new();
    let active = !channel_id.is_empty() && !ranges.is_empty();
    if active {
        let encoded: Vec<Vec<u32>> = ranges
            .iter()
            .take(3)
            .map(|(start, end)| vec![*start, *end])
            .collect();
        channels.insert(channel_id.to_string(), json!(encoded));
    }
    json!({
        "op": 14,
        "d": {
            "guild_id": guild_id,
            "typing": active,
            "activities": active,
            "threads": active,
            "members": [],
            "channels": channels
        }
    })
    .to_string()
}

pub async fn run_gateway<F>(
    token: String,
    mut shutdown: watch::Receiver<bool>,
    mut outbound: mpsc::UnboundedReceiver<GatewayCommand>,
    mut emit: F,
) where
    F: FnMut(ClientEvent) + Send,
{
    let mut backoff_secs = 1u64;
    let mut session: Option<Session> = None;
    // User accounts receive every event they can see when intents are omitted.
    // Opcode 14 member lists are ignored on a bot-style identify that sends intents.
    let mut intents: Option<u64> = None;
    let mut dropped_content_intent = false;
    let mut dropped_presence_intent = false;

    loop {
        if *shutdown.borrow() {
            emit(ClientEvent::Status {
                state: "disconnected".into(),
                detail: String::new(),
            });
            break;
        }
        emit(ClientEvent::Status {
            state: if session.is_some() {
                "reconnecting".into()
            } else {
                "connecting".into()
            },
            detail: String::new(),
        });
        match connect_once(
            &token,
            &mut session,
            intents,
            &mut shutdown,
            &mut outbound,
            &mut emit,
            &mut backoff_secs,
        )
        .await
        {
            Ok(SessionEnd::Shutdown) => break,
            Ok(SessionEnd::Stop(detail)) => {
                emit(ClientEvent::Status {
                    state: "failed".into(),
                    detail,
                });
                break;
            }
            Ok(SessionEnd::DisallowedIntent) if !dropped_content_intent => {
                let current = intents.unwrap_or(CLIENT_INTENTS);
                intents = Some(intents_without_message_content(current));
                dropped_content_intent = true;
                session = None;
                emit(ClientEvent::Status {
                    state: "reconnecting".into(),
                    detail: "Discord rejected the message content intent (close 4014). Reconnecting without it. History still loads from the API.".into(),
                });
                continue;
            }
            Ok(SessionEnd::DisallowedIntent) if !dropped_presence_intent => {
                let current = intents.unwrap_or(CLIENT_INTENTS);
                intents = Some(intents_without_presence(current));
                dropped_presence_intent = true;
                session = None;
                emit(ClientEvent::Status {
                    state: "reconnecting".into(),
                    detail: "Discord rejected the presence intent (close 4014). Reconnecting without it.".into(),
                });
                continue;
            }
            Ok(SessionEnd::DisallowedIntent) => {
                emit(ClientEvent::Status {
                    state: "failed".into(),
                    detail: "Discord rejected the gateway intents (close 4014) even after message content and presence were removed.".into(),
                });
                break;
            }
            Ok(SessionEnd::Reconnect {
                detail,
                invalidate,
                close_code,
            }) => {
                if invalidate {
                    session = None;
                }
                if !wait_to_reconnect(
                    &mut shutdown,
                    &mut emit,
                    &mut backoff_secs,
                    &detail,
                    close_code,
                )
                .await
                {
                    break;
                }
            }
            Err(detail) => {
                if !wait_to_reconnect(&mut shutdown, &mut emit, &mut backoff_secs, &detail, None)
                    .await
                {
                    break;
                }
            }
        }
    }
}

async fn wait_to_reconnect<F>(
    shutdown: &mut watch::Receiver<bool>,
    emit: &mut F,
    backoff_secs: &mut u64,
    detail: &str,
    close_code: Option<u16>,
) -> bool
where
    F: FnMut(ClientEvent),
{
    let wait = reconnect_wait_secs(*backoff_secs, close_code);
    let shown = if detail.is_empty() {
        format!("The gateway connection dropped. Waiting {wait}s before reconnecting.")
    } else {
        format!("{detail} Waiting {wait}s before reconnecting.")
    };
    gateway_log(&format!(
        "reconnect in {wait}s code={} {detail}",
        close_code
            .map(|code| code.to_string())
            .unwrap_or_else(|| "-".into())
    ));
    emit(ClientEvent::Status {
        state: "reconnecting".into(),
        detail: shown,
    });
    tokio::select! {
        changed = shutdown.changed() => {
            if changed.is_err() || *shutdown.borrow() {
                return false;
            }
        }
        _ = tokio::time::sleep(Duration::from_secs(wait)) => {}
    }
    *backoff_secs = (*backoff_secs * 2).min(60);
    true
}

async fn connect_once<F>(
    token: &str,
    session: &mut Option<Session>,
    intents: Option<u64>,
    shutdown: &mut watch::Receiver<bool>,
    outbound: &mut mpsc::UnboundedReceiver<GatewayCommand>,
    emit: &mut F,
    backoff_secs: &mut u64,
) -> Result<SessionEnd, String>
where
    F: FnMut(ClientEvent),
{
    let request = gateway_handshake_request()?;
    let (socket, _) = connect_async(request)
        .await
        .map_err(|err| super::rest::explain_transport(&redact(&err.to_string(), &[token])))?;
    let (mut write, mut read) = socket.split();
    let mut heartbeat_every: Option<Duration> = None;
    let mut next_heartbeat: Option<Instant> = None;
    let mut ack_pending = false;

    loop {
        let heartbeat_wait = async {
            match next_heartbeat {
                Some(when) => {
                    let delay = when.saturating_duration_since(Instant::now());
                    tokio::time::sleep(delay).await;
                }
                None => std::future::pending::<()>().await,
            }
        };
        tokio::select! {
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    return Ok(SessionEnd::Shutdown);
                }
            }
            command = outbound.recv() => {
                if let Some(command) = command {
                    let payload = gateway_command_payload(&command);
                    if write.send(Message::Text(payload)).await.is_err() {
                        return Ok(reconnect("The gateway write failed."));
                    }
                }
            }
            _ = heartbeat_wait => {
                if ack_pending {
                    gateway_log("no heartbeat ack before the next interval; reconnecting");
                    return Ok(reconnect("Discord missed a heartbeat."));
                }
                let seq = session.as_ref().and_then(|s| s.seq);
                let payload = heartbeat_payload(seq);
                if write.send(Message::Text(payload)).await.is_err() {
                    return Ok(reconnect("The heartbeat write failed."));
                }
                ack_pending = true;
                if let Some(every) = heartbeat_every {
                    next_heartbeat = Some(Instant::now() + every);
                }
            }
            frame = read.next() => {
                let Some(frame) = frame else {
                    return Ok(reconnect("The gateway closed."));
                };
                let frame = frame.map_err(|err| redact(&err.to_string(), &[token]))?;
                match frame {
                    Message::Ping(payload) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Message::Close(frame) => {
                        let code = frame.as_ref().map(|c| u16::from(c.code)).unwrap_or(0);
                        let reason = frame
                            .as_ref()
                            .map(|c| redact(&c.reason.to_string(), &[token]))
                            .unwrap_or_default();
                        if invalidate_session(code) {
                            gateway_log(&format!("close {code} drops the session"));
                            *session = None;
                        } else {
                            gateway_log(&format!("close {code}"));
                        }
                        return Ok(close_code_end(code, &reason));
                    }
                    Message::Text(text) => {
                        let incoming = match parse_frame(&text) {
                            Ok(incoming) => incoming,
                            Err(_) => continue,
                        };
                        if let Some(seq) = incoming.seq {
                            if let Some(session) = session.as_mut() {
                                session.seq = Some(seq);
                            } else if incoming.op == 0 {
                                // Sequence before READY is kept once we learn the session id.
                            }
                        }
                        match incoming.op {
                            10 => {
                                let raw = incoming
                                    .data
                                    .get("heartbeat_interval")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(41250);
                                let interval = heartbeat_millis(raw);
                                if interval != raw {
                                    gateway_log(&format!("clamped heartbeat {raw}ms to {interval}ms"));
                                }
                                let every = Duration::from_millis(interval);
                                heartbeat_every = Some(every);
                                next_heartbeat = Some(Instant::now() + every / 2);
                                ack_pending = false;
                                if session.as_ref().is_some_and(|current| !should_resume(&current.id, current.seq)) {
                                    gateway_log("session has no sequence; identifying instead of resuming");
                                    *session = None;
                                }
                                let payload = if let Some(current) = session.as_ref() {
                                    gateway_log(&format!("resuming at seq {}", current.seq.unwrap_or(0)));
                                    resume_payload(token, &current.id, current.seq)
                                } else {
                                    gateway_log("identifying");
                                    identify_payload(token, intents)
                                };
                                if write.send(Message::Text(payload)).await.is_err() {
                                    return Ok(reconnect("Identify could not be sent."));
                                }
                            }
                            11 => {
                                ack_pending = false;
                            }
                            1 => {
                                let seq = session.as_ref().and_then(|s| s.seq);
                                let _ = write.send(Message::Text(heartbeat_payload(seq))).await;
                            }
                            7 => {
                                gateway_log("discord requested reconnect");
                                return Ok(reconnect("Discord asked for a reconnect."));
                            }
                            9 => {
                                let can_resume = incoming.data.as_bool().unwrap_or(false);
                                if !can_resume {
                                    gateway_log("session invalidated; identifying");
                                    *session = None;
                                } else {
                                    gateway_log("session can resume");
                                }
                                return Ok(reconnect("Discord invalidated the session. Reconnecting."));
                            }
                            0 => {
                                if let Some(seq) = incoming.seq {
                                    match session.as_mut() {
                                        Some(session) => session.seq = Some(seq),
                                        None => {}
                                    }
                                }
                                let dispatch_name = incoming.name.clone().unwrap_or_default();
                                if handle_dispatch(&dispatch_name, &incoming.data, incoming.seq, session, emit) {
                                    *backoff_secs = 1;
                                    let seq = session.as_ref().and_then(|current| current.seq).unwrap_or(0);
                                    gateway_log(&format!("{dispatch_name} seq={seq}"));
                                    emit(ClientEvent::Status {
                                        state: "connected".into(),
                                        detail: String::new(),
                                    });
                                }
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

fn close_code_end(code: u16, reason: &str) -> SessionEnd {
    match code {
        4004 => SessionEnd::Stop(gateway_close_message(code, reason)),
        4010 | 4011 | 4012 | 4013 => SessionEnd::Stop(gateway_close_message(code, reason)),
        4014 => SessionEnd::DisallowedIntent,
        _ => SessionEnd::Reconnect {
            detail: gateway_close_message(code, reason),
            invalidate: invalidate_session(code),
            close_code: Some(code),
        },
    }
}

/// Close codes that cannot be resumed. Identifying again avoids a reject loop.
pub fn invalidate_session(code: u16) -> bool {
    matches!(code, 4003 | 4005 | 4007 | 4009)
}

/// Discord's hello interval is milliseconds. A missing or tiny value would
/// heartbeat in a tight loop and get the gateway rate limited.
/// Game Mode slows theme and hardware polls only. It does not scale this clock.
pub fn heartbeat_millis(raw: u64) -> u64 {
    raw.clamp(5_000, 120_000)
}

pub fn should_resume(session_id: &str, seq: Option<u64>) -> bool {
    !session_id.is_empty() && seq.is_some()
}

pub fn reconnect_wait_secs(backoff_secs: u64, close_code: Option<u16>) -> u64 {
    let wait = backoff_secs.max(1);
    if close_code == Some(4008) {
        wait.max(10)
    } else {
        wait
    }
}

fn gateway_log(message: &str) {
    eprintln!("lark-gateway: {message}");
}

pub fn gateway_close_message(code: u16, reason: &str) -> String {
    let reason = reason.trim();
    let extra = if reason.is_empty() {
        String::new()
    } else {
        format!(" Discord said: {reason}.")
    };
    match code {
        4004 => format!(
            "Discord rejected the token (gateway close 4004, authentication failed).{extra} It may be expired, revoked, or copied with quotes or spaces. Lark sent it only to Discord and will not retry this token."
        ),
        4003 => format!("Discord said the gateway session is not authenticated (close 4003).{extra}"),
        4010 => format!("Discord rejected the shard id (close 4010).{extra}"),
        4011 => format!("Discord requires sharding (close 4011). Lark uses one connection.{extra}"),
        4012 => format!("Discord rejected the gateway API version (close 4012).{extra}"),
        4013 => format!("Discord rejected the gateway intents as invalid (close 4013).{extra}"),
        4014 => format!("Discord rejected a privileged intent (close 4014).{extra}"),
        0 => "The gateway closed before Discord sent a close code.".into(),
        _ => format!("Discord closed the gateway (close {code}).{extra}"),
    }
}

pub fn gateway_handshake_request(
) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, String> {
    let mut request = gateway_url()
        .into_client_request()
        .map_err(|err| super::rest::explain_transport(&err.to_string()))?;
    let headers = request.headers_mut();
    headers.insert(
        "Origin",
        "https://discord.com"
            .parse()
            .map_err(|_| "Could not build the gateway request.".to_string())?,
    );
    headers.insert(
        "User-Agent",
        "Lark/0.1.0 (personal client)"
            .parse()
            .map_err(|_| "Could not build the gateway request.".to_string())?,
    );
    Ok(request)
}

pub(crate) struct Incoming {
    op: u8,
    data: Value,
    seq: Option<u64>,
    name: Option<String>,
}

pub(crate) fn parse_frame(text: &str) -> Result<Incoming, ()> {
    #[derive(Deserialize)]
    struct Frame {
        op: u8,
        #[serde(default)]
        d: Option<Value>,
        #[serde(default)]
        s: Option<u64>,
        #[serde(default)]
        t: Option<String>,
    }
    let frame: Frame = serde_json::from_str(text).map_err(|_| ())?;
    Ok(Incoming {
        op: frame.op,
        data: frame.d.unwrap_or(Value::Null),
        seq: frame.s,
        name: frame.t,
    })
}

pub fn identify_payload(token: &str, intents: Option<u64>) -> String {
    let mut data = json!({
        "token": token,
        "capabilities": USER_CAPABILITIES,
        "properties": {
            "os": std::env::consts::OS,
            "browser": "Lark",
            "device": "Lark"
        },
        "compress": false,
        "presence": {
            "status": "unknown",
            "since": 0,
            "activities": [],
            "afk": false
        },
        "client_state": {
            "guild_versions": {},
            "api_code_version": 0
        }
    });
    if let Some(intents) = intents {
        data["intents"] = json!(intents);
    }
    json!({ "op": 2, "d": data }).to_string()
}

pub fn resume_payload(token: &str, session_id: &str, seq: Option<u64>) -> String {
    json!({
        "op": 6,
        "d": {
            "token": token,
            "session_id": session_id,
            "seq": seq
        }
    })
    .to_string()
}

pub fn heartbeat_payload(seq: Option<u64>) -> String {
    json!({ "op": 1, "d": seq }).to_string()
}

fn handle_dispatch(
    name: &str,
    data: &Value,
    seq: Option<u64>,
    session: &mut Option<Session>,
    emit: &mut impl FnMut(ClientEvent),
) -> bool {
    match name {
        "RESUMED" => true,
        "READY" => {
            if let Ok(ready) = serde_json::from_value::<Ready>(data.clone()) {
                let user_id = ready.user.id.clone();
                *session = Some(Session {
                    id: ready.session_id,
                    seq,
                    user_id: user_id.clone(),
                });
                emit(ClientEvent::Ready {
                    user: user_to_client(&ready.user),
                    guilds: ready.guilds.iter().map(guild_to_client).collect(),
                    dms: ready
                        .private_channels
                        .iter()
                        .map(channel_to_client)
                        .collect(),
                    guild_channels: guild_channel_snapshots(&ready.guilds),
                });
                for guild in &ready.guilds {
                    if !guild.roles.is_empty() {
                        emit(ClientEvent::Roles {
                            guild_id: guild.id.clone(),
                            roles: guild.roles.iter().map(role_to_client).collect(),
                        });
                    }
                }
                if let Some(relationships) = ready.relationships.as_ref() {
                    let friends = friends_from_relationships(relationships, ready.presences.as_ref());
                    if !friends.is_empty() {
                        emit(ClientEvent::Friends { friends });
                    }
                }
                for (index, guild) in ready.guilds.iter().enumerate() {
                    let roles = my_roles_from_merged(&ready.merged_members, index);
                    emit_guild_shell(&user_id, guild, &roles, emit);
                }
                for marker in read_markers(&ready.read_state) {
                    emit(ClientEvent::ReadState {
                        channel_id: marker.channel_id,
                        last_message_id: marker.last_message_id,
                        mention_count: marker.mention_count,
                    });
                }
                let folders = folder_snapshot(&ready.user_settings, ready.user_settings_proto.as_deref());
                if !folders.folders.is_empty() {
                    emit(ClientEvent::Folders { folders: folders.folders });
                }
                let entries = guild_prefs(&ready.user_guild_settings);
                if !entries.is_empty() {
                    emit(ClientEvent::GuildNotify { entries });
                }
                if let Some(guilds) = data.get("guilds").and_then(|value| value.as_array()) {
                    for guild in guilds {
                        let Some(states) = parse_guild_voice_states(guild) else { continue };
                        let guild_id = guild.get("id").and_then(|value| value.as_str()).unwrap_or("");
                        if guild_id.is_empty() {
                            continue;
                        }
                        emit(ClientEvent::VoiceStates { guild_id: guild_id.to_string(), states });
                    }
                }
                return true;
            }
            false
        }
        "GUILD_CREATE" => {
            if let Ok(guild) = serde_json::from_value::<DiscordGuild>(data.clone()) {
                let roster = roster_from_guild(&guild);
                let user_id = session
                    .as_ref()
                    .map(|item| item.user_id.clone())
                    .unwrap_or_default();
                emit(ClientEvent::Guild {
                    guild: guild_to_client(&guild),
                });
                if !guild.roles.is_empty() {
                    emit(ClientEvent::Roles {
                        guild_id: guild.id.clone(),
                        roles: guild.roles.iter().map(role_to_client).collect(),
                    });
                }
                emit_guild_shell(&user_id, &guild, &[], emit);
                if !roster.is_empty() {
                    emit(ClientEvent::Members {
                        guild_id: guild.id.clone(),
                        members: roster,
                    });
                }
                if let Some(states) = parse_guild_voice_states(data) {
                    emit(ClientEvent::VoiceStates { guild_id: guild.id.clone(), states });
                }
            }
            false
        }
        "GUILD_MEMBER_LIST_UPDATE" => {
            if let Some(event) = member_list_event(data) {
                emit(event);
            }
            false
        }
        "GUILD_ROLE_CREATE" | "GUILD_ROLE_UPDATE" => {
            let guild_id = json_str(data, "guild_id");
            if let Some(role) = data.get("role").cloned() {
                if let Ok(role) = serde_json::from_value::<DiscordRole>(role) {
                    if !guild_id.is_empty() {
                        emit(ClientEvent::Role {
                            guild_id,
                            role: role_to_client(&role),
                            removed: false,
                        });
                    }
                }
            }
            false
        }
        "GUILD_ROLE_DELETE" => {
            let guild_id = json_str(data, "guild_id");
            let role_id = json_str(data, "role_id");
            if !guild_id.is_empty() && !role_id.is_empty() {
                emit(ClientEvent::Role {
                    guild_id,
                    role: ClientRole {
                        id: role_id,
                        name: String::new(),
                        color: None,
                        position: 0,
                        hoist: false,
                    },
                    removed: true,
                });
            }
            false
        }
        "CHANNEL_CREATE" | "CHANNEL_UPDATE" => {
            if let Ok(channel) = serde_json::from_value::<DiscordChannel>(data.clone()) {
                let kind = channel_kind_name(channel.kind);
                if kind == "dm" || kind == "group" {
                    emit(ClientEvent::DirectChannel {
                        channel: channel_to_client(&channel),
                        removed: false,
                    });
                } else {
                    let guild_id = channel.guild_id.clone().unwrap_or_default();
                    if !guild_id.is_empty() {
                        emit(ClientEvent::Channels {
                            guild_id,
                            channels: vec![channel_to_client(&channel)],
                            replace: false,
                        });
                    }
                }
            }
            false
        }
        "CHANNEL_DELETE" => {
            if let Ok(channel) = serde_json::from_value::<DiscordChannel>(data.clone()) {
                let kind = channel_kind_name(channel.kind);
                if kind == "dm" || kind == "group" {
                    emit(ClientEvent::DirectChannel {
                        channel: channel_to_client(&channel),
                        removed: true,
                    });
                } else {
                    let guild_id = channel.guild_id.clone().unwrap_or_default();
                    if !guild_id.is_empty() && !channel.id.is_empty() {
                        emit(ClientEvent::ChannelGone {
                            guild_id,
                            channel_id: channel.id.clone(),
                        });
                    }
                }
            }
            false
        }
        "READY_SUPPLEMENTAL" => {
            if let Some(channels) = data.get("lazy_private_channels").and_then(|v| v.as_array()) {
                for channel in channels {
                    if let Ok(channel) = serde_json::from_value::<DiscordChannel>(channel.clone()) {
                        let kind = channel_kind_name(channel.kind);
                        if kind == "dm" || kind == "group" {
                            emit(ClientEvent::DirectChannel {
                                channel: channel_to_client(&channel),
                                removed: false,
                            });
                        }
                    }
                }
            }
            false
        }
        "RELATIONSHIP_ADD" | "RELATIONSHIP_UPDATE" => {
            let friends = friends_from_relationships(&Value::Array(vec![data.clone()]), None);
            if let Some(friend) = friends.into_iter().next() {
                emit(ClientEvent::Friends { friends: vec![friend] });
            } else if let Some(user_id) = data
                .get("id")
                .and_then(|v| v.as_str())
                .filter(|id| !id.is_empty())
            {
                emit(ClientEvent::FriendRemoved {
                    user_id: user_id.to_string(),
                });
            }
            false
        }
        "RELATIONSHIP_REMOVE" => {
            let user_id = data
                .get("id")
                .and_then(|v| v.as_str())
                .filter(|id| !id.is_empty())
                .map(|id| id.to_string())
                .or_else(|| {
                    data.pointer("/user/id")
                        .and_then(|v| v.as_str())
                        .map(|id| id.to_string())
                });
            if let Some(user_id) = user_id {
                emit(ClientEvent::FriendRemoved { user_id });
            }
            false
        }
        "USER_GUILD_SETTINGS_UPDATE" => {
            let entries = guild_prefs(data);
            if !entries.is_empty() {
                emit(ClientEvent::GuildNotify { entries });
            }
            false
        }
        "USER_SETTINGS_PROTO_UPDATE" => {
            let encoded = data
                .get("settings")
                .and_then(|value| value.get("proto"))
                .and_then(|value| value.as_str())
                .or_else(|| data.get("proto").and_then(|value| value.as_str()));
            let folders = folder_snapshot(&Value::Null, encoded);
            if !folders.folders.is_empty() {
                emit(ClientEvent::Folders { folders: folders.folders });
            }
            false
        }
        "GUILD_MEMBERS_CHUNK" => {
            let guild_id = json_str(data, "guild_id");
            let members = roster_from_chunk(data);
            if !guild_id.is_empty() && !members.is_empty() {
                emit(ClientEvent::Members { guild_id, members });
            }
            false
        }
        "MESSAGE_CREATE" => {
            if let Ok(message) = serde_json::from_value::<DiscordMessage>(data.clone()) {
                emit(ClientEvent::MessageCreate {
                    message: message_to_client(&message),
                });
            }
            false
        }
        "MESSAGE_UPDATE" => {
            let channel_id = json_str(data, "channel_id");
            let message_id = json_str(data, "id");
            if channel_id.is_empty() || message_id.is_empty() {
                return false;
            }
            let client = serde_json::from_value::<DiscordMessage>(data.clone())
                .ok()
                .map(|message| message_to_client(&message));
            emit(ClientEvent::MessageUpdate {
                channel_id,
                message_id,
                content: data
                    .get("content")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                edited: true,
                embeds: data
                    .get("embeds")
                    .and_then(|_| client.as_ref().map(|message| message.embeds.clone())),
                attachments: data
                    .get("attachments")
                    .and_then(|_| client.as_ref().map(|message| message.attachments.clone())),
                stickers: data
                    .get("sticker_items")
                    .and_then(|_| client.as_ref().map(|message| message.stickers.clone())),
                reactions: data
                    .get("reactions")
                    .and_then(|_| client.as_ref().map(|message| message.reactions.clone())),
                mention_ids: data
                    .get("mentions")
                    .and_then(|_| client.as_ref().map(|message| message.mention_ids.clone())),
                mention_users: data
                    .get("mentions")
                    .and_then(|_| client.as_ref().map(|message| message.mention_users.clone())),
            });
            false
        }
        "MESSAGE_DELETE" => {
            let channel_id = data
                .get("channel_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let message_id = data.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !channel_id.is_empty() && !message_id.is_empty() {
                emit(ClientEvent::MessageDelete {
                    channel_id: channel_id.into(),
                    message_id: message_id.into(),
                });
            }
            false
        }
        "MESSAGE_REACTION_ADD" | "MESSAGE_REACTION_REMOVE" => {
            emit_reaction(name, data, emit);
            false
        }
        "USER_NOTE_UPDATE" => {
            let user_id = json_str(data, "id");
            if !user_id.is_empty() {
                let note = super::rest::clamp_note(data.get("note").and_then(|value| value.as_str()).unwrap_or(""));
                emit(ClientEvent::UserNote { user_id, note });
            }
            false
        }
        "PRESENCE_UPDATE" => {
            let user_id = data
                .pointer("/user/id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let activities = data
                .get("activities")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let (custom, activity) = activity_parts(&activities);
            if !user_id.is_empty() {
                emit(ClientEvent::Presence {
                    guild_id: json_str(data, "guild_id"),
                    user_id,
                    status: json_str(data, "status"),
                    custom,
                    activity,
                });
            }
            false
        }
        "MESSAGE_ACK" => {
            let channel_id = json_str(data, "channel_id");
            let message_id = json_str(data, "message_id");
            if !channel_id.is_empty() {
                emit(ClientEvent::ReadState {
                    channel_id,
                    last_message_id: message_id,
                    mention_count: data
                        .get("mention_count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32,
                });
            }
            false
        }
        "VOICE_SERVER_UPDATE" => {
            let endpoint = json_str(data, "endpoint");
            let token = json_str(data, "token");
            if !endpoint.is_empty() && !token.is_empty() {
                emit(ClientEvent::VoiceServer {
                    guild_id: json_str(data, "guild_id"),
                    endpoint,
                    token,
                });
            }
            false
        }
        "VOICE_STATE_UPDATE" => {
            if let Some(state) = parse_voice_state(data, "") {
                emit(ClientEvent::VoiceState(state));
            }
            false
        }
        "THREAD_CREATE" | "THREAD_UPDATE" => {
            if let Ok(channel) = serde_json::from_value::<DiscordChannel>(data.clone()) {
                let guild_id = json_str(data, "guild_id");
                let parent = channel.parent_id.clone().unwrap_or_default();
                emit(ClientEvent::Threads {
                    guild_id,
                    channel_id: parent,
                    threads: vec![channel_to_client(&channel)],
                });
            }
            false
        }
        "TYPING_START" => {
            let channel_id = json_str(data, "channel_id");
            let user_id = json_str(data, "user_id");
            let username = data
                .pointer("/member/user/global_name")
                .or_else(|| data.pointer("/member/user/username"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !channel_id.is_empty() {
                emit(ClientEvent::Typing {
                    channel_id,
                    user_id,
                    username,
                });
            }
            false
        }
        _ => false,
    }
}

fn guild_channel_snapshots(guilds: &[DiscordGuild]) -> Vec<GuildChannelSnapshot> {
    guilds
        .iter()
        .filter(|guild| !guild.channels.is_empty())
        .map(|guild| GuildChannelSnapshot {
            guild_id: guild.id.clone(),
            channels: guild.channels.iter().map(channel_to_client).collect(),
        })
        .collect()
}

fn emit_guild_shell(
    user_id: &str,
    guild: &DiscordGuild,
    my_roles: &[String],
    emit: &mut impl FnMut(ClientEvent),
) {
    let guild_id = guild.id.clone();
    if !guild.channels.is_empty() {
        emit(ClientEvent::Channels {
            guild_id: guild_id.clone(),
            channels: guild.channels.iter().map(channel_to_client).collect(),
            replace: true,
        });
    }
    emit(ClientEvent::GuildAccess {
        access: access_from_guild(guild, user_id, my_roles),
    });
}

fn json_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

#[derive(Deserialize)]
struct Ready {
    user: DiscordUser,
    session_id: String,
    #[serde(default)]
    guilds: Vec<DiscordGuild>,
    #[serde(default)]
    private_channels: Vec<DiscordChannel>,
    #[serde(default)]
    relationships: Option<Value>,
    #[serde(default)]
    presences: Option<Value>,
    #[serde(default)]
    read_state: Value,
    #[serde(default)]
    user_settings: Value,
    #[serde(default)]
    user_settings_proto: Option<String>,
    #[serde(default)]
    user_guild_settings: Value,
    #[serde(default)]
    merged_members: Value,
}

fn member_list_event(data: &Value) -> Option<ClientEvent> {
    let guild_id = json_str(data, "guild_id");
    if guild_id.is_empty() {
        return None;
    }
    let groups: Vec<ClientMemberGroup> = data
        .get("groups")
        .and_then(|value| value.as_array())
        .map(|list| list.iter().filter_map(parse_member_group).collect())
        .unwrap_or_default();
    let ops: Vec<MemberListOp> = data
        .get("ops")
        .and_then(|value| value.as_array())
        .map(|list| list.iter().filter_map(parse_member_op).collect())
        .unwrap_or_default();
    let member_count = data.get("member_count").and_then(|value| value.as_u64()).unwrap_or(0) as u32;
    let online_count = data.get("online_count").and_then(|value| value.as_u64()).unwrap_or(0) as u32;
    if ops.is_empty() && groups.is_empty() && member_count == 0 {
        return None;
    }
    Some(ClientEvent::MemberList {
        guild_id,
        list_id: json_str(data, "id"),
        member_count,
        online_count,
        groups,
        ops,
    })
}

fn parse_member_group(value: &Value) -> Option<ClientMemberGroup> {
    let id = value.get("id").and_then(|item| item.as_str()).unwrap_or("");
    if id.is_empty() {
        return None;
    }
    Some(ClientMemberGroup {
        id: id.to_string(),
        count: value.get("count").and_then(|item| item.as_u64()).unwrap_or(0) as u32,
    })
}

fn parse_range(value: Option<&Value>) -> Option<[u32; 2]> {
    let list = value?.as_array()?;
    let start = list.first()?.as_u64()? as u32;
    let end = list.get(1)?.as_u64()? as u32;
    if end < start {
        return None;
    }
    Some([start, end])
}

fn parse_list_item(value: &Value) -> MemberListItem {
    if let Some(group) = value.get("group") {
        let id = group.get("id").and_then(|item| item.as_str()).unwrap_or("");
        if !id.is_empty() {
            return MemberListItem::Group {
                id: id.to_string(),
                count: group.get("count").and_then(|item| item.as_u64()).unwrap_or(0) as u32,
            };
        }
    }
    if let Some(member) = value.get("member") {
        if let Some(member) = super::types::member_from_list_value(member) {
            return MemberListItem::Member { member };
        }
    }
    MemberListItem::Empty
}

fn parse_member_op(value: &Value) -> Option<MemberListOp> {
    match value.get("op").and_then(|item| item.as_str())? {
        "SYNC" => Some(MemberListOp::Sync {
            range: parse_range(value.get("range"))?,
            items: value
                .get("items")
                .and_then(|item| item.as_array())
                .map(|list| list.iter().map(parse_list_item).collect())
                .unwrap_or_default(),
        }),
        "INSERT" => Some(MemberListOp::Insert {
            index: value.get("index").and_then(|item| item.as_u64())? as u32,
            item: parse_list_item(value.get("item")?),
        }),
        "UPDATE" => Some(MemberListOp::Update {
            index: value.get("index").and_then(|item| item.as_u64())? as u32,
            item: parse_list_item(value.get("item")?),
        }),
        "DELETE" => Some(MemberListOp::Delete {
            index: value.get("index").and_then(|item| item.as_u64())? as u32,
        }),
        "INVALIDATE" => Some(MemberListOp::Invalidate {
            range: parse_range(value.get("range"))?,
        }),
        _ => None,
    }
}

// The reaction helper above is intentionally replaced by passing the event name.
// Keep a single implementation that uses the dispatch name.

fn emit_reaction(name: &str, data: &Value, emit: &mut impl FnMut(ClientEvent)) {
    let channel_id = json_str(data, "channel_id");
    let message_id = json_str(data, "message_id");
    let user_id = json_str(data, "user_id");
    let emoji = data.get("emoji").cloned().unwrap_or(Value::Null);
    let emoji_name = emoji
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("emoji");
    let emoji_id = emoji
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if channel_id.is_empty() || message_id.is_empty() {
        return;
    }
    emit(ClientEvent::Reaction {
        channel_id,
        message_id,
        user_id,
        emoji: emoji_name.into(),
        emoji_id,
        added: name == "MESSAGE_REACTION_ADD",
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_note_update_keeps_the_text() {
        let data = json!({"id": "100000000000000002", "note": "booth quiet"});
        let mut events = Vec::new();
        handle_dispatch("USER_NOTE_UPDATE", &data, None, &mut None, &mut |event| events.push(event));
        match &events[0] {
            ClientEvent::UserNote { user_id, note } => {
                assert_eq!(user_id, "100000000000000002");
                assert_eq!(note, "booth quiet");
            }
            other => panic!("expected a note, got {other:?}"),
        }
        let value = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(value["kind"], "userNote");
        assert_eq!(value["userId"], "100000000000000002");
    }

    #[test]
    fn gateway_url_has_no_token() {
        let url = gateway_url();
        assert!(url.starts_with("wss://gateway.discord.gg/"));
        assert!(!url.to_lowercase().contains("token"));
    }

    #[test]
    fn request_members_is_one_server_and_guild_create_keeps_the_icon() {
        let payload = gateway_command_payload(&GatewayCommand::SubscribeMembers {
            guild_id: "100000000000000010".into(),
            channel_id: "100000000000000021".into(),
            ranges: vec![(0, 99), (100, 199)],
        });
        let value: Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["op"], 14);
        assert_eq!(value["d"]["guild_id"], "100000000000000010");
        assert_eq!(value["d"]["typing"], true);
        assert_eq!(value["d"]["activities"], true);
        assert_eq!(value["d"]["channels"]["100000000000000021"][0][0], 0);
        assert_eq!(value["d"]["channels"]["100000000000000021"][0][1], 99);
        assert_eq!(value["d"]["channels"]["100000000000000021"][1][0], 100);
        let cleared = gateway_command_payload(&GatewayCommand::SubscribeMembers {
            guild_id: "100000000000000010".into(),
            channel_id: String::new(),
            ranges: Vec::new(),
        });
        let cleared: Value = serde_json::from_str(&cleared).unwrap();
        assert_eq!(cleared["op"], 14);
        assert_eq!(cleared["d"]["channels"], json!({}));
        assert_eq!(cleared["d"]["typing"], false);

        let data = json!({
            "id": "100000000000000010",
            "name": "Battlefield",
            "icon": "a1b2c3",
            "channels": [{"id": "100000000000000021", "type": 0, "name": "general", "position": 0}],
            "members": [{
                "nick": null,
                "user": {"id": "100000000000000001", "username": "ethan", "global_name": "Ethan"}
            }]
        });
        let mut events = Vec::new();
        let mut session = None;
        handle_dispatch("GUILD_CREATE", &data, Some(3), &mut session, &mut |event| {
            events.push(event);
        });
        assert!(events.iter().any(|event| matches!(
            event,
            ClientEvent::Guild { guild } if guild.icon_url.as_deref() == Some("https://cdn.discordapp.com/icons/100000000000000010/a1b2c3.png?size=64") && guild.name == "Battlefield"
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            ClientEvent::Members { guild_id, members } if guild_id == "100000000000000010" && members.len() == 1 && members[0].name == "Ethan"
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, ClientEvent::Channels { .. })));
    }

    #[test]
    fn member_list_update_keeps_sync_insert_and_delete() {
        let data = json!({
            "guild_id": "100000000000000010",
            "id": "100000000000000021",
            "member_count": 3,
            "online_count": 2,
            "groups": [{"id": "online", "count": 2}, {"id": "offline", "count": 1}],
            "ops": [
                {"op": "SYNC", "range": [0, 99], "items": [
                    {"group": {"id": "online", "count": 2}},
                    {"member": {
                        "user": {"id": "100000000000000001", "username": "ethan", "global_name": "Ethan", "avatar": "abc"},
                        "roles": ["100000000000000099"],
                        "nick": "Erod",
                        "presence": {"status": "online", "activities": [{"type": 4, "state": "In queue", "emoji": {"name": "🔥"}}]}
                    }}
                ]},
                {"op": "INSERT", "index": 2, "item": {"member": {"user": {"id": "100000000000000002", "username": "maya"}, "presence": {"status": "idle", "activities": [{"type": 0, "name": "Figma"}]}}}},
                {"op": "DELETE", "index": 9},
                {"op": "INVALIDATE", "range": [100, 199]},
                {"op": "NOPE"}
            ]
        });
        let mut events = Vec::new();
        let mut session = None;
        handle_dispatch("GUILD_MEMBER_LIST_UPDATE", &data, Some(4), &mut session, &mut |event| events.push(event));
        let ClientEvent::MemberList { list_id, member_count, online_count, groups, ops, .. } = &events[0] else {
            panic!("expected member list");
        };
        assert_eq!(list_id, "100000000000000021");
        assert_eq!(*member_count, 3);
        assert_eq!(*online_count, 2);
        assert_eq!(groups[0].id, "online");
        assert_eq!(ops.len(), 4);
        match &ops[0] {
            MemberListOp::Sync { range, items } => {
                assert_eq!(*range, [0, 99]);
                match &items[1] {
                    MemberListItem::Member { member } => {
                        assert_eq!(member.nick.as_deref(), Some("Erod"));
                        assert_eq!(member.status, "online");
                        assert_eq!(member.custom, "🔥 In queue");
                        assert_eq!(member.role_ids, vec!["100000000000000099"]);
                    }
                    other => panic!("expected member, got {other:?}"),
                }
            }
            other => panic!("expected sync, got {other:?}"),
        }
        assert!(matches!(ops[1], MemberListOp::Insert { index: 2, .. }));
        assert!(matches!(ops[2], MemberListOp::Delete { index: 9 }));
        assert!(matches!(ops[3], MemberListOp::Invalidate { range: [100, 199] }));

        let ready = json!({
            "user": {"id": "100000000000000001", "username": "ethan", "global_name": "Ethan"},
            "session_id": "sess",
            "private_channels": [{
                "id": "100000000000000041",
                "type": 1,
                "last_message_id": "900",
                "recipients": [{"id": "100000000000000002", "username": "maya", "global_name": "Maya Chen", "avatar": "abc"}]
            }],
            "relationships": [
                {"id": "100000000000000002", "type": 1, "user": {"id": "100000000000000002", "username": "maya", "global_name": "Maya Chen"}}
            ],
            "presences": [{"user": {"id": "100000000000000002"}, "status": "online", "activities": []}],
            "read_state": {"entries": [{"id": "100000000000000041", "last_message_id": "900", "mention_count": 1}], "partial": false, "version": 1},
            "guilds": [{"id": "100000000000000010", "name": "Agartha", "roles": [{"id": "100000000000000099", "name": "Mods", "color": 14852442, "position": 3, "hoist": true}]}]
        });
        events.clear();
        handle_dispatch("READY", &ready, Some(1), &mut session, &mut |event| events.push(event));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::Ready { dms, guild_channels, .. } if dms.len() == 1 && dms[0].name == "Maya Chen" && dms[0].recipients.len() == 1 && guild_channels.is_empty())));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::Friends { friends } if friends.len() == 1 && friends[0].status == "online")));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::Roles { roles, .. } if roles.len() == 1 && roles[0].hoist && roles[0].color.as_deref() == Some("#e2a15a"))));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::ReadState { mention_count: 1, .. })));

        events.clear();
        handle_dispatch("CHANNEL_CREATE", &json!({"id": "100000000000000043", "type": 3, "recipients": [{"id": "100000000000000002", "username": "maya", "global_name": "Maya"}, {"id": "100000000000000003", "username": "jonah", "global_name": "Jonah"}]}), Some(5), &mut session, &mut |event| events.push(event));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::DirectChannel { removed: false, channel } if channel.kind == "group" && channel.name.contains("Maya"))));
    }

    #[test]
    fn guild_create_and_voice_updates_carry_who_is_in_the_channel() {
        let data = json!({
            "id": "100000000000000010",
            "name": "Agartha",
            "voice_states": [{
                "channel_id": "100000000000000026",
                "user_id": "100000000000000003",
                "session_id": "s1",
                "self_mute": false,
                "self_deaf": true,
                "member": {"nick": "Jonah", "user": {"id": "100000000000000003", "username": "jonah", "avatar": "abcd"}}
            }]
        });
        let mut events = Vec::new();
        let mut session = None;
        handle_dispatch("GUILD_CREATE", &data, Some(1), &mut session, &mut |event| events.push(event));
        match events.iter().find(|event| matches!(event, ClientEvent::VoiceStates { .. })) {
            Some(ClientEvent::VoiceStates { guild_id, states }) => {
                assert_eq!(guild_id, "100000000000000010");
                assert_eq!(states.len(), 1);
                assert_eq!(states[0].name, "Jonah");
                assert!(states[0].self_deaf);
                assert_eq!(states[0].channel_id, "100000000000000026");
            }
            _ => panic!("expected voice states"),
        }
        let leave = json!({
            "guild_id": "100000000000000010",
            "channel_id": null,
            "user_id": "100000000000000003",
            "session_id": "s1",
            "self_mute": true
        });
        let mut left = Vec::new();
        handle_dispatch("VOICE_STATE_UPDATE", &leave, Some(2), &mut session, &mut |event| left.push(event));
        match &left[0] {
            ClientEvent::VoiceState(state) => {
                assert!(state.channel_id.is_empty());
                assert!(state.self_mute);
                assert_eq!(state.session_id, "s1");
            }
            _ => panic!("expected voice state"),
        }
    }

    #[test]
    fn identify_is_labeled_as_lark() {
        let payload = identify_payload("secret-token-value-example", None);
        let value: Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["d"]["properties"]["browser"], "Lark");
        assert_eq!(value["d"]["properties"]["device"], "Lark");
        assert_ne!(value["d"]["properties"]["browser"], "Discord Client");
        assert!(value["d"].get("intents").is_none());
        assert_eq!(value["d"]["capabilities"], USER_CAPABILITIES);
        let with_intents = identify_payload("secret-token-value-example", Some(CLIENT_INTENTS));
        let with_intents: Value = serde_json::from_str(&with_intents).unwrap();
        assert_eq!(with_intents["d"]["intents"], CLIENT_INTENTS);
        assert!(payload.contains("secret-token-value-example"));
        let heartbeat = heartbeat_payload(Some(4));
        assert!(heartbeat.contains("\"op\":1"));
    }

    #[test]
    fn intents_include_presence_and_skip_member_lists() {
        assert_eq!(CLIENT_INTENTS & (1 << 1), 0, "guild members");
        assert_ne!(CLIENT_INTENTS & (1 << 8), 0, "presence");
        assert_ne!(CLIENT_INTENTS & (1 << 9), 0, "guild messages");
        assert_ne!(CLIENT_INTENTS & (1 << 12), 0, "direct messages");
        assert_eq!(
            intents_without_message_content(CLIENT_INTENTS) & (1 << 15),
            0
        );
    }

    #[test]
    fn parses_hello_and_dispatch_frames() {
        let hello = parse_frame(r#"{"op":10,"d":{"heartbeat_interval":41250}}"#).unwrap();
        assert_eq!(hello.op, 10);
        assert_eq!(hello.data["heartbeat_interval"], 41250);
        let message =
            parse_frame(r#"{"t":"MESSAGE_CREATE","s":8,"op":0,"d":{"id":"1","content":"hi"}}"#)
                .unwrap();
        assert_eq!(message.name.as_deref(), Some("MESSAGE_CREATE"));
        assert_eq!(message.seq, Some(8));
    }

    #[test]
    fn client_event_json_uses_camel_case() {
        let event = ClientEvent::MessageDelete {
            channel_id: "1".into(),
            message_id: "2".into(),
        };
        let value = serde_json::to_value(&event).unwrap();
        assert_eq!(value["kind"], "messageDelete");
        assert_eq!(value["channelId"], "1");
        assert_eq!(value["messageId"], "2");
    }

    #[test]
    fn message_update_omits_content_when_discord_did_not_send_it() {
        let data = json!({
            "id": "55",
            "channel_id": "42",
            "embeds": [{"title": "Preview", "provider": {"name": "Tenor"}, "video": {"url": "https://media.tenor.com/clip.mp4"}}]
        });
        let mut events = Vec::new();
        handle_dispatch("MESSAGE_UPDATE", &data, None, &mut None, &mut |event| {
            events.push(event);
        });
        match &events[0] {
            ClientEvent::MessageUpdate {
                content,
                embeds,
                edited,
                ..
            } => {
                assert!(content.is_none());
                assert!(*edited);
                assert_eq!(
                    embeds.as_ref().unwrap()[0].title.as_deref(),
                    Some("Preview")
                );
                assert!(embeds.as_ref().unwrap()[0]
                    .video
                    .as_deref()
                    .unwrap()
                    .contains("tenor"));
            }
            other => panic!("expected message update, got {other:?}"),
        }
        let value = serde_json::to_value(&events[0]).unwrap();
        assert!(value.get("content").is_none());
    }

    #[test]
    fn close_codes_explain_the_failure() {
        let rejected = gateway_close_message(4004, "Authentication failed");
        assert!(rejected.contains("4004"));
        assert!(
            rejected.contains("authentication failed") || rejected.contains("rejected the token")
        );
        assert!(!rejected.contains("secret-token"));
        assert!(matches!(
            close_code_end(4004, "Authentication failed"),
            SessionEnd::Stop(_)
        ));
        assert!(matches!(
            close_code_end(4014, ""),
            SessionEnd::DisallowedIntent
        ));
        match close_code_end(4000, "unknown") {
            SessionEnd::Reconnect {
                invalidate,
                close_code,
                ..
            } => {
                assert!(!invalidate);
                assert_eq!(close_code, Some(4000));
            }
            other => panic!("expected reconnect, got {other:?}"),
        }
        match close_code_end(4007, "invalid seq") {
            SessionEnd::Reconnect { invalidate, .. } => assert!(invalidate),
            other => panic!("expected invalidate, got {other:?}"),
        }
        assert!(invalidate_session(4009));
        assert!(!invalidate_session(4000));
        assert!(!should_resume("session", None));
        assert!(should_resume("session", Some(8)));
        assert_eq!(heartbeat_millis(0), 5_000);
        assert_eq!(heartbeat_millis(41_250), 41_250);
        assert_eq!(heartbeat_millis(u64::MAX), 120_000);
        assert_eq!(reconnect_wait_secs(1, None), 1);
        assert_eq!(reconnect_wait_secs(1, Some(4008)), 10);
        assert_eq!(reconnect_wait_secs(30, Some(4008)), 30);
        assert!(matches!(close_code_end(4013, ""), SessionEnd::Stop(_)));
        let request = gateway_handshake_request().unwrap();
        assert!(request
            .uri()
            .to_string()
            .starts_with("wss://gateway.discord.gg/"));
        assert!(!request
            .uri()
            .to_string()
            .to_ascii_lowercase()
            .contains("token"));
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
        assert_eq!(intents_without_presence(CLIENT_INTENTS) & (1 << 8), 0);
    }

    #[test]
    fn ready_carries_folders_read_state_and_channel_bits() {
        let data = json!({
            "user": {"id": "100000000000000001", "username": "ethan", "global_name": "Ethan"},
            "session_id": "sess",
            "guilds": [{
                "id": "100000000000000010",
                "name": "Northwind",
                "owner": false,
                "permissions": "1024",
                "roles": [{"id": "100000000000000010", "name": "@everyone", "permissions": "1024"}],
                "channels": [{
                    "id": "100000000000000021",
                    "type": 0,
                    "name": "general",
                    "position": 0,
                    "last_message_id": "100000000000000300",
                    "permission_overwrites": [{"id": "100000000000000010", "type": 0, "allow": "0", "deny": "1024"}]
                }]
            }],
            "private_channels": [],
            "read_state": {"entries": [{"id": "100000000000000021", "last_message_id": "100000000000000200", "mention_count": 1}]},
            "user_settings": {"guild_folders": [{"id": 1, "name": "Work", "color": 5793266, "guild_ids": ["100000000000000010"]}]},
            "user_guild_settings": {"entries": [{"guild_id": "100000000000000010", "muted": false, "message_notifications": 0, "channel_overrides": []}]},
            "merged_members": [[{"roles": ["100000000000000099"]}]]
        });
        let mut events = Vec::new();
        let mut session = None;
        assert!(handle_dispatch("READY", &data, Some(1), &mut session, &mut |event| events.push(event)));
        assert!(events.iter().any(|event| matches!(
            event,
            ClientEvent::Ready { guild_channels, .. }
                if guild_channels.len() == 1
                    && guild_channels[0].guild_id == "100000000000000010"
                    && guild_channels[0].channels[0].name == "general"
        )));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::Folders { folders } if folders[0].name.as_deref() == Some("Work"))));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::ReadState { mention_count: 1, .. })));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::GuildAccess { access } if access.my_roles == vec!["100000000000000099"] && access.permissions == "1024")));
        assert!(events.iter().any(|event| matches!(
            event,
            ClientEvent::Channels { replace: true, channels, .. } if channels[0].overwrites.len() == 1 && channels[0].last_message_id.as_deref() == Some("100000000000000300")
        )));
        assert!(events.iter().any(|event| matches!(event, ClientEvent::GuildNotify { .. })));
    }

    #[test]
    fn reaction_add_and_remove() {
        let mut events = Vec::new();
        let data = serde_json::json!({
            "channel_id": "10",
            "message_id": "11",
            "user_id": "12",
            "emoji": {"name": "🔥", "id": null}
        });
        emit_reaction("MESSAGE_REACTION_ADD", &data, &mut |event| {
            events.push(event)
        });
        match &events[0] {
            ClientEvent::Reaction { added, emoji, .. } => {
                assert!(*added);
                assert_eq!(emoji, "🔥");
            }
            _ => panic!("expected reaction"),
        }
    }
}
