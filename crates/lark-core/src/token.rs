//! User-token cleanup. The result is what Lark stores and sends to Discord.
//! Errors never include the pasted value.

const MAX_LEN: usize = 400;

pub fn normalize_user_token(raw: &str) -> Result<String, String> {
    let mut text = strip_invisible(raw);
    text = unwrap_layers(text.trim());
    text = strip_authorization_label(&text);
    text = unwrap_layers(text.trim());

    let lower = text.to_ascii_lowercase();
    if lower.starts_with("bot ") || lower == "bot" {
        return Err(
            "That is a bot token. Lark needs the user session from a Discord login, not a bot token from the developer portal."
                .into(),
        );
    }
    if lower.starts_with("bearer ") || lower == "bearer" {
        return Err(
            "That is an OAuth bearer token. Discord's OAuth2 consent screen cannot grant the user session a full client needs. Use Sign in with Discord, the QR code, or paste the user token."
                .into(),
        );
    }

    let mut compact = String::with_capacity(text.len());
    for ch in text.chars() {
        if !ch.is_whitespace() {
            compact.push(ch);
        }
    }
    if compact.is_empty() {
        return Err("The token is empty.".into());
    }
    if compact.len() > MAX_LEN {
        return Err(format!(
            "That value is {} characters, which is longer than a Discord user token.",
            compact.len()
        ));
    }
    if !compact
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err(
            "That doesn't look like a Discord user token. Quotes, labels, and line breaks are removed automatically. What remains still has unexpected characters."
                .into(),
        );
    }
    if !plausible_user_token(&compact) {
        return Err(
            "That doesn't look like a Discord user token. It should be the three-part session token, or an mfa. token, from a request you made while logged in."
                .into(),
        );
    }
    Ok(compact)
}

fn strip_invisible(raw: &str) -> String {
    raw.chars()
        .filter(|ch| !matches!(ch, '\u{feff}' | '\u{200b}' | '\u{200c}' | '\u{200d}'))
        .collect()
}

fn unwrap_layers(input: &str) -> String {
    let mut text = input.trim().to_string();
    for _ in 0..3 {
        if let Some(parsed) = json_string(&text) {
            text = parsed.trim().to_string();
            continue;
        }
        let trimmed = text.trim();
        let bytes = trimmed.as_bytes();
        if bytes.len() >= 2 {
            let (open, close) = (bytes[0], bytes[bytes.len() - 1]);
            if (open == b'"' && close == b'"') || (open == b'\'' && close == b'\'') {
                text = trimmed[1..trimmed.len() - 1].trim().to_string();
                continue;
            }
        }
        text = trimmed.to_string();
        break;
    }
    text
}

fn json_string(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if !trimmed.starts_with('"') {
        return None;
    }
    serde_json::from_str::<String>(trimmed).ok()
}

fn strip_authorization_label(text: &str) -> String {
    let trimmed = text.trim();
    let lower = trimmed.to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("authorization:") else {
        return trimmed.to_string();
    };
    trimmed[trimmed.len() - rest.len()..].trim().to_string()
}

fn plausible_user_token(token: &str) -> bool {
    if let Some(rest) = token.strip_prefix("mfa.") {
        return rest.len() >= 20 && !rest.contains('.');
    }
    let mut parts = token.split('.');
    let Some(first) = parts.next() else {
        return false;
    };
    let Some(second) = parts.next() else {
        return false;
    };
    let Some(third) = parts.next() else {
        return false;
    };
    parts.next().is_none() && first.len() >= 4 && second.len() >= 4 && third.len() >= 4
}

/// Reads the session token out of Discord's page. It does not send the value anywhere.
/// Discord hides `localStorage.getItem('token')` on the main window, so the script
/// also asks a fresh iframe, sessionStorage, other storage keys, and the app's getToken().
pub const READ_SESSION_JS: &str = concat!(
    include_str!("discord/read_session.js"),
    "\nreadLarkSession()"
);

#[cfg(test)]
mod tests {
    use super::*;

    const USER: &str = "MTIzNDU2Nzg5.QUJDREVGR0g.a1b2c3d4e5f6g7h8";
    const MFA: &str = "mfa.abcdefghijklmnopqrstuvwxyz0123456789";

    #[test]
    fn strips_quotes_whitespace_and_the_authorization_label() {
        assert_eq!(normalize_user_token(&format!("  {USER}\n")).unwrap(), USER);
        assert_eq!(normalize_user_token(&format!("\"{USER}\"")).unwrap(), USER);
        assert_eq!(normalize_user_token(&format!("'{USER}'")).unwrap(), USER);
        assert_eq!(
            normalize_user_token(&format!("Authorization: {USER}")).unwrap(),
            USER
        );
        assert_eq!(
            normalize_user_token(&format!("\u{feff}\"{USER}\"")).unwrap(),
            USER
        );
        let wrapped = serde_json::to_string(&format!("\"{USER}\"")).unwrap();
        assert_eq!(normalize_user_token(&wrapped).unwrap(), USER);
        let broken = USER.replace('.', ". \n");
        assert_eq!(normalize_user_token(&broken).unwrap(), USER);
        assert_eq!(normalize_user_token(MFA).unwrap(), MFA);
    }

    #[test]
    fn rejects_bot_oauth_and_garbage_without_echoing_the_value() {
        let bot = format!("Bot {USER}");
        let bot_err = normalize_user_token(&bot).unwrap_err();
        assert!(bot_err.contains("bot token"));
        assert!(!bot_err.contains(USER));

        let bearer = format!("Bearer {USER}");
        let bearer_err = normalize_user_token(&bearer).unwrap_err();
        assert!(bearer_err.to_ascii_lowercase().contains("oauth"));
        assert!(!bearer_err.contains(USER));

        let garbage = "not a token at all !!!";
        let err = normalize_user_token(garbage).unwrap_err();
        assert!(err.contains("doesn't look like"));
        assert!(!err.contains("!!!"));
        assert!(normalize_user_token("").is_err());
        assert!(normalize_user_token("   ").is_err());
        assert!(normalize_user_token(&"a".repeat(401)).is_err());
    }

    #[test]
    fn session_script_reads_storage_without_network() {
        let script = READ_SESSION_JS.to_ascii_lowercase();
        assert!(script.trim_end().ends_with("readlarksession()"));
        assert!(script.contains("localstorage"));
        assert!(script.contains("sessionstorage"));
        assert!(script.contains("storage.prototype") || script.contains(".prototype"));
        assert!(script.contains("iframe"));
        assert!(script.contains("gettoken"));
        assert!(script.contains("webpackchunkdiscord_app"));
        assert!(!script.contains("fetch("));
        assert!(!script.contains("xmlhttprequest"));
        assert!(!script.contains("http://"));
        assert!(!script.contains("https://"));
        assert!(!script.contains("websocket"));
    }
}
