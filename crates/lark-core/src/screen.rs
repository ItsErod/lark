//! Capture hints for screen share.
//!
//! Go Live quality, bitrate, and frame pacing live in `discord::stream`. This module
//! only names the platform capture and encoder, and compares luma thumbnails when a
//! caller wants to know whether the picture moved. It does not invent a frame rate.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

pub fn capture_backends(os: &str) -> &'static [&'static str] {
    match os {
        "macos" => &["screencapturekit"],
        "windows" => &["windows-graphics-capture", "dxgi"],
        _ => &["unavailable"],
    }
}

/// A small JPEG the share dialog can show. Returns nothing when the buffer is short.
pub fn thumbnail_jpeg(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    if width == 0
        || height == 0
        || width > 4096
        || height > 4096
        || rgba.len() < (width as usize) * (height as usize) * 4
    {
        return None;
    }
    let mut buf = Vec::new();
    let encoder = jpeg_encoder::Encoder::new(&mut buf, 70);
    encoder
        .encode(
            rgba,
            width as u16,
            height as u16,
            jpeg_encoder::ColorType::Rgba,
        )
        .ok()?;
    Some(buf)
}

/// Box-filter a thumbnail so the picker does not hold a full desktop frame.
pub fn scale_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    max_edge: u32,
) -> Option<(Vec<u8>, u32, u32)> {
    if width < 2 || height < 2 || rgba.len() < width as usize * height as usize * 4 {
        return None;
    }
    let edge = max_edge.max(2);
    let scale = (edge as f32 / width as f32)
        .min(edge as f32 / height as f32)
        .min(1.0);
    let out_w = ((width as f32 * scale).round() as u32).max(2) & !1;
    let out_h = ((height as f32 * scale).round() as u32).max(2) & !1;
    let mut out = vec![0u8; out_w as usize * out_h as usize * 4];
    for y in 0..out_h {
        let src_y = (y as u64 * u64::from(height) / u64::from(out_h)) as u32;
        for x in 0..out_w {
            let src_x = (x as u64 * u64::from(width) / u64::from(out_w)) as u32;
            let from = ((src_y * width + src_x) * 4) as usize;
            let to = ((y * out_w + x) * 4) as usize;
            out[to..to + 4].copy_from_slice(&rgba[from..from + 4]);
        }
    }
    Some((out, out_w, out_h))
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
    if width == 0
        || tile == 0
        || next.is_empty()
        || prev.len() != next.len()
        || next.len() % width as usize != 0
    {
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
    let ratio = if tiles == 0 {
        0.0
    } else {
        dirty as f32 / tiles as f32
    };
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_static_thumbnail_has_no_dirty_tiles() {
        let frame = vec![8u8; 32 * 18];
        let (ratio, regions) = luma_diff(&frame, &frame, 32, 16);
        assert_eq!(ratio, 0.0);
        assert!(regions.is_empty());
    }

    #[test]
    fn one_changed_pixel_marks_one_tile() {
        let prev = vec![0u8; 64 * 96];
        let mut next = prev.clone();
        next[0] = 255;
        let (ratio, regions) = luma_diff(&prev, &next, 64, 16);
        assert!(ratio > 0.0);
        assert_eq!(regions.len(), 1);
        assert_eq!(
            regions[0],
            Rect {
                x: 0,
                y: 0,
                w: 16,
                h: 16
            }
        );
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
