mod browser_login;
mod clip_rec;
mod keychain;
mod login;
mod overlay;
mod paths;
mod refresh;

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;

use lark_core::credential_not_saved_message;
use lark_core::discord::{ClientEvent, DiscordRest};
use lark_core::normalize_user_token;
use lark_core::parse_config;
use lark_core::Config;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
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
    voice_audio: watch::Sender<lark_core::discord::voice_media::VoiceAudio>,
    voice_volumes: Arc<std::sync::Mutex<HashMap<String, f32>>>,
    sound_mix: Arc<std::sync::Mutex<lark_core::soundboard::SoundMix>>,
    sound_hotkeys: std::sync::Mutex<Vec<String>>,
    screen_stop: Mutex<Option<watch::Sender<bool>>>,
    screen_dirty: Arc<AtomicBool>,
    clips: clip_rec::ClipEngine,
    premium_type: Arc<AtomicI64>,
    hide_on_close: Arc<AtomicBool>,
    qr_stop: Mutex<Option<watch::Sender<bool>>>,
    browser_stop: Mutex<Option<watch::Sender<bool>>>,
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }
                    let event_name = match overlay::hotkey_kind(shortcut) {
                        Some(overlay::OverlayHotkey::Voice) => "voice-overlay-hotkey",
                        Some(overlay::OverlayHotkey::Perf) => "perf-overlay-hotkey",
                        Some(overlay::OverlayHotkey::Game) => "game-mode-hotkey",
                        None => return,
                    };
                    let _ = app.emit(event_name, ());
                })
                .build(),
        )
        .setup(|app| {
            keychain::mark_main_thread();
            let resolved = paths::resolve(app.handle())?;
            let text = fs::read_to_string(&resolved.config_file).unwrap_or_default();
            let config = parse_config(&text).unwrap_or_else(|err| {
                log::warn!("config ignored: {err}");
                Config::default()
            });
            let save_clip = config.shortcuts.save_clip.clone();
            let clips = clip_rec::ClipEngine::spawn(
                resolved.clips_dir.clone(),
                config.clips.game_capture,
                config.clips.fps,
                config.clips.resolution,
                config.desktop.game_mode,
            );
            let hide_on_close = Arc::new(AtomicBool::new(config.desktop.minimize_to_tray));
            let overlay_voice = config.shortcuts.toggle_voice_overlay.clone();
            let overlay_perf = config.shortcuts.toggle_perf_overlay.clone();
            let overlay_game = config.shortcuts.toggle_game_mode.clone();
            let (speaking, _) = watch::channel(false);
            let (voice_audio, _) = watch::channel(lark_core::discord::voice_media::VoiceAudio::default());
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
                voice_audio,
                voice_volumes: Arc::new(std::sync::Mutex::new(HashMap::new())),
                sound_mix: Arc::new(std::sync::Mutex::new(lark_core::soundboard::SoundMix::new())),
                sound_hotkeys: std::sync::Mutex::new(Vec::new()),
                screen_stop: Mutex::new(None),
                screen_dirty: Arc::new(AtomicBool::new(false)),
                clips,
                premium_type: Arc::new(AtomicI64::new(0)),
                hide_on_close: hide_on_close.clone(),
                qr_stop: Mutex::new(None),
                browser_stop: Mutex::new(None),
            };
            app.manage(shared);
            overlay::sync_hotkeys(app.handle(), &overlay_voice, &overlay_perf, &overlay_game);
            if let Err(err) = install_clip_hotkey(app.handle(), &save_clip) {
                log::warn!("clip hotkey: {err}");
            }
            let sound_clips = app.state::<Shared>().config.blocking_lock().soundboard.clips.clone();
            sync_sound_hotkeys(app.handle(), &sound_clips);
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
            seal_drafts,
            open_drafts,
            open_discord_login,
            open_browser_login,
            cancel_browser_login,
            start_qr_login,
            stop_qr_login,
            connect,
            disconnect,
            fetch_guild_channels,
            fetch_roles,
            fetch_members,
            request_members,
            fetch_profile,
            fetch_dms,
            fetch_friends,
            open_dm,
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
            set_voice_transmit,
            set_voice_audio,
            set_voice_volume,
            play_soundboard,
            import_sound_clip,
            delete_sound_clip,
            fetch_user_note,
            save_user_note,
            list_audio_devices,
            set_presence,
            hardware_snapshot,
            ack_message,
            fetch_pins,
            pin_message,
            unpin_message,
            fetch_emojis,
            fetch_threads,
            search_messages,
            set_unread,
            preview_invite,
            accept_invite,
            set_channel_collapsed,
            set_minimize_to_tray,
            set_autostart,
            start_screen_share,
            stop_screen_share,
            overlay::sync_voice_overlay,
            overlay::current_voice_hud,
            save_clip,
            clip_status,
            set_clip_pace,
            read_clip,
            show_clip,
            open_clips_dir,
            list_clips,
            rename_clip,
            delete_clip,
            trim_clip,
            compress_clip
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
                let app = app_for_watch.clone();
                tauri::async_runtime::spawn(async move {
                    apply_saved_clip_settings(&app).await;
                    let _ = app.emit("config-changed", ());
                });
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
async fn get_config(app: AppHandle, state: State<'_, Shared>) -> Result<Config, String> {
    if let Ok(config) = read_config_file(&state.paths.config_file) {
        *state.config.lock().await = config.clone();
        sync_overlay_hotkeys(&app, &config);
        return Ok(config);
    }
    let config = state.config.lock().await.clone();
    sync_overlay_hotkeys(&app, &config);
    Ok(config)
}

#[tauri::command]
async fn save_config(app: AppHandle, state: State<'_, Shared>, config: Config) -> Result<Config, String> {
    let normalized = parse_config(&toml::to_string(&config).map_err(|err| err.to_string())?)
        .map_err(|err| err.to_string())?;
    let pretty = toml::to_string_pretty(&normalized).map_err(|err| err.to_string())?;
    fs::write(&state.paths.config_file, pretty).map_err(|err| err.to_string())?;
    *state.config.lock().await = normalized.clone();
    sync_overlay_hotkeys(&app, &normalized);
    apply_clip_config(&app, &normalized);
    sync_sound_hotkeys(&app, &normalized.soundboard.clips);
    Ok(normalized)
}

#[tauri::command]
fn app_paths(state: State<'_, Shared>) -> paths::AppPaths {
    paths::describe(&paths::ResolvedPaths {
        config_file: state.paths.config_file.clone(),
        themes_dir: state.paths.themes_dir.clone(),
        plugins_dir: state.paths.plugins_dir.clone(),
        clips_dir: state.clips.dir().to_path_buf(),
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

/// Async, and the window is built on the blocking pool.
/// `WebviewWindowBuilder` deadlocks WebView2 on Windows when it runs on the main
/// thread inside a synchronous command, which leaves a blank white window.
#[tauri::command]
async fn open_discord_login(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || login::open_discord_login(&app))
        .await
        .map_err(|_| "Couldn't open Discord's login page.".to_string())?
}

#[tauri::command]
async fn open_browser_login(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    if let Some(tx) = state.browser_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    let (tx, rx) = watch::channel(false);
    let cancel = tx.clone();
    *state.browser_stop.lock().await = Some(tx);
    browser_login::start(app, rx, cancel).await
}

#[tauri::command]
async fn cancel_browser_login(state: State<'_, Shared>) -> Result<(), String> {
    if let Some(tx) = state.browser_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    Ok(())
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
    if let Some(tx) = state.browser_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    keychain::on_main(&app, keychain::clear_token)?
}

#[tauri::command]
fn seal_drafts(app: AppHandle, plain: String) -> Result<String, String> {
    if plain.len() > 200_000 {
        return Err("Drafts are too large to store.".into());
    }
    keychain::on_main(&app, move || {
        let mut key = keychain::load_or_create_draft_key()?;
        let sealed = lark_core::secretbox::seal(&key, &plain);
        key.zeroize();
        let mut plain = plain;
        plain.zeroize();
        sealed
    })?
}

#[tauri::command]
fn open_drafts(app: AppHandle, sealed: String) -> Result<String, String> {
    if sealed.len() > 400_000 {
        return Err("Saved drafts are too large to open.".into());
    }
    keychain::on_main(&app, move || {
        let mut key = keychain::load_or_create_draft_key()?;
        let opened = lark_core::secretbox::open(&key, &sealed);
        key.zeroize();
        opened
    })?
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
            state.premium_type.store(user.premium_type, Ordering::Relaxed);
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
    let premium_type = Arc::clone(&state.premium_type);
    tauri::async_runtime::spawn(async move {
        lark_core::discord::run_gateway(token, rx, gateway_rx, move |event: ClientEvent| {
            let outbound = match &event {
                ClientEvent::Ready { user, .. } => {
                    premium_type.store(user.premium_type, Ordering::Relaxed);
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
                ClientEvent::VoiceState(state) => {
                    if let Ok(mut slot) = voice_slot.lock() {
                        if slot.user_id == state.user_id && !state.session_id.is_empty() {
                            slot.session_id = state.session_id.clone();
                            if !state.guild_id.is_empty() {
                                slot.guild_id = state.guild_id.clone();
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

fn member_ranges(raw: Option<Vec<Vec<u32>>>) -> Vec<(u32, u32)> {
    let Some(raw) = raw else {
        return vec![(0, 99)];
    };
    let mut out = Vec::new();
    for pair in raw {
        if out.len() == 3 {
            break;
        }
        let Some(start) = pair.first().copied() else {
            continue;
        };
        let Some(end) = pair.get(1).copied() else {
            continue;
        };
        if end < start || end - start > 99 {
            continue;
        }
        out.push((start, end));
    }
    out
}

#[tauri::command]
async fn request_members(
    state: State<'_, Shared>,
    guild_id: String,
    channel_id: Option<String>,
    ranges: Option<Vec<Vec<u32>>>,
) -> Result<(), String> {
    if !lark_core::discord::snowflake_ok(&guild_id) {
        return Err("That id is not a Discord snowflake.".into());
    }
    let channel_id = channel_id.unwrap_or_default();
    if !channel_id.is_empty() && !lark_core::discord::snowflake_ok(&channel_id) {
        return Err("That id is not a Discord snowflake.".into());
    }
    let gateway = state
        .gateway
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Not connected.".to_string())?;
    gateway
        .send(lark_core::discord::GatewayCommand::SubscribeMembers {
            guild_id,
            channel_id,
            ranges: member_ranges(ranges),
        })
        .map_err(|_| "Gateway is closed.".to_string())
}

#[tauri::command]
async fn fetch_profile(
    state: State<'_, Shared>,
    user_id: String,
    guild_id: Option<String>,
) -> Result<lark_core::discord::ClientProfile, String> {
    rest(&state)
        .await?
        .user_profile(&user_id, guild_id.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_dms(
    state: State<'_, Shared>,
) -> Result<Vec<lark_core::discord::ClientChannel>, String> {
    rest(&state)
        .await?
        .private_channels()
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_friends(
    state: State<'_, Shared>,
) -> Result<Vec<lark_core::discord::ClientMember>, String> {
    rest(&state)
        .await?
        .relationships()
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn open_dm(
    state: State<'_, Shared>,
    user_id: String,
) -> Result<lark_core::discord::ClientChannel, String> {
    rest(&state)
        .await?
        .open_dm(&user_id)
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
    nonce: Option<String>,
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
    let limit = lark_core::clip_fit::upload_limit_bytes(state.premium_type.load(Ordering::Relaxed));
    rest(&state)
        .await?
        .send_message(&channel_id, &content, reply_to.as_deref(), nonce.as_deref(), &files, limit)
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
    epoch: u64,
    vad: bool,
    sensitivity: u8,
    noise_suppression: bool,
    input_device: String,
    output_device: String,
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
    let _ = state.speaking.send(!mute && vad);
    let _ = state.voice_audio.send(lark_core::discord::voice_media::VoiceAudio {
        deafened: deaf,
        vad,
        sensitivity: sensitivity.min(100),
        noise_suppression,
        input_device,
        output_device,
    });
    let speaking = state.speaking.subscribe();
    let audio = state.voice_audio.subscribe();
    let volumes = state.voice_volumes.clone();
    let board = state.sound_mix.clone();
    let slot = state.voice.clone();
    let server_id = guild_id.unwrap_or(channel_id);
    tauri::async_runtime::spawn(async move {
        let ready = wait_for_voice(&slot, &server_id, &rx).await;
        if *rx.borrow() {
            return;
        }
        let Ok(mut hello) = ready else {
            let _ = app.emit(
                "discord",
                serde_json::json!({"kind": "voiceLink", "state": "reconnecting", "detail": "Voice server did not answer", "epoch": epoch}),
            );
            return;
        };
        hello.epoch = epoch;
        lark_core::discord::voice_link::maintain_voice(hello, rx, speaking, audio, volumes, board, move |event| {
            let payload = match event {
                lark_core::discord::voice_link::VoiceLinkEvent::Status { state, detail, epoch } => {
                    serde_json::json!({"kind": "voiceLink", "state": state, "detail": detail, "epoch": epoch})
                }
                lark_core::discord::voice_link::VoiceLinkEvent::Speaking { user_id, speaking, epoch } => {
                    serde_json::json!({"kind": "voiceSpeaking", "userId": user_id, "speaking": speaking, "epoch": epoch})
                }
            };
            let _ = app.emit("discord", payload);
        })
        .await;
    });
    Ok(())
}

async fn wait_for_voice(
    slot: &Arc<std::sync::Mutex<VoiceSlot>>,
    server_id: &str,
    cancel: &watch::Receiver<bool>,
) -> Result<lark_core::discord::voice_link::VoiceHello, ()> {
    for _ in 0..40 {
        if *cancel.borrow() {
            return Err(());
        }
        if let Ok(guard) = slot.lock() {
            if !guard.endpoint.is_empty() && !guard.token.is_empty() && !guard.session_id.is_empty() && !guard.user_id.is_empty() {
                return Ok(lark_core::discord::voice_link::VoiceHello {
                    endpoint: guard.endpoint.clone(),
                    server_id: if guard.guild_id.is_empty() { server_id.to_string() } else { guard.guild_id.clone() },
                    channel_id: guard.channel_id.clone(),
                    user_id: guard.user_id.clone(),
                    session_id: guard.session_id.clone(),
                    token: guard.token.clone(),
                    epoch: 0,
                });
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    Err(())
}

async fn stop_voice(state: &Shared) {
    if let Ok(mut mix) = state.sound_mix.lock() {
        mix.clear();
    }
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
    if mute {
        let _ = state.speaking.send(false);
    }
    let mut audio = state.voice_audio.borrow().clone();
    audio.deafened = deaf;
    let _ = state.voice_audio.send(audio);
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
async fn set_voice_transmit(state: State<'_, Shared>, transmit: bool) -> Result<(), String> {
    let _ = state.speaking.send(transmit);
    Ok(())
}

#[tauri::command]
async fn set_voice_audio(
    state: State<'_, Shared>,
    deafened: bool,
    vad: bool,
    sensitivity: u8,
    noise_suppression: bool,
    input_device: String,
    output_device: String,
) -> Result<(), String> {
    let _ = state.voice_audio.send(lark_core::discord::voice_media::VoiceAudio {
        deafened,
        vad,
        sensitivity: sensitivity.min(100),
        noise_suppression,
        input_device,
        output_device,
    });
    Ok(())
}

fn push_clip(state: &Shared, clip: &lark_core::config::SoundClip) -> Result<(), String> {
    let bytes = fs::read(&clip.path).map_err(|_| format!("Could not read {}.", clip.name))?;
    let pcm = lark_core::soundboard::decode_wav_mono(&bytes)?;
    let gain = (f32::from(clip.volume) / 100.0).clamp(0.0, 2.0);
    let gained: Vec<f32> = pcm.into_iter().map(|sample| (sample * gain).clamp(-1.0, 1.0)).collect();
    state
        .sound_mix
        .lock()
        .map_err(|_| "Soundboard is busy.".to_string())?
        .push(gained);
    Ok(())
}

fn queue_sound(state: &Shared, id: &str) -> Result<(), String> {
    if state.voice_stop.blocking_lock().is_none() {
        return Err("Join a voice channel to play a sound.".into());
    }
    let clip = {
        let config = state.config.blocking_lock();
        config.soundboard.clips.iter().find(|clip| clip.id == id).cloned()
    };
    let Some(clip) = clip else {
        return Err("That sound is not on the board.".into());
    };
    push_clip(state, &clip)
}

fn soundboard_dir(config_file: &std::path::Path) -> PathBuf {
    config_file.parent().unwrap_or_else(|| std::path::Path::new(".")).join("soundboard")
}

fn window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
}

fn sync_sound_hotkeys(app: &AppHandle, clips: &[lark_core::config::SoundClip]) {
    let state = app.state::<Shared>();
    let mut registered = state.sound_hotkeys.lock().unwrap_or_else(|err| err.into_inner());
    let shortcuts = app.global_shortcut();
    for accel in registered.drain(..) {
        let _ = shortcuts.unregister(accel.as_str());
    }
    for clip in clips {
        if clip.hotkey.trim().is_empty() {
            continue;
        }
        let Ok(accel) = lark_core::clip::global_accelerator(&clip.hotkey) else {
            continue;
        };
        let id = clip.id.clone();
        match shortcuts.on_shortcut(accel.as_str(), move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed || window_focused(app) {
                return;
            }
            let state = app.state::<Shared>();
            if let Err(error) = queue_sound(&*state, &id) {
                log::info!("soundboard: {error}");
                let _ = app.emit("soundboard", serde_json::json!({ "id": id, "error": error }));
            }
        }) {
            Ok(()) => registered.push(accel),
            Err(err) => log::warn!("soundboard hotkey: {err}"),
        }
    }
}

#[tauri::command]
async fn play_soundboard(state: State<'_, Shared>, id: String) -> Result<(), String> {
    if state.voice_stop.lock().await.is_none() {
        return Err("Join a voice channel to play a sound.".into());
    }
    let clip = {
        let config = state.config.lock().await;
        config.soundboard.clips.iter().find(|clip| clip.id == id).cloned()
    };
    let Some(clip) = clip else {
        return Err("That sound is not on the board.".into());
    };
    push_clip(&*state, &clip)
}

#[tauri::command]
fn import_sound_clip(state: State<'_, Shared>, name: String, bytes: Vec<u8>) -> Result<lark_core::config::SoundClip, String> {
    let pcm = lark_core::soundboard::decode_wav_mono(&bytes)?;
    if pcm.is_empty() {
        return Err("That WAV file has no audio.".into());
    }
    let dir = soundboard_dir(&state.paths.config_file);
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let id = sound_clip_id(&name, bytes.first().copied().unwrap_or(0));
    let path = dir.join(format!("{id}.wav"));
    fs::write(&path, &bytes).map_err(|err| err.to_string())?;
    Ok(lark_core::config::SoundClip {
        id,
        name: sound_clip_name(&name),
        path: path.display().to_string(),
        hotkey: String::new(),
        volume: 100,
    })
}

fn sound_clip_id(name: &str, salt: u8) -> String {
    let slug: String = name
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .take(12)
        .collect();
    let slug = if slug.is_empty() { "clip".to_string() } else { slug };
    let tick = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{slug}-{tick:x}{salt:02x}")
}

fn sound_clip_name(name: &str) -> String {
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let cleaned: String = stem.trim().chars().filter(|ch| !ch.is_control()).take(40).collect();
    if cleaned.is_empty() { "Sound".into() } else { cleaned }
}

#[tauri::command]
fn delete_sound_clip(state: State<'_, Shared>, path: String) -> Result<(), String> {
    let dir = soundboard_dir(&state.paths.config_file);
    let Ok(dir) = dir.canonicalize() else {
        return Ok(());
    };
    let candidate = std::path::PathBuf::from(path);
    let Ok(candidate) = candidate.canonicalize() else {
        return Ok(());
    };
    if candidate.starts_with(&dir) && candidate.is_file() {
        fs::remove_file(candidate).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn fetch_user_note(state: State<'_, Shared>, user_id: String) -> Result<String, String> {
    rest(&state).await?.user_note(&user_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn save_user_note(state: State<'_, Shared>, user_id: String, note: String) -> Result<(), String> {
    rest(&state).await?.set_user_note(&user_id, &note).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_voice_volume(state: State<'_, Shared>, user_id: String, volume: u16) -> Result<(), String> {
    let gain = (volume as f32 / 100.0).clamp(0.0, 2.0);
    if let Ok(mut volumes) = state.voice_volumes.lock() {
        volumes.insert(user_id, gain);
    }
    Ok(())
}

#[tauri::command]
fn list_audio_devices() -> serde_json::Value {
    let (inputs, outputs) = lark_core::discord::voice_io::list_input_output();
    serde_json::json!({ "inputs": inputs, "outputs": outputs })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HardwareSnapshot {
    gpu: Option<String>,
    cpu_temp_c: Option<u16>,
    game: Option<String>,
    line: Option<String>,
    cpu_percent: Option<u8>,
    ram_used_mb: Option<u32>,
    ram_total_mb: Option<u32>,
}

fn sync_overlay_hotkeys(app: &AppHandle, config: &Config) {
    overlay::sync_hotkeys(
        app,
        &config.shortcuts.toggle_voice_overlay,
        &config.shortcuts.toggle_perf_overlay,
        &config.shortcuts.toggle_game_mode,
    );
}

/// Full reads stay behind Hardware in status. A load read (CPU, RAM, game) also
/// runs for the performance overlay and game detection.
#[tauri::command]
async fn hardware_snapshot(state: State<'_, Shared>, full: Option<bool>) -> Result<HardwareSnapshot, String> {
    let full = full.unwrap_or(true);
    let allowed = {
        let config = state.config.lock().await;
        if full {
            config.desktop.hardware_status
        } else {
            config.desktop.hardware_status || config.desktop.perf_overlay || config.desktop.detect_games
        }
    };
    if !allowed {
        return Err(if full {
            "Hardware status is off.".into()
        } else {
            "Hardware reads are off.".into()
        });
    }
    let os = std::env::consts::OS.to_string();
    let reading = tauri::async_runtime::spawn_blocking(move || {
        if full {
            lark_core::hardware::sample_hardware(&os)
        } else {
            lark_core::hardware::sample_load(&os)
        }
    })
    .await
    .map_err(|_| "Hardware sample failed.".to_string())?;
    Ok(HardwareSnapshot {
        line: reading.line(),
        gpu: reading.gpu,
        cpu_temp_c: reading.cpu_temp_c,
        game: reading.game,
        cpu_percent: reading.cpu_percent,
        ram_used_mb: reading.ram_used_mb,
        ram_total_mb: reading.ram_total_mb,
    })
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
async fn pin_message(state: State<'_, Shared>, channel_id: String, message_id: String) -> Result<(), String> {
    rest(&state).await?.set_pin(&channel_id, &message_id, true).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn unpin_message(state: State<'_, Shared>, channel_id: String, message_id: String) -> Result<(), String> {
    rest(&state).await?.set_pin(&channel_id, &message_id, false).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_emojis(state: State<'_, Shared>, guild_id: String) -> Result<Vec<lark_core::discord::ClientEmoji>, String> {
    rest(&state).await?.emojis(&guild_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_threads(state: State<'_, Shared>, channel_id: String) -> Result<Vec<lark_core::discord::ClientChannel>, String> {
    rest(&state).await?.active_threads(&channel_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn search_messages(state: State<'_, Shared>, guild_id: String, query: String) -> Result<Vec<lark_core::discord::ClientMessage>, String> {
    rest(&state).await?.search_guild(&guild_id, &query).await.map_err(|err| err.to_string())
}

#[tauri::command]
fn set_unread(app: AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id("lark") {
        let tip = if count == 0 {
            "Lark".to_string()
        } else {
            format!("Lark · {count} unread")
        };
        let _ = tray.set_tooltip(Some(&tip));
        let title = if count == 0 { None } else { Some(count.to_string()) };
        let _ = tray.set_title(title);
    }
    if let Some(window) = app.get_webview_window("main") {
        let badge = if count == 0 { None } else { Some(i64::from(count)) };
        let _ = window.set_badge_count(badge);
    }
}

#[tauri::command]
async fn preview_invite(state: State<'_, Shared>, code: String) -> Result<lark_core::discord::shell::ClientInvite, String> {
    rest(&state).await?.invite_preview(&code).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn accept_invite(state: State<'_, Shared>, code: String) -> Result<lark_core::discord::shell::ClientInvite, String> {
    rest(&state).await?.accept_invite(&code).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_channel_collapsed(
    state: State<'_, Shared>,
    guild_id: String,
    channel_id: String,
    collapsed: bool,
) -> Result<(), String> {
    rest(&state)
        .await?
        .set_channel_collapsed(&guild_id, &channel_id, collapsed)
        .await
        .map_err(|err| err.to_string())
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
    state.clips.set_share(true);
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
    state.clips.set_share(false);
    Ok(())
}

#[tauri::command]
fn save_clip(app: AppHandle, state: State<'_, Shared>) -> Result<clip_rec::ClipSaved, String> {
    match state.clips.save() {
        Ok(saved) => {
            let _ = app.emit("clip-ready", &saved);
            Ok(saved)
        }
        Err(error) => {
            let _ = app.emit("clip-ready", clip_rec::ClipSaved::failed(error.clone()));
            Err(error)
        }
    }
}

#[tauri::command]
fn clip_status(state: State<'_, Shared>) -> clip_rec::ClipStatus {
    state.clips.status()
}

#[tauri::command]
fn set_clip_pace(state: State<'_, Shared>, game_mode: bool) {
    state.clips.set_pace(game_mode);
}

#[tauri::command]
fn read_clip(state: State<'_, Shared>, name: String) -> Result<String, String> {
    state.clips.read_base64(&name)
}

#[tauri::command]
fn show_clip(state: State<'_, Shared>, name: String) -> Result<(), String> {
    let path = state.clips.clip_path(&name)?;
    clip_rec::reveal_path(&path)
}

#[tauri::command]
fn open_clips_dir(state: State<'_, Shared>) -> Result<(), String> {
    clip_rec::open_dir(state.clips.dir())
}

#[tauri::command]
fn list_clips(state: State<'_, Shared>) -> Vec<clip_rec::ClipEntry> {
    state.clips.list()
}

#[tauri::command]
fn rename_clip(state: State<'_, Shared>, name: String, label: String) -> Result<String, String> {
    state.clips.rename(&name, &label)
}

#[tauri::command]
fn delete_clip(state: State<'_, Shared>, name: String) -> Result<(), String> {
    state.clips.delete(&name)
}

fn ffmpeg_hints(app: &AppHandle) -> Vec<PathBuf> {
    let mut hints = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        hints.extend(lark_core::clip_fit::ffmpeg_candidates(Some(&dir), None));
    }
    hints
}

#[tauri::command]
fn trim_clip(
    app: AppHandle,
    state: State<'_, Shared>,
    name: String,
    start_ms: u64,
    end_ms: u64,
) -> Result<clip_rec::ClipSaved, String> {
    state
        .clips
        .trim(&name, start_ms, end_ms, &ffmpeg_hints(&app))
}

#[tauri::command]
async fn compress_clip(
    app: AppHandle,
    state: State<'_, Shared>,
    name: String,
    limit_bytes: u64,
) -> Result<clip_rec::ClipSaved, String> {
    let hints = ffmpeg_hints(&app);
    let engine = state.clips.clone();
    let progress = app.clone();
    let clip_name = name.clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.compress(&name, limit_bytes, &hints, &mut |percent| {
            let _ = progress.emit(
                "clip-compress",
                serde_json::json!({ "name": clip_name, "percent": percent }),
            );
        })
    })
    .await
    .map_err(|err| err.to_string())?
}

fn install_clip_hotkey(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    // The voice HUD already installs the global-shortcut plugin. A second plugin
    // would replace that handler, so the clip key is registered on the same one.
    let state = app.state::<Shared>();
    state.clips.set_plugin_ready();
    apply_clip_hotkey(app, shortcut);
    Ok(())
}

fn on_clip_hotkey(app: &AppHandle) {
    let state = app.state::<Shared>();
    match state.clips.save() {
        Ok(saved) => {
            let _ = app.emit("clip-ready", &saved);
        }
        Err(error) => {
            log::info!("clip hotkey: {error}");
            let _ = app.emit("clip-ready", clip_rec::ClipSaved::failed(error));
        }
    }
}

fn apply_clip_hotkey(app: &AppHandle, shortcut: &str) {
    let state = app.state::<Shared>();
    if !state.clips.plugin_ready() {
        state.clips.set_hotkey_error("The global clip hotkey is not available.".into());
        return;
    }
    match sync_clip_hotkey(app, shortcut) {
        Ok(()) => state.clips.set_hotkey_error(String::new()),
        Err(err) => {
            log::warn!("clip hotkey: {err}");
            state.clips.set_hotkey_error(err);
        }
    }
}

fn sync_clip_hotkey(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let state = app.state::<Shared>();
    let gate = state.clips.hotkey_lock();
    let _held = gate.lock().unwrap_or_else(|err| err.into_inner());
    let accel = lark_core::clip::global_accelerator(shortcut)?;
    let current = state.clips.registered_hotkey();
    if current == accel {
        return Ok(());
    }
    let shortcuts = app.global_shortcut();
    if !current.is_empty() {
        let _ = shortcuts.unregister(current.as_str());
        // Drop the remembered accelerator if the new one fails to register,
        // so the next save retries instead of treating the old key as live.
        state.clips.set_registered_hotkey(String::new());
    }
    shortcuts
        .on_shortcut(accel.as_str(), |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            on_clip_hotkey(app);
        })
        .map_err(|err| err.to_string())?;
    state.clips.set_registered_hotkey(accel);
    Ok(())
}

fn apply_clip_config(app: &AppHandle, config: &Config) {
    let state = app.state::<Shared>();
    state.clips.set_quality(config.clips.fps, config.clips.resolution);
    state.clips.set_game(config.clips.game_capture);
    apply_clip_hotkey(app, &config.shortcuts.save_clip);
}

async fn apply_saved_clip_settings(app: &AppHandle) {
    let state = app.state::<Shared>();
    let Ok(config) = read_config_file(&state.paths.config_file) else {
        return;
    };
    apply_clip_config(app, &config);
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
