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
    /// Present on mention users. Guild nickname wins over the global name.
    #[serde(default)]
    pub member: Option<DiscordNick>,
    /// 0 none, 1 Nitro Classic, 2 Nitro, 3 Nitro Basic. Missing on most user objects.
    #[serde(default)]
    pub premium_type: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordNick {
    #[serde(default)]
    pub nick: Option<String>,
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
    pub owner: bool,
    #[serde(default)]
    pub owner_id: Option<String>,
    /// The current user's base permissions, excluding channel overwrites.
    #[serde(default, deserialize_with = "de_bitfield")]
    pub permissions: String,
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
    pub permission_overwrites: Vec<DiscordOverwrite>,
    #[serde(default)]
    pub last_message_id: Option<String>,
    #[serde(default)]
    pub nsfw: bool,
    #[serde(default)]
    pub rate_limit_per_user: u32,
    #[serde(default)]
    pub bitrate: u32,
    #[serde(default)]
    pub user_limit: u32,
    #[serde(default)]
    pub video_quality_mode: u32,
    #[serde(default)]
    pub rtc_region: Option<String>,
    #[serde(default)]
    pub default_auto_archive_duration: u32,
    #[serde(default)]
    pub flags: u32,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordOverwrite {
    pub id: String,
    #[serde(rename = "type", default)]
    pub kind: i32,
    #[serde(default, deserialize_with = "de_bitfield")]
    pub allow: String,
    #[serde(default, deserialize_with = "de_bitfield")]
    pub deny: String,
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
    pub mention_roles: Vec<String>,
    #[serde(default)]
    pub mention_everyone: bool,
    #[serde(default)]
    pub referenced_message: Option<Box<DiscordMessage>>,
    #[serde(default)]
    pub message_reference: Option<DiscordReference>,
    #[serde(default)]
    pub sticker_items: Vec<DiscordSticker>,
    #[serde(default)]
    pub member: Option<DiscordMember>,
    #[serde(default)]
    pub thread: Option<DiscordThreadPreview>,
    #[serde(rename = "type", default)]
    pub kind: i32,
    #[serde(default, deserialize_with = "de_optional_nonce")]
    pub nonce: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub call: Option<DiscordCall>,
    #[serde(default)]
    pub message_snapshots: Vec<DiscordSnapshot>,
    /// Discord poll object. Kept raw so the client mapper can read answer counts.
    #[serde(default)]
    pub poll: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordCall {
    #[serde(default)]
    pub ended_timestamp: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordSnapshotMessage {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub author: Option<DiscordUser>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordSnapshot {
    #[serde(default)]
    pub message: Option<DiscordSnapshotMessage>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordReference {
    #[serde(default)]
    pub message_id: Option<String>,
    /// 0 is a reply. 1 is a forward.
    #[serde(default, rename = "type")]
    pub kind: i32,
    #[serde(default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub guild_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordSticker {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub format_type: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordThreadPreview {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub message_count: u32,
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
    pub proxy_url: Option<String>,
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
    #[serde(default)]
    pub video: Option<DiscordEmbedMedia>,
    #[serde(default)]
    pub provider: Option<DiscordEmbedProvider>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DiscordEmbedProvider {
    #[serde(default)]
    pub name: Option<String>,
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
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
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
    #[serde(default, deserialize_with = "de_bitfield")]
    pub permissions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientUser {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub bot: bool,
    /// Discord Nitro tier used for the upload limit. 0 when the account has none.
    #[serde(default)]
    pub premium_type: i64,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_message_id: Option<String>,
    #[serde(default)]
    pub overwrites: Vec<ClientOverwrite>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub nsfw: bool,
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub rate_limit_per_user: u32,
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub bitrate: u32,
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub user_limit: u32,
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub video_quality_mode: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rtc_region: Option<String>,
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub default_auto_archive_duration: u32,
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub flags: u32,
    /// Discord's channel type integer. 13 is a stage channel.
    #[serde(default)]
    pub discord_type: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientOverwrite {
    pub id: String,
    pub kind: i32,
    pub allow: String,
    pub deny: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientAttachment {
    pub id: String,
    pub name: String,
    pub url: String,
    /// Media proxy URL, including the `ex` / `is` / `hm` expiry query when Discord sent one.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub proxy_url: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientEmoji {
    pub id: String,
    pub name: String,
    pub animated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientMention {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientSticker {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientThread {
    pub id: String,
    pub name: String,
    pub count: u32,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_avatar: Option<String>,
    pub content: String,
    pub timestamp: String,
    pub edited: bool,
    pub attachments: Vec<ClientAttachment>,
    pub embeds: Vec<ClientEmbed>,
    pub reactions: Vec<ClientReaction>,
    pub mention_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mention_users: Vec<ClientMention>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mention_role_ids: Vec<String>,
    pub mention_everyone: bool,
    #[serde(default)]
    pub mention_roles: Vec<String>,
    #[serde(default)]
    pub guild_id: Option<String>,
    pub reply: Option<ClientReply>,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stickers: Vec<ClientSticker>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread: Option<ClientThread>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub author_role_ids: Vec<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub message_type: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub call_ended: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forwarded: Option<ClientReply>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub poll: Option<ClientPoll>,
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
pub struct ClientVoiceState {
    pub guild_id: String,
    pub channel_id: String,
    pub user_id: String,
    pub session_id: String,
    pub self_mute: bool,
    pub self_deaf: bool,
    pub server_mute: bool,
    pub server_deaf: bool,
    /// Discord sets this while the member is sharing with Go Live.
    #[serde(default)]
    pub self_stream: bool,
    pub name: String,
    pub avatar_url: Option<String>,
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
pub struct ClientMutualPerson {
    pub id: String,
    pub name: String,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mutual_friends_list: Vec<ClientMutualPerson>,
    pub bot: bool,
    pub joined_at: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub badges: Vec<ClientBadge>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub widgets: Vec<ClientWidget>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_tag: Option<ClientServerTag>,
}

fn de_optional_nonce<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match value.unwrap_or(serde_json::Value::Null) {
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        serde_json::Value::Number(number) => Some(number.to_string()),
        _ => None,
    })
}

fn de_bitfield<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match value.unwrap_or(serde_json::Value::Null) {
        serde_json::Value::String(text) => text,
        serde_json::Value::Number(number) => number.to_string(),
        _ => String::new(),
    })
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
        2 => "voice",
        13 => "stage",
        4 => "category",
        15 => "forum",
        16 => "media",
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

pub fn guild_avatar_url(guild_id: &str, user_id: &str, avatar: &Option<String>) -> Option<String> {
    let hash = avatar.as_deref()?;
    if !snowflake_ok(guild_id) || !snowflake_ok(user_id) || !asset_hash_ok(hash) {
        return None;
    }
    let ext = if hash.starts_with("a_") { "gif" } else { "png" };
    Some(format!(
        "https://cdn.discordapp.com/guilds/{guild_id}/users/{user_id}/avatars/{hash}.{ext}?size=64"
    ))
}

/// Discord's default picture. Index is `(user_id >> 22) % 6`.
pub fn default_avatar_url(user_id: &str) -> Option<String> {
    if !snowflake_ok(user_id) {
        return None;
    }
    let id = user_id.parse::<u64>().ok()?;
    let index = (id >> 22) % 6;
    Some(format!(
        "https://cdn.discordapp.com/embed/avatars/{index}.png"
    ))
}

/// User avatar, then the guild member avatar, then the default for that id.
pub fn voice_avatar_url(
    guild_id: &str,
    user_id: &str,
    user_avatar: &Option<String>,
    member_avatar: &Option<String>,
) -> Option<String> {
    avatar_url(user_id, user_avatar)
        .or_else(|| guild_avatar_url(guild_id, user_id, member_avatar))
        .or_else(|| default_avatar_url(user_id))
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
        && hash.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
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
        premium_type: user.premium_type.unwrap_or(0),
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

fn is_zero_u32(value: &u32) -> bool {
    *value == 0
}

fn is_false(value: &bool) -> bool {
    !*value
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
            channel
                .name
                .clone()
                .unwrap_or_else(|| "Direct message".into())
        } else {
            names.join(", ")
        }
    } else {
        channel.name.clone().unwrap_or_else(|| "channel".into())
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
        last_message_id: channel
            .last_message_id
            .clone()
            .filter(|id| snowflake_ok(id)),
        overwrites: channel
            .permission_overwrites
            .iter()
            .filter(|overwrite| snowflake_ok(&overwrite.id))
            .map(|overwrite| ClientOverwrite {
                id: overwrite.id.clone(),
                kind: overwrite.kind,
                allow: overwrite.allow.clone(),
                deny: overwrite.deny.clone(),
            })
            .collect(),
        nsfw: channel.nsfw,
        rate_limit_per_user: channel.rate_limit_per_user,
        bitrate: channel.bitrate,
        user_limit: channel.user_limit,
        video_quality_mode: channel.video_quality_mode,
        rtc_region: channel
            .rtc_region
            .clone()
            .filter(|region| !region.is_empty()),
        default_auto_archive_duration: channel.default_auto_archive_duration,
        flags: channel.flags,
        discord_type: channel.kind,
    }
}

fn nick_or_name(nick: Option<&str>, fallback: String) -> String {
    nick.map(str::trim)
        .filter(|nick| !nick.is_empty())
        .map(|nick| nick.to_string())
        .unwrap_or(fallback)
}

fn mention_name(user: &DiscordUser) -> String {
    let nick = user
        .member
        .as_ref()
        .and_then(|member| member.nick.as_deref());
    let name = nick_or_name(nick, user.display_name());
    if name.is_empty() {
        "someone".into()
    } else {
        name
    }
}

fn message_author_name(message: &DiscordMessage) -> String {
    let nick = message
        .member
        .as_ref()
        .and_then(|member| member.nick.as_deref());
    let fallback = message
        .author
        .as_ref()
        .map(|user| user.display_name())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unknown".into());
    nick_or_name(nick, fallback)
}

fn collapse_preview(mut text: String) -> String {
    text = text.replace(['\n', '\r'], " ");
    let count = text.chars().count();
    let mut preview: String = text.chars().take(80).collect();
    if count > 80 {
        preview.push('…');
    }
    preview
}

fn reply_from(referenced: &DiscordMessage) -> ClientReply {
    let mut text = if referenced.content.is_empty() {
        if !referenced.attachments.is_empty() {
            "Attachment".into()
        } else if !referenced.sticker_items.is_empty() {
            "Sticker".into()
        } else {
            "Click to see message".into()
        }
    } else {
        referenced.content.clone()
    };
    for user in &referenced.mentions {
        let label = format!("@{}", mention_name(user));
        text = text.replace(&format!("<@{}>", user.id), &label);
        text = text.replace(&format!("<@!{}>", user.id), &label);
    }
    ClientReply {
        id: referenced.id.clone(),
        author_name: message_author_name(referenced),
        preview: collapse_preview(text),
    }
}

fn snapshot_reply(snapshot: &DiscordSnapshotMessage) -> ClientReply {
    let author_name = snapshot
        .author
        .as_ref()
        .map(|user| user.display_name())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Someone".into());
    let preview = if snapshot.content.is_empty() {
        "Forwarded message".into()
    } else {
        collapse_preview(snapshot.content.clone())
    };
    ClientReply {
        id: if snapshot.id.is_empty() {
            "forward".into()
        } else {
            snapshot.id.clone()
        },
        author_name,
        preview,
    }
}

fn sticker_url(id: &str, format: i32) -> Option<String> {
    if !snowflake_ok(id) {
        return None;
    }
    let ext = match format {
        4 => "gif",
        1 | 2 => "png",
        _ => return None,
    };
    Some(format!(
        "https://media.discordapp.net/stickers/{id}.{ext}?size=160"
    ))
}

pub fn message_to_client(message: &DiscordMessage) -> ClientMessage {
    let author = message.author.as_ref();
    let reference_kind = message
        .message_reference
        .as_ref()
        .map(|reference| reference.kind)
        .unwrap_or(0);
    let preview = if let Some(referenced) = message.referenced_message.as_ref() {
        Some(reply_from(referenced))
    } else if let Some(snapshot) = message
        .message_snapshots
        .iter()
        .find_map(|item| item.message.as_ref())
    {
        Some(snapshot_reply(snapshot))
    } else {
        message
            .message_reference
            .as_ref()
            .and_then(|reference| reference.message_id.clone())
            .map(|id| ClientReply {
                id,
                author_name: "Original message".into(),
                preview: "Message deleted".into(),
            })
    };
    let (reply, forwarded) = if reference_kind == 1 {
        (None, preview)
    } else {
        (preview, None)
    };
    ClientMessage {
        id: message.id.clone(),
        channel_id: message.channel_id.clone(),
        author_id: author.map(|u| u.id.clone()).unwrap_or_default(),
        author_name: message_author_name(message),
        author_bot: author.map(|u| u.bot).unwrap_or(false),
        author_avatar: author.and_then(|user| avatar_url(&user.id, &user.avatar)),
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
                proxy_url: att.proxy_url.clone().unwrap_or_default(),
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
                emoji: reaction
                    .emoji
                    .name
                    .clone()
                    .unwrap_or_else(|| "emoji".into()),
                emoji_id: reaction.emoji.id.clone(),
                animated: reaction.emoji.animated,
                count: reaction.count,
                me: reaction.me,
            })
            .collect(),
        mention_ids: message.mentions.iter().map(|u| u.id.clone()).collect(),
        mention_users: message
            .mentions
            .iter()
            .map(|user| ClientMention {
                id: user.id.clone(),
                name: mention_name(user),
            })
            .collect(),
        mention_role_ids: message.mention_roles.clone(),
        mention_everyone: message.mention_everyone,
        mention_roles: message
            .mention_roles
            .iter()
            .filter(|id| snowflake_ok(id))
            .cloned()
            .collect(),
        guild_id: message.guild_id.clone().filter(|id| snowflake_ok(id)),
        reply,
        kind: kind_name(message.kind).into(),
        author_role_ids: message
            .member
            .as_ref()
            .map(|member| member.roles.clone())
            .unwrap_or_default(),
        pinned: message.pinned,
        message_type: message.kind,
        call_ended: message
            .call
            .as_ref()
            .and_then(|call| call.ended_timestamp.clone())
            .filter(|stamp| !stamp.is_empty()),
        forwarded,
        stickers: message
            .sticker_items
            .iter()
            .map(|sticker| ClientSticker {
                url: sticker_url(&sticker.id, sticker.format_type),
                id: sticker.id.clone(),
                name: if sticker.name.is_empty() {
                    "Sticker".into()
                } else {
                    sticker.name.clone()
                },
            })
            .collect(),
        thread: message.thread.as_ref().map(|thread| ClientThread {
            id: thread.id.clone(),
            name: thread
                .name
                .clone()
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| "Thread".into()),
            count: thread.message_count,
        }),
        nonce: message.nonce.clone().filter(|nonce| !nonce.is_empty()),
        poll: message.poll.as_ref().and_then(|poll| {
            poll_from_message(&serde_json::json!({
                "id": message.id,
                "channel_id": message.channel_id,
                "poll": poll,
            }))
        }),
    }
}

fn embed_media(media: &DiscordEmbedMedia) -> Option<String> {
    media
        .proxy_url
        .as_deref()
        .filter(|url| !url.is_empty())
        .map(|url| url.to_string())
        .or_else(|| {
            if media.url.is_empty() {
                None
            } else {
                Some(media.url.clone())
            }
        })
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
        image: embed.image.as_ref().and_then(embed_media),
        thumbnail: embed.thumbnail.as_ref().and_then(embed_media),
        video: embed.video.as_ref().and_then(embed_media),
        provider: embed
            .provider
            .as_ref()
            .and_then(|provider| provider.name.clone())
            .filter(|name| !name.is_empty()),
        image_width: embed.image.as_ref().and_then(|media| media.width),
        image_height: embed.image.as_ref().and_then(|media| media.height),
        video_width: embed.video.as_ref().and_then(|media| media.width),
        video_height: embed.video.as_ref().and_then(|media| media.height),
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
        let kind = item
            .get("type")
            .and_then(|value| value.as_i64())
            .unwrap_or(-1);
        if kind == 4 {
            let emoji = item
                .pointer("/emoji/name")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let state = item
                .get("state")
                .and_then(|value| value.as_str())
                .unwrap_or("");
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
        let name = item
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if name.is_empty() {
            continue;
        }
        if kind == 2 {
            let song = item
                .get("details")
                .and_then(|value| value.as_str())
                .filter(|text| !text.is_empty());
            let artist = item
                .get("state")
                .and_then(|value| value.as_str())
                .unwrap_or("");
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
    let id = user
        .get("id")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if id.is_empty() {
        return None;
    }
    let username = user
        .get("username")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let global = user
        .get("global_name")
        .and_then(|value| value.as_str())
        .filter(|name| !name.is_empty());
    let name = global
        .unwrap_or(if username.is_empty() {
            "Unknown"
        } else {
            username
        })
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
        bot: user
            .get("bot")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        role_ids,
        status: normalize_presence_status(status),
        avatar_url: avatar_url(id, &avatar),
        custom,
        activity,
    })
}

fn presence_lookup(
    presences: Option<&serde_json::Value>,
) -> std::collections::HashMap<String, (String, String, String)> {
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
                normalize_presence_status(
                    presence
                        .get("status")
                        .and_then(|value| value.as_str())
                        .unwrap_or("offline"),
                ),
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
    let username = user
        .get("username")
        .and_then(|item| item.as_str())
        .unwrap_or("");
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
        .unwrap_or(if username.is_empty() {
            "Unknown"
        } else {
            username
        })
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
        bot: user
            .get("bot")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
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

/// Relationship type 2 is a block. Friends (type 1) are left to [`friends_from_relationships`].
pub fn blocked_user_ids(relationships: &serde_json::Value) -> Vec<String> {
    let Some(list) = relationships.as_array() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for value in list {
        if value.get("type").and_then(|kind| kind.as_i64()) != Some(2) {
            continue;
        }
        let id = value
            .get("user")
            .and_then(|user| user.get("id"))
            .and_then(|item| item.as_str())
            .or_else(|| value.get("id").and_then(|item| item.as_str()))
            .unwrap_or("");
        if snowflake_ok(id) && !out.iter().any(|seen| seen == id) {
            out.push(id.to_string());
        }
        if out.len() >= 500 {
            break;
        }
    }
    out
}

fn mutual_people(value: &serde_json::Value) -> Vec<ClientMutualPerson> {
    let Some(list) = value.get("mutual_friends").and_then(|item| item.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in list {
        let user = item.get("user").unwrap_or(item);
        let id = item
            .get("id")
            .and_then(|value| value.as_str())
            .or_else(|| user.get("id").and_then(|value| value.as_str()))
            .unwrap_or("");
        if !snowflake_ok(id) {
            continue;
        }
        let name = item
            .get("global_name")
            .and_then(|value| value.as_str())
            .filter(|name| !name.is_empty())
            .or_else(|| {
                user.get("global_name")
                    .and_then(|value| value.as_str())
                    .filter(|name| !name.is_empty())
            })
            .or_else(|| {
                user.get("username")
                    .and_then(|value| value.as_str())
                    .filter(|name| !name.is_empty())
            })
            .unwrap_or("Someone");
        out.push(ClientMutualPerson {
            id: id.to_string(),
            name: name.to_string(),
        });
        if out.len() >= 40 {
            break;
        }
    }
    out
}

pub fn profile_from_value(value: &serde_json::Value) -> Option<ClientProfile> {
    profile_from_guild(value, None)
}

pub fn profile_from_guild(
    value: &serde_json::Value,
    guild_id: Option<&str>,
) -> Option<ClientProfile> {
    let user = value.get("user")?;
    let id = user.get("id").and_then(|item| item.as_str()).unwrap_or("");
    if !snowflake_ok(id) {
        return None;
    }
    let username = user
        .get("username")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    let global = user
        .get("global_name")
        .and_then(|item| item.as_str())
        .filter(|name| !name.is_empty());
    let name = global
        .unwrap_or(if username.is_empty() {
            "Unknown"
        } else {
            username.as_str()
        })
        .to_string();
    let avatar = hash_field(user.get("avatar"));
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
    let member_avatar = hash_field(guild_member.and_then(|item| item.get("avatar")));
    let guild_for_avatar = guild_id.unwrap_or("").trim();
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
                    let id = item
                        .get("id")
                        .and_then(|value| value.as_str())
                        .unwrap_or("");
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
    let mutual_friends_list = mutual_people(value);
    Some(ClientProfile {
        id: id.to_string(),
        name,
        username,
        avatar_url: voice_avatar_url(guild_for_avatar, id, &avatar, &member_avatar),
        banner_url: banner_url(id, &banner),
        accent: accent_raw.and_then(|color| color_hex(color as u32)),
        bio,
        pronouns,
        nick,
        role_ids,
        mutual_guilds,
        mutual_friends,
        mutual_friends_list,
        bot: user
            .get("bot")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        joined_at,
        badges: profile_badges(value),
        widgets: profile_widgets(value),
        server_tag: profile_server_tag(value),
    })
}

/// Voice states on a GUILD_CREATE payload. `None` when Discord omitted the field.
pub fn parse_guild_voice_states(data: &serde_json::Value) -> Option<Vec<ClientVoiceState>> {
    let list = data.get("voice_states")?.as_array()?;
    let guild_id = data.get("id").and_then(|v| v.as_str()).unwrap_or("");
    Some(
        list.iter()
            .filter_map(|value| parse_voice_state(value, guild_id))
            .filter(|state| !state.channel_id.is_empty())
            .collect(),
    )
}

/// One VOICE_STATE_UPDATE. An empty channel id means the user left voice.
pub fn parse_voice_state(
    value: &serde_json::Value,
    fallback_guild: &str,
) -> Option<ClientVoiceState> {
    let member = value.get("member");
    let user = member.and_then(|item| item.get("user"));
    let user_id = first_str(&[value.get("user_id"), user.and_then(|item| item.get("id"))]);
    if user_id.is_empty() {
        return None;
    }
    let nick = member
        .and_then(|item| item.get("nick"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let global = user
        .and_then(|item| item.get("global_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let username = user
        .and_then(|item| item.get("username"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let name = if !nick.is_empty() {
        nick.to_string()
    } else if !global.is_empty() {
        global.to_string()
    } else if !username.is_empty() {
        username.to_string()
    } else {
        String::new()
    };
    let avatar = hash_field(user.and_then(|item| item.get("avatar")));
    let member_avatar = hash_field(member.and_then(|item| item.get("avatar")));
    let guild_id = first_str(&[value.get("guild_id")]);
    let guild_id = if guild_id.is_empty() {
        fallback_guild.to_string()
    } else {
        guild_id
    };
    Some(ClientVoiceState {
        avatar_url: voice_avatar_url(&guild_id, &user_id, &avatar, &member_avatar),
        guild_id,
        channel_id: json_text(value.get("channel_id")),
        user_id,
        session_id: value
            .get("session_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        self_mute: value
            .get("self_mute")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        self_deaf: value
            .get("self_deaf")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        server_mute: value.get("mute").and_then(|v| v.as_bool()).unwrap_or(false),
        server_deaf: value.get("deaf").and_then(|v| v.as_bool()).unwrap_or(false),
        self_stream: value
            .get("self_stream")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        name,
    })
}

fn hash_field(value: Option<&serde_json::Value>) -> Option<String> {
    value
        .and_then(|item| item.as_str())
        .filter(|hash| !hash.is_empty())
        .map(|hash| hash.to_string())
}

fn json_text(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(serde_json::Value::Number(number)) => number
            .as_u64()
            .map(|id| id.to_string())
            .or_else(|| number.as_i64().map(|id| id.to_string()))
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn first_str(values: &[Option<&serde_json::Value>]) -> String {
    values
        .iter()
        .find_map(|value| {
            let text = json_text(*value);
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        })
        .unwrap_or_default()
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

pub fn validate_outgoing(
    content: &str,
    file_count: usize,
    file_bytes: u64,
    limit_bytes: u64,
) -> Result<(), String> {
    if content.chars().count() > 2_000 {
        return Err("Messages are limited to 2,000 characters.".into());
    }
    if content.trim().is_empty() && file_count == 0 {
        return Err("Write a message or attach a file.".into());
    }
    if file_count > 4 {
        return Err("Lark sends up to 4 files at a time.".into());
    }
    if file_bytes > limit_bytes {
        let mb = (limit_bytes / (1024 * 1024)).max(1);
        return Err(format!(
            "Attachments are limited to {mb} MB on this account."
        ));
    }
    Ok(())
}

/// Like `validate_outgoing`, except a sticker or a forward may have an empty body.
pub fn validate_composed(
    content: &str,
    file_count: usize,
    file_bytes: u64,
    limit_bytes: u64,
    extras: usize,
) -> Result<(), String> {
    if extras == 0 {
        return validate_outgoing(content, file_count, file_bytes, limit_bytes);
    }
    if content.chars().count() > 2_000 {
        return Err("Messages are limited to 2,000 characters.".into());
    }
    if extras > 3 {
        return Err("Discord accepts up to 3 stickers.".into());
    }
    if file_count > 4 {
        return Err("Lark sends up to 4 files at a time.".into());
    }
    if file_bytes > limit_bytes {
        let mb = (limit_bytes / (1024 * 1024)).max(1);
        return Err(format!(
            "Attachments are limited to {mb} MB on this account."
        ));
    }
    Ok(())
}

pub fn safe_file_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("file");
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientBadge {
    pub id: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientWidget {
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientServerTag {
    pub tag: String,
    pub guild_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub badge_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RichActivity {
    pub name: String,
    /// Discord activity type. 0 playing, 1 streaming, 2 listening, 3 watching, 5 competing.
    #[serde(rename = "type")]
    pub kind: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub details: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<i64>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub large_image: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub large_text: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub small_image: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub small_text: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub party: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub buttons: Vec<String>,
    #[serde(default)]
    pub live: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub application_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientRelationship {
    pub id: String,
    pub kind: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub username: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub nickname: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub bot: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_tag: Option<ClientServerTag>,
}

pub fn relationship_kind_name(kind: i64) -> Option<&'static str> {
    match kind {
        1 => Some("friend"),
        2 => Some("blocked"),
        3 => Some("incoming"),
        4 => Some("outgoing"),
        _ => None,
    }
}

pub fn relationships_from_value(value: &serde_json::Value) -> Vec<ClientRelationship> {
    let Some(list) = value.as_array() else {
        return Vec::new();
    };
    list.iter().filter_map(relationship_from_value).collect()
}

pub fn relationship_from_value(value: &serde_json::Value) -> Option<ClientRelationship> {
    let kind = relationship_kind_name(
        value
            .get("type")
            .and_then(|item| item.as_i64())
            .unwrap_or(-1),
    )?;
    let user = value.get("user");
    let id = user
        .and_then(|item| item.get("id"))
        .and_then(|item| item.as_str())
        .or_else(|| value.get("id").and_then(|item| item.as_str()))
        .unwrap_or("");
    if !snowflake_ok(id) {
        return None;
    }
    let username = user
        .and_then(|item| item.get("username"))
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    let global = user
        .and_then(|item| item.get("global_name"))
        .and_then(|item| item.as_str())
        .filter(|name| !name.is_empty());
    let name = global
        .unwrap_or(if username.is_empty() {
            "Unknown"
        } else {
            username.as_str()
        })
        .to_string();
    let nickname = value
        .get("nickname")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .chars()
        .filter(|ch| *ch != '\0' && *ch != '\n')
        .take(32)
        .collect::<String>()
        .trim()
        .to_string();
    let avatar = user
        .and_then(|item| item.get("avatar"))
        .and_then(|item| item.as_str())
        .map(|hash| hash.to_string());
    Some(ClientRelationship {
        id: id.to_string(),
        kind: kind.to_string(),
        name,
        username,
        nickname,
        avatar_url: avatar_url(id, &avatar),
        bot: user
            .and_then(|item| item.get("bot"))
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        server_tag: user.and_then(profile_server_tag_user),
    })
}

/// First non-custom activity, with elapsed time and art Discord dropped from the one-line glance.
pub fn primary_rich_activity(activities: &[serde_json::Value]) -> Option<RichActivity> {
    activities.iter().find_map(|item| {
        let kind = item
            .get("type")
            .and_then(|value| value.as_i64())
            .unwrap_or(-1);
        if kind == 4 {
            return None;
        }
        rich_activity(item)
    })
}

pub fn rich_activity(item: &serde_json::Value) -> Option<RichActivity> {
    let kind = item
        .get("type")
        .and_then(|value| value.as_i64())
        .unwrap_or(-1);
    if kind == 4 {
        return None;
    }
    let name = item
        .get("name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim();
    if name.is_empty() {
        return None;
    }
    let application_id = item
        .get("application_id")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let timestamps = item.get("timestamps");
    let started_at = timestamps
        .and_then(|value| value.get("start"))
        .and_then(json_millis);
    let ends_at = timestamps
        .and_then(|value| value.get("end"))
        .and_then(json_millis);
    let assets = item.get("assets");
    let large_key = assets
        .and_then(|value| value.get("large_image"))
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let small_key = assets
        .and_then(|value| value.get("small_image"))
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let party = item
        .get("party")
        .and_then(|value| value.get("size"))
        .and_then(|value| value.as_array())
        .map(|size| {
            let current = size.first().and_then(|value| value.as_i64()).unwrap_or(0);
            let max = size.get(1).and_then(|value| value.as_i64()).unwrap_or(0);
            if current > 0 && max > 0 {
                format!("{current} of {max}")
            } else {
                String::new()
            }
        })
        .unwrap_or_default();
    let url = item
        .get("url")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    Some(RichActivity {
        name: name.chars().take(128).collect(),
        kind,
        details: text_field(item, "details"),
        state: text_field(item, "state"),
        started_at,
        ends_at,
        large_image: activity_asset_url(&application_id, large_key),
        large_text: assets
            .and_then(|value| value.get("large_text"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .chars()
            .take(128)
            .collect(),
        small_image: activity_asset_url(&application_id, small_key),
        small_text: assets
            .and_then(|value| value.get("small_text"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .chars()
            .take(128)
            .collect(),
        party,
        buttons: activity_buttons(item),
        live: kind == 1 || !url.is_empty(),
        application_id,
    })
}

pub fn format_elapsed(started_at_ms: i64, now_ms: i64) -> String {
    if started_at_ms <= 0 || now_ms < started_at_ms {
        return String::new();
    }
    let seconds = ((now_ms - started_at_ms) / 1000) as u64;
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let remain = seconds % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{remain:02} elapsed")
    } else {
        format!("{minutes}:{remain:02} elapsed")
    }
}

pub fn activity_asset_url(application_id: &str, image: &str) -> String {
    let image = image.trim();
    if image.is_empty() {
        return String::new();
    }
    if let Some(id) = image.strip_prefix("spotify:") {
        if asset_hash_ok(id) {
            return format!("https://i.scdn.co/image/{id}");
        }
        return String::new();
    }
    if snowflake_ok(application_id) && asset_hash_ok(image) {
        return format!("https://cdn.discordapp.com/app-assets/{application_id}/{image}.png");
    }
    String::new()
}

fn activity_buttons(item: &serde_json::Value) -> Vec<String> {
    item.get("buttons")
        .and_then(|value| value.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|value| {
                    let label = value
                        .as_str()
                        .or_else(|| value.get("label").and_then(|item| item.as_str()))
                        .unwrap_or("")
                        .trim();
                    if label.is_empty() {
                        None
                    } else {
                        Some(label.chars().take(40).collect())
                    }
                })
                .take(2)
                .collect()
        })
        .unwrap_or_default()
}

fn text_field(item: &serde_json::Value, key: &str) -> String {
    item.get(key)
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .chars()
        .take(128)
        .collect()
}

fn json_millis(value: &serde_json::Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_f64().map(|number| number as i64))
        .filter(|ms| *ms > 0)
}

const USER_FLAGS: &[(u64, &str, &str)] = &[
    (1 << 0, "staff", "Discord Staff"),
    (1 << 1, "partner", "Partnered Server Owner"),
    (1 << 2, "hypesquad", "HypeSquad Events"),
    (1 << 3, "bug_hunter", "Bug Hunter"),
    (1 << 6, "bravery", "HypeSquad Bravery"),
    (1 << 7, "brilliance", "HypeSquad Brilliance"),
    (1 << 8, "balance", "HypeSquad Balance"),
    (1 << 9, "early_supporter", "Early Supporter"),
    (1 << 14, "bug_hunter_2", "Bug Hunter Level 2"),
    (1 << 16, "verified_bot", "Verified Bot"),
    (
        1 << 17,
        "verified_developer",
        "Early Verified Bot Developer",
    ),
    (1 << 18, "moderator", "Moderator Programs Alumni"),
    (1 << 22, "active_developer", "Active Developer"),
];

pub fn profile_badges(value: &serde_json::Value) -> Vec<ClientBadge> {
    let mut badges = Vec::new();
    let mut seen = std::collections::HashSet::new();
    if let Some(list) = value.get("badges").and_then(|item| item.as_array()) {
        for item in list {
            let id = item
                .get("id")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            let description = item
                .get("description")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            if id.is_empty() && description.is_empty() {
                continue;
            }
            let key = if id.is_empty() {
                description.to_string()
            } else {
                id.to_string()
            };
            if !seen.insert(key.clone()) {
                continue;
            }
            let icon = item
                .get("icon")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            badges.push(ClientBadge {
                id: if id.is_empty() { key } else { id.to_string() },
                description: if description.is_empty() {
                    id.to_string()
                } else {
                    description.to_string()
                },
                icon_url: badge_icon_url(icon),
            });
        }
    }
    let flags = value
        .pointer("/user/public_flags")
        .and_then(|item| item.as_u64())
        .or_else(|| value.pointer("/user/flags").and_then(|item| item.as_u64()))
        .unwrap_or(0);
    for (bit, id, description) in USER_FLAGS {
        if flags & bit == 0 || seen.contains(*id) {
            continue;
        }
        badges.push(ClientBadge {
            id: (*id).to_string(),
            description: (*description).to_string(),
            icon_url: None,
        });
    }
    badges
}

fn badge_icon_url(icon: &str) -> Option<String> {
    if !asset_hash_ok(icon) {
        return None;
    }
    Some(format!("https://cdn.discordapp.com/badge-icons/{icon}.png"))
}

pub fn profile_widgets(value: &serde_json::Value) -> Vec<ClientWidget> {
    let mut widgets = Vec::new();
    let accounts = value
        .get("connected_accounts")
        .and_then(|item| item.as_array())
        .or_else(|| {
            value
                .pointer("/user_profile/connected_accounts")
                .and_then(|item| item.as_array())
        });
    if let Some(list) = accounts {
        for item in list {
            let kind = item
                .get("type")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            let name = item
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            if kind.is_empty() && name.is_empty() {
                continue;
            }
            widgets.push(ClientWidget {
                kind: kind.chars().take(32).collect(),
                name: name.chars().take(64).collect(),
                verified: item
                    .get("verified")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false),
            });
        }
    }
    widgets
}

pub fn profile_server_tag(value: &serde_json::Value) -> Option<ClientServerTag> {
    value.get("user").and_then(profile_server_tag_user)
}

fn profile_server_tag_user(user: &serde_json::Value) -> Option<ClientServerTag> {
    let clan = user
        .get("primary_guild")
        .filter(|item| !item.is_null())
        .or_else(|| user.get("clan").filter(|item| !item.is_null()))?;
    if clan.get("identity_enabled").and_then(|item| item.as_bool()) == Some(false) {
        return None;
    }
    let tag = clan
        .get("tag")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .trim();
    let tag: String = tag.chars().take(4).collect();
    if tag.is_empty() {
        return None;
    }
    let guild_id = clan
        .get("identity_guild_id")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    let badge = clan
        .get("badge")
        .and_then(|item| item.as_str())
        .unwrap_or("");
    let badge_url = if snowflake_ok(&guild_id) && asset_hash_ok(badge) {
        Some(format!(
            "https://cdn.discordapp.com/clan-badges/{guild_id}/{badge}.png"
        ))
    } else {
        None
    };
    Some(ClientServerTag {
        tag,
        guild_id,
        badge_url,
    })
}

pub fn friend_username_ok(name: &str) -> bool {
    let name = name.trim();
    let chars: Vec<char> = name.chars().collect();
    if chars.len() < 2 || chars.len() > 32 {
        return false;
    }
    if chars.first() == Some(&'.') || chars.last() == Some(&'.') || name.contains("..") {
        return false;
    }
    chars
        .iter()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || *ch == '_' || *ch == '.')
}

pub fn clamp_friend_nickname(nickname: &str) -> String {
    nickname
        .chars()
        .filter(|ch| *ch != '\0' && *ch != '\n')
        .take(32)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn clamp_group_name(name: &str) -> String {
    name.chars()
        .filter(|ch| *ch != '\0' && *ch != '\n' && *ch != '\r')
        .take(100)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn clamp_server_bio(bio: &str) -> String {
    bio.chars().filter(|ch| *ch != '\0').take(190).collect()
}

/// Gateway opcode 3. A non-empty game is a playing activity and stays off the custom status.
pub fn presence_payload(status: &str, custom: &str, game: &str) -> String {
    let custom: String = custom
        .chars()
        .filter(|ch| *ch != '\0' && *ch != '\n')
        .take(128)
        .collect();
    let mut activities = if custom.trim().is_empty() {
        Vec::<serde_json::Value>::new()
    } else {
        vec![serde_json::json!({
            "name": "Custom Status",
            "type": 4,
            "state": custom.trim()
        })]
    };
    push_game(&mut activities, game);
    presence_body(status, activities)
}

/// Gateway opcode 3 with a custom-status emoji and an optional clear-after timestamp.
pub fn custom_status_payload(
    status: &str,
    custom: &str,
    emoji: &str,
    emoji_id: Option<&str>,
    animated: bool,
    expires_at: Option<i64>,
    game: &str,
) -> String {
    let custom: String = custom
        .chars()
        .filter(|ch| *ch != '\0' && *ch != '\n')
        .take(128)
        .collect();
    let emoji: String = emoji
        .chars()
        .filter(|ch| !ch.is_control())
        .take(32)
        .collect::<String>()
        .trim()
        .to_string();
    let emoji_id = emoji_id
        .map(str::trim)
        .filter(|id| snowflake_ok(id))
        .map(|id| id.to_string());
    let activities = if custom.trim().is_empty() && emoji.is_empty() {
        Vec::<serde_json::Value>::new()
    } else {
        let mut activity = serde_json::json!({
            "name": "Custom Status",
            "type": 4,
            "state": custom.trim(),
        });
        if !emoji.is_empty() {
            activity["emoji"] = serde_json::json!({
                "name": emoji,
                "id": emoji_id,
                "animated": emoji_id.is_some() && animated,
            });
        }
        if let Some(end) = expires_at.filter(|ms| *ms > 0) {
            activity["timestamps"] = serde_json::json!({ "end": end });
        }
        vec![activity]
    };
    let mut activities = activities;
    push_game(&mut activities, game);
    presence_body(status, activities)
}

fn push_game(activities: &mut Vec<serde_json::Value>, game: &str) {
    let name: String = game
        .chars()
        .filter(|ch| *ch != '\0' && *ch != '\n')
        .take(128)
        .collect::<String>()
        .trim()
        .to_string();
    if name.is_empty() {
        return;
    }
    activities.push(serde_json::json!({ "name": name, "type": 0 }));
}

fn presence_body(status: &str, activities: Vec<serde_json::Value>) -> String {
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
    fn blocked_relationships_keep_type_two_only() {
        let list = serde_json::json!([
            {"id": "100000000000000002", "type": 1, "user": {"id": "100000000000000002"}},
            {"id": "100000000000000003", "type": 2, "user": {"id": "100000000000000003", "username": "blocked"}},
            {"type": 2, "user": {"id": "not-an-id"}},
            {"type": 2, "id": "100000000000000004"}
        ]);
        assert_eq!(
            blocked_user_ids(&list),
            vec![
                "100000000000000003".to_string(),
                "100000000000000004".to_string()
            ]
        );
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
        assert!(client.attachments[0].proxy_url.is_empty());
        assert_eq!(client.embeds[0].color.as_deref(), Some("#e2a15a"));
        assert_eq!(client.reply.as_ref().unwrap().author_name, "Jonah Adler");
        assert_eq!(client.reactions[0].emoji, "🔥");
        assert_eq!(client.mention_users[0].name, "ethan");
        assert_eq!(kind_name(7), "join");
        assert_eq!(channel_kind_name(2), "voice");
        assert_eq!(channel_kind_name(4), "category");
        assert_eq!(channel_kind_name(13), "stage");
        assert_eq!(channel_kind_name(16), "media");
    }

    #[test]
    fn channel_kinds_keep_voice_and_name_stage_and_media() {
        assert_eq!(channel_kind_name(0), "text");
        assert_eq!(channel_kind_name(2), "voice");
        assert_eq!(channel_kind_name(13), "stage");
        assert_eq!(channel_kind_name(15), "forum");
        assert_eq!(channel_kind_name(16), "media");
        assert_eq!(channel_kind_name(10), "thread");
        assert_eq!(channel_kind_name(99), "text");
        let stage: DiscordChannel =
            serde_json::from_str(r#"{"id":"13","type":13,"name":"live","position":1}"#).unwrap();
        let media: DiscordChannel =
            serde_json::from_str(r#"{"id":"16","type":16,"name":"gallery","position":2}"#).unwrap();
        assert_eq!(channel_to_client(&stage).kind, "stage");
        assert_eq!(channel_to_client(&media).kind, "media");
        assert_eq!(
            channel_to_client(
                &serde_json::from_str(r#"{"id":"2","type":2,"name":"booth","position":0}"#)
                    .unwrap()
            )
            .kind,
            "voice"
        );
        let detailed: DiscordChannel = serde_json::from_str(
            r#"{"id":"9","type":0,"name":"general","position":0,"nsfw":true,"rate_limit_per_user":10,"bitrate":64000,"user_limit":5,"video_quality_mode":2,"rtc_region":"us-east","default_auto_archive_duration":1440,"flags":2097152}"#,
        )
        .unwrap();
        let client = channel_to_client(&detailed);
        assert!(client.nsfw);
        assert_eq!(client.rate_limit_per_user, 10);
        assert_eq!(client.bitrate, 64000);
        assert_eq!(client.user_limit, 5);
        assert_eq!(client.video_quality_mode, 2);
        assert_eq!(client.rtc_region.as_deref(), Some("us-east"));
        assert_eq!(client.default_auto_archive_duration, 1440);
        assert_eq!(client.flags, 2_097_152);
    }

    #[test]
    fn message_mapping_keeps_nicks_stickers_and_previews() {
        let raw = r#"{
            "id": "77",
            "channel_id": "42",
            "type": 19,
            "content": "reply <@100000000000000002>",
            "author": {"id": "100000000000000007", "username": "maya", "global_name": "Maya Chen", "avatar": "deadbeef"},
            "member": {"nick": "Erod"},
            "mentions": [{
                "id": "100000000000000002",
                "username": "ethan",
                "global_name": "Ethan",
                "member": {"nick": "Booth"}
            }],
            "mention_roles": ["100000000000000099"],
            "sticker_items": [{"id": "100000000000000088", "name": "wave", "format_type": 4}],
            "embeds": [{
                "title": "Clip",
                "provider": {"name": "Tenor"},
                "video": {"url": "https://media.tenor.com/clip.mp4", "proxy_url": "https://media.discordapp.net/external/clip.mp4", "width": 320, "height": 180},
                "image": {"url": "", "proxy_url": "https://media.discordapp.net/external/still.png", "width": 320, "height": 180}
            }],
            "message_reference": {"message_id": "70"}
        }"#;
        let parsed: DiscordMessage = serde_json::from_str(raw).unwrap();
        let client = message_to_client(&parsed);
        assert_eq!(client.author_name, "Erod");
        assert!(client.author_avatar.unwrap().contains("deadbeef"));
        assert_eq!(client.mention_users[0].name, "Booth");
        assert_eq!(client.mention_role_ids, vec!["100000000000000099"]);
        assert!(client.stickers[0]
            .url
            .as_deref()
            .unwrap()
            .ends_with(".gif?size=160"));
        assert_eq!(client.embeds[0].provider.as_deref(), Some("Tenor"));
        assert!(client.embeds[0]
            .video
            .as_deref()
            .unwrap()
            .contains("media.discordapp.net"));
        assert_eq!(client.embeds[0].video_width, Some(320));
        assert_eq!(client.embeds[0].video_height, Some(180));
        assert_eq!(client.embeds[0].image_width, Some(320));
        assert_eq!(client.embeds[0].image_height, Some(180));
        assert_eq!(
            client.reply.as_ref().unwrap().author_name,
            "Original message"
        );

        let deleted = r#"{"id":"71","channel_id":"42","type":19,"message_reference":{"message_id":"1"},"referenced_message":null}"#;
        let gone = message_to_client(&serde_json::from_str(deleted).unwrap());
        assert_eq!(gone.reply.as_ref().unwrap().preview, "Message deleted");
    }

    #[test]
    fn attachment_keeps_cdn_url_proxy_url_and_expiry() {
        let raw = r#"{
            "id": "90",
            "channel_id": "42",
            "content": "",
            "author": {"id": "7", "username": "maya"},
            "attachments": [{
                "id": "9",
                "filename": "image.png",
                "url": "https://cdn.discordapp.com/attachments/42/9/image.png?ex=6610abcd&is=65feabcd&hm=deadbeef",
                "proxy_url": "https://media.discordapp.net/attachments/42/9/image.png?ex=6610abcd&is=65feabcd&hm=deadbeef",
                "content_type": "image/png",
                "size": 4096,
                "width": 640,
                "height": 480
            }]
        }"#;
        let client = message_to_client(&serde_json::from_str(raw).unwrap());
        let file = &client.attachments[0];
        assert_eq!(file.name, "image.png");
        assert!(file.url.contains("cdn.discordapp.com"));
        assert!(file.url.contains("ex=6610abcd"));
        assert!(file.url.contains("is=65feabcd"));
        assert!(file.url.contains("hm=deadbeef"));
        assert!(file.proxy_url.contains("media.discordapp.net"));
        assert!(file.proxy_url.contains("ex=6610abcd"));
        assert!(file.proxy_url.contains("hm=deadbeef"));
        assert_eq!(file.width, Some(640));
        assert_eq!(file.height, Some(480));
    }

    #[test]
    fn message_nonce_survives_as_text() {
        let text = r#"{"id":"9","channel_id":"1","nonce":"local-abc","content":"test"}"#;
        let client = message_to_client(&serde_json::from_str(text).unwrap());
        assert_eq!(client.nonce.as_deref(), Some("local-abc"));
        let number = r#"{"id":"9","channel_id":"1","nonce":42,"content":"test"}"#;
        let numbered = message_to_client(&serde_json::from_str(number).unwrap());
        assert_eq!(numbered.nonce.as_deref(), Some("42"));
        let missing = r#"{"id":"9","channel_id":"1","content":"test"}"#;
        assert!(message_to_client(&serde_json::from_str(missing).unwrap())
            .nonce
            .is_none());
    }

    #[test]
    fn outgoing_limits_and_file_names() {
        let limit = crate::clip_fit::DEFAULT_UPLOAD_LIMIT;
        assert!(validate_outgoing("hi", 0, 0, limit).is_ok());
        assert!(validate_outgoing("   ", 0, 0, limit).is_err());
        assert!(validate_outgoing(&"a".repeat(2001), 0, 0, limit).is_err());
        assert!(validate_outgoing("hi", 5, 10, limit).is_err());
        assert!(validate_outgoing("hi", 1, 9 * 1024 * 1024, limit).is_ok());
        assert!(validate_outgoing("hi", 1, 11 * 1024 * 1024, limit).is_err());
        assert!(validate_outgoing(
            "hi",
            1,
            40 * 1024 * 1024,
            crate::clip_fit::upload_limit_bytes(2)
        )
        .is_ok());
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
    fn voice_states_keep_nick_avatar_and_a_leave() {
        let guild = serde_json::json!({
            "id": "100000000000000010",
            "voice_states": [{
                "guild_id": "100000000000000010",
                "channel_id": "100000000000000026",
                "user_id": "100000000000000002",
                "session_id": "sess",
                "self_mute": true,
                "self_deaf": false,
                "mute": false,
                "deaf": true,
                "member": {
                    "nick": "Maya",
                    "user": {"id": "100000000000000002", "username": "maya", "global_name": "Maya Chen", "avatar": "a1b2c3d4"}
                }
            }]
        });
        let states = parse_guild_voice_states(&guild).unwrap();
        assert_eq!(states.len(), 1);
        assert_eq!(states[0].name, "Maya");
        assert_eq!(states[0].channel_id, "100000000000000026");
        assert!(states[0].self_mute);
        assert!(states[0].server_deaf);
        assert!(states[0]
            .avatar_url
            .as_deref()
            .unwrap()
            .contains("/avatars/100000000000000002/a1b2c3d4.png"));
        let guild_face = serde_json::json!({
            "guild_id": "100000000000000010",
            "channel_id": "100000000000000026",
            "user_id": "100000000000000003",
            "member": {
                "avatar": "a_guildface",
                "user": {"id": "100000000000000003", "username": "jonah", "avatar": null}
            }
        });
        let guild_avatar = parse_voice_state(&guild_face, "100000000000000010").unwrap();
        assert!(guild_avatar.avatar_url.as_deref().unwrap().contains(
            "/guilds/100000000000000010/users/100000000000000003/avatars/a_guildface.gif"
        ));
        let bare = serde_json::json!({
            "guild_id": "100000000000000010",
            "channel_id": "100000000000000026",
            "user_id": "100000000000000004"
        });
        let fallback = parse_voice_state(&bare, "100000000000000010").unwrap();
        let index = (100000000000000004u64 >> 22) % 6;
        assert!(fallback
            .avatar_url
            .as_deref()
            .unwrap()
            .contains(&format!("/embed/avatars/{index}.png")));
        let user_wins = serde_json::json!({
            "guild_id": "100000000000000010",
            "channel_id": "100000000000000026",
            "user_id": "100000000000000003",
            "member": {
                "avatar": "guildonly",
                "user": {"id": "100000000000000003", "username": "jonah", "avatar": "userface"}
            }
        });
        let preferred = parse_voice_state(&user_wins, "").unwrap();
        assert!(preferred
            .avatar_url
            .as_deref()
            .unwrap()
            .contains("/avatars/100000000000000003/userface.png"));
        let left = serde_json::json!({
            "guild_id": "100000000000000010",
            "channel_id": null,
            "user_id": "100000000000000002",
            "session_id": "sess"
        });
        let update = parse_voice_state(&left, "100000000000000010").unwrap();
        assert!(update.channel_id.is_empty());
        assert!(parse_guild_voice_states(&serde_json::json!({"id": "1"})).is_none());
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

        let (custom, activity) = activity_parts(&[
            serde_json::json!({
                "type": 4,
                "state": "In queue",
                "emoji": {"name": "🔥"}
            }),
            serde_json::json!({
                "type": 2,
                "name": "Spotify",
                "details": "Northwind",
                "state": "Maya Chen"
            }),
        ]);
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
        }))
        .unwrap();
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
        assert!(profile.mutual_friends_list.is_empty());
        assert_eq!(profile.mutual_guilds[0].id, "100000000000000010");
        let with_friends = profile_from_value(&serde_json::json!({
            "user": {"id": "100000000000000002", "username": "maya"},
            "mutual_friends": [
                {"id": "100000000000000003", "username": "jonah", "global_name": "Jonah"},
                {"id": "nope", "username": "skip"}
            ],
            "mutual_friends_count": 1
        }))
        .unwrap();
        assert_eq!(with_friends.mutual_friends, 1);
        assert_eq!(with_friends.mutual_friends_list.len(), 1);
        assert_eq!(with_friends.mutual_friends_list[0].name, "Jonah");

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

    #[test]
    fn relationships_keep_pending_blocked_and_friend_nicknames() {
        let rows = relationships_from_value(&serde_json::json!([
            {"type": 1, "nickname": "Desk", "user": {"id": "100000000000000002", "username": "maya", "global_name": "Maya", "primary_guild": {"identity_enabled": true, "tag": "LARK", "identity_guild_id": "100000000000000010", "badge": "abc123"}}},
            {"type": 3, "user": {"id": "100000000000000004", "username": "incoming"}},
            {"type": 4, "user": {"id": "100000000000000005", "username": "outgoing"}},
            {"type": 2, "user": {"id": "100000000000000003", "username": "blocked"}},
            {"type": 0, "user": {"id": "100000000000000006", "username": "none"}}
        ]));
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].kind, "friend");
        assert_eq!(rows[0].nickname, "Desk");
        assert_eq!(rows[0].server_tag.as_ref().unwrap().tag, "LARK");
        assert!(rows[0]
            .server_tag
            .as_ref()
            .unwrap()
            .badge_url
            .as_deref()
            .unwrap()
            .contains("clan-badges"));
        assert_eq!(rows[1].kind, "incoming");
        assert_eq!(rows[2].kind, "outgoing");
        assert_eq!(rows[3].kind, "blocked");
        assert!(!friend_username_ok("Maya"));
        assert!(friend_username_ok("maya"));
        assert!(!friend_username_ok(".maya"));
        assert_eq!(clamp_friend_nickname("  hi\n"), "hi");
    }

    #[test]
    fn rich_presence_keeps_elapsed_time_art_and_party() {
        let activity = primary_rich_activity(&[
            serde_json::json!({"type": 4, "state": "Away", "name": "Custom Status"}),
            serde_json::json!({
                "type": 0,
                "name": "Lark",
                "details": "Northwind",
                "state": "In a match",
                "application_id": "100000000000000077",
                "timestamps": {"start": 1_000},
                "party": {"size": [2, 5]},
                "assets": {"large_image": "abcdef", "large_text": "Map"},
                "buttons": ["Join"]
            }),
        ])
        .unwrap();
        assert_eq!(activity.name, "Lark");
        assert_eq!(activity.kind, 0);
        assert_eq!(activity.details, "Northwind");
        assert_eq!(activity.party, "2 of 5");
        assert_eq!(activity.started_at, Some(1_000));
        assert!(activity
            .large_image
            .contains("app-assets/100000000000000077/abcdef.png"));
        assert_eq!(activity.buttons, vec!["Join".to_string()]);
        assert!(!activity.live);
        assert_eq!(format_elapsed(1_000, 63_000), "1:02 elapsed");
        assert_eq!(format_elapsed(0, 5_000), "");
        let listening = rich_activity(&serde_json::json!({
            "type": 2,
            "name": "Spotify",
            "details": "Noon",
            "assets": {"large_image": "spotify:abc123"}
        }))
        .unwrap();
        assert!(listening
            .large_image
            .starts_with("https://i.scdn.co/image/abc123"));
        let stream = rich_activity(
            &serde_json::json!({"type": 1, "name": "Twitch", "url": "https://twitch.tv/maya"}),
        )
        .unwrap();
        assert!(stream.live);
    }

    #[test]
    fn profile_badges_tags_and_custom_status_follow_discord() {
        let profile = profile_from_value(&serde_json::json!({
            "user": {
                "id": "100000000000000002",
                "username": "maya",
                "public_flags": 1 << 22,
                "primary_guild": {"identity_enabled": false, "tag": "HIDE", "identity_guild_id": "100000000000000010"}
            },
            "badges": [{"id": "active_developer", "description": "Active Developer", "icon": "abc123"}],
            "connected_accounts": [{"type": "spotify", "name": "Maya", "verified": true}]
        })).unwrap();
        assert_eq!(profile.badges.len(), 1);
        assert_eq!(profile.badges[0].description, "Active Developer");
        assert!(profile.badges[0]
            .icon_url
            .as_deref()
            .unwrap()
            .contains("badge-icons/abc123.png"));
        assert!(profile.server_tag.is_none());
        assert_eq!(profile.widgets[0].kind, "spotify");
        assert!(profile.widgets[0].verified);
        let payload: serde_json::Value = serde_json::from_str(&custom_status_payload(
            "online",
            "At the desk",
            "😀",
            None,
            false,
            Some(1_700_000_000_000),
            "",
        ))
        .unwrap();
        assert_eq!(payload["op"], 3);
        assert_eq!(payload["d"]["status"], "online");
        assert_eq!(payload["d"]["activities"][0]["type"], 4);
        assert_eq!(payload["d"]["activities"][0]["state"], "At the desk");
        assert_eq!(payload["d"]["activities"][0]["emoji"]["name"], "😀");
        assert_eq!(
            payload["d"]["activities"][0]["timestamps"]["end"],
            1_700_000_000_000_i64
        );
        let cleared: serde_json::Value = serde_json::from_str(&custom_status_payload(
            "idle", "", "", None, false, None, "",
        ))
        .unwrap();
        let custom_emoji: serde_json::Value = serde_json::from_str(&custom_status_payload(
            "online",
            "",
            "lark",
            Some("100000000000000099"),
            true,
            None,
            "",
        ))
        .unwrap();
        assert_eq!(
            custom_emoji["d"]["activities"][0]["emoji"]["id"],
            "100000000000000099"
        );
        assert_eq!(
            custom_emoji["d"]["activities"][0]["emoji"]["animated"],
            true
        );
        let refused: serde_json::Value = serde_json::from_str(&custom_status_payload(
            "online",
            "",
            "lark",
            Some("nope"),
            true,
            None,
            "",
        ))
        .unwrap();
        assert!(refused["d"]["activities"][0]["emoji"]["id"].is_null());
        assert_eq!(refused["d"]["activities"][0]["emoji"]["animated"], false);
        assert!(cleared["d"]["activities"].as_array().unwrap().is_empty());
        let playing: serde_json::Value =
            serde_json::from_str(&presence_payload("online", "At the desk", "Hades II")).unwrap();
        assert_eq!(playing["d"]["activities"][0]["type"], 4);
        assert_eq!(playing["d"]["activities"][1]["type"], 0);
        assert_eq!(playing["d"]["activities"][1]["name"], "Hades II");
        let hidden: serde_json::Value =
            serde_json::from_str(&presence_payload("online", "At the desk", "")).unwrap();
        assert_eq!(hidden["d"]["activities"].as_array().unwrap().len(), 1);
        let only_game: serde_json::Value =
            serde_json::from_str(&presence_payload("dnd", "", "Hades II")).unwrap();
        assert_eq!(only_game["d"]["activities"].as_array().unwrap().len(), 1);
        assert_eq!(only_game["d"]["activities"][0]["type"], 0);
    }
}

// Stream F. Thread, poll, and scheduled-event payloads. Append-only: existing
// channel kinds stay in `channel_kind_name`.

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientForumTag {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub moderated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientThreadRecord {
    pub id: String,
    pub name: String,
    pub raw_kind: i32,
    pub parent_id: Option<String>,
    pub guild_id: Option<String>,
    pub owner_id: Option<String>,
    pub archived: bool,
    pub locked: bool,
    pub invitable: bool,
    pub auto_archive_duration: i32,
    pub message_count: u32,
    pub member_count: u32,
    pub last_message_id: Option<String>,
    pub applied_tags: Vec<String>,
    pub flags: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starter_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starter_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientForumParent {
    pub id: String,
    pub raw_kind: i32,
    pub topic: String,
    pub flags: i32,
    pub available_tags: Vec<ClientForumTag>,
    pub default_sort_order: Option<i32>,
    pub default_forum_layout: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientThreadIndex {
    pub parent: ClientForumParent,
    pub threads: Vec<ClientThreadRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientThreadMember {
    pub id: String,
    pub user_id: String,
    pub join_timestamp: String,
    pub flags: i32,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientPollAnswer {
    pub answer_id: i64,
    pub text: String,
    pub emoji_name: Option<String>,
    pub emoji_id: Option<String>,
    pub count: u32,
    pub me_voted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientPoll {
    pub message_id: String,
    pub channel_id: String,
    pub question: String,
    pub answers: Vec<ClientPollAnswer>,
    pub expiry: Option<String>,
    pub allow_multiselect: bool,
    pub layout_type: i32,
    pub finalized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientPollVoter {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientScheduledEvent {
    pub id: String,
    pub guild_id: String,
    pub name: String,
    pub description: String,
    pub channel_id: Option<String>,
    pub creator_id: Option<String>,
    pub scheduled_start_time: String,
    pub scheduled_end_time: Option<String>,
    pub privacy_level: i32,
    pub status: i32,
    pub entity_type: i32,
    pub location: Option<String>,
    pub image: Option<String>,
    pub user_count: u32,
    pub recurrence_rule: Option<ClientEventRecurrence>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientEventRecurrence {
    pub start: String,
    pub frequency: i32,
    pub interval: i32,
    pub by_weekday: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientFriendRequest {
    pub id: String,
    pub name: String,
    pub incoming: bool,
    pub avatar_url: Option<String>,
}

fn value_str<'a>(value: &'a serde_json::Value, key: &str) -> &'a str {
    value.get(key).and_then(|item| item.as_str()).unwrap_or("")
}

fn value_string(value: &serde_json::Value, key: &str) -> Option<String> {
    let text = value_str(value, key);
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn value_i32(value: &serde_json::Value, key: &str) -> i32 {
    value.get(key).and_then(|item| item.as_i64()).unwrap_or(0) as i32
}

fn forum_tag_from_value(value: &serde_json::Value) -> Option<ClientForumTag> {
    let id = value_str(value, "id");
    if !snowflake_ok(id) {
        return None;
    }
    let emoji = value.get("emoji");
    Some(ClientForumTag {
        id: id.to_string(),
        name: value_str(value, "name").to_string(),
        moderated: value
            .get("moderated")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        emoji_id: emoji
            .and_then(|item| value_string(item, "id"))
            .or_else(|| value_string(value, "emoji_id")),
        emoji_name: emoji
            .and_then(|item| value_string(item, "name"))
            .or_else(|| value_string(value, "emoji_name")),
    })
}

fn starter_from_thread(value: &serde_json::Value) -> (Option<String>, Option<String>) {
    let Some(message) = value.get("message") else {
        return (None, None);
    };
    let content = value_string(message, "content");
    let image = message
        .get("attachments")
        .and_then(|item| item.as_array())
        .and_then(|list| list.first())
        .and_then(|attachment| {
            value_string(attachment, "proxy_url").or_else(|| value_string(attachment, "url"))
        });
    (content, image)
}

pub fn thread_record_from_value(value: &serde_json::Value) -> Option<ClientThreadRecord> {
    let id = value_str(value, "id");
    if !snowflake_ok(id) {
        return None;
    }
    let raw_kind = value_i32(value, "type");
    let meta = value.get("thread_metadata");
    let name = value_str(value, "name");
    let (starter_content, starter_image) = starter_from_thread(value);
    let applied_tags = value
        .get("applied_tags")
        .and_then(|item| item.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|tag| tag.as_str())
                .filter(|tag| snowflake_ok(tag))
                .map(|tag| tag.to_string())
                .collect()
        })
        .unwrap_or_default();
    Some(ClientThreadRecord {
        id: id.to_string(),
        name: if name.is_empty() {
            "Thread".into()
        } else {
            name.to_string()
        },
        raw_kind,
        parent_id: value_string(value, "parent_id").filter(|item| snowflake_ok(item)),
        guild_id: value_string(value, "guild_id").filter(|item| snowflake_ok(item)),
        owner_id: value_string(value, "owner_id").filter(|item| snowflake_ok(item)),
        archived: meta
            .and_then(|item| item.get("archived"))
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        locked: meta
            .and_then(|item| item.get("locked"))
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        invitable: meta
            .and_then(|item| item.get("invitable"))
            .and_then(|item| item.as_bool())
            .unwrap_or(true),
        auto_archive_duration: meta
            .map(|item| value_i32(item, "auto_archive_duration"))
            .filter(|item| *item > 0)
            .unwrap_or(1440),
        message_count: value
            .get("message_count")
            .and_then(|item| item.as_u64())
            .unwrap_or(0) as u32,
        member_count: value
            .get("member_count")
            .and_then(|item| item.as_u64())
            .unwrap_or(0) as u32,
        last_message_id: value_string(value, "last_message_id").filter(|item| snowflake_ok(item)),
        applied_tags,
        flags: value_i32(value, "flags"),
        starter_content,
        starter_image,
    })
}

pub fn forum_parent_from_value(value: &serde_json::Value) -> Option<ClientForumParent> {
    let id = value_str(value, "id");
    if !snowflake_ok(id) {
        return None;
    }
    let tags = value
        .get("available_tags")
        .and_then(|item| item.as_array())
        .map(|list| list.iter().filter_map(forum_tag_from_value).collect())
        .unwrap_or_default();
    Some(ClientForumParent {
        id: id.to_string(),
        raw_kind: value_i32(value, "type"),
        topic: value_str(value, "topic").to_string(),
        flags: value_i32(value, "flags"),
        available_tags: tags,
        default_sort_order: value
            .get("default_sort_order")
            .and_then(|item| item.as_i64())
            .map(|item| item as i32),
        default_forum_layout: value
            .get("default_forum_layout")
            .and_then(|item| item.as_i64())
            .map(|item| item as i32),
    })
}

pub fn thread_list_from_value(value: &serde_json::Value) -> Vec<ClientThreadRecord> {
    value
        .get("threads")
        .and_then(|item| item.as_array())
        .map(|list| list.iter().filter_map(thread_record_from_value).collect())
        .unwrap_or_default()
}

/// Guild active-thread payloads include every parent. Keep the ones for this channel.
pub fn threads_for_parent(value: &serde_json::Value, parent_id: &str) -> Vec<ClientThreadRecord> {
    thread_list_from_value(value)
        .into_iter()
        .filter(|thread| thread.parent_id.as_deref() == Some(parent_id))
        .collect()
}

pub fn thread_member_from_value(value: &serde_json::Value) -> Option<ClientThreadMember> {
    let user_id = value_str(value, "user_id");
    if !snowflake_ok(user_id) {
        return None;
    }
    let member = value.get("member");
    let user = member.and_then(|item| item.get("user"));
    let nick = member.and_then(|item| value_string(item, "nick"));
    let global = user.and_then(|item| value_string(item, "global_name"));
    let username = user.and_then(|item| value_string(item, "username"));
    let name = nick
        .or(global)
        .or(username)
        .unwrap_or_else(|| "Member".into());
    let avatar = user
        .and_then(|item| item.get("avatar"))
        .and_then(|item| item.as_str())
        .map(|item| item.to_string());
    Some(ClientThreadMember {
        id: value_str(value, "id").to_string(),
        user_id: user_id.to_string(),
        join_timestamp: value_str(value, "join_timestamp").to_string(),
        flags: value_i32(value, "flags"),
        avatar_url: avatar_url(user_id, &avatar),
        name,
    })
}

pub fn poll_from_message(value: &serde_json::Value) -> Option<ClientPoll> {
    let poll = value.get("poll")?;
    let question = poll
        .pointer("/question/text")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .trim();
    if question.is_empty() {
        return None;
    }
    let counts = poll
        .pointer("/results/answer_counts")
        .and_then(|item| item.as_array())
        .cloned()
        .unwrap_or_default();
    let answers: Vec<ClientPollAnswer> = poll
        .get("answers")
        .and_then(|item| item.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|answer| {
                    let answer_id = answer.get("answer_id").and_then(|item| item.as_i64())?;
                    let text = answer
                        .pointer("/poll_media/text")
                        .and_then(|item| item.as_str())
                        .unwrap_or("")
                        .trim();
                    if text.is_empty() {
                        return None;
                    }
                    let tally = counts
                        .iter()
                        .find(|item| item.get("id").and_then(|id| id.as_i64()) == Some(answer_id));
                    Some(ClientPollAnswer {
                        answer_id,
                        text: text.to_string(),
                        emoji_name: answer
                            .pointer("/poll_media/emoji/name")
                            .and_then(|item| item.as_str())
                            .map(|item| item.to_string()),
                        emoji_id: answer
                            .pointer("/poll_media/emoji/id")
                            .and_then(|item| item.as_str())
                            .filter(|item| snowflake_ok(item))
                            .map(|item| item.to_string()),
                        count: tally
                            .and_then(|item| item.get("count"))
                            .and_then(|item| item.as_u64())
                            .unwrap_or(0) as u32,
                        me_voted: tally
                            .and_then(|item| item.get("me_voted"))
                            .and_then(|item| item.as_bool())
                            .unwrap_or(false),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    if answers.is_empty() {
        return None;
    }
    Some(ClientPoll {
        message_id: value_str(value, "id").to_string(),
        channel_id: value_str(value, "channel_id").to_string(),
        question: question.to_string(),
        answers,
        expiry: poll
            .get("expiry")
            .and_then(|item| item.as_str())
            .map(|item| item.to_string()),
        allow_multiselect: poll
            .get("allow_multiselect")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        layout_type: value_i32(poll, "layout_type"),
        finalized: poll
            .pointer("/results/is_finalized")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
    })
}

pub fn poll_voters_from_value(value: &serde_json::Value) -> Vec<ClientPollVoter> {
    value
        .get("users")
        .and_then(|item| item.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|user| {
                    let id = value_str(user, "id");
                    if !snowflake_ok(id) {
                        return None;
                    }
                    let avatar = user
                        .get("avatar")
                        .and_then(|item| item.as_str())
                        .map(|item| item.to_string());
                    let name = value_string(user, "global_name")
                        .or_else(|| value_string(user, "username"))
                        .unwrap_or_else(|| "Someone".into());
                    Some(ClientPollVoter {
                        avatar_url: avatar_url(id, &avatar),
                        id: id.to_string(),
                        name,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn event_from_value(value: &serde_json::Value) -> Option<ClientScheduledEvent> {
    let id = value_str(value, "id");
    let guild_id = value_str(value, "guild_id");
    if !snowflake_ok(id) || !snowflake_ok(guild_id) {
        return None;
    }
    let name = value_str(value, "name").trim();
    if name.is_empty() {
        return None;
    }
    let recurrence = value.get("recurrence_rule").and_then(|rule| {
        let start = value_str(rule, "start");
        if start.is_empty() {
            return None;
        }
        Some(ClientEventRecurrence {
            start: start.to_string(),
            frequency: value_i32(rule, "frequency"),
            interval: value_i32(rule, "interval").max(1),
            by_weekday: rule
                .get("by_weekday")
                .and_then(|item| item.as_array())
                .map(|list| {
                    list.iter()
                        .filter_map(|day| day.as_i64())
                        .map(|day| day as i32)
                        .collect()
                })
                .unwrap_or_default(),
        })
    });
    Some(ClientScheduledEvent {
        id: id.to_string(),
        guild_id: guild_id.to_string(),
        name: name.to_string(),
        description: value_str(value, "description").to_string(),
        channel_id: value_string(value, "channel_id").filter(|item| snowflake_ok(item)),
        creator_id: value_string(value, "creator_id").filter(|item| snowflake_ok(item)),
        scheduled_start_time: value_str(value, "scheduled_start_time").to_string(),
        scheduled_end_time: value_string(value, "scheduled_end_time"),
        privacy_level: value_i32(value, "privacy_level"),
        status: value_i32(value, "status"),
        entity_type: value_i32(value, "entity_type"),
        location: value
            .pointer("/entity_metadata/location")
            .and_then(|item| item.as_str())
            .map(|item| item.to_string()),
        image: value_string(value, "image"),
        user_count: value
            .get("user_count")
            .and_then(|item| item.as_u64())
            .unwrap_or(0) as u32,
        recurrence_rule: recurrence,
    })
}

pub fn events_from_value(value: &serde_json::Value) -> Vec<ClientScheduledEvent> {
    value
        .as_array()
        .map(|list| list.iter().filter_map(event_from_value).collect())
        .unwrap_or_default()
}

/// Relationship type 3 is an incoming request. Type 4 is outgoing.
pub fn friend_requests_from_value(value: &serde_json::Value) -> Vec<ClientFriendRequest> {
    let Some(list) = value.as_array() else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| {
            let kind = value_i32(item, "type");
            if kind != 3 && kind != 4 {
                return None;
            }
            let user = item.get("user")?;
            let id = value_str(user, "id");
            if !snowflake_ok(id) {
                return None;
            }
            let avatar = user
                .get("avatar")
                .and_then(|part| part.as_str())
                .map(|part| part.to_string());
            let name = value_string(user, "global_name")
                .or_else(|| value_string(user, "username"))
                .unwrap_or_else(|| "Someone".into());
            Some(ClientFriendRequest {
                incoming: kind == 3,
                avatar_url: avatar_url(id, &avatar),
                id: id.to_string(),
                name,
            })
        })
        .collect()
}

const ARCHIVE_MINUTES: [i32; 4] = [60, 1440, 4320, 10080];
const POLL_HOURS: [i32; 6] = [1, 4, 8, 24, 72, 168];

#[derive(Debug)]
pub struct ThreadCreateRequest {
    pub path: String,
    pub body: serde_json::Value,
}

pub fn thread_create_request(
    channel_id: &str,
    message_id: Option<&str>,
    name: &str,
    kind: Option<i32>,
    auto_archive_duration: Option<i32>,
    invitable: Option<bool>,
    content: Option<&str>,
    applied_tags: &[String],
    route: &str,
    parent_kind: Option<i32>,
    parent_flags: i32,
    has_attachment: bool,
) -> Result<ThreadCreateRequest, String> {
    if !snowflake_ok(channel_id) {
        return Err("Open a channel first.".into());
    }
    let name = name.trim();
    if name.is_empty() {
        return Err("Name the thread.".into());
    }
    if name.chars().count() > 100 {
        return Err("Thread names can be 100 characters.".into());
    }
    let duration = auto_archive_duration.unwrap_or(1440);
    if !ARCHIVE_MINUTES.contains(&duration) {
        return Err("That archive time isn't one Discord offers.".into());
    }
    let tags: Vec<&str> = applied_tags
        .iter()
        .map(String::as_str)
        .filter(|tag| snowflake_ok(tag))
        .collect();
    match route {
        "from-message" => {
            let Some(message_id) = message_id.filter(|id| snowflake_ok(id)) else {
                return Err("That message is missing.".into());
            };
            if kind == Some(12) {
                return Err("Private threads start on their own.".into());
            }
            Ok(ThreadCreateRequest {
                path: format!("/channels/{channel_id}/messages/{message_id}/threads"),
                body: serde_json::json!({ "name": name, "auto_archive_duration": duration }),
            })
        }
        "standalone" => {
            let thread_type = kind.unwrap_or(if parent_kind == Some(5) { 10 } else { 11 });
            if thread_type != 10 && thread_type != 11 && thread_type != 12 {
                return Err("Pick a public, private, or announcement thread.".into());
            }
            if thread_type == 10 && parent_kind != Some(5) {
                return Err("Announcement threads belong in an announcement channel.".into());
            }
            let mut body = serde_json::json!({
                "name": name,
                "auto_archive_duration": duration,
                "type": thread_type
            });
            if thread_type == 12 {
                body["invitable"] = serde_json::json!(invitable.unwrap_or(true));
            }
            Ok(ThreadCreateRequest {
                path: format!("/channels/{channel_id}/threads"),
                body,
            })
        }
        "forum-post" => {
            if parent_flags & (1 << 4) != 0 && tags.is_empty() {
                return Err("Pick a tag before posting.".into());
            }
            if tags.len() > 5 {
                return Err("Five tags is the limit.".into());
            }
            let text = content.unwrap_or("").trim();
            if text.chars().count() > 2000 {
                return Err("Posts can be 2,000 characters.".into());
            }
            if parent_kind == Some(16) && !has_attachment {
                return Err("Media posts need an image or video.".into());
            }
            if text.is_empty() && !has_attachment {
                return Err("A post needs a message.".into());
            }
            Ok(ThreadCreateRequest {
                path: format!("/channels/{channel_id}/threads"),
                body: serde_json::json!({
                    "name": name,
                    "auto_archive_duration": duration,
                    "applied_tags": tags,
                    "message": { "content": text }
                }),
            })
        }
        _ => Err("That thread type is not supported.".into()),
    }
}

pub fn poll_message_body(
    question: &str,
    answers: &[(String, Option<String>)],
    duration: i32,
    allow_multiselect: bool,
) -> Result<serde_json::Value, String> {
    let question = question.trim();
    if question.is_empty() {
        return Err("Ask a question.".into());
    }
    if question.chars().count() > 300 {
        return Err("Questions can be 300 characters.".into());
    }
    if !POLL_HOURS.contains(&duration) {
        return Err("That poll length isn't one Discord offers.".into());
    }
    let mut answers_json = Vec::new();
    for (text, emoji) in answers {
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        if text.chars().count() > 55 {
            return Err("Answers can be 55 characters.".into());
        }
        let mut media = serde_json::json!({ "text": text });
        if let Some(emoji) = emoji
            .as_deref()
            .map(str::trim)
            .filter(|item| !item.is_empty())
        {
            media["emoji"] = serde_json::json!({ "name": emoji });
        }
        answers_json.push(serde_json::json!({ "poll_media": media }));
    }
    let answers = answers_json;
    if answers.len() < 2 {
        return Err("Add at least two answers.".into());
    }
    if answers.len() > 10 {
        return Err("Ten answers is the limit.".into());
    }
    Ok(serde_json::json!({
        "content": "",
        "poll": {
            "question": { "text": question },
            "answers": answers,
            "duration": duration,
            "allow_multiselect": allow_multiselect,
            "layout_type": 1
        }
    }))
}

pub fn ack_bulk_body(states: &[(String, String)]) -> Result<serde_json::Value, String> {
    if states.is_empty() {
        return Err("Nothing is unread.".into());
    }
    if states.len() > 100 {
        return Err("Mark read in smaller batches.".into());
    }
    let read_states: Vec<serde_json::Value> = states
        .iter()
        .map(|(channel_id, message_id)| {
            if !snowflake_ok(channel_id) || !snowflake_ok(message_id) {
                return Err("That channel is missing.".to_string());
            }
            Ok(serde_json::json!({
                "channel_id": channel_id,
                "message_id": message_id,
                "read_state_type": 0
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(serde_json::json!({ "read_states": read_states }))
}

#[cfg(test)]
mod parity_stream_f {
    use super::*;

    #[test]
    fn parses_a_thread_a_forum_and_a_poll() {
        let thread = thread_record_from_value(&serde_json::json!({
            "id": "100000000000000036",
            "type": 11,
            "name": "Wordmark",
            "parent_id": "100000000000000029",
            "guild_id": "100000000000000010",
            "owner_id": "100000000000000002",
            "message_count": 3,
            "member_count": 2,
            "thread_metadata": { "archived": false, "auto_archive_duration": 1440, "locked": false },
            "applied_tags": ["100000000000000901"],
            "message": {
                "content": "The new mark",
                "attachments": [{ "url": "https://cdn.discordapp.com/a.png", "proxy_url": "https://media.discordapp.net/a.png" }]
            }
        }))
        .unwrap();
        assert_eq!(thread.raw_kind, 11);
        assert!(!thread.archived);
        assert_eq!(thread.applied_tags, vec!["100000000000000901"]);
        assert_eq!(thread.starter_content.as_deref(), Some("The new mark"));
        assert_eq!(
            thread.starter_image.as_deref(),
            Some("https://media.discordapp.net/a.png")
        );

        let parent = forum_parent_from_value(&serde_json::json!({
            "id": "100000000000000029",
            "type": 15,
            "topic": "One post per frame",
            "flags": 16,
            "default_sort_order": 0,
            "available_tags": [{ "id": "100000000000000901", "name": "Wordmark", "moderated": false, "emoji_name": "pencil" }]
        }))
        .unwrap();
        assert_eq!(parent.flags, 16);
        assert_eq!(parent.available_tags[0].name, "Wordmark");
        assert_eq!(parent.raw_kind, 15);
        let kept = threads_for_parent(
            &serde_json::json!({
                "threads": [
                    { "id": "100000000000000036", "name": "Here", "type": 11, "parent_id": "100000000000000022" },
                    { "id": "100000000000000037", "name": "Elsewhere", "type": 11, "parent_id": "100000000000000023" }
                ]
            }),
            "100000000000000022",
        );
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].name, "Here");

        let poll = poll_from_message(&serde_json::json!({
            "id": "100000000000000220",
            "channel_id": "100000000000000022",
            "poll": {
                "question": { "text": "Lunch?" },
                "answers": [
                    { "answer_id": 1, "poll_media": { "text": "Yes", "emoji": { "name": "👍" } } },
                    { "answer_id": 2, "poll_media": { "text": "No" } }
                ],
                "expiry": "2026-10-13T18:00:00.000Z",
                "allow_multiselect": false,
                "layout_type": 1,
                "results": {
                    "is_finalized": false,
                    "answer_counts": [{ "id": 1, "count": 2, "me_voted": true }]
                }
            }
        }))
        .unwrap();
        assert_eq!(poll.question, "Lunch?");
        assert!(poll.answers[0].me_voted);
        assert_eq!(poll.answers[0].count, 2);
        assert_eq!(poll.answers[1].count, 0);
    }

    #[test]
    fn parses_events_requests_and_refuses_a_private_from_message_route() {
        let event = event_from_value(&serde_json::json!({
            "id": "100000000000000077",
            "guild_id": "100000000000000010",
            "name": "Ship review",
            "description": "Look",
            "channel_id": "100000000000000026",
            "scheduled_start_time": "2026-10-13T18:00:00.000Z",
            "privacy_level": 2,
            "status": 1,
            "entity_type": 2,
            "user_count": 4,
            "recurrence_rule": { "start": "2026-10-13T18:00:00.000Z", "frequency": 2, "interval": 1, "by_weekday": [1] }
        }))
        .unwrap();
        assert_eq!(event.entity_type, 2);
        assert_eq!(event.recurrence_rule.unwrap().frequency, 2);

        let requests = friend_requests_from_value(&serde_json::json!([
            { "type": 1, "user": { "id": "100000000000000002", "username": "maya", "global_name": "Maya" } },
            { "type": 3, "user": { "id": "100000000000000004", "username": "ada", "global_name": "Ada" } },
            { "type": 4, "user": { "id": "100000000000000005", "username": "jon" } }
        ]));
        assert_eq!(requests.len(), 2);
        assert!(requests[0].incoming);
        assert_eq!(requests[0].name, "Ada");
        assert!(!requests[1].incoming);

        let made = thread_create_request(
            "100000000000000022",
            Some("100000000000000220"),
            "Notes",
            None,
            Some(1440),
            None,
            None,
            &[],
            "from-message",
            Some(0),
            0,
            false,
        )
        .unwrap();
        assert_eq!(
            made.path,
            "/channels/100000000000000022/messages/100000000000000220/threads"
        );
        assert!(made.body.get("type").is_none());
        assert!(thread_create_request(
            "100000000000000022",
            Some("100000000000000220"),
            "Quiet",
            Some(12),
            None,
            None,
            None,
            &[],
            "from-message",
            Some(0),
            0,
            false,
        )
        .is_err());

        let media = thread_create_request(
            "100000000000000029",
            None,
            "Poster",
            None,
            None,
            None,
            Some("Look"),
            &[],
            "forum-post",
            Some(16),
            0,
            false,
        );
        assert!(media.unwrap_err().contains("image"));

        let body = poll_message_body(
            "Lunch?",
            &[("Yes".into(), Some("👍".into())), ("No".into(), None)],
            24,
            false,
        )
        .unwrap();
        assert_eq!(body["poll"]["layout_type"], 1);
        assert_eq!(
            body["poll"]["answers"][0]["poll_media"]["emoji"]["name"],
            "👍"
        );
        let bulk =
            ack_bulk_body(&[("100000000000000022".into(), "100000000000000220".into())]).unwrap();
        assert_eq!(bulk["read_states"][0]["read_state_type"], 0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientGif {
    pub id: String,
    pub title: String,
    pub url: String,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientReactionUser {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientAppOption {
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub type_id: i32,
    pub required: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<ClientAppChoice>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub autocomplete: bool,
    /// Subcommand and subcommand-group children.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<ClientAppOption>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub channel_types: Vec<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClientAppChoice {
    pub name: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientAppCommand {
    pub id: String,
    pub application_id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub kind: i32,
    pub version: String,
    pub options: Vec<ClientAppOption>,
}

#[cfg(test)]
mod messaging_fields {
    use super::*;

    #[test]
    fn system_calls_forwards_and_role_ids_survive_mapping() {
        let raw = r#"{
            "id": "100000000000000300",
            "channel_id": "100000000000000022",
            "guild_id": "100000000000000010",
            "type": 3,
            "content": "",
            "timestamp": "2026-10-06T12:00:00.000Z",
            "pinned": true,
            "author": {"id": "7", "username": "maya", "global_name": "Maya Chen"},
            "member": {"roles": ["100000000000000099"]},
            "call": {"ended_timestamp": "2026-10-06T12:05:00.000Z"},
            "message_reference": {"type": 1, "message_id": "100000000000000111", "channel_id": "100000000000000022"},
            "message_snapshots": [{"message": {"id": "100000000000000111", "content": "earlier", "author": {"id": "8", "username": "jonah", "global_name": "Jonah"}}}]
        }"#;
        let parsed: DiscordMessage = serde_json::from_str(raw).unwrap();
        let client = message_to_client(&parsed);
        assert_eq!(client.message_type, 3);
        assert!(client.pinned);
        assert_eq!(client.author_role_ids, vec!["100000000000000099"]);
        assert_eq!(
            client.call_ended.as_deref(),
            Some("2026-10-06T12:05:00.000Z")
        );
        assert!(client.reply.is_none());
        assert_eq!(client.forwarded.as_ref().unwrap().preview, "earlier");
        assert!(client.poll.is_none());
        assert!(validate_composed("", 0, 0, 10_000, 1).is_ok());
        assert!(validate_composed("", 0, 0, 10_000, 0).is_err());
    }

    #[test]
    fn poll_messages_keep_the_poll_on_the_client_message() {
        let raw = r#"{
            "id": "100000000000000300",
            "channel_id": "100000000000000022",
            "content": "",
            "timestamp": "2026-10-12T18:00:00.000Z",
            "author": {"id": "7", "username": "maya"},
            "poll": {
                "question": { "text": "Lunch?" },
                "expiry": "2026-10-13T18:00:00.000Z",
                "allow_multiselect": false,
                "layout_type": 1,
                "answers": [
                    { "answer_id": 1, "poll_media": { "text": "Yes" } },
                    { "answer_id": 2, "poll_media": { "text": "No" } }
                ],
                "results": { "is_finalized": false, "answer_counts": [{ "id": 1, "count": 2, "me_voted": true }] }
            }
        }"#;
        let client = message_to_client(&serde_json::from_str(raw).unwrap());
        let poll = client.poll.expect("poll");
        assert_eq!(poll.question, "Lunch?");
        assert_eq!(poll.message_id, "100000000000000300");
        assert_eq!(poll.answers[0].count, 2);
        assert!(poll.answers[0].me_voted);
        assert_eq!(poll.expiry.as_deref(), Some("2026-10-13T18:00:00.000Z"));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientMessageRequest {
    pub id: String,
    pub name: String,
    pub preview: String,
    pub spam: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

/// Discord returns an array, or an object with `message_requests`, `channels`, or `spam`.
pub fn message_requests_from_value(
    value: &serde_json::Value,
    spam: bool,
) -> Vec<ClientMessageRequest> {
    message_request_list(value)
        .into_iter()
        .filter_map(|item| message_request_from_value(item, spam))
        .collect()
}

fn message_request_list(value: &serde_json::Value) -> Vec<&serde_json::Value> {
    if let Some(list) = value.as_array() {
        return list.iter().collect();
    }
    for key in ["message_requests", "channels", "spam"] {
        if let Some(list) = value.get(key).and_then(|item| item.as_array()) {
            return list.iter().collect();
        }
    }
    Vec::new()
}

fn message_request_from_value(
    value: &serde_json::Value,
    spam: bool,
) -> Option<ClientMessageRequest> {
    let id = json_snowflake(value, &["id", "channel_id"]);
    if !snowflake_ok(&id) {
        return None;
    }
    let recipient = value
        .get("recipients")
        .and_then(|item| item.as_array())
        .and_then(|list| list.first())
        .or_else(|| value.get("recipient"));
    let name = recipient
        .and_then(|user| {
            value_string(user, "global_name").or_else(|| value_string(user, "username"))
        })
        .or_else(|| value_string(value, "name"))
        .unwrap_or_else(|| "Someone".into());
    let preview = value
        .get("last_message")
        .or_else(|| value.get("message"))
        .and_then(|message| value_string(message, "content"))
        .or_else(|| value_string(value, "content"))
        .or_else(|| value_string(value, "preview"))
        .unwrap_or_default();
    let preview: String = preview.chars().take(140).collect();
    let flagged = value
        .get("is_spam")
        .and_then(|item| item.as_bool())
        .or_else(|| value.get("spam").and_then(|item| item.as_bool()))
        .unwrap_or(spam);
    let user_id = recipient.and_then(|user| {
        let id = json_snowflake(user, &["id"]);
        snowflake_ok(&id).then_some(id)
    });
    Some(ClientMessageRequest {
        id,
        name,
        preview,
        spam: flagged,
        user_id,
    })
}

fn json_snowflake(value: &serde_json::Value, keys: &[&str]) -> String {
    for key in keys {
        match value.get(*key) {
            Some(serde_json::Value::String(text)) => return text.clone(),
            Some(serde_json::Value::Number(number)) => return number.to_string(),
            _ => {}
        }
    }
    String::new()
}

#[cfg(test)]
mod message_request_fields {
    use super::*;

    #[test]
    fn message_requests_keep_channel_recipient_and_spam() {
        let raw = serde_json::json!([
            {
                "id": "100000000000000041",
                "recipients": [{ "id": "100000000000000009", "username": "stranger", "global_name": "Stranger" }],
                "last_message": { "content": "hello there" }
            }
        ]);
        let rows = message_requests_from_value(&raw, false);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "100000000000000041");
        assert_eq!(rows[0].name, "Stranger");
        assert_eq!(rows[0].preview, "hello there");
        assert!(!rows[0].spam);
        assert_eq!(rows[0].user_id.as_deref(), Some("100000000000000009"));

        let wrapped = serde_json::json!({
            "message_requests": [{
                "channel_id": "100000000000000042",
                "is_spam": true,
                "name": "Inbox"
            }]
        });
        let spam = message_requests_from_value(&wrapped, false);
        assert!(spam[0].spam);
        assert_eq!(spam[0].id, "100000000000000042");
        assert!(message_requests_from_value(&serde_json::json!([]), true).is_empty());
        assert!(
            message_requests_from_value(&serde_json::json!([{ "id": "nope" }]), true).is_empty()
        );
    }
}
