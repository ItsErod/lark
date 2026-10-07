//! Local screen clips.
//!
//! Lark does not ask the operating system for "the last 30 seconds." macOS has no
//! replay-buffer API, and Windows Game Bar does not hand its buffer to other apps.
//! While screen share or Game Mode capture is on, the desktop shell samples the main
//! display into this ring as JPEG. The clip hotkey encodes that ring to a faststart
//! H.264 + AAC MP4. Turning both off discards the ring. Nothing here uploads.

pub use crate::clip_encode::{encode_clip, EncodedClip};

use std::collections::VecDeque;

use jpeg_encoder::{ColorType, Encoder};

use crate::config::parse_shortcut;

/// How long a clip can reach back.
pub const CLIP_WINDOW_MS: u64 = 30_000;
/// Samples while a capture mode is on. The file may use a lower rate to stay attachable.
pub const CLIP_SAMPLE_INTERVAL_MS: u64 = 200;
/// Longest edge of a stored frame, in pixels.
pub const CLIP_MAX_EDGE: u32 = 960;
/// JPEG quality for stored frames. Lower keeps a 30 second clip under the 8 MB attach limit.
pub const CLIP_JPEG_QUALITY: u8 = 45;
/// Bytes of JPEG payload reserved so the MP4 still fits in an 8 MB attachment.
pub const CLIP_MAX_BYTES: usize = 7_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedFrame {
    pub at_ms: u64,
    pub width: u32,
    pub height: u32,
    pub jpeg: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipFile {
    pub bytes: Vec<u8>,
    pub frames: u32,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub span_ms: u64,
}

/// JPEG frames chosen for one save. Encoding runs after the buffer lock is released.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipPlan {
    pub frames: Vec<EncodedFrame>,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub span_ms: u64,
}

/// Rolling window of JPEG frames. Older than [`CLIP_WINDOW_MS`] is dropped on push.
#[derive(Debug)]
pub struct ClipBuffer {
    window_ms: u64,
    frames: VecDeque<EncodedFrame>,
}

impl ClipBuffer {
    pub fn new(window_ms: u64) -> Self {
        Self {
            window_ms: window_ms.max(1),
            frames: VecDeque::new(),
        }
    }

    pub fn clear(&mut self) {
        self.frames.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.frames.is_empty()
    }

    pub fn len(&self) -> usize {
        self.frames.len()
    }

    pub fn span_ms(&self) -> u64 {
        match (self.frames.front(), self.frames.back()) {
            (Some(first), Some(last)) => last.at_ms.saturating_sub(first.at_ms),
            _ => 0,
        }
    }

    pub fn push(&mut self, frame: EncodedFrame) {
        if frame.jpeg.is_empty() || frame.width == 0 || frame.height == 0 {
            return;
        }
        if let Some(prev) = self.frames.back() {
            if prev.width != frame.width || prev.height != frame.height || frame.at_ms < prev.at_ms
            {
                self.frames.clear();
            }
        }
        let at = frame.at_ms;
        self.frames.push_back(frame);
        while self
            .frames
            .front()
            .is_some_and(|front| front.at_ms + self.window_ms < at)
        {
            self.frames.pop_front();
        }
    }

    /// Choose frames without encoding. The caller can drop the buffer lock first.
    pub fn plan(&self) -> Result<ClipPlan, String> {
        if self.frames.is_empty() {
            return Err("The clip buffer is empty.".into());
        }
        let selected = select_frames(&self.frames, CLIP_MAX_BYTES)?;
        let width = selected[0].width;
        let height = selected[0].height;
        let span_ms = selected
            .last()
            .unwrap()
            .at_ms
            .saturating_sub(selected[0].at_ms)
            .max(CLIP_SAMPLE_INTERVAL_MS);
        let fps = playback_fps(selected.len(), span_ms);
        Ok(ClipPlan {
            frames: selected.into_iter().cloned().collect(),
            fps,
            width,
            height,
            span_ms,
        })
    }

    pub fn export(&self) -> Result<ClipFile, String> {
        let plan = self.plan()?;
        let encoded = crate::clip_encode::encode_clip(&plan)?;
        Ok(ClipFile {
            frames: plan.frames.len() as u32,
            fps: plan.fps,
            width: encoded.width,
            height: encoded.height,
            span_ms: plan.span_ms,
            bytes: encoded.bytes,
        })
    }
}

impl Default for ClipBuffer {
    fn default() -> Self {
        Self::new(CLIP_WINDOW_MS)
    }
}

fn playback_fps(frames: usize, span_ms: u64) -> u32 {
    let frames = frames.max(1) as u64;
    let span = span_ms.max(1);
    let fps = (frames.saturating_mul(1000) + span / 2) / span;
    fps.clamp(1, 30) as u32
}

fn select_frames(
    frames: &VecDeque<EncodedFrame>,
    max_bytes: usize,
) -> Result<Vec<&EncodedFrame>, String> {
    let all: Vec<&EncodedFrame> = frames.iter().collect();
    let budget = max_bytes.saturating_sub(8 * 1024);
    let mut step = 1usize;
    loop {
        let mut picked: Vec<&EncodedFrame> = all
            .iter()
            .copied()
            .enumerate()
            .filter(|(index, _)| index % step == 0)
            .map(|(_, frame)| frame)
            .collect();
        if let Some(last) = all.last().copied() {
            if picked.last().map(|frame| frame.at_ms) != Some(last.at_ms) {
                picked.push(last);
            }
        }
        let payload: usize = picked.iter().map(|frame| frame.jpeg.len() + 8).sum();
        if payload <= budget || step >= all.len() {
            if payload <= budget {
                return Ok(picked);
            }
            let last = *all.last().unwrap();
            if last.jpeg.len() + 8 <= budget {
                return Ok(vec![last]);
            }
            return Err("The clip is too large to save.".into());
        }
        step += 1;
    }
}

/// Scale so the long edge fits `max_edge`, then force even dimensions for the encoder.
pub fn fit_rgba(
    src: &[u8],
    width: u32,
    height: u32,
    max_edge: u32,
) -> Result<(Vec<u8>, u32, u32), String> {
    let pixels = width as usize * height as usize;
    if width == 0 || height == 0 || max_edge < 2 || src.len() != pixels.saturating_mul(4) {
        return Err("Frame size does not match its pixels.".into());
    }
    let long = width.max(height);
    let (mut out_w, mut out_h) = if long <= max_edge {
        (width, height)
    } else {
        let scale = max_edge as f32 / long as f32;
        (
            ((width as f32 * scale).round() as u32).max(2),
            ((height as f32 * scale).round() as u32).max(2),
        )
    };
    out_w = (out_w.max(2)) & !1;
    out_h = (out_h.max(2)) & !1;
    if out_w == width && out_h == height {
        return Ok((src.to_vec(), width, height));
    }
    let mut dst = vec![0u8; out_w as usize * out_h as usize * 4];
    for y in 0..out_h {
        let y0 = y * height / out_h;
        let y1 = ((y + 1) * height / out_h).max(y0 + 1).min(height);
        for x in 0..out_w {
            let x0 = x * width / out_w;
            let x1 = ((x + 1) * width / out_w).max(x0 + 1).min(width);
            let mut acc = [0u32; 4];
            let mut count = 0u32;
            for sy in y0..y1 {
                let row = sy as usize * width as usize;
                for sx in x0..x1 {
                    let index = (row + sx as usize) * 4;
                    for channel in 0..4 {
                        acc[channel] += src[index + channel] as u32;
                    }
                    count += 1;
                }
            }
            let index = (y as usize * out_w as usize + x as usize) * 4;
            for channel in 0..4 {
                dst[index + channel] = (acc[channel] / count.max(1)) as u8;
            }
        }
    }
    Ok((dst, out_w, out_h))
}

pub fn encode_rgba(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let (fitted, width, height) = fit_rgba(rgba, width, height, CLIP_MAX_EDGE)?;
    if width > u16::MAX as u32 || height > u16::MAX as u32 {
        return Err("Frame is too large to encode.".into());
    }
    let mut jpeg = Vec::new();
    Encoder::new(&mut jpeg, CLIP_JPEG_QUALITY)
        .encode(&fitted, width as u16, height as u16, ColorType::Rgba)
        .map_err(|err| err.to_string())?;
    if jpeg.len() < 4 || jpeg[0] != 0xff || jpeg[1] != 0xd8 {
        return Err("Encoder did not write a JPEG.".into());
    }
    Ok(jpeg)
}

pub fn prepare_frame(
    rgba: &[u8],
    width: u32,
    height: u32,
    at_ms: u64,
) -> Result<EncodedFrame, String> {
    let (fitted, width, height) = fit_rgba(rgba, width, height, CLIP_MAX_EDGE)?;
    let jpeg = encode_fitted(&fitted, width, height)?;
    Ok(EncodedFrame {
        at_ms,
        width,
        height,
        jpeg,
    })
}

fn encode_fitted(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut jpeg = Vec::new();
    Encoder::new(&mut jpeg, CLIP_JPEG_QUALITY)
        .encode(rgba, width as u16, height as u16, ColorType::Rgba)
        .map_err(|err| err.to_string())?;
    Ok(jpeg)
}

/// `mod+shift+c` becomes `CommandOrControl+Shift+C`, which is Command on macOS and Ctrl on Windows.
/// A global hotkey must include a modifier, or be a function key, so it does not swallow typing.
pub fn global_accelerator(shortcut: &str) -> Result<String, String> {
    let accel = parse_shortcut(shortcut)?;
    let key = accelerator_key(&accel.key);
    let modified = accel.mod_key || accel.ctrl || accel.alt || accel.shift || accel.meta;
    let function =
        key.starts_with('F') && key.len() > 1 && key[1..].chars().all(|c| c.is_ascii_digit());
    if !modified && !function {
        return Err(
            "The clip hotkey needs a modifier, or a function key, because it is global.".into(),
        );
    }
    let mut parts = Vec::new();
    if accel.mod_key {
        parts.push("CommandOrControl".to_string());
    }
    if accel.ctrl {
        parts.push("Control".to_string());
    }
    if accel.alt {
        parts.push("Alt".to_string());
    }
    if accel.shift {
        parts.push("Shift".to_string());
    }
    if accel.meta {
        parts.push("Super".to_string());
    }
    parts.push(key);
    Ok(parts.join("+"))
}

fn accelerator_key(key: &str) -> String {
    match key {
        "comma" => "Comma".into(),
        "escape" => "Escape".into(),
        "enter" => "Enter".into(),
        "arrowup" => "ArrowUp".into(),
        "arrowdown" => "ArrowDown".into(),
        "arrowleft" => "ArrowLeft".into(),
        "arrowright" => "ArrowRight".into(),
        "tab" => "Tab".into(),
        "space" => "Space".into(),
        "backspace" => "Backspace".into(),
        "slash" => "Slash".into(),
        "period" => "Period".into(),
        "minus" => "Minus".into(),
        "equal" => "Equal".into(),
        "bracketleft" => "BracketLeft".into(),
        "bracketright" => "BracketRight".into(),
        "quote" => "Quote".into(),
        "semicolon" => "Semicolon".into(),
        "backslash" => "Backslash".into(),
        "backquote" => "Backquote".into(),
        other if other.len() == 1 => other.to_ascii_uppercase(),
        other => {
            let mut chars = other.chars();
            match chars.next() {
                Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
                None => other.to_string(),
            }
        }
    }
}

pub fn clip_file_name(unix_secs: u64) -> String {
    let (year, month, day, hour, minute, second) = civil_utc(unix_secs);
    format!("lark-clip-{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}Z.mp4")
}

/// New clips are `.mp4`. Older `.avi` names still attach.
pub fn is_clip_name(name: &str) -> bool {
    let extension = name.ends_with(".mp4") || name.ends_with(".avi");
    name.starts_with("lark-clip-")
        && extension
        && name.len() < 80
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
}

fn civil_utc(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let tod = secs % 86_400;
    let hour = (tod / 3600) as u32;
    let minute = ((tod % 3600) / 60) as u32;
    let second = (tod % 60) as u32;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = (if month <= 2 { y + 1 } else { y }) as i32;
    (year, month, day, hour, minute, second)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(width: u32, height: u32, pixel: [u8; 4]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(width as usize * height as usize * 4);
        for _ in 0..width * height {
            bytes.extend_from_slice(&pixel);
        }
        bytes
    }

    #[test]
    fn buffer_keeps_about_thirty_seconds() {
        let mut buffer = ClipBuffer::new(CLIP_WINDOW_MS);
        for at in [0, 10_000, 20_000, 30_000, 40_000] {
            buffer.push(EncodedFrame {
                at_ms: at,
                width: 2,
                height: 2,
                jpeg: vec![0xff, 0xd8, 0xff, 0xd9],
            });
        }
        let stamps: Vec<u64> = buffer.frames.iter().map(|frame| frame.at_ms).collect();
        assert_eq!(stamps, vec![10_000, 20_000, 30_000, 40_000]);
        assert_eq!(buffer.span_ms(), 30_000);
    }

    #[test]
    fn a_display_change_restarts_the_buffer() {
        let mut buffer = ClipBuffer::default();
        buffer.push(EncodedFrame {
            at_ms: 0,
            width: 2,
            height: 2,
            jpeg: vec![1],
        });
        buffer.push(EncodedFrame {
            at_ms: 200,
            width: 4,
            height: 2,
            jpeg: vec![2],
        });
        assert_eq!(buffer.len(), 1);
        assert_eq!(buffer.frames[0].width, 4);
    }

    #[test]
    fn export_is_a_faststart_mp4_under_the_attach_limit() {
        let rgba = solid(4, 2, [20, 40, 80, 255]);
        let mut buffer = ClipBuffer::default();
        for index in 0..8 {
            buffer.push(prepare_frame(&rgba, 4, 2, index * CLIP_SAMPLE_INTERVAL_MS).unwrap());
        }
        let clip = buffer.export().unwrap();
        assert_eq!(&clip.bytes[4..8], b"ftyp");
        assert!(crate::mp4mux::moov_before_mdat(&clip.bytes));
        crate::mp4mux::require_discord_mp4(&clip.bytes).unwrap();
        assert!(clip.bytes.len() < 8 * 1024 * 1024);
        assert_eq!(clip.frames, 8);
        assert_eq!(clip.width % 16, 0);
        assert_eq!(clip.height % 16, 0);
    }

    #[test]
    fn a_busy_buffer_is_thinned_to_stay_attachable() {
        let mut buffer = ClipBuffer::new(CLIP_WINDOW_MS);
        let jpeg = vec![0xab; 1_000_000];
        for index in 0..20 {
            buffer.push(EncodedFrame {
                at_ms: index * 1_000,
                width: 320,
                height: 180,
                jpeg: jpeg.clone(),
            });
        }
        let plan = buffer.plan().unwrap();
        let payload: usize = plan.frames.iter().map(|frame| frame.jpeg.len()).sum();
        assert!(payload <= CLIP_MAX_BYTES);
        assert!(plan.frames.len() < 20);
        assert!(plan.span_ms >= 19_000);
    }

    #[test]
    fn fit_shrinks_the_long_edge_and_stays_even() {
        let src = solid(100, 40, [1, 2, 3, 255]);
        let (dst, width, height) = fit_rgba(&src, 100, 40, 50).unwrap();
        assert_eq!((width, height), (50, 20));
        assert_eq!(dst.len(), 50 * 20 * 4);
        assert!(width % 2 == 0 && height % 2 == 0);
    }

    #[test]
    fn jpeg_starts_with_the_soi_marker() {
        let jpeg = encode_rgba(&solid(2, 2, [255, 0, 0, 255]), 2, 2).unwrap();
        assert_eq!(&jpeg[..2], &[0xff, 0xd8]);
        assert_eq!(&jpeg[jpeg.len() - 2..], &[0xff, 0xd9]);
    }

    #[test]
    fn accelerator_uses_the_portable_mod_key() {
        assert_eq!(
            global_accelerator("mod+shift+c").unwrap(),
            "CommandOrControl+Shift+C"
        );
        assert_eq!(global_accelerator("ctrl+alt+c").unwrap(), "Control+Alt+C");
        assert_eq!(global_accelerator("f8").unwrap(), "F8");
        assert!(global_accelerator("c").is_err());
        assert!(global_accelerator("backquote").is_err());
    }

    #[test]
    fn clip_names_are_utc_and_cannot_escape_the_folder() {
        assert_eq!(clip_file_name(0), "lark-clip-19700101-000000Z.mp4");
        assert_eq!(
            clip_file_name(1_700_000_000),
            "lark-clip-20231114-221320Z.mp4"
        );
        assert!(is_clip_name(&clip_file_name(0)));
        assert!(is_clip_name("lark-clip-19700101-000000Z.avi"));
        assert!(!is_clip_name("../lark-clip-19700101-000000Z.mp4"));
        assert!(!is_clip_name("lark-clip-19700101-000000Z.mov"));
        assert!(!is_clip_name("notes.avi"));
    }
}
