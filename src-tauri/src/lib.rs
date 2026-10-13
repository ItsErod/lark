mod browser_login;
mod clip_rec;
mod golive;
mod keychain;
mod login;
mod overlay;
mod paths;
mod refresh;
mod store;
mod ui_hot;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;

use lark_core::credential_not_saved_message;
use lark_core::discord::{ClientEvent, DiscordRest};
use lark_core::normalize_user_token;
use lark_core::parse_config;
use lark_core::prepare_saved_config;
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
    voice_log: Arc<std::sync::Mutex<lark_core::discord::voice_log::VoiceLog>>,
    voice_stop: Mutex<Option<watch::Sender<bool>>>,
    speaking: watch::Sender<bool>,
    voice_audio: watch::Sender<lark_core::discord::voice_media::VoiceAudio>,
    voice_volumes: Arc<std::sync::Mutex<HashMap<String, f32>>>,
    sound_mix: Arc<std::sync::Mutex<lark_core::soundboard::SoundMix>>,
    camera: Arc<lark_core::discord::voice_camera::CameraInbox>,
    sound_hotkeys: std::sync::Mutex<Vec<String>>,
    streams: Arc<golive::StreamHub>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForwardIn {
    message_id: String,
    channel_id: String,
    guild_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchIn {
    #[serde(default)]
    content: String,
    #[serde(default)]
    author_ids: Vec<String>,
    #[serde(default)]
    mention_ids: Vec<String>,
    #[serde(default)]
    has: Vec<String>,
    #[serde(default)]
    before_id: Option<String>,
    #[serde(default)]
    after_id: Option<String>,
    #[serde(default)]
    channel_ids: Vec<String>,
    #[serde(default)]
    pinned: Option<bool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    refresh::prepare_webview();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol("larkui", |ctx, request| ui_hot::serve(ctx.app_handle(), request))
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
                voice_log: Arc::new(std::sync::Mutex::new(lark_core::discord::voice_log::VoiceLog::default())),
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
                camera: Arc::new(lark_core::discord::voice_camera::CameraInbox::new()),
                sound_hotkeys: std::sync::Mutex::new(Vec::new()),
                streams: Arc::new(golive::StreamHub::new()),
                clips,
                premium_type: Arc::new(AtomicI64::new(0)),
                hide_on_close: hide_on_close.clone(),
                qr_stop: Mutex::new(None),
                browser_stop: Mutex::new(None),
            };
            app.manage(shared);
            ui_hot::manage(app.handle());
            ui_hot::startup(app.handle());
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
            let deferred = app.handle().clone();
            let watcher = deferred.clone();
            let clip_shortcut = save_clip.clone();
            let voice_shortcut = overlay_voice.clone();
            let perf_shortcut = overlay_perf.clone();
            let game_shortcut = overlay_game.clone();
            tauri::async_runtime::spawn(async move {
                let shell = deferred.clone();
                let _ = deferred.run_on_main_thread(move || {
                    #[cfg(any(windows, target_os = "linux"))]
                    {
                        use tauri_plugin_deep_link::DeepLinkExt;
                        if let Err(err) = shell.deep_link().register_all() {
                            log::warn!("store link: {err}");
                        }
                    }
                    overlay::sync_hotkeys(&shell, &voice_shortcut, &perf_shortcut, &game_shortcut);
                    if let Err(err) = install_clip_hotkey(&shell, &clip_shortcut) {
                        log::warn!("clip hotkey: {err}");
                    }
                    let sound_clips = shell.state::<Shared>().config.blocking_lock().soundboard.clips.clone();
                    sync_sound_hotkeys(&shell, &sound_clips);
                    install_tray(&shell);
                });
                if let Err(err) = install_watcher(watcher).await {
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
            store_index,
            install_store_item,
            uninstall_store_item,
            installed_store,
            open_store_page,
            join_voice,
            leave_voice,
            voice_diagnostics,
            set_voice_self,
            set_voice_transmit,
            set_voice_audio,
            set_voice_processing,
            set_voice_camera,
            push_camera_frame,
            set_voice_video,
            fetch_soundboard,
            play_guild_sound,
            create_activity_invite,
            modify_channel,
            duplicate_channel,
            set_voice_status,
            start_stage,
            set_member_voice,
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
            set_guild_folders,
            set_minimize_to_tray,
            set_autostart,
            list_share_sources,
            start_screen_share,
            stop_screen_share,
            set_share_paused,
            set_share_quality,
            watch_stream,
            stop_watch_stream,
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
            compress_clip,
            guild_admin,
            fetch_thread_index,
            start_thread,
            start_forum_post,
            edit_thread,
            fetch_thread_members,
            join_thread,
            leave_thread,
            follow_thread,
            set_thread_member,
            follow_forum,
            create_poll,
            vote_poll,
            end_poll,
            fetch_poll_voters,
            fetch_events,
            create_scheduled_event,
            rsvp_event,
            start_scheduled_event,
            ack_bulk,
            fetch_mentions,
            fetch_friend_requests,
            fetch_message_requests,
            accept_message_request,
            ignore_message_request,
            fetch_relationships,
            add_relationship,
            add_friend_username,
            remove_relationship,
            block_user,
            ignore_user,
            set_friend_nickname,
            close_dm,
            create_group_dm,
            rename_group_dm,
            add_dm_recipient,
            mute_dm,
            create_channel_invite,
            set_server_profile,
            set_custom_status,
            remember_account,
            switch_account,
            forget_account,
            account_overview,
            remove_connection,
            open_discord_link,
            search_filtered,
            search_gifs,
            fetch_stickers,
            reaction_users,
            search_app_commands,
            invoke_command,
            open_discord_page,
            interface_status,
            interface_check,
            interface_set_channel,
            interface_reset,
            interface_reload,
            interface_boot_ready,
            set_user_lists,
            list_saved_messages,
            put_saved_message,
            delete_saved_message
        ])
        .run(tauri::generate_context!())
        .expect("lark failed to start");
}

fn voice_busy(state: &Shared) -> bool {
    state
        .voice
        .lock()
        .map(|slot| !slot.channel_id.is_empty())
        .unwrap_or(false)
}

#[tauri::command]
fn interface_status(app: AppHandle) -> ui_hot::InterfaceStatus {
    ui_hot::status(&app)
}

#[tauri::command]
async fn interface_check(app: AppHandle, manual: bool) -> Result<ui_hot::InterfaceReport, String> {
    ui_hot::check_interface(app, manual).await
}

#[tauri::command]
fn interface_set_channel(app: AppHandle, channel: String) -> Result<ui_hot::InterfaceStatus, String> {
    ui_hot::set_channel(&app, &channel)
}

#[tauri::command]
fn interface_reset(app: AppHandle) -> Result<ui_hot::InterfaceStatus, String> {
    ui_hot::reset_to_builtin(&app)
}

#[tauri::command]
fn interface_reload(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    if voice_busy(&state) {
        return Err("A voice call is still connected.".into());
    }
    ui_hot::reload_interface(&app)
}

#[tauri::command]
fn interface_boot_ready(app: AppHandle) -> Result<(), String> {
    ui_hot::boot_ready(&app)
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
    let normalized = prepare_saved_config(config)?;
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
    let streams = state.streams.clone();
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
                ClientEvent::StreamServer { stream_key, endpoint, token, guild_id } => {
                    streams.note_server(stream_key, endpoint, token);
                    Some(serde_json::json!({
                        "kind": "streamServer",
                        "streamKey": stream_key,
                        "endpoint": endpoint,
                        "guildId": guild_id
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
    sticker_ids: Option<Vec<String>>,
    forward: Option<ForwardIn>,
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
    let forward = forward.map(|item| lark_core::discord::rest::ForwardRef {
        message_id: item.message_id,
        channel_id: item.channel_id,
        guild_id: item.guild_id,
    });
    rest(&state)
        .await?
        .send_composed(
            &channel_id,
            &content,
            reply_to.as_deref(),
            nonce.as_deref(),
            &files,
            limit,
            sticker_ids.as_deref().unwrap_or(&[]),
            forward.as_ref(),
        )
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
    store::read_verified_theme(&state.paths.themes_dir, &name)
}

#[tauri::command]
fn write_theme(state: State<'_, Shared>, name: String, css: String) -> Result<(), String> {
    lark_core::config::validate_theme_name(&name).map_err(|err| err.to_string())?;
    lark_core::config::validate_theme_css(&css).map_err(|err| err.to_string())?;
    let path = state.paths.themes_dir.join(format!("{name}.css"));
    fs::write(path, css).map_err(|err| err.to_string())?;
    // A file the user imported is not a store download, so the store hash no longer applies.
    let _ = fs::remove_file(state.paths.themes_dir.join(format!("{name}.json")));
    Ok(())
}

#[tauri::command]
fn list_themes(state: State<'_, Shared>) -> Vec<String> {
    list_stems(&state.paths.themes_dir, "css")
        .into_iter()
        .filter(|name| store::theme_readable(&state.paths.themes_dir, name))
        .collect()
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
    let mut on_disk: Vec<PluginInfo> = store::records(&state.paths.plugins_dir, &state.paths.themes_dir)
        .into_iter()
        .filter(|item| item.kind == "plugin")
        .map(|item| PluginInfo {
            id: item.id,
            name: item.name,
            description: item.description,
        })
        .collect();
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
    store::read_verified_plugin(&state.paths.plugins_dir, &id)
}

#[tauri::command]
async fn store_index() -> Result<String, String> {
    store::fetch_index().await
}

#[tauri::command]
async fn install_store_item(state: State<'_, Shared>, id: String) -> Result<store::InstalledRecord, String> {
    let plugins_dir = state.paths.plugins_dir.clone();
    let themes_dir = state.paths.themes_dir.clone();
    store::install(&plugins_dir, &themes_dir, &id).await
}

#[tauri::command]
fn uninstall_store_item(state: State<'_, Shared>, id: String) -> Result<(), String> {
    store::uninstall(&state.paths.plugins_dir, &state.paths.themes_dir, &id)
}

#[tauri::command]
fn installed_store(state: State<'_, Shared>) -> Vec<store::InstalledRecord> {
    store::records(&state.paths.plugins_dir, &state.paths.themes_dir)
}

#[tauri::command]
fn open_store_page() -> Result<(), String> {
    store::open_store_page()
}

#[derive(serde::Serialize)]
struct PluginInfo {
    id: String,
    name: String,
    description: String,
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
    let previous = state.voice_audio.borrow().clone();
    let _ = state.voice_audio.send(lark_core::discord::voice_media::VoiceAudio {
        deafened: deaf,
        vad,
        sensitivity: sensitivity.min(100),
        noise_suppression,
        input_device,
        output_device,
        echo_cancellation: previous.echo_cancellation,
        agc: previous.agc,
        input_volume: previous.input_volume,
        output_volume: previous.output_volume,
        noise_quality: previous.noise_quality,
    });
    let speaking = state.speaking.subscribe();
    let audio = state.voice_audio.subscribe();
    let volumes = state.voice_volumes.clone();
    let board = state.sound_mix.clone();
    let slot = state.voice.clone();
    let voice_log = state.voice_log.clone();
    let camera = state.camera.clone();
    if let Ok(mut log) = voice_log.lock() {
        *log = lark_core::discord::voice_log::VoiceLog::default();
        log.push("join requested");
    }
    let server_id = guild_id.unwrap_or(channel_id);
    tauri::async_runtime::spawn(async move {
        let ready = wait_for_voice(&slot, &server_id, &rx, camera).await;
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
        lark_core::discord::voice_link::maintain_voice(hello, rx, speaking, audio, volumes, board, voice_log, move |event| {
            let payload = match event {
                lark_core::discord::voice_link::VoiceLinkEvent::Status { state, detail, epoch } => {
                    serde_json::json!({"kind": "voiceLink", "state": state, "detail": detail, "epoch": epoch})
                }
                lark_core::discord::voice_link::VoiceLinkEvent::Speaking { user_id, speaking, epoch } => {
                    serde_json::json!({"kind": "voiceSpeaking", "userId": user_id, "speaking": speaking, "epoch": epoch})
                }
                lark_core::discord::voice_link::VoiceLinkEvent::Ping { ping_ms, endpoint, epoch } => {
                    serde_json::json!({"kind": "voiceLink", "state": "connected", "detail": "", "epoch": epoch, "pingMs": ping_ms, "endpoint": endpoint})
                }
                lark_core::discord::voice_link::VoiceLinkEvent::Camera { user_id, annex_b, epoch } => {
                    serde_json::json!({
                        "kind": "cameraFrame",
                        "userId": user_id,
                        "annexB": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, annex_b),
                        "epoch": epoch,
                    })
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
    camera: Arc<lark_core::discord::voice_camera::CameraInbox>,
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
                    camera: camera.clone(),
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
fn voice_diagnostics(state: State<'_, Shared>) -> String {
    state
        .voice_log
        .lock()
        .map(|log| log.export())
        .unwrap_or_else(|_| "Lark voice diagnostics\nvoice log is locked\n".to_string())
}

#[tauri::command]
async fn leave_voice(state: State<'_, Shared>) -> Result<(), String> {
    stop_screen_share_inner(&state).await;
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
    let previous = state.voice_audio.borrow().clone();
    let _ = state.voice_audio.send(lark_core::discord::voice_media::VoiceAudio {
        deafened,
        vad,
        sensitivity: sensitivity.min(100),
        noise_suppression,
        input_device,
        output_device,
        echo_cancellation: previous.echo_cancellation,
        agc: previous.agc,
        input_volume: previous.input_volume,
        output_volume: previous.output_volume,
        noise_quality: previous.noise_quality,
    });
    Ok(())
}

#[tauri::command]
fn set_voice_processing(
    state: State<'_, Shared>,
    echo_cancellation: bool,
    agc: bool,
    input_volume: u8,
    output_volume: u8,
    noise_quality: Option<String>,
) -> Result<(), String> {
    let mut audio = state.voice_audio.borrow().clone();
    audio.echo_cancellation = echo_cancellation;
    audio.agc = agc;
    audio.input_volume = input_volume.min(200);
    audio.output_volume = output_volume.min(200);
    if let Some(quality) = noise_quality {
        audio.noise_quality = if quality == "high" { "high".into() } else { "standard".into() };
    }
    let _ = state.voice_audio.send(audio);
    Ok(())
}

#[tauri::command]
fn set_voice_camera(state: State<'_, Shared>, active: bool) {
    state.camera.set_active(active);
}

#[tauri::command]
fn push_camera_frame(state: State<'_, Shared>, width: u32, height: u32, rgba: Vec<u8>) {
    state.camera.push(lark_core::discord::voice_camera::CameraFrame { width, height, rgba });
}

#[tauri::command]
async fn set_voice_video(
    state: State<'_, Shared>,
    guild_id: Option<String>,
    channel_id: Option<String>,
    mute: bool,
    deaf: bool,
    video: bool,
    request_to_speak: Option<String>,
) -> Result<(), String> {
    state.camera.set_active(video);
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    gateway
        .send(lark_core::discord::GatewayCommand::VoiceStateVideo {
            guild_id,
            channel_id,
            mute,
            deaf,
            video,
            request_to_speak,
        })
        .map_err(|_| "Gateway is closed.".to_string())
}

#[tauri::command]
async fn fetch_soundboard(state: State<'_, Shared>, guild_id: String) -> Result<Vec<serde_json::Value>, String> {
    rest(&state).await?.guild_soundboard(&guild_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn play_guild_sound(
    state: State<'_, Shared>,
    channel_id: String,
    sound_id: String,
    guild_id: String,
    volume: Option<f64>,
) -> Result<(), String> {
    let client = rest(&state).await?;
    client
        .send_soundboard_sound(&channel_id, &sound_id, &guild_id)
        .await
        .map_err(|err| err.to_string())?;
    let pcm = load_guild_pcm(&client, &state, &sound_id).await?;
    let gain = volume.unwrap_or(1.0).clamp(0.0, 1.0) as f32;
    let gained: Vec<f32> = pcm.into_iter().map(|sample| (sample * gain).clamp(-1.0, 1.0)).collect();
    state
        .sound_mix
        .lock()
        .map_err(|_| "Soundboard is busy.".to_string())?
        .push_guild(gained);
    Ok(())
}

#[tauri::command]
async fn create_activity_invite(state: State<'_, Shared>, channel_id: String, application_id: String) -> Result<String, String> {
    rest(&state)
        .await?
        .create_invite(&channel_id, Some(&application_id))
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn modify_channel(state: State<'_, Shared>, channel_id: String, name: Option<String>, topic: Option<String>) -> Result<(), String> {
    let name = name.as_deref().map(str::trim).filter(|name| !name.is_empty());
    let topic = topic.as_deref();
    rest(&state).await?.modify_channel(&channel_id, name, topic).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn duplicate_channel(state: State<'_, Shared>, guild_id: String, channel_id: String, name: String) -> Result<(), String> {
    let client = rest(&state).await?;
    let source = client.channel_json(&channel_id).await.map_err(|err| err.to_string())?;
    let kind = source.get("type").and_then(|kind| kind.as_i64()).unwrap_or(2);
    let mut body = serde_json::json!({
        "name": name.trim(),
        "type": kind,
    });
    if let Some(parent) = source.get("parent_id").filter(|parent| !parent.is_null()) {
        body["parent_id"] = parent.clone();
    }
    if let Some(bitrate) = source.get("bitrate") {
        body["bitrate"] = bitrate.clone();
    }
    if let Some(limit) = source.get("user_limit") {
        body["user_limit"] = limit.clone();
    }
    client.create_guild_channel(&guild_id, body).await.map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_voice_status(state: State<'_, Shared>, channel_id: String, status: String) -> Result<(), String> {
    let status = status.trim().chars().take(500).collect::<String>();
    rest(&state).await?.set_voice_status(&channel_id, &status).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn start_stage(state: State<'_, Shared>, channel_id: String, topic: String) -> Result<(), String> {
    let topic = topic.trim().chars().take(120).collect::<String>();
    rest(&state).await?.start_stage(&channel_id, &topic).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_member_voice(
    state: State<'_, Shared>,
    guild_id: String,
    user_id: String,
    mute: Option<bool>,
    deaf: Option<bool>,
    channel_id: Option<String>,
    disconnect: Option<bool>,
    suppress: Option<bool>,
) -> Result<(), String> {
    let body = lark_core::discord::rest::member_voice_json(
        mute,
        deaf,
        channel_id.as_deref(),
        disconnect.unwrap_or(false),
        suppress,
    );
    rest(&state).await?.set_member_voice(&guild_id, &user_id, body).await.map_err(|err| err.to_string())
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
    let gain = (volume as f32 / 100.0).clamp(0.0, lark_core::discord::voice_media::USER_GAIN_CAP);
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
async fn hardware_snapshot(state: State<'_, Shared>, full: Option<bool>, game: Option<bool>) -> Result<HardwareSnapshot, String> {
    let full = full.unwrap_or(true);
    let game = game.unwrap_or(false);
    let allowed = {
        let config = state.config.lock().await;
        if full {
            config.desktop.hardware_status
        } else {
            config.desktop.hardware_status || config.desktop.perf_overlay || config.desktop.detect_games || game
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
async fn set_presence(state: State<'_, Shared>, status: String, custom: String, game: Option<String>) -> Result<(), String> {
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    let allowed = ["online", "idle", "dnd", "invisible"];
    if !allowed.contains(&status.as_str()) {
        return Err("Unknown status.".into());
    }
    gateway
        .send(lark_core::discord::GatewayCommand::Presence { status, custom, game: game.unwrap_or_default() })
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
async fn set_guild_folders(
    state: State<'_, Shared>,
    folders: Vec<lark_core::discord::shell::ClientFolder>,
) -> Result<(), String> {
    rest(&state)
        .await?
        .set_guild_folders(&folders)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn guild_admin(
    state: State<'_, Shared>,
    request: lark_core::discord::guild_admin::GuildAdminRequest,
) -> Result<serde_json::Value, String> {
    rest(&state)
        .await?
        .guild_admin(request)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn remember_account(app: AppHandle, user_id: String) -> Result<(), String> {
    let slot = keychain::account_slot(&user_id)?;
    let token = keychain::on_main(&app, keychain::load_token)??
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "No token saved.".to_string())?;
    keychain::on_main(&app, move || {
        let result = keychain::save_named(&slot, &token);
        let mut token = token;
        token.zeroize();
        result
    })?
}

#[tauri::command]
async fn switch_account(app: AppHandle, state: State<'_, Shared>, user_id: String) -> Result<(), String> {
    let slot = keychain::account_slot(&user_id)?;
    let token = keychain::on_main(&app, move || keychain::load_named(&slot))??
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "That account is not saved on this computer.".to_string())?;
    disconnect_inner(&state).await;
    keychain::on_main(&app, move || {
        let result = keychain::save_token(&token);
        let mut token = token;
        token.zeroize();
        result
    })?
}

#[tauri::command]
async fn forget_account(app: AppHandle, user_id: String) -> Result<(), String> {
    let slot = keychain::account_slot(&user_id)?;
    keychain::on_main(&app, move || keychain::clear_named(&slot))?
}

#[tauri::command]
async fn account_overview(state: State<'_, Shared>) -> Result<serde_json::Value, String> {
    rest(&state)
        .await?
        .account_overview()
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn remove_connection(state: State<'_, Shared>, kind: String, id: String) -> Result<(), String> {
    rest(&state)
        .await?
        .remove_connection(&kind, &id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn open_discord_link(url: String) -> Result<(), String> {
    browser_login::open_discord_https(&url)
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
fn list_share_sources() -> Vec<golive::ShareSource> {
    golive::list_sources()
}

#[tauri::command]
async fn start_screen_share(
    app: AppHandle,
    state: State<'_, Shared>,
    source_id: String,
    resolution: String,
    fps: u8,
    app_audio: bool,
    encoder: String,
    source_width: u32,
    source_height: u32,
) -> Result<(), String> {
    let request = {
        let slot = state.voice.lock().map_err(|_| "Voice state locked".to_string())?;
        golive::ShareStart {
            guild_id: slot.guild_id.clone(),
            channel_id: slot.channel_id.clone(),
            user_id: slot.user_id.clone(),
            session_id: slot.session_id.clone(),
            source_id,
            resolution,
            fps,
            app_audio,
            encoder,
            source_width,
            source_height,
        }
    };
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    state.clips.set_share(true);
    let started = golive::start_share(app, state.streams.clone(), gateway, request).await;
    if started.is_err() {
        state.clips.set_share(false);
    }
    started
}

#[tauri::command]
async fn stop_screen_share(state: State<'_, Shared>) -> Result<(), String> {
    stop_screen_share_inner(&state).await;
    Ok(())
}

async fn stop_screen_share_inner(state: &Shared) {
    if let Some(gateway) = state.gateway.lock().await.clone() {
        golive::stop_publish(&state.streams, &gateway).await;
    }
    golive::stop_watch(&state.streams).await;
    state.clips.set_share(false);
}

#[tauri::command]
async fn set_share_paused(state: State<'_, Shared>, paused: bool) -> Result<(), String> {
    if let Some(gateway) = state.gateway.lock().await.clone() {
        golive::set_paused(&state.streams, &gateway, paused).await;
    } else {
        state.streams.set_paused_local(paused);
    }
    Ok(())
}

#[tauri::command]
fn set_share_quality(
    state: State<'_, Shared>,
    resolution: String,
    fps: u8,
    source_width: u32,
    source_height: u32,
) -> lark_core::discord::stream::VideoSpan {
    golive::set_quality(&state.streams, &resolution, fps, source_width, source_height)
}

#[tauri::command]
async fn watch_stream(app: AppHandle, state: State<'_, Shared>, stream_key: String) -> Result<(), String> {
    let (server_id, channel_id, user_id, session_id) = {
        let slot = state.voice.lock().map_err(|_| "Voice state locked".to_string())?;
        let server_id = if slot.guild_id.is_empty() { slot.channel_id.clone() } else { slot.guild_id.clone() };
        (server_id, slot.channel_id.clone(), slot.user_id.clone(), slot.session_id.clone())
    };
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    golive::watch_stream(app, state.streams.clone(), gateway, stream_key, server_id, channel_id, user_id, session_id).await
}

#[tauri::command]
async fn stop_watch_stream(state: State<'_, Shared>) -> Result<(), String> {
    golive::stop_watch(&state.streams).await;
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

#[tauri::command]
async fn search_filtered(
    state: State<'_, Shared>,
    guild_id: Option<String>,
    channel_id: Option<String>,
    search: SearchIn,
) -> Result<Vec<lark_core::discord::ClientMessage>, String> {
    let query = lark_core::discord::rest::MessageSearch {
        content: search.content,
        author_ids: search.author_ids,
        mention_ids: search.mention_ids,
        has: search.has,
        before_id: search.before_id,
        after_id: search.after_id,
        channel_ids: search.channel_ids,
        pinned: search.pinned,
    };
    rest(&state)
        .await?
        .search_filtered(guild_id.as_deref(), channel_id.as_deref(), &query)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn search_gifs(state: State<'_, Shared>, query: String) -> Result<Vec<lark_core::discord::ClientGif>, String> {
    rest(&state).await?.search_gifs(&query).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_stickers(state: State<'_, Shared>, guild_id: String) -> Result<Vec<lark_core::discord::ClientSticker>, String> {
    rest(&state).await?.guild_stickers(&guild_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn reaction_users(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: String,
    emoji: String,
    emoji_id: Option<String>,
) -> Result<Vec<lark_core::discord::ClientReactionUser>, String> {
    rest(&state)
        .await?
        .reaction_users(&channel_id, &message_id, &emoji, emoji_id.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn search_app_commands(
    state: State<'_, Shared>,
    guild_id: Option<String>,
    channel_id: String,
    query: String,
    kind: i32,
) -> Result<Vec<lark_core::discord::ClientAppCommand>, String> {
    rest(&state)
        .await?
        .search_commands(guild_id.as_deref(), &channel_id, &query, kind)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn invoke_command(state: State<'_, Shared>, payload: serde_json::Value) -> Result<(), String> {
    rest(&state).await?.post_interaction(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
fn open_discord_page(url: String) -> Result<(), String> {
    if !lark_core::discord::rest::discord_page_ok(&url) {
        return Err("Only discord.com pages can be opened from here.".into());
    }
    // Windows uses ShellExecute from the sign-in path, never `cmd` or Explorer.
    // The composer falls back to the webview when this returns an error.
    let browser = lark_core::discord::browser_handoff::system_browser(std::env::consts::OS);
    let Some(program) = browser.child_program() else {
        return Err("Open this Discord page from the app window.".into());
    };
    let mut command = std::process::Command::new(program);
    lark_core::hide_console(&mut command);
    command
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|err| err.to_string())
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PollAnswerIn {
    text: String,
    #[serde(default)]
    emoji_name: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AckItemIn {
    channel_id: String,
    message_id: String,
}

fn upload_from_base64(name: Option<String>, mime: Option<String>, encoded: Option<String>) -> Result<Vec<lark_core::discord::rest::OutFile>, String> {
    let Some(encoded) = encoded.filter(|value| !value.trim().is_empty()) else {
        return Ok(Vec::new());
    };
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim())
        .map_err(|_| "That file could not be read.".to_string())?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("That file is over 10 MB.".into());
    }
    Ok(vec![lark_core::discord::rest::OutFile {
        name: name.unwrap_or_else(|| "upload".into()),
        mime: mime.unwrap_or_else(|| "application/octet-stream".into()),
        bytes,
    }])
}

#[tauri::command]
async fn fetch_thread_index(state: State<'_, Shared>, channel_id: String) -> Result<lark_core::discord::ClientThreadIndex, String> {
    rest(&state).await?.thread_index(&channel_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn start_thread(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: Option<String>,
    name: String,
    kind: Option<i32>,
    auto_archive_duration: Option<i32>,
    invitable: Option<bool>,
    content: Option<String>,
    applied_tags: Option<Vec<String>>,
    route: String,
    parent_kind: Option<i32>,
    parent_flags: Option<i32>,
    file_name: Option<String>,
    file_mime: Option<String>,
    file_base64: Option<String>,
) -> Result<lark_core::discord::ClientThreadRecord, String> {
    let files = upload_from_base64(file_name, file_mime, file_base64)?;
    let tags = applied_tags.unwrap_or_default();
    rest(&state)
        .await?
        .start_thread(
            &channel_id,
            message_id.as_deref(),
            &name,
            kind,
            auto_archive_duration,
            invitable,
            content.as_deref(),
            &tags,
            &route,
            parent_kind,
            parent_flags.unwrap_or(0),
            &files,
        )
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn edit_thread(state: State<'_, Shared>, thread_id: String, archived: bool) -> Result<lark_core::discord::ClientThreadRecord, String> {
    rest(&state).await?.edit_thread(&thread_id, archived).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_thread_members(state: State<'_, Shared>, thread_id: String) -> Result<Vec<lark_core::discord::ClientThreadMember>, String> {
    rest(&state).await?.thread_members(&thread_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn join_thread(state: State<'_, Shared>, thread_id: String) -> Result<(), String> {
    rest(&state).await?.join_thread(&thread_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn leave_thread(state: State<'_, Shared>, thread_id: String) -> Result<(), String> {
    rest(&state).await?.leave_thread(&thread_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn follow_thread(state: State<'_, Shared>, thread_id: String, follow: bool) -> Result<(), String> {
    rest(&state).await?.follow_thread(&thread_id, follow).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_thread_member(state: State<'_, Shared>, thread_id: String, user_id: String, add: bool) -> Result<(), String> {
    rest(&state).await?.set_thread_member(&thread_id, &user_id, add).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn follow_forum(state: State<'_, Shared>, guild_id: String, channel_id: String, follow: bool) -> Result<(), String> {
    rest(&state).await?.follow_forum(&guild_id, &channel_id, follow).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn create_poll(
    state: State<'_, Shared>,
    channel_id: String,
    question: String,
    answers: Vec<PollAnswerIn>,
    duration_hours: i32,
    allow_multiselect: bool,
) -> Result<lark_core::discord::ClientPoll, String> {
    let answers: Vec<(String, Option<String>)> = answers.into_iter().map(|answer| (answer.text, answer.emoji_name)).collect();
    rest(&state)
        .await?
        .create_poll(&channel_id, &question, &answers, duration_hours, allow_multiselect)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn vote_poll(state: State<'_, Shared>, channel_id: String, message_id: String, answer_id: i64) -> Result<(), String> {
    rest(&state).await?.vote_poll(&channel_id, &message_id, answer_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn end_poll(state: State<'_, Shared>, channel_id: String, message_id: String) -> Result<lark_core::discord::ClientPoll, String> {
    rest(&state).await?.end_poll(&channel_id, &message_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_poll_voters(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: String,
    answer_id: i64,
) -> Result<Vec<lark_core::discord::ClientPollVoter>, String> {
    rest(&state)
        .await?
        .poll_voters(&channel_id, &message_id, answer_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_events(state: State<'_, Shared>, guild_id: String) -> Result<Vec<lark_core::discord::ClientScheduledEvent>, String> {
    rest(&state).await?.scheduled_events(&guild_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn create_scheduled_event(
    state: State<'_, Shared>,
    guild_id: String,
    body: serde_json::Value,
) -> Result<lark_core::discord::ClientScheduledEvent, String> {
    rest(&state).await?.create_scheduled_event(&guild_id, body).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn rsvp_event(state: State<'_, Shared>, guild_id: String, event_id: String, interested: bool) -> Result<(), String> {
    rest(&state).await?.rsvp_event(&guild_id, &event_id, interested).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn start_scheduled_event(state: State<'_, Shared>, guild_id: String, event_id: String) -> Result<lark_core::discord::ClientScheduledEvent, String> {
    rest(&state).await?.start_scheduled_event(&guild_id, &event_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn ack_bulk(state: State<'_, Shared>, states: Vec<AckItemIn>) -> Result<(), String> {
    let pairs: Vec<(String, String)> = states.into_iter().map(|item| (item.channel_id, item.message_id)).collect();
    rest(&state).await?.ack_bulk(&pairs).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_mentions(state: State<'_, Shared>) -> Result<Vec<lark_core::discord::ClientMessage>, String> {
    rest(&state).await?.mentions().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_friend_requests(state: State<'_, Shared>) -> Result<Vec<lark_core::discord::ClientFriendRequest>, String> {
    rest(&state).await?.friend_requests().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_message_requests(state: State<'_, Shared>, spam: bool) -> Result<Vec<lark_core::discord::ClientMessageRequest>, String> {
    rest(&state).await?.list_message_requests(spam).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn accept_message_request(state: State<'_, Shared>, channel_id: String) -> Result<(), String> {
    rest(&state).await?.accept_message_request(&channel_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn ignore_message_request(state: State<'_, Shared>, channel_id: String) -> Result<(), String> {
    rest(&state).await?.ignore_message_request(&channel_id).await.map_err(|err| err.to_string())
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
    lark_core::set_run_at_login(enabled, &exe)
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

#[tauri::command]
async fn fetch_relationships(state: State<'_, Shared>) -> Result<Vec<lark_core::discord::ClientRelationship>, String> {
    rest(&state).await?.list_relationships().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn add_relationship(state: State<'_, Shared>, user_id: String) -> Result<lark_core::discord::ClientRelationship, String> {
    rest(&state).await?.add_relationship(&user_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn add_friend_username(state: State<'_, Shared>, username: String) -> Result<lark_core::discord::ClientRelationship, String> {
    rest(&state).await?.send_friend_request(&username).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn remove_relationship(state: State<'_, Shared>, user_id: String) -> Result<(), String> {
    rest(&state).await?.delete_relationship(&user_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn block_user(state: State<'_, Shared>, user_id: String) -> Result<lark_core::discord::ClientRelationship, String> {
    rest(&state).await?.block_user(&user_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn ignore_user(state: State<'_, Shared>, user_id: String) -> Result<(), String> {
    rest(&state).await?.ignore_relationship(&user_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_friend_nickname(state: State<'_, Shared>, user_id: String, nickname: String) -> Result<(), String> {
    rest(&state).await?.set_friend_nickname(&user_id, &nickname).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn close_dm(state: State<'_, Shared>, channel_id: String) -> Result<(), String> {
    rest(&state).await?.close_dm(&channel_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn create_group_dm(state: State<'_, Shared>, recipient_ids: Vec<String>) -> Result<lark_core::discord::ClientChannel, String> {
    rest(&state).await?.create_group_dm(&recipient_ids).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn rename_group_dm(state: State<'_, Shared>, channel_id: String, name: String) -> Result<lark_core::discord::ClientChannel, String> {
    rest(&state).await?.rename_group_dm(&channel_id, &name).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn add_dm_recipient(state: State<'_, Shared>, channel_id: String, user_id: String) -> Result<(), String> {
    rest(&state).await?.add_dm_recipient(&channel_id, &user_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn mute_dm(state: State<'_, Shared>, channel_id: String, muted: bool) -> Result<(), String> {
    rest(&state).await?.mute_dm(&channel_id, muted).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn create_channel_invite(state: State<'_, Shared>, channel_id: String) -> Result<String, String> {
    rest(&state).await?.create_channel_invite(&channel_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_server_profile(
    state: State<'_, Shared>,
    guild_id: String,
    nick: String,
    bio: String,
    avatar: Option<String>,
) -> Result<(), String> {
    rest(&state)
        .await?
        .set_server_profile(&guild_id, &nick, &bio, avatar.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_custom_status(
    state: State<'_, Shared>,
    status: String,
    custom: String,
    emoji: String,
    expires_at: Option<i64>,
    game: Option<String>,
) -> Result<(), String> {
    let gateway = state.gateway.lock().await.clone().ok_or_else(|| "Not connected.".to_string())?;
    let allowed = ["online", "idle", "dnd", "invisible"];
    if !allowed.contains(&status.as_str()) {
        return Err("Unknown status.".into());
    }
    gateway
        .send(lark_core::discord::GatewayCommand::CustomStatus { status, custom, emoji, expires_at, game: game.unwrap_or_default() })
        .map_err(|_| "Gateway is closed.".to_string())
}

#[derive(Deserialize)]
struct ForumUpload {
    name: String,
    mime: String,
    base64: String,
}

fn forum_uploads(files: &[ForumUpload]) -> Result<Vec<lark_core::discord::rest::OutFile>, String> {
    if files.len() > 10 {
        return Err("Forum posts can include 10 attachments.".into());
    }
    let mut out = Vec::new();
    for file in files {
        out.extend(upload_from_base64(Some(file.name.clone()), Some(file.mime.clone()), Some(file.base64.clone()))?);
    }
    Ok(out)
}

#[tauri::command]
async fn start_forum_post(
    state: State<'_, Shared>,
    channel_id: String,
    name: String,
    auto_archive_duration: Option<i32>,
    content: Option<String>,
    applied_tags: Option<Vec<String>>,
    parent_kind: Option<i32>,
    parent_flags: Option<i32>,
    files: Option<Vec<ForumUpload>>,
) -> Result<lark_core::discord::ClientThreadRecord, String> {
    let uploads = forum_uploads(&files.unwrap_or_default())?;
    rest(&state)
        .await?
        .start_thread(
            &channel_id,
            None,
            &name,
            None,
            auto_archive_duration,
            None,
            content.as_deref(),
            &applied_tags.unwrap_or_default(),
            "forum-post",
            parent_kind,
            parent_flags.unwrap_or(0),
            &uploads,
        )
        .await
        .map_err(|err| err.to_string())
}

/// Cached guild sound, or a fresh CDN download, as 48 kHz mono. Not the local chime.
async fn load_guild_pcm(client: &DiscordRest, state: &Shared, sound_id: &str) -> Result<Vec<f32>, String> {
    let dir = soundboard_dir(&state.paths.config_file).join("guild");
    let path = lark_core::soundboard::guild_cache_path(&dir, sound_id)?;
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(pcm) = lark_core::soundboard::decode_guild_audio(&bytes) {
            return Ok(pcm);
        }
    }
    let downloaded = client.download_soundboard_sound(sound_id).await.map_err(|err| err.to_string())?;
    let pcm = lark_core::soundboard::decode_guild_audio(&downloaded)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, &downloaded);
    Ok(pcm)
}

#[tauri::command]
async fn set_user_lists(
    state: State<'_, Shared>,
    favorites: Vec<String>,
    favorites_muted: Option<bool>,
    favorite_extras: Option<Vec<String>>,
    pinned_dms: Vec<String>,
    channel_pins: Vec<lark_core::discord::shell::GuildChannelPins>,
) -> Result<(), String> {
    rest(&state)
        .await?
        .set_user_lists(
            &favorites,
            favorites_muted.unwrap_or(false),
            favorite_extras.as_deref().unwrap_or(&[]),
            &pinned_dms,
            &channel_pins,
        )
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn list_saved_messages(state: State<'_, Shared>) -> Result<serde_json::Value, String> {
    rest(&state).await?.list_saved_messages().await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn put_saved_message(
    state: State<'_, Shared>,
    channel_id: String,
    message_id: String,
    due_at: Option<String>,
) -> Result<(), String> {
    rest(&state)
        .await?
        .put_saved_message(&channel_id, &message_id, due_at.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn delete_saved_message(state: State<'_, Shared>, channel_id: String, message_id: String) -> Result<(), String> {
    rest(&state)
        .await?
        .delete_saved_message(&channel_id, &message_id)
        .await
        .map_err(|err| err.to_string())
}
