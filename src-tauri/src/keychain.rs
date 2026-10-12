//! Token storage. macOS uses Keychain. Windows uses Credential Manager.
//! The token is never written to config, logs, or the webview.
//!
//! Reads and writes run on the main thread. Unsigned macOS builds cannot show
//! the Keychain prompt from a background thread (error -25308), which made
//! Save and connect fail in the packaged app after the token was written.
//!
//! `keyring` must be built with `apple-native` and `windows-native`. Without
//! those features every `Entry::new` is an empty in-memory mock, so a save
//! returns success and the next load reports that nothing was stored.

use std::cell::Cell;

use lark_core::credential_store_label;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use lark_core::{
    credential_failure_message, credential_mismatch_after_save_message,
    credential_unreadable_after_save_message,
};
use tauri::AppHandle;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use zeroize::Zeroize;

thread_local! {
    static ON_MAIN_THREAD: Cell<bool> = const { Cell::new(false) };
}

/// Called from Tauri's setup, which runs on the UI thread.
pub fn mark_main_thread() {
    ON_MAIN_THREAD.with(|flag| flag.set(true));
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
const SERVICE: &str = "Lark";
#[cfg(any(target_os = "macos", target_os = "windows"))]
const TOKEN_ACCOUNT: &str = "discord-user-token";
#[cfg(any(target_os = "macos", target_os = "windows"))]
const DRAFT_ACCOUNT: &str = "draft-key";

pub fn store_label() -> String {
    credential_store_label(std::env::consts::OS)
        .unwrap_or("unavailable")
        .to_string()
}

pub fn save_token(token: &str) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_save(token)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = token;
        Err(
            "Lark stores the Discord token in the macOS Keychain or Windows Credential Manager. This operating system has no supported store, so the token was not saved."
                .into(),
        )
    }
}

pub fn load_token() -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_load()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(None)
    }
}

/// Credential account for one saved Discord user. Never the active token slot.
pub fn account_slot(user_id: &str) -> Result<String, String> {
    let bytes = user_id.as_bytes();
    if !(5..=22).contains(&bytes.len()) || !bytes.iter().all(|byte| byte.is_ascii_digit()) {
        return Err("That account id is not a Discord user id.".into());
    }
    Ok(format!("discord-account-{user_id}"))
}

pub fn save_named(account: &str, secret: &str) -> Result<(), String> {
    if !account.starts_with("discord-account-") {
        return Err("Refusing to use that credential account.".into());
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_save_named(account, secret)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (account, secret);
        Err(
            "Lark stores the Discord token in the macOS Keychain or Windows Credential Manager. This operating system has no supported store, so the token was not saved."
                .into(),
        )
    }
}

pub fn load_named(account: &str) -> Result<Option<String>, String> {
    if !account.starts_with("discord-account-") {
        return Err("Refusing to use that credential account.".into());
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_load_named(account)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(None)
    }
}

pub fn clear_named(account: &str) -> Result<(), String> {
    if !account.starts_with("discord-account-") {
        return Err("Refusing to use that credential account.".into());
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_clear_named(account)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(())
    }
}

pub fn clear_token() -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_clear()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, TOKEN_ACCOUNT).map_err(|err| store_error(&err))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn draft_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, DRAFT_ACCOUNT).map_err(|err| store_error(&err))
}

/// 32-byte AES key for local drafts. Stored under its own credential-store
/// account so it cannot replace the Discord token.
pub fn load_or_create_draft_key() -> Result<[u8; 32], String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        native_draft_key()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err(
            "Lark encrypts drafts with a key in the macOS Keychain or Windows Credential Manager. This operating system has no supported store, so drafts stay in memory for this session."
                .into(),
        )
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_draft_key() -> Result<[u8; 32], String> {
    use base64::Engine;
    match draft_entry()?.get_password() {
        Ok(mut value) => {
            let decoded = decode_draft_key(&value);
            value.zeroize();
            decoded
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = lark_core::secretbox::random_key();
            let mut encoded = base64::engine::general_purpose::STANDARD.encode(key);
            let saved = draft_entry().and_then(|entry| entry.set_password(&encoded).map_err(|err| store_error(&err)));
            encoded.zeroize();
            if let Err(err) = saved {
                key.zeroize();
                return Err(err);
            }
            let mut loaded = match draft_entry()?.get_password() {
                Ok(value) => value,
                Err(keyring::Error::NoEntry) => {
                    key.zeroize();
                    return Err(credential_unreadable_after_save_message(&store_label()));
                }
                Err(err) => {
                    key.zeroize();
                    return Err(format!(
                        "Couldn't read the draft key back after saving it. {}",
                        store_error(&err)
                    ));
                }
            };
            let decoded = decode_draft_key(&loaded);
            loaded.zeroize();
            let decoded = match decoded {
                Ok(value) => value,
                Err(err) => {
                    key.zeroize();
                    return Err(err);
                }
            };
            let matches = decoded == key;
            key.zeroize();
            if matches {
                Ok(decoded)
            } else {
                Err(credential_mismatch_after_save_message(&store_label()))
            }
        }
        Err(err) => Err(store_error(&err)),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn decode_draft_key(encoded: &str) -> Result<[u8; 32], String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|_| "The draft key in the credential store was not readable.".to_string())?;
    if bytes.len() != 32 {
        return Err("The draft key in the credential store was the wrong size.".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn named_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|err| store_error(&err))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_save_named(account: &str, secret: &str) -> Result<(), String> {
    named_entry(account)?
        .set_password(secret)
        .map_err(|err| store_error(&err))?;
    let mut loaded = match named_entry(account)?.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => {
            return Err(credential_unreadable_after_save_message(&store_label()));
        }
        Err(err) => {
            return Err(format!(
                "Couldn't read the token back after saving it. {}",
                store_error(&err)
            ));
        }
    };
    let matches = loaded == secret;
    loaded.zeroize();
    if matches {
        Ok(())
    } else {
        Err(credential_mismatch_after_save_message(&store_label()))
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_load_named(account: &str) -> Result<Option<String>, String> {
    match named_entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(store_error(&err)),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_clear_named(account: &str) -> Result<(), String> {
    match named_entry(account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(store_error(&err)),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn account_slot_is_separate_from_the_active_token() {
        assert_eq!(
            super::account_slot("100000000000000002").as_deref(),
            Ok("discord-account-100000000000000002")
        );
        assert!(super::account_slot("").is_err());
        assert!(super::account_slot("abc").is_err());
        assert!(super::account_slot("../token").is_err());
        assert!(super::account_slot("100000000000000002")
            .unwrap()
            .starts_with("discord-account-"));
        assert_ne!(
            super::account_slot("100000000000000002").unwrap(),
            "discord-user-token"
        );
    }

    #[test]
    fn draft_key_account_is_not_the_discord_token() {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            assert_ne!(super::TOKEN_ACCOUNT, super::DRAFT_ACCOUNT);
            assert!(!super::DRAFT_ACCOUNT.contains("token"));
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            assert_ne!("discord-user-token", "draft-key");
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_save(token: &str) -> Result<(), String> {
    entry()?
        .set_password(token)
        .map_err(|err| store_error(&err))?;
    // Load through a new entry, the same way the next launch does. A mock
    // store keeps the secret only on the entry that wrote it.
    let mut loaded = match entry()?.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => {
            return Err(credential_unreadable_after_save_message(&store_label()));
        }
        Err(err) => {
            return Err(format!(
                "Couldn't read the token back after saving it. {}",
                store_error(&err)
            ));
        }
    };
    let matches = loaded == token;
    loaded.zeroize();
    if matches {
        Ok(())
    } else {
        Err(credential_mismatch_after_save_message(&store_label()))
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(store_error(&err)),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(store_error(&err)),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn store_error(err: &keyring::Error) -> String {
    credential_failure_message(&store_label(), &err.to_string())
}

pub fn on_main<T: Send + 'static>(
    app: &AppHandle,
    op: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    if ON_MAIN_THREAD.with(|flag| flag.get()) {
        return Ok(op());
    }
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(op());
    })
    .map_err(|err| format!("Couldn't reach the main thread for the credential store: {err}"))?;
    rx.recv()
        .map_err(|_| "The credential store stopped responding.".to_string())
}
