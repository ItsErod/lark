//! Download a store item into the app data dir after the index hash matches.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use lark_core::config::{validate_theme_css, validate_theme_name};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const STORE_INDEX_URL: &str = "https://itserod.github.io/lark/store/index.json";
const STORE_ROOT: &str = "https://itserod.github.io/lark/store/";
const STORE_PAGE_URL: &str = "https://itserod.github.io/lark/store/";
const PLUGIN_LIMIT: usize = 128 * 1024;
const THEME_LIMIT: usize = 16 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledRecord {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub sha256: String,
}

#[derive(Debug, Deserialize)]
struct StoreIndex {
    version: u32,
    plugins: Vec<StoreItem>,
    themes: Vec<StoreItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreItem {
    id: String,
    name: String,
    description: String,
    version: String,
    #[serde(rename = "minLark")]
    min_lark: String,
    entry: String,
    sha256: String,
    bytes: usize,
    file: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Meta {
    version: String,
    sha256: String,
    kind: String,
    name: String,
    description: String,
}

pub async fn fetch_index() -> Result<String, String> {
    let body = http_get(STORE_INDEX_URL, 512 * 1024).await?;
    let text = String::from_utf8(body).map_err(|_| "The store index is not text.".to_string())?;
    parse_index(&text)?;
    Ok(text)
}

/// Download a theme, check its hash, and return the CSS. Nothing is written.
pub async fn preview_theme(id: &str) -> Result<String, String> {
    validate_theme_name(id).map_err(|err| err.to_string())?;
    let index = parse_index(&fetch_index().await?)?;
    let item = index
        .themes
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| format!("\"{id}\" is not in the store."))?;
    if !version_ok(env!("CARGO_PKG_VERSION"), &item.min_lark) {
        return Err(format!("\"{id}\" needs Lark {} or newer.", item.min_lark));
    }
    if item.bytes == 0 || item.bytes > THEME_LIMIT {
        return Err("That store item is the wrong size.".into());
    }
    let url = file_url("theme", id, &item.file, &item.entry)?;
    if !hex_ok(&item.sha256) {
        return Err("The store hash is not usable.".into());
    }
    let bytes = http_get(&url, THEME_LIMIT).await?;
    if bytes.len() != item.bytes || bytes.contains(&0) {
        return Err("That download is the wrong size.".into());
    }
    let digest = sha256_hex(&bytes);
    if digest != item.sha256 {
        return Err("The download does not match the store hash.".into());
    }
    let text = String::from_utf8(bytes).map_err(|_| "That download is not text.".to_string())?;
    validate_theme_css(&text).map_err(|err| err.to_string())?;
    Ok(text)
}

pub async fn install(
    plugins_dir: &Path,
    themes_dir: &Path,
    id: &str,
) -> Result<InstalledRecord, String> {
    validate_theme_name(id).map_err(|err| err.to_string())?;
    let index = parse_index(&fetch_index().await?)?;
    let plugin = index.plugins.iter().find(|item| item.id == id);
    let theme = index.themes.iter().find(|item| item.id == id);
    let (kind, item) = match (plugin, theme) {
        (Some(item), None) => ("plugin", item),
        (None, Some(item)) => ("theme", item),
        _ => return Err(format!("\"{id}\" is not in the store.")),
    };
    if !version_ok(env!("CARGO_PKG_VERSION"), &item.min_lark) {
        return Err(format!("\"{id}\" needs Lark {} or newer.", item.min_lark));
    }
    let limit = if kind == "theme" {
        THEME_LIMIT
    } else {
        PLUGIN_LIMIT
    };
    if item.bytes == 0 || item.bytes > limit {
        return Err("That store item is the wrong size.".into());
    }
    let url = file_url(kind, id, &item.file, &item.entry)?;
    if !hex_ok(&item.sha256) {
        return Err("The store hash is not usable.".into());
    }
    let bytes = http_get(&url, limit).await?;
    if bytes.len() != item.bytes || bytes.contains(&0) {
        return Err("That download is the wrong size.".into());
    }
    let digest = sha256_hex(&bytes);
    if digest != item.sha256 {
        return Err("The download does not match the store hash.".into());
    }
    let text =
        String::from_utf8(bytes.clone()).map_err(|_| "That download is not text.".to_string())?;
    if kind == "theme" {
        validate_theme_css(&text).map_err(|err| err.to_string())?;
        write_pair(
            themes_dir,
            id,
            "css",
            &text,
            &digest,
            "theme",
            &item.name,
            &item.description,
            &item.version,
        )?;
    } else {
        write_pair(
            plugins_dir,
            id,
            "js",
            &text,
            &digest,
            "plugin",
            &item.name,
            &item.description,
            &item.version,
        )?;
    }
    Ok(InstalledRecord {
        id: id.to_string(),
        kind: kind.to_string(),
        name: item.name.clone(),
        description: item.description.clone(),
        version: item.version.clone(),
        sha256: digest,
    })
}

pub fn uninstall(plugins_dir: &Path, themes_dir: &Path, id: &str) -> Result<(), String> {
    validate_theme_name(id).map_err(|err| err.to_string())?;
    for (dir, ext) in [(plugins_dir, "js"), (themes_dir, "css")] {
        let _ = fs::remove_file(dir.join(format!("{id}.{ext}")));
        let _ = fs::remove_file(dir.join(format!("{id}.json")));
    }
    Ok(())
}

pub fn records(plugins_dir: &Path, themes_dir: &Path) -> Vec<InstalledRecord> {
    let mut out = Vec::new();
    collect(plugins_dir, "js", "plugin", &mut out);
    collect(themes_dir, "css", "theme", &mut out);
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

pub fn read_verified_plugin(dir: &Path, id: &str) -> Result<String, String> {
    validate_theme_name(id).map_err(|err| err.to_string())?;
    let path = dir.join(format!("{id}.js"));
    let text = fs::read_to_string(&path).map_err(|_| format!("Plugin \"{id}\" was not found."))?;
    verify_sidecar(&dir.join(format!("{id}.json")), text.as_bytes(), "plugin")?;
    Ok(text)
}

pub fn theme_readable(dir: &Path, id: &str) -> bool {
    if validate_theme_name(id).is_err() {
        return false;
    }
    let meta = dir.join(format!("{id}.json"));
    if !meta.exists() {
        return dir.join(format!("{id}.css")).is_file();
    }
    let Ok(bytes) = fs::read(dir.join(format!("{id}.css"))) else {
        return false;
    };
    verify_sidecar(&meta, &bytes, "theme").is_ok()
}

pub fn read_verified_theme(dir: &Path, id: &str) -> Result<String, String> {
    validate_theme_name(id).map_err(|err| err.to_string())?;
    let path = dir.join(format!("{id}.css"));
    let text = fs::read_to_string(&path).map_err(|_| format!("Theme \"{id}\" was not found."))?;
    let meta = dir.join(format!("{id}.json"));
    if meta.exists() {
        verify_sidecar(&meta, text.as_bytes(), "theme")?;
    }
    Ok(text)
}

pub fn open_store_page() -> Result<(), String> {
    crate::browser_login::open_exact_https(STORE_PAGE_URL)
}

fn parse_index(text: &str) -> Result<StoreIndex, String> {
    let index: StoreIndex =
        serde_json::from_str(text).map_err(|_| "The store index could not be read.".to_string())?;
    if index.version != 1 {
        return Err("This Lark build does not understand that store index.".into());
    }
    Ok(index)
}

fn file_url(kind: &str, id: &str, file: &str, entry: &str) -> Result<String, String> {
    let expected = if kind == "theme" {
        format!("themes/{id}/theme.css")
    } else {
        format!("plugins/{id}/plugin.js")
    };
    let expected_entry = if kind == "theme" {
        "theme.css"
    } else {
        "plugin.js"
    };
    if file != expected || entry != expected_entry || file.contains("..") || file.contains('\\') {
        return Err("The store path was refused.".into());
    }
    Ok(format!("{STORE_ROOT}{file}"))
}

fn version_ok(app: &str, min_lark: &str) -> bool {
    match (version_parts(app), version_parts(min_lark)) {
        (Some(app), Some(min)) => app >= min,
        _ => false,
    }
}

fn version_parts(value: &str) -> Option<(u64, u64, u64)> {
    let mut parts = value.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn hex_ok(value: &str) -> bool {
    value.len() == 64
        && value.bytes().all(|byte| byte.is_ascii_hexdigit())
        && value.bytes().all(|byte| !byte.is_ascii_uppercase())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

fn verify_sidecar(path: &Path, bytes: &[u8], kind: &str) -> Result<(), String> {
    let raw = fs::read_to_string(path)
        .map_err(|_| "This item is not installed from the store.".to_string())?;
    let meta: Meta = serde_json::from_str(&raw)
        .map_err(|_| "The install record could not be read.".to_string())?;
    if meta.kind != kind || !hex_ok(&meta.sha256) || sha256_hex(bytes) != meta.sha256 {
        return Err("The installed file does not match its store hash.".into());
    }
    Ok(())
}

fn write_pair(
    dir: &Path,
    id: &str,
    ext: &str,
    text: &str,
    digest: &str,
    kind: &str,
    name: &str,
    description: &str,
    version: &str,
) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    let asset = dir.join(format!("{id}.{ext}"));
    let meta_path = dir.join(format!("{id}.json"));
    atomic_write(&asset, text.as_bytes())?;
    let meta = Meta {
        version: version.to_string(),
        sha256: digest.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        description: description.to_string(),
    };
    let json = serde_json::to_string(&meta).map_err(|err| err.to_string())?;
    if let Err(err) = atomic_write(&meta_path, json.as_bytes()) {
        let _ = fs::remove_file(&asset);
        return Err(err);
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = temp_path(path);
    {
        let mut file = fs::File::create(&tmp).map_err(|err| err.to_string())?;
        file.write_all(bytes).map_err(|err| err.to_string())?;
        file.sync_all().map_err(|err| err.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|err| {
        let _ = fs::remove_file(&tmp);
        err.to_string()
    })
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("item");
    path.with_file_name(format!(".{name}.tmp"))
}

fn collect(dir: &Path, ext: &str, kind: &str, out: &mut Vec<InstalledRecord>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if validate_theme_name(id).is_err() {
            continue;
        }
        let asset = dir.join(format!("{id}.{ext}"));
        let Ok(bytes) = fs::read(&asset) else {
            continue;
        };
        if verify_sidecar(&path, &bytes, kind).is_err() {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(meta) = serde_json::from_str::<Meta>(&raw) else {
            continue;
        };
        out.push(InstalledRecord {
            id: id.to_string(),
            kind: kind.to_string(),
            name: meta.name,
            description: meta.description,
            version: meta.version,
            sha256: meta.sha256,
        });
    }
}

async fn http_get(url: &str, limit: usize) -> Result<Vec<u8>, String> {
    if !url.starts_with(STORE_ROOT) && url != STORE_INDEX_URL {
        return Err("Refusing a download outside the store.".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(url)
        .header("user-agent", concat!("Lark/", env!("CARGO_PKG_VERSION")))
        .send()
        .await
        .map_err(|_| "The store could not be reached.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("The store returned {}.", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|len| len > limit as u64)
    {
        return Err("That download is too large.".into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "The download stopped.".to_string())?;
    if bytes.len() > limit {
        return Err("That download is too large.".into());
    }
    Ok(bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_gate_uses_major_minor_patch() {
        assert!(version_ok("3.0.0", "2.4.0"));
        assert!(version_ok("3.0.0", "3.0.0"));
        assert!(!version_ok("3.0.0", "3.1.0"));
        assert!(!version_ok("3.0.0", "nope"));
        assert!(!hex_ok(&"A".repeat(64)));
        assert!(hex_ok(&"ab".repeat(32)));
    }

    #[test]
    fn file_url_is_the_entry_for_that_id() {
        let plugin = file_url(
            "plugin",
            "quiet-media",
            "plugins/quiet-media/plugin.js",
            "plugin.js",
        )
        .unwrap();
        assert_eq!(
            plugin,
            "https://itserod.github.io/lark/store/plugins/quiet-media/plugin.js"
        );
        assert!(file_url(
            "plugin",
            "quiet-media",
            "plugins/other/plugin.js",
            "plugin.js"
        )
        .is_err());
        assert!(file_url("theme", "nord", "../themes/nord/theme.css", "theme.css").is_err());
        assert!(file_url("theme", "nord", "themes/nord/theme.css", "plugin.js").is_err());
    }

    #[test]
    fn a_tampered_plugin_does_not_load() {
        let dir = std::env::temp_dir().join(format!("lark-store-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let text = "function onMessage(message){return message}\n";
        let digest = sha256_hex(text.as_bytes());
        write_pair(
            &dir,
            "quiet-media",
            "js",
            text,
            &digest,
            "plugin",
            "Quiet",
            "Hide",
            "1.0.0",
        )
        .unwrap();
        assert_eq!(read_verified_plugin(&dir, "quiet-media").unwrap(), text);
        assert_eq!(
            records(&dir, &dir)
                .iter()
                .filter(|item| item.id == "quiet-media")
                .count(),
            1
        );
        fs::write(dir.join("quiet-media.js"), "tampered").unwrap();
        assert!(read_verified_plugin(&dir, "quiet-media").is_err());
        assert!(records(&dir, &dir)
            .iter()
            .all(|item| item.id != "quiet-media"));
        uninstall(&dir, &dir, "quiet-media").unwrap();
        let _ = fs::remove_dir_all(&dir);
    }
}
