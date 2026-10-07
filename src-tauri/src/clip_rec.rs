//! Rolling clip recorder.
//!
//! Samples the main display only while screen share or Game Mode capture is on.
//! The hotkey in `lib.rs` asks this module to write the ring to the clips folder.
//! Capture stays in this file so it does not share a window or overlay with voice.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use lark_core::clip::{prepare_frame, ClipBuffer, CLIP_SAMPLE_INTERVAL_MS, CLIP_WINDOW_MS};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipSaved {
    pub ok: bool,
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub frames: u32,
    pub span_ms: u64,
    pub error: String,
}

impl ClipSaved {
    fn ready(name: String, path: String, bytes: u64, frames: u32, span_ms: u64) -> Self {
        Self {
            ok: true,
            name,
            path,
            bytes,
            frames,
            span_ms,
            error: String::new(),
        }
    }

    pub fn failed(error: String) -> Self {
        Self {
            ok: false,
            name: String::new(),
            path: String::new(),
            bytes: 0,
            frames: 0,
            span_ms: 0,
            error,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipStatus {
    pub recording: bool,
    pub game_capture: bool,
    pub screen_share: bool,
    pub frames: u32,
    pub span_ms: u64,
    pub dir: String,
    pub backend: String,
    pub error: String,
    pub hotkey_error: String,
}

struct Inner {
    dir: PathBuf,
    buffer: Mutex<ClipBuffer>,
    share: AtomicBool,
    game: AtomicBool,
    last_error: Mutex<String>,
    hotkey_error: Mutex<String>,
    registered: Mutex<String>,
    plugin_ready: AtomicBool,
    last_save: Mutex<Option<(Instant, ClipSaved)>>,
    save_gate: Arc<Mutex<()>>,
    hotkey_gate: Arc<Mutex<()>>,
}

#[derive(Clone)]
pub struct ClipEngine {
    inner: Arc<Inner>,
}

impl ClipEngine {
    pub fn spawn(dir: PathBuf, game_capture: bool) -> Self {
        let inner = Arc::new(Inner {
            dir,
            buffer: Mutex::new(ClipBuffer::new(CLIP_WINDOW_MS)),
            share: AtomicBool::new(false),
            game: AtomicBool::new(game_capture),
            last_error: Mutex::new(String::new()),
            hotkey_error: Mutex::new(String::new()),
            registered: Mutex::new(String::new()),
            plugin_ready: AtomicBool::new(false),
            last_save: Mutex::new(None),
            save_gate: Arc::new(Mutex::new(())),
            hotkey_gate: Arc::new(Mutex::new(())),
        });
        let engine = Self {
            inner: inner.clone(),
        };
        thread::Builder::new()
            .name("lark-clip".into())
            .spawn(move || sample_loop(inner))
            .expect("clip thread");
        engine
    }

    pub fn set_plugin_ready(&self) {
        self.inner.plugin_ready.store(true, Ordering::Relaxed);
    }

    pub fn plugin_ready(&self) -> bool {
        self.inner.plugin_ready.load(Ordering::Relaxed)
    }

    pub fn set_share(&self, on: bool) {
        self.inner.share.store(on, Ordering::Relaxed);
        self.clear_if_idle();
    }

    pub fn set_game(&self, on: bool) {
        self.inner.game.store(on, Ordering::Relaxed);
        self.clear_if_idle();
    }

    pub fn hotkey_lock(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.inner.hotkey_gate)
    }

    pub fn registered_hotkey(&self) -> String {
        self.inner
            .registered
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone()
    }

    pub fn set_registered_hotkey(&self, accel: String) {
        *self
            .inner
            .registered
            .lock()
            .unwrap_or_else(|err| err.into_inner()) = accel;
    }

    pub fn set_hotkey_error(&self, error: String) {
        *self
            .inner
            .hotkey_error
            .lock()
            .unwrap_or_else(|err| err.into_inner()) = error;
    }

    pub fn status(&self) -> ClipStatus {
        let buffer = self
            .inner
            .buffer
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        let share = self.inner.share.load(Ordering::Relaxed);
        let game = self.inner.game.load(Ordering::Relaxed);
        ClipStatus {
            recording: share || game,
            game_capture: game,
            screen_share: share,
            frames: buffer.len() as u32,
            span_ms: buffer.span_ms(),
            dir: self.inner.dir.display().to_string(),
            backend: capture_backend().to_string(),
            error: self
                .inner
                .last_error
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .clone(),
            hotkey_error: self
                .inner
                .hotkey_error
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .clone(),
        }
    }

    pub fn save(&self) -> Result<ClipSaved, String> {
        let gate = Arc::clone(&self.inner.save_gate);
        let _held = gate.lock().unwrap_or_else(|err| err.into_inner());
        if let Some(recent) = self.recent_save() {
            return Ok(recent);
        }
        let clip = {
            let buffer = self
                .inner
                .buffer
                .lock()
                .unwrap_or_else(|err| err.into_inner());
            if buffer.is_empty() {
                return Err(self.empty_reason());
            }
            buffer.export()?
        };
        let _ = std::fs::create_dir_all(&self.inner.dir);
        let name = unique_name(&self.inner.dir);
        let path = self.inner.dir.join(&name);
        std::fs::write(&path, &clip.bytes)
            .map_err(|err| format!("Couldn't write the clip: {err}"))?;
        let saved = ClipSaved::ready(
            name,
            path.display().to_string(),
            clip.bytes.len() as u64,
            clip.frames,
            clip.span_ms,
        );
        *self
            .inner
            .last_save
            .lock()
            .unwrap_or_else(|err| err.into_inner()) = Some((Instant::now(), saved.clone()));
        Ok(saved)
    }

    pub fn read_base64(&self, name: &str) -> Result<String, String> {
        let path = resolve_clip(&self.inner.dir, name)?;
        let bytes = std::fs::read(&path).map_err(|err| format!("Couldn't read the clip: {err}"))?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err("That clip is over 8 MB, so Lark will not attach it.".into());
        }
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    }

    pub fn clip_path(&self, name: &str) -> Result<PathBuf, String> {
        resolve_clip(&self.inner.dir, name)
    }

    pub fn dir(&self) -> &Path {
        &self.inner.dir
    }

    fn recent_save(&self) -> Option<ClipSaved> {
        let saved = self
            .inner
            .last_save
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        let (at, clip) = saved.as_ref()?;
        if at.elapsed() < Duration::from_millis(1200) {
            Some(clip.clone())
        } else {
            None
        }
    }

    fn empty_reason(&self) -> String {
        let detail = self
            .inner
            .last_error
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone();
        if detail.is_empty() {
            "Nothing to save. The clip buffer runs only while screen share or Game Mode capture is on, and it is discarded when both are off.".into()
        } else {
            format!("Nothing to save. {detail}")
        }
    }

    fn clear_if_idle(&self) {
        if !self.inner.share.load(Ordering::Relaxed) && !self.inner.game.load(Ordering::Relaxed) {
            self.inner
                .buffer
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .clear();
        }
    }
}

fn sample_loop(inner: Arc<Inner>) {
    let started = Instant::now();
    let mut was_active = false;
    loop {
        let active = inner.share.load(Ordering::Relaxed) || inner.game.load(Ordering::Relaxed);
        if !active {
            if was_active {
                inner
                    .buffer
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .clear();
                was_active = false;
            }
            thread::sleep(Duration::from_millis(100));
            continue;
        }
        was_active = true;
        let tick = Instant::now();
        match grab_primary_rgba() {
            Ok((rgba, width, height)) => {
                if inner.share.load(Ordering::Relaxed) || inner.game.load(Ordering::Relaxed) {
                    let at_ms = started.elapsed().as_millis() as u64;
                    match prepare_frame(&rgba, width, height, at_ms) {
                        Ok(frame) => {
                            inner
                                .buffer
                                .lock()
                                .unwrap_or_else(|err| err.into_inner())
                                .push(frame);
                            *inner
                                .last_error
                                .lock()
                                .unwrap_or_else(|err| err.into_inner()) = String::new();
                        }
                        Err(err) => {
                            *inner.last_error.lock().unwrap_or_else(|e| e.into_inner()) = err
                        }
                    }
                }
            }
            Err(err) => *inner.last_error.lock().unwrap_or_else(|e| e.into_inner()) = err,
        }
        let rest = Duration::from_millis(CLIP_SAMPLE_INTERVAL_MS).saturating_sub(tick.elapsed());
        thread::sleep(rest);
    }
}

fn unique_name(dir: &Path) -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let name = lark_core::clip::clip_file_name(secs);
    if !dir.join(&name).exists() {
        return name;
    }
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("lark-clip-{millis}.avi")
}

fn resolve_clip(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !lark_core::clip::is_clip_name(name) {
        return Err("That clip name is not valid.".into());
    }
    let path = dir.join(name);
    if !path.is_file() {
        return Err("That clip is not in the clips folder.".into());
    }
    let dir = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    let file = path
        .canonicalize()
        .map_err(|_| "That clip is not in the clips folder.".to_string())?;
    if !file.starts_with(&dir) {
        return Err("That clip is not in the clips folder.".into());
    }
    Ok(file)
}

pub fn capture_backend() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Core Graphics"
    }
    #[cfg(target_os = "windows")]
    {
        "GDI"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "unavailable"
    }
}

pub fn reveal_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-R", &path.display().to_string()])
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Finder could not show that clip.".into())
        }
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map(|_| ())
            .map_err(|err| err.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
        Err("Showing a clip is available in the macOS and Windows apps.".into())
    }
}

pub fn open_dir(dir: &Path) -> Result<(), String> {
    let _ = std::fs::create_dir_all(dir);
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg(dir)
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Finder could not open the clips folder.".into())
        }
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map(|_| ())
            .map_err(|err| err.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("The clips folder opens in the macOS and Windows apps.".into())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn grab_primary_rgba() -> Result<(Vec<u8>, u32, u32), String> {
    let monitors = xcap::Monitor::all().map_err(|err| err.to_string())?;
    if monitors.is_empty() {
        return Err("No display found.".into());
    }
    let index = monitors
        .iter()
        .position(|monitor| monitor.is_primary().unwrap_or(false))
        .unwrap_or(0);
    let image = monitors[index].capture_image().map_err(|err| {
        format!(
            "Couldn't capture the main display: {err}. {}",
            permission_hint()
        )
    })?;
    let width = image.width();
    let height = image.height();
    if width == 0 || height == 0 {
        return Err(format!(
            "The display capture was empty. {}",
            permission_hint()
        ));
    }
    Ok((image.into_raw(), width, height))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn permission_hint() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "On macOS, allow Lark under System Settings → Privacy & Security → Screen Recording, then turn capture on again."
    }
    #[cfg(target_os = "windows")]
    {
        "A game using exclusive fullscreen can come out black; borderless and windowed games are captured."
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn grab_primary_rgba() -> Result<(Vec<u8>, u32, u32), String> {
    Err("Clips record the main display on macOS and Windows.".into())
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    #[test]
    fn default_clip_hotkey_parses_as_a_global_shortcut() {
        let accel = lark_core::clip::global_accelerator("mod+shift+c").unwrap();
        tauri_plugin_global_shortcut::Shortcut::from_str(&accel).expect(&accel);
    }
}
