//! Official public profile pages. The id is checked here, then the URL is built.
//! Steam's community XML is the only request. Overwatch is opened, not downloaded.

use std::time::Duration;

const STEAM: &str = "steamcommunity.com";
const OVERWATCH: &str = "overwatch.blizzard.com";

pub fn steam_page_url(id: &str) -> Result<String, String> {
    let id = id.trim();
    if is_steam64(id) {
        return Ok(format!("https://{STEAM}/profiles/{id}"));
    }
    if is_vanity(id) {
        return Ok(format!("https://{STEAM}/id/{id}"));
    }
    Err("That is not a public Steam id.".into())
}

pub fn steam_xml_url(id: &str) -> Result<String, String> {
    Ok(format!("{}?xml=1", steam_page_url(id)?))
}

pub fn overwatch_url(input: &str) -> Result<String, String> {
    let raw = input.trim();
    if raw.len() < 32
        || raw.len() > 200
        || raw
            .chars()
            .any(|ch| ch.is_control() || ch == '"' || ch == '\'')
    {
        return Err("Paste a public career link from overwatch.blizzard.com.".into());
    }
    let Some(rest) = raw.strip_prefix("https://overwatch.blizzard.com") else {
        return Err("Paste a public career link from overwatch.blizzard.com.".into());
    };
    if rest.contains('?')
        || rest.contains('#')
        || rest.contains('@')
        || rest.contains("..")
        || rest.contains('\\')
    {
        return Err("Paste a public career link from overwatch.blizzard.com.".into());
    }
    let raw_path = if rest.is_empty() {
        "/".to_string()
    } else {
        rest.to_string()
    };
    let Some(path) = decode_bar(&raw_path) else {
        return Err("Paste a public career link from overwatch.blizzard.com.".into());
    };
    if !career_path(&path) {
        return Err("Paste a public career link from overwatch.blizzard.com.".into());
    }
    let pathname = if path.ends_with('/') {
        path
    } else {
        format!("{path}/")
    };
    Ok(format!("https://{OVERWATCH}{pathname}"))
}

pub fn public_page_url(kind: &str, id: &str) -> Result<String, String> {
    match kind {
        "steam" => steam_page_url(id),
        "overwatch" => overwatch_url(id),
        _ => Err("That lookup is not available.".into()),
    }
}

pub async fn read_steam_profile(id: &str) -> Result<String, String> {
    let url = steam_xml_url(id)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| "Couldn't reach Steam.".to_string())?;
    let response = client
        .get(&url)
        .header("user-agent", concat!("Lark/", env!("CARGO_PKG_VERSION")))
        .send()
        .await
        .map_err(|_| "Steam did not answer.".to_string())?;
    if !response.status().is_success() {
        return Err("That Steam profile is not public.".into());
    }
    if response.content_length().is_some_and(|len| len > 65_536) {
        return Err("That profile page is too large.".into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "The profile stopped.".to_string())?;
    if bytes.len() > 65_536 {
        return Err("That profile page is too large.".into());
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "Steam sent an unexpected page.".to_string())
}

fn is_steam64(id: &str) -> bool {
    id.len() == 17 && id.starts_with("7656119") && id.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_vanity(id: &str) -> bool {
    (2..=32).contains(&id.len())
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn career_path(path: &str) -> bool {
    let Some(rest) = path.strip_prefix('/') else {
        return false;
    };
    let mut parts = rest.split('/');
    let locale = parts.next().unwrap_or("");
    if !locale_ok(locale) || parts.next() != Some("career") {
        return false;
    }
    let id = parts.next().unwrap_or("");
    if id.len() < 8 || id.len() > 80 || !id.bytes().all(career_byte) {
        return false;
    }
    matches!(parts.next(), None | Some(""))
}

fn locale_ok(locale: &str) -> bool {
    let mut parts = locale.split('-');
    let language = parts.next().unwrap_or("");
    let region = parts.next().unwrap_or("");
    parts.next().is_none()
        && language.len() == 2
        && region.len() == 2
        && language.bytes().all(|byte| byte.is_ascii_lowercase())
        && region.bytes().all(|byte| byte.is_ascii_lowercase())
}

fn career_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-' || byte == b'|'
}

/// `%7C` is the encoded bar in a Blizzard career id. Every other percent encoding is refused.
fn decode_bar(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut out = String::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 3 > bytes.len() {
                return None;
            }
            let hex = &path[index + 1..index + 3];
            if !hex.eq_ignore_ascii_case("7C") {
                return None;
            }
            out.push('|');
            index += 3;
            continue;
        }
        out.push(bytes[index] as char);
        index += 1;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_ids_stay_on_steamcommunity() {
        assert_eq!(
            steam_page_url("76561198000000000").unwrap(),
            "https://steamcommunity.com/profiles/76561198000000000"
        );
        assert_eq!(
            steam_xml_url("gaben").unwrap(),
            "https://steamcommunity.com/id/gaben?xml=1"
        );
        assert!(steam_page_url("../etc").is_err());
        assert!(steam_page_url("a").is_err());
        assert!(public_page_url("tracker", "gaben").is_err());
    }

    #[test]
    fn overwatch_links_stay_on_the_career_host() {
        let career = "https://overwatch.blizzard.com/en-us/career/abc12345def/";
        assert_eq!(overwatch_url(career).unwrap(), career);
        assert!(overwatch_url("https://tracker.gg/overwatch").is_err());
        assert!(overwatch_url("https://api.deadlock-api.com/v1/players/1").is_err());
        assert!(overwatch_url("https://my.callofduty.com/api/papi-client/stats").is_err());
        assert!(overwatch_url("http://overwatch.blizzard.com/en-us/career/abc12345def/").is_err());
        assert_eq!(
            overwatch_url("https://overwatch.blizzard.com/en-us/career/abc12345%7Cdef67890/")
                .unwrap(),
            "https://overwatch.blizzard.com/en-us/career/abc12345|def67890/"
        );
        assert!(
            overwatch_url("https://overwatch.blizzard.com/en-us/career/abc12345%2e%2e/").is_err()
        );
    }
}
