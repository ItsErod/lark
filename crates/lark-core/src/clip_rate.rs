//! High-frame-rate clip capture plan.
//!
//! The desktop shell captures with the GPU (Windows Graphics Capture or DXGI on
//! Windows, ScreenCaptureKit on macOS) and feeds a hardware encoder. This module
//! decides the size, rate, codec, and bitrate, and it keeps the encoded packets
//! for the last 30 seconds. Saving remuxes those packets. It does not keep raw frames.

use std::collections::VecDeque;

use crate::mp4mux::{self, EncodedVideo};

/// How long the encoded ring reaches back.
pub const CLIP_WINDOW_MS: u64 = 30_000;
/// Encoded payload kept for that window. A 30 second clip at the highest bitrate fits.
pub const RING_BUDGET_BYTES: usize = 192 * 1024 * 1024;
/// Media timescale for encoded clip samples. Divides 60, 120, and 240 evenly.
pub const CLIP_TIMESCALE: u32 = 90_000;

pub const FPS_OPTIONS: [u32; 3] = [60, 120, 240];
pub const RESOLUTION_OPTIONS: [u32; 4] = [720, 1080, 1440, 2160];
pub const DEFAULT_FPS: u32 = 60;
pub const DEFAULT_RESOLUTION: u32 = 1440;

/// 1440p at 240 fps. Hardware HEVC on NVENC, AMF, and VideoToolbox is modeled to hold this.
pub const HEVC_PIXELS_PER_SEC: u64 = 2560 * 1440 * 240;
/// 1080p at 120 fps. H.264 hardware is modeled to hold this, and not 1440p at 240.
pub const H264_PIXELS_PER_SEC: u64 = 1920 * 1080 * 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodec {
    H264,
    Hevc,
}

impl VideoCodec {
    pub fn label(self) -> &'static str {
        match self {
            Self::H264 => "H.264",
            Self::Hevc => "HEVC",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncoderKind {
    Nvenc,
    Amf,
    Qsv,
    VideoToolbox,
    Unavailable,
}

impl EncoderKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Nvenc => "NVENC",
            Self::Amf => "AMF",
            Self::Qsv => "Quick Sync",
            Self::VideoToolbox => "VideoToolbox",
            Self::Unavailable => "unavailable",
        }
    }

    pub fn parse(name: &str) -> Self {
        match name {
            "nvenc" => Self::Nvenc,
            "amf" => Self::Amf,
            "qsv" => Self::Qsv,
            "videotoolbox" => Self::VideoToolbox,
            _ => Self::Unavailable,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClipRequest {
    pub fps: u32,
    pub resolution: u32,
}

impl Default for ClipRequest {
    fn default() -> Self {
        Self {
            fps: DEFAULT_FPS,
            resolution: DEFAULT_RESOLUTION,
        }
    }
}

impl ClipRequest {
    pub fn new(fps: u32, resolution: u32) -> Self {
        Self {
            fps: snap_fps(fps),
            resolution: snap_resolution(resolution),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DisplayCaps {
    pub width: u32,
    pub height: u32,
    pub refresh_hz: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EncoderCaps {
    pub kind: EncoderKind,
    pub hevc: bool,
    pub h264: bool,
}

impl EncoderCaps {
    pub fn unavailable() -> Self {
        Self {
            kind: EncoderKind::Unavailable,
            hevc: false,
            h264: false,
        }
    }
}

/// What the capture thread should actually open.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedCapture {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub codec: VideoCodec,
    pub bitrate: u32,
    pub hardware: bool,
    pub note: String,
}

/// Queue depth and thread priority while a game is in front.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapturePace {
    /// Frames the capture system may hold. Game Mode keeps one so raw frames do not pile up.
    pub queue_depth: u32,
    /// The capture thread sits below the game.
    pub below_normal: bool,
}

pub fn capture_pace(game_mode: bool) -> CapturePace {
    if game_mode {
        CapturePace {
            queue_depth: 1,
            below_normal: true,
        }
    } else {
        CapturePace {
            queue_depth: 2,
            below_normal: false,
        }
    }
}

pub fn snap_fps(value: u32) -> u32 {
    match value {
        120 => 120,
        240 => 240,
        _ => 60,
    }
}

pub fn snap_resolution(value: u32) -> u32 {
    match value {
        720 => 720,
        1080 => 1080,
        2160 => 2160,
        _ => 1440,
    }
}

pub fn preset_size(resolution: u32) -> (u32, u32) {
    match snap_resolution(resolution) {
        720 => (1280, 720),
        1080 => (1920, 1080),
        2160 => (3840, 2160),
        _ => (2560, 1440),
    }
}

pub fn frame_duration_ticks(fps: u32) -> u32 {
    CLIP_TIMESCALE / fps.max(1)
}

/// Fit the display inside the preset box. Never upscales. Dimensions stay even.
pub fn fit_inside(box_w: u32, box_h: u32, src_w: u32, src_h: u32) -> (u32, u32) {
    if src_w < 2 || src_h < 2 || box_w < 2 || box_h < 2 {
        return (even(box_w.max(2)), even(box_h.max(2)));
    }
    let scale = (box_w as f64 / src_w as f64)
        .min(box_h as f64 / src_h as f64)
        .min(1.0);
    (
        even(((src_w as f64) * scale).round() as u32).max(2),
        even(((src_h as f64) * scale).round() as u32).max(2),
    )
}

fn even(value: u32) -> u32 {
    (value.max(2)) & !1
}

pub fn pixel_budget(kind: EncoderKind, hevc: bool) -> u64 {
    match (kind, hevc) {
        (EncoderKind::Nvenc | EncoderKind::Amf | EncoderKind::VideoToolbox, true) => {
            HEVC_PIXELS_PER_SEC
        }
        (EncoderKind::Qsv, true) => 2560 * 1440 * 120,
        (EncoderKind::Nvenc | EncoderKind::Amf | EncoderKind::VideoToolbox, false) => {
            H264_PIXELS_PER_SEC
        }
        (EncoderKind::Qsv, false) => 1920 * 1080 * 60,
        (EncoderKind::Unavailable, _) => 0,
    }
}

/// Bits per second for the resolved size. HEVC at 1440p240 stays inside the ring budget.
pub fn bitrate_for(codec: VideoCodec, height: u32, fps: u32) -> u32 {
    let hevc = codec == VideoCodec::Hevc;
    let base: u32 = match height {
        0..=800 => {
            if hevc {
                6_000_000
            } else {
                8_000_000
            }
        }
        801..=1200 => {
            if hevc {
                12_000_000
            } else {
                16_000_000
            }
        }
        1201..=1600 => {
            if hevc {
                20_000_000
            } else {
                30_000_000
            }
        }
        _ => {
            if hevc {
                36_000_000
            } else {
                50_000_000
            }
        }
    };
    let scaled = match fps {
        0..=60 => base,
        61..=120 => base + base / 2,
        _ => base.saturating_mul(2),
    };
    let max = ((RING_BUDGET_BYTES as u64).saturating_mul(8) / 30) as u32;
    scaled.clamp(1_000_000, max.max(1_000_000))
}

pub fn cap_fps(requested: u32, limit: u32) -> u32 {
    let requested = snap_fps(requested);
    if limit == 0 || limit >= requested {
        return requested;
    }
    if let Some(fps) = FPS_OPTIONS.into_iter().rev().find(|fps| *fps <= limit) {
        return fps;
    }
    limit.clamp(15, 59)
}

pub fn step_down_fps(fps: u32) -> Option<u32> {
    match fps {
        240 => Some(120),
        120 => Some(60),
        _ => None,
    }
}

/// Delivery over a window. If the encoder lands under 90% of the target, step down.
#[derive(Debug, Clone)]
pub struct RateWatch {
    target_fps: u32,
    window_ms: u64,
    frames: u64,
    started_ms: Option<u64>,
}

impl RateWatch {
    pub fn new(target_fps: u32) -> Self {
        Self {
            target_fps: target_fps.max(1),
            window_ms: 2_000,
            frames: 0,
            started_ms: None,
        }
    }

    pub fn reset(&mut self, target_fps: u32) {
        self.target_fps = target_fps.max(1);
        self.frames = 0;
        self.started_ms = None;
    }

    /// `produced` is true when an encoded frame was accepted. Returns a lower fps once
    /// the window shows the target is not being held.
    pub fn observe(&mut self, now_ms: u64, produced: bool) -> Option<u32> {
        let started = *self.started_ms.get_or_insert(now_ms);
        if produced {
            self.frames += 1;
        }
        let elapsed = now_ms.saturating_sub(started);
        if elapsed < self.window_ms {
            return None;
        }
        let delivered = (self.frames.saturating_mul(1000) / elapsed.max(1)) as u32;
        self.frames = 0;
        self.started_ms = Some(now_ms);
        let threshold = self.target_fps.saturating_mul(9) / 10;
        if delivered < threshold {
            return step_down_fps(self.target_fps);
        }
        None
    }
}

pub fn resolve_capture(
    request: ClipRequest,
    display: DisplayCaps,
    encoder: EncoderCaps,
    runtime_fps_cap: u32,
) -> ResolvedCapture {
    let request = ClipRequest::new(request.fps, request.resolution);
    let (preset_w, preset_h) = preset_size(request.resolution);
    let (mut width, mut height) = if display.width >= 2 && display.height >= 2 {
        fit_inside(preset_w, preset_h, display.width, display.height)
    } else {
        (preset_w, preset_h)
    };
    let mut notes = Vec::new();
    if display.width >= 2
        && display.height >= 2
        && (display.width < preset_w || display.height < preset_h)
    {
        notes.push(format!(
            "The display is {}×{}, so {} is capped to {}×{}.",
            display.width,
            display.height,
            resolution_label(request.resolution),
            width,
            height
        ));
    }

    let mut fps = request.fps;
    if display.refresh_hz > 0 && display.refresh_hz < fps {
        let capped = cap_fps(fps, display.refresh_hz);
        if capped < fps {
            notes.push(format!(
                "The display refreshes at {} Hz, so {} fps is capped to {} fps.",
                display.refresh_hz, fps, capped
            ));
            fps = capped;
        }
    }
    if runtime_fps_cap > 0 && runtime_fps_cap < fps {
        let capped = cap_fps(fps, runtime_fps_cap);
        if capped < fps {
            notes.push(format!(
                "The encoder could not hold {} fps, so Lark capped this to {} fps.",
                request.fps, capped
            ));
            fps = capped;
        }
    }

    let hardware = encoder.kind != EncoderKind::Unavailable && (encoder.hevc || encoder.h264);
    if !hardware {
        notes.push(
            "Hardware capture isn't available, so Lark is using the 5 fps, 960 pixel buffer."
                .into(),
        );
        return ResolvedCapture {
            width,
            height,
            fps,
            codec: VideoCodec::H264,
            bitrate: bitrate_for(VideoCodec::H264, height, fps),
            hardware: false,
            note: notes.join(" "),
        };
    }

    let pixels = u64::from(width) * u64::from(height);
    let hevc_budget = if encoder.hevc {
        pixel_budget(encoder.kind, true)
    } else {
        0
    };
    let h264_budget = if encoder.h264 {
        pixel_budget(encoder.kind, false)
    } else {
        0
    };
    let before_encoder = fps;
    fps = fps_within_budget(fps, pixels, hevc_budget, h264_budget);
    if fps < before_encoder {
        notes.push(format!(
            "{} at {} fps is more than this encoder can hold, so Lark is recording it at {} fps.",
            resolution_label(request.resolution),
            request.fps,
            fps
        ));
    }
    if pixels > 0 && hevc_budget == 0 && h264_budget > 0 {
        let max_pixels = h264_budget / u64::from(fps.max(1));
        if pixels > max_pixels {
            let (next_w, next_h) = shrink_to_budget(width, height, max_pixels);
            if next_w < width || next_h < height {
                notes.push(format!(
                    "This encoder cannot hold {}×{} at {} fps, so Lark is recording {}×{}.",
                    width, height, fps, next_w, next_h
                ));
                width = next_w;
                height = next_h;
            }
        }
    }

    let rate = u64::from(width) * u64::from(height) * u64::from(fps.max(1));
    let codec = if encoder.hevc && (hevc_budget == 0 || rate > h264_budget) {
        VideoCodec::Hevc
    } else if encoder.h264 {
        VideoCodec::H264
    } else {
        VideoCodec::Hevc
    };
    ResolvedCapture {
        bitrate: bitrate_for(codec, height, fps),
        width,
        height,
        fps,
        codec,
        hardware: true,
        note: notes.join(" "),
    }
}

fn fps_within_budget(fps: u32, pixels: u64, hevc_budget: u64, h264_budget: u64) -> u32 {
    if pixels == 0 {
        return fps;
    }
    let budget = hevc_budget.max(h264_budget);
    if budget == 0 {
        return fps;
    }
    let mut next = fps;
    while u64::from(next.max(1)).saturating_mul(pixels) > budget {
        match step_down_fps(next) {
            Some(lower) => next = lower,
            None => {
                let max_fps = (budget / pixels).max(1) as u32;
                return cap_fps(next, max_fps);
            }
        }
    }
    next
}

fn shrink_to_budget(width: u32, height: u32, max_pixels: u64) -> (u32, u32) {
    if max_pixels < 4 || width < 2 || height < 2 {
        return (width, height);
    }
    let pixels = u64::from(width) * u64::from(height);
    if pixels <= max_pixels {
        return (width, height);
    }
    let scale = (max_pixels as f64 / pixels as f64).sqrt();
    (
        even(((width as f64) * scale).floor() as u32).max(2),
        even(((height as f64) * scale).floor() as u32).max(2),
    )
}

pub fn resolution_label(resolution: u32) -> String {
    format!("{}p", snap_resolution(resolution))
}

pub fn hevc_level_idc(width: u32, height: u32, fps: u32) -> u8 {
    let rate = u64::from(width) * u64::from(height) * u64::from(fps.max(1));
    if rate <= 267_386_880 {
        150
    } else if rate <= 534_773_760 {
        153
    } else if rate <= 1_069_547_520 {
        156
    } else if rate <= 2_139_095_040 {
        183
    } else {
        186
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessUnit {
    pub pts_ms: u64,
    pub duration_ticks: u32,
    pub keyframe: bool,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct PacketRing {
    window_ms: u64,
    budget: usize,
    codec: VideoCodec,
    width: u32,
    height: u32,
    fps: u32,
    vps: Vec<u8>,
    sps: Vec<u8>,
    pps: Vec<u8>,
    packets: VecDeque<AccessUnit>,
    bytes: usize,
}

impl PacketRing {
    pub fn new(codec: VideoCodec, width: u32, height: u32, fps: u32) -> Self {
        Self::with_budget(codec, width, height, fps, RING_BUDGET_BYTES)
    }

    pub fn with_budget(
        codec: VideoCodec,
        width: u32,
        height: u32,
        fps: u32,
        budget: usize,
    ) -> Self {
        Self {
            window_ms: CLIP_WINDOW_MS,
            budget: budget.max(1),
            codec,
            width,
            height,
            fps: fps.max(1),
            vps: Vec::new(),
            sps: Vec::new(),
            pps: Vec::new(),
            packets: VecDeque::new(),
            bytes: 0,
        }
    }

    pub fn clear(&mut self) {
        self.packets.clear();
        self.bytes = 0;
    }

    pub fn is_empty(&self) -> bool {
        self.packets.is_empty()
    }

    pub fn len(&self) -> usize {
        self.packets.len()
    }

    pub fn stored_bytes(&self) -> usize {
        self.bytes
    }

    pub fn span_ms(&self) -> u64 {
        match (self.packets.front(), self.packets.back()) {
            (Some(first), Some(last)) => last.pts_ms.saturating_sub(first.pts_ms),
            _ => 0,
        }
    }

    pub fn set_parameter_sets(&mut self, vps: &[u8], sps: &[u8], pps: &[u8]) {
        if !vps.is_empty() {
            self.vps = vps.to_vec();
        }
        if !sps.is_empty() {
            self.sps = sps.to_vec();
        }
        if !pps.is_empty() {
            self.pps = pps.to_vec();
        }
    }

    pub fn push(&mut self, packet: AccessUnit) {
        if packet.data.is_empty() {
            return;
        }
        self.bytes = self.bytes.saturating_add(packet.data.len());
        self.packets.push_back(packet);
        self.evict();
    }

    fn evict(&mut self) {
        let newest = self.packets.back().map(|packet| packet.pts_ms).unwrap_or(0);
        while self.packets.len() > 1 {
            let front = self.packets.front().unwrap();
            let too_old = front.pts_ms + self.window_ms < newest;
            let over = self.bytes > self.budget;
            if !too_old && !over {
                break;
            }
            self.pop_front();
        }
        while self
            .packets
            .front()
            .is_some_and(|packet| !packet.keyframe && self.packets.len() > 1)
        {
            self.pop_front();
        }
        if self.packets.front().is_some_and(|packet| !packet.keyframe) {
            self.pop_front();
        }
    }

    fn pop_front(&mut self) {
        if let Some(packet) = self.packets.pop_front() {
            self.bytes = self.bytes.saturating_sub(packet.data.len());
        }
    }

    pub fn remux(&self) -> Result<RemuxedClip, String> {
        if self.packets.is_empty() {
            return Err("The clip buffer is empty.".into());
        }
        let samples: Vec<&[u8]> = self
            .packets
            .iter()
            .map(|packet| packet.data.as_slice())
            .collect();
        let sync: Vec<bool> = self.packets.iter().map(|packet| packet.keyframe).collect();
        let durations: Vec<u32> = self
            .packets
            .iter()
            .map(|packet| {
                if packet.duration_ticks == 0 {
                    frame_duration_ticks(self.fps)
                } else {
                    packet.duration_ticks
                }
            })
            .collect();
        let bytes = match self.codec {
            VideoCodec::H264 => {
                if self.sps.len() < 4 || self.pps.is_empty() {
                    return Err("The encoder did not write H.264 parameter sets.".into());
                }
                let entry = mp4mux::avc1_entry(self.width, self.height, &self.sps, &self.pps);
                mp4mux::mux_encoded(&EncodedVideo {
                    width: self.width,
                    height: self.height,
                    timescale: CLIP_TIMESCALE,
                    sample_entry: &entry,
                    samples: &samples,
                    sync: &sync,
                    durations: &durations,
                    hevc: false,
                })?
            }
            VideoCodec::Hevc => {
                if self.vps.is_empty() || self.sps.is_empty() || self.pps.is_empty() {
                    return Err("The encoder did not write HEVC parameter sets.".into());
                }
                let entry = mp4mux::hvc1_entry(
                    self.width,
                    self.height,
                    &self.vps,
                    &self.sps,
                    &self.pps,
                    hevc_level_idc(self.width, self.height, self.fps),
                );
                mp4mux::mux_encoded(&EncodedVideo {
                    width: self.width,
                    height: self.height,
                    timescale: CLIP_TIMESCALE,
                    sample_entry: &entry,
                    samples: &samples,
                    sync: &sync,
                    durations: &durations,
                    hevc: true,
                })?
            }
        };
        let span_ms = self.span_ms().max(u64::from(1000 / self.fps.max(1)));
        Ok(RemuxedClip {
            bytes,
            frames: self.packets.len() as u32,
            span_ms,
            width: self.width,
            height: self.height,
            fps: self.fps,
        })
    }
}

pub struct RemuxedClip {
    pub bytes: Vec<u8>,
    pub frames: u32,
    pub span_ms: u64,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

pub fn annexb_nals(bytes: &[u8]) -> Vec<&[u8]> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while cursor + 3 < bytes.len() {
        let prefix = start_code_len(&bytes[cursor..]);
        if prefix == 0 {
            cursor += 1;
            continue;
        }
        let nal_at = cursor + prefix;
        let mut next = nal_at;
        let mut found = bytes.len();
        while next + 3 < bytes.len() {
            if start_code_len(&bytes[next..]) > 0 {
                found = next;
                break;
            }
            next += 1;
        }
        if nal_at < found {
            let mut end = found;
            while end > nal_at && bytes[end - 1] == 0 {
                end -= 1;
            }
            if end > nal_at {
                out.push(&bytes[nal_at..end]);
            }
        }
        cursor = found;
    }
    out
}

fn start_code_len(bytes: &[u8]) -> usize {
    if bytes.len() >= 4 && bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 0 && bytes[3] == 1 {
        4
    } else if bytes.len() >= 3 && bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 1 {
        3
    } else {
        0
    }
}

pub fn nals_to_avcc(nals: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::new();
    for nal in nals {
        if nal.is_empty() {
            continue;
        }
        out.extend_from_slice(&(nal.len() as u32).to_be_bytes());
        out.extend_from_slice(nal);
    }
    out
}

pub fn nal_is_key(codec: VideoCodec, nal: &[u8]) -> bool {
    if nal.is_empty() {
        return false;
    }
    match codec {
        VideoCodec::H264 => nal[0] & 0x1f == 5,
        VideoCodec::Hevc => {
            let kind = (nal[0] >> 1) & 0x3f;
            matches!(kind, 19 | 20 | 21)
        }
    }
}

pub fn sample_is_key(codec: VideoCodec, avcc: &[u8]) -> bool {
    let mut cursor = 0usize;
    while cursor + 4 <= avcc.len() {
        let length = u32::from_be_bytes(avcc[cursor..cursor + 4].try_into().unwrap()) as usize;
        let nal_at = cursor + 4;
        if length == 0 || nal_at + length > avcc.len() {
            break;
        }
        if nal_is_key(codec, &avcc[nal_at..nal_at + length]) {
            return true;
        }
        cursor = nal_at + length;
    }
    false
}

/// Split an encoder blob into parameter sets and one AVCC access unit.
pub fn take_access_unit(codec: VideoCodec, bytes: &[u8]) -> (Vec<u8>, Vec<u8>, Vec<u8>, Vec<u8>) {
    let nals = if bytes.windows(3).any(|chunk| chunk == [0, 0, 1]) {
        annexb_nals(bytes)
    } else {
        avcc_nals(bytes)
    };
    let mut vps = Vec::new();
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    let mut picture = Vec::new();
    for nal in nals {
        let kind = nal_kind(codec, nal);
        match kind {
            NalKind::Vps if vps.is_empty() => vps = nal.to_vec(),
            NalKind::Sps if sps.is_empty() => sps = nal.to_vec(),
            NalKind::Pps if pps.is_empty() => pps = nal.to_vec(),
            NalKind::Picture => picture.push(nal),
            _ => {}
        }
    }
    (vps, sps, pps, nals_to_avcc(&picture))
}

fn avcc_nals(bytes: &[u8]) -> Vec<&[u8]> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while cursor + 4 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
        let nal_at = cursor + 4;
        if length == 0 || nal_at + length > bytes.len() {
            break;
        }
        out.push(&bytes[nal_at..nal_at + length]);
        cursor = nal_at + length;
    }
    out
}

enum NalKind {
    Vps,
    Sps,
    Pps,
    Picture,
    Other,
}

fn nal_kind(codec: VideoCodec, nal: &[u8]) -> NalKind {
    if nal.is_empty() {
        return NalKind::Other;
    }
    match codec {
        VideoCodec::H264 => match nal[0] & 0x1f {
            7 => NalKind::Sps,
            8 => NalKind::Pps,
            1 | 5 => NalKind::Picture,
            _ => NalKind::Other,
        },
        VideoCodec::Hevc => match (nal[0] >> 1) & 0x3f {
            32 => NalKind::Vps,
            33 => NalKind::Sps,
            34 => NalKind::Pps,
            0 | 1 | 19 | 20 | 21 => NalKind::Picture,
            _ => NalKind::Other,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nvenc_hevc() -> EncoderCaps {
        EncoderCaps {
            kind: EncoderKind::Nvenc,
            hevc: true,
            h264: true,
        }
    }

    fn display(width: u32, height: u32, hz: u32) -> DisplayCaps {
        DisplayCaps {
            width,
            height,
            refresh_hz: hz,
        }
    }

    fn idr(codec: VideoCodec) -> Vec<u8> {
        let nal: &[u8] = match codec {
            VideoCodec::H264 => &[0x65, 0x88, 0x84, 0x00],
            VideoCodec::Hevc => &[0x26, 0x01, 0xaf],
        };
        nals_to_avcc(&[nal])
    }

    fn nonkey(codec: VideoCodec) -> Vec<u8> {
        let nal: &[u8] = match codec {
            VideoCodec::H264 => &[0x41, 0x9a, 0x00],
            VideoCodec::Hevc => &[0x02, 0x01, 0x00],
        };
        nals_to_avcc(&[nal])
    }

    #[test]
    fn defaults_are_1440p_at_60_fps() {
        let request = ClipRequest::default();
        assert_eq!(request.fps, 60);
        assert_eq!(request.resolution, 1440);
        assert_eq!(preset_size(1440), (2560, 1440));
        assert_eq!(snap_fps(30), 60);
        assert_eq!(snap_fps(240), 240);
        assert_eq!(snap_resolution(999), 1440);
        assert_eq!(snap_resolution(2160), 2160);
    }

    #[test]
    fn hardware_hevc_holds_1440p_at_240_fps() {
        let resolved = resolve_capture(
            ClipRequest::new(240, 1440),
            display(2560, 1440, 240),
            nvenc_hevc(),
            0,
        );
        assert!(resolved.hardware);
        assert_eq!(
            (resolved.width, resolved.height, resolved.fps),
            (2560, 1440, 240)
        );
        assert_eq!(resolved.codec, VideoCodec::Hevc);
        assert!(resolved.note.is_empty(), "{}", resolved.note);
        let bytes_30s = u64::from(resolved.bitrate) / 8 * 30;
        assert!(bytes_30s <= RING_BUDGET_BYTES as u64);
        assert!(resolved.bitrate >= 20_000_000);
        assert_eq!(
            pixel_budget(EncoderKind::VideoToolbox, true),
            HEVC_PIXELS_PER_SEC
        );
        assert_eq!(pixel_budget(EncoderKind::Amf, true), HEVC_PIXELS_PER_SEC);
    }

    #[test]
    fn four_k_at_240_fps_is_capped_and_explained() {
        let resolved = resolve_capture(
            ClipRequest::new(240, 2160),
            display(3840, 2160, 240),
            nvenc_hevc(),
            0,
        );
        assert_eq!(resolved.width, 3840);
        assert_eq!(resolved.height, 2160);
        assert_eq!(resolved.fps, 60);
        assert!(resolved.note.contains("2160p"));
        assert!(resolved.note.contains("240 fps"));
        assert!(resolved.note.contains("60 fps"));
    }

    #[test]
    fn a_1080p_60_hz_display_caps_1440p_240() {
        let resolved = resolve_capture(
            ClipRequest::new(240, 1440),
            display(1920, 1080, 60),
            nvenc_hevc(),
            0,
        );
        assert_eq!((resolved.width, resolved.height), (1920, 1080));
        assert_eq!(resolved.fps, 60);
        assert!(resolved.note.contains("1920×1080"));
        assert!(resolved.note.contains("60 Hz"));
    }

    #[test]
    fn quick_sync_hevc_caps_1440p_240_to_120() {
        let resolved = resolve_capture(
            ClipRequest::new(240, 1440),
            display(2560, 1440, 240),
            EncoderCaps {
                kind: EncoderKind::Qsv,
                hevc: true,
                h264: true,
            },
            0,
        );
        assert_eq!(resolved.fps, 120);
        assert_eq!(resolved.codec, VideoCodec::Hevc);
        assert!(resolved.note.contains("120 fps"));
    }

    #[test]
    fn h264_only_hardware_does_not_promise_1440p_240() {
        let resolved = resolve_capture(
            ClipRequest::new(240, 1440),
            display(2560, 1440, 240),
            EncoderCaps {
                kind: EncoderKind::Nvenc,
                hevc: false,
                h264: true,
            },
            0,
        );
        assert_eq!(resolved.codec, VideoCodec::H264);
        assert!(resolved.fps <= 60);
        assert!(!resolved.note.is_empty());
    }

    #[test]
    fn missing_hardware_keeps_the_jpeg_fallback_note() {
        let resolved = resolve_capture(
            ClipRequest::new(240, 1440),
            display(2560, 1440, 240),
            EncoderCaps::unavailable(),
            0,
        );
        assert!(!resolved.hardware);
        assert!(resolved.note.contains("5 fps"));
        assert!(resolved.note.contains("960"));
    }

    #[test]
    fn a_slow_encoder_steps_the_rate_down() {
        let mut watch = RateWatch::new(240);
        assert!(watch.observe(0, true).is_none());
        assert!(watch.observe(1_000, true).is_none());
        let capped = watch.observe(2_000, false);
        assert_eq!(capped, Some(120));
        let resolved = resolve_capture(
            ClipRequest::new(240, 1440),
            display(2560, 1440, 240),
            nvenc_hevc(),
            120,
        );
        assert_eq!(resolved.fps, 120);
        assert!(resolved.note.contains("could not hold"));
    }

    #[test]
    fn game_mode_drops_frames_instead_of_queueing() {
        assert_eq!(
            capture_pace(true),
            CapturePace {
                queue_depth: 1,
                below_normal: true
            }
        );
        assert_eq!(capture_pace(false).queue_depth, 2);
        assert!(!capture_pace(false).below_normal);
    }

    #[test]
    fn bitrate_for_1440p_fits_the_ring() {
        let hevc_240 = bitrate_for(VideoCodec::Hevc, 1440, 240);
        let hevc_60 = bitrate_for(VideoCodec::Hevc, 1440, 60);
        assert!(hevc_240 > hevc_60);
        assert!(u64::from(hevc_240) / 8 * 30 <= RING_BUDGET_BYTES as u64);
        assert!(bitrate_for(VideoCodec::H264, 1440, 60) > hevc_60);
        assert_eq!(hevc_level_idc(2560, 1440, 240), 156);
    }

    #[test]
    fn the_ring_keeps_encoded_packets_for_thirty_seconds() {
        let mut ring = PacketRing::with_budget(VideoCodec::Hevc, 2560, 1440, 240, 50_000);
        ring.set_parameter_sets(&[0x40, 0x01], &[0x42, 0x01, 0x01, 0x01], &[0x44, 0x01]);
        for index in 0..40 {
            let keyframe = index % 10 == 0;
            ring.push(AccessUnit {
                pts_ms: index * 1_000,
                duration_ticks: frame_duration_ticks(240),
                keyframe,
                data: if keyframe {
                    idr(VideoCodec::Hevc)
                } else {
                    nonkey(VideoCodec::Hevc)
                },
            });
        }
        assert!(ring.span_ms() <= CLIP_WINDOW_MS);
        assert!(ring.stored_bytes() <= 50_000);
        assert!(ring.packets.front().unwrap().keyframe);
        assert!(ring.span_ms() >= 20_000);
        let clip = ring.remux().unwrap();
        mp4mux::require_clip_mp4(&clip.bytes).unwrap();
        assert!(clip.bytes.windows(4).any(|tag| tag == *b"hvc1"));
        assert!(clip.bytes.windows(4).any(|tag| tag == *b"mp4a"));
        assert!(mp4mux::moov_before_mdat(&clip.bytes));
    }

    #[test]
    fn annex_b_packets_become_length_prefixed_samples() {
        let blob = [0, 0, 0, 1, 0x40, 0x01, 0, 0, 1, 0x26, 0x01, 0x11];
        let (vps, _sps, _pps, sample) = take_access_unit(VideoCodec::Hevc, &blob);
        assert_eq!(vps, vec![0x40, 0x01]);
        assert!(sample_is_key(VideoCodec::Hevc, &sample));
        assert_eq!(&sample[..4], &3u32.to_be_bytes());
    }

    #[test]
    fn fit_never_upscales_and_stays_even() {
        assert_eq!(fit_inside(2560, 1440, 1920, 1080), (1920, 1080));
        assert_eq!(fit_inside(2560, 1440, 3840, 2160), (2560, 1440));
        let (width, height) = fit_inside(1280, 720, 1919, 1000);
        assert_eq!(width % 2, 0);
        assert_eq!(height % 2, 0);
        assert!(width <= 1280 && height <= 720);
    }
}
