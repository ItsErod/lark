use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::platform;

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("could not parse config: {0}")]
    Parse(#[from] toml::de::Error),
    #[error("invalid shortcut for {key}: {reason}")]
    Shortcut { key: String, reason: String },
    #[error("theme name must be a short lowercase slug (letters, numbers, hyphens)")]
    Theme,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "snake_case")]
pub struct Config {
    pub appearance: Appearance,
    pub shortcuts: Shortcuts,
    pub notifications: Notifications,
    pub plugins: Plugins,
    pub voice: Voice,
    pub desktop: Desktop,
    pub accents: BTreeMap<String, String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            appearance: Appearance::default(),
            shortcuts: Shortcuts::default(),
            notifications: Notifications::default(),
            plugins: Plugins::default(),
            voice: Voice::default(),
            desktop: Desktop::default(),
            accents: BTreeMap::new(),
        }
    }
}

impl Config {
    pub fn normalize(mut self) -> Self {
        self.appearance.font_size = self.appearance.font_size.clamp(12, 20);
        self.voice.sensitivity = self.voice.sensitivity.min(100);
        self.notifications.keywords = self
            .notifications
            .keywords
            .into_iter()
            .map(|word| word.trim().to_string())
            .filter(|word| !word.is_empty() && word.len() <= 40)
            .take(20)
            .collect();
        self.accents.retain(|id, color| {
            (5..=22).contains(&id.len())
                && id.chars().all(|c| c.is_ascii_digit())
                && is_hex_color(color)
        });
        self
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Appearance {
    pub theme: String,
    pub density: Density,
    pub font_family: FontFamily,
    pub font_size: u32,
    pub channel_list: ChannelList,
    pub show_member_list: bool,
    pub show_server_rail: bool,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: "modern-dark".into(),
            density: Density::Cozy,
            font_family: FontFamily::Inter,
            font_size: 15,
            channel_list: ChannelList::Left,
            show_member_list: true,
            show_server_rail: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Cozy,
    Compact,
    Irc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FontFamily {
    Inter,
    System,
    Serif,
    Mono,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelList {
    Left,
    Right,
    Hidden,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Shortcuts {
    pub quick_switcher: String,
    pub open_settings: String,
    pub toggle_members: String,
    pub toggle_channels: String,
    pub focus_composer: String,
    pub next_unread: String,
    pub previous_channel: String,
    pub next_channel: String,
    pub edit_last: String,
    pub toggle_mute: String,
    pub toggle_deafen: String,
    pub push_to_talk: String,
}

impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            quick_switcher: "mod+k".into(),
            open_settings: "mod+comma".into(),
            toggle_members: "mod+shift+m".into(),
            toggle_channels: "mod+b".into(),
            focus_composer: "mod+l".into(),
            next_unread: "alt+shift+down".into(),
            previous_channel: "alt+up".into(),
            next_channel: "alt+down".into(),
            edit_last: "arrowup".into(),
            toggle_mute: "mod+shift+alt+m".into(),
            toggle_deafen: "mod+shift+d".into(),
            push_to_talk: "backquote".into(),
        }
    }
}

impl Shortcuts {
    pub fn entries(&self) -> [(&str, &str); 12] {
        [
            ("quick_switcher", self.quick_switcher.as_str()),
            ("open_settings", self.open_settings.as_str()),
            ("toggle_members", self.toggle_members.as_str()),
            ("toggle_channels", self.toggle_channels.as_str()),
            ("focus_composer", self.focus_composer.as_str()),
            ("next_unread", self.next_unread.as_str()),
            ("previous_channel", self.previous_channel.as_str()),
            ("next_channel", self.next_channel.as_str()),
            ("edit_last", self.edit_last.as_str()),
            ("toggle_mute", self.toggle_mute.as_str()),
            ("toggle_deafen", self.toggle_deafen.as_str()),
            ("push_to_talk", self.push_to_talk.as_str()),
        ]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotifyLevel {
    All,
    Mentions,
    Mute,
}

impl Default for NotifyLevel {
    fn default() -> Self {
        Self::All
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Notifications {
    pub default: NotifyLevel,
    pub guilds: BTreeMap<String, NotifyOverride>,
    pub channels: BTreeMap<String, NotifyOverride>,
    pub keywords: Vec<String>,
}

impl Default for Notifications {
    fn default() -> Self {
        Self {
            default: NotifyLevel::All,
            guilds: BTreeMap::new(),
            channels: BTreeMap::new(),
            keywords: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceMode {
    Vad,
    Ptt,
}

impl Default for VoiceMode {
    fn default() -> Self {
        Self::Vad
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Voice {
    pub mode: VoiceMode,
    pub sensitivity: u8,
    pub noise_suppression: bool,
    pub input_device: String,
    pub output_device: String,
}

impl Default for Voice {
    fn default() -> Self {
        Self {
            mode: VoiceMode::Vad,
            sensitivity: 45,
            noise_suppression: true,
            input_device: String::new(),
            output_device: String::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Desktop {
    pub minimize_to_tray: bool,
    pub autostart: bool,
}

impl Default for Desktop {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            autostart: false,
        }
    }
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes[0] == b'#'
        && bytes[1..].iter().all(|c| c.is_ascii_hexdigit())
}

impl Notifications {
    /// Channel mute wins, then channel level, then guild mute, then guild level, then default.
    pub fn effective(&self, guild_id: Option<&str>, channel_id: &str) -> NotifyLevel {
        if let Some(over) = self.channels.get(channel_id) {
            if over.muted {
                return NotifyLevel::Mute;
            }
            if let Some(level) = over.level {
                return level;
            }
        }
        if let Some(guild_id) = guild_id {
            if let Some(over) = self.guilds.get(guild_id) {
                if over.muted {
                    return NotifyLevel::Mute;
                }
                if let Some(level) = over.level {
                    return level;
                }
            }
        }
        self.default
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct NotifyOverride {
    #[serde(default)]
    pub level: Option<NotifyLevel>,
    #[serde(default)]
    pub muted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Plugins {
    pub enabled: Vec<String>,
}

impl Default for Plugins {
    fn default() -> Self {
        Self {
            enabled: vec!["highlight-mentions".into(), "code-badge".into()],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accel {
    pub mod_key: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
    pub key: String,
}

pub fn parse_config(text: &str) -> Result<Config, ConfigError> {
    if text.trim().is_empty() {
        return Ok(Config::default());
    }
    let cfg: Config = toml::from_str(text)?;
    validate_theme_name(&cfg.appearance.theme)?;
    for (action, shortcut) in cfg.shortcuts.entries() {
        parse_shortcut(shortcut).map_err(|reason| ConfigError::Shortcut {
            key: action.to_string(),
            reason,
        })?;
    }
    Ok(cfg.normalize())
}

pub fn example_config_text() -> &'static str {
    include_str!("../../../config.example.toml")
}

pub fn validate_theme_name(name: &str) -> Result<(), ConfigError> {
    let ok = (1..=64).contains(&name.len())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    if ok {
        Ok(())
    } else {
        Err(ConfigError::Theme)
    }
}

const MODIFIERS: &[&str] = &[
    "mod", "cmd", "command", "ctrl", "control", "alt", "option", "shift", "meta", "super",
];

pub fn parse_shortcut(raw: &str) -> Result<Accel, String> {
    let parts: Vec<String> = raw
        .split('+')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return Err("empty shortcut".into());
    }
    if parts.len() == 1 && MODIFIERS.contains(&parts[0].as_str()) {
        return Err("shortcut is only a modifier".into());
    }
    let key = canonical_key(parts.last().unwrap());
    if !is_key(&key) {
        return Err(format!("unknown key {key}"));
    }
    let mut accel = Accel {
        mod_key: false,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        key,
    };
    for part in &parts[..parts.len() - 1] {
        match part.as_str() {
            "mod" => accel.mod_key = true,
            "cmd" | "command" => accel.meta = true,
            "ctrl" | "control" => accel.ctrl = true,
            "alt" | "option" => accel.alt = true,
            "shift" => accel.shift = true,
            "meta" | "super" => accel.meta = true,
            other => return Err(format!("unknown modifier {other}")),
        }
    }
    Ok(accel)
}

fn canonical_key(key: &str) -> String {
    match key {
        "down" | "arrowdown" => "arrowdown".into(),
        "up" | "arrowup" => "arrowup".into(),
        "left" | "arrowleft" => "arrowleft".into(),
        "right" | "arrowright" => "arrowright".into(),
        "esc" | "escape" => "escape".into(),
        "return" | "enter" => "enter".into(),
        "," | "comma" => "comma".into(),
        other => other.to_string(),
    }
}

fn is_key(key: &str) -> bool {
    if key.len() == 1 && key.chars().next().is_some_and(|c| c.is_ascii_alphanumeric()) {
        return true;
    }
    matches!(
        key,
        "comma"
            | "escape"
            | "enter"
            | "arrowup"
            | "arrowdown"
            | "arrowleft"
            | "arrowright"
            | "tab"
            | "space"
            | "backspace"
            | "slash"
            | "period"
            | "minus"
            | "equal"
            | "bracketleft"
            | "bracketright"
            | "quote"
            | "semicolon"
            | "backslash"
            | "backquote"
            | "f1"
            | "f2"
            | "f3"
            | "f4"
            | "f5"
            | "f6"
            | "f7"
            | "f8"
            | "f9"
            | "f10"
            | "f11"
            | "f12"
    )
}

/// `mod` is the platform command key: Command on macOS, Ctrl on Windows.
pub fn mod_means(os: &str) -> &'static str {
    match os {
        "macos" => "Command",
        _ => "Ctrl",
    }
}

pub fn paths_for(os: &str) -> (&'static str, &'static str) {
    (platform::config_dir_hint(os), platform::credential_store_label(os).unwrap_or("unavailable"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_uses_defaults() {
        let cfg = parse_config("").unwrap();
        assert_eq!(cfg.appearance.theme, "modern-dark");
        assert_eq!(cfg.appearance.density, Density::Cozy);
        assert_eq!(cfg.shortcuts.quick_switcher, "mod+k");
        assert!(cfg.shortcuts.quick_switcher.starts_with("mod+"));
        assert!(!cfg.shortcuts.quick_switcher.to_lowercase().contains("ctrl"));
        assert!(!cfg.shortcuts.quick_switcher.to_lowercase().contains("cmd"));
    }

    #[test]
    fn example_file_parses() {
        let cfg = parse_config(example_config_text()).unwrap();
        assert_eq!(cfg.appearance.theme, "modern-dark");
        assert_eq!(cfg.appearance.channel_list, ChannelList::Left);
        assert_eq!(cfg.notifications.default, NotifyLevel::All);
        assert_eq!(
            cfg.notifications
                .effective(Some("100000000000000011"), "no-such-channel"),
            NotifyLevel::Mentions
        );
        assert_eq!(
            cfg.notifications
                .effective(Some("100000000000000011"), "100000000000000025"),
            NotifyLevel::Mute
        );
        assert_eq!(cfg.plugins.enabled, vec!["highlight-mentions", "code-badge"]);
    }

    #[test]
    fn partial_file_fills_defaults() {
        let cfg = parse_config("appearance.theme = \"daylight\"\n").unwrap();
        assert_eq!(cfg.appearance.theme, "daylight");
        assert_eq!(cfg.appearance.font_size, 15);
        assert!(cfg.appearance.show_member_list);
    }

    #[test]
    fn invalid_density_errors() {
        let err = parse_config("appearance.density = \"wide\"\n").unwrap_err();
        assert!(err.to_string().contains("parse") || err.to_string().contains("density") || err.to_string().contains("unknown"));
    }

    #[test]
    fn font_size_is_clamped() {
        let cfg = parse_config("appearance.font_size = 99\n").unwrap();
        assert_eq!(cfg.appearance.font_size, 20);
        let cfg = parse_config("appearance.font_size = 5\n").unwrap();
        assert_eq!(cfg.appearance.font_size, 12);
    }

    #[test]
    fn theme_names_cannot_escape_the_folder() {
        assert!(validate_theme_name("../secret").is_err());
        assert!(validate_theme_name("Modern").is_err());
        assert!(validate_theme_name("a/b").is_err());
        assert!(validate_theme_name("").is_err());
        assert!(parse_config("appearance.theme = \"../etc/passwd\"\n").is_err());
        assert!(validate_theme_name("ink-contrast").is_ok());
    }

    #[test]
    fn shortcut_parser_understands_mod_and_aliases() {
        let accel = parse_shortcut("mod+k").unwrap();
        assert!(accel.mod_key);
        assert_eq!(accel.key, "k");
        assert!(!accel.ctrl);

        let accel = parse_shortcut("alt+shift+down").unwrap();
        assert!(accel.alt && accel.shift);
        assert_eq!(accel.key, "arrowdown");

        let accel = parse_shortcut("mod+comma").unwrap();
        assert_eq!(accel.key, "comma");
        let accel = parse_shortcut("cmd+k").unwrap();
        assert!(accel.meta);
        assert!(!accel.mod_key);
        let accel = parse_shortcut("ctrl+k").unwrap();
        assert!(accel.ctrl);
        assert!(!accel.mod_key);

        assert!(parse_shortcut("mod+").is_err());
        assert!(parse_shortcut("").is_err());
        assert!(parse_shortcut("mod+notakey").is_err());
    }

    #[test]
    fn bad_shortcut_fails_the_file() {
        let err = parse_config("[shortcuts]\nquick_switcher = \"mod+\"\n").unwrap_err();
        let ConfigError::Shortcut { key, .. } = err else {
            panic!("expected shortcut error");
        };
        assert_eq!(key, "quick_switcher");
    }

    #[test]
    fn notification_precedence() {
        let cfg = parse_config(example_config_text()).unwrap();
        assert_eq!(
            cfg.notifications.effective(Some("other"), "somewhere"),
            NotifyLevel::All
        );
        assert_eq!(
            cfg.notifications.effective(None, "100000000000000025"),
            NotifyLevel::Mute
        );
    }

    #[test]
    fn mod_key_is_command_on_mac_and_ctrl_on_windows() {
        assert_eq!(mod_means("macos"), "Command");
        assert_eq!(mod_means("windows"), "Ctrl");
    }

    #[test]
    fn unknown_appearance_field_is_rejected() {
        assert!(parse_config("appearance.sparkles = true\n").is_err());
    }
}
