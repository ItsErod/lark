//! Shared logic for Lark: config, rate limits, and the Discord connection.
//! The desktop shell (macOS and Windows) is a thin Tauri wrapper around this crate.

pub mod cache;
pub mod clip;
mod clip_encode;
pub mod config;
pub mod discord;
pub mod hardware;
mod mp4mux;
pub mod platform;
pub mod ratelimit;
pub mod readstate;
pub mod redact;
pub mod screen;
pub mod secretbox;
pub mod soundboard;
pub mod token;

pub use config::{global_accelerator, parse_config, Config, ConfigError};
pub use platform::{
    config_dir_hint, credential_failure_message, credential_mismatch_after_save_message,
    credential_not_saved_message, credential_store_label, credential_unreadable_after_save_message,
    notification_note,
};
pub use ratelimit::{retry_after_to_ms, Decision, RateLimiter, WaitReason};
pub use redact::redact;
pub use token::normalize_user_token;
