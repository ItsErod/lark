use base64::Engine;
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;

use super::types::snowflake_ok;

const BODY_LIMIT: usize = 1_500_000;
const FILE_LIMIT: usize = 1_048_576;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuildAdminRequest {
    pub op: String,
    #[serde(default)]
    pub guild_id: String,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub role_id: String,
    #[serde(default)]
    pub extra: String,
    #[serde(default)]
    pub body: Value,
    #[serde(default)]
    pub file_name: String,
    #[serde(default)]
    pub file_mime: String,
    #[serde(default)]
    pub file_base64: String,
}

pub struct AdminUpload {
    pub name: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

pub struct BuiltCall {
    pub method: Method,
    pub route: String,
    pub major: String,
    pub path: String,
    pub body: Option<Value>,
    pub file: Option<AdminUpload>,
    pub channel_shaped: bool,
}

pub fn build_admin_call(req: &GuildAdminRequest) -> Result<BuiltCall, String> {
    let guild = req.guild_id.trim();
    let channel = req.channel_id.trim();
    let user = req.user_id.trim();
    let role = req.role_id.trim();
    let extra = req.extra.trim();
    let body = object_body(&req.body)?;
    match req.op.trim() {
        "get_guild" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}?with_counts=true"),
                "GET /guilds/{guild.id}",
                guild,
            )
        }
        "patch_guild" => {
            snow(guild)?;
            patch(
                format!("/guilds/{guild}"),
                "PATCH /guilds/{guild.id}",
                guild,
                body,
            )
        }
        "delete_guild" => {
            snow(guild)?;
            delete(
                format!("/guilds/{guild}"),
                "DELETE /guilds/{guild.id}",
                guild,
            )
        }
        "vanity" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/vanity-url"),
                "GET /guilds/{guild.id}/vanity-url",
                guild,
            )
        }
        "create_channel" => {
            snow(guild)?;
            let mut call = post(
                format!("/guilds/{guild}/channels"),
                "POST /guilds/{guild.id}/channels",
                guild,
                body,
            )?;
            call.channel_shaped = true;
            Ok(call)
        }
        "patch_channel" => {
            snow(channel)?;
            let mut call = patch(
                format!("/channels/{channel}"),
                "PATCH /channels/{channel.id}",
                channel,
                body,
            );
            if let Ok(call) = call.as_mut() {
                call.channel_shaped = true;
            }
            call
        }
        "delete_channel" => {
            snow(channel)?;
            delete(
                format!("/channels/{channel}"),
                "DELETE /channels/{channel.id}",
                channel,
            )
        }
        "put_overwrite" => {
            snow(channel)?;
            snow(extra)?;
            put(
                format!("/channels/{channel}/permissions/{extra}"),
                "PUT /channels/{channel.id}/permissions/{overwrite.id}",
                channel,
                body,
            )
        }
        "delete_overwrite" => {
            snow(channel)?;
            snow(extra)?;
            delete(
                format!("/channels/{channel}/permissions/{extra}"),
                "DELETE /channels/{channel.id}/permissions/{overwrite.id}",
                channel,
            )
        }
        "list_guild_invites" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/invites"),
                "GET /guilds/{guild.id}/invites",
                guild,
            )
        }
        "list_channel_invites" => {
            snow(channel)?;
            get(
                format!("/channels/{channel}/invites"),
                "GET /channels/{channel.id}/invites",
                channel,
            )
        }
        "create_invite" => {
            snow(channel)?;
            post(
                format!("/channels/{channel}/invites"),
                "POST /channels/{channel.id}/invites",
                channel,
                body,
            )
        }
        "delete_invite" => {
            invite_code(extra)?;
            delete(
                format!("/invites/{extra}"),
                "DELETE /invites/{code}",
                "invites",
            )
        }
        "list_roles" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/roles"),
                "GET /guilds/{guild.id}/roles",
                guild,
            )
        }
        "create_role" => {
            snow(guild)?;
            post(
                format!("/guilds/{guild}/roles"),
                "POST /guilds/{guild.id}/roles",
                guild,
                body,
            )
        }
        "patch_role" => {
            snow(guild)?;
            snow(role)?;
            patch(
                format!("/guilds/{guild}/roles/{role}"),
                "PATCH /guilds/{guild.id}/roles/{role.id}",
                guild,
                body,
            )
        }
        "delete_role" => {
            snow(guild)?;
            snow(role)?;
            delete(
                format!("/guilds/{guild}/roles/{role}"),
                "DELETE /guilds/{guild.id}/roles/{role.id}",
                guild,
            )
        }
        "reorder_roles" => {
            snow(guild)?;
            let roles = req
                .body
                .as_array()
                .cloned()
                .ok_or("Send the role order as a list.")?;
            patch_value(
                format!("/guilds/{guild}/roles"),
                "PATCH /guilds/{guild.id}/roles",
                guild,
                Value::Array(roles),
            )
        }
        "add_role" => {
            snow(guild)?;
            snow(user)?;
            snow(role)?;
            put(
                format!("/guilds/{guild}/members/{user}/roles/{role}"),
                "PUT /guilds/{guild.id}/members/{user.id}/roles/{role.id}",
                guild,
                None,
            )
        }
        "remove_role" => {
            snow(guild)?;
            snow(user)?;
            snow(role)?;
            delete(
                format!("/guilds/{guild}/members/{user}/roles/{role}"),
                "DELETE /guilds/{guild.id}/members/{user.id}/roles/{role.id}",
                guild,
            )
        }
        "list_members" => {
            snow(guild)?;
            let mut path = format!("/guilds/{guild}/members?limit=100");
            if !extra.is_empty() {
                snow(extra)?;
                path.push_str("&after=");
                path.push_str(extra);
            }
            get(path, "GET /guilds/{guild.id}/members", guild)
        }
        "search_members" => {
            snow(guild)?;
            if extra.is_empty()
                || extra.len() > 32
                || extra
                    .chars()
                    .any(|ch| ch.is_control() || matches!(ch, '/' | '?' | '&' | '#'))
            {
                return Err("Enter a name to search.".into());
            }
            get(
                format!(
                    "/guilds/{guild}/members/search?query={}",
                    query_escape(extra)
                ),
                "GET /guilds/{guild.id}/members/search",
                guild,
            )
        }
        "patch_member" => {
            snow(guild)?;
            snow(user)?;
            patch(
                format!("/guilds/{guild}/members/{user}"),
                "PATCH /guilds/{guild.id}/members/{user.id}",
                guild,
                body,
            )
        }
        "kick_member" => {
            snow(guild)?;
            snow(user)?;
            delete(
                format!("/guilds/{guild}/members/{user}"),
                "DELETE /guilds/{guild.id}/members/{user.id}",
                guild,
            )
        }
        "prune" => {
            snow(guild)?;
            post(
                format!("/guilds/{guild}/prune"),
                "POST /guilds/{guild.id}/prune",
                guild,
                body,
            )
        }
        "list_bans" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/bans?limit=100"),
                "GET /guilds/{guild.id}/bans",
                guild,
            )
        }
        "ban" => {
            snow(guild)?;
            snow(user)?;
            put(
                format!("/guilds/{guild}/bans/{user}"),
                "PUT /guilds/{guild.id}/bans/{user.id}",
                guild,
                body,
            )
        }
        "unban" => {
            snow(guild)?;
            snow(user)?;
            delete(
                format!("/guilds/{guild}/bans/{user}"),
                "DELETE /guilds/{guild.id}/bans/{user.id}",
                guild,
            )
        }
        "audit_log" => {
            snow(guild)?;
            let mut path = format!("/guilds/{guild}/audit-logs?limit=50");
            if !user.is_empty() {
                snow(user)?;
                path.push_str("&user_id=");
                path.push_str(user);
            }
            if !extra.is_empty() {
                if extra.len() > 4 || !extra.chars().all(|ch| ch.is_ascii_digit()) {
                    return Err("That audit filter is not valid.".into());
                }
                path.push_str("&action_type=");
                path.push_str(extra);
            }
            get(path, "GET /guilds/{guild.id}/audit-logs", guild)
        }
        "list_emojis" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/emojis"),
                "GET /guilds/{guild.id}/emojis",
                guild,
            )
        }
        "create_emoji" => {
            snow(guild)?;
            post(
                format!("/guilds/{guild}/emojis"),
                "POST /guilds/{guild.id}/emojis",
                guild,
                body,
            )
        }
        "delete_emoji" => {
            snow(guild)?;
            snow(extra)?;
            delete(
                format!("/guilds/{guild}/emojis/{extra}"),
                "DELETE /guilds/{guild.id}/emojis/{emoji.id}",
                guild,
            )
        }
        "list_stickers" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/stickers"),
                "GET /guilds/{guild.id}/stickers",
                guild,
            )
        }
        "create_sticker" => sticker(guild, body, req),
        "delete_sticker" => {
            snow(guild)?;
            snow(extra)?;
            delete(
                format!("/guilds/{guild}/stickers/{extra}"),
                "DELETE /guilds/{guild.id}/stickers/{sticker.id}",
                guild,
            )
        }
        "list_sounds" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/soundboard-sounds"),
                "GET /guilds/{guild.id}/soundboard-sounds",
                guild,
            )
        }
        "create_sound" => {
            snow(guild)?;
            post(
                format!("/guilds/{guild}/soundboard-sounds"),
                "POST /guilds/{guild.id}/soundboard-sounds",
                guild,
                body,
            )
        }
        "delete_sound" => {
            snow(guild)?;
            snow(extra)?;
            delete(
                format!("/guilds/{guild}/soundboard-sounds/{extra}"),
                "DELETE /guilds/{guild.id}/soundboard-sounds/{sound.id}",
                guild,
            )
        }
        "list_webhooks" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/webhooks"),
                "GET /guilds/{guild.id}/webhooks",
                guild,
            )
        }
        "list_channel_webhooks" => {
            snow(channel)?;
            get(
                format!("/channels/{channel}/webhooks"),
                "GET /channels/{channel.id}/webhooks",
                channel,
            )
        }
        "create_webhook" => {
            snow(channel)?;
            post(
                format!("/channels/{channel}/webhooks"),
                "POST /channels/{channel.id}/webhooks",
                channel,
                body,
            )
        }
        "delete_webhook" => {
            snow(extra)?;
            delete(
                format!("/webhooks/{extra}"),
                "DELETE /webhooks/{webhook.id}",
                "webhooks",
            )
        }
        "list_integrations" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/integrations"),
                "GET /guilds/{guild.id}/integrations",
                guild,
            )
        }
        "delete_integration" => {
            snow(guild)?;
            snow(extra)?;
            delete(
                format!("/guilds/{guild}/integrations/{extra}"),
                "DELETE /guilds/{guild.id}/integrations/{integration.id}",
                guild,
            )
        }
        "list_followers" => {
            snow(channel)?;
            get(
                format!("/channels/{channel}/followers"),
                "GET /channels/{channel.id}/followers",
                channel,
            )
        }
        "list_automod" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/auto-moderation/rules"),
                "GET /guilds/{guild.id}/auto-moderation/rules",
                guild,
            )
        }
        "create_automod" => {
            snow(guild)?;
            post(
                format!("/guilds/{guild}/auto-moderation/rules"),
                "POST /guilds/{guild.id}/auto-moderation/rules",
                guild,
                body,
            )
        }
        "patch_automod" => {
            snow(guild)?;
            snow(extra)?;
            patch(
                format!("/guilds/{guild}/auto-moderation/rules/{extra}"),
                "PATCH /guilds/{guild.id}/auto-moderation/rules/{rule.id}",
                guild,
                body,
            )
        }
        "delete_automod" => {
            snow(guild)?;
            snow(extra)?;
            delete(
                format!("/guilds/{guild}/auto-moderation/rules/{extra}"),
                "DELETE /guilds/{guild.id}/auto-moderation/rules/{rule.id}",
                guild,
            )
        }
        "list_templates" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/templates"),
                "GET /guilds/{guild.id}/templates",
                guild,
            )
        }
        "create_template" => {
            snow(guild)?;
            post(
                format!("/guilds/{guild}/templates"),
                "POST /guilds/{guild.id}/templates",
                guild,
                body,
            )
        }
        "create_from_template" => {
            invite_code(extra)?;
            post(
                format!("/guilds/templates/{extra}"),
                "POST /guilds/templates/{code}",
                "templates",
                body,
            )
        }
        "create_guild" => post("/guilds".into(), "POST /guilds", "guilds", body),
        "get_widget" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/widget"),
                "GET /guilds/{guild.id}/widget",
                guild,
            )
        }
        "patch_widget" => {
            snow(guild)?;
            patch(
                format!("/guilds/{guild}/widget"),
                "PATCH /guilds/{guild.id}/widget",
                guild,
                body,
            )
        }
        "get_profile" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/profile"),
                "GET /guilds/{guild.id}/profile",
                guild,
            )
        }
        "patch_profile" => {
            snow(guild)?;
            patch(
                format!("/guilds/{guild}/profile"),
                "PATCH /guilds/{guild.id}/profile",
                guild,
                body,
            )
        }
        "get_verification" => {
            snow(guild)?;
            get(
                format!("/guilds/{guild}/member-verification"),
                "GET /guilds/{guild.id}/member-verification",
                guild,
            )
        }
        "patch_verification" => {
            snow(guild)?;
            patch(
                format!("/guilds/{guild}/member-verification"),
                "PATCH /guilds/{guild.id}/member-verification",
                guild,
                body,
            )
        }
        "patch_guild_settings" => {
            snow(guild)?;
            patch(
                format!("/users/@me/guilds/{guild}/settings"),
                "PATCH /users/@me/guilds/{guild.id}/settings",
                guild,
                body,
            )
        }
        "patch_dm_settings" => patch(
            "/users/@me/guilds/@me/settings".into(),
            "PATCH /users/@me/guilds/@me/settings",
            "me",
            body,
        ),
        _ => Err("Unknown server action.".into()),
    }
}

fn sticker(guild: &str, body: Option<Value>, req: &GuildAdminRequest) -> Result<BuiltCall, String> {
    snow(guild)?;
    let bytes = decode_file(&req.file_base64)?;
    let name = if req.file_name.trim().is_empty() {
        "sticker.png".into()
    } else {
        req.file_name.trim().to_string()
    };
    Ok(BuiltCall {
        method: Method::POST,
        route: "POST /guilds/{guild.id}/stickers".into(),
        major: guild.into(),
        path: format!("/guilds/{guild}/stickers"),
        body,
        file: Some(AdminUpload {
            name,
            mime: if req.file_mime.trim().is_empty() {
                "image/png".into()
            } else {
                req.file_mime.trim().into()
            },
            bytes,
        }),
        channel_shaped: false,
    })
}

fn snow(value: &str) -> Result<(), String> {
    if snowflake_ok(value) {
        Ok(())
    } else {
        Err("That id is not a Discord snowflake.".into())
    }
}

fn invite_code(value: &str) -> Result<(), String> {
    if (2..=32).contains(&value.len())
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        Ok(())
    } else {
        Err("That invite code is not valid.".into())
    }
}

fn object_body(body: &Value) -> Result<Option<Value>, String> {
    match body {
        Value::Null => Ok(None),
        Value::Object(_) => {
            if body.to_string().len() > BODY_LIMIT {
                return Err("That upload is too large.".into());
            }
            Ok(Some(body.clone()))
        }
        Value::Array(_) => Ok(None),
        _ => Err("That request body is not valid.".into()),
    }
}

fn decode_file(encoded: &str) -> Result<Vec<u8>, String> {
    let trimmed = encoded.trim();
    if trimmed.is_empty() {
        return Err("Choose a file first.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|_| "That file could not be read.".to_string())?;
    if bytes.len() > FILE_LIMIT {
        return Err("That file is too large.".into());
    }
    Ok(bytes)
}

fn query_escape(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') {
            out.push(byte as char);
        } else if byte == b' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn get(path: String, route: &str, major: &str) -> Result<BuiltCall, String> {
    Ok(plain(Method::GET, path, route, major, None))
}

fn delete(path: String, route: &str, major: &str) -> Result<BuiltCall, String> {
    Ok(plain(Method::DELETE, path, route, major, None))
}

fn post(path: String, route: &str, major: &str, body: Option<Value>) -> Result<BuiltCall, String> {
    Ok(plain(
        Method::POST,
        path,
        route,
        major,
        body.or_else(|| Some(serde_json::json!({}))),
    ))
}

fn patch(path: String, route: &str, major: &str, body: Option<Value>) -> Result<BuiltCall, String> {
    let body = body.ok_or("Nothing to save.")?;
    Ok(plain(Method::PATCH, path, route, major, Some(body)))
}

fn patch_value(path: String, route: &str, major: &str, body: Value) -> Result<BuiltCall, String> {
    Ok(plain(Method::PATCH, path, route, major, Some(body)))
}

fn put(path: String, route: &str, major: &str, body: Option<Value>) -> Result<BuiltCall, String> {
    Ok(plain(
        Method::PUT,
        path,
        route,
        major,
        body.or_else(|| Some(serde_json::json!({}))),
    ))
}

fn plain(method: Method, path: String, route: &str, major: &str, body: Option<Value>) -> BuiltCall {
    BuiltCall {
        method,
        route: route.into(),
        major: major.into(),
        path,
        body,
        file: None,
        channel_shaped: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn req(op: &str) -> GuildAdminRequest {
        GuildAdminRequest {
            op: op.into(),
            guild_id: "100000000000000001".into(),
            channel_id: "100000000000000002".into(),
            user_id: "100000000000000003".into(),
            role_id: "100000000000000004".into(),
            extra: String::new(),
            body: Value::Null,
            file_name: String::new(),
            file_mime: String::new(),
            file_base64: String::new(),
        }
    }

    #[test]
    fn routes_stay_on_discord_paths() {
        let guild = build_admin_call(&req("get_guild")).unwrap();
        assert_eq!(guild.method, Method::GET);
        assert_eq!(guild.path, "/guilds/100000000000000001?with_counts=true");
        assert!(guild.path.starts_with("/guilds/"));

        let mut create = req("create_channel");
        create.body = json!({ "name": "general", "type": 0 });
        let channel = build_admin_call(&create).unwrap();
        assert!(channel.channel_shaped);
        assert_eq!(channel.path, "/guilds/100000000000000001/channels");

        let mut invite = req("create_invite");
        invite.body = json!({ "max_age": 3600, "max_uses": 1, "temporary": true });
        let made = build_admin_call(&invite).unwrap();
        assert_eq!(made.path, "/channels/100000000000000002/invites");

        let mut settings = req("patch_guild_settings");
        settings.body = json!({ "muted": true });
        let notify = build_admin_call(&settings).unwrap();
        assert_eq!(notify.path, "/users/@me/guilds/100000000000000001/settings");
        assert_eq!(notify.method, Method::PATCH);

        let mut audit = req("audit_log");
        audit.extra = "22".into();
        let log = build_admin_call(&audit).unwrap();
        assert!(log.path.contains("action_type=22"));
        assert!(log.path.contains("user_id=100000000000000003"));

        let mut search = req("search_members");
        search.extra = "Maya".into();
        assert!(build_admin_call(&search)
            .unwrap()
            .path
            .contains("query=Maya"));

        let mut vanity = req("delete_invite");
        vanity.extra = "northwind".into();
        assert_eq!(
            build_admin_call(&vanity).unwrap().path,
            "/invites/northwind"
        );
    }

    #[test]
    fn rejects_bad_ids_and_unknown_actions() {
        let mut bad = req("get_guild");
        bad.guild_id = "../etc".into();
        assert!(build_admin_call(&bad).is_err());
        assert!(build_admin_call(&req("drop_table")).is_err());
        let mut audit = req("audit_log");
        audit.extra = "1;drop".into();
        assert!(build_admin_call(&audit).is_err());
    }

    #[test]
    fn sticker_upload_decodes_and_caps_size() {
        let mut sticker = req("create_sticker");
        sticker.body = json!({ "name": "wave", "description": "hi", "tags": "wave" });
        sticker.file_name = "wave.png".into();
        sticker.file_mime = "image/png".into();
        sticker.file_base64 = base64::engine::general_purpose::STANDARD.encode(b"png");
        let call = build_admin_call(&sticker).unwrap();
        assert_eq!(call.file.unwrap().bytes, b"png");
        sticker.file_base64 = "@@@@".into();
        assert!(build_admin_call(&sticker).is_err());
    }
}
