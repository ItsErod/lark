//! Shared logic for Lark: config, rate limits, and the Discord connection.
//! The desktop shell (macOS and Windows) is a thin Tauri wrapper around this crate.

pub mod cache;
pub mod config;
pub mod discord;
pub mod platform;
pub mod ratelimit;
pub mod readstate;
pub mod redact;
pub mod screen;
pub mod token;

pub use config::{parse_config, Config, ConfigError};
pub use platform::{
    config_dir_hint, credential_failure_message, credential_store_label, notification_note,
};
pub use ratelimit::{retry_after_to_ms, Decision, RateLimiter, WaitReason};
pub use redact::redact;
pub use token::normalize_user_token;
