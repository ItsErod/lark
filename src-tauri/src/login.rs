//! Discord login window and QR session.
//! The login window is not in the command capability, so the page cannot call Lark.
//! Lark polls that window through captcha, 2FA, and later app routes until a session
//! token is actually present. The token is read with a native script callback, stored
//! in the OS credential store, and the window's data is cleared. It is not logged.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use lark_core::discord::page::{
    logged_in_discord_url, login_progress, login_wait_message, navigation_allowed,
};
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
const POLL_EVERY: Duration = Duration::from_millis(500);

struct LoginWatch {
    poll_id: AtomicU64,
    captured: AtomicBool,
    url: Mutex<String>,
    app_since: Mutex<Option<Instant>>,
}

fn watch() -> &'static LoginWatch {
    static WATCH: OnceLock<LoginWatch> = OnceLock::new();
    WATCH.get_or_init(|| LoginWatch {
        poll_id: AtomicU64::new(0),
        captured: AtomicBool::new(false),
        url: Mutex::new(LOGIN_URL.to_string()),
        app_since: Mutex::new(None),
    })
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|err| err.into_inner())
}

fn reset_watch() {
    let watch = watch();
    watch.captured.store(false, Ordering::SeqCst);
    *lock(&watch.url) = LOGIN_URL.to_string();
    *lock(&watch.app_since) = None;
}

fn note_location(href: &str) {
    if href.is_empty() {
        return;
    }
    let watch = watch();
    if logged_in_discord_url(href) {
        let mut since = lock(&watch.app_since);
        if since.is_none() {
            *since = Some(Instant::now());
        }
    }
    *lock(&watch.url) = href.to_string();
}

fn current_url() -> String {
    lock(&watch().url).clone()
}

fn app_visible_for_ms() -> Option<u64> {
    lock(&watch().app_since).map(|started| started.elapsed().as_millis() as u64)
}

pub fn open_discord_login(app: &AppHandle) -> Result<(), String> {
    let fresh = app.get_webview_window(LOGIN_LABEL).is_none();
    if fresh {
        reset_watch();
    }
    let poll_id = watch().poll_id.fetch_add(1, Ordering::SeqCst) + 1;
    let window = if fresh {
        build_login_window(app)?
    } else if let Some(existing) = app.get_webview_window(LOGIN_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        existing
    } else {
        build_login_window(app)?
    };
    let _ = window.set_focus();
    let _ = app.emit(
        "login-status",
        note("waiting", login_wait_message(&current_url())),
    );
    spawn_session_poll(app.clone(), poll_id);
    Ok(())
}

fn build_login_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let url = LOGIN_URL
        .parse()
        .map_err(|_| "Discord's login URL could not be parsed.".to_string())?;
    WebviewWindowBuilder::new(app, LOGIN_LABEL, WebviewUrl::External(url))
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
        .on_page_load(|window, payload| {
            let current = payload.url().as_str().to_string();
            note_location(&current);
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            if watch().captured.load(Ordering::SeqCst) {
                return;
            }
            let progress = login_progress(&current, app_visible_for_ms());
            if progress.phase == "failed" {
                return;
            }
            let _ = window
                .app_handle()
                .emit("login-status", note("waiting", progress.detail));
        })
        .build()
        .map_err(|err| format!("Couldn't open Discord's login page: {err}"))
}

fn spawn_session_poll(app: AppHandle, poll_id: u64) {
    tauri::async_runtime::spawn(async move {
        let mut announced = String::new();
        let mut reported_failure = false;
        loop {
            if watch().poll_id.load(Ordering::SeqCst) != poll_id {
                break;
            }
            if watch().captured.load(Ordering::SeqCst) {
                break;
            }
            let Some(window) = app.get_webview_window(LOGIN_LABEL) else {
                break;
            };
            if watch().poll_id.load(Ordering::SeqCst) != poll_id {
                break;
            }
            match probe_session(window).await {
                Probe::Closed => break,
                Probe::Pending { href } => {
                    if watch().poll_id.load(Ordering::SeqCst) == poll_id {
                        note_location(&href);
                    }
                }
                Probe::Token { mut raw, href } => {
                    if watch().poll_id.load(Ordering::SeqCst) != poll_id {
                        raw.zeroize();
                        break;
                    }
                    note_location(&href);
                    match store_session(&app, &raw) {
                        StoreResult::Saved => {
                            raw.zeroize();
                            break;
                        }
                        StoreResult::Invalid => raw.zeroize(),
                        StoreResult::Failed(err) => {
                            raw.zeroize();
                            if !reported_failure {
                                reported_failure = true;
                                let _ = app.emit("login-status", note("failed", &err));
                            }
                            tokio::time::sleep(Duration::from_secs(3)).await;
                        }
                    }
                }
            }
            if watch().poll_id.load(Ordering::SeqCst) != poll_id
                || watch().captured.load(Ordering::SeqCst)
            {
                break;
            }
            let progress = login_progress(&current_url(), app_visible_for_ms());
            if progress.phase == "failed" {
                if !reported_failure {
                    reported_failure = true;
                    let _ = app.emit("login-status", note("failed", progress.detail));
                }
            } else if !reported_failure && progress.detail != announced {
                announced = progress.detail.to_string();
                let _ = app.emit("login-status", note("waiting", progress.detail));
            }
            tokio::time::sleep(POLL_EVERY).await;
        }
    });
}

enum Probe {
    Closed,
    Pending { href: String },
    Token { raw: String, href: String },
}

enum StoreResult {
    Saved,
    Invalid,
    Failed(String),
}

async fn probe_session(window: WebviewWindow) -> Probe {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let slot = std::sync::Arc::new(Mutex::new(Some(tx)));
    let slot_for_callback = slot.clone();
    if window
        .eval_with_callback(READ_SESSION_JS, move |result| {
            if let Some(tx) = lock(&slot_for_callback).take() {
                let _ = tx.send(result);
            }
        })
        .is_err()
    {
        return Probe::Closed;
    }
    let mut result = match tokio::time::timeout(Duration::from_secs(3), rx).await {
        Ok(Ok(result)) => result,
        _ => {
            return Probe::Pending {
                href: String::new(),
            }
        }
    };
    let (raw, href) = split_probe(&result);
    result.zeroize();
    if raw.is_empty() {
        Probe::Pending { href }
    } else {
        Probe::Token { raw, href }
    }
}

fn split_probe(result: &str) -> (String, String) {
    let value =
        serde_json::from_str::<serde_json::Value>(result).unwrap_or(serde_json::Value::Null);
    let value = match value {
        serde_json::Value::String(inner) => {
            serde_json::from_str::<serde_json::Value>(&inner).unwrap_or(serde_json::Value::Null)
        }
        other => other,
    };
    match value {
        serde_json::Value::String(token) => (token, String::new()),
        serde_json::Value::Object(map) => {
            let token = map
                .get("token")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            let href = map
                .get("href")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            (token, href)
        }
        _ => (String::new(), String::new()),
    }
}

fn store_session(app: &AppHandle, raw: &str) -> StoreResult {
    if raw.is_empty() {
        return StoreResult::Invalid;
    }
    if watch().captured.swap(true, Ordering::SeqCst) {
        return StoreResult::Saved;
    }
    let token = match normalize_user_token(raw) {
        Ok(token) => token,
        Err(_) => {
            watch().captured.store(false, Ordering::SeqCst);
            return StoreResult::Invalid;
        }
    };
    let saved = keychain::on_main(app, move || {
        let result = keychain::save_token(&token);
        let mut token = token;
        token.zeroize();
        result
    });
    match saved {
        Ok(Ok(())) => {
            let app = app.clone();
            let _ = app.clone().run_on_main_thread(move || {
                if let Some(win) = app.get_webview_window(LOGIN_LABEL) {
                    let _ = win.clear_all_browsing_data();
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
            StoreResult::Saved
        }
        Ok(Err(err)) | Err(err) => {
            watch().captured.store(false, Ordering::SeqCst);
            StoreResult::Failed(err)
        }
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
