//! Signed interface bundles.
//!
//! A release build can boot a bundle unpacked under the app config directory.
//! The bundle is checked against the Ed25519 key in `interface.json` and its
//! sha256. If it does not report ready within 10 seconds, it is deleted, marked
//! bad, and the last good bundle (or the packaged UI) is loaded instead.

use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

pub const BOOT_TIMEOUT: Duration = Duration::from_secs(10);
pub const PAGES_ORIGIN: &str = "https://itserod.github.io/lark";
const MAX_ZIP: usize = 40 * 1024 * 1024;
const MAX_UNPACKED: u64 = 80 * 1024 * 1024;
const MAX_FILES: usize = 2_000;
const CSP: &str = "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob: https://cdn.discordapp.com https://media.discordapp.net https://*.discordapp.com https://*.discordapp.net https://media.tenor.com https://c.tenor.com https://media.giphy.com https://i.giphy.com https://*.giphy.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:47321 ws://127.0.0.1:47321; script-src 'self' 'unsafe-eval'";

#[derive(Deserialize)]
struct PublishedKey {
    #[serde(rename = "publicKey")]
    public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleMeta {
    pub build: u64,
    pub version: String,
    pub min_native: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HotState {
    pub channel: String,
    pub good: Option<BundleMeta>,
    pub pending: Option<BundleMeta>,
    pub bad: Vec<u64>,
    pub force_builtin: bool,
    pub skipped_build: u64,
    pub reload_ready: bool,
    pub loaded_build: u64,
    pub loaded_version: String,
}

impl Default for HotState {
    fn default() -> Self {
        Self {
            channel: "stable".into(),
            good: None,
            pending: None,
            bad: Vec::new(),
            force_builtin: false,
            skipped_build: 0,
            reload_ready: false,
            loaded_build: 0,
            loaded_version: String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub version: String,
    pub build: u64,
    pub min_native: String,
    pub sha256: String,
    pub signature: String,
    pub created: String,
    pub file: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reject {
    Current,
    Skipped,
    Bad,
    Incompatible { min_native: String },
    Malformed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootKind {
    Builtin,
    Bundle,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceStatus {
    pub channel: String,
    pub source: String,
    pub build: u64,
    pub version: String,
    pub pending_build: u64,
    pub pending_version: String,
    pub reload_ready: bool,
    pub bad: Vec<u64>,
    pub native_version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceReport {
    pub status: InterfaceStatus,
    pub outcome: String,
    pub message: String,
}

struct Inner {
    watch: u64,
    serving: Option<PathBuf>,
}

pub struct UiRuntime {
    root: PathBuf,
    native_version: String,
    inner: Mutex<Inner>,
}

pub fn manage(app: &AppHandle) {
    let root = match app.path().app_config_dir() {
        Ok(dir) => dir.join("ui-hot"),
        Err(err) => {
            log::warn!("interface dir: {err}");
            return;
        }
    };
    if let Err(err) = fs::create_dir_all(&root) {
        log::warn!("interface dir: {err}");
        return;
    }
    let native_version = app.package_info().version.to_string();
    app.manage(UiRuntime {
        root,
        native_version,
        inner: Mutex::new(Inner { watch: 0, serving: None }),
    });
}

pub fn startup(app: &AppHandle) {
    // The dev server is the interface. A bundle is only booted from an installed build.
    #[cfg(not(dev))]
    {
        let Some(runtime) = app.try_state::<UiRuntime>() else {
            return;
        };
        let state = read_state(&runtime.root).unwrap_or_default();
        let bundled = serving_dir(&runtime.root, &state).is_some();
        if !bundled && !state.reload_ready {
            return;
        }
        if let Err(err) = reload_interface(app) {
            log::warn!("interface boot: {err}");
        }
    }
    #[cfg(dev)]
    {
        let _ = app;
    }
}

pub fn serve(app: &AppHandle, request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let Some(runtime) = app.try_state::<UiRuntime>() else {
        return empty(404);
    };
    let dir = runtime.inner.lock().ok().and_then(|inner| inner.serving.clone());
    let Some(dir) = dir else {
        return empty(404);
    };
    let rel = request_path(request.uri().path());
    let Some(rel) = rel else {
        return empty(404);
    };
    let file = dir.join(&rel);
    if !file.starts_with(&dir) {
        return empty(404);
    }
    match fs::read(&file) {
        Ok(body) => response(200, mime_of(&file), body),
        Err(_) => empty(404),
    }
}

pub fn status(app: &AppHandle) -> InterfaceStatus {
    let Some(runtime) = app.try_state::<UiRuntime>() else {
        return missing_status();
    };
    let state = read_state(&runtime.root).unwrap_or_default();
    view_status(&state, &runtime.native_version)
}

pub fn set_channel(app: &AppHandle, channel: &str) -> Result<InterfaceStatus, String> {
    let runtime = runtime(app)?;
    let mut state = read_state(&runtime.root)?;
    apply_channel(&mut state, channel)?;
    write_state(&runtime.root, &state)?;
    Ok(view_status(&state, &runtime.native_version))
}

pub fn reset_to_builtin(app: &AppHandle) -> Result<InterfaceStatus, String> {
    let runtime = runtime(app)?;
    let mut state = read_state(&runtime.root)?;
    apply_reset(&runtime.root, &mut state)?;
    write_state(&runtime.root, &state)?;
    Ok(view_status(&state, &runtime.native_version))
}

pub fn boot_ready(app: &AppHandle) -> Result<(), String> {
    // The packaged page also pings ready. Only the bundle origin may confirm a
    // pending boot; otherwise a fast packaged load would accept a bundle that
    // never started.
    if !on_interface_origin(app) {
        return Ok(());
    }
    let runtime = runtime(app)?;
    let mut state = read_state(&runtime.root)?;
    let confirmed = confirm_boot(&runtime.root, &mut state)?;
    write_state(&runtime.root, &state)?;
    if let Some(dir) = confirmed {
        if let Ok(mut inner) = runtime.inner.lock() {
            inner.watch = inner.watch.wrapping_add(1);
            inner.serving = Some(dir);
        }
    } else if let Ok(mut inner) = runtime.inner.lock() {
        inner.watch = inner.watch.wrapping_add(1);
    }
    Ok(())
}

pub fn reload_interface(app: &AppHandle) -> Result<(), String> {
    let runtime = runtime(app)?;
    let state = read_state(&runtime.root)?;
    let kind = if serving_dir(&runtime.root, &state).is_some() {
        BootKind::Bundle
    } else {
        BootKind::Builtin
    };
    let watch = {
        let mut inner = runtime.inner.lock().map_err(|_| "The interface lock was interrupted.".to_string())?;
        inner.watch = inner.watch.wrapping_add(1);
        inner.serving = match kind {
            BootKind::Bundle => serving_dir(&runtime.root, &state),
            BootKind::Builtin => None,
        };
        if kind == BootKind::Builtin {
            let mut recorded = state.clone();
            recorded.loaded_build = 0;
            recorded.loaded_version.clear();
            recorded.reload_ready = false;
            write_state(&runtime.root, &recorded)?;
        } else if state.pending.is_none() {
            if let Some(good) = &state.good {
                let mut recorded = state.clone();
                recorded.loaded_build = good.build;
                recorded.loaded_version = good.version.clone();
                recorded.reload_ready = false;
                write_state(&runtime.root, &recorded)?;
            }
        }
        inner.watch
    };
    let armed = arm_watch(&state) && kind == BootKind::Bundle;
    let url = match kind {
        BootKind::Bundle => format!("{}?boot={watch}", bundle_index_url()),
        BootKind::Builtin => format!("{}?boot={watch}", builtin_index_url()),
    };
    navigate(app, &url)?;
    if armed {
        arm_watchdog(app.clone(), watch);
    }
    Ok(())
}

pub async fn check_interface(app: AppHandle, manual: bool) -> Result<InterfaceReport, String> {
    let runtime = runtime(&app)?;
    let native = runtime.native_version.clone();
    let root = runtime.root.clone();
    let state = read_state(&root)?;
    let decision = fetch_decision(&state, &native, manual).await?;
    let (outcome, message) = match decision {
        Decision::Leave { outcome, message } => (outcome, message),
        Decision::Install { manifest, bytes } => {
            let mut fresh = read_state(&root)?;
            if fresh.channel != state.channel {
                ("current".into(), "The interface channel changed.".into())
            } else {
                install_verified(&root, &mut fresh, &manifest, &bytes)?;
                write_state(&root, &fresh)?;
                (
                    "ready".into(),
                    format!("Interface build {} is ready.", manifest.build),
                )
            }
        }
    };
    let status = view_status(&read_state(&root).unwrap_or(state), &native);
    Ok(InterfaceReport { status, outcome, message })
}

fn arm_watchdog(app: AppHandle, watch: u64) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(BOOT_TIMEOUT).await;
        let Some(runtime) = app.try_state::<UiRuntime>() else {
            return;
        };
        let current = runtime.inner.lock().ok().map(|inner| inner.watch);
        if current != Some(watch) {
            return;
        }
        let mut state = match read_state(&runtime.root) {
            Ok(state) => state,
            Err(err) => {
                log::warn!("interface rollback: {err}");
                return;
            }
        };
        if state.pending.is_none() {
            return;
        }
        if let Err(err) = rollback(&runtime.root, &mut state) {
            log::warn!("interface rollback: {err}");
            return;
        }
        if let Err(err) = write_state(&runtime.root, &state) {
            log::warn!("interface rollback: {err}");
            return;
        }
        log::warn!("interface bundle failed to start and was rolled back");
        if let Err(err) = reload_interface(&app) {
            log::warn!("interface rollback reload: {err}");
        }
    });
}

fn on_interface_origin(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    let Ok(url) = window.url() else {
        return false;
    };
    let text = url.as_str();
    text.starts_with("larkui://localhost")
        || text.starts_with("http://larkui.localhost")
        || text.starts_with("https://larkui.localhost")
}

fn navigate(app: &AppHandle, url: &str) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("The main window is not open.")?;
    let parsed = tauri::Url::parse(url).map_err(|err| err.to_string())?;
    window.navigate(parsed).map_err(|err| err.to_string())
}

fn runtime(app: &AppHandle) -> Result<tauri::State<'_, UiRuntime>, String> {
    app.try_state::<UiRuntime>().ok_or_else(|| "Interface updates are not available.".to_string())
}

pub fn view_status(state: &HotState, native: &str) -> InterfaceStatus {
    let bundle = !state.force_builtin && state.loaded_build > 0;
    InterfaceStatus {
        channel: if state.channel == "canary" { "canary".into() } else { "stable".into() },
        source: if bundle { "bundle".into() } else { "builtin".into() },
        build: if bundle { state.loaded_build } else { 0 },
        version: if bundle { state.loaded_version.clone() } else { String::new() },
        pending_build: state.pending.as_ref().map(|item| item.build).unwrap_or(0),
        pending_version: state.pending.as_ref().map(|item| item.version.clone()).unwrap_or_default(),
        reload_ready: state.reload_ready,
        bad: state.bad.clone(),
        native_version: native.to_string(),
    }
}

fn missing_status() -> InterfaceStatus {
    view_status(&HotState::default(), "")
}

pub fn apply_channel(state: &mut HotState, channel: &str) -> Result<(), String> {
    if channel != "stable" && channel != "canary" {
        return Err("The interface channel is Stable or Canary.".into());
    }
    if state.channel != channel {
        state.channel = channel.to_string();
        state.skipped_build = 0;
    }
    Ok(())
}

pub fn apply_reset(root: &Path, state: &mut HotState) -> Result<(), String> {
    let had = state.pending.is_some() || (state.good.is_some() && !state.force_builtin) || state.loaded_build > 0;
    if let Some(pending) = state.pending.take() {
        let build = pending.build.max(state.good.as_ref().map(|item| item.build).unwrap_or(0));
        state.skipped_build = state.skipped_build.max(build);
        let _ = fs::remove_dir_all(root.join("pending"));
    } else if let Some(good) = &state.good {
        state.skipped_build = state.skipped_build.max(good.build);
    }
    state.force_builtin = true;
    state.reload_ready = had;
    Ok(())
}

pub fn boot_kind(state: &HotState) -> BootKind {
    if state.force_builtin {
        return BootKind::Builtin;
    }
    if state.pending.is_some() || state.good.is_some() {
        return BootKind::Bundle;
    }
    BootKind::Builtin
}

pub fn arm_watch(state: &HotState) -> bool {
    !state.force_builtin && state.pending.is_some()
}

pub fn serving_dir(root: &Path, state: &HotState) -> Option<PathBuf> {
    if state.force_builtin {
        return None;
    }
    if state.pending.is_some() {
        let pending = root.join("pending");
        if pending.join("index.html").is_file() {
            return Some(pending);
        }
    }
    if state.good.is_some() {
        let good = root.join("good");
        if good.join("index.html").is_file() {
            return Some(good);
        }
    }
    None
}

pub fn confirm_boot(root: &Path, state: &mut HotState) -> Result<Option<PathBuf>, String> {
    if state.pending.is_none() {
        state.reload_ready = false;
        return Ok(None);
    }
    let previous = root.join("previous");
    let good = root.join("good");
    let pending = root.join("pending");
    if previous.exists() {
        fs::remove_dir_all(&previous).map_err(|err| err.to_string())?;
    }
    if good.exists() {
        fs::rename(&good, &previous).map_err(|err| err.to_string())?;
    }
    fs::rename(&pending, &good).map_err(|err| err.to_string())?;
    state.good = state.pending.take();
    state.force_builtin = false;
    state.reload_ready = false;
    if let Some(good_meta) = &state.good {
        state.loaded_build = good_meta.build;
        state.loaded_version = good_meta.version.clone();
    }
    Ok(Some(good))
}

pub fn rollback(root: &Path, state: &mut HotState) -> Result<(), String> {
    if let Some(pending) = state.pending.take() {
        remember_bad(state, pending.build);
        let dir = root.join("pending");
        if dir.exists() {
            fs::remove_dir_all(dir).map_err(|err| err.to_string())?;
        }
    }
    state.reload_ready = false;
    if state.good.is_some() && !state.force_builtin {
        if let Some(good) = &state.good {
            state.loaded_build = good.build;
            state.loaded_version = good.version.clone();
        }
    } else {
        state.loaded_build = 0;
        state.loaded_version.clear();
        state.force_builtin = state.good.is_none() || state.force_builtin;
    }
    Ok(())
}

fn remember_bad(state: &mut HotState, build: u64) {
    if build == 0 || state.bad.contains(&build) {
        return;
    }
    state.bad.push(build);
    if state.bad.len() > 50 {
        let extra = state.bad.len() - 50;
        state.bad.drain(0..extra);
    }
}

pub fn consider(state: &HotState, manifest: &Manifest, native: &str, manual: bool) -> Result<(), Reject> {
    if manifest.file != "bundle.zip"
        || manifest.version.is_empty()
        || manifest.min_native.is_empty()
        || manifest.created.is_empty()
        || manifest.build == 0
        || !is_sha256(&manifest.sha256)
        || manifest.signature.trim().is_empty()
    {
        return Err(Reject::Malformed);
    }
    if state.bad.contains(&manifest.build) {
        return Err(Reject::Bad);
    }
    if !manual && manifest.build <= state.skipped_build {
        return Err(Reject::Skipped);
    }
    let current = if state.force_builtin {
        0
    } else {
        state.pending.as_ref().map(|item| item.build).unwrap_or(0).max(state.good.as_ref().map(|item| item.build).unwrap_or(0))
    };
    if manifest.build <= current {
        return Err(Reject::Current);
    }
    if !compatible(native, &manifest.min_native) {
        return Err(Reject::Incompatible { min_native: manifest.min_native.clone() });
    }
    Ok(())
}

pub fn compatible(app: &str, min_native: &str) -> bool {
    match (parse_version(app), parse_version(min_native)) {
        (Some(app), Some(min)) => app >= min,
        _ => false,
    }
}

fn parse_version(value: &str) -> Option<[u64; 3]> {
    let core = value.trim().split('-').next()?.trim();
    if core.is_empty() {
        return None;
    }
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some([major, minor, patch])
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub fn install_verified(root: &Path, state: &mut HotState, manifest: &Manifest, zip_bytes: &[u8]) -> Result<(), String> {
    if zip_bytes.len() > MAX_ZIP {
        return Err("The interface bundle is too large.".into());
    }
    let digest = sha256_hex(zip_bytes);
    if !digest.eq_ignore_ascii_case(&manifest.sha256) {
        return Err("The interface bundle did not match its checksum.".into());
    }
    verify_signature(zip_bytes, &manifest.signature)?;
    if let Some(pending) = state.pending.take() {
        remember_bad(state, pending.build);
        let _ = fs::remove_dir_all(root.join("pending"));
    }
    unpack_zip(zip_bytes, &root.join("pending"))?;
    state.pending = Some(BundleMeta {
        build: manifest.build,
        version: manifest.version.clone(),
        min_native: manifest.min_native.clone(),
    });
    state.force_builtin = false;
    state.reload_ready = true;
    state.skipped_build = 0;
    Ok(())
}

fn verify_signature(bytes: &[u8], encoded: &str) -> Result<(), String> {
    let key = verifying_key()?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|_| "The interface signature could not be read.".to_string())?;
    let signature = Signature::from_slice(&raw).map_err(|_| "The interface signature could not be read.".to_string())?;
    key.verify(bytes, &signature).map_err(|_| "The interface signature does not match this bundle.".to_string())
}

fn verifying_key() -> Result<VerifyingKey, String> {
    let config: PublishedKey = serde_json::from_str(include_str!("../../interface.json")).map_err(|err| err.to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(config.public_key.trim())
        .map_err(|err| err.to_string())?;
    let array: [u8; 32] = bytes.as_slice().try_into().map_err(|_| "The interface public key is not 32 bytes.".to_string())?;
    VerifyingKey::from_bytes(&array).map_err(|err| err.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn safe_zip_path(name: &str) -> Result<PathBuf, String> {
    let name = name.replace('\\', "/");
    if name.is_empty() || name.starts_with('/') || name.contains('\0') {
        return Err("The interface bundle has an unsafe path.".into());
    }
    let mut out = PathBuf::new();
    for part in Path::new(&name).components() {
        match part {
            Component::Normal(text) => out.push(text),
            _ => return Err("The interface bundle has an unsafe path.".into()),
        }
    }
    if out.as_os_str().is_empty() {
        return Err("The interface bundle has an unsafe path.".into());
    }
    Ok(out)
}

fn unpack_zip(bytes: &[u8], dest: &Path) -> Result<(), String> {
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(dest).map_err(|err| err.to_string())?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "The interface bundle could not be opened.".to_string())?;
    if archive.len() > MAX_FILES {
        return Err("The interface bundle has too many files.".into());
    }
    let mut total = 0u64;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|_| "The interface bundle could not be read.".to_string())?;
        if file.is_dir() {
            continue;
        }
        let rel = safe_zip_path(file.name())?;
        let size = file.size();
        total = total.saturating_add(size);
        if total > MAX_UNPACKED {
            return Err("The interface bundle is too large.".into());
        }
        let path = dest.join(&rel);
        if !path.starts_with(dest) {
            return Err("The interface bundle has an unsafe path.".into());
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let mut output = fs::File::create(&path).map_err(|err| err.to_string())?;
        let mut limited = file.by_ref().take(size.saturating_add(1));
        let copied = std::io::copy(&mut limited, &mut output).map_err(|err| err.to_string())?;
        if copied != size {
            return Err("The interface bundle could not be unpacked.".into());
        }
    }
    if !dest.join("index.html").is_file() {
        return Err("The interface bundle is missing index.html.".into());
    }
    Ok(())
}

enum Decision {
    Leave { outcome: String, message: String },
    Install { manifest: Manifest, bytes: Vec<u8> },
}

async fn fetch_decision(state: &HotState, native: &str, manual: bool) -> Result<Decision, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| err.to_string())?;
    let channel = if state.channel == "canary" { "canary" } else { "stable" };
    let manifest_url = format!("{PAGES_ORIGIN}/ui/{channel}/manifest.json");
    let response = client.get(&manifest_url).send().await.map_err(|err| err.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Decision::Leave {
            outcome: "unavailable".into(),
            message: "No interface bundle has been published for this channel.".into(),
        });
    }
    if !response.status().is_success() {
        return Err(format!("The interface manifest returned {}.", response.status()));
    }
    let text = response.text().await.map_err(|err| err.to_string())?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|_| "The interface manifest could not be read.".to_string())?;
    match consider(state, &manifest, native, manual) {
        Err(Reject::Current) | Err(Reject::Skipped) => Ok(Decision::Leave {
            outcome: "current".into(),
            message: "This interface is up to date.".into(),
        }),
        Err(Reject::Bad) => Ok(Decision::Leave {
            outcome: "bad".into(),
            message: format!("Interface build {} failed to start and was rolled back.", manifest.build),
        }),
        Err(Reject::Incompatible { min_native }) => Ok(Decision::Leave {
            outcome: "incompatible".into(),
            message: format!("This interface needs Lark {min_native}. The app update installs that version."),
        }),
        Err(Reject::Malformed) => Err("The interface manifest is incomplete.".into()),
        Ok(()) => {
            let bundle_url = format!("{PAGES_ORIGIN}/ui/{channel}/bundle.zip");
            let bundle = client.get(&bundle_url).send().await.map_err(|err| err.to_string())?;
            if !bundle.status().is_success() {
                return Err(format!("The interface bundle returned {}.", bundle.status()));
            }
            let bytes = bundle.bytes().await.map_err(|err| err.to_string())?;
            if bytes.len() > MAX_ZIP {
                return Err("The interface bundle is too large.".into());
            }
            Ok(Decision::Install { manifest, bytes: bytes.to_vec() })
        }
    }
}

pub fn read_state(root: &Path) -> Result<HotState, String> {
    let path = root.join("state.json");
    if !path.exists() {
        return Ok(HotState::default());
    }
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|_| "The interface state could not be read.".to_string())
}

pub fn write_state(root: &Path, state: &HotState) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|err| err.to_string())?;
    let path = root.join("state.json");
    let tmp = root.join("state.json.tmp");
    let body = serde_json::to_vec_pretty(state).map_err(|err| err.to_string())?;
    fs::write(&tmp, body).map_err(|err| err.to_string())?;
    fs::rename(&tmp, &path).map_err(|err| err.to_string())?;
    Ok(())
}

fn bundle_index_url() -> String {
    format!("{}/index.html", protocol_origin("larkui"))
}

fn builtin_index_url() -> String {
    format!("{}/index.html", protocol_origin("tauri"))
}

fn protocol_origin(scheme: &str) -> String {
    if cfg!(windows) || cfg!(target_os = "android") {
        format!("http://{scheme}.localhost")
    } else {
        format!("{scheme}://localhost")
    }
}

fn request_path(path: &str) -> Option<PathBuf> {
    let bare = path.split('?').next().unwrap_or(path);
    let decoded = percent_decode(bare);
    let trimmed = decoded.trim_start_matches('/');
    let relative = if trimmed.is_empty() { "index.html" } else { trimmed };
    safe_zip_path(relative).ok()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or(""), 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime_of(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn response(status: u16, mime: &str, body: Vec<u8>) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, mime)
        .header(http::header::CONTENT_SECURITY_POLICY, CSP)
        .header(http::header::CACHE_CONTROL, "no-cache")
        .body(body)
        .unwrap_or_else(|_| http::Response::new(Vec::new()))
}

fn empty(status: u16) -> http::Response<Vec<u8>> {
    response(status, "text/plain; charset=utf-8", Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(build: u64) -> Manifest {
        Manifest {
            version: "3.0.0".into(),
            build,
            min_native: "3.0.0".into(),
            sha256: "ab".repeat(32),
            signature: "c2ln".into(),
            created: "2026-10-12T00:00:00Z".into(),
            file: "bundle.zip".into(),
        }
    }

    #[test]
    fn version_gate_uses_the_packaged_app() {
        assert!(compatible("3.0.0", "3.0.0"));
        assert!(compatible("3.0.1", "3.0.0"));
        assert!(compatible("3.1.0", "3.0.4"));
        assert!(!compatible("3.0.0", "3.0.1"));
        assert!(!compatible("2.9.9", "3.0.0"));
        assert!(!compatible("3.0", ""));
    }

    #[test]
    fn newer_compatible_bundles_are_accepted() {
        let mut state = HotState::default();
        state.good = Some(BundleMeta { build: 4, version: "3.0.0".into(), min_native: "3.0.0".into() });
        assert_eq!(consider(&state, &manifest(4), "3.0.0", false), Err(Reject::Current));
        assert_eq!(consider(&state, &manifest(5), "3.0.0", false), Ok(()));
        state.bad.push(5);
        assert_eq!(consider(&state, &manifest(5), "3.0.0", false), Err(Reject::Bad));
        state.bad.clear();
        state.skipped_build = 8;
        assert_eq!(consider(&state, &manifest(8), "3.0.0", false), Err(Reject::Skipped));
        assert_eq!(consider(&state, &manifest(8), "3.0.0", true), Ok(()));
        let mut ahead = manifest(9);
        ahead.min_native = "9.0.0".into();
        assert!(matches!(consider(&state, &ahead, "3.0.0", true), Err(Reject::Incompatible { .. })));
    }

    #[test]
    fn zip_paths_cannot_escape() {
        assert!(safe_zip_path("../secret").is_err());
        assert!(safe_zip_path("/etc/passwd").is_err());
        assert!(safe_zip_path("assets/../../secret").is_err());
        assert_eq!(safe_zip_path("assets/app.js").unwrap(), PathBuf::from("assets/app.js"));
    }

    #[test]
    fn a_failed_boot_keeps_the_last_good_bundle() {
        let root = std::env::temp_dir().join(format!("lark-ui-hot-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("good")).unwrap();
        fs::write(root.join("good").join("index.html"), "good").unwrap();
        fs::create_dir_all(root.join("pending")).unwrap();
        fs::write(root.join("pending").join("index.html"), "new").unwrap();
        let mut state = HotState {
            pending: Some(BundleMeta { build: 7, version: "3.0.0".into(), min_native: "3.0.0".into() }),
            good: Some(BundleMeta { build: 3, version: "3.0.0".into(), min_native: "3.0.0".into() }),
            ..HotState::default()
        };
        rollback(&root, &mut state).unwrap();
        assert!(state.bad.contains(&7));
        assert!(state.pending.is_none());
        assert_eq!(state.good.as_ref().map(|item| item.build), Some(3));
        assert_eq!(fs::read_to_string(root.join("good").join("index.html")).unwrap(), "good");
        assert!(!root.join("pending").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_ready_boot_promotes_pending_and_keeps_the_previous_bundle() {
        let root = std::env::temp_dir().join(format!("lark-ui-hot-ready-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("good")).unwrap();
        fs::write(root.join("good").join("index.html"), "old").unwrap();
        fs::create_dir_all(root.join("pending")).unwrap();
        fs::write(root.join("pending").join("index.html"), "new").unwrap();
        let mut state = HotState {
            pending: Some(BundleMeta { build: 8, version: "3.0.1".into(), min_native: "3.0.0".into() }),
            good: Some(BundleMeta { build: 2, version: "3.0.0".into(), min_native: "3.0.0".into() }),
            reload_ready: true,
            ..HotState::default()
        };
        confirm_boot(&root, &mut state).unwrap();
        assert_eq!(state.loaded_build, 8);
        assert!(state.pending.is_none());
        assert!(!state.reload_ready);
        assert_eq!(fs::read_to_string(root.join("good").join("index.html")).unwrap(), "new");
        assert_eq!(fs::read_to_string(root.join("previous").join("index.html")).unwrap(), "old");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn embedded_key_verifies_the_known_sample() {
        let signature = "UmJJ+aSVP/ubN70YbrPKbUAIIr1UcyibtxDaY72faQKDtrsqnolUshIPcze6zPcN+bvOx/dCL5RboM60Q75ABg==";
        verify_signature(b"lark-ui-v1", signature).unwrap();
        assert!(verify_signature(b"lark-ui-v1-tampered", signature).is_err());
    }

    #[test]
    fn reset_returns_to_the_packaged_ui_without_redownloading_that_build() {
        let root = std::env::temp_dir().join(format!("lark-ui-hot-reset-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mut state = HotState {
            good: Some(BundleMeta { build: 6, version: "3.0.0".into(), min_native: "3.0.0".into() }),
            loaded_build: 6,
            loaded_version: "3.0.0".into(),
            ..HotState::default()
        };
        apply_reset(&root, &mut state).unwrap();
        assert!(state.force_builtin);
        assert!(state.reload_ready);
        assert_eq!(state.skipped_build, 6);
        assert_eq!(consider(&state, &manifest(6), "3.0.0", false), Err(Reject::Skipped));
        assert_eq!(boot_kind(&state), BootKind::Builtin);
        let _ = fs::remove_dir_all(&root);
    }
}
