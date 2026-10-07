//! Hardware clip encoders.
//!
//! Windows uses a Media Foundation sink writer with hardware transforms turned on.
//! macOS uses VideoToolbox and asks for the hardware H.264 encoder. Both run only
//! when a clip is saved. If either encoder cannot start, the caller uses ffmpeg or
//! the built-in encoder instead.

#[cfg(target_os = "macos")]
mod capture_mac;
#[cfg(windows)]
mod capture_win;
#[cfg(windows)]
mod media_foundation;
#[cfg(target_os = "macos")]
mod videotoolbox;

/// What the capture thread asks the hardware encoder to hold.
#[derive(Debug, Clone, Copy)]
pub struct LiveConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u32,
    pub hevc: bool,
    pub game_mode: bool,
}

/// One encoded access unit, still in the encoder's own layout.
#[derive(Debug, Clone)]
pub struct LivePacket {
    pub pts_ms: u64,
    pub duration_ticks: u32,
    pub bytes: Vec<u8>,
}

/// Display and encoder the settings page uses before a frame is captured.
#[derive(Debug, Clone, Copy)]
pub struct HardwareProbe {
    pub display_width: u32,
    pub display_height: u32,
    pub refresh_hz: u32,
    pub encoder_name: &'static str,
    pub hevc: bool,
    pub h264: bool,
}

pub struct LiveSession {
    backend: &'static str,
    hevc: bool,
    #[cfg(windows)]
    inner: capture_win::Session,
    #[cfg(target_os = "macos")]
    inner: capture_mac::Session,
    #[cfg(not(any(windows, target_os = "macos")))]
    _unused: (),
}

impl LiveSession {
    pub fn open(config: &LiveConfig) -> Result<Self, String> {
        #[cfg(windows)]
        {
            let inner = capture_win::Session::open(config)?;
            let hevc = inner.hevc();
            let backend = inner.backend();
            return Ok(Self {
                backend,
                hevc,
                inner,
            });
        }
        #[cfg(target_os = "macos")]
        {
            let inner = capture_mac::Session::open(config)?;
            let hevc = inner.hevc();
            let backend = inner.backend();
            return Ok(Self {
                backend,
                hevc,
                inner,
            });
        }
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = config;
            Err("Hardware capture is available on macOS and Windows.".into())
        }
    }

    pub fn backend(&self) -> &'static str {
        self.backend
    }

    pub fn hevc(&self) -> bool {
        self.hevc
    }

    pub fn tick(&mut self) -> Result<Vec<LivePacket>, String> {
        #[cfg(windows)]
        {
            return self.inner.tick();
        }
        #[cfg(target_os = "macos")]
        {
            return self.inner.tick();
        }
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            Err("Hardware capture is available on macOS and Windows.".into())
        }
    }
}

pub fn probe() -> HardwareProbe {
    #[cfg(windows)]
    {
        return capture_win::probe();
    }
    #[cfg(target_os = "macos")]
    {
        return capture_mac::probe();
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        HardwareProbe {
            display_width: 0,
            display_height: 0,
            refresh_hz: 0,
            encoder_name: "unavailable",
            hevc: false,
            h264: false,
        }
    }
}

pub fn set_capture_thread_pace(game_mode: bool) {
    #[cfg(windows)]
    capture_win::set_thread_pace(game_mode);
    #[cfg(target_os = "macos")]
    capture_mac::set_thread_pace(game_mode);
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = game_mode;
    }
}

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
