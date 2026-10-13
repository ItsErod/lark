//! Shared logic for Lark: config, rate limits, and the Discord connection.
//! The desktop shell (macOS and Windows) is a thin Tauri wrapper around this crate.

pub mod boot;
pub mod cache;
pub mod clip;
pub mod clip_audio;
mod clip_encode;
pub mod clip_fit;
pub mod clip_rate;
pub mod config;
pub mod discord;
pub mod hardware;
#[cfg(windows)]
mod host_win;
mod mp4mux;
pub mod platform;
pub mod proc;
pub mod ratelimit;
pub mod readstate;
pub mod redact;
pub mod screen;
pub mod secretbox;
pub mod soundboard;
pub mod token;

pub use config::{global_accelerator, parse_config, prepare_saved_config, Config, ConfigError};
#[cfg(windows)]
pub use host_win::{open_folder, reveal_file, set_run_at_login};
pub use proc::{creation_flags, hide_console, CREATE_NO_WINDOW};
pub use platform::{
    config_dir_hint, credential_failure_message, credential_mismatch_after_save_message,
    credential_not_saved_message, credential_store_label, credential_unreadable_after_save_message,
    notification_note,
};
pub use ratelimit::{retry_after_to_ms, Decision, RateLimiter, WaitReason};
pub use redact::redact;
pub use token::normalize_user_token;
