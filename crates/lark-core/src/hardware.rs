//! Best-effort PC hardware and game line for a Discord custom status.
//!
//! Sampling runs only when the desktop shell asks for it. The shell asks only
//! after Settings → Lark → Hardware in status is on. macOS and Windows each
//! try the local sensors; a missing reading is omitted. Other systems return
//! an empty reading and do not spawn anything.
//!
//! This is status text, not an overlay. Callers should publish at
//! [`HARDWARE_STATUS_INTERVAL_MS`], not on a frame tick.

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// Discord rejects a custom status longer than this.
pub const DISCORD_CUSTOM_STATUS_MAX: usize = 128;

/// How often a caller should sample and, if the line changed, update presence.
pub const HARDWARE_STATUS_INTERVAL_MS: u64 = 60_000;

const GPU_CACHE_TTL: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HardwareReading {
    pub gpu: Option<String>,
    pub cpu_temp_c: Option<u16>,
    pub game: Option<String>,
}

impl HardwareReading {
    pub fn line(&self) -> Option<String> {
        status_line(self)
    }
}

/// `GPU · 61°C · Game`, dropping empty parts. Over 128 characters, the GPU
/// goes first, then the temperature, and a still-long game is trimmed.
pub fn status_line(reading: &HardwareReading) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(gpu) = reading
        .gpu
        .as_deref()
        .and_then(|value| clean_part(value, 80))
    {
        parts.push(gpu);
    }
    if let Some(temp) = reading.cpu_temp_c.and_then(temp_label) {
        parts.push(temp);
    }
    if let Some(game) = reading
        .game
        .as_deref()
        .and_then(|value| clean_part(value, 200))
    {
        parts.push(game);
    }
    fit_parts(&parts)
}

fn temp_label(celsius: u16) -> Option<String> {
    if (1..=120).contains(&celsius) {
        Some(format!("{celsius}°C"))
    } else {
        None
    }
}

fn fit_parts(parts: &[String]) -> Option<String> {
    if parts.is_empty() {
        return None;
    }
    for drop in 0..parts.len() {
        let joined = parts[drop..].join(" · ");
        if joined.chars().count() <= DISCORD_CUSTOM_STATUS_MAX {
            return Some(joined);
        }
    }
    Some(truncate_chars(
        &parts[parts.len() - 1],
        DISCORD_CUSTOM_STATUS_MAX,
    ))
}

fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    if max == 0 {
        return String::new();
    }
    let mut out: String = text.chars().take(max - 1).collect();
    out.push('…');
    out
}

fn clean_part(value: &str, max: usize) -> Option<String> {
    let mut out = String::new();
    let mut pending_space = false;
    for ch in value.chars() {
        if ch.is_control() || ch == '\u{feff}' || ch == '™' || ch == '®' {
            continue;
        }
        if ch.is_whitespace() {
            pending_space = !out.is_empty();
            continue;
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        out.push(ch);
        if out.chars().count() >= max {
            break;
        }
    }
    let out = out.trim().to_string();
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Read this machine. `os` is `std::env::consts::OS` (`macos`, `windows`, …).
pub fn sample_hardware(os: &str) -> HardwareReading {
    match os {
        "macos" => sample_macos(),
        "windows" => sample_windows(),
        _ => HardwareReading::default(),
    }
}

fn sample_macos() -> HardwareReading {
    let gpu = cached_gpu("macos", macos_gpu);
    let cpu_temp_c = capture(
        "/usr/bin/sudo",
        &[
            "-n",
            "/usr/bin/powermetrics",
            "--samplers",
            "smc",
            "-n",
            "1",
            "-i",
            "200",
        ],
        Duration::from_secs(3),
    )
    .as_deref()
    .and_then(parse_cpu_temp_c);
    let foreground = macos_foreground();
    let processes = process_lines(&capture(
        "/bin/ps",
        &["-ax", "-o", "comm="],
        Duration::from_secs(2),
    ));
    HardwareReading {
        gpu,
        cpu_temp_c,
        game: pick_game(foreground.as_deref(), &processes),
    }
}

fn macos_gpu() -> Option<String> {
    let text = capture(
        "/usr/sbin/system_profiler",
        &["SPDisplaysDataType", "-json"],
        Duration::from_secs(8),
    )?;
    parse_macos_gpu(&text)
}

fn macos_foreground() -> Option<String> {
    if let Some(front) = capture("/usr/bin/lsappinfo", &["front"], Duration::from_secs(2)) {
        if let Some(token) = front.split_whitespace().next() {
            let token = token.trim().trim_end_matches(':');
            if let Some(info) = capture(
                "/usr/bin/lsappinfo",
                &["info", "-only", "name", token],
                Duration::from_secs(2),
            ) {
                if let Some(name) = parse_foreground_name(&info) {
                    return Some(name);
                }
            }
        }
    }
    let script = r#"tell application "System Events" to get name of first application process whose frontmost is true"#;
    capture(
        "/usr/bin/osascript",
        &["-e", script],
        Duration::from_secs(2),
    )
    .as_deref()
    .and_then(parse_foreground_name)
}

fn sample_windows() -> HardwareReading {
    let gpu = cached_gpu("windows", || {
        capture(
            "powershell.exe",
            &windows_args(WINDOWS_GPU),
            Duration::from_secs(6),
        )
        .as_deref()
        .and_then(parse_windows_gpu)
    });
    let cpu_temp_c = capture(
        "powershell.exe",
        &windows_args(WINDOWS_TEMP),
        Duration::from_secs(4),
    )
    .as_deref()
    .and_then(parse_cpu_temp_c);
    let foreground = capture(
        "powershell.exe",
        &windows_args(WINDOWS_FOREGROUND),
        Duration::from_secs(4),
    )
    .as_deref()
    .and_then(parse_foreground_name);
    let processes = process_lines(&capture(
        "powershell.exe",
        &windows_args(WINDOWS_PROCESSES),
        Duration::from_secs(4),
    ));
    HardwareReading {
        gpu,
        cpu_temp_c,
        game: pick_game(foreground.as_deref(), &processes),
    }
}

fn windows_args(script: &str) -> [&str; 6] {
    [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]
}

const WINDOWS_GPU: &str = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name";

const WINDOWS_TEMP: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$best = $null
$sensors = Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction SilentlyContinue |
  Where-Object { $_.SensorType -eq 'Temperature' -and $_.Name -match 'CPU Package|Tctl|Core Max|^CPU$' }
foreach ($sensor in $sensors) {
  $value = [double]$sensor.Value
  if ($value -ge 1 -and $value -le 120 -and ($null -eq $best -or $value -gt $best)) { $best = $value }
}
if ($null -eq $best) {
  $zones = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue
  foreach ($zone in $zones) {
    $raw = [double]$zone.CurrentTemperature
    if ($raw -le 0) { continue }
    $value = ($raw / 10.0) - 273.15
    if ($value -ge 1 -and $value -le 120 -and ($null -eq $best -or $value -gt $best)) { $best = $value }
  }
}
if ($null -ne $best) { [int][math]::Round($best) }
"#;

const WINDOWS_FOREGROUND: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
if (-not ('LarkForeground' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class LarkForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
}
$handle = [LarkForeground]::GetForegroundWindow()
$proc = [uint32]0
[void][LarkForeground]::GetWindowThreadProcessId($handle, [ref]$proc)
if ($proc -ne 0) {
  $name = (Get-Process -Id $proc -ErrorAction SilentlyContinue).ProcessName
  if ($name) { $name }
}
"#;

const WINDOWS_PROCESSES: &str = "Get-Process | Select-Object -ExpandProperty ProcessName";

fn process_lines(text: &Option<String>) -> Vec<String> {
    text.as_deref()
        .unwrap_or("")
        .lines()
        .take(4000)
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

fn cached_gpu(os: &str, probe: impl FnOnce() -> Option<String>) -> Option<String> {
    let mut slot = GPU_CACHE.lock().unwrap_or_else(|err| err.into_inner());
    if let Some(hit) = slot.as_ref() {
        if hit.os == os && hit.at.elapsed() < GPU_CACHE_TTL {
            return hit.name.clone();
        }
    }
    let name = probe();
    if name.is_some() {
        *slot = Some(GpuCache {
            os: os.to_string(),
            name: name.clone(),
            at: Instant::now(),
        });
    }
    name
}

struct GpuCache {
    os: String,
    name: Option<String>,
    at: Instant,
}

static GPU_CACHE: Mutex<Option<GpuCache>> = Mutex::new(None);

fn capture(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.take(256_000).read_to_string(&mut out);
        let _ = tx.send(out);
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        }
    };
    if !status.success() {
        return None;
    }
    rx.recv_timeout(Duration::from_secs(2)).ok()
}

pub fn parse_macos_gpu(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return parse_macos_gpu_json(trimmed);
    }
    let mut names = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Chipset Model:") {
            names.push(rest.trim().to_string());
        }
    }
    prefer_gpu(names)
}

fn parse_macos_gpu_json(text: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let displays = value
        .get("SPDisplaysDataType")
        .and_then(|item| item.as_array())
        .or_else(|| value.as_array())?;
    let mut names = Vec::new();
    for item in displays {
        if let Some(name) = item.get("sppci_model").and_then(|value| value.as_str()) {
            names.push(name.to_string());
        } else if let Some(name) = item.get("_name").and_then(|value| value.as_str()) {
            names.push(name.to_string());
        }
    }
    prefer_gpu(names)
}

pub fn parse_windows_gpu(text: &str) -> Option<String> {
    let names = text
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty() && !line.eq_ignore_ascii_case("name"))
        .collect();
    prefer_gpu(names)
}

fn prefer_gpu(names: Vec<String>) -> Option<String> {
    let mut best: Option<(u8, String)> = None;
    for name in names {
        let Some(name) = clean_part(&name, 80) else {
            continue;
        };
        let score = gpu_score(&name);
        if score == 0 {
            continue;
        }
        let replace = best
            .as_ref()
            .map(|(scored, _)| score > *scored)
            .unwrap_or(true);
        if replace {
            best = Some((score, name));
        }
    }
    best.map(|(_, name)| name)
}

fn gpu_score(name: &str) -> u8 {
    let lower = name.to_lowercase();
    if lower.contains("basic display")
        || lower.contains("microsoft remote")
        || lower.contains("virtual display")
    {
        return 0;
    }
    if lower.contains("nvidia")
        || lower.contains("geforce")
        || lower.contains("radeon")
        || lower.contains("amd")
        || lower.contains("arc ")
        || lower.ends_with(" arc")
    {
        return 3;
    }
    if lower.contains("apple") || lower.contains("intel") {
        return 2;
    }
    1
}

/// Celsius from a powermetrics dump or a single number. GPU, battery, and
/// implausible values are ignored. `None` when no CPU sensor answered.
pub fn parse_cpu_temp_c(text: &str) -> Option<u16> {
    let mut cpu: Option<u16> = None;
    let mut labeled = false;
    for line in text.lines() {
        let lower = line.to_lowercase();
        if !(lower.contains("temperature") || lower.contains("temp")) {
            continue;
        }
        labeled = true;
        if lower.contains("gpu")
            || lower.contains("battery")
            || lower.contains("ssd")
            || lower.contains("nand")
            || lower.contains("fan")
        {
            continue;
        }
        let Some(value) = first_number(line).and_then(plausible_temp) else {
            continue;
        };
        if lower.contains("cpu")
            || lower.contains("package")
            || lower.contains("cluster")
            || lower.contains("tctl")
            || lower.contains("core")
        {
            cpu = Some(cpu.map(|best| best.max(value)).unwrap_or(value));
        }
    }
    if cpu.is_some() {
        return cpu;
    }
    if labeled {
        return None;
    }
    let trimmed = text.trim();
    if trimmed.lines().count() == 1 {
        return first_number(trimmed).and_then(plausible_temp);
    }
    None
}

fn plausible_temp(value: f64) -> Option<u16> {
    if (1.0..=120.0).contains(&value) {
        Some(value.round() as u16)
    } else {
        None
    }
}

fn first_number(text: &str) -> Option<f64> {
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index].is_ascii_digit() {
            let start = index;
            index += 1;
            while index < bytes.len() && (bytes[index].is_ascii_digit() || bytes[index] == b'.') {
                index += 1;
            }
            return text[start..index].parse().ok();
        }
        index += 1;
    }
    None
}

pub fn parse_foreground_name(text: &str) -> Option<String> {
    for key in ["LSDisplayName", "CFBundleDisplayName", "CFBundleName"] {
        if let Some(name) = quoted_field(text, key) {
            return clean_part(&name, 80);
        }
    }
    let line = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.contains('='))?;
    clean_part(line.trim_matches('"').trim(), 80)
}

fn quoted_field(text: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{key}\"=\"");
    let start = text.find(&pattern)? + pattern.len();
    let rest = &text[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Foreground app when it is a game, otherwise a known game that is running
/// while a shell app (Lark, a browser, a launcher) is in front.
pub fn pick_game(foreground: Option<&str>, processes: &[String]) -> Option<String> {
    let foreground = foreground.and_then(|name| clean_part(name, 80));
    if let Some(name) = foreground.as_deref() {
        if let Some(game) = known_game(name) {
            return Some(game);
        }
        if !is_shell_app(name) {
            return Some(name.to_string());
        }
    }
    let bases: Vec<String> = processes.iter().map(|line| base_name(line)).collect();
    for game in GAMES {
        for base in &bases {
            if game.needles.iter().any(|needle| name_hits(base, needle)) {
                return Some(game.name.to_string());
            }
        }
    }
    None
}

fn base_name(raw: &str) -> String {
    let trimmed = raw.trim().trim_matches('"');
    let base = trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed);
    base.trim()
        .trim_end_matches(".exe")
        .trim_end_matches(".EXE")
        .trim_end_matches(".app")
        .to_string()
}

fn known_game(name: &str) -> Option<String> {
    let base = base_name(name);
    for game in GAMES {
        if game.needles.iter().any(|needle| name_hits(&base, needle)) {
            return Some(game.name.to_string());
        }
    }
    None
}

fn name_hits(haystack: &str, needle: &str) -> bool {
    let hay = haystack.to_lowercase();
    let needle = needle.to_lowercase();
    if needle.chars().count() <= 4 {
        return hay == needle
            || hay.starts_with(&format!("{needle}_"))
            || hay.starts_with(&format!("{needle}-"))
            || hay.starts_with(&format!("{needle}."));
    }
    hay.contains(&needle)
}

fn is_shell_app(name: &str) -> bool {
    let name = name.trim().to_lowercase();
    if name.is_empty() {
        return true;
    }
    SHELL_APPS.iter().any(|shell| *shell == name)
        || name.contains("launcher")
        || name.ends_with(" helper")
        || name.ends_with(" service")
}

struct Game {
    name: &'static str,
    needles: &'static [&'static str],
}

const GAMES: &[Game] = &[
    Game {
        name: "Elden Ring",
        needles: &["elden ring", "eldenring"],
    },
    Game {
        name: "Baldur's Gate 3",
        needles: &["baldur's gate 3", "baldurs gate 3", "bg3"],
    },
    Game {
        name: "Cyberpunk 2077",
        needles: &["cyberpunk 2077", "cyberpunk2077"],
    },
    Game {
        name: "The Witcher 3",
        needles: &["the witcher 3", "witcher3"],
    },
    Game {
        name: "Hades II",
        needles: &["hades ii", "hades2"],
    },
    Game {
        name: "Hades",
        needles: &["hades"],
    },
    Game {
        name: "Hollow Knight",
        needles: &["hollow knight", "hollow_knight"],
    },
    Game {
        name: "Silksong",
        needles: &["silksong"],
    },
    Game {
        name: "Celeste",
        needles: &["celeste"],
    },
    Game {
        name: "Stardew Valley",
        needles: &["stardew valley", "stardewvalley"],
    },
    Game {
        name: "Minecraft",
        needles: &["minecraft"],
    },
    Game {
        name: "Counter-Strike 2",
        needles: &["counter-strike 2", "cs2"],
    },
    Game {
        name: "Valorant",
        needles: &["valorant"],
    },
    Game {
        name: "League of Legends",
        needles: &["league of legends"],
    },
    Game {
        name: "Fortnite",
        needles: &["fortnite"],
    },
    Game {
        name: "Apex Legends",
        needles: &["apex legends", "r5apex"],
    },
    Game {
        name: "Overwatch",
        needles: &["overwatch"],
    },
    Game {
        name: "Rocket League",
        needles: &["rocket league", "rocketleague"],
    },
    Game {
        name: "Grand Theft Auto V",
        needles: &["grand theft auto v", "gta5", "playgtav"],
    },
    Game {
        name: "Red Dead Redemption 2",
        needles: &["red dead redemption 2", "rdr2"],
    },
    Game {
        name: "Terraria",
        needles: &["terraria"],
    },
    Game {
        name: "Factorio",
        needles: &["factorio"],
    },
    Game {
        name: "Dota 2",
        needles: &["dota 2", "dota2"],
    },
    Game {
        name: "Roblox",
        needles: &["roblox"],
    },
    Game {
        name: "osu!",
        needles: &["osu!"],
    },
    Game {
        name: "Dead Cells",
        needles: &["dead cells"],
    },
    Game {
        name: "Cuphead",
        needles: &["cuphead"],
    },
    Game {
        name: "Balatro",
        needles: &["balatro"],
    },
    Game {
        name: "Helldivers 2",
        needles: &["helldivers 2", "helldivers2"],
    },
    Game {
        name: "Palworld",
        needles: &["palworld"],
    },
    Game {
        name: "Lethal Company",
        needles: &["lethal company"],
    },
    Game {
        name: "Deep Rock Galactic",
        needles: &["deep rock galactic", "fsd-win64-shipping"],
    },
    Game {
        name: "Destiny 2",
        needles: &["destiny 2", "destiny2"],
    },
    Game {
        name: "World of Warcraft",
        needles: &["world of warcraft", "wow", "wowclassic"],
    },
    Game {
        name: "Final Fantasy XIV",
        needles: &["final fantasy xiv", "ffxiv"],
    },
    Game {
        name: "Diablo IV",
        needles: &["diablo iv", "diabloiv"],
    },
    Game {
        name: "Path of Exile",
        needles: &["path of exile", "pathofexile"],
    },
    Game {
        name: "PUBG",
        needles: &["pubg", "tslgame"],
    },
    Game {
        name: "Rainbow Six Siege",
        needles: &["rainbow six", "rainbowsix"],
    },
    Game {
        name: "Call of Duty",
        needles: &["call of duty", "modernwarfare", "cod"],
    },
    Game {
        name: "Halo Infinite",
        needles: &["halo infinite", "mcc-win64-shipping"],
    },
    Game {
        name: "Sea of Thieves",
        needles: &["sea of thieves", "sotgame"],
    },
    Game {
        name: "No Man's Sky",
        needles: &["no man's sky", "no mans sky", "nms"],
    },
    Game {
        name: "Satisfactory",
        needles: &["satisfactory"],
    },
    Game {
        name: "RimWorld",
        needles: &["rimworld"],
    },
    Game {
        name: "Civilization VI",
        needles: &["civilization vi", "civilizationvi"],
    },
    Game {
        name: "Forza Horizon 5",
        needles: &["forza horizon 5", "forzahorizon5"],
    },
    Game {
        name: "Euro Truck Simulator 2",
        needles: &["euro truck simulator 2", "eurotrucks2"],
    },
    Game {
        name: "American Truck Simulator",
        needles: &["american truck simulator", "amtrucks"],
    },
    Game {
        name: "Among Us",
        needles: &["among us"],
    },
    Game {
        name: "Genshin Impact",
        needles: &["genshin impact", "genshinimpact"],
    },
    Game {
        name: "Honkai: Star Rail",
        needles: &["honkai: star rail", "starrail"],
    },
    Game {
        name: "Escape from Tarkov",
        needles: &["escape from tarkov", "escapefromtarkov"],
    },
    Game {
        name: "Rust",
        needles: &["rustclient"],
    },
    Game {
        name: "Valheim",
        needles: &["valheim"],
    },
    Game {
        name: "Slay the Spire",
        needles: &["slay the spire", "slaythespire"],
    },
    Game {
        name: "Starfield",
        needles: &["starfield"],
    },
    Game {
        name: "Skyrim",
        needles: &["skyrim"],
    },
    Game {
        name: "Fallout 4",
        needles: &["fallout 4", "fallout4"],
    },
    Game {
        name: "Monster Hunter",
        needles: &["monster hunter", "monsterhunter"],
    },
    Game {
        name: "Street Fighter 6",
        needles: &["street fighter 6", "streetfighter6"],
    },
    Game {
        name: "Tekken 8",
        needles: &["tekken 8", "tekken8"],
    },
    Game {
        name: "Marvel Rivals",
        needles: &["marvel rivals", "marvelrivals"],
    },
    Game {
        name: "Fall Guys",
        needles: &["fall guys", "fallguys"],
    },
    Game {
        name: "Phasmophobia",
        needles: &["phasmophobia"],
    },
    Game {
        name: "VRChat",
        needles: &["vrchat"],
    },
    Game {
        name: "Garry's Mod",
        needles: &["garry's mod", "garrys mod", "gmod"],
    },
    Game {
        name: "Risk of Rain 2",
        needles: &["risk of rain 2"],
    },
    Game {
        name: "Warframe",
        needles: &["warframe"],
    },
    Game {
        name: "Hogwarts Legacy",
        needles: &["hogwarts legacy"],
    },
    Game {
        name: "Black Myth: Wukong",
        needles: &["black myth", "wukong"],
    },
    Game {
        name: "It Takes Two",
        needles: &["it takes two"],
    },
    Game {
        name: "Split Fiction",
        needles: &["split fiction"],
    },
    Game {
        name: "Clair Obscur: Expedition 33",
        needles: &["clair obscur", "expedition 33", "expedition33"],
    },
];

const SHELL_APPS: &[&str] = &[
    "lark",
    "discord",
    "discord ptb",
    "discord canary",
    "finder",
    "dock",
    "system settings",
    "system preferences",
    "systemuisystem",
    "control center",
    "spotlight",
    "notification center",
    "loginwindow",
    "windowserver",
    "window server",
    "safari",
    "google chrome",
    "chrome",
    "firefox",
    "microsoft edge",
    "msedge",
    "arc",
    "brave browser",
    "brave",
    "opera",
    "terminal",
    "iterm2",
    "warp",
    "ghostty",
    "code",
    "cursor",
    "visual studio code",
    "windows terminal",
    "windowsterminal",
    "explorer",
    "searchhost",
    "shellexperiencehost",
    "applicationframehost",
    "textinputhost",
    "startmenuexperiencehost",
    "settings",
    "photos",
    "preview",
    "mail",
    "messages",
    "notes",
    "calendar",
    "music",
    "tv",
    "podcasts",
    "spotify",
    "steam",
    "steamwebhelper",
    "epic games launcher",
    "battle.net",
    "origin",
    "eadesktop",
    "gog galaxy",
    "ubisoft connect",
    "xbox",
    "xbox app",
    "slack",
    "zoom",
    "teams",
    "microsoft teams",
    "outlook",
    "excel",
    "word",
    "powerpoint",
    "notion",
    "figma",
    "electron",
    "powershell",
    "cmd",
    "taskmgr",
    "task manager",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_reading_has_no_line() {
        assert_eq!(status_line(&HardwareReading::default()), None);
    }

    #[test]
    fn line_joins_what_the_machine_answered() {
        let full = HardwareReading {
            gpu: Some("NVIDIA GeForce RTX 4070".into()),
            cpu_temp_c: Some(61),
            game: Some("Hades".into()),
        };
        assert_eq!(
            status_line(&full).as_deref(),
            Some("NVIDIA GeForce RTX 4070 · 61°C · Hades")
        );
        let no_temp = HardwareReading {
            cpu_temp_c: None,
            ..full.clone()
        };
        assert_eq!(
            status_line(&no_temp).as_deref(),
            Some("NVIDIA GeForce RTX 4070 · Hades")
        );
        let game_only = HardwareReading {
            gpu: None,
            cpu_temp_c: None,
            game: Some("  Celeste ™ ".into()),
        };
        assert_eq!(status_line(&game_only).as_deref(), Some("Celeste"));
    }

    #[test]
    fn line_stays_within_discord_custom_status() {
        let reading = HardwareReading {
            gpu: Some("N".repeat(110)),
            cpu_temp_c: Some(77),
            game: Some("Clair Obscur: Expedition 33 — the long title".into()),
        };
        let line = status_line(&reading).unwrap();
        assert!(line.chars().count() <= DISCORD_CUSTOM_STATUS_MAX, "{line}");
        assert!(!line.starts_with('N'), "{line}");
        assert!(line.contains("77°C"), "{line}");
        assert!(line.contains("Expedition 33"), "{line}");
        let huge = HardwareReading {
            gpu: None,
            cpu_temp_c: None,
            game: Some("G".repeat(200)),
        };
        let trimmed = status_line(&huge).unwrap();
        assert_eq!(trimmed.chars().count(), DISCORD_CUSTOM_STATUS_MAX);
        assert!(trimmed.ends_with('…'));
    }

    #[test]
    fn implausible_temperature_is_left_out() {
        assert_eq!(
            status_line(&HardwareReading {
                gpu: Some("Apple M2".into()),
                cpu_temp_c: Some(0),
                game: None,
            })
            .as_deref(),
            Some("Apple M2")
        );
        assert_eq!(
            parse_cpu_temp_c("Fan: 1800 RPM\nGPU die temperature: 90 C"),
            None
        );
        assert_eq!(
            parse_cpu_temp_c("GPU die temperature: 90 C\nCPU die temperature: 48.21 C\n"),
            Some(48)
        );
        assert_eq!(
            parse_cpu_temp_c(
                "P-Cluster die temperature: 41 C\nE-Cluster die temperature: 52.6 C\n"
            ),
            Some(53)
        );
        assert_eq!(parse_cpu_temp_c("61"), Some(61));
        assert_eq!(parse_cpu_temp_c("0"), None);
        assert_eq!(parse_cpu_temp_c("250"), None);
    }

    #[test]
    fn gpu_parser_prefers_a_discrete_adapter() {
        let json = r#"{"SPDisplaysDataType":[{"sppci_model":"Intel UHD Graphics 630"},{"_name":"AMD Radeon Pro 5500M"}]}"#;
        assert_eq!(
            parse_macos_gpu(json).as_deref(),
            Some("AMD Radeon Pro 5500M")
        );
        let text = "Chipset Model: Apple M2\nChipset Model: NVIDIA GeForce RTX 3080\n";
        assert_eq!(
            parse_macos_gpu(text).as_deref(),
            Some("NVIDIA GeForce RTX 3080")
        );
        let windows = "Microsoft Basic Display Adapter\nNVIDIA GeForce RTX 4070\n";
        assert_eq!(
            parse_windows_gpu(windows).as_deref(),
            Some("NVIDIA GeForce RTX 4070")
        );
        assert_eq!(parse_windows_gpu("Microsoft Basic Display Adapter\n"), None);
    }

    #[test]
    fn foreground_name_comes_from_lsappinfo_or_plain_text() {
        let info = r#""CFBundleName"="Code" "LSDisplayName"="Hades""#;
        assert_eq!(parse_foreground_name(info).as_deref(), Some("Hades"));
        assert_eq!(
            parse_foreground_name("Celeste\n").as_deref(),
            Some("Celeste")
        );
        assert_eq!(
            parse_foreground_name("\r\nHades\r\n").as_deref(),
            Some("Hades")
        );
    }

    #[test]
    fn game_follows_the_foreground_and_ignores_the_shell() {
        let processes = vec![
            "/Applications/Hades.app/Contents/MacOS/Hades".into(),
            "rust-analyzer".into(),
        ];
        assert_eq!(
            pick_game(Some("Hades"), &processes).as_deref(),
            Some("Hades")
        );
        assert_eq!(
            pick_game(Some("Lark"), &processes).as_deref(),
            Some("Hades")
        );
        assert_eq!(
            pick_game(Some("Google Chrome"), &processes).as_deref(),
            Some("Hades")
        );
        assert_eq!(pick_game(Some("Balatro"), &[]).as_deref(), Some("Balatro"));
        assert_eq!(pick_game(Some("Lark"), &["rust-analyzer".into()]), None);
        assert_eq!(
            pick_game(Some("Code"), &["RustClient.exe".into()]).as_deref(),
            Some("Rust")
        );
        assert_eq!(pick_game(Some("Steam"), &[]), None);
    }

    #[test]
    fn other_systems_are_not_probed() {
        assert_eq!(sample_hardware("linux"), HardwareReading::default());
        assert_eq!(HARDWARE_STATUS_INTERVAL_MS, 60_000);
    }
}
