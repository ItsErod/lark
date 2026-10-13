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
    pub games: BTreeMap<String, GameProfile>,
    pub soundboard: Soundboard,
    pub privacy: Privacy,
    pub accents: BTreeMap<String, String>,
    /// Developer Mode, embeds, and spoiler reveal. Missing fields keep these defaults.
    /// Unknown fields are ignored so a newer client can still save.
    pub display: DisplayFlags,
    /// User-settings pages. Unknown fields are ignored. Missing fields keep defaults.
    pub preferences: Preferences,
    /// Discord keybinds, kept beside Lark's shortcuts. Empty means unbound.
    pub keybinds: DiscordKeybinds,
    /// Account switcher names. Tokens are not stored here.
    pub sessions: Vec<SavedSession>,
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
            games: BTreeMap::new(),
            soundboard: Soundboard::default(),
            privacy: Privacy::default(),
            accents: BTreeMap::new(),
            display: DisplayFlags::default(),
            preferences: Preferences::default(),
            keybinds: DiscordKeybinds::default(),
            sessions: Vec::new(),
        }
    }
}

impl Config {
    pub fn normalize(mut self) -> Self {
        self.appearance.font_size = self.appearance.font_size.clamp(12, 24);
        self.preferences = normalize_preferences(self.preferences);
        self.keybinds = normalize_keybinds(self.keybinds);
        self.sessions = normalize_sessions(self.sessions);
        self.voice.sensitivity = self.voice.sensitivity.min(100);
        self.voice.overlay_opacity = self.voice.overlay_opacity.clamp(35, 100);
        self.voice.speak_color = normalize_speak_color(&self.voice.speak_color);
        self.voice.share_resolution =
            match self.voice.share_resolution.to_ascii_lowercase().as_str() {
                "720" | "720p" => "720".into(),
                "1440" | "1440p" => "1440".into(),
                "2160" | "2160p" | "4k" => "2160".into(),
                "source" => "source".into(),
                _ => "1080".into(),
            };
        self.voice.share_fps = match self.voice.share_fps {
            15 => 15,
            60 => 60,
            _ => 30,
        };
        self.voice.share_encoder = match self.voice.share_encoder.to_ascii_lowercase().as_str() {
            "nvenc" => "nvenc".into(),
            "amf" => "amf".into(),
            "qsv" => "qsv".into(),
            "videotoolbox" => "videotoolbox".into(),
            "media-foundation" => "media-foundation".into(),
            _ => "auto".into(),
        };
        self.voice.levels.retain(|id, level| {
            let snowflake = (5..=22).contains(&id.len()) && id.chars().all(|c| c.is_ascii_digit());
            if snowflake {
                level.volume = level.volume.min(200);
            }
            snowflake
        });
        if self.voice.levels.len() > 200 {
            let keep: Vec<String> = self.voice.levels.keys().take(200).cloned().collect();
            self.voice
                .levels
                .retain(|id, _| keep.iter().any(|saved| saved == id));
        }
        self.soundboard.clips = normalize_clips(self.soundboard.clips);
        self.clips.fps = crate::clip_rate::snap_fps(self.clips.fps);
        self.clips.resolution = crate::clip_rate::snap_resolution(self.clips.resolution);
        self.clips.buffer_sec = crate::clip_rate::snap_buffer_sec(self.clips.buffer_sec);
        self.notifications.keywords = normalize_words(self.notifications.keywords);
        self.notifications.alert_keywords = normalize_alert_list(self.notifications.alert_keywords);
        self.notifications.people = normalize_alert_list(self.notifications.people);
        self.notifications.blocked = normalize_alert_list(self.notifications.blocked);
        self.notifications.quiet.start = normalize_clock(&self.notifications.quiet.start, "22:00");
        self.notifications.quiet.end = normalize_clock(&self.notifications.quiet.end, "07:00");
        self.desktop.frame_cap = if self.desktop.frame_cap == 0 {
            0
        } else {
            self.desktop.frame_cap.clamp(30, 240)
        };
        self.games.retain(|name, profile| {
            valid_game_name(name) && parse_shortcut(&profile.ptt_key).is_ok()
        });
        if self.games.len() > 40 {
            let keep: Vec<String> = self.games.keys().take(40).cloned().collect();
            self.games
                .retain(|name, _| keep.iter().any(|item| item == name));
        }
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

/// Keybinds. Unknown fields are ignored so a newer client can still save, and
/// a missing field keeps the default from this build.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Shortcuts {
    pub quick_switcher: String,
    pub open_settings: String,
    pub toggle_members: String,
    pub toggle_channels: String,
    pub focus_composer: String,
    pub next_unread: String,
    pub previous_channel: String,
    pub next_channel: String,
    #[serde(default = "default_previous_server")]
    pub previous_server: String,
    #[serde(default = "default_next_server")]
    pub next_server: String,
    pub edit_last: String,
    pub toggle_mute: String,
    pub toggle_deafen: String,
    pub push_to_talk: String,
    pub toggle_voice_overlay: String,
    #[serde(default = "default_toggle_perf_overlay")]
    pub toggle_perf_overlay: String,
    #[serde(default = "default_toggle_game_mode")]
    pub toggle_game_mode: String,
    pub save_clip: String,
    #[serde(default = "default_toggle_call")]
    pub toggle_call: String,
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
            previous_server: default_previous_server(),
            next_server: default_next_server(),
            edit_last: "arrowup".into(),
            toggle_mute: "mod+shift+alt+m".into(),
            toggle_deafen: "mod+shift+d".into(),
            push_to_talk: "backquote".into(),
            toggle_voice_overlay: "mod+shift+o".into(),
            toggle_perf_overlay: default_toggle_perf_overlay(),
            toggle_game_mode: default_toggle_game_mode(),
            save_clip: "mod+shift+c".into(),
            toggle_call: default_toggle_call(),
        }
    }
}

impl Shortcuts {
    pub fn entries(&self) -> [(&str, &str); 19] {
        [
            ("quick_switcher", self.quick_switcher.as_str()),
            ("open_settings", self.open_settings.as_str()),
            ("toggle_members", self.toggle_members.as_str()),
            ("toggle_channels", self.toggle_channels.as_str()),
            ("focus_composer", self.focus_composer.as_str()),
            ("next_unread", self.next_unread.as_str()),
            ("previous_channel", self.previous_channel.as_str()),
            ("next_channel", self.next_channel.as_str()),
            ("previous_server", self.previous_server.as_str()),
            ("next_server", self.next_server.as_str()),
            ("edit_last", self.edit_last.as_str()),
            ("toggle_mute", self.toggle_mute.as_str()),
            ("toggle_deafen", self.toggle_deafen.as_str()),
            ("push_to_talk", self.push_to_talk.as_str()),
            ("toggle_voice_overlay", self.toggle_voice_overlay.as_str()),
            ("toggle_perf_overlay", self.toggle_perf_overlay.as_str()),
            ("toggle_game_mode", self.toggle_game_mode.as_str()),
            ("save_clip", self.save_clip.as_str()),
            ("toggle_call", self.toggle_call.as_str()),
        ]
    }
}

fn default_toggle_perf_overlay() -> String {
    "mod+shift+p".into()
}

fn default_toggle_game_mode() -> String {
    "mod+shift+g".into()
}

fn default_toggle_call() -> String {
    "mod+shift+v".into()
}

fn default_previous_server() -> String {
    "mod+alt+arrowup".into()
}

fn default_next_server() -> String {
    "mod+alt+arrowdown".into()
}

fn default_ptt_key() -> String {
    "backquote".into()
}

fn default_game_mode_on() -> bool {
    true
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuietMode {
    Suppress,
    Batch,
}

impl Default for QuietMode {
    fn default() -> Self {
        Self::Batch
    }
}

/// Local quiet window. Times are `HH:MM` on this computer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct QuietHours {
    pub enabled: bool,
    pub start: String,
    pub end: String,
    pub mode: QuietMode,
}

impl Default for QuietHours {
    fn default() -> Self {
        Self {
            enabled: false,
            start: "22:00".into(),
            end: "07:00".into(),
            mode: QuietMode::Batch,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Notifications {
    pub default: NotifyLevel,
    pub guilds: BTreeMap<String, NotifyOverride>,
    pub channels: BTreeMap<String, NotifyOverride>,
    pub keywords: Vec<String>,
    pub quiet: QuietHours,
    pub alert_keywords: Vec<String>,
    pub people: Vec<String>,
    pub blocked: Vec<String>,
}

impl Default for Notifications {
    fn default() -> Self {
        Self {
            default: NotifyLevel::All,
            guilds: BTreeMap::new(),
            channels: BTreeMap::new(),
            keywords: Vec::new(),
            quiet: QuietHours::default(),
            alert_keywords: Vec::new(),
            people: Vec::new(),
            blocked: Vec::new(),
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
    /// Speaking ring. Discord green when unset or invalid.
    pub speak_color: String,
    /// Playback for other people. Local mute does not tell Discord.
    pub levels: BTreeMap<String, UserLevel>,
    /// Go Live default. 720, 1080, 1440, 2160, or source.
    #[serde(default = "default_share_resolution")]
    pub share_resolution: String,
    /// 15, 30, or 60.
    #[serde(default = "default_share_fps")]
    pub share_fps: u8,
    /// Capture the shared app's audio when the platform can.
    #[serde(default = "default_share_audio")]
    pub share_app_audio: bool,
    /// auto, nvenc, amf, qsv, videotoolbox, or media-foundation.
    #[serde(default = "default_share_encoder")]
    pub share_encoder: String,
}

fn default_share_resolution() -> String {
    "1080".into()
}

fn default_share_fps() -> u8 {
    30
}

fn default_share_audio() -> bool {
    true
}

fn default_share_encoder() -> String {
    "auto".into()
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
        Self {
            volume: 100,
            muted: false,
        }
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
            speak_color: "#23a559".to_string(),
            levels: BTreeMap::new(),
            share_resolution: default_share_resolution(),
            share_fps: default_share_fps(),
            share_app_audio: default_share_audio(),
            share_encoder: default_share_encoder(),
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
    /// When true, Lark may read the GPU name, CPU temperature on macOS, and the
    /// current game, and publish them as the Discord custom status. Off until
    /// Settings says so. Windows leaves temperature blank.
    pub hardware_status: bool,
    /// Performance strip in the voice HUD window. Off until Settings or the hotkey.
    pub perf_overlay: bool,
    /// Foreground-game reads for Game Mode. On until Settings turns it off.
    /// This does not read GPU sensors.
    #[serde(default = "default_game_mode_on")]
    pub detect_games: bool,
    /// Game Mode while no game is detected. A detected game uses its profile.
    pub game_mode: bool,
}

impl Default for Desktop {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            autostart: false,
            frame_cap: 240,
            hardware_status: false,
            perf_overlay: false,
            detect_games: true,
            game_mode: false,
        }
    }
}

/// Saved switches for one detected game. The name is the map key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct GameProfile {
    pub ptt: bool,
    #[serde(default = "default_ptt_key")]
    pub ptt_key: String,
    #[serde(default = "default_game_mode_on")]
    pub game_mode: bool,
    pub voice_overlay: bool,
    pub perf_overlay: bool,
}

impl Default for GameProfile {
    fn default() -> Self {
        Self {
            ptt: false,
            ptt_key: default_ptt_key(),
            game_mode: true,
            voice_overlay: false,
            perf_overlay: false,
        }
    }
}

fn valid_game_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed.chars().count() <= 80
        && trimmed.chars().all(|ch| !ch.is_control())
}

/// Local clip buffer. Recording also turns on while screen share is running.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Clips {
    /// Record the main display even when screen share is off.
    pub game_capture: bool,
    /// What to do when a clip is over the Discord upload limit: always, ask, or never.
    pub compress: CompressMode,
    /// 60, 120, or 240. Anything else becomes 60.
    #[serde(default = "default_clip_fps")]
    pub fps: u32,
    /// 720, 1080, 1440, or 2160. Anything else becomes 1440.
    #[serde(default = "default_clip_resolution")]
    pub resolution: u32,
    /// 15, 30, 60, 90, or 120 seconds. Anything else becomes 30.
    #[serde(default = "default_clip_buffer")]
    pub buffer_sec: u32,
}

fn default_clip_buffer() -> u32 {
    30
}

fn default_clip_fps() -> u32 {
    60
}

fn default_clip_resolution() -> u32 {
    1440
}

impl Default for Clips {
    fn default() -> Self {
        Self {
            game_capture: false,
            compress: CompressMode::Ask,
            fps: default_clip_fps(),
            resolution: default_clip_resolution(),
            buffer_sec: default_clip_buffer(),
        }
    }
}

/// Re-encode a copy on send. The original file stays in the clips folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressMode {
    Always,
    Ask,
    Never,
}

impl Default for CompressMode {
    fn default() -> Self {
        Self::Ask
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

/// Flags the message list and menus read.
/// `show_embeds` defaults on. The other two default off.
/// Unknown fields are ignored so save_config keeps working.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct DisplayFlags {
    pub developer_mode: bool,
    #[serde(default = "default_show_embeds")]
    pub show_embeds: bool,
    pub show_spoilers: bool,
}

fn default_show_embeds() -> bool {
    true
}

impl Default for DisplayFlags {
    fn default() -> Self {
        Self {
            developer_mode: false,
            show_embeds: true,
            show_spoilers: false,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_saturation() -> u8 {
    100
}

fn default_language() -> String {
    "en".into()
}

fn default_app_icon() -> String {
    "blurple".into()
}

fn default_density_name() -> String {
    "cozy".into()
}

fn default_explicit() -> String {
    "everyone".into()
}

fn default_spam() -> String {
    "non_friends".into()
}

fn default_everyone() -> String {
    "everyone".into()
}

fn default_time_format() -> String {
    "auto".into()
}

fn default_reduced_motion() -> String {
    "system".into()
}

/// Settings pages other than the three display flags.
/// Unknown fields are ignored. Missing fields use the defaults below.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Preferences {
    pub color_mode: String,
    #[serde(default = "default_app_icon")]
    pub app_icon: String,
    #[serde(default = "default_true")]
    pub show_media: bool,
    pub underline_links: bool,
    #[serde(default = "default_density_name")]
    pub ui_density: String,
    #[serde(default = "default_density_name")]
    pub message_density: String,
    pub group_spacing: u8,
    #[serde(default = "default_saturation")]
    pub saturation: u8,
    pub high_contrast: bool,
    #[serde(default = "default_explicit")]
    pub explicit_filter: String,
    #[serde(default = "default_spam")]
    pub spam_filter: String,
    #[serde(default = "default_everyone")]
    pub dm_permission: String,
    #[serde(default = "default_everyone")]
    pub friend_requests: String,
    #[serde(default = "default_true")]
    pub improve_discord: bool,
    #[serde(default = "default_true")]
    pub personalize: bool,
    #[serde(default = "default_true")]
    pub desktop_notifications: bool,
    pub message_sound: bool,
    pub call_sound: bool,
    pub pause_gif: bool,
    #[serde(default = "default_reduced_motion")]
    pub reduced_motion: String,
    #[serde(default = "default_true")]
    pub unread_badge: bool,
    pub email_notifications: bool,
    #[serde(default = "default_true")]
    pub share_activity: bool,
    #[serde(default = "default_true")]
    pub activity_status: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_time_format")]
    pub time_format: String,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            color_mode: String::new(),
            app_icon: default_app_icon(),
            show_media: true,
            underline_links: false,
            ui_density: default_density_name(),
            message_density: default_density_name(),
            group_spacing: 0,
            saturation: 100,
            high_contrast: false,
            explicit_filter: default_explicit(),
            spam_filter: default_spam(),
            dm_permission: default_everyone(),
            friend_requests: default_everyone(),
            improve_discord: true,
            personalize: true,
            desktop_notifications: true,
            message_sound: false,
            call_sound: true,
            pause_gif: false,
            reduced_motion: default_reduced_motion(),
            unread_badge: true,
            email_notifications: false,
            share_activity: true,
            activity_status: true,
            language: default_language(),
            time_format: default_time_format(),
        }
    }
}

fn pick(value: &str, allowed: &[&str], fallback: &str) -> String {
    if allowed.contains(&value) {
        value.to_string()
    } else {
        fallback.to_string()
    }
}

fn normalize_preferences(mut prefs: Preferences) -> Preferences {
    prefs.color_mode = pick(&prefs.color_mode, &["light", "ash", "dark", "onyx"], "");
    prefs.app_icon = pick(
        &prefs.app_icon,
        &["blurple", "dark", "light", "midnight", "dusk"],
        "blurple",
    );
    prefs.ui_density = pick(&prefs.ui_density, &["cozy", "compact"], "cozy");
    prefs.message_density = pick(&prefs.message_density, &["cozy", "compact"], "cozy");
    prefs.group_spacing = prefs.group_spacing.min(24);
    prefs.saturation = prefs.saturation.min(100);
    prefs.explicit_filter = pick(
        &prefs.explicit_filter,
        &["off", "friends", "everyone"],
        "everyone",
    );
    prefs.spam_filter = pick(
        &prefs.spam_filter,
        &["off", "non_friends", "everyone"],
        "non_friends",
    );
    prefs.dm_permission = pick(
        &prefs.dm_permission,
        &["everyone", "friends", "none"],
        "everyone",
    );
    prefs.friend_requests = pick(
        &prefs.friend_requests,
        &["everyone", "friends_of_friends", "server_members"],
        "everyone",
    );
    let languages = [
        "en", "en-GB", "es", "fr", "de", "pt-BR", "ja", "ko", "zh-CN", "ru", "pl", "tr", "nl",
        "it", "sv",
    ];
    if !languages.contains(&prefs.language.as_str()) {
        prefs.language = "en".into();
    }
    prefs.time_format = pick(&prefs.time_format, &["auto", "12", "24"], "auto");
    prefs.reduced_motion = pick(
        &prefs.reduced_motion,
        &["system", "reduce", "allow"],
        "system",
    );
    prefs
}

fn default_mark_server_read() -> String {
    "shift+escape".into()
}
fn default_toggle_hotkeys() -> String {
    "mod+slash".into()
}
fn default_return_previous_text() -> String {
    "alt+arrowleft".into()
}
fn default_return_previous_audio() -> String {
    "alt+arrowright".into()
}
fn default_toggle_pins() -> String {
    "mod+p".into()
}
fn default_toggle_inbox() -> String {
    "mod+i".into()
}
fn default_toggle_emoji_picker() -> String {
    "mod+e".into()
}
fn default_toggle_gif_picker() -> String {
    "mod+g".into()
}
fn default_toggle_sticker_picker() -> String {
    "mod+s".into()
}
fn default_scroll_chat_up() -> String {
    "pageup".into()
}
fn default_scroll_chat_down() -> String {
    "pagedown".into()
}
fn default_create_or_join_server() -> String {
    "mod+shift+n".into()
}
fn default_answer_call() -> String {
    "mod+enter".into()
}
fn default_decline_call() -> String {
    "mod+shift+escape".into()
}
fn default_create_group() -> String {
    "mod+shift+t".into()
}
fn default_start_call() -> String {
    "mod+quote".into()
}
fn default_upload_file() -> String {
    "mod+u".into()
}
fn default_search_key() -> String {
    "mod+f".into()
}
fn default_push_to_mute() -> String {
    "mod+shift+alt+b".into()
}

/// Discord's keybind list. Lark's shortcuts stay on `Shortcuts`.
/// An empty string is unbound. Unknown fields are ignored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct DiscordKeybinds {
    #[serde(default = "default_mark_server_read")]
    pub mark_server_read: String,
    #[serde(default = "default_toggle_hotkeys")]
    pub toggle_hotkeys: String,
    #[serde(default = "default_return_previous_text")]
    pub return_previous_text: String,
    #[serde(default = "default_return_previous_audio")]
    pub return_previous_audio: String,
    #[serde(default = "default_toggle_pins")]
    pub toggle_pins: String,
    #[serde(default = "default_toggle_inbox")]
    pub toggle_inbox: String,
    #[serde(default = "default_toggle_emoji_picker")]
    pub toggle_emoji_picker: String,
    #[serde(default = "default_toggle_gif_picker")]
    pub toggle_gif_picker: String,
    #[serde(default = "default_toggle_sticker_picker")]
    pub toggle_sticker_picker: String,
    #[serde(default = "default_scroll_chat_up")]
    pub scroll_chat_up: String,
    #[serde(default = "default_scroll_chat_down")]
    pub scroll_chat_down: String,
    #[serde(default = "default_create_or_join_server")]
    pub create_or_join_server: String,
    #[serde(default = "default_answer_call")]
    pub answer_call: String,
    #[serde(default = "default_decline_call")]
    pub decline_call: String,
    #[serde(default = "default_create_group")]
    pub create_group: String,
    #[serde(default = "default_start_call")]
    pub start_call: String,
    #[serde(default = "default_upload_file")]
    pub upload_file: String,
    #[serde(default = "default_search_key")]
    pub search: String,
    #[serde(default = "default_push_to_mute")]
    pub push_to_mute: String,
}

impl Default for DiscordKeybinds {
    fn default() -> Self {
        Self {
            mark_server_read: default_mark_server_read(),
            toggle_hotkeys: default_toggle_hotkeys(),
            return_previous_text: default_return_previous_text(),
            return_previous_audio: default_return_previous_audio(),
            toggle_pins: default_toggle_pins(),
            toggle_inbox: default_toggle_inbox(),
            toggle_emoji_picker: default_toggle_emoji_picker(),
            toggle_gif_picker: default_toggle_gif_picker(),
            toggle_sticker_picker: default_toggle_sticker_picker(),
            scroll_chat_up: default_scroll_chat_up(),
            scroll_chat_down: default_scroll_chat_down(),
            create_or_join_server: default_create_or_join_server(),
            answer_call: default_answer_call(),
            decline_call: default_decline_call(),
            create_group: default_create_group(),
            start_call: default_start_call(),
            upload_file: default_upload_file(),
            search: default_search_key(),
            push_to_mute: default_push_to_mute(),
        }
    }
}

fn keep_key(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if parse_shortcut(trimmed).is_ok() {
        trimmed.to_string()
    } else {
        fallback.to_string()
    }
}

fn normalize_keybinds(keys: DiscordKeybinds) -> DiscordKeybinds {
    DiscordKeybinds {
        mark_server_read: keep_key(&keys.mark_server_read, &default_mark_server_read()),
        toggle_hotkeys: keep_key(&keys.toggle_hotkeys, &default_toggle_hotkeys()),
        return_previous_text: keep_key(&keys.return_previous_text, &default_return_previous_text()),
        return_previous_audio: keep_key(
            &keys.return_previous_audio,
            &default_return_previous_audio(),
        ),
        toggle_pins: keep_key(&keys.toggle_pins, &default_toggle_pins()),
        toggle_inbox: keep_key(&keys.toggle_inbox, &default_toggle_inbox()),
        toggle_emoji_picker: keep_key(&keys.toggle_emoji_picker, &default_toggle_emoji_picker()),
        toggle_gif_picker: keep_key(&keys.toggle_gif_picker, &default_toggle_gif_picker()),
        toggle_sticker_picker: keep_key(
            &keys.toggle_sticker_picker,
            &default_toggle_sticker_picker(),
        ),
        scroll_chat_up: keep_key(&keys.scroll_chat_up, &default_scroll_chat_up()),
        scroll_chat_down: keep_key(&keys.scroll_chat_down, &default_scroll_chat_down()),
        create_or_join_server: keep_key(
            &keys.create_or_join_server,
            &default_create_or_join_server(),
        ),
        answer_call: keep_key(&keys.answer_call, &default_answer_call()),
        decline_call: keep_key(&keys.decline_call, &default_decline_call()),
        create_group: keep_key(&keys.create_group, &default_create_group()),
        start_call: keep_key(&keys.start_call, &default_start_call()),
        upload_file: keep_key(&keys.upload_file, &default_upload_file()),
        search: keep_key(&keys.search, &default_search_key()),
        push_to_mute: keep_key(&keys.push_to_mute, &default_push_to_mute()),
    }
}

/// A saved account name. The token lives in the credential store, not here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedSession {
    pub id: String,
    pub name: String,
}

impl Default for SavedSession {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
        }
    }
}

fn snowflake_id(id: &str) -> bool {
    (5..=22).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_digit())
}

fn session_name(name: &str, id: &str) -> String {
    let trimmed: String = name
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .filter(|ch| !ch.is_control())
        .take(64)
        .collect();
    let suspicious =
        trimmed.contains("mfa.") || (trimmed.matches('.').count() >= 2 && trimmed.len() > 40);
    if trimmed.is_empty() || suspicious {
        format!("Account {}", &id[id.len().saturating_sub(4)..])
    } else {
        trimmed
    }
}

fn normalize_sessions(sessions: Vec<SavedSession>) -> Vec<SavedSession> {
    let mut out = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for session in sessions {
        let id = session.id.trim().to_string();
        if !snowflake_id(&id) || !seen.insert(id.clone()) {
            continue;
        }
        out.push(SavedSession {
            name: session_name(&session.name, &id),
            id,
        });
        if out.len() == 5 {
            break;
        }
    }
    out
}

/// Streamer mode hides emails, tokens, DM previews, and personal info.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Privacy {
    pub streamer: bool,
    /// Turn streamer mode on while screen share or the clip buffer is recording.
    pub streamer_auto: bool,
}

impl Default for Privacy {
    fn default() -> Self {
        Self {
            streamer: false,
            streamer_auto: false,
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
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
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
        let mut name: String = clip
            .name
            .trim()
            .chars()
            .filter(|ch| !ch.is_control())
            .take(40)
            .collect();
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

fn normalize_words(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|word| word.trim().to_string())
        .filter(|word| !word.is_empty() && word.len() <= 40)
        .take(20)
        .collect()
}

fn normalize_clock(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if is_clock(trimmed) {
        trimmed.to_string()
    } else {
        fallback.to_string()
    }
}

fn is_clock(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return false;
    }
    let Ok(hour) = std::str::from_utf8(&bytes[0..2]) else {
        return false;
    };
    let Ok(minute) = std::str::from_utf8(&bytes[3..5]) else {
        return false;
    };
    matches!(
        (hour.parse::<u8>(), minute.parse::<u8>()),
        (Ok(hour), Ok(minute)) if hour < 24 && minute < 60
    )
}

fn normalize_alert_list(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for value in values {
        let word = value.trim();
        let len = word.chars().count();
        if len < 2 || len > 40 || word.contains("mfa.") {
            continue;
        }
        let key = word.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        out.push(word.to_string());
        if out.len() == 20 {
            break;
        }
    }
    out
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(|c| c.is_ascii_hexdigit())
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
            enabled: Vec::new(),
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

fn normalize_speak_color(value: &str) -> String {
    let trimmed = value.trim();
    let bytes = trimmed.as_bytes();
    let hex = bytes.len() == 7
        && bytes[0] == b'#'
        && bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit());
    if hex {
        trimmed.to_ascii_lowercase()
    } else {
        "#23a559".to_string()
    }
}

/// The normalize step inside `save_config`, before the file is written.
pub fn prepare_saved_config(config: Config) -> Result<Config, String> {
    let text = toml::to_string(&config).map_err(|err| err.to_string())?;
    parse_config(&text).map_err(|err| err.to_string())
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
    for (name, profile) in &cfg.games {
        if !valid_game_name(name) {
            return Err(ConfigError::Shortcut {
                key: format!("games.{name}"),
                reason: "game name is empty or too long".into(),
            });
        }
        parse_shortcut(&profile.ptt_key).map_err(|reason| ConfigError::Shortcut {
            key: format!("games.{name}.ptt_key"),
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
            decls.push((
                item[..colon].trim().to_string(),
                item[colon + 1..].trim().to_string(),
            ));
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
    if key.len() == 1
        && key
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
    {
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
            | "pageup"
            | "pagedown"
            | "home"
            | "end"
            | "delete"
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
    (
        platform::config_dir_hint(os),
        platform::credential_store_label(os).unwrap_or("unavailable"),
    )
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
        assert!(!cfg.notifications.quiet.enabled);
        assert_eq!(cfg.notifications.quiet.mode, QuietMode::Batch);
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
        assert!(cfg.plugins.enabled.is_empty());
        assert_eq!(cfg.desktop.frame_cap, 240);
        assert!(!cfg.desktop.hardware_status);
        assert!(!cfg.desktop.perf_overlay);
        assert!(cfg.desktop.detect_games);
        assert!(!cfg.desktop.game_mode);
        assert_eq!(cfg.shortcuts.toggle_perf_overlay, "mod+shift+p");
        assert_eq!(cfg.shortcuts.toggle_game_mode, "mod+shift+g");
        assert_eq!(cfg.shortcuts.toggle_call, "mod+shift+v");
        assert!(cfg.games.is_empty());
        assert_eq!(cfg.shortcuts.save_clip, "mod+shift+c");
        assert!(!cfg.clips.game_capture);
        assert_eq!(cfg.clips.compress, CompressMode::Ask);
        assert_eq!(cfg.clips.fps, 60);
        assert_eq!(cfg.clips.resolution, 1440);
        assert_eq!(cfg.clips.buffer_sec, 30);
        assert!(!cfg.privacy.streamer);
        assert!(!cfg.privacy.streamer_auto);
    }

    #[test]
    fn streamer_mode_stays_off_until_the_config_turns_it_on() {
        assert!(!parse_config("").unwrap().privacy.streamer);
        assert!(
            !parse_config("[privacy]\nstreamer_auto = true\n")
                .unwrap()
                .privacy
                .streamer
        );
        let on = parse_config("[privacy]\nstreamer = true\nstreamer_auto = true\n").unwrap();
        assert!(on.privacy.streamer);
        assert!(on.privacy.streamer_auto);
    }

    #[test]
    fn quiet_hours_default_when_missing_and_a_bad_clock_falls_back() {
        let cfg = parse_config("[notifications]\ndefault = \"mentions\"\n").unwrap();
        assert!(!cfg.notifications.quiet.enabled);
        assert_eq!(cfg.notifications.quiet.start, "22:00");
        assert_eq!(cfg.notifications.quiet.end, "07:00");
        assert_eq!(cfg.notifications.quiet.mode, QuietMode::Batch);
        assert!(cfg.notifications.people.is_empty());
        let custom = parse_config(
            r#"
[notifications]
alert_keywords = ["ship"]
people = ["Ada", "ada", "a", "mfa.abcdefghijklmnopqrstuvwxyz"]
blocked = ["100000000000000025"]

[notifications.quiet]
enabled = true
start = "9:00"
end = "17:00"
mode = "suppress"
"#,
        )
        .unwrap();
        assert!(custom.notifications.quiet.enabled);
        assert_eq!(custom.notifications.quiet.start, "22:00");
        assert_eq!(custom.notifications.quiet.end, "17:00");
        assert_eq!(custom.notifications.quiet.mode, QuietMode::Suppress);
        assert_eq!(
            custom.notifications.alert_keywords,
            vec!["ship".to_string()]
        );
        assert_eq!(custom.notifications.people, vec!["Ada".to_string()]);
        assert_eq!(
            custom.notifications.blocked,
            vec!["100000000000000025".to_string()]
        );
    }

    #[test]
    fn clip_quality_defaults_to_1440p_at_60_and_snaps() {
        let cfg = parse_config("").unwrap();
        assert_eq!(cfg.clips.fps, 60);
        assert_eq!(cfg.clips.resolution, 1440);
        let picked = parse_config("[clips]\nfps = 120\nresolution = 2160\n").unwrap();
        assert_eq!(picked.clips.fps, 120);
        assert_eq!(picked.clips.resolution, 2160);
        let snapped =
            parse_config("[clips]\nfps = 90\nresolution = 480\nbuffer_sec = 45\n").unwrap();
        assert_eq!(snapped.clips.fps, 60);
        assert_eq!(snapped.clips.resolution, 1440);
        assert_eq!(snapped.clips.buffer_sec, 30);
        let long = parse_config("[clips]\nbuffer_sec = 120\n").unwrap();
        assert_eq!(long.clips.buffer_sec, 120);
    }

    #[test]
    fn hardware_status_stays_off_until_the_config_turns_it_on() {
        assert!(!parse_config("").unwrap().desktop.hardware_status);
        assert!(
            !parse_config("[desktop]\nframe_cap = 60\n")
                .unwrap()
                .desktop
                .hardware_status
        );
        assert!(
            parse_config("[desktop]\nhardware_status = true\n")
                .unwrap()
                .desktop
                .hardware_status
        );
    }

    #[test]
    fn frame_cap_matches_the_display_or_clamps_at_240() {
        assert_eq!(parse_config("").unwrap().desktop.frame_cap, 240);
        assert_eq!(
            parse_config("desktop.frame_cap = 0\n")
                .unwrap()
                .desktop
                .frame_cap,
            0
        );
        assert_eq!(
            parse_config("desktop.frame_cap = 144\n")
                .unwrap()
                .desktop
                .frame_cap,
            144
        );
        assert_eq!(
            parse_config("desktop.frame_cap = 999\n")
                .unwrap()
                .desktop
                .frame_cap,
            240
        );
        assert_eq!(
            parse_config("desktop.frame_cap = 1\n")
                .unwrap()
                .desktop
                .frame_cap,
            30
        );
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
        assert!(
            err.to_string().contains("parse")
                || err.to_string().contains("density")
                || err.to_string().contains("unknown")
        );
    }

    #[test]
    fn font_size_is_clamped() {
        let cfg = parse_config("appearance.font_size = 99\n").unwrap();
        assert_eq!(cfg.appearance.font_size, 24);
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
    fn older_shortcut_table_keeps_the_new_overlay_hotkeys() {
        let cfg = parse_config("[shortcuts]\nquick_switcher = \"mod+k\"\n").unwrap();
        assert_eq!(cfg.shortcuts.toggle_perf_overlay, "mod+shift+p");
        assert_eq!(cfg.shortcuts.toggle_game_mode, "mod+shift+g");
        assert_eq!(cfg.shortcuts.toggle_voice_overlay, "mod+shift+o");
        assert_eq!(cfg.shortcuts.toggle_call, "mod+shift+v");
        assert_eq!(cfg.shortcuts.previous_server, "mod+alt+arrowup");
        assert_eq!(cfg.shortcuts.next_server, "mod+alt+arrowdown");
    }

    #[test]
    fn shortcut_table_accepts_unknown_and_missing_fields() {
        let newer = parse_config(
            "[shortcuts]\ntoggle_call = \"mod+shift+v\"\ntoggle_future = \"mod+shift+9\"\n",
        )
        .unwrap();
        assert_eq!(newer.shortcuts.toggle_call, "mod+shift+v");
        assert_eq!(newer.shortcuts.quick_switcher, "mod+k");

        let partial: Config = serde_json::from_value(serde_json::json!({
            "shortcuts": { "toggle_future": "mod+shift+9" }
        }))
        .unwrap();
        assert_eq!(partial.shortcuts.toggle_call, "mod+shift+v");
        let saved = prepare_saved_config(partial).unwrap();
        assert_eq!(saved.shortcuts.toggle_call, "mod+shift+v");
        assert_eq!(saved.shortcuts.save_clip, "mod+shift+c");
    }

    /// `src/config.ts` `defaultConfig()` is the payload Settings sends to `save_config`.
    /// The frontend test locks this file to that object.
    #[test]
    fn frontend_default_config_round_trips_through_save_config() {
        let raw = include_str!("../tests/frontend-default-config.json");
        let frontend: serde_json::Value = serde_json::from_str(raw).unwrap();
        let config: Config = serde_json::from_str(raw).expect("save_config args");
        let saved = prepare_saved_config(config).unwrap();
        assert_eq!(saved.shortcuts.toggle_call, "mod+shift+v");
        let again = prepare_saved_config(saved.clone()).unwrap();
        assert_eq!(again, saved);
        assert_frontend_fields(&frontend, &serde_json::to_value(&saved).unwrap(), "");
    }

    #[test]
    fn game_profile_round_trips_and_rejects_a_bad_key() {
        let cfg = parse_config(
            "[desktop]\ndetect_games = false\ngame_mode = true\nperf_overlay = true\n\n[games.Hades]\nptt = true\nptt_key = \"v\"\ngame_mode = false\nvoice_overlay = true\nperf_overlay = true\n",
        )
        .unwrap();
        assert!(!cfg.desktop.detect_games);
        assert!(cfg.desktop.game_mode);
        assert!(cfg.desktop.perf_overlay);
        let profile = cfg.games.get("Hades").unwrap();
        assert!(profile.ptt);
        assert_eq!(profile.ptt_key, "v");
        assert!(!profile.game_mode);
        assert!(profile.voice_overlay);
        assert!(profile.perf_overlay);
        let partial = parse_config("[games.Celeste]\nptt = true\n").unwrap();
        let celeste = partial.games.get("Celeste").unwrap();
        assert!(celeste.ptt);
        assert_eq!(celeste.ptt_key, "backquote");
        assert!(celeste.game_mode);
        assert!(!celeste.voice_overlay);
        assert!(parse_config("[games.Hades]\nptt_key = \"mod+\"\n").is_err());
        assert!(
            parse_config("[desktop]\ndetect_games = false\n")
                .unwrap()
                .desktop
                .detect_games
                == false
        );
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
        assert_eq!(cfg.voice.speak_color, "#23a559");
        assert_eq!(cfg.shortcuts.toggle_voice_overlay, "mod+shift+o");
        let tinted = parse_config("voice.speak_color = \"#C46B4A\"\n").unwrap();
        assert_eq!(tinted.voice.speak_color, "#c46b4a");
        let junk = parse_config("voice.speak_color = \"green\"\n").unwrap();
        assert_eq!(junk.voice.speak_color, "#23a559");
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
        assert_eq!(
            global_accelerator("mod+shift+o").unwrap(),
            "CommandOrControl+Shift+O"
        );
        assert_eq!(global_accelerator("backquote").unwrap(), "BACKQUOTE");
        assert_eq!(
            global_accelerator("alt+shift+down").unwrap(),
            "Alt+Shift+ARROWDOWN"
        );
        assert!(global_accelerator("mod+").is_err());
    }

    #[test]
    fn unknown_appearance_field_is_rejected() {
        assert!(parse_config("appearance.sparkles = true\n").is_err());
    }

    #[test]
    fn display_flags_accept_unknown_and_missing_fields() {
        let missing = parse_config("").unwrap();
        assert!(!missing.display.developer_mode);
        assert!(missing.display.show_embeds);
        assert!(!missing.display.show_spoilers);

        let partial =
            parse_config("[display]\ndeveloper_mode = true\nshow_future = true\n").unwrap();
        assert!(partial.display.developer_mode);
        assert!(partial.display.show_embeds);
        assert!(!partial.display.show_spoilers);

        let hidden =
            parse_config("[display]\nshow_embeds = false\nshow_spoilers = true\n").unwrap();
        assert!(!hidden.display.show_embeds);
        assert!(hidden.display.show_spoilers);

        let json: Config = serde_json::from_value(serde_json::json!({
            "display": { "developer_mode": true, "show_later": 1 }
        }))
        .unwrap();
        assert!(json.display.developer_mode);
        assert!(json.display.show_embeds);
        let saved = prepare_saved_config(json).unwrap();
        assert!(saved.display.developer_mode);
        assert!(saved.display.show_embeds);
        assert!(!saved.display.show_spoilers);
    }

    #[test]
    fn user_settings_accept_unknown_fields_and_drop_session_secrets() {
        let cfg: Config = serde_json::from_value(serde_json::json!({
            "preferences": { "color_mode": "ash", "sparkles": true, "saturation": 200 },
            "keybinds": { "search": "", "toggle_future": "mod+9", "scroll_chat_up": "not-a-key" },
            "sessions": [
                { "id": "100000000000000001", "name": "Ada", "token": "mfa.super-secret-token-value" },
                { "id": "nope", "name": "Skip" },
                { "id": "100000000000000002", "name": "mfa.aaaaaaaaaaaaaaaaaaaa.bbbbb.cccccccccccccccccccc" }
            ]
        }))
        .unwrap();
        let saved = prepare_saved_config(cfg).unwrap();
        assert_eq!(saved.preferences.color_mode, "ash");
        assert_eq!(saved.preferences.saturation, 100);
        assert_eq!(saved.preferences.language, "en");
        assert!(saved.keybinds.search.is_empty());
        assert_eq!(saved.keybinds.scroll_chat_up, "pageup");
        assert_eq!(saved.sessions.len(), 2);
        assert_eq!(saved.sessions[0].name, "Ada");
        assert_eq!(saved.sessions[1].name, "Account 0002");
        let value = serde_json::to_value(&saved).unwrap();
        assert!(value["sessions"][0].get("token").is_none());
        let text = serde_json::to_string(&saved).unwrap();
        assert!(!text.contains("super-secret"));
        assert!(!text.contains("mfa."));
    }

    #[test]
    fn theme_css_rejects_blur_layout_and_huge_shadows() {
        let ok = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }";
        assert!(validate_theme_css(ok).is_ok());
        assert!(validate_theme_css(".shell { backdrop-filter: blur(20px); }").is_err());
        assert!(validate_theme_css(
            ":root { --bg-0: #000; --text: #fff; --accent: url(https://example.test); }"
        )
        .is_err());
        assert!(validate_theme_css(
            ":root { --bg-0: #000; --text: #fff; --accent: #fff; } @keyframes spin { }"
        )
        .is_err());
        let heavy = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 24px 200px #000; }";
        assert!(validate_theme_css(heavy).is_err());
        let legacy = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 24px 60px rgba(0, 0, 0, 0.38); }";
        assert!(validate_theme_css(legacy).is_ok());
    }

    fn assert_frontend_fields(frontend: &serde_json::Value, saved: &serde_json::Value, path: &str) {
        match (frontend, saved) {
            (serde_json::Value::Object(front), serde_json::Value::Object(back)) => {
                for (key, value) in front {
                    let next = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}.{key}")
                    };
                    let Some(got) = back.get(key) else {
                        panic!("save_config dropped {next}");
                    };
                    assert_frontend_fields(value, got, &next);
                }
            }
            (serde_json::Value::Array(front), serde_json::Value::Array(back)) => {
                assert_eq!(front.len(), back.len(), "{path}");
                for (index, (value, got)) in front.iter().zip(back).enumerate() {
                    assert_frontend_fields(value, got, &format!("{path}[{index}]"));
                }
            }
            (serde_json::Value::Number(front), serde_json::Value::Number(back)) => {
                assert_eq!(front.as_f64(), back.as_f64(), "{path}");
            }
            _ => assert_eq!(frontend, saved, "{path}"),
        }
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
        assert_eq!(
            std::fs::read_to_string(dst.join("nord.css")).unwrap(),
            "custom"
        );
        std::fs::write(src.join("oled.css"), "oled").unwrap();
        assert_eq!(copy_missing_themes(&dst, &src), 1);
        assert_eq!(
            std::fs::read_to_string(dst.join("oled.css")).unwrap(),
            "oled"
        );
        assert!(!dst.join("notes.txt").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
