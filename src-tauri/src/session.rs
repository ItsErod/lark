//! Spotifast-style Discord sign-in.
//!
//! The login window is Discord's own page. A document-start script posts the
//! session from Discord's auth response to a loopback listener. Lark checks
//! that the OS credential store retained it before telling the app to connect.
//! The token is not logged. This path does not poll page storage.

use std::sync::atomic::{AtomicBool, Ordering};

use lark_core::discord::page::navigation_allowed;
use lark_core::discord::session::{
    accept_grant, bind_loopback, credential_retain_failure, install_script, random_state,
    retain_status, Retain, SessionError,
};
use lark_core::normalize_user_token;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::watch;
use zeroize::Zeroize;

use crate::keychain;

const LABEL: &str = "discord-session";
const LOGIN_URL: &str = "https://discord.com/login";
const WAITING: &str = "Finish password, captcha, and 2FA in Discord's window. Lark stores the session only after Discord returns it.";

static OPENING: AtomicBool = AtomicBool::new(false);

pub async fn open_discord_session(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        let _ = app.emit("login-status", note("waiting", WAITING));
        return Ok(());
    }
    if OPENING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let result = open_fresh(app).await;
    OPENING.store(false, Ordering::SeqCst);
    result
}

async fn open_fresh(app: &AppHandle) -> Result<(), String> {
    let (listener, port) = bind_loopback().map_err(|err| err.message().to_string())?;
    let state = random_state();
    let script = install_script(port, &state);
    let window = build_window(app, &script)?;
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let cancel_on_close = cancel_tx.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = cancel_on_close.send(true);
        }
    });
    let _ = window.set_focus();
    let _ = app.emit("login-status", note("waiting", WAITING));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = accept_grant(listener, &state, cancel_rx).await;
        finish(&app, outcome);
    });
    Ok(())
}

fn finish(app: &AppHandle, outcome: Result<String, SessionError>) {
    match outcome {
        Ok(mut raw) => match store_verified(app, &raw) {
            Ok(()) => {
                raw.zeroize();
                let app = app.clone();
                let _ = app.clone().run_on_main_thread(move || {
                    if let Some(win) = app.get_webview_window(LABEL) {
                        let _ = win.close();
                    }
                    let _ = app.emit(
                        "login-status",
                        note(
                            "saved",
                            "Saved in the system credential store. Checking it with Discord.",
                        ),
                    );
                });
            }
            Err(err) => {
                raw.zeroize();
                fail(app, &err);
            }
        },
        Err(SessionError::Cancelled) => {
            let app = app.clone();
            let _ = app.clone().run_on_main_thread(move || {
                let _ = app.emit("login-status", note("closed", ""));
            });
        }
        Err(err) => fail(app, err.message()),
    }
}

fn fail(app: &AppHandle, detail: &str) {
    let detail = detail.to_string();
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(win) = app.get_webview_window(LABEL) {
            let _ = win.close();
        }
        let _ = app.emit("login-status", note("failed", &detail));
    });
}

fn store_verified(app: &AppHandle, raw: &str) -> Result<(), String> {
    let mut token = normalize_user_token(raw)?;
    let to_store = token.clone();
    let saved = keychain::on_main(app, move || {
        let result = keychain::save_token(&to_store);
        let mut to_store = to_store;
        to_store.zeroize();
        result
    })?;
    saved?;
    let loaded = keychain::on_main(app, keychain::load_token)??;
    let kept = retain_status(loaded.as_deref(), &token) == Retain::Kept;
    if let Some(mut value) = loaded {
        value.zeroize();
    }
    token.zeroize();
    if kept {
        Ok(())
    } else {
        Err(credential_retain_failure(&keychain::store_label()))
    }
}

fn build_window(app: &AppHandle, script: &str) -> Result<tauri::WebviewWindow, String> {
    let url = LOGIN_URL
        .parse()
        .map_err(|_| "Discord's login URL could not be parsed.".to_string())?;
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .title("Sign in with Discord")
        .inner_size(480.0, 760.0)
        .min_inner_size(380.0, 560.0)
        .center()
        .focused(true)
        .incognito(true)
        .user_agent(login_user_agent())
        .initialization_script_for_all_frames(script)
        .on_navigation(|url| navigation_allowed(url.as_str()))
        .on_new_window(|url, _features| {
            if navigation_allowed(url.as_str()) {
                NewWindowResponse::Allow
            } else {
                NewWindowResponse::Deny
            }
        });
    apply_windows_args(builder)
        .build()
        .map_err(|err| format!("Couldn't open Discord's login page: {err}"))
}

fn apply_windows_args<R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: WebviewWindowBuilder<'_, R, M>,
) -> WebviewWindowBuilder<'_, R, M> {
    #[cfg(target_os = "windows")]
    {
        builder.additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,BlockInsecurePrivateNetworkRequests --allow-running-insecure-content",
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        builder
    }
}

fn login_user_agent() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
    }
    #[cfg(target_os = "windows")]
    {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}

fn note(phase: &str, detail: &str) -> serde_json::Value {
    serde_json::json!({
        "phase": phase,
        "detail": detail,
        "svg": "",
        "username": ""
    })
}
