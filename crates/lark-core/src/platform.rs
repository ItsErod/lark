//! OS-specific labels for paths, credential storage, and notifications.
//! The actual Keychain / Credential Manager calls live in the desktop shell.

/// Where Lark stores the user token on a supported desktop OS.
pub fn credential_store_label(os: &str) -> Result<&'static str, &'static str> {
    match os {
        "macos" => Ok("macOS Keychain"),
        "windows" => Ok("Windows Credential Manager"),
        _ => Err("unsupported"),
    }
}

pub fn uses_native_credential_store(os: &str) -> bool {
    credential_store_label(os).is_ok()
}

/// Hint for the per-user config directory. The running app resolves the real path.
pub fn config_dir_hint(os: &str) -> &'static str {
    match os {
        "macos" => "~/Library/Application Support/dev.lark.desktop",
        "windows" => r"%APPDATA%\dev.lark.desktop",
        _ => "the per-user Lark config directory",
    }
}

pub fn notification_note(os: &str) -> &'static str {
    match os {
        "macos" => "macOS asks once for notification permission. Alerts show as banners and in Notification Center. Lark still applies mute and mention settings first.",
        "windows" => "Windows shows toasts in Action Center. Focus assist, quiet hours, and Lark's mute settings can all suppress them.",
        _ => "Native notifications ship in the macOS and Windows apps. Mute and mention settings are the same on both.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_stores_match_each_desktop() {
        assert_eq!(credential_store_label("macos").unwrap(), "macOS Keychain");
        assert_eq!(
            credential_store_label("windows").unwrap(),
            "Windows Credential Manager"
        );
        assert!(credential_store_label("linux").is_err());
        assert!(uses_native_credential_store("macos"));
        assert!(uses_native_credential_store("windows"));
        assert!(!uses_native_credential_store("linux"));
    }

    #[test]
    fn path_hints_use_each_platform_convention() {
        let mac = config_dir_hint("macos");
        let win = config_dir_hint("windows");
        assert!(mac.contains("Library/Application Support"));
        assert!(mac.contains("dev.lark.desktop"));
        assert!(win.contains("%APPDATA%"));
        assert!(win.contains('\\'));
        assert!(!config_dir_hint("linux").contains("APPDATA"));
    }

    #[test]
    fn notification_copy_names_the_host_os() {
        assert!(notification_note("macos").contains("Notification Center"));
        assert!(notification_note("windows").contains("Action Center"));
        assert!(notification_note("linux").contains("macOS"));
    }
}
