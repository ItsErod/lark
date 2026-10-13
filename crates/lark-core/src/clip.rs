//! Local screen clips.
//!
//! Lark does not ask the operating system for "the last 30 seconds." macOS has no
//! replay-buffer API, and Windows Game Bar does not hand its buffer to other apps.
//! While screen share or Game Mode capture is on, the desktop shell records the main
//! display. The hardware path keeps encoded packets in [`crate::clip_rate`]. This
//! JPEG ring is the fallback when that capture cannot start. The clip hotkey writes
//! a faststart MP4. Turning both modes off discards the ring. Nothing here uploads.

pub use crate::clip_encode::{encode_clip, EncodedClip};

use std::collections::VecDeque;

use jpeg_encoder::{ColorType, Encoder};

use crate::config::parse_shortcut;

/// How long a clip can reach back.
pub const CLIP_WINDOW_MS: u64 = 30_000;
/// Samples while a capture mode is on. The fallback ring stays small; send-time compression handles the upload limit.
pub const CLIP_SAMPLE_INTERVAL_MS: u64 = 200;
/// Longest edge of a stored frame, in pixels.
pub const CLIP_MAX_EDGE: u32 = 960;
/// JPEG quality for stored frames. The fallback ring stays bounded in memory.
pub const CLIP_JPEG_QUALITY: u8 = 45;
/// JPEG payload kept for the fallback ring. Upload size is decided when the clip is sent.
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

    pub fn set_window(&mut self, window_ms: u64) {
        self.window_ms = window_ms.max(1_000);
        if let Some(last) = self.frames.back().map(|frame| frame.at_ms) {
            while self
                .frames
                .front()
                .is_some_and(|front| front.at_ms + self.window_ms < last)
            {
                self.frames.pop_front();
            }
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
    clip_file_name_for(unix_secs, None)
}

/// `lark-clip-{game}-{stamp}.mp4` when a game is in front. The slug stays inside the clip name rules.
pub fn clip_file_name_for(unix_secs: u64, game: Option<&str>) -> String {
    let (year, month, day, hour, minute, second) = civil_utc(unix_secs);
    let stamp = format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}Z");
    match game.and_then(clip_slug) {
        Some(slug) => format!("lark-clip-{slug}-{stamp}.mp4"),
        None => format!("lark-clip-{stamp}.mp4"),
    }
}

/// Canonical clip title for a foreground process. Overwatch is saved as Overwatch 2.
pub fn clip_game_label(name: &str) -> Option<String> {
    let detected = crate::hardware::pick_game(Some(name), &[name.to_string()])?;
    Some(match detected.as_str() {
        "Overwatch" => "Overwatch 2".to_string(),
        other => other.to_string(),
    })
}

fn clip_slug(label: &str) -> Option<String> {
    let mut slug = String::new();
    let mut dash = false;
    for ch in label.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() { None } else { Some(slug) }
}

/// New clips are `.mp4`. Older `.avi` names still attach.
pub fn is_clip_name(name: &str) -> bool {
    let ext = clip_extension(name);
    (ext == "avi" || ext == "mp4")
        && name.starts_with("lark-clip-")
        && name.len() < 120
        && !name.contains("..")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
}

pub fn clip_extension(name: &str) -> &str {
    name.rsplit('.').next().unwrap_or("")
}

/// A saved clip the library can show. Poster is the first JPEG inside an MJPEG AVI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedClipInfo {
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub poster_jpeg: Vec<u8>,
}

pub fn inspect_saved_clip(bytes: &[u8]) -> SavedClipInfo {
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"AVI ") {
        return inspect_avi(bytes);
    }
    if let Some(duration_ms) = mp4_duration_ms(bytes) {
        return SavedClipInfo {
            duration_ms,
            width: 0,
            height: 0,
            poster_jpeg: Vec::new(),
        };
    }
    SavedClipInfo {
        duration_ms: 0,
        width: 0,
        height: 0,
        poster_jpeg: Vec::new(),
    }
}

/// Keep an MJPEG AVI's frames between `start_ms` and `end_ms`. MP4 trim uses ffmpeg.
pub fn trim_saved_clip(bytes: &[u8], start_ms: u64, end_ms: u64) -> Result<Vec<u8>, String> {
    if end_ms <= start_ms {
        return Err("The trim end has to be after the start.".into());
    }
    if !(bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"AVI ")) {
        return Err("This clip needs ffmpeg to trim.".into());
    }
    let info = inspect_avi(bytes);
    let frames = avi_frames(bytes)?;
    if frames.is_empty() {
        return Err("That clip has no frames to trim.".into());
    }
    let frame_ms = if info.duration_ms == 0 {
        CLIP_SAMPLE_INTERVAL_MS
    } else {
        (info.duration_ms / frames.len() as u64).max(1)
    };
    let picked: Vec<&EncodedFrame> = frames
        .iter()
        .enumerate()
        .filter(|(index, _)| {
            let at = *index as u64 * frame_ms;
            at >= start_ms && at < end_ms
        })
        .map(|(_, frame)| frame)
        .collect();
    let picked = if picked.is_empty() {
        vec![frames.last().unwrap()]
    } else {
        picked
    };
    let width = info.width.max(picked[0].width).max(2);
    let height = info.height.max(picked[0].height).max(2);
    let span = (picked.len() as u64 * frame_ms).max(1);
    let fps = playback_fps(picked.len(), span);
    Ok(write_mjpeg_avi(&picked, fps, width, height))
}

fn inspect_avi(bytes: &[u8]) -> SavedClipInfo {
    let mut duration_ms = 0u64;
    let mut width = 0u32;
    let mut height = 0u32;
    let mut poster = Vec::new();
    if let Some(at) = find_tag(bytes, b"avih") {
        let base = at + 8;
        if bytes.len() >= base + 40 {
            let micro = u32::from_le_bytes(bytes[base..base + 4].try_into().unwrap());
            let frames = u32::from_le_bytes(bytes[base + 16..base + 20].try_into().unwrap());
            width = u32::from_le_bytes(bytes[base + 32..base + 36].try_into().unwrap());
            height = u32::from_le_bytes(bytes[base + 36..base + 40].try_into().unwrap());
            duration_ms = (u64::from(micro) * u64::from(frames.max(1))) / 1000;
        }
    }
    if let Ok(frames) = avi_frames(bytes) {
        if let Some(first) = frames.first() {
            if width == 0 {
                width = first.width;
            }
            if height == 0 {
                height = first.height;
            }
            poster = first.jpeg.clone();
        }
        if duration_ms == 0 && !frames.is_empty() {
            duration_ms = frames.len() as u64 * CLIP_SAMPLE_INTERVAL_MS;
        }
    }
    SavedClipInfo {
        duration_ms,
        width,
        height,
        poster_jpeg: poster,
    }
}

fn avi_frames(bytes: &[u8]) -> Result<Vec<EncodedFrame>, String> {
    let movi = find_tag(bytes, b"movi").ok_or_else(|| "That clip is not a readable AVI.".to_string())?;
    let mut cursor = movi + 4;
    let end = find_tag(bytes, b"idx1").unwrap_or(bytes.len());
    let mut frames = Vec::new();
    while cursor + 8 <= end && cursor + 8 <= bytes.len() {
        let tag = &bytes[cursor..cursor + 4];
        let size = u32::from_le_bytes(bytes[cursor + 4..cursor + 8].try_into().unwrap()) as usize;
        let payload = cursor + 8;
        let next = payload + size + (size % 2);
        if next > bytes.len() {
            break;
        }
        if tag == b"00dc" && size >= 2 && bytes.get(payload..payload + 2) == Some(&[0xff, 0xd8]) {
            frames.push(EncodedFrame {
                at_ms: frames.len() as u64 * CLIP_SAMPLE_INTERVAL_MS,
                width: 0,
                height: 0,
                jpeg: bytes[payload..payload + size].to_vec(),
            });
        }
        cursor = next;
    }
    Ok(frames)
}

fn find_tag(bytes: &[u8], tag: &[u8; 4]) -> Option<usize> {
    bytes.windows(4).position(|window| window == tag)
}

/// Duration from an MP4 `mvhd` box, when the file has one.
pub fn mp4_duration_ms(bytes: &[u8]) -> Option<u64> {
    fn walk_range(bytes: &[u8], start: usize, end: usize) -> Option<u64> {
        let mut cursor = start;
        while cursor + 8 <= end && cursor + 8 <= bytes.len() {
            let mut size = u32::from_be_bytes(bytes[cursor..cursor + 4].try_into().ok()?) as usize;
            let kind = &bytes[cursor + 4..cursor + 8];
            let mut header = 8usize;
            if size == 1 {
                if cursor + 16 > bytes.len() {
                    return None;
                }
                size = u64::from_be_bytes(bytes[cursor + 8..cursor + 16].try_into().ok()?) as usize;
                header = 16;
            } else if size == 0 {
                size = end.saturating_sub(cursor);
            }
            if size < header || cursor.saturating_add(size) > end {
                return None;
            }
            let body = cursor + header;
            let box_end = cursor + size;
            if kind == b"mvhd" {
                return mvhd_duration_ms(&bytes[body..box_end]);
            }
            if kind == b"moov" || kind == b"trak" || kind == b"mdia" {
                if let Some(found) = walk_range(bytes, body, box_end) {
                    return Some(found);
                }
            }
            cursor = box_end;
        }
        None
    }
    if bytes.len() < 16 {
        return None;
    }
    walk_range(bytes, 0, bytes.len())
}

fn mvhd_duration_ms(body: &[u8]) -> Option<u64> {
    let version = *body.first()?;
    if version == 0 {
        if body.len() < 20 {
            return None;
        }
        let timescale = u32::from_be_bytes(body[12..16].try_into().ok()?) as u64;
        let duration = u32::from_be_bytes(body[16..20].try_into().ok()?) as u64;
        if timescale == 0 {
            return None;
        }
        return Some(duration.saturating_mul(1000) / timescale);
    }
    if body.len() < 32 {
        return None;
    }
    let timescale = u32::from_be_bytes(body[20..24].try_into().ok()?) as u64;
    let duration = u64::from_be_bytes(body[24..32].try_into().ok()?);
    if timescale == 0 {
        return None;
    }
    Some(duration.saturating_mul(1000) / timescale)
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

/// Rewrite a subset of MJPEG frames. New clips are MP4; this is only for older AVI trims.
fn write_mjpeg_avi(frames: &[&EncodedFrame], fps: u32, width: u32, height: u32) -> Vec<u8> {
    let fps = fps.max(1);
    let count = frames.len() as u32;
    let max_frame = frames
        .iter()
        .map(|frame| frame.jpeg.len())
        .max()
        .unwrap_or(0) as u32;
    let mut out = Vec::with_capacity(
        4096 + frames
            .iter()
            .map(|frame| frame.jpeg.len() + 8)
            .sum::<usize>(),
    );
    out.extend_from_slice(b"RIFF");
    let riff_size_at = out.len();
    push_u32(&mut out, 0);
    out.extend_from_slice(b"AVI ");

    out.extend_from_slice(b"LIST");
    let hdrl_size_at = out.len();
    push_u32(&mut out, 0);
    let hdrl_data = out.len();
    out.extend_from_slice(b"hdrl");
    out.extend_from_slice(b"avih");
    push_u32(&mut out, 56);
    push_u32(&mut out, 1_000_000 / fps);
    push_u32(&mut out, max_frame.saturating_mul(fps));
    push_u32(&mut out, 0);
    push_u32(&mut out, 0x110);
    push_u32(&mut out, count);
    push_u32(&mut out, 0);
    push_u32(&mut out, 1);
    push_u32(&mut out, max_frame);
    push_u32(&mut out, width);
    push_u32(&mut out, height);
    for _ in 0..4 {
        push_u32(&mut out, 0);
    }

    out.extend_from_slice(b"LIST");
    let strl_size_at = out.len();
    push_u32(&mut out, 0);
    let strl_data = out.len();
    out.extend_from_slice(b"strl");
    out.extend_from_slice(b"strh");
    push_u32(&mut out, 56);
    out.extend_from_slice(b"vids");
    out.extend_from_slice(b"MJPG");
    push_u32(&mut out, 0);
    push_u16(&mut out, 0);
    push_u16(&mut out, 0);
    push_u32(&mut out, 0);
    push_u32(&mut out, 1);
    push_u32(&mut out, fps);
    push_u32(&mut out, 0);
    push_u32(&mut out, count);
    push_u32(&mut out, max_frame);
    push_u32(&mut out, u32::MAX);
    push_u32(&mut out, 0);
    push_i16(&mut out, 0);
    push_i16(&mut out, 0);
    push_i16(&mut out, width.min(i16::MAX as u32) as i16);
    push_i16(&mut out, height.min(i16::MAX as u32) as i16);
    out.extend_from_slice(b"strf");
    push_u32(&mut out, 40);
    push_u32(&mut out, 40);
    push_i32(&mut out, width as i32);
    push_i32(&mut out, height as i32);
    push_u16(&mut out, 1);
    push_u16(&mut out, 24);
    out.extend_from_slice(b"MJPG");
    push_u32(&mut out, max_frame);
    push_i32(&mut out, 0);
    push_i32(&mut out, 0);
    push_u32(&mut out, 0);
    push_u32(&mut out, 0);
    let strl_size = (out.len() - strl_data) as u32;
    let hdrl_size = (out.len() - hdrl_data) as u32;
    patch_u32(&mut out, strl_size_at, strl_size);
    patch_u32(&mut out, hdrl_size_at, hdrl_size);

    out.extend_from_slice(b"LIST");
    let movi_size_at = out.len();
    push_u32(&mut out, 0);
    let movi_tag = out.len();
    out.extend_from_slice(b"movi");
    let mut index = Vec::with_capacity(frames.len());
    for frame in frames {
        let chunk_at = out.len();
        index.push((chunk_at - (movi_tag + 4), frame.jpeg.len()));
        out.extend_from_slice(b"00dc");
        push_u32(&mut out, frame.jpeg.len() as u32);
        out.extend_from_slice(&frame.jpeg);
        if frame.jpeg.len() % 2 == 1 {
            out.push(0);
        }
    }
    let movi_size = (out.len() - (movi_size_at + 4)) as u32;
    patch_u32(&mut out, movi_size_at, movi_size);

    out.extend_from_slice(b"idx1");
    push_u32(&mut out, (index.len() * 16) as u32);
    for (offset, size) in index {
        out.extend_from_slice(b"00dc");
        push_u32(&mut out, 0x10);
        push_u32(&mut out, offset as u32);
        push_u32(&mut out, size as u32);
    }
    let riff_size = (out.len() - 8) as u32;
    patch_u32(&mut out, riff_size_at, riff_size);
    out
}

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_i16(out: &mut Vec<u8>, value: i16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_i32(out: &mut Vec<u8>, value: i32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn patch_u32(out: &mut [u8], at: usize, value: u32) {
    out[at..at + 4].copy_from_slice(&value.to_le_bytes());
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
            clip_file_name_for(0, Some("Overwatch 2")),
            "lark-clip-overwatch-2-19700101-000000Z.mp4"
        );
        assert!(is_clip_name(&clip_file_name_for(0, Some("Grand Theft Auto V"))));
        assert_eq!(clip_game_label("Overwatch.exe").as_deref(), Some("Overwatch 2"));
        assert_eq!(clip_game_label("deadlock.exe").as_deref(), Some("Deadlock"));
        assert_eq!(clip_game_label("cod.exe").as_deref(), Some("Call of Duty"));
        assert_eq!(clip_game_label("GTA5.exe").as_deref(), Some("Grand Theft Auto V"));
        assert_eq!(clip_game_label("Lark"), None);
        assert_eq!(
            clip_file_name(1_700_000_000),
            "lark-clip-20231114-221320Z.mp4"
        );
        assert!(is_clip_name(&clip_file_name(0)));
        assert!(is_clip_name("lark-clip-19700101-000000Z.avi"));
        assert!(is_clip_name("lark-clip-19700101-000000Z.mp4"));
        assert!(is_clip_name("lark-clip-19700101-000000Z-fit.mp4"));
        assert!(!is_clip_name("../lark-clip-19700101-000000Z.mp4"));
        assert!(!is_clip_name("../lark-clip-19700101-000000Z.avi"));
        assert!(!is_clip_name("lark-clip-19700101-000000Z.mov"));
        assert!(!is_clip_name("lark-clip-19700101-000000Z.webm"));
        assert!(!is_clip_name("notes.avi"));
    }

    #[test]
    fn saved_avi_reports_duration_poster_and_trims_without_the_original_frames() {
        let rgba = solid(4, 2, [20, 40, 80, 255]);
        let frames: Vec<EncodedFrame> = (0..6)
            .map(|index| prepare_frame(&rgba, 4, 2, index * CLIP_SAMPLE_INTERVAL_MS).unwrap())
            .collect();
        let refs: Vec<&EncodedFrame> = frames.iter().collect();
        let bytes = write_mjpeg_avi(&refs, 5, 4, 2);
        let info = inspect_saved_clip(&bytes);
        assert_eq!(info.width, 4);
        assert_eq!(info.height, 2);
        assert!(info.duration_ms > 0);
        assert!(info.poster_jpeg.starts_with(&[0xff, 0xd8]));
        let trimmed = trim_saved_clip(&bytes, 400, 1_000).unwrap();
        let again = inspect_saved_clip(&trimmed);
        assert!(again.duration_ms < info.duration_ms);
        assert!(again.poster_jpeg.starts_with(&[0xff, 0xd8]));
        assert!(trim_saved_clip(&bytes, 5_000, 1_000).is_err());
    }

    #[test]
    fn mp4_duration_reads_mvhd() {
        let mut bytes = Vec::new();
        // ftyp box, 16 bytes
        bytes.extend_from_slice(&16u32.to_be_bytes());
        bytes.extend_from_slice(b"ftyp");
        bytes.extend_from_slice(b"isom");
        bytes.extend_from_slice(&0u32.to_be_bytes());
        // moov > mvhd version 0, timescale 1000, duration 12500
        let mut mvhd = vec![0u8; 4 + 100];
        mvhd[12..16].copy_from_slice(&1000u32.to_be_bytes());
        mvhd[16..20].copy_from_slice(&12_500u32.to_be_bytes());
        let mut moov = Vec::new();
        moov.extend_from_slice(&((8 + mvhd.len()) as u32).to_be_bytes());
        moov.extend_from_slice(b"mvhd");
        moov.extend_from_slice(&mvhd);
        bytes.extend_from_slice(&((8 + moov.len()) as u32).to_be_bytes());
        bytes.extend_from_slice(b"moov");
        bytes.extend_from_slice(&moov);
        assert_eq!(mp4_duration_ms(&bytes), Some(12_500));
    }
}
