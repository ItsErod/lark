//! Screen-share scheduler.
//!
//! Discord carries screen share as a full-frame H.264 or VP8 video stream, not as
//! raw dirty rectangles. This module decides whether a frame is worth encoding at
//! all. A static screen produces zero packets. Motion scales frame rate and bitrate.
//! The desktop shell asks for a hardware encoder (VideoToolbox, or NVENC / Quick Sync
//! / AMF / Media Foundation) only when a plan says to send.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SharePlan {
    pub send: bool,
    pub fps: u8,
    pub bitrate: u32,
    pub dirty_ratio: f32,
    pub regions: Vec<Rect>,
}

pub fn capture_backends(os: &str) -> &'static [&'static str] {
    match os {
        "macos" => &["screencapturekit"],
        "windows" => &["windows-graphics-capture", "dxgi"],
        _ => &["unavailable"],
    }
}

pub fn encoder_order(os: &str) -> &'static [&'static str] {
    match os {
        "macos" => &["videotoolbox"],
        "windows" => &["nvenc", "qsv", "amf", "media-foundation"],
        _ => &["software"],
    }
}

/// Compare luma thumbnails. `tile` is in pixels. Returns dirty tiles and the
/// fraction of tiles that changed. The thumbnail is capped by the caller so the
/// compare stays on a few kilobytes, not a 4K framebuffer.
pub fn luma_diff(prev: &[u8], next: &[u8], width: u32, tile: u32) -> (f32, Vec<Rect>) {
    if width == 0 || tile == 0 || next.is_empty() || prev.len() != next.len() || next.len() % width as usize != 0 {
        return if next.is_empty() {
            (0.0, Vec::new())
        } else {
            (1.0, Vec::new())
        };
    }
    let height = (next.len() / width as usize) as u32;
    let mut regions = Vec::new();
    let mut tiles = 0u32;
    let mut dirty = 0u32;
    let mut y = 0u32;
    while y < height {
        let mut x = 0u32;
        let th = tile.min(height - y);
        while x < width {
            tiles += 1;
            let tw = tile.min(width - x);
            if tile_changed(prev, next, width, x, y, tw, th) {
                dirty += 1;
                regions.push(Rect { x, y, w: tw, h: th });
            }
            x += tile;
        }
        y += tile;
    }
    let ratio = if tiles == 0 { 0.0 } else { dirty as f32 / tiles as f32 };
    (ratio, regions)
}

fn tile_changed(prev: &[u8], next: &[u8], width: u32, x: u32, y: u32, tw: u32, th: u32) -> bool {
    for row in 0..th {
        let start = ((y + row) * width + x) as usize;
        let end = start + tw as usize;
        if prev[start..end] != next[start..end] {
            return true;
        }
    }
    false
}

pub fn plan_from_ratio(ratio: f32, regions: Vec<Rect>) -> SharePlan {
    let ratio = ratio.clamp(0.0, 1.0);
    if ratio <= 0.001 || regions.is_empty() {
        return SharePlan {
            send: false,
            fps: 0,
            bitrate: 0,
            dirty_ratio: 0.0,
            regions: Vec::new(),
        };
    }
    let (fps, bitrate) = if ratio < 0.05 {
        (5, 200_000)
    } else if ratio < 0.25 {
        (15, 1_200_000)
    } else {
        (30, 2_500_000)
    };
    SharePlan {
        send: true,
        fps,
        bitrate,
        dirty_ratio: ratio,
        regions,
    }
}

pub fn plan_frame(prev: &[u8], next: &[u8], width: u32) -> SharePlan {
    let (ratio, regions) = luma_diff(prev, next, width, 16);
    plan_from_ratio(ratio, regions)
}

/// One encoded video frame, or nothing. Discord cannot take a raw dirty rectangle
/// as its own packet, so a skipped frame is zero packets rather than a partial blit.
pub fn packets_for(plan: &SharePlan) -> u32 {
    if plan.send { 1 } else { 0 }
}

pub fn frame_interval_ms(fps: u8) -> u64 {
    if fps == 0 { 1_000 } else { (1000 / u64::from(fps)).max(16) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_screen_sends_nothing() {
        let frame = vec![8u8; 32 * 18];
        let plan = plan_frame(&frame, &frame, 32);
        assert!(!plan.send);
        assert_eq!(plan.fps, 0);
        assert_eq!(plan.bitrate, 0);
        assert_eq!(packets_for(&plan), 0);
        assert!(plan.regions.is_empty());
    }

    #[test]
    fn one_tile_is_a_small_update() {
        let prev = vec![0u8; 64 * 96];
        let mut next = prev.clone();
        next[0] = 255;
        let plan = plan_frame(&prev, &next, 64);
        assert!(plan.send, "ratio {}", plan.dirty_ratio);
        assert_eq!(plan.fps, 5, "ratio {} regions {}", plan.dirty_ratio, plan.regions.len());
        assert_eq!(plan.bitrate, 200_000);
        assert_eq!(plan.regions.len(), 1);
        assert_eq!(plan.regions[0], Rect { x: 0, y: 0, w: 16, h: 16 });
        assert_eq!(packets_for(&plan), 1);
    }

    #[test]
    fn broad_motion_ramps_up() {
        let prev = vec![0u8; 32 * 32];
        let next = vec![255u8; 32 * 32];
        let plan = plan_frame(&prev, &next, 32);
        assert_eq!(plan.fps, 30);
        assert_eq!(plan.bitrate, 2_500_000);
        assert!(plan.dirty_ratio > 0.9);
    }

    #[test]
    fn backends_match_the_os() {
        assert_eq!(capture_backends("macos"), ["screencapturekit"]);
        assert_eq!(encoder_order("macos"), ["videotoolbox"]);
        assert_eq!(
            capture_backends("windows"),
            ["windows-graphics-capture", "dxgi"]
        );
        assert_eq!(encoder_order("windows")[0], "nvenc");
        assert!(encoder_order("windows").contains(&"media-foundation"));
    }
}
