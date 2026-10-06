use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::types::{
    channel_to_client, guild_to_client, message_to_client, user_to_client, ClientChannel,
    ClientGuild, ClientMessage, ClientUser, DiscordChannel, DiscordGuild, DiscordMessage,
    DiscordUser,
};

/// Guilds, presence, messages, reactions, typing, and direct messages.
/// The full member-list intent stays off; members load from the REST list.
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

pub fn gateway_url() -> &'static str {
    "wss://gateway.discord.gg/?v=10&encoding=json"
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ClientEvent {
    Status {
        state: String,
        detail: String,
    },
    Ready {
        user: ClientUser,
        guilds: Vec<ClientGuild>,
        dms: Vec<ClientChannel>,
    },
    Channels {
        guild_id: String,
        channels: Vec<ClientChannel>,
    },
    MessageCreate {
        message: ClientMessage,
    },
    MessageUpdate {
        channel_id: String,
        message_id: String,
        content: Option<String>,
        edited: bool,
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
    VoiceState {
        guild_id: String,
        channel_id: String,
        user_id: String,
        session_id: String,
        mute: bool,
        deaf: bool,
    },
    Threads {
        guild_id: String,
        channel_id: String,
        threads: Vec<ClientChannel>,
    },
}

#[derive(Debug)]
enum SessionEnd {
    Shutdown,
    Reconnect,
    AuthFailed,
    DisallowedIntent,
}

struct Session {
    id: String,
    seq: Option<u64>,
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
}

pub fn gateway_command_payload(command: &GatewayCommand) -> String {
    match command {
        GatewayCommand::VoiceState {
            guild_id,
            channel_id,
            mute,
            deaf,
        } => super::voice::main_voice_state(guild_id.as_deref(), channel_id.as_deref(), *mute, *deaf),
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
    let mut intents = CLIENT_INTENTS;
    let mut dropped_content_intent = false;

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
        match connect_once(&token, &mut session, intents, &mut shutdown, &mut outbound, &mut emit).await {
            Ok(SessionEnd::Shutdown) => break,
            Ok(SessionEnd::AuthFailed) => {
                emit(ClientEvent::Status {
                    state: "failed".into(),
                    detail: "Discord rejected the token.".into(),
                });
                break;
            }
            Ok(SessionEnd::DisallowedIntent) if !dropped_content_intent => {
                intents = intents_without_message_content(intents);
                dropped_content_intent = true;
                session = None;
                emit(ClientEvent::Status {
                    state: "reconnecting".into(),
                    detail: "Discord rejected the message content intent. Reconnecting without it. History still loads from the API.".into(),
                });
                continue;
            }
            Ok(_) | Err(_) => {
                emit(ClientEvent::Status {
                    state: "reconnecting".into(),
                    detail: format!("Waiting {backoff_secs}s before reconnecting."),
                });
                tokio::select! {
                    changed = shutdown.changed() => {
                        if changed.is_err() || *shutdown.borrow() {
                            break;
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_secs(backoff_secs)) => {}
                }
                backoff_secs = (backoff_secs * 2).min(60);
            }
        }
    }
}

async fn connect_once<F>(
    token: &str,
    session: &mut Option<Session>,
    intents: u64,
    shutdown: &mut watch::Receiver<bool>,
    outbound: &mut mpsc::UnboundedReceiver<GatewayCommand>,
    emit: &mut F,
) -> Result<SessionEnd, ()>
where
    F: FnMut(ClientEvent),
{
    let (socket, _) = connect_async(gateway_url()).await.map_err(|_| ())?;
    let (mut write, mut read) = socket.split();
    let mut heartbeat_every: Option<Duration> = None;
    let mut next_heartbeat: Option<Instant> = None;
    let mut last_ack = Instant::now();
    let mut identified = false;

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
                        return Ok(SessionEnd::Reconnect);
                    }
                }
            }
            _ = heartbeat_wait => {
                if let Some(every) = heartbeat_every {
                    if last_ack.elapsed() > every * 2 && identified {
                        return Ok(SessionEnd::Reconnect);
                    }
                }
                let seq = session.as_ref().and_then(|s| s.seq);
                let payload = heartbeat_payload(seq);
                if write.send(Message::Text(payload)).await.is_err() {
                    return Ok(SessionEnd::Reconnect);
                }
                if let Some(every) = heartbeat_every {
                    next_heartbeat = Some(Instant::now() + every);
                }
            }
            frame = read.next() => {
                let Some(frame) = frame else {
                    return Ok(SessionEnd::Reconnect);
                };
                let frame = frame.map_err(|_| ())?;
                match frame {
                    Message::Ping(payload) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Message::Close(frame) => {
                        let code = frame.map(|c| u16::from(c.code)).unwrap_or(0);
                        return Ok(close_code_end(code));
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
                                let interval = incoming
                                    .data
                                    .get("heartbeat_interval")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(41250);
                                let every = Duration::from_millis(interval);
                                heartbeat_every = Some(every);
                                next_heartbeat = Some(Instant::now() + every / 2);
                                last_ack = Instant::now();
                                let payload = if let Some(session) = session.as_ref() {
                                    resume_payload(token, &session.id, session.seq)
                                } else {
                                    identify_payload(token, intents)
                                };
                                if write.send(Message::Text(payload)).await.is_err() {
                                    return Ok(SessionEnd::Reconnect);
                                }
                                identified = true;
                            }
                            11 => {
                                last_ack = Instant::now();
                            }
                            1 => {
                                let seq = session.as_ref().and_then(|s| s.seq);
                                let _ = write.send(Message::Text(heartbeat_payload(seq))).await;
                            }
                            7 => return Ok(SessionEnd::Reconnect),
                            9 => {
                                let can_resume = incoming.data.as_bool().unwrap_or(false);
                                if !can_resume {
                                    *session = None;
                                }
                                return Ok(SessionEnd::Reconnect);
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

fn close_code_end(code: u16) -> SessionEnd {
    match code {
        4004 => SessionEnd::AuthFailed,
        4014 => SessionEnd::DisallowedIntent,
        _ => SessionEnd::Reconnect,
    }
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

pub fn identify_payload(token: &str, intents: u64) -> String {
    json!({
        "op": 2,
        "d": {
            "token": token,
            "intents": intents,
            "properties": {
                "os": std::env::consts::OS,
                "browser": "Lark",
                "device": "Lark"
            },
            "compress": false
        }
    })
    .to_string()
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
                *session = Some(Session {
                    id: ready.session_id,
                    seq,
                });
                emit(ClientEvent::Ready {
                    user: user_to_client(&ready.user),
                    guilds: ready.guilds.iter().map(guild_to_client).collect(),
                    dms: ready
                        .private_channels
                        .iter()
                        .map(channel_to_client)
                        .collect(),
                });
                for marker in &ready.read_state {
                    let Some(channel_id) = marker.get("id").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    emit(ClientEvent::ReadState {
                        channel_id: channel_id.to_string(),
                        last_message_id: marker
                            .get("last_message_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        mention_count: marker
                            .get("mention_count")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32,
                    });
                }
                return true;
            }
            false
        }
        "GUILD_CREATE" => {
            if let Ok(guild) = serde_json::from_value::<DiscordGuild>(data.clone()) {
                if !guild.channels.is_empty() {
                    emit(ClientEvent::Channels {
                        guild_id: guild.id.clone(),
                        channels: guild.channels.iter().map(channel_to_client).collect(),
                    });
                }
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
            if let Ok(message) = serde_json::from_value::<DiscordMessage>(data.clone()) {
                emit(ClientEvent::MessageUpdate {
                    channel_id: message.channel_id,
                    message_id: message.id,
                    content: Some(message.content),
                    edited: true,
                });
            }
            false
        }
        "MESSAGE_DELETE" => {
            let channel_id = data.get("channel_id").and_then(|v| v.as_str()).unwrap_or("");
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
        "PRESENCE_UPDATE" => {
            let user_id = data
                .pointer("/user/id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let custom = data
                .pointer("/activities")
                .and_then(|v| v.as_array())
                .and_then(|list| {
                    list.iter().find_map(|activity| {
                        activity
                            .get("state")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                })
                .unwrap_or_default();
            if !user_id.is_empty() {
                emit(ClientEvent::Presence {
                    guild_id: json_str(data, "guild_id"),
                    user_id,
                    status: json_str(data, "status"),
                    custom,
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
            emit(ClientEvent::VoiceState {
                guild_id: json_str(data, "guild_id"),
                channel_id: json_str(data, "channel_id"),
                user_id: json_str(data, "user_id"),
                session_id: json_str(data, "session_id"),
                mute: data.get("mute").and_then(|v| v.as_bool()).unwrap_or(false)
                    || data.get("self_mute").and_then(|v| v.as_bool()).unwrap_or(false),
                deaf: data.get("deaf").and_then(|v| v.as_bool()).unwrap_or(false)
                    || data.get("self_deaf").and_then(|v| v.as_bool()).unwrap_or(false),
            });
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
    read_state: Vec<Value>,
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
    fn gateway_url_has_no_token() {
        let url = gateway_url();
        assert!(url.starts_with("wss://gateway.discord.gg/"));
        assert!(!url.to_lowercase().contains("token"));
    }

    #[test]
    fn identify_is_labeled_as_lark() {
        let payload = identify_payload("secret-token-value-example", CLIENT_INTENTS);
        let value: Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["d"]["properties"]["browser"], "Lark");
        assert_eq!(value["d"]["properties"]["device"], "Lark");
        assert_ne!(value["d"]["properties"]["browser"], "Discord Client");
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
        let message = parse_frame(
            r#"{"t":"MESSAGE_CREATE","s":8,"op":0,"d":{"id":"1","content":"hi"}}"#,
        )
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
    fn close_codes() {
        assert!(matches!(close_code_end(4004), SessionEnd::AuthFailed));
        assert!(matches!(close_code_end(4014), SessionEnd::DisallowedIntent));
        assert!(matches!(close_code_end(4000), SessionEnd::Reconnect));
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
        emit_reaction("MESSAGE_REACTION_ADD", &data, &mut |event| events.push(event));
        match &events[0] {
            ClientEvent::Reaction { added, emoji, .. } => {
                assert!(*added);
                assert_eq!(emoji, "🔥");
            }
            _ => panic!("expected reaction"),
        }
    }
}
