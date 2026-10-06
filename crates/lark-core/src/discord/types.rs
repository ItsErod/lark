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
    }
}

pub fn member_to_client(member: &DiscordMember) -> Option<ClientMember> {
    let user = member.user.as_ref()?;
    Some(ClientMember {
        id: user.id.clone(),
        name: user.display_name(),
        nick: member.nick.clone(),
        bot: user.bot,
        role_ids: member.roles.clone(),
        status: "offline".into(),
    })
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
}
