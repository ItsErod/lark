//! Which pages the Discord login window is allowed to open, and what to tell the user
//! while that window is still waiting for a session token.

pub fn navigation_allowed(url: &str) -> bool {
    let Some((scheme, rest)) = url.split_once(':') else {
        return false;
    };
    if scheme.eq_ignore_ascii_case("about") {
        return rest == "blank" || rest.starts_with("blank?");
    }
    if !scheme.eq_ignore_ascii_case("https") {
        return false;
    }
    let Some(host) = https_host(url) else {
        return false;
    };
    allowed_https_host(host)
}

pub fn logged_in_discord_url(url: &str) -> bool {
    if !navigation_allowed(url) {
        return false;
    }
    let Some(host) = https_host(url) else {
        return false;
    };
    if !is_discord_host(host) {
        return false;
    }
    let path = url_path(url);
    APP_PREFIXES.iter().any(|prefix| has_prefix(path, prefix))
}

/// How long the app URL may stay open before the login window reports that no token appeared.
pub const LOGIN_APP_WAIT_MS: u64 = 180_000;

pub const LOGIN_TIMEOUT_DETAIL: &str = "Discord's app stayed open, but no session token appeared. Finish any code or captcha in that window. Lark will keep checking until you close it.";

pub struct LoginProgress {
    pub phase: &'static str,
    pub detail: &'static str,
}

/// `app_visible_for_ms` is how long a logged-in Discord URL has been open.
/// The failure is held back until that wait has passed, so password, captcha, and 2FA are not treated as a missing token.
pub fn login_progress(url: &str, app_visible_for_ms: Option<u64>) -> LoginProgress {
    if app_visible_for_ms.unwrap_or(0) >= LOGIN_APP_WAIT_MS {
        return LoginProgress {
            phase: "failed",
            detail: LOGIN_TIMEOUT_DETAIL,
        };
    }
    LoginProgress {
        phase: "waiting",
        detail: login_wait_message(url),
    }
}

/// WebView2's `ExecuteScript` returns `0x8007139F` (`ERROR_INVALID_STATE`) while a
/// document is navigating or the controller is closing. The login poll must not
/// call into the webview in those states; the next finished load is soon enough.
pub fn login_script_allowed(document_ready: bool, navigating: bool, closing: bool) -> bool {
    document_ready && !navigating && !closing
}

pub fn login_wait_message(url: &str) -> &'static str {
    let Some(host) = https_host(url) else {
        return "Waiting for Discord's login window.";
    };
    if is_captcha_host(host) {
        return "Finish the captcha in Discord's window. Lark will keep waiting for the session.";
    }
    if !is_discord_host(host) {
        return "Waiting for Discord's login window.";
    }
    let path = url_path(url);
    if has_prefix(path, "/oauth2") || has_prefix(path, "/authorize") {
        return "Discord asked for a confirmation. Finish it in the login window, including any captcha.";
    }
    if logged_in_discord_url(url) {
        return "Discord's app is open. Finish any code or captcha there. Lark is waiting for the session token.";
    }
    if is_login_path(path) {
        return "Finish password, captcha, and 2FA in Discord's window. Lark is waiting for the session.";
    }
    "Waiting for Discord to finish signing in."
}

const APP_PREFIXES: &[&str] = &[
    "/channels",
    "/app",
    "/library",
    "/store",
    "/discovery",
    "/shop",
    "/activities",
    "/message",
    "/gift",
    "/billing",
    "/settings",
    "/nitro",
    "/quest-home",
    "/users",
];

fn https_host(url: &str) -> Option<&str> {
    let rest = url.split_once("://")?.1;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

fn url_path(url: &str) -> &str {
    let Some(rest) = url.split_once("://").map(|(_, rest)| rest) else {
        return "";
    };
    let Some(start) = rest.find('/') else {
        return "/";
    };
    let path = &rest[start..];
    path.split(['?', '#']).next().unwrap_or(path)
}

fn allowed_https_host(host: &str) -> bool {
    host_matches(host, "discord.com")
        || host_matches(host, "discordapp.com")
        || host_matches(host, "discordapp.net")
        || host_matches(host, "hcaptcha.com")
        || host_matches(host, "recaptcha.net")
        || host_matches(host, "google.com")
        || host_matches(host, "gstatic.com")
        || host_matches(host, "cloudflare.com")
}

fn is_discord_host(host: &str) -> bool {
    host_matches(host, "discord.com") || host_matches(host, "discordapp.com")
}

fn is_captcha_host(host: &str) -> bool {
    host_matches(host, "hcaptcha.com")
        || host_matches(host, "recaptcha.net")
        || host_matches(host, "google.com")
        || host_matches(host, "gstatic.com")
        || host_matches(host, "cloudflare.com")
}

fn has_prefix(path: &str, prefix: &str) -> bool {
    path == prefix || path.starts_with(&format!("{prefix}/"))
}

fn is_login_path(path: &str) -> bool {
    path.is_empty()
        || path == "/"
        || has_prefix(path, "/login")
        || has_prefix(path, "/mfa")
        || has_prefix(path, "/verify")
        || has_prefix(path, "/reset")
        || has_prefix(path, "/register")
        || has_prefix(path, "/invite")
}

fn host_matches(host: &str, root: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == root || host.ends_with(&format!(".{root}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_window_allows_discord_and_captcha_only() {
        assert!(navigation_allowed("https://discord.com/login"));
        assert!(navigation_allowed("https://discord.com/channels/@me"));
        assert!(navigation_allowed(
            "https://newassets.hcaptcha.com/captcha/v1/api.js"
        ));
        assert!(navigation_allowed(
            "https://www.google.com/recaptcha/api2/anchor"
        ));
        assert!(navigation_allowed(
            "https://challenges.cloudflare.com/cdn-cgi/challenge"
        ));
        assert!(navigation_allowed("about:blank"));
        assert!(!navigation_allowed("http://discord.com/login"));
        assert!(!navigation_allowed("https://evil.example/discord.com"));
        assert!(!navigation_allowed(
            "https://discord.com.evil.example/login"
        ));
        assert!(!navigation_allowed("javascript:alert(1)"));
        assert!(!navigation_allowed("https://user:token@evil.example/"));
    }

    #[test]
    fn token_is_read_only_on_a_logged_in_discord_page() {
        assert!(logged_in_discord_url("https://discord.com/channels/@me"));
        assert!(logged_in_discord_url("https://ptb.discord.com/app?fake=1"));
        assert!(logged_in_discord_url("https://canary.discord.com/library"));
        assert!(!logged_in_discord_url("https://discord.com/login"));
        assert!(!logged_in_discord_url(
            "https://discord.com/oauth2/authorize"
        ));
        assert!(!logged_in_discord_url(
            "https://newassets.hcaptcha.com/channels/@me"
        ));
        assert!(!logged_in_discord_url("http://discord.com/channels/@me"));
        assert!(logged_in_discord_url(
            "https://discord.com/discovery/servers"
        ));
        assert!(logged_in_discord_url("https://discord.com/activities"));
        assert!(logged_in_discord_url("https://discordapp.com/channels/@me"));
        assert!(!logged_in_discord_url("https://discord.com/apple"));
    }

    #[test]
    fn login_status_follows_the_page_and_waits_out_2fa() {
        let login = login_wait_message("https://discord.com/login");
        let mfa = login_wait_message("https://discord.com/mfa");
        let captcha = login_wait_message("https://newassets.hcaptcha.com/captcha/v1/api.js");
        let oauth = login_wait_message("https://discord.com/oauth2/authorize?client_id=1");
        let app = login_wait_message("https://discord.com/channels/@me");
        assert!(login.contains("2FA"));
        assert!(mfa.contains("2FA"));
        assert!(captcha.to_ascii_lowercase().contains("captcha"));
        assert!(oauth.to_ascii_lowercase().contains("confirmation"));
        assert!(app.to_ascii_lowercase().contains("session token"));
        assert_ne!(login, app);
        assert_ne!(captcha, oauth);

        assert!(!login_script_allowed(false, false, false));
        assert!(!login_script_allowed(true, true, false));
        assert!(!login_script_allowed(true, false, true));
        assert!(login_script_allowed(true, false, false));

        let early = login_progress("https://discord.com/channels/@me", Some(0));
        assert_eq!(early.phase, "waiting");
        let before_app = login_progress("https://discord.com/login", None);
        assert_eq!(before_app.phase, "waiting");
        assert!(before_app.detail.contains("2FA"));
        let timed_out = login_progress("https://discord.com/app", Some(LOGIN_APP_WAIT_MS));
        assert_eq!(timed_out.phase, "failed");
        assert!(timed_out.detail.contains("no session token"));
        assert!(
            timed_out.detail.contains("2FA")
                || timed_out.detail.to_ascii_lowercase().contains("captcha")
        );
    }
}
