//! System-browser Discord sign-in.
//!
//! Opens Discord's own login page in the system browser and waits for a
//! one-time grant on 127.0.0.1. The separate login window is not opened or closed.

use std::process::{Command, Stdio};
use std::thread;

use lark_core::discord::browser_handoff::{
    bind_loopback, browser_login_url, finish_browser_login, is_browser_login_url, new_handoff_key,
    system_browser, GrantError, SystemBrowser, BROWSER_LOGIN_TIMEOUT,
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

/// Open the plugin store page and nothing else.
pub fn open_exact_https(url: &str) -> Result<(), String> {
    if url != "https://itserod.github.io/lark/store/" {
        return Err("That page is not the Lark store.".into());
    }
    match system_browser(std::env::consts::OS) {
        SystemBrowser::ShellExecute => shell_execute_https(url),
        SystemBrowser::MacOpen => spawn_detached("open", url),
        SystemBrowser::XdgOpen => spawn_detached("xdg-open", url),
    }
}

/// Open a Discord settings page in the system browser. Never `cmd` or Explorer.
pub fn open_discord_https(url: &str) -> Result<(), String> {
    if !lark_core::discord::rest::discord_settings_url_ok(url) {
        return Err("That link is not a Discord page.".into());
    }
    match system_browser(std::env::consts::OS) {
        SystemBrowser::ShellExecute => shell_execute_https(url),
        SystemBrowser::MacOpen => spawn_detached("open", url),
        SystemBrowser::XdgOpen => spawn_detached("xdg-open", url),
    }
}

fn open_system_browser(url: &str) -> Result<(), String> {
    if !is_browser_login_url(url) {
        return Err("Refusing to open a sign-in page that is not Discord's login.".into());
    }
    // The login URL always contains `?` and `=`. On Windows those characters are
    // Explorer switches, so launching Explorer opens a folder window.
    match system_browser(std::env::consts::OS) {
        SystemBrowser::ShellExecute => shell_execute_https(url),
        SystemBrowser::MacOpen => spawn_detached("open", url),
        SystemBrowser::XdgOpen => spawn_detached("xdg-open", url),
    }
}

fn spawn_detached(program: &str, url: &str) -> Result<(), String> {
    let mut command = Command::new(program);
    command.arg(url);
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

/// Opens an https URL with the default browser via `ShellExecuteW`.
/// Never `explorer.exe` and never `cmd /c start`: `?` and `=` would be treated as
/// Explorer switches, and `&` would be a `cmd` command separator.
#[cfg(windows)]
fn shell_execute_https(url: &str) -> Result<(), String> {
    let url = url.to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    thread::Builder::new()
        .name("lark-browser".into())
        .spawn(move || {
            let _ = tx.send(shell_execute_on_this_thread(&url));
        })
        .map_err(|_| "Couldn't open the system browser for Discord's login page.".to_string())?;
    rx.recv()
        .map_err(|_| "Couldn't open the system browser for Discord's login page.".to_string())?
}

#[cfg(windows)]
fn shell_execute_on_this_thread(url: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    const COINIT_APARTMENTTHREADED: u32 = 0x2;
    const COINIT_DISABLE_OLE1DDE: u32 = 0x4;
    const SW_SHOWNORMAL: i32 = 1;
    const RPC_E_CHANGED_MODE: i32 = 0x8001_0106u32 as i32;

    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *mut std::ffi::c_void, coinit: u32) -> i32;
        fn CoUninitialize();
    }

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut std::ffi::c_void,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }

    let verb: Vec<u16> = OsStr::new("open")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let file: Vec<u16> = OsStr::new(url)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let hr = CoInitializeEx(
            std::ptr::null_mut(),
            COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE,
        );
        let uninit = hr == 0 || hr == 1;
        if hr != 0 && hr != 1 && hr != RPC_E_CHANGED_MODE {
            return Err("Couldn't open the system browser for Discord's login page.".into());
        }
        let inst = ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );
        if uninit {
            CoUninitialize();
        }
        if inst > 32 {
            Ok(())
        } else {
            Err("Couldn't open the system browser for Discord's login page.".into())
        }
    }
}

#[cfg(not(windows))]
fn shell_execute_https(_url: &str) -> Result<(), String> {
    Err("ShellExecute is only used on Windows.".into())
}
