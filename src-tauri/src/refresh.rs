//! Ask the webview to follow the monitor, up to 240 fps.
//!
//! The page itself only schedules a paint when something changed, and it drops
//! vsyncs that would exceed the cap. This module is the native half: where the
//! toolkit can unlock a 60 Hz default, do that without turning vsync off.

use tauri::WebviewWindow;

pub fn prefer_native_refresh(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    macos::apply(window);
    #[cfg(not(target_os = "macos"))]
    {
        // Windows: WebView2 presents through DWM, which vsyncs to the monitor
        // on current runtimes. There is no public call to prefer a rate, and
        // `--disable-gpu-vsync` / `--disable-frame-rate-limit` would spin the
        // GPU while the page is idle, so those flags are not set.
        // Linux: WebKitGTK follows the compositor. Neither platform gets a
        // 16 ms timer from Lark.
        let _ = window;
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::WebviewWindow;
    use std::ffi::c_void;
    use std::os::raw::{c_char, c_float};

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct FrameRateRange {
        minimum: c_float,
        maximum: c_float,
        preferred: c_float,
    }

    #[link(name = "objc", kind = "dylib")]
    extern "C" {
        fn objc_msgSend();
        fn sel_registerName(name: *const c_char) -> *mut c_void;
    }

    #[link(name = "QuartzCore", kind = "framework")]
    extern "C" {}

    /// macOS 14+ can leave WKWebView at 60 Hz on ProMotion and high-refresh
    /// displays unless the layer asks for a range. 10–240, preferred 240, lets
    /// the system pick the panel rate and refuses anything above 240.
    /// macOS 11–13 do not have `setPreferredFrameRateRange:`.
    pub fn apply(window: &WebviewWindow) {
        let _ = window.with_webview(|webview| unsafe {
            let view = webview.inner();
            if view.is_null() {
                return;
            }
            send_bool(view, b"setWantsLayer:\0", true);
            let layer = send(view, b"layer\0");
            if layer.is_null() {
                return;
            }
            let setter = sel_registerName(b"setPreferredFrameRateRange:\0".as_ptr().cast());
            if !responds(layer, setter) {
                return;
            }
            let range = FrameRateRange {
                minimum: 10.0,
                maximum: 240.0,
                preferred: 240.0,
            };
            let set_range: unsafe extern "C" fn(*mut c_void, *mut c_void, FrameRateRange) =
                std::mem::transmute(objc_msgSend as *const ());
            set_range(layer, setter, range);
        });
    }

    unsafe fn send(obj: *mut c_void, name: &[u8]) -> *mut c_void {
        let call: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        call(obj, sel_registerName(name.as_ptr().cast()))
    }

    unsafe fn send_bool(obj: *mut c_void, name: &[u8], value: bool) {
        let call: unsafe extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        call(obj, sel_registerName(name.as_ptr().cast()), value);
    }

    unsafe fn responds(obj: *mut c_void, sel: *mut c_void) -> bool {
        let call: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> u8 =
            std::mem::transmute(objc_msgSend as *const ());
        call(
            obj,
            sel_registerName(b"respondsToSelector:\0".as_ptr().cast()),
            sel,
        ) != 0
    }
}
