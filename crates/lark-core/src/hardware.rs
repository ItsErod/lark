//! Best-effort PC hardware and game line for a Discord custom status,
//! plus the CPU, RAM, and foreground game the performance overlay reads.
//!
//! The desktop shell asks for a full sample only after Settings → Lark →
//! Hardware in status is on. A lighter sample (CPU, RAM, and the current
//! game, no GPU sensors) runs when the performance overlay or game detection
//! is on. macOS reads local tools. Windows uses `GlobalMemoryStatusEx`,
//! `GetSystemTimes`, `EnumDisplayDevicesW`, and a Toolhelp process snapshot.
//! It does not start a command interpreter, and it does not take arguments
//! from Discord. CPU temperature on Windows is omitted because
//! the only user-mode source was WMI. A missing reading is left out. Other
//! systems return an empty reading and do not spawn anything.
//! A local dashboard read on Linux uses `/proc` and does not spawn anything.
//! That read is not published as a Discord status.
//!
//! Callers should publish the status line at [`HARDWARE_STATUS_INTERVAL_MS`],
//! not on a frame tick. The overlay reuses this reading instead of a second probe.

#[cfg(windows)]
#[path = "hardware_win.rs"]
mod hardware_win;

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
    /// 0–100. Omitted when the OS did not answer.
    pub cpu_percent: Option<u8>,
    pub ram_used_mb: Option<u32>,
    pub ram_total_mb: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemorySample {
    pub used_mb: u32,
    pub total_mb: u32,
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
    sample_machine(os, true)
}

/// CPU, RAM, and the current game. Skips the GPU name and temperature probes.
pub fn sample_load(os: &str) -> HardwareReading {
    sample_machine(os, false)
}

/// CPU, RAM, and a network byte counter for the on-device dashboard.
/// Linux reads `/proc`. macOS and Windows reuse the load sample. Nothing
/// here is sent to Discord.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DashboardMeters {
    pub reading: HardwareReading,
    pub net_rx_bytes: Option<u64>,
    pub net_tx_bytes: Option<u64>,
}

pub fn sample_dashboard(os: &str, full: bool) -> DashboardMeters {
    if os == "linux" {
        return linux_dashboard();
    }
    DashboardMeters {
        reading: sample_machine(os, full),
        ..DashboardMeters::default()
    }
}

#[derive(Clone, Copy)]
struct CpuJiffies {
    total: u64,
    idle: u64,
}

static LINUX_CPU: Mutex<Option<CpuJiffies>> = Mutex::new(None);

fn linux_dashboard() -> DashboardMeters {
    let memory = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .as_deref()
        .and_then(parse_meminfo);
    let (net_rx_bytes, net_tx_bytes) = std::fs::read_to_string("/proc/net/dev")
        .ok()
        .as_deref()
        .and_then(parse_proc_net)
        .map(|(rx, tx)| (Some(rx), Some(tx)))
        .unwrap_or((None, None));
    DashboardMeters {
        reading: HardwareReading {
            cpu_percent: linux_cpu_percent(),
            ram_used_mb: memory.map(|item| item.used_mb),
            ram_total_mb: memory.map(|item| item.total_mb),
            ..HardwareReading::default()
        },
        net_rx_bytes,
        net_tx_bytes,
    }
}

fn linux_cpu_percent() -> Option<u8> {
    let text = std::fs::read_to_string("/proc/stat").ok()?;
    let now = parse_proc_stat(&text)?;
    let mut slot = LINUX_CPU.lock().unwrap_or_else(|err| err.into_inner());
    let prev = slot.replace(now);
    prev.and_then(|prev| cpu_delta(prev, now))
}

fn parse_proc_stat(text: &str) -> Option<CpuJiffies> {
    let line = text.lines().find(|line| line.starts_with("cpu "))?;
    let mut nums = Vec::new();
    for part in line.split_whitespace().skip(1) {
        nums.push(part.parse::<u64>().ok()?);
    }
    if nums.len() < 4 {
        return None;
    }
    let idle = nums[3].saturating_add(*nums.get(4).unwrap_or(&0));
    let total = nums
        .iter()
        .fold(0u64, |sum, value| sum.saturating_add(*value));
    Some(CpuJiffies { total, idle })
}

fn cpu_delta(prev: CpuJiffies, next: CpuJiffies) -> Option<u8> {
    if next.total <= prev.total {
        return None;
    }
    let total = next.total - prev.total;
    let idle = next.idle.saturating_sub(prev.idle);
    if idle > total || total == 0 {
        return None;
    }
    Some(((total - idle) * 100 / total) as u8)
}

fn parse_meminfo(text: &str) -> Option<MemorySample> {
    let mut total_kb = None;
    let mut available_kb = None;
    for line in text.lines() {
        if let Some(value) = kb_field(line, "MemTotal:") {
            total_kb = Some(value);
        } else if let Some(value) = kb_field(line, "MemAvailable:") {
            available_kb = Some(value);
        }
    }
    let total_kb = total_kb?;
    let available_kb = available_kb?;
    if total_kb == 0 || available_kb > total_kb {
        return None;
    }
    Some(MemorySample {
        used_mb: ((total_kb - available_kb) / 1024) as u32,
        total_mb: (total_kb / 1024) as u32,
    })
}

fn kb_field(line: &str, key: &str) -> Option<u64> {
    let rest = line.strip_prefix(key)?.trim();
    rest.split_whitespace().next()?.parse().ok()
}

fn parse_proc_net(text: &str) -> Option<(u64, u64)> {
    let mut rx = 0u64;
    let mut tx = 0u64;
    let mut any = false;
    for line in text.lines().skip(2) {
        let Some((name, rest)) = line.split_once(':') else {
            continue;
        };
        if name.trim() == "lo" {
            continue;
        }
        let cols: Vec<&str> = rest.split_whitespace().collect();
        if cols.len() < 9 {
            continue;
        }
        let Ok(rx_b) = cols[0].parse::<u64>() else {
            continue;
        };
        let Ok(tx_b) = cols[8].parse::<u64>() else {
            continue;
        };
        rx = rx.saturating_add(rx_b);
        tx = tx.saturating_add(tx_b);
        any = true;
    }
    if any {
        Some((rx, tx))
    } else {
        None
    }
}

/// Foreground game only. Skips CPU, RAM, and GPU so a clip name check stays off the hotkey.
pub fn sample_game(os: &str) -> Option<String> {
    match os {
        "macos" => {
            let foreground = macos_foreground();
            let processes = process_lines(&capture(
                "/bin/ps",
                &["-ax", "-o", "comm="],
                Duration::from_secs(2),
            ));
            pick_game(foreground.as_deref(), &processes)
        }
        "windows" => {
            #[cfg(windows)]
            {
                return hardware_win::foreground_game();
            }
            #[cfg(not(windows))]
            {
                None
            }
        }
        _ => None,
    }
}

fn sample_machine(os: &str, full: bool) -> HardwareReading {
    match os {
        "macos" => sample_macos(full),
        "windows" => sample_windows(full),
        _ => HardwareReading::default(),
    }
}

fn sample_macos(full: bool) -> HardwareReading {
    let gpu = if full {
        cached_gpu("macos", macos_gpu)
    } else {
        None
    };
    let cpu_temp_c = if full {
        capture(
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
        .and_then(parse_cpu_temp_c)
    } else {
        None
    };
    let memory = macos_memory();
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
        cpu_percent: macos_cpu(),
        ram_used_mb: memory.map(|item| item.used_mb),
        ram_total_mb: memory.map(|item| item.total_mb),
    }
}

fn macos_cpu() -> Option<u8> {
    capture(
        "/usr/bin/top",
        &["-l", "1", "-n", "0"],
        Duration::from_secs(2),
    )
    .as_deref()
    .and_then(parse_cpu_percent)
}

fn macos_memory() -> Option<MemorySample> {
    let total = capture(
        "/usr/sbin/sysctl",
        &["-n", "hw.memsize"],
        Duration::from_secs(1),
    )
    .as_deref()
    .and_then(parse_memsize_bytes)?;
    let stat = capture("/usr/bin/vm_stat", &[], Duration::from_secs(2))?;
    parse_vm_stat(&stat, total)
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

fn sample_windows(full: bool) -> HardwareReading {
    #[cfg(windows)]
    {
        let mut reading = hardware_win::sample();
        reading.gpu = if full {
            cached_gpu("windows", hardware_win::gpu_name)
        } else {
            None
        };
        reading
    }
    #[cfg(not(windows))]
    {
        let _ = full;
        HardwareReading::default()
    }
}

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
    crate::proc::hide_console(&mut command);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
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

/// 0–100 from `top`'s `CPU usage:` line, or a single percentage.
pub fn parse_cpu_percent(text: &str) -> Option<u8> {
    for line in text.lines() {
        let lower = line.to_lowercase();
        if !lower.contains("cpu usage") {
            continue;
        }
        if let (Some(user), Some(sys)) = (
            percent_before(&lower, "user"),
            percent_before(&lower, "sys"),
        ) {
            return Some(clamp_percent(user + sys));
        }
        if let Some(idle) = percent_before(&lower, "idle") {
            return Some(clamp_percent(100.0 - idle));
        }
    }
    let trimmed = text.trim();
    if !trimmed.is_empty() && trimmed.lines().count() == 1 {
        if let Some(value) = first_number(trimmed) {
            if (0.0..=100.0).contains(&value) {
                return Some(clamp_percent(value));
            }
        }
    }
    let mut numbers = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.to_lowercase().contains("load") {
            continue;
        }
        if let Ok(value) = line.parse::<f64>() {
            if (0.0..=100.0).contains(&value) {
                numbers.push(value);
            }
        }
    }
    if numbers.len() == 1 {
        return Some(clamp_percent(numbers[0]));
    }
    None
}

fn percent_before(lower: &str, label: &str) -> Option<f64> {
    let pattern = format!("% {label}");
    let index = lower.find(&pattern)?;
    let prefix = lower[..index].trim_end();
    let bytes = prefix.as_bytes();
    let mut start = bytes.len();
    while start > 0 && (bytes[start - 1].is_ascii_digit() || bytes[start - 1] == b'.') {
        start -= 1;
    }
    if start == bytes.len() {
        return None;
    }
    prefix[start..].parse().ok()
}

fn clamp_percent(value: f64) -> u8 {
    value.round().clamp(0.0, 100.0) as u8
}

/// Byte count from `sysctl -n hw.memsize`.
pub fn parse_memsize_bytes(text: &str) -> Option<u64> {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.lines().count() != 1 {
        return None;
    }
    let value = first_number(trimmed)?;
    if value < 1024.0 * 1024.0 || value > 1024.0 * 1024.0 * 1024.0 * 1024.0 * 4.0 {
        return None;
    }
    Some(value.round() as u64)
}

/// Used and total memory from `vm_stat` plus the machine's total byte count.
pub fn parse_vm_stat(text: &str, total_bytes: u64) -> Option<MemorySample> {
    if total_bytes < 1024 * 1024 {
        return None;
    }
    let page = page_size(text).unwrap_or(4096);
    if page == 0 {
        return None;
    }
    let free = page_count(text, "pages free")?;
    let speculative = page_count(text, "pages speculative").unwrap_or(0);
    let total_pages = total_bytes / page;
    if total_pages == 0 {
        return None;
    }
    let unused = free.saturating_add(speculative).min(total_pages);
    let used_pages = total_pages - unused;
    let total_mb = (total_bytes / (1024 * 1024)) as u32;
    let used_mb = ((used_pages.saturating_mul(page)) / (1024 * 1024)) as u32;
    if total_mb == 0 {
        return None;
    }
    Some(MemorySample {
        used_mb: used_mb.min(total_mb),
        total_mb,
    })
}

fn page_size(text: &str) -> Option<u64> {
    let lower = text.to_lowercase();
    let marker = "page size of ";
    let start = lower.find(marker)? + marker.len();
    let value = first_number(&lower[start..])?;
    if value < 256.0 || value > 1024.0 * 1024.0 {
        return None;
    }
    Some(value.round() as u64)
}

fn page_count(text: &str, label: &str) -> Option<u64> {
    for line in text.lines() {
        let lower = line.to_lowercase();
        let Some(rest) = lower.strip_prefix(label) else {
            continue;
        };
        let rest = rest.trim().trim_start_matches(':').trim();
        return first_number(rest).map(|value| value.round() as u64);
    }
    None
}

/// Used and total from `total_kb=` / `free_kb=` or the CIM property names. Values are kilobytes.
pub fn parse_windows_memory(text: &str) -> Option<MemorySample> {
    let total_kb =
        labeled_u64(text, "total_kb").or_else(|| labeled_u64(text, "totalvisiblememorysize"))?;
    let free_kb =
        labeled_u64(text, "free_kb").or_else(|| labeled_u64(text, "freephysicalmemory"))?;
    if total_kb == 0 || free_kb > total_kb {
        return None;
    }
    let total_mb = (total_kb / 1024) as u32;
    let used_mb = ((total_kb - free_kb) / 1024) as u32;
    if total_mb == 0 {
        return None;
    }
    Some(MemorySample {
        used_mb: used_mb.min(total_mb),
        total_mb,
    })
}

fn labeled_u64(text: &str, key: &str) -> Option<u64> {
    let key = key.to_lowercase();
    for line in text.lines() {
        let flat: String = line
            .chars()
            .filter(|ch| !ch.is_whitespace())
            .flat_map(|ch| ch.to_lowercase())
            .collect();
        let Some(rest) = flat.strip_prefix(&key) else {
            continue;
        };
        let rest = rest.trim_start_matches([':', '=']);
        return first_number(rest).map(|value| value.round() as u64);
    }
    None
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
        name: "Deadlock",
        needles: &["deadlock"],
    },
    Game {
        name: "Rocket League",
        needles: &["rocket league", "rocketleague"],
    },
    Game {
        name: "Grand Theft Auto V",
        needles: &["grand theft auto v", "gta5", "gtav", "playgtav"],
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
        assert_eq!(sample_game("linux"), None);
    }

    #[test]
    fn line_joins_what_the_machine_answered() {
        let full = HardwareReading {
            gpu: Some("NVIDIA GeForce RTX 4070".into()),
            cpu_temp_c: Some(61),
            game: Some("Hades".into()),
            ..HardwareReading::default()
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
            ..HardwareReading::default()
        };
        assert_eq!(status_line(&game_only).as_deref(), Some("Celeste"));
    }

    #[test]
    fn line_stays_within_discord_custom_status() {
        let reading = HardwareReading {
            gpu: Some("N".repeat(110)),
            cpu_temp_c: Some(77),
            game: Some("Clair Obscur: Expedition 33 — the long title".into()),
            ..HardwareReading::default()
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
            ..HardwareReading::default()
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
                cpu_percent: Some(40),
                ram_used_mb: Some(8000),
                ram_total_mb: Some(16000),
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
        assert_eq!(sample_load("linux"), HardwareReading::default());
        assert_eq!(HARDWARE_STATUS_INTERVAL_MS, 60_000);
        if cfg!(not(windows)) {
            let started = std::time::Instant::now();
            assert_eq!(sample_hardware("windows"), HardwareReading::default());
            assert_eq!(sample_load("windows"), HardwareReading::default());
            assert!(started.elapsed() < Duration::from_millis(500));
        }
    }

    #[test]
    fn load_parsers_read_cpu_and_memory_without_touching_the_status_line() {
        assert_eq!(
            parse_cpu_percent("CPU usage: 8.49% user, 10.16% sys, 81.33% idle"),
            Some(19)
        );
        assert_eq!(parse_cpu_percent("CPU usage: 90% idle"), Some(10));
        assert_eq!(parse_cpu_percent("23"), Some(23));
        assert_eq!(parse_cpu_percent("LoadPercentage\n12\n"), Some(12));
        assert_eq!(parse_cpu_percent("250"), None);
        assert_eq!(parse_cpu_percent(""), None);
        let total = parse_memsize_bytes("17179869184\n").unwrap();
        let stat = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100000.\nPages speculative: 50000.\n";
        let memory = parse_vm_stat(stat, total).unwrap();
        assert_eq!(memory.total_mb, 16384);
        assert!(memory.used_mb < memory.total_mb);
        assert!(memory.used_mb > 0);
        assert_eq!(
            parse_windows_memory("total_kb=16777216\nfree_kb=4194304\n"),
            Some(MemorySample {
                used_mb: 12288,
                total_mb: 16384
            })
        );
        assert_eq!(
            parse_windows_memory(
                "TotalVisibleMemorySize : 16777216\nFreePhysicalMemory : 4194304\n"
            ),
            Some(MemorySample {
                used_mb: 12288,
                total_mb: 16384
            })
        );
        let with_load = HardwareReading {
            gpu: Some("Apple M2".into()),
            cpu_percent: Some(12),
            ram_used_mb: Some(6400),
            ram_total_mb: Some(16384),
            ..HardwareReading::default()
        };
        assert_eq!(status_line(&with_load).as_deref(), Some("Apple M2"));
    }

    #[test]
    fn linux_proc_reads_stay_local() {
        let prev = parse_proc_stat("cpu  100 0 0 800 0 0 0 0\n").unwrap();
        let next = parse_proc_stat("cpu  180 0 20 800 0 0 0 0\n").unwrap();
        assert_eq!(cpu_delta(prev, next), Some(100));
        assert_eq!(
            parse_meminfo(
                "MemTotal:       16384000 kB\nMemFree: 100 kB\nMemAvailable:    8192000 kB\n"
            ),
            Some(MemorySample {
                used_mb: 8000,
                total_mb: 16000
            })
        );
        assert_eq!(
            parse_proc_net(
                "Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n    lo: 10 0 0 0 0 0 0 0 10 0 0 0 0 0 0 0\n  eth0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n"
            ),
            Some((1000, 2000))
        );
        let meters = sample_dashboard("linux", false);
        if std::path::Path::new("/proc/meminfo").is_file() {
            assert!(meters.reading.ram_total_mb.unwrap_or(0) > 0);
        } else {
            assert_eq!(meters.reading, HardwareReading::default());
        }
        assert_eq!(
            sample_dashboard("freebsd", false).reading,
            HardwareReading::default()
        );
    }
}
