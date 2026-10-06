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

/// `connect` found no token. This is not a Keychain denial and not a capture failure.
pub fn credential_not_saved_message(store: &str) -> String {
    format!("No token saved in the {store}.")
}

/// The write call returned success, but a new lookup found no item.
/// That is a store failure, not "nothing was ever saved" and not a capture miss.
pub fn credential_unreadable_after_save_message(store: &str) -> String {
    format!(
        "Couldn't save the token in the {store}. The store accepted the write, but reading it back found nothing, so the session was not stored."
    )
}

/// The value read back after a write was not the token that was written.
pub fn credential_mismatch_after_save_message(store: &str) -> String {
    format!(
        "Couldn't save the token in the {store}. The value read back did not match the token, so the session was not stored."
    )
}

/// Turn a Keychain or Credential Manager failure into something a person can act on.
/// `detail` is the OS error text. It must not contain the token.
pub fn credential_failure_message(store: &str, detail: &str) -> String {
    let lower = detail.to_ascii_lowercase();
    if lower.contains("-34018")
        || lower.contains("missing entitlement")
        || lower.contains("required entitlement")
    {
        return format!(
            "{store} refused the token because this build has no Keychain access-group entitlement (-34018). Lark uses the login keychain, which does not need that entitlement. Try saving again."
        );
    }
    if lower.contains("-25308")
        || lower.contains("interaction is not allowed")
        || lower.contains("errsecinteractionnotallowed")
    {
        return format!(
            "{store} could not show its permission prompt (error -25308). Unsigned macOS builds hit this when the token is read off the main thread. Lark now reads and writes the token on the main thread. Try again, and choose Allow if macOS asks."
        );
    }
    if lower.contains("-67050")
        || lower.contains("errseccsunsigned")
        || lower.contains("code object is not signed")
        || lower.contains("not signed")
    {
        return format!(
            "{store} does not trust this unsigned build (error -67050). Control-click Lark, choose Open, then try again and choose Always Allow if macOS asks."
        );
    }
    if lower.contains("user cancel")
        || lower.contains("user cancelled")
        || lower.contains("user canceled")
        || lower.contains("-128")
    {
        return format!("{store} prompt was cancelled, so the token was not saved.");
    }
    if lower.contains("locked") {
        return format!("{store} is locked. Unlock it and try again.");
    }
    let detail = detail.trim();
    if detail.is_empty() || detail.len() > 180 {
        format!("Couldn't use {store}.")
    } else {
        format!("Couldn't use {store}: {detail}")
    }
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
    fn credential_messages_separate_missing_save_and_denial() {
        let store = "macOS Keychain";
        let missing = credential_not_saved_message(store);
        let unreadable = credential_unreadable_after_save_message(store);
        let mismatch = credential_mismatch_after_save_message(store);
        let denied = credential_failure_message(store, "User interaction is not allowed. (-25308)");
        let entitlement =
            credential_failure_message(store, "A required entitlement isn't present. (-34018)");
        assert_eq!(missing, "No token saved in the macOS Keychain.");
        assert!(unreadable.contains("reading it back found nothing"));
        assert!(unreadable.contains("Couldn't save the token"));
        assert!(mismatch.contains("did not match"));
        assert!(denied.contains("-25308"));
        assert!(entitlement.contains("-34018"));
        assert_ne!(missing, unreadable);
        assert_ne!(missing, mismatch);
        assert_ne!(missing, denied);
        assert!(!unreadable.contains("No token saved"));
        assert!(!denied.contains("reading it back"));
        let secret = "mfa.not-a-real-token";
        assert!(!missing.contains(secret));
        assert!(!unreadable.contains(secret));
        assert!(!mismatch.contains(secret));
        assert!(!denied.contains(secret));
    }

    #[test]
    fn credential_errors_name_the_unsigned_macos_failures() {
        let keychain = credential_failure_message(
            "macOS Keychain",
            "A required entitlement isn't present. (-34018)",
        );
        assert!(keychain.contains("-34018"));
        assert!(keychain.contains("login keychain"));
        let prompt = credential_failure_message(
            "macOS Keychain",
            "User interaction is not allowed. (-25308)",
        );
        assert!(prompt.contains("-25308"));
        assert!(prompt.contains("main thread"));
        let unsigned = credential_failure_message(
            "macOS Keychain",
            "The code object is not signed at all (-67050)",
        );
        assert!(unsigned.contains("-67050"));
        assert!(unsigned.contains("Control-click"));
        let cancelled =
            credential_failure_message("macOS Keychain", "User canceled the operation. (-128)");
        assert!(cancelled.contains("cancelled"));
        assert!(!cancelled.contains("-128"));
        let secret = "mfa.super-secret-token-value";
        let generic = credential_failure_message(
            "Windows Credential Manager",
            &format!("{secret} {}", "x".repeat(200)),
        );
        assert!(!generic.contains(secret));
        assert!(generic.contains("Windows Credential Manager"));
    }

    #[test]
    fn notification_copy_names_the_host_os() {
        assert!(notification_note("macos").contains("Notification Center"));
        assert!(notification_note("windows").contains("Action Center"));
        assert!(notification_note("linux").contains("macOS"));
    }
}
