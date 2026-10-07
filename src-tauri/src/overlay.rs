//! Always-on-top voice HUD. The window only shows the roster the main window already tracks.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub const LABEL: &str = "voice-overlay";

#[derive(Clone, Copy)]
struct Hotkeys {
    voice: Option<Shortcut>,
    perf: Option<Shortcut>,
    game: Option<Shortcut>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum OverlayHotkey {
    Voice,
    Perf,
    Game,
}

static HOTKEYS: Mutex<Hotkeys> = Mutex::new(Hotkeys {
    voice: None,
    perf: None,
    game: None,
});
static FRAME: Mutex<Option<serde_json::Value>> = Mutex::new(None);

#[derive(Clone, Copy)]
struct OverlayChrome {
    visible: bool,
    click_through: bool,
    applied: bool,
}

static CHROME: Mutex<OverlayChrome> = Mutex::new(OverlayChrome {
    visible: false,
    click_through: false,
    applied: false,
});

/// Window chrome (`show`, always-on-top, click-through) is what hitches the main window.
/// Speaking ticks only need a new frame.
fn chrome_needs_apply(prev: OverlayChrome, visible: bool, click_through: bool) -> bool {
    !prev.applied || prev.visible != visible || prev.click_through != click_through
}

pub fn hotkey_kind(shortcut: &Shortcut) -> Option<OverlayHotkey> {
    let Ok(slot) = HOTKEYS.lock() else {
        return None;
    };
    if slot.voice.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Voice)
    } else if slot.perf.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Perf)
    } else if slot.game.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Game)
    } else {
        None
    }
}

/// Register the voice HUD, performance overlay, and Game Mode hotkeys on the one shortcut handler.
pub fn sync_hotkeys(app: &AppHandle, voice: &str, perf: &str, game: &str) {
    let next = Hotkeys {
        voice: parse_global(voice),
        perf: parse_global(perf),
        game: parse_global(game),
    };
    let mut slot = HOTKEYS.lock().unwrap_or_else(|err| err.into_inner());
    let prev = *slot;
    for old in [prev.voice, prev.perf, prev.game].into_iter().flatten() {
        if !hotkeys_contain(next, old) {
            if let Err(err) = app.global_shortcut().unregister(old) {
                log::warn!("overlay shortcut unregister: {err}");
            }
        }
    }
    for shortcut in [next.voice, next.perf, next.game].into_iter().flatten() {
        if hotkeys_contain(prev, shortcut) {
            continue;
        }
        if let Err(err) = app.global_shortcut().register(shortcut) {
            log::warn!("overlay shortcut register: {err}");
        }
    }
    *slot = next;
}

fn parse_global(shortcut: &str) -> Option<Shortcut> {
    let accel = lark_core::global_accelerator(shortcut).ok()?;
    accel.parse::<Shortcut>().ok()
}

fn hotkeys_contain(keys: Hotkeys, shortcut: Shortcut) -> bool {
    keys.voice == Some(shortcut) || keys.perf == Some(shortcut) || keys.game == Some(shortcut)
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
    let fresh = app.get_webview_window(LABEL).is_none();
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
    let prev = CHROME.lock().map(|guard| *guard).unwrap_or(OverlayChrome {
        visible: false,
        click_through: false,
        applied: false,
    });
    if fresh || chrome_needs_apply(prev, visible, click_through) {
        apply_chrome(&window, click_through);
        if visible {
            if let Err(err) = window.show() {
                log::warn!("voice HUD show: {err}");
                return Ok(false);
            }
        } else if let Err(err) = window.hide() {
            log::warn!("voice HUD hide: {err}");
        }
        if let Ok(mut slot) = CHROME.lock() {
            *slot = OverlayChrome {
                visible,
                click_through,
                applied: true,
            };
        }
    }
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
