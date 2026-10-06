use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordUser {
    pub id: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub global_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub bot: bool,
}

impl DiscordUser {
    pub fn display_name(&self) -> String {
        self.global_name
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| self.username.clone())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordGuild {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub unavailable: bool,
    #[serde(default)]
    pub channels: Vec<DiscordChannel>,
    #[serde(default)]
    pub members: Vec<DiscordMember>,
    #[serde(default)]
    pub presences: Vec<DiscordPresence>,
    #[serde(default)]
    pub roles: Vec<DiscordRole>,
}

/// A gateway presence. User objects here are often just an id.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordPresence {
    #[serde(default)]
    pub user: Option<DiscordUser>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub activities: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordChannel {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: i32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub guild_id: Option<String>,
    #[serde(default)]
    pub position: i32,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub topic: Option<String>,
    #[serde(default)]
    pub recipients: Vec<DiscordUser>,
    #[serde(default)]
    pub last_message_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordMessage {
    pub id: String,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub guild_id: Option<String>,
    #[serde(default)]
    pub author: Option<DiscordUser>,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub edited_timestamp: Option<String>,
    #[serde(default)]
    pub attachments: Vec<DiscordAttachment>,
    #[serde(default)]
    pub embeds: Vec<DiscordEmbed>,
    #[serde(default)]
    pub reactions: Vec<DiscordReaction>,
    #[serde(default)]
    pub mentions: Vec<DiscordUser>,
    #[serde(default)]
    pub mention_everyone: bool,
    #[serde(default)]
    pub referenced_message: Option<Box<DiscordMessage>>,
    #[serde(rename = "type", default)]
    pub kind: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordAttachment {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordEmbed {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub color: Option<u32>,
    #[serde(default)]
    pub author: Option<DiscordEmbedAuthor>,
    #[serde(default)]
    pub fields: Vec<DiscordEmbedField>,
    #[serde(default)]
    pub footer: Option<DiscordEmbedFooter>,
    #[serde(default)]
    pub image: Option<DiscordEmbedMedia>,
    #[serde(default)]
    pub thumbnail: Option<DiscordEmbedMedia>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordEmbedAuthor {
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordEmbedField {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub inline: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordEmbedFooter {
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordEmbedMedia {
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordReaction {
    #[serde(default)]
    pub count: u32,
    #[serde(default)]
    pub me: bool,
    pub emoji: DiscordEmoji,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordEmoji {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub animated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordMember {
    #[serde(default)]
    pub nick: Option<String>,
    #[serde(default)]
    pub user: Option<DiscordUser>,
    #[serde(default)]
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordRole {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub color: u32,
    #[serde(default)]
    pub position: i32,
    #[serde(default)]
    pub hoist: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientUser {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub bot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientGuild {
    pub id: String,
    pub name: String,
    pub icon_url: Option<String>,
    pub initials: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientChannel {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub position: i32,
    pub topic: Option<String>,
    pub recipient_ids: Vec<String>,
    #[serde(default)]
    pub recipients: Vec<ClientUser>,
    #[serde(default)]
    pub last_message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientAttachment {
    pub id: String,
    pub name: String,
    pub url: String,
    pub content_type: String,
    pub size: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientEmbedField {
    pub name: String,
    pub value: String,
    pub inline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientEmbed {
    pub color: Option<String>,
    pub author: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub fields: Vec<ClientEmbedField>,
    pub footer: Option<String>,
    pub image: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientReaction {
    pub emoji: String,
    pub emoji_id: Option<String>,
    pub animated: bool,
    pub count: u32,
    pub me: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientReply {
    pub id: String,
    pub author_name: String,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientMessage {
    pub id: String,
    pub channel_id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_bot: bool,
    pub content: String,
    pub timestamp: String,
    pub edited: bool,
    pub attachments: Vec<ClientAttachment>,
    pub embeds: Vec<ClientEmbed>,
    pub reactions: Vec<ClientReaction>,
    pub mention_ids: Vec<String>,
    pub mention_everyone: bool,
    pub reply: Option<ClientReply>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientRole {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub position: i32,
    #[serde(default)]
    pub hoist: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientMember {
    pub id: String,
    pub name: String,
    pub nick: Option<String>,
    pub bot: bool,
    pub role_ids: Vec<String>,
    pub status: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub custom: String,
    #[serde(default)]
    pub activity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientMutualGuild {
    pub id: String,
    pub nick: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientProfile {
    pub id: String,
    pub name: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub accent: Option<String>,
    pub bio: String,
    pub pronouns: String,
    pub nick: Option<String>,
    pub role_ids: Vec<String>,
    pub mutual_guilds: Vec<ClientMutualGuild>,
    pub mutual_friends: u32,
    pub bot: bool,
    pub joined_at: String,
}

pub fn snowflake_ok(value: &str) -> bool {
    let len = value.len();
    (5..=22).contains(&len) && value.chars().all(|c| c.is_ascii_digit())
}

pub fn kind_name(kind: i32) -> &'static str {
    match kind {
        19 => "reply",
        7 => "join",
        0 => "default",
        _ => "system",
    }
}

pub fn channel_kind_name(kind: i32) -> &'static str {
    match kind {
        0 | 5 => "text",
        2 | 13 => "voice",
        4 => "category",
        15 => "forum",
        1 => "dm",
        3 => "group",
        10 | 11 | 12 => "thread",
        _ => "text",
    }
}

pub fn color_hex(color: u32) -> Option<String> {
    if color == 0 {
        None
    } else {
        Some(format!("#{color:06x}"))
    }
}

pub fn avatar_url(user_id: &str, avatar: &Option<String>) -> Option<String> {
    let hash = avatar.as_deref()?;
    if !snowflake_ok(user_id) || !asset_hash_ok(hash) {
        return None;
    }
    let ext = if hash.starts_with("a_") { "gif" } else { "png" };
    Some(format!(
        "https://cdn.discordapp.com/avatars/{user_id}/{hash}.{ext}?size=64"
    ))
}

pub fn banner_url(user_id: &str, banner: &Option<String>) -> Option<String> {
    let hash = banner.as_deref()?;
    if !snowflake_ok(user_id) || !asset_hash_ok(hash) {
        return None;
    }
    let ext = if hash.starts_with("a_") { "gif" } else { "png" };
    Some(format!(
        "https://cdn.discordapp.com/banners/{user_id}/{hash}.{ext}?size=480"
    ))
}

pub fn guild_icon_url(guild_id: &str, icon: &Option<String>) -> Option<String> {
    let hash = icon.as_deref()?;
    if !snowflake_ok(guild_id) || !asset_hash_ok(hash) {
        return None;
    }
    Some(format!(
        "https://cdn.discordapp.com/icons/{guild_id}/{hash}.png?size=64"
    ))
}

fn asset_hash_ok(hash: &str) -> bool {
    !hash.is_empty()
        && hash.len() <= 64
        && hash
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

pub fn initials(name: &str) -> String {
    let mut chars = name
        .split_whitespace()
        .filter_map(|part| part.chars().next());
    let first = chars.next().unwrap_or('?');
    match chars.next() {
        Some(second) => format!("{first}{second}").to_uppercase(),
        None => first.to_uppercase().to_string(),
    }
}

pub fn user_to_client(user: &DiscordUser) -> ClientUser {
    ClientUser {
        id: user.id.clone(),
        name: {
            let name = user.display_name();
            if name.is_empty() {
                "Unknown".into()
            } else {
                name
            }
        },
        avatar_url: avatar_url(&user.id, &user.avatar),
        bot: user.bot,
    }
}

pub fn guild_to_client(guild: &DiscordGuild) -> ClientGuild {
    let name = if guild.name.is_empty() {
        "Server".into()
    } else {
        guild.name.clone()
    };
    ClientGuild {
        id: guild.id.clone(),
        icon_url: guild_icon_url(&guild.id, &guild.icon),
        initials: initials(&name),
        name,
    }
}

pub fn channel_to_client(channel: &DiscordChannel) -> ClientChannel {
    let kind = channel_kind_name(channel.kind);
    let name = if kind == "dm" || kind == "group" {
        let names: Vec<String> = channel
            .recipients
            .iter()
            .map(|u| u.display_name())
            .filter(|n| !n.is_empty())
            .collect();
        if names.is_empty() {
            channel.name.clone().unwrap_or_else(|| "Direct message".into())
        } else {
            names.join(", ")
        }
    } else {
        channel
            .name
            .clone()
            .unwrap_or_else(|| "channel".into())
    };
    ClientChannel {
        id: channel.id.clone(),
        name,
        kind: kind.into(),
        parent_id: channel.parent_id.clone(),
        position: channel.position,
        topic: channel.topic.clone(),
        recipient_ids: channel.recipients.iter().map(|u| u.id.clone()).collect(),
        recipients: channel.recipients.iter().map(user_to_client).collect(),
        last_message_id: channel.last_message_id.clone(),
    }
}

pub fn message_to_client(message: &DiscordMessage) -> ClientMessage {
    let author = message.author.as_ref();
    let reply = message.referenced_message.as_ref().map(|referenced| {
        let preview = if referenced.content.is_empty() {
            "Attachment".into()
        } else {
            let mut text = referenced.content.clone();
            if text.chars().count() > 80 {
                text = text.chars().take(80).collect::<String>() + "…";
            }
            text
        };
        ClientReply {
            id: referenced.id.clone(),
            author_name: referenced
                .author
                .as_ref()
                .map(|u| u.display_name())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| "someone".into()),
            preview,
        }
    });
    ClientMessage {
        id: message.id.clone(),
        channel_id: message.channel_id.clone(),
        author_id: author.map(|u| u.id.clone()).unwrap_or_default(),
        author_name: author
            .map(|u| u.display_name())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "Unknown".into()),
        author_bot: author.map(|u| u.bot).unwrap_or(false),
        content: message.content.clone(),
        timestamp: message.timestamp.clone(),
        edited: message.edited_timestamp.is_some(),
        attachments: message
            .attachments
            .iter()
            .map(|att| ClientAttachment {
                id: att.id.clone(),
                name: att.filename.clone(),
                url: att.url.clone(),
                content_type: att.content_type.clone().unwrap_or_default(),
                size: att.size,
                width: att.width,
                height: att.height,
            })
            .collect(),
        embeds: message.embeds.iter().map(embed_to_client).collect(),
        reactions: message
            .reactions
            .iter()
            .map(|reaction| ClientReaction {
                emoji: reaction.emoji.name.clone().unwrap_or_else(|| "emoji".into()),
                emoji_id: reaction.emoji.id.clone(),
                animated: reaction.emoji.animated,
                count: reaction.count,
                me: reaction.me,
            })
            .collect(),
        mention_ids: message.mentions.iter().map(|u| u.id.clone()).collect(),
        mention_everyone: message.mention_everyone,
        reply,
        kind: kind_name(message.kind).into(),
    }
}

fn embed_to_client(embed: &DiscordEmbed) -> ClientEmbed {
    ClientEmbed {
        color: embed.color.and_then(color_hex),
        author: embed.author.as_ref().map(|a| a.name.clone()),
        title: embed.title.clone(),
        url: embed.url.clone(),
        description: embed.description.clone(),
        fields: embed
            .fields
            .iter()
            .map(|field| ClientEmbedField {
                name: field.name.clone(),
                value: field.value.clone(),
                inline: field.inline,
            })
            .collect(),
        footer: embed.footer.as_ref().map(|f| f.text.clone()),
        image: embed.image.as_ref().map(|m| m.url.clone()),
        thumbnail: embed.thumbnail.as_ref().map(|m| m.url.clone()),
    }
}

pub fn role_to_client(role: &DiscordRole) -> ClientRole {
    ClientRole {
        id: role.id.clone(),
        name: role.name.clone(),
        color: color_hex(role.color),
        position: role.position,
        hoist: role.hoist,
    }
}

pub fn member_to_client(member: &DiscordMember) -> Option<ClientMember> {
    let user = member.user.as_ref()?;
    let name = user.display_name();
    Some(ClientMember {
        id: user.id.clone(),
        name: if name.is_empty() {
            "Unknown".into()
        } else {
            name
        },
        nick: member.nick.clone().filter(|nick| !nick.is_empty()),
        bot: user.bot,
        role_ids: member.roles.clone(),
        status: "offline".into(),
        avatar_url: avatar_url(&user.id, &user.avatar),
        custom: String::new(),
        activity: String::new(),
    })
}

pub fn normalize_presence_status(status: &str) -> String {
    match status {
        "online" | "idle" | "dnd" => status.to_string(),
        _ => "offline".into(),
    }
}

/// Custom status text, then a short activity line (`Playing …`, `Listening to …`).
pub fn activity_parts(activities: &[serde_json::Value]) -> (String, String) {
    let mut custom = String::new();
    let mut activity = String::new();
    for item in activities {
        let kind = item.get("type").and_then(|value| value.as_i64()).unwrap_or(-1);
        if kind == 4 {
            let emoji = item
                .pointer("/emoji/name")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let state = item.get("state").and_then(|value| value.as_str()).unwrap_or("");
            custom = match (emoji.is_empty(), state.is_empty()) {
                (true, true) => String::new(),
                (false, true) => emoji.to_string(),
                (true, false) => state.to_string(),
                (false, false) => format!("{emoji} {state}"),
            };
            continue;
        }
        if !activity.is_empty() {
            continue;
        }
        let name = item.get("name").and_then(|value| value.as_str()).unwrap_or("");
        if name.is_empty() {
            continue;
        }
        if kind == 2 {
            let song = item
                .get("details")
                .and_then(|value| value.as_str())
                .filter(|text| !text.is_empty());
            let artist = item.get("state").and_then(|value| value.as_str()).unwrap_or("");
            activity = match (song, artist.is_empty()) {
                (Some(song), false) => format!("Listening to {song} — {artist}"),
                (Some(song), true) => format!("Listening to {song}"),
                (None, _) => format!("Listening to {name}"),
            };
            continue;
        }
        let verb = match kind {
            0 => "Playing",
            1 => "Streaming",
            3 => "Watching",
            5 => "Competing in",
            _ => "",
        };
        activity = if verb.is_empty() {
            name.to_string()
        } else {
            format!("{verb} {name}")
        };
    }
    (custom, activity)
}

fn apply_presences(members: &[DiscordMember], presences: &[DiscordPresence]) -> Vec<ClientMember> {
    let mut by_id = std::collections::HashMap::new();
    for presence in presences {
        let Some(user) = presence.user.as_ref() else {
            continue;
        };
        if user.id.is_empty() {
            continue;
        }
        let (custom, activity) = activity_parts(&presence.activities);
        by_id.insert(
            user.id.clone(),
            (
                normalize_presence_status(&presence.status),
                custom,
                activity,
            ),
        );
    }
    let mut out = Vec::new();
    for member in members {
        let Some(mut client) = member_to_client(member) else {
            continue;
        };
        if let Some((status, custom, activity)) = by_id.get(&client.id) {
            client.status = status.clone();
            if !custom.is_empty() {
                client.custom = custom.clone();
            }
            if !activity.is_empty() {
                client.activity = activity.clone();
            }
        }
        out.push(client);
    }
    out
}

/// Members shipped on GUILD_CREATE, with presence folded in when Discord sent it.
pub fn roster_from_guild(guild: &DiscordGuild) -> Vec<ClientMember> {
    apply_presences(&guild.members, &guild.presences)
}

pub fn member_from_list_value(member: &serde_json::Value) -> Option<ClientMember> {
    let user = member.get("user")?;
    let id = user.get("id").and_then(|value| value.as_str()).unwrap_or("");
    if id.is_empty() {
        return None;
    }
    let username = user.get("username").and_then(|value| value.as_str()).unwrap_or("");
    let global = user
        .get("global_name")
        .and_then(|value| value.as_str())
        .filter(|name| !name.is_empty());
    let name = global
        .unwrap_or(if username.is_empty() { "Unknown" } else { username })
        .to_string();
    let avatar = user
        .get("avatar")
        .and_then(|value| value.as_str())
        .map(|hash| hash.to_string());
    let nick = member
        .get("nick")
        .and_then(|value| value.as_str())
        .filter(|nick| !nick.is_empty())
        .map(|nick| nick.to_string());
    let role_ids = member
        .get("roles")
        .and_then(|value| value.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|value| value.as_str().map(|id| id.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let presence = member.get("presence");
    let status = presence
        .and_then(|value| value.get("status"))
        .and_then(|value| value.as_str())
        .unwrap_or("offline");
    let activities = presence
        .and_then(|value| value.get("activities"))
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let (custom, activity) = activity_parts(&activities);
    Some(ClientMember {
        id: id.to_string(),
        name,
        nick,
        bot: user.get("bot").and_then(|value| value.as_bool()).unwrap_or(false),
        role_ids,
        status: normalize_presence_status(status),
        avatar_url: avatar_url(id, &avatar),
        custom,
        activity,
    })
}

fn presence_lookup(presences: Option<&serde_json::Value>) -> std::collections::HashMap<String, (String, String, String)> {
    let mut by_id = std::collections::HashMap::new();
    let Some(serde_json::Value::Array(list)) = presences else {
        return by_id;
    };
    for presence in list {
        let id = presence
            .pointer("/user/id")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if id.is_empty() {
            continue;
        }
        let activities = presence
            .get("activities")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let (custom, activity) = activity_parts(&activities);
        by_id.insert(
            id.to_string(),
            (
                normalize_presence_status(presence.get("status").and_then(|value| value.as_str()).unwrap_or("offline")),
                custom,
                activity,
            ),
        );
    }
    by_id
}

pub fn friend_from_relationship(
    value: &serde_json::Value,
    presences: &std::collections::HashMap<String, (String, String, String)>,
) -> Option<ClientMember> {
    if value.get("type").and_then(|kind| kind.as_i64()) != Some(1) {
        return None;
    }
    let user = value.get("user")?;
    let id = user
        .get("id")
        .and_then(|item| item.as_str())
        .or_else(|| value.get("id").and_then(|item| item.as_str()))
        .unwrap_or("");
    if id.is_empty() {
        return None;
    }
    let username = user.get("username").and_then(|item| item.as_str()).unwrap_or("");
    let global = user
        .get("global_name")
        .and_then(|item| item.as_str())
        .filter(|name| !name.is_empty());
    let nickname = value
        .get("nickname")
        .and_then(|item| item.as_str())
        .filter(|name| !name.is_empty());
    let name = nickname
        .or(global)
        .unwrap_or(if username.is_empty() { "Unknown" } else { username })
        .to_string();
    let avatar = user
        .get("avatar")
        .and_then(|item| item.as_str())
        .map(|hash| hash.to_string());
    let (status, custom, activity) = presences
        .get(id)
        .cloned()
        .unwrap_or_else(|| ("offline".into(), String::new(), String::new()));
    Some(ClientMember {
        id: id.to_string(),
        name,
        nick: None,
        bot: user.get("bot").and_then(|item| item.as_bool()).unwrap_or(false),
        role_ids: Vec::new(),
        status,
        avatar_url: avatar_url(id, &avatar),
        custom,
        activity,
    })
}

pub fn friends_from_relationships(
    relationships: &serde_json::Value,
    presences: Option<&serde_json::Value>,
) -> Vec<ClientMember> {
    let lookup = presence_lookup(presences);
    let Some(list) = relationships.as_array() else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|value| friend_from_relationship(value, &lookup))
        .collect()
}

pub fn profile_from_value(value: &serde_json::Value) -> Option<ClientProfile> {
    let user = value.get("user")?;
    let id = user.get("id").and_then(|item| item.as_str()).unwrap_or("");
    if !snowflake_ok(id) {
        return None;
    }
    let username = user.get("username").and_then(|item| item.as_str()).unwrap_or("").to_string();
    let global = user
        .get("global_name")
        .and_then(|item| item.as_str())
        .filter(|name| !name.is_empty());
    let name = global.unwrap_or(if username.is_empty() { "Unknown" } else { username.as_str() }).to_string();
    let avatar = user
        .get("avatar")
        .and_then(|item| item.as_str())
        .map(|hash| hash.to_string());
    let profile = value.get("user_profile");
    let banner = profile
        .and_then(|item| item.get("banner"))
        .and_then(|item| item.as_str())
        .or_else(|| user.get("banner").and_then(|item| item.as_str()))
        .map(|hash| hash.to_string());
    let bio = profile
        .and_then(|item| item.get("bio"))
        .and_then(|item| item.as_str())
        .or_else(|| user.get("bio").and_then(|item| item.as_str()))
        .unwrap_or("")
        .to_string();
    let pronouns = profile
        .and_then(|item| item.get("pronouns"))
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    let accent_raw = profile
        .and_then(|item| item.get("accent_color"))
        .and_then(|item| item.as_u64())
        .or_else(|| user.get("accent_color").and_then(|item| item.as_u64()));
    let guild_member = value.get("guild_member");
    let nick = guild_member
        .and_then(|item| item.get("nick"))
        .and_then(|item| item.as_str())
        .filter(|nick| !nick.is_empty())
        .map(|nick| nick.to_string());
    let role_ids = guild_member
        .and_then(|item| item.get("roles"))
        .and_then(|item| item.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|item| item.as_str().map(|id| id.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let joined_at = guild_member
        .and_then(|item| item.get("joined_at"))
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    let mutual_guilds = value
        .get("mutual_guilds")
        .and_then(|item| item.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let id = item.get("id").and_then(|value| value.as_str()).unwrap_or("");
                    if !snowflake_ok(id) {
                        return None;
                    }
                    Some(ClientMutualGuild {
                        id: id.to_string(),
                        nick: item
                            .get("nick")
                            .and_then(|value| value.as_str())
                            .filter(|nick| !nick.is_empty())
                            .map(|nick| nick.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let mutual_friends = value
        .get("mutual_friends_count")
        .and_then(|item| item.as_u64())
        .or_else(|| {
            value
                .get("mutual_friends")
                .and_then(|item| item.as_array())
                .map(|list| list.len() as u64)
        })
        .unwrap_or(0) as u32;
    Some(ClientProfile {
        id: id.to_string(),
        name,
        username,
        avatar_url: avatar_url(id, &avatar),
        banner_url: banner_url(id, &banner),
        accent: accent_raw.and_then(|color| color_hex(color as u32)),
        bio,
        pronouns,
        nick,
        role_ids,
        mutual_guilds,
        mutual_friends,
        bot: user.get("bot").and_then(|item| item.as_bool()).unwrap_or(false),
        joined_at,
    })
}

/// One GUILD_MEMBERS_CHUNK. Later chunks are merged by the shell.
pub fn roster_from_chunk(data: &serde_json::Value) -> Vec<ClientMember> {
    let members = data
        .get("members")
        .cloned()
        .and_then(|value| serde_json::from_value::<Vec<DiscordMember>>(value).ok())
        .unwrap_or_default();
    let presences = data
        .get("presences")
        .cloned()
        .and_then(|value| serde_json::from_value::<Vec<DiscordPresence>>(value).ok())
        .unwrap_or_default();
    apply_presences(&members, &presences)
}

pub fn validate_outgoing(content: &str, file_count: usize, file_bytes: u64) -> Result<(), &'static str> {
    if content.chars().count() > 2_000 {
        return Err("Messages are limited to 2,000 characters.");
    }
    if content.trim().is_empty() && file_count == 0 {
        return Err("Write a message or attach a file.");
    }
    if file_count > 4 {
        return Err("Lark sends up to 4 files at a time.");
    }
    if file_bytes > 8 * 1024 * 1024 {
        return Err("Attachments are limited to 8 MB in this version.");
    }
    Ok(())
}

pub fn safe_file_name(name: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("file");
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_control() { '_' } else { c })
        .take(120)
        .collect();
    if cleaned.is_empty() {
        "file".into()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snowflakes_and_asset_urls_stay_on_discord() {
        assert!(snowflake_ok("100000000000000001"));
        assert!(!snowflake_ok("abc"));
        assert!(!snowflake_ok("../etc"));
        let url = avatar_url("100000000000000001", &Some("a_deadbeef".into())).unwrap();
        assert!(url.starts_with("https://cdn.discordapp.com/avatars/"));
        assert!(url.contains(".gif"));
        assert!(avatar_url("100000000000000001", &Some("../x".into())).is_none());
        assert!(guild_icon_url("nope", &Some("abc".into())).is_none());
    }

    #[test]
    fn message_mapping_covers_reply_join_and_embed_color() {
        let raw = r#"{
            "id": "55",
            "channel_id": "42",
            "type": 19,
            "content": "hello <@100000000000000001>",
            "timestamp": "2026-10-06T12:00:00.000Z",
            "edited_timestamp": "2026-10-06T12:05:00.000Z",
            "mention_everyone": false,
            "author": {"id": "7", "username": "maya", "global_name": "Maya Chen", "bot": false},
            "mentions": [{"id": "100000000000000001", "username": "ethan"}],
            "attachments": [{"id": "9", "filename": "frame.png", "url": "https://cdn.discordapp.com/attachments/a.png", "content_type": "image/png", "size": 1200, "width": 800, "height": 480}],
            "embeds": [{"title": "Wordmark", "description": "Apricot on ink", "color": 14852442, "fields": [{"name": "Status", "value": "Ready", "inline": true}]}],
            "reactions": [{"count": 2, "me": true, "emoji": {"name": "🔥", "id": null}}],
            "referenced_message": {"id": "50", "content": "Earlier note", "author": {"id": "8", "username": "jonah", "global_name": "Jonah Adler"}}
        }"#;
        let parsed: DiscordMessage = serde_json::from_str(raw).unwrap();
        let client = message_to_client(&parsed);
        assert_eq!(client.kind, "reply");
        assert!(client.edited);
        assert_eq!(client.author_name, "Maya Chen");
        assert_eq!(client.mention_ids, vec!["100000000000000001"]);
        assert_eq!(client.attachments[0].content_type, "image/png");
        assert_eq!(client.embeds[0].color.as_deref(), Some("#e2a15a"));
        assert_eq!(client.reply.as_ref().unwrap().author_name, "Jonah Adler");
        assert_eq!(client.reactions[0].emoji, "🔥");
        assert_eq!(kind_name(7), "join");
        assert_eq!(channel_kind_name(2), "voice");
        assert_eq!(channel_kind_name(4), "category");
    }

    #[test]
    fn outgoing_limits_and_file_names() {
        assert!(validate_outgoing("hi", 0, 0).is_ok());
        assert!(validate_outgoing("   ", 0, 0).is_err());
        assert!(validate_outgoing(&"a".repeat(2001), 0, 0).is_err());
        assert!(validate_outgoing("hi", 5, 10).is_err());
        assert!(validate_outgoing("hi", 1, 9 * 1024 * 1024).is_err());
        assert_eq!(safe_file_name("C:\\Users\\Ethan\\shot.png"), "shot.png");
        assert_eq!(safe_file_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_file_name(""), "file");
    }

    #[test]
    fn initials_handle_one_and_two_words() {
        assert_eq!(initials("Northwind"), "N");
        assert_eq!(initials("night market"), "NM");
    }

    #[test]
    fn guild_roster_uses_nick_avatar_and_presence() {
        let raw = r#"{
            "id": "100000000000000010",
            "name": "Battlefield",
            "icon": "a1b2c3",
            "members": [{
                "nick": "Erod",
                "roles": ["100000000000000099"],
                "user": {
                    "id": "100000000000000001",
                    "username": "erod",
                    "global_name": "Ethan",
                    "avatar": "deadbeef",
                    "bot": false
                }
            }],
            "presences": [{
                "user": {"id": "100000000000000001"},
                "status": "online",
                "activities": [{"name": "Custom Status", "type": 4, "state": "In queue"}]
            }]
        }"#;
        let guild: DiscordGuild = serde_json::from_str(raw).unwrap();
        let client = guild_to_client(&guild);
        assert_eq!(
            client.icon_url.as_deref(),
            Some("https://cdn.discordapp.com/icons/100000000000000010/a1b2c3.png?size=64")
        );
        let roster = roster_from_guild(&guild);
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].nick.as_deref(), Some("Erod"));
        assert_eq!(roster[0].name, "Ethan");
        assert_eq!(roster[0].status, "online");
        assert_eq!(roster[0].custom, "In queue");
        assert!(roster[0].activity.is_empty());
        assert!(roster[0]
            .avatar_url
            .as_deref()
            .unwrap()
            .starts_with("https://cdn.discordapp.com/avatars/100000000000000001/deadbeef.png"));

        let chunk = serde_json::json!({
            "guild_id": "100000000000000010",
            "members": [{
                "user": {"id": "100000000000000002", "username": "maya", "global_name": "Maya Chen"}
            }],
            "presences": [{
                "user": {"id": "100000000000000002"},
                "status": "idle",
                "activities": [{"type": 0, "name": "Battlefield"}]
            }]
        });
        let extra = roster_from_chunk(&chunk);
        assert_eq!(extra[0].name, "Maya Chen");
        assert_eq!(extra[0].status, "idle");
        assert!(extra[0].custom.is_empty());
        assert_eq!(extra[0].activity, "Playing Battlefield");
        assert_eq!(normalize_presence_status("invisible"), "offline");

        let (custom, activity) = activity_parts(&[serde_json::json!({
            "type": 4,
            "state": "In queue",
            "emoji": {"name": "🔥"}
        }), serde_json::json!({
            "type": 2,
            "name": "Spotify",
            "details": "Northwind",
            "state": "Maya Chen"
        })]);
        assert_eq!(custom, "🔥 In queue");
        assert_eq!(activity, "Listening to Northwind — Maya Chen");
    }

    #[test]
    fn profile_and_friends_keep_banner_roles_and_presence() {
        let profile = profile_from_value(&serde_json::json!({
            "user": {
                "id": "100000000000000002",
                "username": "maya",
                "global_name": "Maya Chen",
                "avatar": "a_face",
                "banner": "a_banner"
            },
            "user_profile": {"bio": "At the desk", "pronouns": "she/her", "accent_color": 14852442},
            "guild_member": {
                "nick": "Maya",
                "roles": ["100000000000000099"],
                "joined_at": "2024-01-02T00:00:00.000Z"
            },
            "mutual_guilds": [{"id": "100000000000000010", "nick": "Maya"}],
            "mutual_friends_count": 2
        })).unwrap();
        assert_eq!(profile.name, "Maya Chen");
        assert_eq!(profile.username, "maya");
        assert_eq!(profile.nick.as_deref(), Some("Maya"));
        assert_eq!(profile.bio, "At the desk");
        assert_eq!(profile.pronouns, "she/her");
        assert_eq!(profile.accent.as_deref(), Some("#e2a15a"));
        assert!(profile.banner_url.as_deref().unwrap().contains(".gif"));
        assert!(profile.avatar_url.as_deref().unwrap().contains(".gif"));
        assert_eq!(profile.role_ids, vec!["100000000000000099"]);
        assert_eq!(profile.mutual_friends, 2);
        assert_eq!(profile.mutual_guilds[0].id, "100000000000000010");

        let friends = friends_from_relationships(
            &serde_json::json!([
                {"id": "100000000000000002", "type": 1, "user": {"id": "100000000000000002", "username": "maya", "global_name": "Maya Chen", "avatar": "abc"}},
                {"id": "100000000000000003", "type": 2, "user": {"id": "100000000000000003", "username": "blocked"}}
            ]),
            Some(&serde_json::json!([
                {"user": {"id": "100000000000000002"}, "status": "dnd", "activities": [{"type": 0, "name": "Figma"}]}
            ])),
        );
        assert_eq!(friends.len(), 1);
        assert_eq!(friends[0].name, "Maya Chen");
        assert_eq!(friends[0].status, "dnd");
        assert_eq!(friends[0].activity, "Playing Figma");
    }
}
