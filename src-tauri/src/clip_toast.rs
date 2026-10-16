//! Clip-saved toast: a tiny always-on-top, click-through window with a short sound.
//! No game hooks; it shows over borderless fullscreen, not exclusive fullscreen.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "clip-toast";
const SHOW_MS: u64 = 2200;

static ENABLED: AtomicBool = AtomicBool::new(true);
static SHOWN: AtomicU64 = AtomicU64::new(0);

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
}

/// Page URL for one toast. Text is short and percent-encoded.
pub fn toast_url(ok: bool, text: &str) -> String {
    let text: String = text.chars().take(80).collect();
    let mut enc = String::new();
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            enc.push(b as char);
        } else {
            enc.push_str(&format!("%{b:02X}"));
        }
    }
    format!("clip-toast.html?ok={}&t={enc}", u8::from(ok))
}

pub fn show(app: &AppHandle, ok: bool, text: &str) {
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let url = toast_url(ok, text);
    let app = app.clone();
    // Building a webview on the hotkey thread deadlocks on Windows.
    tauri::async_runtime::spawn_blocking(move || {
        let id = SHOWN.fetch_add(1, Ordering::Relaxed) + 1;
        if let Some(old) = app.get_webview_window(LABEL) {
            let _ = old.destroy();
        }
        let built = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App(url.into()))
            .title("Lark Clip")
            .inner_size(260.0, 52.0)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .skip_taskbar(true)
            .focusable(false)
            .focused(false)
            .no_redirection_bitmap(true)
            .background_color(tauri::webview::Color(0, 0, 0, 0))
            .build();
        let window = match built {
            Ok(window) => window,
            Err(err) => {
                log::warn!("clip toast: {err}");
                return;
            }
        };
        let _ = window.set_ignore_cursor_events(true);
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let scale = monitor.scale_factor();
            let size = monitor.size().to_logical::<f64>(scale);
            let origin = monitor.position().to_logical::<f64>(scale);
            let _ = window.set_position(LogicalPosition::new(
                origin.x + (size.width - 260.0) / 2.0,
                origin.y + 24.0,
            ));
        }
        std::thread::sleep(Duration::from_millis(SHOW_MS));
        if SHOWN.load(Ordering::Relaxed) == id {
            let _ = window.destroy();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_encodes_and_caps_text() {
        assert_eq!(
            toast_url(true, "lark-clip-a b.mp4"),
            "clip-toast.html?ok=1&t=lark-clip-a%20b.mp4"
        );
        let long = "x".repeat(200);
        assert_eq!(
            toast_url(false, &long).len(),
            "clip-toast.html?ok=0&t=".len() + 80
        );
    }
}
