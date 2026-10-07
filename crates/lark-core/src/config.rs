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
    #[error("invalid theme css: {0}")]
    ThemeCss(String),
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
    pub clips: Clips,
    pub soundboard: Soundboard,
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
            clips: Clips::default(),
            soundboard: Soundboard::default(),
            accents: BTreeMap::new(),
        }
    }
}

impl Config {
    pub fn normalize(mut self) -> Self {
        self.appearance.font_size = self.appearance.font_size.clamp(12, 20);
        self.voice.sensitivity = self.voice.sensitivity.min(100);
        self.voice.overlay_opacity = self.voice.overlay_opacity.clamp(35, 100);
        self.voice.levels.retain(|id, level| {
            let snowflake = (5..=22).contains(&id.len()) && id.chars().all(|c| c.is_ascii_digit());
            if snowflake {
                level.volume = level.volume.min(200);
            }
            snowflake
        });
        if self.voice.levels.len() > 200 {
            let keep: Vec<String> = self.voice.levels.keys().take(200).cloned().collect();
            self.voice.levels.retain(|id, _| keep.iter().any(|saved| saved == id));
        }
        self.soundboard.clips = normalize_clips(self.soundboard.clips);
        self.notifications.keywords = self
            .notifications
            .keywords
            .into_iter()
            .map(|word| word.trim().to_string())
            .filter(|word| !word.is_empty() && word.len() <= 40)
            .take(20)
            .collect();
        self.desktop.frame_cap = if self.desktop.frame_cap == 0 {
            0
        } else {
            self.desktop.frame_cap.clamp(30, 240)
        };
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
            theme: "discord".into(),
            density: Density::Cozy,
            font_family: FontFamily::Inter,
            font_size: 16,
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
    pub toggle_voice_overlay: String,
    pub save_clip: String,
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
            toggle_voice_overlay: "mod+shift+o".into(),
            save_clip: "mod+shift+c".into(),
        }
    }
}

impl Shortcuts {
    pub fn entries(&self) -> [(&str, &str); 14] {
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
            ("toggle_voice_overlay", self.toggle_voice_overlay.as_str()),
            ("save_clip", self.save_clip.as_str()),
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
    pub video_device: String,
    /// Always-on-top speaking HUD. Off until the user turns it on.
    pub overlay: bool,
    /// 35–100. The HUD window multiplies this into its opacity.
    pub overlay_opacity: u8,
    /// When true, clicks pass through the HUD to the game.
    pub overlay_click_through: bool,
    /// Playback for other people. Local mute does not tell Discord.
    pub levels: BTreeMap<String, UserLevel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct UserLevel {
    /// 0–200. 100 is unity.
    pub volume: u16,
    pub muted: bool,
}

impl Default for UserLevel {
    fn default() -> Self {
        Self { volume: 100, muted: false }
    }
}

impl Default for Voice {
    fn default() -> Self {
        Self {
            mode: VoiceMode::Vad,
            sensitivity: 45,
            noise_suppression: true,
            input_device: String::new(),
            output_device: String::new(),
            video_device: String::new(),
            overlay: false,
            overlay_opacity: 70,
            overlay_click_through: true,
            levels: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Desktop {
    pub minimize_to_tray: bool,
    pub autostart: bool,
    /// 0 matches the display. Any other value is a cap from 30 to 240.
    pub frame_cap: u16,
    /// When true, Lark may read GPU, CPU temperature, and the current game
    /// and publish them as the Discord custom status. Off until Settings says so.
    pub hardware_status: bool,
}

impl Default for Desktop {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            autostart: false,
            frame_cap: 240,
            hardware_status: false,
        }
    }
}

/// Local clip buffer. Recording also turns on while screen share is running.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Clips {
    /// Record the main display even when screen share is off.
    pub game_capture: bool,
}

impl Default for Clips {
    fn default() -> Self {
        Self { game_capture: false }
    }
}

/// One local WAV mixed into the voice channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct SoundClip {
    pub id: String,
    pub name: String,
    pub path: String,
    pub hotkey: String,
    /// 0–200. 100 is unity.
    pub volume: u8,
}

impl Default for SoundClip {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            path: String::new(),
            hotkey: String::new(),
            volume: 100,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Soundboard {
    pub clips: Vec<SoundClip>,
}

impl Default for Soundboard {
    fn default() -> Self {
        Self { clips: Vec::new() }
    }
}

fn clip_id_ok(id: &str) -> bool {
    let bytes = id.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 41
        && bytes[0].is_ascii_alphanumeric()
        && bytes.iter().all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

fn normalize_clips(clips: Vec<SoundClip>) -> Vec<SoundClip> {
    let mut seen_ids = std::collections::BTreeSet::new();
    let mut seen_keys = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for mut clip in clips {
        let id = clip.id.trim().to_string();
        if !clip_id_ok(&id) || !seen_ids.insert(id.clone()) {
            continue;
        }
        let path = clip.path.replace('\0', "").trim().to_string();
        if path.is_empty() || path.len() > 512 || path.chars().any(|ch| ch.is_control()) {
            continue;
        }
        let mut name: String = clip.name.trim().chars().filter(|ch| !ch.is_control()).take(40).collect();
        if name.is_empty() {
            name = "Sound".into();
        }
        let hotkey = clip.hotkey.trim();
        let hotkey = if hotkey.is_empty() {
            String::new()
        } else if parse_shortcut(hotkey).is_ok() && seen_keys.insert(hotkey.to_lowercase()) {
            hotkey.to_string()
        } else {
            String::new()
        };
        clip.id = id;
        clip.name = name;
        clip.path = path;
        clip.hotkey = hotkey;
        clip.volume = clip.volume.min(200);
        out.push(clip);
        if out.len() == 24 {
            break;
        }
    }
    out
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

const THEME_BANNED: &[&str] = &[
    "@import",
    "url(",
    "expression(",
    "backdrop-filter",
    "@keyframes",
    "animation:",
    "will-change",
    "javascript:",
    "-moz-binding",
    "behavior:",
    "blur(",
    "drop-shadow",
];

/// Themes may only set custom properties. Blur, animation, and external URLs are refused.
pub fn validate_theme_css(css: &str) -> Result<(), ConfigError> {
    if css.len() > 16 * 1024 || css.trim().is_empty() || css.contains('\0') {
        return Err(ConfigError::ThemeCss(
            "theme file is empty, too large, or not text".into(),
        ));
    }
    let stripped = strip_css_comments(css);
    let lower = stripped.to_ascii_lowercase();
    for token in THEME_BANNED {
        if lower.contains(token) {
            return Err(ConfigError::ThemeCss(format!(
                "theme css cannot include {token}"
            )));
        }
    }
    let blocks = parse_css_blocks(&stripped)?;
    let mut saw_root = false;
    let mut saw_bg = false;
    let mut saw_text = false;
    let mut saw_accent = false;
    for block in blocks {
        if block.selector != ":root" && block.selector != "html.is-vibrancy" {
            return Err(ConfigError::ThemeCss(
                "theme css can only set variables on :root and html.is-vibrancy".into(),
            ));
        }
        if block.selector == ":root" {
            saw_root = true;
        }
        for (name, value) in block.decls {
            let name_l = name.to_ascii_lowercase();
            let value = value.trim();
            if value.len() > 300
                || value.contains('{')
                || value.contains('}')
                || value.contains('<')
                || value.contains('>')
            {
                return Err(ConfigError::ThemeCss(format!(
                    "unsupported value for {name_l}"
                )));
            }
            if name_l == "color-scheme" {
                if value != "dark" && value != "light" {
                    return Err(ConfigError::ThemeCss(
                        "color-scheme must be dark or light".into(),
                    ));
                }
                continue;
            }
            if !is_custom_prop(&name_l) {
                return Err(ConfigError::ThemeCss(format!(
                    "unsupported property {name_l}"
                )));
            }
            if name_l == "--window-material" && value != "none" && value != "vibrancy" {
                return Err(ConfigError::ThemeCss(
                    "window material must be none or vibrancy".into(),
                ));
            }
            if name_l == "--shadow" && shadow_blur_px(value) > 64.0 {
                return Err(ConfigError::ThemeCss("shadow blur is too large".into()));
            }
            if name_l == "--bg-0" {
                saw_bg = true;
            }
            if name_l == "--text" {
                saw_text = true;
            }
            if name_l == "--accent" {
                saw_accent = true;
            }
        }
    }
    if !saw_root || !saw_bg || !saw_text || !saw_accent {
        return Err(ConfigError::ThemeCss(
            "a theme needs :root with --bg-0, --text, and --accent".into(),
        ));
    }
    Ok(())
}

/// Copy theme files that are not already in the user folder. Existing files stay as the user left them.
pub fn copy_missing_themes(dest: &std::path::Path, source: &std::path::Path) -> u32 {
    let Ok(entries) = std::fs::read_dir(source) else {
        return 0;
    };
    let mut copied = 0;
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if !kind.is_file() {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(stem) = name.strip_suffix(".css") else {
            continue;
        };
        if validate_theme_name(stem).is_err() {
            continue;
        }
        let target = dest.join(name);
        if target.exists() {
            continue;
        }
        if std::fs::copy(entry.path(), target).is_ok() {
            copied += 1;
        }
    }
    copied
}

fn is_custom_prop(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("--") else {
        return false;
    };
    !rest.is_empty()
        && rest
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn strip_css_comments(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        if let Some(end) = rest[start + 2..].find("*/") {
            rest = &rest[start + 2 + end + 2..];
        } else {
            rest = "";
        }
    }
    out.push_str(rest);
    out
}

struct CssBlock {
    selector: String,
    decls: Vec<(String, String)>,
}

fn parse_css_blocks(css: &str) -> Result<Vec<CssBlock>, ConfigError> {
    let mut blocks = Vec::new();
    let bytes = css.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let Some(open) = css[i..].find('{') else {
            return Err(ConfigError::ThemeCss(
                "theme css can only set variables on :root and html.is-vibrancy".into(),
            ));
        };
        let selector = css[i..i + open].trim().to_string();
        if selector.is_empty() {
            return Err(ConfigError::ThemeCss(
                "theme css can only set variables on :root and html.is-vibrancy".into(),
            ));
        }
        let body_start = i + open + 1;
        let Some(close) = css[body_start..].find('}') else {
            return Err(ConfigError::ThemeCss(
                "theme css can only set variables on :root and html.is-vibrancy".into(),
            ));
        };
        let body = &css[body_start..body_start + close];
        let mut decls = Vec::new();
        for part in body.split(';') {
            let item = part.trim();
            if item.is_empty() {
                continue;
            }
            let Some(colon) = item.find(':') else {
                return Err(ConfigError::ThemeCss(
                    "theme css can only set variables on :root and html.is-vibrancy".into(),
                ));
            };
            if colon == 0 {
                return Err(ConfigError::ThemeCss(
                    "theme css can only set variables on :root and html.is-vibrancy".into(),
                ));
            }
            decls.push((item[..colon].trim().to_string(), item[colon + 1..].trim().to_string()));
        }
        blocks.push(CssBlock { selector, decls });
        i = body_start + close + 1;
    }
    Ok(blocks)
}

fn shadow_blur_px(shadow: &str) -> f64 {
    let mut max: f64 = 0.0;
    for layer in split_commas(shadow) {
        let stripped = strip_funcs(&layer);
        let mut tokens = Vec::new();
        let mut rest = stripped.as_str();
        while !rest.is_empty() {
            rest = rest.trim_start();
            if rest.is_empty() {
                break;
            }
            let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
            let token = &rest[..end];
            if token == "0" || token.ends_with("px") {
                if let Some(number) = token.strip_suffix("px").or(Some(token)) {
                    if let Ok(value) = number.parse::<f64>() {
                        tokens.push(value.abs());
                    }
                }
            }
            rest = &rest[end..];
        }
        if tokens.len() >= 3 {
            max = max.max(tokens[2]);
        }
    }
    max
}

fn strip_funcs(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find('(') {
        let head = &rest[..start];
        let name_end = head
            .rfind(|c: char| !c.is_ascii_alphabetic() && c != '-')
            .map(|i| i + 1)
            .unwrap_or(0);
        out.push_str(&head[..name_end]);
        out.push(' ');
        let Some(end) = rest[start..].find(')') else {
            break;
        };
        rest = &rest[start + end + 1..];
    }
    out.push_str(rest);
    out
}

fn split_commas(value: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth: i32 = 0;
    let mut start = 0;
    for (index, ch) in value.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                parts.push(&value[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    parts.push(&value[start..]);
    parts
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

/// Lark shortcut (`mod+shift+o`) as a global hotkey accelerator.
/// `mod` is Command on macOS and Ctrl on Windows (`CommandOrControl`).
pub fn global_accelerator(raw: &str) -> Result<String, String> {
    let accel = parse_shortcut(raw)?;
    let mut parts = Vec::new();
    if accel.mod_key {
        parts.push("CommandOrControl".to_string());
    }
    if accel.ctrl {
        parts.push("Control".to_string());
    }
    if accel.alt {
        parts.push("Alt".to_string());
    }
    if accel.shift {
        parts.push("Shift".to_string());
    }
    if accel.meta {
        parts.push("Meta".to_string());
    }
    parts.push(accel.key.to_uppercase());
    Ok(parts.join("+"))
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
        assert_eq!(cfg.appearance.theme, "discord");
        assert_eq!(cfg.appearance.density, Density::Cozy);
        assert_eq!(cfg.appearance.font_size, 16);
        assert_eq!(cfg.shortcuts.quick_switcher, "mod+k");
        assert!(cfg.shortcuts.quick_switcher.starts_with("mod+"));
        assert!(!cfg.shortcuts.quick_switcher.to_lowercase().contains("ctrl"));
        assert!(!cfg.shortcuts.quick_switcher.to_lowercase().contains("cmd"));
    }

    #[test]
    fn example_file_parses() {
        let cfg = parse_config(example_config_text()).unwrap();
        assert_eq!(cfg.appearance.theme, "discord");
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
        assert_eq!(cfg.desktop.frame_cap, 240);
        assert!(!cfg.desktop.hardware_status);
        assert_eq!(cfg.shortcuts.save_clip, "mod+shift+c");
        assert!(!cfg.clips.game_capture);
    }

    #[test]
    fn hardware_status_stays_off_until_the_config_turns_it_on() {
        assert!(!parse_config("").unwrap().desktop.hardware_status);
        assert!(!parse_config("[desktop]\nframe_cap = 60\n").unwrap().desktop.hardware_status);
        assert!(parse_config("[desktop]\nhardware_status = true\n").unwrap().desktop.hardware_status);
    }

    #[test]
    fn frame_cap_matches_the_display_or_clamps_at_240() {
        assert_eq!(parse_config("").unwrap().desktop.frame_cap, 240);
        assert_eq!(parse_config("desktop.frame_cap = 0\n").unwrap().desktop.frame_cap, 0);
        assert_eq!(parse_config("desktop.frame_cap = 144\n").unwrap().desktop.frame_cap, 144);
        assert_eq!(parse_config("desktop.frame_cap = 999\n").unwrap().desktop.frame_cap, 240);
        assert_eq!(parse_config("desktop.frame_cap = 1\n").unwrap().desktop.frame_cap, 30);
    }

    #[test]
    fn partial_file_fills_defaults() {
        let cfg = parse_config("appearance.theme = \"daylight\"\n").unwrap();
        assert_eq!(cfg.appearance.theme, "daylight");
        assert_eq!(cfg.appearance.font_size, 16);
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
    fn user_levels_and_soundboard_clips_are_kept() {
        let cfg = parse_config(
            r#"
[voice.levels.100000000000000002]
volume = 80
muted = true

[voice.levels.nope]
volume = 10

[[soundboard.clips]]
id = "horn"
name = "Horn"
path = "/tmp/horn.wav"
hotkey = "mod+shift+1"
volume = 120

[[soundboard.clips]]
id = "bad key"
name = "Nope"
path = "/tmp/nope.wav"
hotkey = "mod+shift+2"
"#,
        )
        .unwrap();
        assert_eq!(cfg.voice.levels.len(), 1);
        assert!(cfg.voice.levels["100000000000000002"].muted);
        assert_eq!(cfg.voice.levels["100000000000000002"].volume, 80);
        assert_eq!(cfg.soundboard.clips.len(), 1);
        assert_eq!(cfg.soundboard.clips[0].hotkey, "mod+shift+1");
        assert_eq!(cfg.soundboard.clips[0].volume, 120);
        let cleared = parse_config(
            r#"
[[soundboard.clips]]
id = "horn"
name = "Horn"
path = "/tmp/horn.wav"
hotkey = "!!!"
"#,
        )
        .unwrap();
        assert!(cleared.soundboard.clips[0].hotkey.is_empty());
    }

    #[test]
    fn voice_hud_stays_off_until_turned_on() {
        let cfg = parse_config("").unwrap();
        assert!(!cfg.voice.overlay);
        assert!(cfg.voice.overlay_click_through);
        assert_eq!(cfg.voice.overlay_opacity, 70);
        assert_eq!(cfg.shortcuts.toggle_voice_overlay, "mod+shift+o");
        let older = parse_config("[voice]\nmode = \"ptt\"\n").unwrap();
        assert_eq!(older.voice.mode, VoiceMode::Ptt);
        assert!(!older.voice.overlay);
        assert!(older.voice.overlay_click_through);
        assert_eq!(older.voice.overlay_opacity, 70);
        assert_eq!(older.shortcuts.toggle_voice_overlay, "mod+shift+o");
        let faint = parse_config("voice.overlay_opacity = 1\n").unwrap();
        assert_eq!(faint.voice.overlay_opacity, 35);
        let loud = parse_config("voice.overlay_opacity = 140\n").unwrap();
        assert_eq!(loud.voice.overlay_opacity, 100);
    }

    #[test]
    fn overlay_hotkey_uses_the_platform_mod_key() {
        assert_eq!(global_accelerator("mod+shift+o").unwrap(), "CommandOrControl+Shift+O");
        assert_eq!(global_accelerator("backquote").unwrap(), "BACKQUOTE");
        assert_eq!(global_accelerator("alt+shift+down").unwrap(), "Alt+Shift+ARROWDOWN");
        assert!(global_accelerator("mod+").is_err());
    }

    #[test]
    fn unknown_appearance_field_is_rejected() {
        assert!(parse_config("appearance.sparkles = true\n").is_err());
    }

    #[test]
    fn theme_css_rejects_blur_layout_and_huge_shadows() {
        let ok = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }";
        assert!(validate_theme_css(ok).is_ok());
        assert!(validate_theme_css(".shell { backdrop-filter: blur(20px); }").is_err());
        assert!(validate_theme_css(":root { --bg-0: #000; --text: #fff; --accent: url(https://example.test); }").is_err());
        assert!(validate_theme_css(":root { --bg-0: #000; --text: #fff; --accent: #fff; } @keyframes spin { }").is_err());
        let heavy = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 24px 200px #000; }";
        assert!(validate_theme_css(heavy).is_err());
        let legacy = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 24px 60px rgba(0, 0, 0, 0.38); }";
        assert!(validate_theme_css(legacy).is_ok());
    }

    #[test]
    fn copy_missing_themes_leaves_existing_files() {
        let root = std::env::temp_dir().join(format!("lark-themes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let src = root.join("src");
        let dst = root.join("dst");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&dst).unwrap();
        std::fs::write(src.join("nord.css"), "nord").unwrap();
        std::fs::write(src.join("notes.txt"), "no").unwrap();
        std::fs::write(dst.join("nord.css"), "custom").unwrap();
        assert_eq!(copy_missing_themes(&dst, &src), 0);
        assert_eq!(std::fs::read_to_string(dst.join("nord.css")).unwrap(), "custom");
        std::fs::write(src.join("oled.css"), "oled").unwrap();
        assert_eq!(copy_missing_themes(&dst, &src), 1);
        assert_eq!(std::fs::read_to_string(dst.join("oled.css")).unwrap(), "oled");
        assert!(!dst.join("notes.txt").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
