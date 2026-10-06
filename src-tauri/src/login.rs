//! Discord login window and QR session.
//! The login window is not in the command capability, so the page cannot call Lark.
//! The token is read with a native script callback, stored in the OS credential store,
//! and the window's data is cleared. It is not logged and not emitted to the UI.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use lark_core::discord::page::{logged_in_discord_url, navigation_allowed};
use lark_core::discord::remote_auth::{login_with_qr, QrOutcome};
use lark_core::normalize_user_token;
use lark_core::token::READ_SESSION_JS;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::watch;
use zeroize::Zeroize;

use crate::keychain;

const LOGIN_LABEL: &str = "discord-login";
const LOGIN_URL: &str = "https://discord.com/login";

pub fn open_discord_login(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(LOGIN_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    let captured = Arc::new(AtomicBool::new(false));
    let flag = captured.clone();
    let url = LOGIN_URL
        .parse()
        .map_err(|_| "Discord's login URL could not be parsed.".to_string())?;
    let window = WebviewWindowBuilder::new(app, LOGIN_LABEL, WebviewUrl::External(url))
        .title("Sign in with Discord")
        .inner_size(480.0, 760.0)
        .min_inner_size(380.0, 560.0)
        .incognito(true)
        .on_navigation(|url| navigation_allowed(url.as_str()))
        .on_new_window(|url, _features| {
            if navigation_allowed(url.as_str()) {
                NewWindowResponse::Allow
            } else {
                NewWindowResponse::Deny
            }
        })
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            if !logged_in_discord_url(payload.url().as_str()) {
                return;
            }
            read_session(window, flag.clone(), 0);
        })
        .build()
        .map_err(|err| format!("Couldn't open Discord's login page: {err}"))?;
    let _ = window.set_focus();
    let _ = app.emit(
        "login-status",
        note(
            "opened",
            "Discord's login window is open. Password, 2FA, and the captcha stay on Discord's page.",
        ),
    );
    Ok(())
}

fn read_session(window: WebviewWindow, flag: Arc<AtomicBool>, attempt: u8) {
    let app = window.app_handle().clone();
    let win = window.clone();
    let app_for_callback = app.clone();
    let flag_for_callback = flag.clone();
    if let Err(err) = window.eval_with_callback(READ_SESSION_JS, move |result| {
        let raw = parse_eval_string(&result);
        if raw.is_empty() && attempt < 4 {
            let retry_window = win.clone();
            let retry_flag = flag_for_callback.clone();
            let retry_app = app_for_callback.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(350)).await;
                let _ = retry_app.run_on_main_thread(move || {
                    read_session(retry_window, retry_flag, attempt + 1);
                });
            });
            return;
        }
        capture_token(&app_for_callback, &win, &flag_for_callback, &result);
    }) {
        let _ = app.emit(
            "login-status",
            note(
                "failed",
                &format!("Couldn't read the Discord session from the login window: {err}"),
            ),
        );
    }
}

fn capture_token(app: &AppHandle, window: &WebviewWindow, flag: &Arc<AtomicBool>, result: &str) {
    let mut raw = parse_eval_string(result);
    if raw.is_empty() {
        let _ = app.emit(
            "login-status",
            note(
                "failed",
                "Discord opened the app, but the page had no session token. Finish login in that window, including 2FA, then try again.",
            ),
        );
        return;
    }
    if flag.swap(true, Ordering::SeqCst) {
        raw.zeroize();
        return;
    }
    let token = match normalize_user_token(&raw) {
        Ok(token) => token,
        Err(err) => {
            raw.zeroize();
            flag.store(false, Ordering::SeqCst);
            let _ = app.emit("login-status", note("failed", &err));
            return;
        }
    };
    raw.zeroize();
    let saved = keychain::on_main(app, move || {
        let result = keychain::save_token(&token);
        let mut token = token;
        token.zeroize();
        result
    });
    match saved {
        Ok(Ok(())) => {
            let win = window.clone();
            let app = app.clone();
            let _ = app.clone().run_on_main_thread(move || {
                let _ = win.clear_all_browsing_data();
                let _ = win.close();
                let _ = app.emit(
                    "login-status",
                    note(
                        "saved",
                        "Saved in the system credential store. Checking it with Discord.",
                    ),
                );
            });
        }
        Ok(Err(err)) | Err(err) => {
            flag.store(false, Ordering::SeqCst);
            let _ = app.emit("login-status", note("failed", &err));
        }
    }
}

fn parse_eval_string(result: &str) -> String {
    serde_json::from_str::<String>(result).unwrap_or_default()
}

fn note(phase: &str, detail: &str) -> serde_json::Value {
    serde_json::json!({
        "phase": phase,
        "detail": detail,
        "svg": "",
        "username": ""
    })
}

pub fn spawn_qr(app: AppHandle, stop: watch::Receiver<bool>) {
    tauri::async_runtime::spawn(async move {
        match login_with_qr(
            {
                let app = app.clone();
                move |update| {
                    let _ = app.emit("qr-login", update);
                }
            },
            stop,
        )
        .await
        {
            Ok(QrOutcome::Ready(token)) => match keychain::on_main(&app, move || {
                let result = keychain::save_token(&token);
                let mut token = token;
                token.zeroize();
                result
            }) {
                Ok(Ok(())) => {
                    let _ = app.emit("qr-login", note("done", ""));
                }
                Ok(Err(err)) | Err(err) => {
                    let _ = app.emit("qr-login", note("stopped", &err));
                }
            },
            Ok(QrOutcome::Cancelled) => {}
            Err(err) => {
                let _ = app.emit("qr-login", note("stopped", &err));
            }
        }
    });
}
