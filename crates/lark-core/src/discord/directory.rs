//! App Directory browse and guild install.
//! Authorize calls stay on discord.com. A custom install page is a link, and
//! the user token is never placed in that URL.

use serde::Serialize;
use serde_json::{json, Value};

use super::types::snowflake_ok;

const PAGE_SIZE: u32 = 24;
const GUILD_SCOPES: &[&str] = &[
    "bot",
    "applications.commands",
    "applications.commands.permissions.update",
];

pub const CUSTOM_INSTALL_REASON: &str = "This app uses its own install page. Lark opens it in the browser and does not send your Discord token.";
pub const ACCOUNT_SCOPE_REASON: &str = "This app asks for account access beyond adding a bot. Lark opens Discord's install page and does not send your token there.";
pub const NO_INSTALL_REASON: &str =
    "This app does not publish an in-app install. Continue in the App Directory.";
pub const UNSAFE_INSTALL_REASON: &str = "This app's install page is not a safe link. Continue in the App Directory. Lark does not send your token there.";
pub const CAPTCHA_REASON: &str =
    "Discord asked for a captcha. Lark does not solve captchas. Continue on Discord to install.";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryCategory {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryApp {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_url: String,
    pub banner_url: String,
    pub guild_count: u64,
    pub permissions: String,
    pub scopes: Vec<String>,
    pub custom_install_url: String,
    pub custom_install_blocked: bool,
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPage {
    pub apps: Vec<DirectoryApp>,
    pub page: u32,
    pub pages: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum InstallPlan {
    Authorize {
        permissions: String,
        scopes: Vec<String>,
    },
    Link {
        url: String,
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum InstallResult {
    Installed,
    Link { url: String, reason: String },
    Failed { message: String },
}

pub fn categories_path() -> &'static str {
    "/application-directory-static/categories?locale=en-US"
}

pub fn search_path(
    query: &str,
    category_id: Option<i64>,
    guild_id: Option<&str>,
    page: u32,
) -> Result<String, String> {
    let query = query.trim();
    if query.len() > 100 || query.chars().any(|ch| ch.is_control()) {
        return Err("App search needs a shorter query.".into());
    }
    let page = page.clamp(1, 1_000);
    let mut path = format!(
        "/application-directory-static/search?locale=en-US&source=1&page={page}&page_size={PAGE_SIZE}"
    );
    if !query.is_empty() {
        path.push_str("&query=");
        path.push_str(&urlencoding::encode(query));
    }
    if let Some(id) = category_id.filter(|id| (0..10_000).contains(id)) {
        path.push_str(&format!("&category_id={id}"));
    }
    if let Some(guild_id) = guild_id.map(str::trim).filter(|id| !id.is_empty()) {
        if !snowflake_ok(guild_id) {
            return Err("That server id is not valid.".into());
        }
        path.push_str(&format!("&guild_id={guild_id}"));
    }
    Ok(path)
}

pub fn authorize_path(client_id: &str, scopes: &[String]) -> Result<String, String> {
    let client_id = client_id.trim();
    if !snowflake_ok(client_id) {
        return Err("That application id is not valid.".into());
    }
    let scopes = guild_scopes(scopes);
    if scopes.is_empty() {
        return Err("That app cannot be installed from here.".into());
    }
    Ok(format!(
        "/oauth2/authorize?client_id={client_id}&response_type=code&scope={}",
        urlencoding::encode(&scopes.join(" "))
    ))
}

pub fn authorize_body(guild_id: &str, permissions: &str) -> Result<Value, String> {
    let guild_id = guild_id.trim();
    if !snowflake_ok(guild_id) {
        return Err("That server id is not valid.".into());
    }
    Ok(json!({
        "authorize": true,
        "guild_id": guild_id,
        "permissions": permission_digits(permissions),
        "integration_type": 0
    }))
}

pub fn plan_install(
    application_id: &str,
    guild_id: &str,
    permissions: &str,
    scopes: &[String],
    custom_install_url: &str,
    custom_install_blocked: bool,
) -> InstallPlan {
    let application_id = application_id.trim();
    if !snowflake_ok(application_id) {
        return InstallPlan::Link {
            url: "https://discord.com/application-directory".into(),
            reason: NO_INSTALL_REASON.into(),
        };
    }
    if custom_install_blocked || !custom_install_url.trim().is_empty() {
        if let Some(url) = external_install_url(custom_install_url) {
            return InstallPlan::Link {
                url,
                reason: CUSTOM_INSTALL_REASON.into(),
            };
        }
        return InstallPlan::Link {
            url: format!("https://discord.com/application-directory/{application_id}"),
            reason: UNSAFE_INSTALL_REASON.into(),
        };
    }
    if only_guild_scopes(scopes) && snowflake_ok(guild_id.trim()) {
        return InstallPlan::Authorize {
            permissions: permission_digits(permissions),
            scopes: guild_scopes(scopes),
        };
    }
    let reason = if scopes.iter().any(|scope| !guild_scope(scope)) && !scopes.is_empty() {
        ACCOUNT_SCOPE_REASON
    } else {
        NO_INSTALL_REASON
    };
    InstallPlan::Link {
        url: oauth_or_directory(application_id, guild_id, permissions, scopes),
        reason: reason.into(),
    }
}

pub fn interpret_install(status: u16, body: &str, fallback: &str) -> InstallResult {
    if (200..300).contains(&status) {
        return InstallResult::Installed;
    }
    let value: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    if value.get("captcha_key").is_some()
        || value.get("captcha_sitekey").is_some()
        || value
            .get("message")
            .and_then(|item| item.as_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .contains("captcha")
    {
        return InstallResult::Link {
            url: safe_discord_url(fallback),
            reason: CAPTCHA_REASON.into(),
        };
    }
    let message = value
        .get("message")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .trim();
    let message = if message.is_empty() {
        format!("Discord returned HTTP {status}.")
    } else {
        format!("Discord returned HTTP {status}. Discord said: {message}.")
    };
    InstallResult::Failed { message }
}

pub fn parse_categories(value: &Value) -> Vec<DirectoryCategory> {
    let list = value
        .as_array()
        .or_else(|| value.get("categories").and_then(|item| item.as_array()));
    let Some(list) = list else {
        return Vec::new();
    };
    list.iter().filter_map(parse_category).collect()
}

pub fn parse_page(value: &Value, page: u32) -> DirectoryPage {
    let mut apps = Vec::new();
    collect_apps(value, &mut apps);
    if let Some(results) = value.get("results") {
        collect_apps(results, &mut apps);
    }
    let pages = value
        .get("num_pages")
        .or_else(|| value.get("pages"))
        .and_then(|item| item.as_u64())
        .unwrap_or(1)
        .clamp(1, 1_000) as u32;
    DirectoryPage { apps, page, pages }
}

fn collect_apps(value: &Value, out: &mut Vec<DirectoryApp>) {
    let list = value
        .as_array()
        .or_else(|| value.get("applications").and_then(|item| item.as_array()))
        .or_else(|| value.get("hits").and_then(|item| item.as_array()));
    let Some(list) = list else {
        if let Some(app) = parse_app(value.get("data").unwrap_or(value)) {
            push_app(out, app);
        }
        return;
    };
    for item in list {
        let source = item
            .get("data")
            .or_else(|| item.get("application"))
            .unwrap_or(item);
        if let Some(app) = parse_app(source) {
            push_app(out, app);
        }
    }
}

fn push_app(out: &mut Vec<DirectoryApp>, app: DirectoryApp) {
    if out.iter().any(|item| item.id == app.id) {
        return;
    }
    out.push(app);
}

fn parse_category(value: &Value) -> Option<DirectoryCategory> {
    let id = value.get("id").and_then(|item| item.as_i64())?;
    if !(0..10_000).contains(&id) {
        return None;
    }
    let name = text(value, &["name"]);
    if name.is_empty() {
        return None;
    }
    Some(DirectoryCategory { id, name })
}

pub fn parse_app(value: &Value) -> Option<DirectoryApp> {
    let id = text(value, &["id"]);
    if !snowflake_ok(&id) {
        return None;
    }
    let name = text(value, &["name"]);
    if name.is_empty() {
        return None;
    }
    let entry = value.get("directory_entry").cloned().unwrap_or(Value::Null);
    let description = {
        let short = text(&entry, &["short_description"]);
        if short.is_empty() {
            text(value, &["description"])
        } else {
            short
        }
    };
    let install = value.get("install_params").cloned().unwrap_or(Value::Null);
    let raw_custom = text(value, &["custom_install_url"]);
    let custom_install_url = external_install_url(&raw_custom).unwrap_or_default();
    let custom_install_blocked = !raw_custom.is_empty() && custom_install_url.is_empty();
    let scopes = install
        .get("scopes")
        .and_then(|item| item.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let categories = value
        .get("categories")
        .and_then(|item| item.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(|name| name.as_str()))
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    Some(DirectoryApp {
        icon_url: icon_url(&id, &text(value, &["icon"])),
        banner_url: banner_url(&entry),
        guild_count: count(&entry, "guild_count").max(count(value, "approximate_guild_count")),
        permissions: permission_digits(&text(&install, &["permissions"])),
        custom_install_url,
        custom_install_blocked,
        id,
        name,
        description,
        scopes,
        categories,
    })
}

fn icon_url(id: &str, hash: &str) -> String {
    let bare = hash.strip_prefix("a_").unwrap_or(hash);
    if !snowflake_ok(id)
        || bare.is_empty()
        || bare.len() > 64
        || !bare.chars().all(|ch| ch.is_ascii_hexdigit())
    {
        return String::new();
    }
    let ext = if hash.starts_with("a_") { "gif" } else { "png" };
    format!("https://cdn.discordapp.com/app-icons/{id}/{hash}.{ext}?size=128")
}

fn banner_url(entry: &Value) -> String {
    let items = entry
        .get("carousel_items")
        .and_then(|item| item.as_array())
        .cloned()
        .unwrap_or_default();
    for item in items {
        for key in ["proxy_url", "url"] {
            let Some(raw) = item.get(key).and_then(|value| value.as_str()) else {
                continue;
            };
            if let Some(url) = discord_media(raw) {
                return url;
            }
        }
    }
    String::new()
}

fn discord_media(raw: &str) -> Option<String> {
    let url = reqwest::Url::parse(raw).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() {
        return None;
    }
    match url.host_str() {
        Some("cdn.discordapp.com" | "media.discordapp.net") => Some(url.to_string()),
        _ => None,
    }
}

pub fn external_install_url(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    let url = reqwest::Url::parse(raw).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() {
        return None;
    }
    let query = url.query().unwrap_or("").to_ascii_lowercase();
    if query.contains("token=") || query.contains("password=") {
        return None;
    }
    Some(url.to_string())
}

pub fn captcha_fallback(
    application_id: &str,
    guild_id: &str,
    permissions: &str,
    scopes: &[String],
) -> String {
    oauth_or_directory(application_id, guild_id, permissions, scopes)
}

fn oauth_or_directory(
    application_id: &str,
    guild_id: &str,
    permissions: &str,
    scopes: &[String],
) -> String {
    let scopes = if scopes.is_empty() {
        "bot applications.commands".to_string()
    } else {
        scopes.join(" ")
    };
    let mut url = format!(
        "https://discord.com/oauth2/authorize?client_id={application_id}&scope={}&permissions={}&disable_guild_select=true&integration_type=0",
        urlencoding::encode(&scopes),
        permission_digits(permissions)
    );
    if snowflake_ok(guild_id.trim()) {
        url.push_str("&guild_id=");
        url.push_str(guild_id.trim());
    }
    url
}

fn safe_discord_url(url: &str) -> String {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return "https://discord.com/application-directory".into();
    };
    if parsed.scheme() == "https"
        && parsed.host_str() == Some("discord.com")
        && parsed.username().is_empty()
    {
        parsed.to_string()
    } else {
        "https://discord.com/application-directory".into()
    }
}

fn only_guild_scopes(scopes: &[String]) -> bool {
    !scopes.is_empty() && scopes.iter().all(|scope| guild_scope(scope))
}

fn guild_scope(scope: &str) -> bool {
    GUILD_SCOPES.contains(&scope.trim())
}

fn guild_scopes(scopes: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for scope in scopes {
        let scope = scope.trim();
        if guild_scope(scope) && !out.iter().any(|item| item == scope) {
            out.push(scope.to_string());
        }
    }
    out
}

fn permission_digits(raw: &str) -> String {
    let raw = raw.trim();
    if !raw.is_empty() && raw.len() <= 20 && raw.chars().all(|ch| ch.is_ascii_digit()) {
        raw.to_string()
    } else {
        "0".to_string()
    }
}

fn text(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(text) = value.get(*key).and_then(|item| item.as_str()) {
            return text.trim().to_string();
        }
    }
    String::new()
}

fn count(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(|item| item.as_u64()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discord::rest::api_url;

    #[test]
    fn search_and_authorize_stay_on_discord() {
        assert!(api_url(categories_path())
            .unwrap()
            .starts_with("https://discord.com/api/v10/application-directory-static/categories"));
        let path = search_path("mod mail", Some(3), Some("100000000000000010"), 2).unwrap();
        assert!(path.starts_with("/application-directory-static/search?"));
        assert!(path.contains("query=mod%20mail"));
        assert!(path.contains("category_id=3"));
        assert!(path.contains("guild_id=100000000000000010"));
        assert!(path.contains("page=2"));
        assert!(api_url(&path).unwrap().contains("discord.com/api/"));
        assert!(search_path("x".repeat(101).as_str(), None, None, 1).is_err());
        assert!(search_path("ok", None, Some("../me"), 1).is_err());
        let authorize = authorize_path(
            "100000000000000099",
            &[
                "bot".into(),
                "applications.commands".into(),
                "identify".into(),
            ],
        )
        .unwrap();
        assert!(authorize.starts_with("/oauth2/authorize?"));
        assert!(authorize.contains("scope=bot%20applications.commands"));
        assert!(!authorize.contains("identify"));
        let body = authorize_body("100000000000000010", "8").unwrap();
        assert_eq!(body["authorize"], true);
        assert_eq!(body["permissions"], "8");
        assert_eq!(body["integration_type"], 0);
        assert!(authorize_body("nope", "8").is_err());
    }

    #[test]
    fn parses_directory_cards_and_refuses_foreign_banners() {
        let page = parse_page(
            &json!({
                "num_pages": 2,
                "results": [
                    { "type": 1, "data": {
                        "id": "100000000000000099",
                        "name": "Northbot",
                        "icon": "abc123",
                        "install_params": { "scopes": ["bot", "applications.commands"], "permissions": "2048" },
                        "categories": [{ "id": 1, "name": "Moderation" }],
                        "directory_entry": {
                            "guild_count": 1200,
                            "short_description": "Keeps the peace",
                            "carousel_items": [
                                { "url": "https://evil.example/a.png", "proxy_url": "https://cdn.discordapp.com/app-assets/1/banner.png" }
                            ]
                        }
                    }},
                    { "data": { "id": "bad", "name": "Skip" } }
                ]
            }),
            1,
        );
        assert_eq!(page.pages, 2);
        assert_eq!(page.apps.len(), 1);
        assert_eq!(page.apps[0].description, "Keeps the peace");
        assert_eq!(page.apps[0].guild_count, 1200);
        assert_eq!(page.apps[0].permissions, "2048");
        assert_eq!(
            page.apps[0].banner_url,
            "https://cdn.discordapp.com/app-assets/1/banner.png"
        );
        assert!(page.apps[0].icon_url.contains("/app-icons/"));
        assert!(page.apps[0].custom_install_url.is_empty());
    }

    #[test]
    fn install_plans_keep_the_token_off_link_outs() {
        let bot = plan_install(
            "100000000000000099",
            "100000000000000010",
            "2048",
            &["bot".into(), "applications.commands".into()],
            "",
            false,
        );
        assert!(matches!(bot, InstallPlan::Authorize { .. }));
        match plan_install(
            "100000000000000099",
            "100000000000000010",
            "0",
            &["bot".into()],
            "https://example.com/install",
            false,
        ) {
            InstallPlan::Link { url, reason } => {
                assert_eq!(url, "https://example.com/install");
                assert!(reason.contains("does not send your Discord token"));
            }
            other => panic!("expected link, got {other:?}"),
        }
        match plan_install(
            "100000000000000099",
            "100000000000000010",
            "0",
            &["bot".into()],
            "http://example.com/install",
            true,
        ) {
            InstallPlan::Link { url, reason } => {
                assert_eq!(
                    url,
                    "https://discord.com/application-directory/100000000000000099"
                );
                assert!(reason.contains("not a safe link"));
            }
            other => panic!("expected link, got {other:?}"),
        }
        match plan_install(
            "100000000000000099",
            "100000000000000010",
            "0",
            &["bot".into(), "identify".into()],
            "",
            false,
        ) {
            InstallPlan::Link { url, reason } => {
                assert!(url.starts_with("https://discord.com/oauth2/authorize?"));
                assert!(!url.contains("token"));
                assert!(reason.contains("account access"));
            }
            other => panic!("expected link, got {other:?}"),
        }
        match interpret_install(
            400,
            r#"{"captcha_key":["captcha-required"]}"#,
            "https://discord.com/oauth2/authorize?client_id=1",
        ) {
            InstallResult::Link { url, reason } => {
                assert!(url.starts_with("https://discord.com/"));
                assert!(reason.contains("captcha"));
            }
            other => panic!("expected captcha link, got {other:?}"),
        }
        assert!(matches!(
            interpret_install(200, r#"{"location":"https://example.com/cb?code=1"}"#, ""),
            InstallResult::Installed
        ));
        assert!(external_install_url("https://user:secret@example.com/install").is_none());
        assert!(external_install_url("https://example.com/install?token=abc").is_none());
    }
}
