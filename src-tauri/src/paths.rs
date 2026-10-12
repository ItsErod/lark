use std::fs;
use std::path::PathBuf

use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub os: String,
    pub config_dir: String,
    pub config_file: String,
    pub themes_dir: String,
    pub plugins_dir: String,
    pub clips_dir: String,
    pub credential_store: String,
    pub config_hint: String,
    pub notification_note: String,
}

pub struct ResolvedPaths {
    pub config_file: PathBuf,
    pub themes_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub clips_dir: PathBuf,
}

pub fn resolve(app: &AppHandle) -> Result<ResolvedPaths, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let themes_dir = dir.join("themes");
    let plugins_dir = dir.join("plugins");
    let clips_dir = dir.join("clips");
    fs::create_dir_all(&themes_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&plugins_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&clips_dir).map_err(|err| err.to_string())?;
    // Plugins and themes are installed from the store. A new data dir starts empty.
    let config_file = dir.join("config.toml");
    if !config_file.exists() {
        fs::write(&config_file, lark_core::config::example_config_text())
            .map_err(|err| err.to_string())?;
    }
    Ok(ResolvedPaths {
        config_file,
        themes_dir,
        plugins_dir,
        clips_dir,
    })
}

pub fn describe(paths: &ResolvedPaths) -> AppPaths {
    let os = std::env::consts::OS.to_string();
    AppPaths {
        os: os.clone(),
        config_dir: paths
            .config_file
            .parent()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        config_file: paths.config_file.display().to_string(),
        themes_dir: paths.themes_dir.display().to_string(),
        plugins_dir: paths.plugins_dir.display().to_string(),
        clips_dir: paths.clips_dir.display().to_string(),
        credential_store: crate::keychain::store_label(),
        config_hint: lark_core::config_dir_hint(&os).to_string(),
        notification_note: lark_core::notification_note(&os).to_string(),
    }
}

