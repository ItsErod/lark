//! Which pages the Discord login window is allowed to open.
//! The token is read only after Discord itself has navigated to a logged-in app URL.

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
    path.starts_with("/channels")
        || path.starts_with("/app")
        || path.starts_with("/library")
        || path.starts_with("/store")
}

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
    host_matches(host, "discord.com")
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
    }
}
