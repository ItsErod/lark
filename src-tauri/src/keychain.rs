//! Token storage. macOS uses Keychain. Windows uses Credential Manager.
//! The token is never written to config, logs, or the webview.

use lark_core::credential_store_label;

#[cfg(any(target_os = "macos", target_os = "windows"))]
const SERVICE: &str = "Lark";
#[cfg(any(target_os = "macos", target_os = "windows"))]
const ACCOUNT: &str = "discord-user-token";

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
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|err| store_error(&err))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_save(token: &str) -> Result<(), String> {
    entry()?.set_password(token).map_err(|err| store_error(&err))
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
    let label = store_label();
    let detail = err.to_string();
    if detail.len() > 180 {
        format!("Couldn't use {label}.")
    } else {
        format!("Couldn't use {label}: {detail}")
    }
}
