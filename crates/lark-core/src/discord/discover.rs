//! Request builders for Discord's server discovery endpoints.
//! Paths stay on the API. Image URLs stay on Discord's CDN.

use serde::Serialize;
use serde_json::{json, Value};

use super::shell::invite_code_ok;
use super::types::snowflake_ok;

const PAGE: u32 = 24;
pub const CAPTCHA_REASON: &str =
    "Discord asked for a captcha. Lark does not solve captchas. Continue on Discord to join.";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverCategory {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverGuild {
    pub id: String,
    pub name: String,
    pub description: String,
    pub banner_url: String,
    pub icon_url: String,
    pub members: u64,
    pub online: u64,
    pub vanity: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverPage {
    pub guilds: Vec<DiscoverGuild>,
    pub total: u64,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum DiscoverJoin {
    Joined { guild_id: String },
    Captcha { url: String, reason: String },
    Failed { message: String },
}

#[derive(Debug, Clone, PartialEq)]
pub enum JoinOutcome {
    Joined,
    Captcha { url: String },
    Failed { message: String },
}

pub fn categories_path() -> &'static str {
    "/discovery/categories?locale=en-US&primary_only=true"
}

pub fn guilds_path(query: &str, category_id: Option<i64>, offset: u32) -> Result<String, String> {
    let query = query.trim();
    if query.len() > 100 || query.chars().any(|ch| ch.is_control()) {
        return Err("Discovery search needs a shorter query.".into());
    }
    let offset = offset.min(2_999);
    let category = category_id.filter(|id| (0..10_000).contains(id));
    if query.is_empty() {
        let mut path = format!("/discoverable-guilds?limit={PAGE}&offset={offset}");
        if let Some(id) = category {
            path.push_str(&format!("&categories={id}"));
        }
        return Ok(path);
    }
    let mut path = format!(
        "/discoverable-guilds/search?limit={PAGE}&offset={offset}&query={}",
        urlencoding::encode(query)
    );
    if let Some(id) = category {
        path.push_str(&format!("&category_id={id}"));
    }
    Ok(path)
}

pub fn preview_path(guild_id: &str) -> Result<String, String> {
    let guild_id = guild_id.trim();
    if !snowflake_ok(guild_id) {
        return Err("That server id is not valid.".into());
    }
    Ok(format!("/guilds/{guild_id}/preview"))
}

pub fn join_path(guild_id: &str) -> Result<String, String> {
    let guild_id = guild_id.trim();
    if !snowflake_ok(guild_id) {
        return Err("That server id is not valid.".into());
    }
    Ok(format!("/guilds/{guild_id}/members/@me"))
}

pub fn join_body() -> Value {
    json!({ "lurker": false })
}

pub fn fallback_url(vanity: &str) -> String {
    let vanity = vanity.trim();
    if invite_code_ok(vanity) {
        format!("https://discord.com/invite/{vanity}")
    } else {
        "https://discord.com/discovery".to_string()
    }
}

pub fn interpret_join(status: u16, body: &str, vanity: &str) -> JoinOutcome {
    if (200..300).contains(&status) {
        return JoinOutcome::Joined;
    }
    let value: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    if captcha_body(&value) {
        return JoinOutcome::Captcha {
            url: fallback_url(vanity),
        };
    }
    let message = value
        .get("message")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .trim();
    let lower = message.to_ascii_lowercase();
    if lower.contains("already") && lower.contains("member") {
        return JoinOutcome::Joined;
    }
    let message = if message.is_empty() {
        format!("Discord returned HTTP {status}.")
    } else {
        format!("Discord returned HTTP {status}. Discord said: {message}.")
    };
    JoinOutcome::Failed { message }
}

pub fn parse_categories(value: &Value) -> Vec<DiscoverCategory> {
    let list = value
        .as_array()
        .or_else(|| value.get("categories").and_then(|item| item.as_array()));
    let Some(list) = list else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in list {
        let Some(id) = item.get("id").and_then(|value| value.as_i64()) else {
            continue;
        };
        if !(0..10_000).contains(&id) {
            continue;
        }
        let name = item
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if name.is_empty()
            || item.get("is_primary").and_then(|value| value.as_bool()) == Some(false)
        {
            continue;
        }
        out.push(DiscoverCategory {
            id,
            name: name.to_string(),
        });
    }
    out
}

pub fn parse_page(value: &Value, offset: u32) -> DiscoverPage {
    let listed = value
        .get("guilds")
        .and_then(|item| item.as_array())
        .or_else(|| value.as_array());
    let guilds = listed
        .map(|items| items.iter().filter_map(parse_guild).collect::<Vec<_>>())
        .unwrap_or_default();
    let total = value
        .get("total")
        .and_then(|item| item.as_u64())
        .unwrap_or(u64::from(offset) + guilds.len() as u64);
    DiscoverPage {
        guilds,
        total,
        offset,
    }
}

pub fn parse_guild(value: &Value) -> Option<DiscoverGuild> {
    let id = text_field(value, &["id"]);
    if !snowflake_ok(&id) {
        return None;
    }
    let name = text_field(value, &["name"]).trim().to_string();
    if name.is_empty() {
        return None;
    }
    let description = text_field(value, &["description"]).trim().to_string();
    let vanity = text_field(value, &["vanity_url_code"]);
    let vanity = if invite_code_ok(&vanity) {
        vanity
    } else {
        String::new()
    };
    Some(DiscoverGuild {
        banner_url: banner_url(&id, value),
        icon_url: icon_url(
            &id,
            value
                .get("icon")
                .and_then(|item| item.as_str())
                .unwrap_or(""),
        ),
        members: count_field(value, &["approximate_member_count", "member_count"]),
        online: count_field(value, &["approximate_presence_count", "online_count"]),
        id,
        name,
        description,
        vanity,
    })
}

pub fn banner_url(guild_id: &str, value: &Value) -> String {
    for (field, kind) in [
        ("discovery_splash", "discovery-splashes"),
        ("custom_banner_hash", "discovery-splashes"),
        ("banner", "banners"),
        ("splash", "splashes"),
    ] {
        let Some(hash) = value.get(field).and_then(|item| item.as_str()) else {
            continue;
        };
        if let Some(url) = cdn_asset(kind, guild_id, hash, 480) {
            return url;
        }
    }
    String::new()
}

pub fn icon_url(guild_id: &str, hash: &str) -> String {
    cdn_asset("icons", guild_id, hash, 128).unwrap_or_default()
}

fn cdn_asset(kind: &str, guild_id: &str, hash: &str, size: u16) -> Option<String> {
    if !snowflake_ok(guild_id) || !asset_hash_ok(hash) || kind.contains('/') {
        return None;
    }
    let ext = if hash.starts_with("a_") { "gif" } else { "png" };
    Some(format!(
        "https://cdn.discordapp.com/{kind}/{guild_id}/{hash}.{ext}?size={size}"
    ))
}

fn asset_hash_ok(hash: &str) -> bool {
    let bare = hash.strip_prefix("a_").unwrap_or(hash);
    (1..=64).contains(&bare.len()) && bare.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn captcha_body(value: &Value) -> bool {
    value.get("captcha_key").is_some()
        || value.get("captcha_sitekey").is_some()
        || value
            .get("message")
            .and_then(|item| item.as_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .contains("captcha")
}

fn text_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(text) = value.get(*key).and_then(|item| item.as_str()) {
            return text.trim().to_string();
        }
    }
    String::new()
}

fn count_field(value: &Value, keys: &[&str]) -> u64 {
    for key in keys {
        if let Some(count) = value.get(*key).and_then(|item| item.as_u64()) {
            return count;
        }
        if let Some(count) = value.get(*key).and_then(|item| item.as_i64()) {
            return count.max(0) as u64;
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discord::rest::api_url;

    #[test]
    fn builders_stay_on_discord_discovery_routes() {
        assert_eq!(
            api_url(categories_path()).unwrap(),
            "https://discord.com/api/v10/discovery/categories?locale=en-US&primary_only=true"
        );
        let listed = guilds_path("", Some(1), 24).unwrap();
        assert_eq!(
            listed,
            "/discoverable-guilds?limit=24&offset=24&categories=1"
        );
        assert!(api_url(&listed)
            .unwrap()
            .starts_with("https://discord.com/api/v10/"));
        let searched = guilds_path("north wind", Some(4), 9_999).unwrap();
        assert!(searched.starts_with("/discoverable-guilds/search?"));
        assert!(searched.contains("query=north%20wind"));
        assert!(searched.contains("category_id=4"));
        assert!(searched.contains("offset=2999"));
        assert!(guilds_path("x".repeat(101).as_str(), None, 0).is_err());
        assert!(guilds_path("bad\nquery", None, 0).is_err());
        assert_eq!(
            preview_path("100000000000000010").unwrap(),
            "/guilds/100000000000000010/preview"
        );
        assert!(preview_path("../me").is_err());
        assert_eq!(
            join_path("100000000000000010").unwrap(),
            "/guilds/100000000000000010/members/@me"
        );
        assert_eq!(join_body()["lurker"], false);
    }

    #[test]
    fn cards_use_the_discovery_splash_and_drop_bad_assets() {
        let page = parse_page(
            &json!({
                "total": 40,
                "guilds": [
                    {
                        "id": "100000000000000010",
                        "name": "Northwind",
                        "description": "A quiet server",
                        "discovery_splash": "aabbcc",
                        "banner": "ddeeff",
                        "icon": "112233",
                        "approximate_member_count": 1200,
                        "approximate_presence_count": 40,
                        "vanity_url_code": "northwind"
                    },
                    { "id": "nope", "name": "Skip" },
                    { "id": "100000000000000011", "name": "  " }
                ]
            }),
            0,
        );
        assert_eq!(page.total, 40);
        assert_eq!(page.guilds.len(), 1);
        assert_eq!(
            page.guilds[0].banner_url,
            "https://cdn.discordapp.com/discovery-splashes/100000000000000010/aabbcc.png?size=480"
        );
        assert_eq!(
            page.guilds[0].icon_url,
            "https://cdn.discordapp.com/icons/100000000000000010/112233.png?size=128"
        );
        assert_eq!(page.guilds[0].members, 1200);
        assert_eq!(page.guilds[0].vanity, "northwind");
        let animated = icon_url("100000000000000010", "a_ff00");
        assert!(animated.ends_with(".gif?size=128"));
        assert!(icon_url("100000000000000010", "../x").is_empty());
        assert!(banner_url(
            "100000000000000010",
            &json!({"banner": "not a hash", "splash": "abc"})
        )
        .contains("/splashes/"));
        let categories = parse_categories(&json!([
            { "id": 1, "name": "Gaming", "is_primary": true },
            { "id": 9, "name": "Hidden", "is_primary": false },
            { "id": -1, "name": "Nope" }
        ]));
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].name, "Gaming");
    }

    #[test]
    fn join_reports_captcha_without_leaving_a_token_in_the_link() {
        assert_eq!(interpret_join(201, "{}", "northwind"), JoinOutcome::Joined);
        assert_eq!(
            interpret_join(400, r#"{"message":"You are already a member"}"#, ""),
            JoinOutcome::Joined
        );
        match interpret_join(
            400,
            r#"{"captcha_key":["captcha-required"],"captcha_sitekey":"site"}"#,
            "northwind",
        ) {
            JoinOutcome::Captcha { url } => {
                assert_eq!(url, "https://discord.com/invite/northwind");
                assert!(!url.contains("token"));
            }
            other => panic!("expected captcha, got {other:?}"),
        }
        match interpret_join(403, r#"{"message":"Banned"}"#, "../evil") {
            JoinOutcome::Failed { message } => assert!(message.contains("Banned")),
            other => panic!("expected failure, got {other:?}"),
        }
        assert_eq!(fallback_url("no spaces"), "https://discord.com/discovery");
        let wire = serde_json::to_value(DiscoverJoin::Captcha {
            url: "https://discord.com/discovery".into(),
            reason: CAPTCHA_REASON.into(),
        })
        .unwrap();
        assert_eq!(wire["kind"], "captcha");
        assert!(wire["url"]
            .as_str()
            .unwrap()
            .starts_with("https://discord.com/"));
    }
}
