//! Send-time clip fitting.
//!
//! The rolling buffer still writes the clip it already recorded. This module only
//! decides whether a saved file is over the Discord upload limit, and how to
//! re-encode a copy to H.264/AAC MP4 so the original stays in the clips folder.
//! Hardware encoders are preferred. ffmpeg is a sidecar or the system binary.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Discord's default upload limit when Nitro is not detected.
pub const DEFAULT_UPLOAD_LIMIT: u64 = 10 * 1024 * 1024;
/// Nitro Basic and Nitro Classic.
pub const NITRO_BASIC_LIMIT: u64 = 50 * 1024 * 1024;
/// Nitro.
pub const NITRO_LIMIT: u64 = 500 * 1024 * 1024;
const AUDIO_BPS: u64 = 96_000;
const MIN_VIDEO_BPS: u64 = 64_000;
const MAX_VIDEO_BPS: u64 = 8_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressMode {
    Always,
    Ask,
    Never,
}

impl CompressMode {
    pub fn parse(value: &str) -> Self {
        match value {
            "always" => Self::Always,
            "never" => Self::Never,
            _ => Self::Ask,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FitAction {
    Send,
    Ask,
    Compress,
    Block,
}

/// `premium_type` from Discord: 0 none, 1 Nitro Classic, 2 Nitro, 3 Nitro Basic.
pub fn upload_limit_bytes(premium_type: i64) -> u64 {
    match premium_type {
        2 => NITRO_LIMIT,
        1 | 3 => NITRO_BASIC_LIMIT,
        _ => DEFAULT_UPLOAD_LIMIT,
    }
}

pub fn fit_action(bytes: u64, limit: u64, mode: CompressMode) -> FitAction {
    if bytes <= limit {
        return FitAction::Send;
    }
    match mode {
        CompressMode::Always => FitAction::Compress,
        CompressMode::Ask => FitAction::Ask,
        CompressMode::Never => FitAction::Block,
    }
}

/// Video bitrate, in bits per second, that should land the file under `limit`.
pub fn video_bitrate(duration_ms: u64, limit_bytes: u64) -> u64 {
    let duration_ms = duration_ms.max(1);
    let usable = (limit_bytes as f64) * 0.92 - 32_768.0;
    if usable <= 0.0 {
        return MIN_VIDEO_BPS;
    }
    let total_bps = usable * 8.0 * 1000.0 / duration_ms as f64;
    let video = total_bps - AUDIO_BPS as f64;
    if video < MIN_VIDEO_BPS as f64 {
        MIN_VIDEO_BPS
    } else if video > MAX_VIDEO_BPS as f64 {
        MAX_VIDEO_BPS
    } else {
        video.round() as u64
    }
}

/// Same hardware-then-software order the clip save path uses.
pub fn h264_encoder_order(os: &str) -> &'static [&'static str] {
    crate::mp4mux::ffmpeg_video_encoders(os)
}

pub fn pick_h264_encoder(os: &str, available: &[String]) -> String {
    for name in h264_encoder_order(os) {
        if available.iter().any(|item| item == name) {
            return (*name).to_string();
        }
    }
    "libx264".into()
}

pub fn encoders_from_listing(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let flags = parts.next().unwrap_or("");
        let name = parts.next().unwrap_or("");
        if (flags.contains('V') && name.starts_with("h264_")) || name == "libx264" {
            found.push(name.to_string());
        }
    }
    found
}

pub fn fitted_clip_name(current: &str) -> String {
    let ext = crate::clip::clip_extension(current);
    let stem = current.trim_end_matches(&format!(".{ext}"));
    let stem = stem.strip_suffix("-fit").unwrap_or(stem);
    format!("{stem}-fit.mp4")
}

pub fn trimmed_clip_name(current: &str) -> String {
    let ext = crate::clip::clip_extension(current);
    let stem = current.trim_end_matches(&format!(".{ext}"));
    let stem = stem.strip_suffix("-trim").unwrap_or(stem);
    let name = format!("{stem}-trim.{ext}");
    if crate::clip::is_clip_name(&name) {
        name
    } else {
        format!("lark-clip-trim.{ext}")
    }
}

pub fn renamed_clip_name(current: &str, label: &str) -> Result<String, String> {
    let ext = crate::clip::clip_extension(current);
    if ext != "avi" && ext != "mp4" {
        return Err("That clip name is not valid.".into());
    }
    let mut slug = String::new();
    let mut dash = false;
    for ch in label.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        return Err("Name the clip with letters or numbers.".into());
    }
    let name = format!("lark-clip-{slug}.{ext}");
    if !crate::clip::is_clip_name(&name) {
        return Err("That clip name is not valid.".into());
    }
    Ok(name)
}

/// ffmpeg arguments for one H.264/AAC MP4. Audio is optional so a silent AVI still encodes.
pub fn encode_args(
    encoder: &str,
    input: &str,
    output: &str,
    video_bps: u64,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
) -> Vec<String> {
    let mut args = vec!["-hide_banner".into(), "-y".into()];
    if let Some(start) = start_ms {
        if start > 0 {
            args.push("-ss".into());
            args.push(format_ts(start));
        }
    }
    if let Some(end) = end_ms {
        args.push("-to".into());
        args.push(format_ts(end));
    }
    args.push("-i".into());
    args.push(input.into());
    args.extend([
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a:0?".into(),
        "-c:v".into(),
        encoder.into(),
    ]);
    let rate = video_bps.to_string();
    match encoder {
        "h264_videotoolbox" => {
            args.extend(["-b:v".into(), rate, "-allow_sw".into(), "1".into()]);
        }
        "h264_nvenc" => {
            args.extend([
                "-preset".into(),
                "p4".into(),
                "-rc".into(),
                "vbr".into(),
                "-b:v".into(),
                rate.clone(),
                "-maxrate".into(),
                rate,
            ]);
        }
        "h264_mf" | "h264_qsv" | "h264_amf" => {
            args.extend(["-b:v".into(), rate.clone(), "-maxrate".into(), rate]);
        }
        _ => {
            args.extend([
                "-preset".into(),
                "veryfast".into(),
                "-b:v".into(),
                rate.clone(),
                "-maxrate".into(),
                rate.clone(),
                "-bufsize".into(),
                (video_bps.saturating_mul(2)).to_string(),
            ]);
        }
    }
    args.extend([
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "96k".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.into(),
    ]);
    args
}

fn format_ts(ms: u64) -> String {
    let total = ms / 1000;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;
    let millis = ms % 1000;
    format!("{hours:02}:{minutes:02}:{seconds:02}.{millis:03}")
}

/// `out_time_ms` from ffmpeg progress. Newer builds report microseconds in that field.
pub fn progress_percent(line: &str, duration_ms: u64) -> Option<u8> {
    let duration_ms = duration_ms.max(1);
    let value = if let Some(rest) = line.trim().strip_prefix("out_time_us=") {
        rest.parse::<u64>().ok()? / 1000
    } else if let Some(rest) = line.trim().strip_prefix("out_time_ms=") {
        let raw = rest.parse::<u64>().ok()?;
        if raw > duration_ms.saturating_mul(100) {
            raw / 1000
        } else {
            raw
        }
    } else {
        return None;
    };
    let pct = (value.saturating_mul(100) / duration_ms).min(99);
    Some(pct as u8)
}

pub fn ffmpeg_candidates(resource_dir: Option<&Path>, exe_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = resource_dir {
        out.push(dir.join("ffmpeg"));
        out.push(dir.join("ffmpeg.exe"));
        out.push(dir.join("binaries").join("ffmpeg"));
    }
    if let Some(dir) = exe_dir {
        out.push(dir.join("ffmpeg"));
        out.push(dir.join("ffmpeg.exe"));
    }
    out
}

pub fn resolve_ffmpeg(hints: &[PathBuf]) -> Option<PathBuf> {
    if let Some(path) = crate::mp4mux::bundled_ffmpeg() {
        return Some(path);
    }
    for path in hints {
        if path.is_file() {
            return Some(path.clone());
        }
    }
    if Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .is_some_and(|status| status.success())
    {
        return Some(PathBuf::from("ffmpeg"));
    }
    None
}

pub fn run_ffmpeg(
    bin: &Path,
    args: &[String],
    duration_ms: u64,
    on_progress: &mut dyn FnMut(u8),
) -> Result<(), String> {
    let mut child = Command::new(bin)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Couldn't start ffmpeg ({bin}): {err}", bin = bin.display()))?;
    let stderr = child.stderr.take();
    let stderr_handle = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut pipe) = stderr {
            let _ = std::io::Read::read_to_string(&mut pipe, &mut buf);
        }
        buf
    });
    if let Some(stdout) = child.stdout.take() {
        let reader = std::io::BufRead::lines(std::io::BufReader::new(stdout));
        for line in reader.map_while(Result::ok) {
            if let Some(pct) = progress_percent(&line, duration_ms) {
                on_progress(pct);
            }
        }
    }
    let status = child
        .wait()
        .map_err(|err| format!("ffmpeg did not finish: {err}"))?;
    let err_text = stderr_handle.join().unwrap_or_default();
    if status.success() {
        on_progress(100);
        Ok(())
    } else {
        let detail = err_text.trim();
        let tail = if detail.is_empty() {
            status.to_string()
        } else {
            detail
                .lines()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" ")
        };
        Err(format!("ffmpeg could not re-encode the clip: {tail}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upload_limits_follow_nitro() {
        assert_eq!(upload_limit_bytes(0), DEFAULT_UPLOAD_LIMIT);
        assert_eq!(upload_limit_bytes(-1), DEFAULT_UPLOAD_LIMIT);
        assert_eq!(upload_limit_bytes(1), NITRO_BASIC_LIMIT);
        assert_eq!(upload_limit_bytes(3), NITRO_BASIC_LIMIT);
        assert_eq!(upload_limit_bytes(2), NITRO_LIMIT);
    }

    #[test]
    fn over_limit_follows_the_compress_setting() {
        let limit = DEFAULT_UPLOAD_LIMIT;
        assert_eq!(fit_action(limit, limit, CompressMode::Ask), FitAction::Send);
        assert_eq!(
            fit_action(limit + 1, limit, CompressMode::Ask),
            FitAction::Ask
        );
        assert_eq!(
            fit_action(limit + 1, limit, CompressMode::Always),
            FitAction::Compress
        );
        assert_eq!(
            fit_action(limit + 1, limit, CompressMode::Never),
            FitAction::Block
        );
        assert_eq!(CompressMode::parse("always"), CompressMode::Always);
        assert_eq!(CompressMode::parse("nope"), CompressMode::Ask);
    }

    #[test]
    fn bitrate_for_a_thirty_second_clip_fits_ten_megabytes() {
        let rate = video_bitrate(30_000, DEFAULT_UPLOAD_LIMIT);
        let total = rate + AUDIO_BPS;
        let bytes = total * 30 / 8;
        assert!(bytes < DEFAULT_UPLOAD_LIMIT);
        assert!(rate > 1_000_000);
        assert_eq!(video_bitrate(1, DEFAULT_UPLOAD_LIMIT), MAX_VIDEO_BPS);
        assert_eq!(video_bitrate(0, 1), MIN_VIDEO_BPS);
    }

    #[test]
    fn hardware_encoders_come_before_libx264() {
        assert_eq!(h264_encoder_order("macos")[0], "h264_videotoolbox");
        assert_eq!(h264_encoder_order("windows")[0], "h264_mf");
        let available = vec!["libx264".into(), "h264_nvenc".into()];
        assert_eq!(pick_h264_encoder("windows", &available), "h264_nvenc");
        assert_eq!(pick_h264_encoder("macos", &available), "libx264");
        assert_eq!(pick_h264_encoder("linux", &[]), "libx264");
        let listing = " V....D libx264\n V....D h264_videotoolbox\n A....D aac\n";
        assert_eq!(
            encoders_from_listing(listing),
            vec!["libx264".to_string(), "h264_videotoolbox".to_string()]
        );
    }

    #[test]
    fn encode_args_target_h264_aac_and_keep_a_distinct_output() {
        let args = encode_args(
            "h264_videotoolbox",
            "in.avi",
            "out.mp4",
            2_000_000,
            Some(1_500),
            Some(8_000),
        );
        assert!(args.windows(2).any(|pair| pair == ["-c:v", "h264_videotoolbox"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:a", "aac"]));
        assert!(args.iter().any(|arg| arg == "0:a:0?"));
        assert!(args.contains(&"-allow_sw".into()));
        assert_eq!(args.last().map(String::as_str), Some("out.mp4"));
        assert_ne!(fitted_clip_name("lark-clip-demo.avi"), "lark-clip-demo.avi");
        assert_eq!(
            fitted_clip_name("lark-clip-demo.avi"),
            "lark-clip-demo-fit.mp4"
        );
        assert_eq!(
            trimmed_clip_name("lark-clip-demo.mp4"),
            "lark-clip-demo-trim.mp4"
        );
        assert_eq!(
            renamed_clip_name("lark-clip-demo.mp4", "Boss fight").unwrap(),
            "lark-clip-boss-fight.mp4"
        );
        assert!(renamed_clip_name("lark-clip-demo.avi", "!!!").is_err());
    }

    #[test]
    fn progress_treats_a_microsecond_clock_as_time() {
        assert_eq!(progress_percent("out_time_ms=15000", 30_000), Some(50));
        assert_eq!(progress_percent("out_time_ms=15000000", 30_000), Some(50));
        assert_eq!(progress_percent("out_time_us=15000000", 30_000), Some(50));
        assert_eq!(progress_percent("frame=10", 30_000), None);
    }
}
