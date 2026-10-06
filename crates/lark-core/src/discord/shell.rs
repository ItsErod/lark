//! Server list, read badges, and channel visibility.
//! Discord's user settings carry folder order. Channel visibility is the
//! permission bitfield after role and overwrite math. Notification mutes
//! come from user guild settings.

use base64::Engine;
use serde::Serialize;
use serde_json::Value;

use super::types::{color_hex, snowflake_ok, DiscordGuild, DiscordRole};

pub const VIEW_CHANNEL: u64 = 1 << 10;
pub const ADMINISTRATOR: u64 = 1 << 3;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientFolder {
    pub id: Option<String>,
    pub name: Option<String>,
    pub color: Option<String>,
    pub guild_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientRoleGrant {
    pub id: String,
    pub permissions: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientGuildAccess {
    pub guild_id: String,
    pub owner: bool,
    pub permissions: String,
    pub roles: Vec<ClientRoleGrant>,
    pub my_roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientChannelPref {
    pub channel_id: String,
    pub muted: bool,
    pub level: Option<String>,
    pub collapsed: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientGuildPref {
    pub guild_id: Option<String>,
    pub muted: bool,
    pub level: Option<String>,
    pub suppress_everyone: bool,
    pub suppress_roles: bool,
    pub channels: Vec<ClientChannelPref>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadMarker {
    pub channel_id: String,
    pub last_message_id: String,
    pub mention_count: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct OverwriteBits {
    pub id: &'static str,
    pub kind: i32,
    pub allow: u64,
    pub deny: u64,
}

pub fn parse_bits(value: &str) -> u64 {
    value.trim().parse::<u64>().unwrap_or(0)
}

/// Discord permission order: owner, base role bits, administrator,
/// @everyone overwrite, role overwrites, then the member overwrite.
pub fn channel_permissions(
    user_id: &str,
    guild_id: &str,
    owner: bool,
    base: u64,
    my_roles: &[String],
    overwrites: &[OverwriteBits],
) -> u64 {
    if owner {
        return u64::MAX;
    }
    if base & ADMINISTRATOR != 0 {
        return u64::MAX;
    }
    let mut permissions = base;
    if let Some(everyone) = overwrites
        .iter()
        .find(|overwrite| overwrite.kind == 0 && overwrite.id == guild_id)
    {
        permissions &= !everyone.deny;
        permissions |= everyone.allow;
    }
    let mut allow = 0u64;
    let mut deny = 0u64;
    for role in my_roles {
        if let Some(overwrite) = overwrites
            .iter()
            .find(|overwrite| overwrite.kind == 0 && overwrite.id == role)
        {
            allow |= overwrite.allow;
            deny |= overwrite.deny;
        }
    }
    permissions &= !deny;
    permissions |= allow;
    if let Some(member) = overwrites
        .iter()
        .find(|overwrite| overwrite.kind == 1 && overwrite.id == user_id)
    {
        permissions &= !member.deny;
        permissions |= member.allow;
    }
    permissions
}

pub fn can_view_channel(
    user_id: &str,
    guild_id: &str,
    owner: bool,
    base: u64,
    my_roles: &[String],
    overwrites: &[OverwriteBits],
) -> bool {
    channel_permissions(user_id, guild_id, owner, base, my_roles, overwrites) & VIEW_CHANNEL != 0
}

pub fn base_from_roles(roles: &[DiscordRole], my_roles: &[String], guild_id: &str) -> u64 {
    let mut bits = 0u64;
    for role in roles {
        if role.id == guild_id || my_roles.iter().any(|id| id == &role.id) {
            bits |= parse_bits(&role.permissions);
        }
    }
    bits
}

pub fn access_from_guild(
    guild: &DiscordGuild,
    user_id: &str,
    my_roles: &[String],
) -> ClientGuildAccess {
    let mut roles_held = my_roles.to_vec();
    if roles_held.is_empty() && !user_id.is_empty() {
        if let Some(member) = guild.members.iter().find(|member| {
            member
                .user
                .as_ref()
                .map(|user| user.id == user_id)
                .unwrap_or(false)
        }) {
            roles_held = member.roles.clone();
        }
    }
    let owner = guild.owner || (!user_id.is_empty() && guild.owner_id.as_deref() == Some(user_id));
    let permissions = if guild.permissions.is_empty() {
        base_from_roles(&guild.roles, &roles_held, &guild.id).to_string()
    } else {
        guild.permissions.clone()
    };
    ClientGuildAccess {
        guild_id: guild.id.clone(),
        owner,
        permissions,
        roles: guild
            .roles
            .iter()
            .map(|role| ClientRoleGrant {
                id: role.id.clone(),
                permissions: role.permissions.clone(),
            })
            .collect(),
        my_roles: roles_held,
    }
}

pub fn my_roles_from_merged(merged: &Value, index: usize) -> Vec<String> {
    let Some(guilds) = merged.as_array() else {
        return Vec::new();
    };
    let Some(members) = guilds.get(index).and_then(|value| value.as_array()) else {
        return Vec::new();
    };
    members
        .first()
        .and_then(|member| member.get("roles"))
        .and_then(|roles| roles.as_array())
        .map(|roles| {
            roles
                .iter()
                .filter_map(|role| role.as_str())
                .filter(|id| snowflake_ok(id))
                .map(|id| id.to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub fn folders_from_settings(user_settings: &Value, proto_b64: Option<&str>) -> Vec<ClientFolder> {
    if let Some(encoded) = proto_b64.map(str::trim).filter(|value| !value.is_empty()) {
        if let Some(bytes) = decode_proto(encoded) {
            let parsed = folders_from_proto(&bytes);
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }
    folders_from_json(user_settings)
}

pub fn folders_from_json(settings: &Value) -> Vec<ClientFolder> {
    let Some(list) = settings
        .get("guild_folders")
        .and_then(|value| value.as_array())
    else {
        return Vec::new();
    };
    list.iter().filter_map(folder_from_json).collect()
}

fn folder_from_json(value: &Value) -> Option<ClientFolder> {
    let ids = string_ids(value.get("guild_ids"));
    if ids.is_empty() {
        return None;
    }
    let id = value
        .get("id")
        .and_then(json_id)
        .filter(|text| !text.is_empty());
    let name = value
        .get("name")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| text.chars().take(80).collect());
    let color = value.get("color").and_then(json_color);
    Some(ClientFolder {
        id,
        name,
        color,
        guild_ids: ids,
    })
}

fn string_ids(value: Option<&Value>) -> Vec<String> {
    let Some(list) = value.and_then(|item| item.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in list {
        let text = if let Some(id) = item.as_str() {
            id.to_string()
        } else if let Some(id) = item.as_u64() {
            id.to_string()
        } else {
            continue;
        };
        if snowflake_ok(&text) && !out.contains(&text) {
            out.push(text);
        }
    }
    out
}

fn json_id(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.trim().to_string()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn json_color(value: &Value) -> Option<String> {
    let bits = match value {
        Value::Number(number) => number.as_u64()?,
        Value::String(text) => text.trim().parse::<u64>().ok()?,
        _ => return None,
    };
    color_hex((bits & 0xffffff) as u32)
}

pub fn folders_from_proto(bytes: &[u8]) -> Vec<ClientFolder> {
    for field in walk(bytes) {
        if field.number == 3 && field.wire == 2 {
            return folders_in_guild_settings(field.bytes);
        }
    }
    Vec::new()
}

fn folders_in_guild_settings(bytes: &[u8]) -> Vec<ClientFolder> {
    let mut folders = Vec::new();
    for field in walk(bytes) {
        if field.number == 1 && field.wire == 2 {
            if let Some(folder) = folder_from_proto(field.bytes) {
                folders.push(folder);
            }
        }
    }
    folders
}

fn folder_from_proto(bytes: &[u8]) -> Option<ClientFolder> {
    let mut ids = Vec::new();
    let mut id = None;
    let mut name = None;
    let mut color = None;
    for field in walk(bytes) {
        match (field.number, field.wire) {
            (1, 1) => {
                if let Some(value) = fixed64(field.bytes) {
                    push_id(&mut ids, value);
                }
            }
            (1, 0) => {
                if let Some(value) = field.varint {
                    push_id(&mut ids, value);
                }
            }
            (1, 2) => {
                for value in packed_ids(field.bytes) {
                    push_id(&mut ids, value);
                }
            }
            (2, 0) => id = field.varint.map(|value| value.to_string()),
            (3, 2) => {
                name = std::str::from_utf8(field.bytes)
                    .ok()
                    .map(str::trim)
                    .filter(|text| !text.is_empty())
                    .map(|text| text.chars().take(80).collect());
            }
            (4, 0) => {
                color = field
                    .varint
                    .and_then(|value| color_hex((value & 0xffffff) as u32))
            }
            (4, 5) => {
                if field.bytes.len() >= 4 {
                    let bits = u32::from_le_bytes(field.bytes[..4].try_into().ok()?);
                    color = color_hex(bits & 0xffffff);
                }
            }
            _ => {}
        }
    }
    if ids.is_empty() {
        return None;
    }
    Some(ClientFolder {
        id: id.filter(|text| text != "0"),
        name,
        color,
        guild_ids: ids,
    })
}

fn push_id(ids: &mut Vec<String>, value: u64) {
    if value == 0 {
        return;
    }
    let text = value.to_string();
    if snowflake_ok(&text) && !ids.contains(&text) {
        ids.push(text);
    }
}

fn packed_ids(bytes: &[u8]) -> Vec<u64> {
    if bytes.len() >= 8 && bytes.len() % 8 == 0 {
        let mut out = Vec::new();
        for chunk in bytes.chunks(8) {
            if let Some(value) = fixed64(chunk) {
                out.push(value);
            }
        }
        if !out.is_empty() {
            return out;
        }
    }
    let mut out = Vec::new();
    let mut cursor = Proto::new(bytes);
    while let Some(value) = cursor.varint() {
        out.push(value);
    }
    out
}

fn fixed64(bytes: &[u8]) -> Option<u64> {
    if bytes.len() < 8 {
        return None;
    }
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&bytes[..8]);
    Some(u64::from_le_bytes(buf))
}

struct Field<'a> {
    number: u32,
    wire: u32,
    bytes: &'a [u8],
    varint: Option<u64>,
}

fn walk(bytes: &[u8]) -> Vec<Field<'_>> {
    let mut cursor = Proto::new(bytes);
    let mut fields = Vec::new();
    while let Some((number, wire)) = cursor.key() {
        match wire {
            0 => {
                let Some(value) = cursor.varint() else { break };
                fields.push(Field {
                    number,
                    wire,
                    bytes: &[],
                    varint: Some(value),
                });
            }
            1 => {
                let Some(chunk) = cursor.take(8) else { break };
                fields.push(Field {
                    number,
                    wire,
                    bytes: chunk,
                    varint: None,
                });
            }
            2 => {
                let Some(len) = cursor.varint() else { break };
                let Some(chunk) = cursor.take(len as usize) else {
                    break;
                };
                fields.push(Field {
                    number,
                    wire,
                    bytes: chunk,
                    varint: None,
                });
            }
            5 => {
                let Some(chunk) = cursor.take(4) else { break };
                fields.push(Field {
                    number,
                    wire,
                    bytes: chunk,
                    varint: None,
                });
            }
            _ => break,
        }
    }
    fields
}

struct Proto<'a> {
    data: &'a [u8],
    index: usize,
}

impl<'a> Proto<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, index: 0 }
    }

    fn varint(&mut self) -> Option<u64> {
        let mut out = 0u64;
        let mut shift = 0;
        while self.index < self.data.len() && shift < 64 {
            let byte = self.data[self.index];
            self.index += 1;
            out |= u64::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return Some(out);
            }
            shift += 7;
        }
        None
    }

    fn key(&mut self) -> Option<(u32, u32)> {
        let key = self.varint()?;
        Some(((key >> 3) as u32, (key & 0x7) as u32))
    }

    fn take(&mut self, len: usize) -> Option<&'a [u8]> {
        if self.index + len > self.data.len() {
            return None;
        }
        let slice = &self.data[self.index..self.index + len];
        self.index += len;
        Some(slice)
    }
}

fn decode_proto(encoded: &str) -> Option<Vec<u8>> {
    let engine = base64::engine::general_purpose::STANDARD;
    let padded = base64::engine::general_purpose::STANDARD.decode(encoded);
    if let Ok(bytes) = padded {
        return Some(bytes);
    }
    engine.decode(encoded.trim_end_matches('=')).ok()
}

pub fn read_markers(read_state: &Value) -> Vec<ReadMarker> {
    let entries = if let Some(list) = read_state.as_array() {
        list
    } else if let Some(list) = read_state.get("entries").and_then(|value| value.as_array()) {
        list
    } else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(|entry| {
            let channel_id = entry
                .get("id")
                .or_else(|| entry.get("channel_id"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if !snowflake_ok(channel_id) {
                return None;
            }
            let last_message_id = entry
                .get("last_message_id")
                .and_then(|value| value.as_str())
                .filter(|id| snowflake_ok(id))
                .unwrap_or("")
                .to_string();
            let mention_count = entry
                .get("mention_count")
                .and_then(|value| value.as_u64())
                .unwrap_or(0)
                .min(u64::from(u32::MAX)) as u32;
            Some(ReadMarker {
                channel_id: channel_id.to_string(),
                last_message_id,
                mention_count,
            })
        })
        .collect()
}

pub fn notify_level(value: Option<i64>) -> Option<&'static str> {
    match value {
        Some(0) => Some("all"),
        Some(1) => Some("mentions"),
        Some(2) => Some("mute"),
        _ => None,
    }
}

pub fn guild_prefs(value: &Value) -> Vec<ClientGuildPref> {
    let entries = if let Some(list) = value.as_array() {
        list
    } else if let Some(list) = value.get("entries").and_then(|item| item.as_array()) {
        list
    } else if value.get("guild_id").is_some() || value.get("channel_overrides").is_some() {
        return vec![pref_from_entry(value)].into_iter().flatten().collect();
    } else {
        return Vec::new();
    };
    entries.iter().filter_map(pref_from_entry).collect()
}

fn pref_from_entry(value: &Value) -> Option<ClientGuildPref> {
    let guild_id = value
        .get("guild_id")
        .and_then(|item| item.as_str())
        .filter(|id| snowflake_ok(id))
        .map(|id| id.to_string());
    let channels: Vec<ClientChannelPref> = value
        .get("channel_overrides")
        .and_then(|item| item.as_array())
        .map(|list| list.iter().filter_map(channel_pref).collect())
        .unwrap_or_default();
    if guild_id.is_none() && channels.is_empty() && !value.get("muted").is_some() {
        return None;
    }
    let muted = value
        .get("muted")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);
    let end = value
        .pointer("/mute_config/end_time")
        .and_then(|item| item.as_str());
    Some(ClientGuildPref {
        guild_id,
        muted: mute_active(muted, end),
        level: notify_level(
            value
                .get("message_notifications")
                .and_then(|item| item.as_i64()),
        )
        .map(|level| level.to_string()),
        suppress_everyone: value
            .get("suppress_everyone")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        suppress_roles: value
            .get("suppress_roles")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
        channels,
    })
}

fn channel_pref(value: &Value) -> Option<ClientChannelPref> {
    let channel_id = value
        .get("channel_id")
        .and_then(|item| item.as_str())
        .filter(|id| snowflake_ok(id))?;
    let muted = value
        .get("muted")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);
    let end = value
        .pointer("/mute_config/end_time")
        .and_then(|item| item.as_str());
    Some(ClientChannelPref {
        channel_id: channel_id.to_string(),
        muted: mute_active(muted, end),
        level: notify_level(
            value
                .get("message_notifications")
                .and_then(|item| item.as_i64()),
        )
        .map(|level| level.to_string()),
        collapsed: value
            .get("collapsed")
            .and_then(|item| item.as_bool())
            .unwrap_or(false),
    })
}

/// A mute with an end time in the past is already over. Missing or null
/// end times mean the mute stays until the user clears it.
pub fn mute_active(muted: bool, end_time: Option<&str>) -> bool {
    if !muted {
        return false;
    }
    let Some(end_time) = end_time.map(str::trim).filter(|text| !text.is_empty()) else {
        return true;
    };
    let Ok(end) = chrono_millis(end_time) else {
        return true;
    };
    end > now_ms()
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn chrono_millis(value: &str) -> Result<i64, ()> {
    // Discord sends ISO-8601. Avoid a time crate: accept the common form
    // `YYYY-MM-DDTHH:MM:SS` with an optional fractional second and `Z`.
    let trimmed = value.trim_end_matches('Z');
    let (date, time) = trimmed.split_once('T').ok_or(())?;
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next().ok_or(())?.parse().map_err(|_| ())?;
    let month: i64 = date_parts.next().ok_or(())?.parse().map_err(|_| ())?;
    let day: i64 = date_parts.next().ok_or(())?.parse().map_err(|_| ())?;
    let time = time.split('.').next().unwrap_or(time);
    let mut time_parts = time.split(':');
    let hour: i64 = time_parts.next().ok_or(())?.parse().map_err(|_| ())?;
    let minute: i64 = time_parts.next().ok_or(())?.parse().map_err(|_| ())?;
    let second: i64 = time_parts.next().unwrap_or("0").parse().map_err(|_| ())?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return Err(());
    }
    let days = days_before_year(year) + days_before_month(year, month) + (day - 1);
    Ok((((days * 24 + hour) * 60 + minute) * 60 + second) * 1000)
}

fn days_before_year(year: i64) -> i64 {
    let mut days = 0i64;
    let mut cursor = 1970i64;
    if year >= 1970 {
        while cursor < year {
            days += if is_leap(cursor) { 366 } else { 365 };
            cursor += 1;
        }
    }
    days
}

fn days_before_month(year: i64, month: i64) -> i64 {
    let leap = is_leap(year);
    let lengths = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    lengths.iter().take((month - 1) as usize).sum()
}

fn is_leap(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

pub fn invite_code(url: &str) -> Option<String> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("javascript:") || lower.starts_with("data:") {
        return None;
    }
    let without_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    let (host_path, _) = without_scheme
        .split_once('?')
        .unwrap_or((without_scheme, ""));
    let (host_path, _) = host_path.split_once('#').unwrap_or((host_path, ""));
    let mut parts = host_path.split('/').filter(|part| !part.is_empty());
    let host = parts.next()?.split('@').next_back()?.split(':').next()?;
    let host = host.to_ascii_lowercase();
    let code = if host == "discord.gg" || host.ends_with(".discord.gg") {
        parts.next()
    } else if host == "discord.com" || host == "discordapp.com" || host.ends_with(".discord.com") {
        let kind = parts.next()?;
        if kind != "invite" {
            return None;
        }
        parts.next()
    } else {
        return None;
    }?;
    let code = code.trim();
    if (2..=32).contains(&code.len())
        && code
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        Some(code.to_string())
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientInvite {
    pub code: String,
    pub guild_id: String,
    pub guild_name: String,
    pub icon_url: Option<String>,
    pub member_count: u64,
    pub channel_name: String,
}

pub fn invite_from_json(code: &str, value: &Value) -> ClientInvite {
    let guild = value.get("guild");
    let guild_id = guild
        .and_then(|item| item.get("id"))
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    let guild_name = guild
        .and_then(|item| item.get("name"))
        .and_then(|item| item.as_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Server")
        .to_string();
    let icon = guild
        .and_then(|item| item.get("icon"))
        .and_then(|item| item.as_str())
        .map(|hash| hash.to_string());
    let channel_name = value
        .pointer("/channel/name")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string();
    ClientInvite {
        code: code.to_string(),
        icon_url: super::types::guild_icon_url(&guild_id, &icon),
        guild_id,
        guild_name,
        member_count: value
            .get("approximate_member_count")
            .and_then(|item| item.as_u64())
            .unwrap_or(0),
        channel_name,
    }
}

pub fn invite_code_ok(code: &str) -> bool {
    (2..=32).contains(&code.len())
        && code
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ow(id: &'static str, kind: i32, allow: u64, deny: u64) -> OverwriteBits {
        OverwriteBits {
            id,
            kind,
            allow,
            deny,
        }
    }

    #[test]
    fn view_channel_follows_overwrites() {
        let guild = "100000000000000010";
        let user = "100000000000000001";
        let role = "100000000000000099".to_string();
        assert!(can_view_channel(user, guild, true, 0, &[], &[]));
        assert!(can_view_channel(
            user,
            guild,
            false,
            ADMINISTRATOR,
            &[],
            &[ow(guild, 0, 0, VIEW_CHANNEL)]
        ));
        assert!(can_view_channel(user, guild, false, VIEW_CHANNEL, &[], &[]));
        assert!(!can_view_channel(
            user,
            guild,
            false,
            VIEW_CHANNEL,
            &[],
            &[ow(guild, 0, 0, VIEW_CHANNEL)]
        ));
        assert!(can_view_channel(
            user,
            guild,
            false,
            VIEW_CHANNEL,
            &[role.clone()],
            &[
                ow(guild, 0, 0, VIEW_CHANNEL),
                ow("100000000000000099", 0, VIEW_CHANNEL, 0)
            ]
        ));
        assert!(!can_view_channel(
            user,
            guild,
            false,
            VIEW_CHANNEL,
            &[role],
            &[
                ow("100000000000000099", 0, VIEW_CHANNEL, 0),
                ow(user, 1, 0, VIEW_CHANNEL)
            ]
        ));
        assert!(!can_view_channel(user, guild, false, 0, &[], &[]));
    }

    #[test]
    fn folders_keep_json_order_color_and_loose_servers() {
        let settings = json!({
            "guild_folders": [
                {"id": 4, "name": "Friends", "color": 16711680, "guild_ids": ["100000000000000010", "100000000000000011"]},
                {"guild_ids": ["100000000000000012"]}
            ]
        });
        let folders = folders_from_json(&settings);
        assert_eq!(folders[0].id.as_deref(), Some("4"));
        assert_eq!(folders[0].name.as_deref(), Some("Friends"));
        assert_eq!(folders[0].color.as_deref(), Some("#ff0000"));
        assert_eq!(folders[0].guild_ids.len(), 2);
        assert!(folders[1].id.is_none());
        assert_eq!(folders[1].guild_ids, vec!["100000000000000012"]);
    }

    #[test]
    fn proto_folders_match_the_preloaded_settings_layout() {
        let guild = 100000000000000010u64;
        let mut folder = Vec::new();
        folder.extend(proto_key(1, 1));
        folder.extend(guild.to_le_bytes());
        folder.extend(proto_key(2, 0));
        folder.extend(proto_varint(7));
        folder.extend(proto_len(3, b"Friends"));
        folder.extend(proto_key(4, 0));
        folder.extend(proto_varint(0xff0000));
        let guilds = proto_len(1, &folder);
        let root = proto_len(3, &guilds);
        let folders = folders_from_proto(&root);
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].guild_ids, vec!["100000000000000010"]);
        assert_eq!(folders[0].id.as_deref(), Some("7"));
        assert_eq!(folders[0].name.as_deref(), Some("Friends"));
        assert_eq!(folders[0].color.as_deref(), Some("#ff0000"));

        let mut packed = Vec::new();
        packed.extend(100000000000000010u64.to_le_bytes());
        packed.extend(100000000000000011u64.to_le_bytes());
        let packed_folder = proto_len(1, &packed);
        let packed_root = proto_len(3, &proto_len(1, &packed_folder));
        let packed_folders = folders_from_proto(&packed_root);
        assert_eq!(packed_folders[0].guild_ids.len(), 2);
    }

    #[test]
    fn read_state_accepts_the_entries_object() {
        let modern = json!({"entries": [{"id": "100000000000000021", "last_message_id": "100000000000000300", "mention_count": 2}], "partial": false});
        let markers = read_markers(&modern);
        assert_eq!(markers[0].mention_count, 2);
        assert_eq!(markers[0].last_message_id, "100000000000000300");
        let legacy = json!([{"id": "100000000000000022", "mention_count": 0}]);
        assert_eq!(read_markers(&legacy)[0].channel_id, "100000000000000022");
    }

    #[test]
    fn guild_settings_map_mute_and_collapse() {
        let value = json!({
            "entries": [{
                "guild_id": "100000000000000010",
                "muted": true,
                "suppress_everyone": true,
                "suppress_roles": false,
                "message_notifications": 1,
                "channel_overrides": [{
                    "channel_id": "100000000000000028",
                    "muted": false,
                    "collapsed": true,
                    "message_notifications": 2
                }]
            }]
        });
        let prefs = guild_prefs(&value);
        assert!(prefs[0].muted);
        assert_eq!(prefs[0].level.as_deref(), Some("mentions"));
        assert!(prefs[0].suppress_everyone);
        assert!(prefs[0].channels[0].collapsed);
        assert_eq!(prefs[0].channels[0].level.as_deref(), Some("mute"));
        assert!(!mute_active(true, Some("2000-01-01T00:00:00.000Z")));
        assert!(mute_active(true, None));
    }

    #[test]
    fn invite_codes_come_from_discord_hosts_only() {
        assert_eq!(
            invite_code("https://discord.gg/AbC-12").as_deref(),
            Some("AbC-12")
        );
        assert_eq!(
            invite_code("https://discord.com/invite/AbC-12?event=1").as_deref(),
            Some("AbC-12")
        );
        assert_eq!(
            invite_code("https://ptb.discord.gg/ok12").as_deref(),
            Some("ok12")
        );
        assert!(invite_code("https://example.com/discord.gg/abc").is_none());
        assert!(invite_code("javascript:discord.gg/abc").is_none());
        assert!(invite_code("https://discord.com/channels/1/2").is_none());
        assert!(invite_code_ok("AbC-12"));
        assert!(!invite_code_ok("../etc"));
    }

    fn proto_varint(mut value: u64) -> Vec<u8> {
        let mut out = Vec::new();
        loop {
            let mut byte = (value & 0x7f) as u8;
            value >>= 7;
            if value != 0 {
                byte |= 0x80;
            }
            out.push(byte);
            if value == 0 {
                break;
            }
        }
        out
    }

    fn proto_key(field: u32, wire: u32) -> Vec<u8> {
        proto_varint(((field as u64) << 3) | wire as u64)
    }

    fn proto_len(field: u32, payload: &[u8]) -> Vec<u8> {
        let mut out = proto_key(field, 2);
        out.extend(proto_varint(payload.len() as u64));
        out.extend(payload);
        out
    }
}
