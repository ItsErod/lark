//! Always-on-top voice HUD. The window only shows the roster the main window already tracks.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub const LABEL: &str = "voice-overlay";

static HOTKEY: Mutex<Option<Shortcut>> = Mutex::new(None);
static FRAME: Mutex<Option<serde_json::Value>> = Mutex::new(None);

pub fn hotkey_is(shortcut: &Shortcut) -> bool {
    HOTKEY.lock().map(|slot| slot.as_ref() == Some(shortcut)).unwrap_or(false)
}

pub fn sync_hotkey(app: &AppHandle, shortcut: &str) {
    let Ok(accel) = lark_core::global_accelerator(shortcut) else {
        log::warn!("voice HUD shortcut is not valid");
        return;
    };
    let Ok(parsed) = accel.parse::<Shortcut>() else {
        log::warn!("voice HUD shortcut could not be registered");
        return;
    };
    let mut slot = HOTKEY.lock().unwrap_or_else(|err| err.into_inner());
    if slot.as_ref() == Some(&parsed) {
        return;
    }
    if let Some(prev) = slot.take() {
        if let Err(err) = app.global_shortcut().unregister(prev) {
            log::warn!("voice HUD shortcut unregister: {err}");
        }
    }
    match app.global_shortcut().register(parsed) {
        Ok(()) => *slot = Some(parsed),
        Err(err) => log::warn!("voice HUD shortcut register: {err}"),
    }
}

#[tauri::command]
pub fn current_voice_hud() -> Option<serde_json::Value> {
    FRAME.lock().ok().and_then(|guard| guard.clone())
}

#[tauri::command]
pub async fn sync_voice_overlay(
    app: AppHandle,
    visible: bool,
    click_through: bool,
    frame: serde_json::Value,
) -> Result<bool, String> {
    if let Ok(mut slot) = FRAME.lock() {
        *slot = Some(frame.clone());
    }
    let window = if let Some(window) = app.get_webview_window(LABEL) {
        window
    } else if visible {
        match open_overlay(&app) {
            Ok(window) => window,
            Err(err) => {
                log::warn!("voice HUD window: {err}");
                return Ok(false);
            }
        }
    } else {
        return Ok(true);
    };
    let _ = app.emit_to(LABEL, "voice-hud", frame);
    apply_chrome(&window, click_through);
    if visible {
        if let Err(err) = window.show() {
            log::warn!("voice HUD show: {err}");
            return Ok(false);
        }
    } else if let Err(err) = window.hide() {
        log::warn!("voice HUD hide: {err}");
    }
    apply_chrome(&window, click_through);
    Ok(true)
}

fn apply_chrome(window: &WebviewWindow, click_through: bool) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_ignore_cursor_events(click_through);
    let _ = window.set_focusable(!click_through);
}

fn open_overlay(app: &AppHandle) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
        .title("Lark Voice")
        .inner_size(240.0, 72.0)
        .min_inner_size(180.0, 48.0)
        .max_inner_size(280.0, 480.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .no_redirection_bitmap(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .build()
        .map_err(|err| err.to_string())?;
    place_top_right(&window);
    let handle = app.clone();
    let watched = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = watched.hide();
            let _ = handle.emit("voice-overlay-dismissed", ());
        }
    });
    Ok(window)
}

fn place_top_right(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return;
    }
    let size = monitor.size();
    let origin = monitor.position();
    let width = 240.0;
    let x = origin.x as f64 / scale + size.width as f64 / scale - width - 16.0;
    let y = origin.y as f64 / scale + 24.0;
    let _ = window.set_position(LogicalPosition::new(x, y));
}
