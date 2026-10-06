mod keychain;
mod login;
mod paths;
mod refresh;

use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use lark_core::credential_not_saved_message;
use lark_core::discord::{ClientEvent, DiscordRest};
use lark_core::normalize_user_token;
use lark_core::parse_config;
use lark_core::Config;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, watch, Mutex};
use zeroize::Zeroize;

struct Shared {
    config: Mutex<Config>,
    paths: Resolved,
    rest: Mutex<Option<Arc<DiscordRest>>>,
    gateway: Mutex<Option<mpsc::UnboundedSender<lark_core::discord::GatewayCommand>>>,
    shutdown: Mutex<Option<watch::Sender<bool>>>,
    _watcher: Mutex<Option<RecommendedWatcher>>,
    voice: Arc<std::sync::Mutex<VoiceSlot>>,
    voice_stop: Mutex<Option<watch::Sender<bool>>>,
    speaking: watch::Sender<bool>,
    screen_stop: Mutex<Option<watch::Sender<bool>>>,
    screen_dirty: Arc<AtomicBool>,
    hide_on_close: Arc<AtomicBool>,
    qr_stop: Mutex<Option<watch::Sender<bool>>>,
}

struct VoiceSlot {
    user_id: String,
    endpoint: String,
    token: String,
    guild_id: String,
    session_id: String,
    channel_id: String,
}

struct Resolved {
    config_file: PathBuf,
    themes_dir: PathBuf,
    plugins_dir: PathBuf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileIn {
    name: String,
    mime: String,
    bytes: Vec<u8>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            keychain::mark_main_thread();
            let resolved = paths::resolve(app.handle())?;
            let text = fs::read_to_string(&resolved.config_file).unwrap_or_default();
            let config = parse_config(&text).unwrap_or_else(|err| {
                log::warn!("config ignored: {err}");
                Config::default()
            });
            let hide_on_close = Arc::new(AtomicBool::new(config.desktop.minimize_to_tray));
            let (speaking, _) = watch::channel(false);
            let shared = Shared {
                config: Mutex::new(config),
                paths: Resolved {
                    config_file: resolved.config_file,
                    themes_dir: resolved.themes_dir,
                    plugins_dir: resolved.plugins_dir,
                },
                rest: Mutex::new(None),
                gateway: Mutex::new(None),
                shutdown: Mutex::new(None),
                _watcher: Mutex::new(None),
                voice: Arc::new(std::sync::Mutex::new(VoiceSlot {
                    user_id: String::new(),
                    endpoint: String::new(),
                    token: String::new(),
                    guild_id: String::new(),
                    session_id: String::new(),
                    channel_id: String::new(),
                })),
                voice_stop: Mutex::new(None),
                speaking,
                screen_stop: Mutex::new(None),
                screen_dirty: Arc::new(AtomicBool::new(false)),
                hide_on_close: hide_on_close.clone(),
                qr_stop: Mutex::new(None),
            };
            app.manage(shared);
            if let Some(window) = app.get_webview_window("main") {
                refresh::prefer_native_refresh(&window);
                let hide = hide_on_close.clone();
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if hide.load(Ordering::Relaxed) {
                            api.prevent_close();
                            let _ = win.hide();
                        }
                    }
                });
            }
            install_tray(app.handle());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = install_watcher(handle).await {
                    log::warn!("config watcher: {err}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            app_paths,
            has_token,
            set_token,
            clear_token,
            open_discord_login,
            start_qr_login,
            stop_qr_login,
            connect,
            disconnect,
            fetch_guild_channels,
            fetch_roles,
            fetch_members,
            fetch_messages,
            send_message,
            edit_message,
            delete_message,
            toggle_reaction,
            typing,
            read_theme,
            write_theme,
            list_themes,
            set_window_material,
            list_plugins,
            read_plugin,
            join_voice,
            leave_voice,
            set_voice_self,
            set_presence,
            ack_message,
            fetch_pins,
            search_messages,
            set_unread,
            set_minimize_to_tray,
            set_autostart,
            start_screen_share,
            stop_screen_share
        ])
        .run(tauri::generate_context!())
        .expect("lark failed to start");
}

async fn install_watcher(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Shared>();
    let config_file = state.paths.config_file.clone();
    let themes_dir = state.paths.themes_dir.clone();
    let app_for_watch = app.clone();
    let mut watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
        let Ok(event) = result else {
            return;
        };
        for path in event.paths {
            if path.ends_with("config.toml") {
                let _ = app_for_watch.emit("config-changed", ());
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("css") {
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let _ = app_for_watch.emit("theme-changed", stem);
            }
        }
    })
    .map_err(|err| err.to_string())?;
    watcher
        .watch(&config_file, RecursiveMode::NonRecursive)
        .map_err(|err| err.to_string())?;
    watcher
        .watch(&themes_dir, RecursiveMode::NonRecursive)
        .map_err(|err| err.to_string())?;
    *state._watcher.lock().await = Some(watcher);
    Ok(())
}

fn read_config_file(path: &std::path::Path) -> Result<Config, String> {
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    parse_config(&text).map_err(|err| err.to_string())
}

#[tauri::command]
async fn get_config(state: State<'_, Shared>) -> Result<Config, String> {
    if let Ok(config) = read_config_file(&state.paths.config_file) {
        *state.config.lock().await = config.clone();
        return Ok(config);
    }
    Ok(state.config.lock().await.clone())
}

#[tauri::command]
async fn save_config(state: State<'_, Shared>, config: Config) -> Result<Config, String> {
    let normalized = parse_config(&toml::to_string(&config).map_err(|err| err.to_string())?)
        .map_err(|err| err.to_string())?;
    let pretty = toml::to_string_pretty(&normalized).map_err(|err| err.to_string())?;
    fs::write(&state.paths.config_file, pretty).map_err(|err| err.to_string())?;
    *state.config.lock().await = normalized.clone();
    Ok(normalized)
}

#[tauri::command]
fn app_paths(state: State<'_, Shared>) -> paths::AppPaths {
    paths::describe(&paths::ResolvedPaths {
        config_file: state.paths.config_file.clone(),
        themes_dir: state.paths.themes_dir.clone(),
        plugins_dir: state.paths.plugins_dir.clone(),
    })
}

#[tauri::command]
fn has_token(app: AppHandle) -> Result<bool, String> {
    let loaded = keychain::on_main(&app, keychain::load_token)??;
    Ok(loaded.map(|token| !token.is_empty()).unwrap_or(false))
}

#[tauri::command]
fn set_token(app: AppHandle, token: String) -> Result<(), String> {
    let token = normalize_user_token(&token)?;
    keychain::on_main(&app, move || {
        let result = keychain::save_token(&token);
        let mut token = token;
        token.zeroize();
        result
    })?
}

#[tauri::command]
fn open_discord_login(app: AppHandle) -> Result<(), String> {
    login::open_discord_login(&app)
}

#[tauri::command]
async fn start_qr_login(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    if let Some(tx) = state.qr_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    let (tx, rx) = watch::channel(false);
    *state.qr_stop.lock().await = Some(tx);
    login::spawn_qr(app, rx);
    Ok(())
}

#[tauri::command]
async fn stop_qr_login(state: State<'_, Shared>) -> Result<(), String> {
    if let Some(tx) = state.qr_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    Ok(())
}

#[tauri::command]
async fn clear_token(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    disconnect_inner(&state).await;
    if let Some(tx) = state.qr_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    keychain::on_main(&app, keychain::clear_token)?
}

#[tauri::command]
async fn connect(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    let stored = keychain::on_main(&app, keychain::load_token)??
        .filter(|token| !token.is_empty())
        .ok_or_else(|| credential_not_saved_message(&keychain::store_label()))?;
    let token = normalize_user_token(&stored)?;
    if token != stored {
        let cleaned = token.clone();
        keychain::on_main(&app, move || {
            let result = keychain::save_token(&cleaned);
            let mut cleaned = cleaned;
            cleaned.zeroize();
            result
        })??;
    }
    disconnect_inner(&state).await;
    let rest = Arc::new(DiscordRest::new(token.clone()).map_err(|err| err.to_string())?);
    match rest.current_user().await {
        Ok(user) => {
            if let Ok(mut slot) = state.voice.lock() {
                slot.user_id = user.id;
            }
        }
        Err(err) => return Err(err.to_string()),
    }
    *state.rest.lock().await = Some(rest);
    let (tx, rx) = watch::channel(false);
    *state.shutdown.lock().await = Some(tx);
    let (gateway_tx, gateway_rx) = mpsc::unbounded_channel();
    *state.gateway.lock().await = Some(gateway_tx);
    let app_handle = app.clone();
    let voice_slot = state.voice.clone();
    tauri::async_runtime::spawn(async move {
        lark_core::discord::run_gateway(token, rx, gateway_rx, move |event: ClientEvent| {
            let outbound = match &event {
                ClientEvent::Ready { user, .. } => {
                    if let Ok(mut slot) = voice_slot.lock() {
                        slot.user_id = user.id.clone();
                    }
                    serde_json::to_value(&event).ok()
                }
                ClientEvent::VoiceServer { guild_id, endpoint, token } => {
                    if let Ok(mut slot) = voice_slot.lock() {
                        slot.guild_id = guild_id.clone();
                        slot.endpoint = endpoint.clone();
                        slot.token = token.clone();
                    }
                    Some(serde_json::json!({
                        "kind": "voiceServer",
                        "guildId": guild_id,
                        "endpoint": endpoint,
                        "token": ""
                    }))
                }
                ClientEvent::VoiceState { user_id, session_id, guild_id, .. } => {
                    if let Ok(mut slot) = voice_slot.lock() {
                        if slot.user_id == *user_id && !session_id.is_empty() {
                            slot.session_id = session_id.clone();
                            if !guild_id.is_empty() {
                                slot.guild_id = guild_id.clone();
                            }
                        }
                    }
                    serde_json::to_value(&event).ok()
                }
                _ => serde_json::to_value(&event).ok(),
            };
            if let Some(payload) = outbound {
                let _ = app_handle.emit("discord", payload);
            }
        })
        .await;
    });
    Ok(())
}

#[tauri::command]
async fn disconnect(state: State<'_, Shared>) -> Result<(), String> {
    disconnect_inner(&state).await;
    Ok(())
}

async fn disconnect_inner(state: &Shared) {
    if let Some(tx) = state.shutdown.lock().await.take() {
        let _ = tx.send(true);
    }
    *state.gateway.lock().await = None;
    *state.rest.lock().await = None;
}

async fn rest(state: &State<'_, Shared>) -> Result<Arc<DiscordRest>, String> {
    state
        .rest
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Not connected.".to_string())
}

#[tauri::command]
async fn fetch_guild_channels(
    state: State<'_, Shared>,
    guild_id: String,
) -> Result<Vec<lark_core::discord::ClientChannel>, String> {
    rest(&state)
        .await?
        .guild_channels(&guild_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_roles(
    state: State<'_, Shared>,
    guild_id: String,
) -> Result<Vec<lark_core::discord::ClientRole>, String> {
    rest(&state)
        .await?
        .roles(&guild_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_members(
    state: State<'_, Shared>,
    guild_id: String,
) -> Result<Vec<lark_core::discord::ClientMember>, String> {
    rest(&state)
        .await?
        .members(&guild_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_messages(
    state: State<'_, Shared>,
    channel_id: String,
    before: Option<String>,
) -> Result<Vec<lark_core::discord::ClientMessage>, String> {
    rest(&state)
        .await?
        .messages(&channel_id, before.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn send_message(
    state: State<'_, Shared>,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    files: Vec<FileIn>,
) -> Result<lark_core::discord::ClientMessage, String> {
    let files: Vec<lark_core::discord::rest::OutFile> = files
        .into_iter()
        .map(|file| lark_core::discord::rest::OutFile {
            name: file.name,
            mime: file.mime,
            bytes: file.bytes,
        })
        .collect();
    rest(&state)
        .await?
        .send_message(&channel_id, &content, reply_to.as_deref(), &files)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn edit_message(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: String,
    content: String,
) -> Result<lark_core::discord::ClientMessage, String> {
    rest(&state)
        .await?
        .edit_message(&channel_id, &message_id, &content)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn delete_message(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: String,
) -> Result<(), String> {
    rest(&state)
        .await?
        .delete_message(&channel_id, &message_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn toggle_reaction(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: String,
    emoji: String,
    emoji_id: Option<String>,
    add: bool,
) -> Result<(), String> {
    rest(&state)
        .await?
        .toggle_reaction(
            &channel_id,
            &message_id,
            &emoji,
            emoji_id.as_deref(),
            add,
        )
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn typing(state: State<'_, Shared>, channel_id: String) -> Result<(), String> {
    rest(&state)
        .await?
        .typing(&channel_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn read_theme(state: State<'_, Shared>, name: String) -> Result<String, String> {
    lark_core::config::validate_theme_name(&name).map_err(|err| err.to_string())?;
    let path = state.paths.themes_dir.join(format!("{name}.css"));
    fs::read_to_string(path).map_err(|_| format!("Theme \"{name}\" was not found."))
}

#[tauri::command]
fn write_theme(state: State<'_, Shared>, name: String, css: String) -> Result<(), String> {
    lark_core::config::validate_theme_name(&name).map_err(|err| err.to_string())?;
    lark_core::config::validate_theme_css(&css).map_err(|err| err.to_string())?;
    let path = state.paths.themes_dir.join(format!("{name}.css"));
    fs::write(path, css).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_themes(state: State<'_, Shared>) -> Vec<String> {
    list_stems(&state.paths.themes_dir, "css")
}

#[tauri::command]
fn set_window_material(app: AppHandle, material: String) -> Result<bool, String> {
    if material != "vibrancy" && material != "none" {
        return Err("Unknown window material.".into());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Lark window is not open.".to_string())?;
    apply_window_material(&window, &material)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn apply_window_material(window: &tauri::WebviewWindow, material: &str) -> Result<bool, String> {
    let effects = if material == "vibrancy" {
        Some(native_effects())
    } else {
        None
    };
    match window.set_effects(effects) {
        Ok(()) => Ok(material == "vibrancy"),
        Err(err) => {
            log::warn!("window material: {err}");
            Ok(false)
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_window_material(window: &tauri::WebviewWindow, material: &str) -> Result<bool, String> {
    let _ = (window, material);
    Ok(false)
}

#[cfg(target_os = "macos")]
fn native_effects() -> tauri::utils::config::WindowEffectsConfig {
    tauri::utils::config::WindowEffectsConfig {
        effects: vec![tauri::utils::WindowEffect::HudWindow],
        ..Default::default()
    }
}

#[cfg(target_os = "windows")]
fn native_effects() -> tauri::utils::config::WindowEffectsConfig {
    tauri::utils::config::WindowEffectsConfig {
        effects: vec![tauri::utils::WindowEffect::MicaDark],
        ..Default::default()
    }
}

#[tauri::command]
fn list_plugins(state: State<'_, Shared>) -> Result<Vec<PluginInfo>, String> {
    let mut on_disk = Vec::new();
    let entries = fs::read_dir(&state.paths.plugins_dir).map_err(|err| err.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("js") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if lark_core::config::validate_theme_name(id).is_err() {
            continue;
        }
        let (name, description) = plugin_header(&path, id);
        on_disk.push(PluginInfo {
            id: id.to_string(),
            name,
            description,
        });
    }
    on_disk.sort_by(|a, b| a.id.cmp(&b.id));
    let order = manifest_order(&state.paths.plugins_dir.join("manifest.json"));
    if order.is_empty() {
        return Ok(on_disk);
    }
    let mut ranked = Vec::new();
    for id in &order {
        if let Some(index) = on_disk.iter().position(|plugin| plugin.id == *id) {
            ranked.push(on_disk.remove(index));
        }
    }
    ranked.append(&mut on_disk);
    Ok(ranked)
}

#[tauri::command]
fn read_plugin(state: State<'_, Shared>, id: String) -> Result<String, String> {
    lark_core::config::validate_theme_name(&id).map_err(|err| err.to_string())?;
    let path = state.paths.plugins_dir.join(format!("{id}.js"));
    fs::read_to_string(&path).map_err(|_| format!("Plugin \"{id}\" was not found."))
}

#[derive(serde::Serialize)]
struct PluginInfo {
    id: String,
    name: String,
    description: String,
}

fn plugin_header(path: &std::path::Path, id: &str) -> (String, String) {
    let mut name = id.to_string();
    let mut description = String::new();
    let Ok(mut file) = File::open(path) else {
        return (name, description);
    };
    let mut buf = [0_u8; 1024];
    let Ok(n) = file.read(&mut buf) else {
        return (name, description);
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    for line in head.lines().take(12) {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("// @lark name:") {
            let value = rest.trim();
            if !value.is_empty() {
                name = value.to_string();
            }
        } else if let Some(rest) = line.strip_prefix("// @lark description:") {
            let value = rest.trim();
            if !value.is_empty() {
                description = value.to_string();
            }
        }
    }
    (name, description)
}

fn manifest_order(path: &std::path::Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let Some(list) = value.get("plugins").and_then(|item| item.as_array()) else {
        return Vec::new();
    };
    let mut ids = Vec::new();
    for item in list {
        let id = item
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| item.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()));
        if let Some(id) = id {
            if lark_core::config::validate_theme_name(&id).is_ok() {
                ids.push(id);
            }
        }
    }
    ids
}

fn install_tray(app: &AppHandle) {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;
    let Ok(show) = MenuItem::with_id(app, "show", "Show Lark", true, None::<&str>) else {
        return;
    };
    let Ok(quit) = MenuItem::with_id(app, "quit", "Quit Lark", true, None::<&str>) else {
        return;
    };
    let Ok(menu) = Menu::with_items(app, &[&show, &quit]) else {
        return;
    };
    let mut builder = TrayIconBuilder::with_id("lark").menu(&menu).tooltip("Lark").on_menu_event(|app, event| {
        match event.id.as_ref() {
            "quit" => app.exit(0),
            _ => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
    });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let _ = builder.build(app);
}

#[tauri::command]
async fn join_voice(
    app: AppHandle,
    state: State<'_, Shared>,
    guild_id: Option<String>,
    channel_id: String,
    mute: bool,
    deaf: bool,
) -> Result<(), String> {
    stop_voice(&state).await;
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    {
        let mut slot = state.voice.lock().map_err(|_| "Voice state locked".to_string())?;
        slot.session_id.clear();
        slot.token.clear();
        slot.endpoint.clear();
        slot.channel_id = channel_id.clone();
        if let Some(guild) = guild_id.clone() {
            slot.guild_id = guild;
        }
    }
    gateway
        .send(lark_core::discord::GatewayCommand::VoiceState {
            guild_id: guild_id.clone(),
            channel_id: Some(channel_id.clone()),
            mute,
            deaf,
        })
        .map_err(|_| "Gateway is closed.".to_string())?;
    let (tx, rx) = watch::channel(false);
    *state.voice_stop.lock().await = Some(tx);
    let speaking = state.speaking.subscribe();
    let slot = state.voice.clone();
    let server_id = guild_id.unwrap_or(channel_id);
    tauri::async_runtime::spawn(async move {
        let ready = wait_for_voice(&slot, &server_id).await;
        let Ok(hello) = ready else {
            let _ = app.emit("discord", serde_json::json!({"kind": "voiceLink", "state": "reconnecting", "detail": "Voice server did not answer"}));
            return;
        };
        lark_core::discord::voice_link::maintain_voice(hello, rx, speaking, move |event| {
            let payload = match event {
                lark_core::discord::voice_link::VoiceLinkEvent::Status { state, detail } => {
                    serde_json::json!({"kind": "voiceLink", "state": state, "detail": detail})
                }
                lark_core::discord::voice_link::VoiceLinkEvent::Speaking { user_id, speaking } => {
                    serde_json::json!({"kind": "voiceSpeaking", "userId": user_id, "speaking": speaking})
                }
            };
            let _ = app.emit("discord", payload);
        })
        .await;
    });
    Ok(())
}

async fn wait_for_voice(slot: &Arc<std::sync::Mutex<VoiceSlot>>, server_id: &str) -> Result<lark_core::discord::voice_link::VoiceHello, ()> {
    for _ in 0..40 {
        if let Ok(guard) = slot.lock() {
            if !guard.endpoint.is_empty() && !guard.token.is_empty() && !guard.session_id.is_empty() && !guard.user_id.is_empty() {
                return Ok(lark_core::discord::voice_link::VoiceHello {
                    endpoint: guard.endpoint.clone(),
                    server_id: if guard.guild_id.is_empty() { server_id.to_string() } else { guard.guild_id.clone() },
                    user_id: guard.user_id.clone(),
                    session_id: guard.session_id.clone(),
                    token: guard.token.clone(),
                });
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    Err(())
}

async fn stop_voice(state: &Shared) {
    if let Some(tx) = state.voice_stop.lock().await.take() {
        let _ = tx.send(true);
    }
}

#[tauri::command]
async fn leave_voice(state: State<'_, Shared>) -> Result<(), String> {
    stop_voice(&state).await;
    if let Some(gateway) = state.gateway.lock().await.clone() {
        let _ = gateway.send(lark_core::discord::GatewayCommand::VoiceState {
            guild_id: None,
            channel_id: None,
            mute: false,
            deaf: false,
        });
    }
    Ok(())
}

#[tauri::command]
async fn set_voice_self(state: State<'_, Shared>, mute: bool, deaf: bool) -> Result<(), String> {
    let _ = state.speaking.send(!mute);
    let (guild_id, channel_id) = {
        let slot = state.voice.lock().map_err(|_| "Voice state locked".to_string())?;
        (
            if slot.guild_id.is_empty() { None } else { Some(slot.guild_id.clone()) },
            if slot.channel_id.is_empty() { None } else { Some(slot.channel_id.clone()) },
        )
    };
    if let Some(gateway) = state.gateway.lock().await.clone() {
        let _ = gateway.send(lark_core::discord::GatewayCommand::VoiceState {
            guild_id,
            channel_id,
            mute,
            deaf,
        });
    }
    Ok(())
}

#[tauri::command]
async fn set_presence(state: State<'_, Shared>, status: String, custom: String) -> Result<(), String> {
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    let allowed = ["online", "idle", "dnd", "invisible"];
    if !allowed.contains(&status.as_str()) {
        return Err("Unknown status.".into());
    }
    gateway
        .send(lark_core::discord::GatewayCommand::Presence { status, custom })
        .map_err(|_| "Gateway is closed.".to_string())
}

#[tauri::command]
async fn ack_message(state: State<'_, Shared>, channel_id: String, message_id: String) -> Result<(), String> {
    rest(&state).await?.ack_message(&channel_id, &message_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_pins(state: State<'_, Shared>, channel_id: String) -> Result<Vec<lark_core::discord::ClientMessage>, String> {
    rest(&state).await?.pins(&channel_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn search_messages(state: State<'_, Shared>, guild_id: String, query: String) -> Result<Vec<lark_core::discord::ClientMessage>, String> {
    rest(&state).await?.search_guild(&guild_id, &query).await.map_err(|err| err.to_string())
}

#[tauri::command]
fn set_unread(app: AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id("lark") {
        let tip = if count == 0 { "Lark".to_string() } else { format!("Lark · {count} unread") };
        let _ = tray.set_tooltip(Some(tip));
    }
}

#[tauri::command]
fn set_minimize_to_tray(state: State<'_, Shared>, enabled: bool) {
    state.hide_on_close.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    set_login_item(enabled)
}

#[tauri::command]
async fn start_screen_share(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    if let Some(tx) = state.screen_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    let (tx, mut rx) = watch::channel(false);
    *state.screen_stop.lock().await = Some(tx);
    let dirty = state.screen_dirty.clone();
    let os = std::env::consts::OS;
    tauri::async_runtime::spawn(async move {
        let capture = lark_core::screen::capture_backends(os).first().copied().unwrap_or("unavailable");
        let encoder = lark_core::screen::encoder_order(os).first().copied().unwrap_or("software");
        let still = vec![0u8; 160 * 90];
        let mut moved = still.clone();
        moved[0] = 255;
        loop {
            if *rx.borrow() {
                break;
            }
            let next = if dirty.load(Ordering::Relaxed) { &moved } else { &still };
            let plan = lark_core::screen::plan_frame(&still, next, 160);
            let _ = app.emit(
                "discord",
                serde_json::json!({
                    "kind": "screenShare",
                    "send": plan.send,
                    "fps": plan.fps,
                    "bitrate": plan.bitrate,
                    "packets": lark_core::screen::packets_for(&plan),
                    "capture": capture,
                    "encoder": encoder
                }),
            );
            tokio::select! {
                changed = rx.changed() => {
                    if changed.is_err() || *rx.borrow() { break; }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(lark_core::screen::frame_interval_ms(plan.fps))) => {}
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn stop_screen_share(state: State<'_, Shared>) -> Result<(), String> {
    if let Some(tx) = state.screen_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    state.screen_dirty.store(false, Ordering::Relaxed);
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_login_item(enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|err| err.to_string())?;
    let path = PathBuf::from(home).join("Library/LaunchAgents/dev.lark.desktop.plist");
    if !enabled {
        let _ = fs::remove_file(&path);
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict><key>Label</key><string>dev.lark.desktop</string><key>ProgramArguments</key><array><string>{}</string></array><key>RunAtLoad</key><true/></dict></plist>\n",
        exe.display()
    );
    fs::write(path, body).map_err(|err| err.to_string())
}

#[cfg(target_os = "windows")]
fn set_login_item(enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let mut command = std::process::Command::new("reg");
    if enabled {
        command.args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Lark", "/t", "REG_SZ", "/d", &exe.display().to_string(), "/f"]);
    } else {
        command.args(["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Lark", "/f"]);
    }
    let status = command.status().map_err(|err| err.to_string())?;
    if status.success() { Ok(()) } else { Err("Could not update login items.".into()) }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn set_login_item(_enabled: bool) -> Result<(), String> {
    Err("Open at login is available in the macOS and Windows apps.".into())
}

fn list_stems(dir: &std::path::Path, ext: &str) -> Vec<String> {
    let mut names = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return names;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some(ext) {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if lark_core::config::validate_theme_name(stem).is_ok() {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    names
}
