//! Hardware clip encoders.
//!
//! Windows uses a Media Foundation sink writer with hardware transforms turned on.
//! macOS uses VideoToolbox and asks for the hardware H.264 encoder. Both run only
//! when a clip is saved. If either encoder cannot start, the caller uses ffmpeg or
//! the built-in encoder instead.

#[cfg(windows)]
mod media_foundation;
#[cfg(target_os = "macos")]
mod videotoolbox;

/// Encoded picture from a platform encoder, before AAC mux and faststart.
#[derive(Debug)]
pub enum HardwareClip {
    /// A finished MP4. The moov atom may still sit at the end.
    Mp4(Vec<u8>),
    /// H.264 access units in AVCC form (4-byte lengths, no start codes).
    Avcc {
        sps: Vec<u8>,
        pps: Vec<u8>,
        samples: Vec<Vec<u8>>,
        sync: Vec<bool>,
    },
}

/// Encode `frame_count` RGBA frames of `width` by `height`.
///
/// `rgba_at` is called once per frame and must return `width * height * 4` bytes.
/// Frames are not kept, so a 30 second clip does not decode the whole buffer at once.
pub fn encode_rgba_frames(
    width: u32,
    height: u32,
    fps: u32,
    frame_count: usize,
    rgba_at: impl FnMut(usize) -> Result<Vec<u8>, String>,
) -> Result<HardwareClip, String> {
    #[cfg(windows)]
    {
        return media_foundation::encode(width, height, fps, frame_count, rgba_at);
    }
    #[cfg(target_os = "macos")]
    {
        return videotoolbox::encode(width, height, fps, frame_count, rgba_at);
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (width, height, fps, frame_count, rgba_at);
        Err("No hardware encoder on this system.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(any(windows, target_os = "macos")))]
    #[test]
    fn other_systems_leave_encoding_to_the_fallback() {
        let err = encode_rgba_frames(2, 2, 5, 1, |_| Ok(vec![0; 16])).unwrap_err();
        assert!(err.contains("hardware"));
    }
}
