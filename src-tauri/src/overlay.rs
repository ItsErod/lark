//! Always-on-top voice HUD. The window only shows the roster the main window already tracks.

use std::sync::Mutex;

use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub const LABEL: &str = "voice-overlay";

#[derive(Clone, Copy)]
struct Hotkeys {
    voice: Option<Shortcut>,
    perf: Option<Shortcut>,
    game: Option<Shortcut>,
    mute: Option<Shortcut>,
    deafen: Option<Shortcut>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OverlayHotkey {
    Voice,
    Perf,
    Game,
    Mute,
    Deafen,
}

static HOTKEYS: Mutex<Hotkeys> = Mutex::new(Hotkeys {
    voice: None,
    perf: None,
    game: None,
    mute: None,
    deafen: None,
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
    classify_hotkey(&slot, shortcut)
}

/// Voice, performance, and Game Mode win when they share a chord with mute or deafen.
fn classify_hotkey(keys: &Hotkeys, shortcut: &Shortcut) -> Option<OverlayHotkey> {
    if keys.voice.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Voice)
    } else if keys.perf.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Perf)
    } else if keys.game.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Game)
    } else if keys.mute.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Mute)
    } else if keys.deafen.as_ref() == Some(shortcut) {
        Some(OverlayHotkey::Deafen)
    } else {
        None
    }
}

/// Register HUD, Game Mode, mute, and deafen on the one shortcut handler.
/// Mute and deafen are last so an existing overlay chord keeps its job.
pub fn sync_hotkeys(app: &AppHandle, voice: &str, perf: &str, game: &str, mute: &str, deafen: &str) {
    let next = Hotkeys {
        voice: parse_global(voice),
        perf: parse_global(perf),
        game: parse_global(game),
        mute: parse_global(mute),
        deafen: parse_global(deafen),
    };
    let mut slot = HOTKEYS.lock().unwrap_or_else(|err| err.into_inner());
    let prev = *slot;
    let mut dropped = Vec::new();
    for old in chords(prev).into_iter().flatten() {
        if !hotkeys_contain(next, old) && !dropped.contains(&old) {
            dropped.push(old);
            if let Err(err) = app.global_shortcut().unregister(old) {
                log::warn!("overlay shortcut unregister: {err}");
            }
        }
    }
    let mut added = Vec::new();
    for shortcut in chords(next).into_iter().flatten() {
        if hotkeys_contain(prev, shortcut) || added.contains(&shortcut) {
            continue;
        }
        added.push(shortcut);
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

fn chords(keys: Hotkeys) -> [Option<Shortcut>; 5] {
    [keys.voice, keys.perf, keys.game, keys.mute, keys.deafen]
}

fn hotkeys_contain(keys: Hotkeys, shortcut: Shortcut) -> bool {
    chords(keys).into_iter().flatten().any(|slot| slot == shortcut)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(raw: &str) -> Shortcut {
        parse_global(raw).unwrap_or_else(|| panic!("shortcut {raw}"))
    }

    #[test]
    fn overlay_chords_win_and_mute_still_matches() {
        let voice = parsed("mod+shift+o");
        let keys = Hotkeys {
            voice: Some(voice),
            perf: Some(parsed("mod+shift+p")),
            game: None,
            mute: Some(voice),
            deafen: Some(parsed("mod+shift+d")),
        };
        assert_eq!(classify_hotkey(&keys, &voice), Some(OverlayHotkey::Voice));
        assert_eq!(
            classify_hotkey(&keys, &parsed("mod+shift+d")),
            Some(OverlayHotkey::Deafen)
        );
        assert_eq!(
            classify_hotkey(&keys, &parsed("mod+shift+alt+m")),
            None
        );
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
