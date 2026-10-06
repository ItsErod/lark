mod keychain;
mod paths;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use lark_core::discord::{ClientEvent, DiscordRest};
use lark_core::parse_config;
use lark_core::Config;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{watch, Mutex};

struct Shared {
    config: Mutex<Config>,
    paths: Resolved,
    rest: Mutex<Option<Arc<DiscordRest>>>,
    shutdown: Mutex<Option<watch::Sender<bool>>>,
    _watcher: Mutex<Option<RecommendedWatcher>>,
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
            let resolved = paths::resolve(app.handle())?;
            let text = fs::read_to_string(&resolved.config_file).unwrap_or_default();
            let config = parse_config(&text).unwrap_or_else(|err| {
                log::warn!("config ignored: {err}");
                Config::default()
            });
            let shared = Shared {
                config: Mutex::new(config),
                paths: Resolved {
                    config_file: resolved.config_file,
                    themes_dir: resolved.themes_dir,
                    plugins_dir: resolved.plugins_dir,
                },
                rest: Mutex::new(None),
                shutdown: Mutex::new(None),
                _watcher: Mutex::new(None),
            };
            app.manage(shared);
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
            list_themes,
            list_plugins
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
fn has_token() -> bool {
    matches!(keychain::load_token(), Ok(Some(token)) if !token.is_empty())
}

#[tauri::command]
fn set_token(token: String) -> Result<(), String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("Token is empty.".into());
    }
    if token.len() > 400 || token.chars().any(|c| c.is_whitespace()) {
        return Err("That doesn't look like a token.".into());
    }
    keychain::save_token(&token)
}

#[tauri::command]
async fn clear_token(state: State<'_, Shared>) -> Result<(), String> {
    disconnect_inner(&state).await;
    keychain::clear_token()
}

#[tauri::command]
async fn connect(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    let token = keychain::load_token()?
        .filter(|token| !token.is_empty())
        .ok_or_else(|| format!("No token saved in the {}.", keychain::store_label()))?;
    disconnect_inner(&state).await;
    let rest = Arc::new(DiscordRest::new(token.clone()).map_err(|err| err.to_string())?);
    *state.rest.lock().await = Some(rest);
    let (tx, rx) = watch::channel(false);
    *state.shutdown.lock().await = Some(tx);
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        lark_core::discord::run_gateway(token, rx, move |event: ClientEvent| {
            let _ = app_handle.emit("discord", &event);
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
fn list_themes(state: State<'_, Shared>) -> Vec<String> {
    list_stems(&state.paths.themes_dir, "css")
}

#[tauri::command]
fn list_plugins(state: State<'_, Shared>) -> Result<Vec<PluginFile>, String> {
    let mut plugins = Vec::new();
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
        let source = fs::read_to_string(&path).unwrap_or_default();
        plugins.push(PluginFile {
            id: id.to_string(),
            source,
        });
    }
    plugins.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(plugins)
}

#[derive(serde::Serialize)]
struct PluginFile {
    id: String,
    source: String,
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
