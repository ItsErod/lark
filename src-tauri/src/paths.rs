use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub os: String,
    pub config_dir: String,
    pub config_file: String,
    pub themes_dir: String,
    pub plugins_dir: String,
    pub credential_store: String,
    pub config_hint: String,
    pub notification_note: String,
}

pub struct ResolvedPaths {
    pub config_file: PathBuf,
    pub themes_dir: PathBuf,
    pub plugins_dir: PathBuf,
}

pub fn resolve(app: &AppHandle) -> Result<ResolvedPaths, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let themes_dir = dir.join("themes");
    let plugins_dir = dir.join("plugins");
    fs::create_dir_all(&themes_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&plugins_dir).map_err(|err| err.to_string())?;
    seed_if_empty(&themes_dir, &bundled(app, "themes"));
    seed_if_empty(&plugins_dir, &bundled(app, "plugins"));
    let config_file = dir.join("config.toml");
    if !config_file.exists() {
        fs::write(&config_file, lark_core::config::example_config_text())
            .map_err(|err| err.to_string())?;
    }
    Ok(ResolvedPaths {
        config_file,
        themes_dir,
        plugins_dir,
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
        credential_store: crate::keychain::store_label(),
        config_hint: lark_core::config_dir_hint(&os).to_string(),
        notification_note: lark_core::notification_note(&os).to_string(),
    }
}

fn bundled(app: &AppHandle, folder: &str) -> PathBuf {
    if let Ok(resource) = app.path().resource_dir() {
        let candidate = resource.join(folder);
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(folder)
}

fn seed_if_empty(dest: &Path, source: &Path) {
    if !source.exists() {
        return;
    }
    let dest_empty = fs::read_dir(dest)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(true);
    if !dest_empty {
        return;
    }
    let Ok(entries) = fs::read_dir(source) else {
        return;
    };
    for entry in entries.flatten() {
        let file_type = entry.file_type().ok();
        if file_type.map(|t| t.is_file()).unwrap_or(false) {
            let target = dest.join(entry.file_name());
            let _ = fs::copy(entry.path(), target);
        }
    }
}
