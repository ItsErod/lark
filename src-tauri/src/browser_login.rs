//! System-browser Discord sign-in.
//!
//! Opens Discord's own login page in the system browser and waits for a
//! one-time grant on 127.0.0.1. The separate login window is not opened or closed.

use std::process::{Command, Stdio};
use std::thread;

use lark_core::discord::browser_handoff::{
    bind_loopback, browser_login_url, finish_browser_login, is_browser_login_url, new_handoff_key,
    GrantError, BROWSER_LOGIN_TIMEOUT,
};
use lark_core::normalize_user_token;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;
use zeroize::Zeroize;

use crate::keychain;

const WAITING: &str = "Waiting for Discord in your browser. Finish password, captcha, and 2FA there. Lark is waiting for a one-time grant.";
const SAVED: &str = "Saved in the system credential store. Checking it with Discord.";

pub async fn start(
    app: AppHandle,
    stop: watch::Receiver<bool>,
    cancel: watch::Sender<bool>,
) -> Result<(), String> {
    let listener = bind_loopback().await?;
    let port = listener
        .local_addr()
        .map_err(|_| "Couldn't read the loopback sign-in port.".to_string())?
        .port();
    let key = new_handoff_key();
    let url = browser_login_url(port, &key)?;
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        match finish_browser_login(listener, key, stop, BROWSER_LOGIN_TIMEOUT).await {
            Ok(token) => store_session(&app_for_task, token),
            Err(err) => emit_failure(&app_for_task, err),
        }
    });
    if let Err(err) = open_system_browser(&url) {
        let _ = cancel.send(true);
        return Err(err);
    }
    let _ = app.emit("login-status", note("waiting", WAITING));
    Ok(())
}

fn store_session(app: &AppHandle, mut raw: String) {
    let token = match normalize_user_token(&raw) {
        Ok(token) => token,
        Err(_) => {
            raw.zeroize();
            let _ = app.emit(
                "login-status",
                note("failed", "Discord's sign-in grant was not a user session."),
            );
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
            let _ = app.emit("login-status", note("saved", SAVED));
        }
        Ok(Err(err)) | Err(err) => {
            let _ = app.emit("login-status", note("failed", &err));
        }
    }
}

fn emit_failure(app: &AppHandle, err: GrantError) {
    if let Some(detail) = err.detail() {
        let _ = app.emit("login-status", note("failed", detail));
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

fn open_system_browser(url: &str) -> Result<(), String> {
    if !is_browser_login_url(url) {
        return Err("Refusing to open a sign-in page that is not Discord's login.".into());
    }
    let mut command = browser_command(url);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Couldn't open the system browser for Discord's login page.".to_string())?;
    thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn browser_command(url: &str) -> Command {
    if cfg!(target_os = "windows") {
        let mut command = Command::new("explorer");
        command.arg(url);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(url);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    }
}
