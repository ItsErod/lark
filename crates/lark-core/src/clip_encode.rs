//! Turn the JPEG ring into an H.264 + AAC MP4 when the clip hotkey fires.
//!
//! Capture stays at a few JPEG frames a second. Encoding runs once, on a
//! below-normal priority, and prefers a hardware encoder so a game keeps the CPU.

use std::io::{Cursor, Write};
use std::path::Path;
use std::process::{Command, Stdio};

use jpeg_decoder::Decoder;

use crate::clip::ClipPlan;
use crate::mp4mux::{self, VideoTrack, AAC_SAMPLE_RATE};

pub struct EncodedClip {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub fn encode_clip(plan: &ClipPlan) -> Result<EncodedClip, String> {
    let _priority = BackgroundPriority::enter();
    if let Ok(encoded) = try_hardware(plan) {
        return Ok(encoded);
    }
    if let Some(ffmpeg) = mp4mux::bundled_ffmpeg() {
        if let Ok(encoded) = encode_with_ffmpeg(&ffmpeg, plan, None) {
            return Ok(encoded);
        }
    }
    encode_software(plan)
}

pub fn encode_with_ffmpeg(
    ffmpeg: &Path,
    plan: &ClipPlan,
    only: Option<&str>,
) -> Result<EncodedClip, String> {
    let encoders: Vec<&str> = match only {
        Some(name) => vec![name],
        None => mp4mux::ffmpeg_video_encoders(std::env::consts::OS).to_vec(),
    };
    let mut last = String::from("ffmpeg did not write a clip.");
    for encoder in encoders {
        match encode_with_ffmpeg_encoder(ffmpeg, plan, encoder) {
            Ok(encoded) => return Ok(encoded),
            Err(err) => last = err,
        }
    }
    Err(last)
}

fn try_hardware(plan: &ClipPlan) -> Result<EncodedClip, String> {
    let encoded = lark_clip_hw::encode_rgba_frames(
        plan.width,
        plan.height,
        plan.fps,
        plan.frames.len(),
        |index| decode_rgba(&plan.frames[index].jpeg, plan.width, plan.height),
    )?;
    let bytes = match encoded {
        lark_clip_hw::HardwareClip::Mp4(bytes) => mp4mux::ensure_faststart(&bytes)?,
        lark_clip_hw::HardwareClip::Avcc {
            sps,
            pps,
            samples,
            sync,
        } => mux_samples(
            plan.width,
            plan.height,
            plan.fps,
            &sps,
            &pps,
            &samples,
            &sync,
        )?,
    };
    finish(bytes, plan.width, plan.height)
}

fn encode_software(plan: &ClipPlan) -> Result<EncodedClip, String> {
    let width = (plan.width.max(16) + 15) & !15;
    let height = (plan.height.max(16) + 15) & !15;
    let mut last = String::from("Couldn't encode the clip.");
    for attempt in 0..3 {
        let (qp_min, qp_max) = match attempt {
            0 => (24, 36),
            1 => (30, 44),
            _ => (36, 51),
        };
        match encode_software_pass(plan, width, height, qp_min, qp_max, attempt) {
            Ok(bytes) => return finish(bytes, width, height),
            Err(err) => last = err,
        }
    }
    Err(last)
}

fn encode_software_pass(
    plan: &ClipPlan,
    width: u32,
    height: u32,
    qp_min: i32,
    qp_max: i32,
    attempt: u32,
) -> Result<Vec<u8>, String> {
    let mut encoder = H264Encoder::open(width, height, plan.fps.max(1))?;
    let mut samples = Vec::with_capacity(plan.frames.len());
    let mut sync = Vec::with_capacity(plan.frames.len());
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    let frame_bytes = frame_budget(plan.frames.len(), attempt);
    for frame in &plan.frames {
        let rgba = decode_rgba(&frame.jpeg, plan.width, plan.height)?;
        let (y, u, v) = yuv420(&rgba, plan.width, plan.height, width, height);
        let y = align16(&y);
        let u = align16(&u);
        let v = align16(&v);
        let annex = encoder.encode(
            y.as_slice(),
            u.as_slice(),
            v.as_slice(),
            width,
            frame_bytes,
            qp_min,
            qp_max,
        )?;
        let (parameter_sets, access_unit, key) = avcc_access_unit(&annex)?;
        if sps.is_empty() {
            sps = parameter_sets.0;
            pps = parameter_sets.1;
        }
        samples.push(access_unit);
        sync.push(key);
    }
    if sps.is_empty() || pps.is_empty() {
        return Err("The encoder did not write H.264 parameter sets.".into());
    }
    mux_samples(width, height, plan.fps, &sps, &pps, &samples, &sync)
}

fn mux_samples(
    width: u32,
    height: u32,
    fps: u32,
    sps: &[u8],
    pps: &[u8],
    samples: &[Vec<u8>],
    sync: &[bool],
) -> Result<Vec<u8>, String> {
    mp4mux::mux_h264_aac(&VideoTrack {
        width,
        height,
        fps,
        sps,
        pps,
        samples,
        sync,
    })
}

fn finish(bytes: Vec<u8>, width: u32, height: u32) -> Result<EncodedClip, String> {
    let bytes = mp4mux::ensure_faststart(&bytes)?;
    mp4mux::require_discord_mp4(&bytes)?;
    Ok(EncodedClip {
        bytes,
        width,
        height,
    })
}

fn frame_budget(frames: usize, attempt: u32) -> i32 {
    let total = 6_000_000usize >> attempt;
    (total / frames.max(1)).clamp(256, 250_000) as i32
}

fn encode_with_ffmpeg_encoder(
    ffmpeg: &Path,
    plan: &ClipPlan,
    encoder: &str,
) -> Result<EncodedClip, String> {
    let output = std::env::temp_dir().join(format!(
        "lark-clip-{}-{}.mp4",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0)
    ));
    let bitrate = target_bitrate(plan.frames.len(), plan.fps);
    let size = format!("{}x{}", plan.width, plan.height);
    let fps = plan.fps.max(1).to_string();
    let rate = bitrate.to_string();
    let mut command = Command::new(ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-s")
        .arg(&size)
        .arg("-r")
        .arg(&fps)
        .arg("-i")
        .arg("pipe:0")
        .arg("-f")
        .arg("lavfi")
        .arg("-i")
        .arg(format!(
            "anullsrc=channel_layout=stereo:sample_rate={AAC_SAMPLE_RATE}"
        ))
        .arg("-shortest")
        .args(encoder_args(encoder, &fps, &rate))
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("64k")
        .arg("-ac")
        .arg("2")
        .arg("-movflags")
        .arg("+faststart")
        .arg("-f")
        .arg("mp4")
        .arg(&output)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        command.creation_flags(BELOW_NORMAL_PRIORITY_CLASS);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            command.pre_exec(|| {
                setpriority(0, 0, 10);
                Ok(())
            });
        }
    }
    let mut child = command
        .spawn()
        .map_err(|err| format!("Couldn't start ffmpeg: {err}"))?;
    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or("Couldn't write frames to ffmpeg.")?;
        for frame in &plan.frames {
            let rgba = decode_rgba(&frame.jpeg, plan.width, plan.height)?;
            stdin
                .write_all(&rgba)
                .map_err(|err| format!("Couldn't write frames to ffmpeg: {err}"))?;
        }
    }
    let finished = child
        .wait_with_output()
        .map_err(|err| format!("ffmpeg failed: {err}"))?;
    let bytes = if finished.status.success() {
        std::fs::read(&output).map_err(|err| format!("Couldn't read the ffmpeg clip: {err}"))
    } else {
        let stderr = String::from_utf8_lossy(&finished.stderr);
        let tail = stderr.chars().rev().take(400).collect::<String>();
        let tail = tail.chars().rev().collect::<String>();
        Err(format!(
            "ffmpeg could not encode the clip with {encoder}. {tail}"
        ))
    };
    let _ = std::fs::remove_file(&output);
    finish(bytes?, plan.width, plan.height)
}

fn encoder_args(encoder: &str, fps: &str, bitrate: &str) -> Vec<String> {
    let mut args = vec![
        "-c:v".into(),
        encoder.into(),
        "-b:v".into(),
        bitrate.into(),
        "-maxrate".into(),
        bitrate.into(),
        "-bufsize".into(),
        bitrate.into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-g".into(),
        fps.into(),
        "-bf".into(),
        "0".into(),
    ];
    match encoder {
        "libx264" => args.extend([
            "-preset".into(),
            "ultrafast".into(),
            "-tune".into(),
            "zerolatency".into(),
            "-profile:v".into(),
            "baseline".into(),
            "-threads".into(),
            "1".into(),
        ]),
        "h264_mf" => args.extend(["-hw_encoding".into(), "1".into()]),
        "h264_videotoolbox" => args.extend([
            "-realtime".into(),
            "1".into(),
            "-profile:v".into(),
            "baseline".into(),
        ]),
        "h264_nvenc" => args.extend([
            "-preset".into(),
            "p1".into(),
            "-tune".into(),
            "ll".into(),
            "-rc".into(),
            "cbr".into(),
        ]),
        "h264_qsv" => args.extend(["-preset".into(), "veryfast".into()]),
        "h264_amf" => args.extend([
            "-usage".into(),
            "ultralowlatency".into(),
            "-quality".into(),
            "speed".into(),
        ]),
        _ => {}
    }
    args
}

fn target_bitrate(frames: usize, fps: u32) -> u32 {
    let fps = u64::from(fps.max(1));
    let millis = (frames.max(1) as u64) * 1000 / fps;
    let bits = 6_500_000u64 * 8 * 1000 / millis.max(1);
    bits.clamp(200_000, 4_000_000) as u32
}

pub fn decode_rgba(jpeg: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut decoder = Decoder::new(Cursor::new(jpeg));
    let pixels = decoder
        .decode()
        .map_err(|err| format!("Couldn't read a clip frame: {err}"))?;
    let info = decoder.info().ok_or("Couldn't read a clip frame.")?;
    if u32::from(info.width) != width || u32::from(info.height) != height {
        return Err("A clip frame changed size.".into());
    }
    let pixels_expected = width as usize * height as usize;
    match info.pixel_format {
        jpeg_decoder::PixelFormat::RGB24 => {
            if pixels.len() != pixels_expected * 3 {
                return Err("Couldn't read a clip frame.".into());
            }
            let mut rgba = Vec::with_capacity(pixels_expected * 4);
            for chunk in pixels.chunks_exact(3) {
                rgba.extend_from_slice(&[chunk[0], chunk[1], chunk[2], 255]);
            }
            Ok(rgba)
        }
        jpeg_decoder::PixelFormat::L8 => {
            if pixels.len() != pixels_expected {
                return Err("Couldn't read a clip frame.".into());
            }
            let mut rgba = Vec::with_capacity(pixels_expected * 4);
            for gray in pixels {
                rgba.extend_from_slice(&[gray, gray, gray, 255]);
            }
            Ok(rgba)
        }
        _ => Err("Couldn't read a clip frame.".into()),
    }
}

fn yuv420(
    rgba: &[u8],
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
) -> (Vec<u8>, Vec<u8>, Vec<u8>) {
    let mut y = vec![16u8; dst_w as usize * dst_h as usize];
    let cw = (dst_w / 2) as usize;
    let ch = dst_h / 2;
    let mut u = vec![128u8; cw * ch as usize];
    let mut v = vec![128u8; cw * ch as usize];
    for row in 0..dst_h {
        let sy = row.min(src_h.saturating_sub(1));
        for col in 0..dst_w {
            let sx = col.min(src_w.saturating_sub(1));
            let index = ((sy * src_w + sx) * 4) as usize;
            let (yy, _, _) = yuv_of(rgba[index], rgba[index + 1], rgba[index + 2]);
            y[(row * dst_w + col) as usize] = yy;
        }
    }
    for row in 0..ch {
        for col in 0..cw as u32 {
            let mut red = 0i32;
            let mut green = 0i32;
            let mut blue = 0i32;
            for dy in 0..2 {
                for dx in 0..2 {
                    let sy = (row * 2 + dy).min(src_h.saturating_sub(1));
                    let sx = (col * 2 + dx).min(src_w.saturating_sub(1));
                    let index = ((sy * src_w + sx) * 4) as usize;
                    red += rgba[index] as i32;
                    green += rgba[index + 1] as i32;
                    blue += rgba[index + 2] as i32;
                }
            }
            let (_, uu, vv) = yuv_of((red / 4) as u8, (green / 4) as u8, (blue / 4) as u8);
            let index = row as usize * cw + col as usize;
            u[index] = uu;
            v[index] = vv;
        }
    }
    (y, u, v)
}

/// minih264's SSE2 and NEON paths reject a plane whose pointer is not 8-byte aligned.
struct AlignedPlane {
    buf: Vec<u8>,
    offset: usize,
    len: usize,
}

fn align16(src: &[u8]) -> AlignedPlane {
    let mut buf = Vec::with_capacity(src.len() + 32);
    let start = buf.as_ptr() as usize;
    let offset = (16 - (start % 16)) % 16;
    buf.resize(offset + src.len(), 0);
    buf[offset..offset + src.len()].copy_from_slice(src);
    AlignedPlane {
        buf,
        offset,
        len: src.len(),
    }
}

impl AlignedPlane {
    fn as_slice(&self) -> &[u8] {
        &self.buf[self.offset..self.offset + self.len]
    }
}

fn yuv_of(red: u8, green: u8, blue: u8) -> (u8, u8, u8) {
    let r = red as i32;
    let g = green as i32;
    let b = blue as i32;
    let y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
    let u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
    let v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
    (
        y.clamp(0, 255) as u8,
        u.clamp(0, 255) as u8,
        v.clamp(0, 255) as u8,
    )
}

fn avcc_access_unit(annex: &[u8]) -> Result<((Vec<u8>, Vec<u8>), Vec<u8>, bool), String> {
    let nals = split_annex_b(annex);
    if nals.is_empty() {
        return Err("The encoder wrote an empty frame.".into());
    }
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    let mut sample = Vec::new();
    let mut key = false;
    for nal in nals {
        if nal.is_empty() {
            continue;
        }
        let kind = nal[0] & 0x1f;
        match kind {
            7 => sps = nal,
            8 => pps = nal,
            1 | 5 => {
                key |= kind == 5;
                sample.extend_from_slice(&(nal.len() as u32).to_be_bytes());
                sample.extend_from_slice(&nal);
            }
            _ => {}
        }
    }
    if sample.is_empty() {
        return Err("The encoder wrote a frame without a picture.".into());
    }
    Ok(((sps, pps), sample, key))
}

fn split_annex_b(data: &[u8]) -> Vec<Vec<u8>> {
    let mut marks = Vec::new();
    let mut index = 0usize;
    while index + 3 < data.len() {
        if data[index] == 0 && data[index + 1] == 0 && data[index + 2] == 1 {
            marks.push(index);
            index += 3;
            continue;
        }
        if index + 4 <= data.len() && data[index..index + 4] == [0, 0, 0, 1] {
            marks.push(index);
            index += 4;
            continue;
        }
        index += 1;
    }
    let mut nals = Vec::new();
    for (index, start) in marks.iter().copied().enumerate() {
        let header = if data[start + 2] == 1 { 3 } else { 4 };
        let from = start + header;
        let to = marks.get(index + 1).copied().unwrap_or(data.len());
        if from < to {
            nals.push(data[from..to].to_vec());
        }
    }
    nals
}

struct H264Encoder {
    raw: *mut std::ffi::c_void,
}

impl H264Encoder {
    fn open(width: u32, height: u32, fps: u32) -> Result<Self, String> {
        let mut raw = std::ptr::null_mut();
        let status =
            unsafe { lark_h264_open(&mut raw, width as i32, height as i32, fps.max(1) as i32) };
        if status != 0 || raw.is_null() {
            return Err(format!("Couldn't start the clip encoder ({status})."));
        }
        Ok(Self { raw })
    }

    fn encode(
        &mut self,
        y: &[u8],
        u: &[u8],
        v: &[u8],
        stride: u32,
        frame_bytes: i32,
        qp_min: i32,
        qp_max: i32,
    ) -> Result<Vec<u8>, String> {
        let chroma = stride / 2;
        let mut data = std::ptr::null_mut();
        let mut size = 0i32;
        let status = unsafe {
            lark_h264_encode(
                self.raw,
                y.as_ptr() as *mut u8,
                u.as_ptr() as *mut u8,
                v.as_ptr() as *mut u8,
                stride as i32,
                chroma as i32,
                10,
                frame_bytes,
                qp_min,
                qp_max,
                &mut data,
                &mut size,
            )
        };
        if status != 0 || data.is_null() || size <= 0 {
            return Err(format!("Couldn't encode a clip frame ({status})."));
        }
        let bytes = unsafe { std::slice::from_raw_parts(data, size as usize) }.to_vec();
        Ok(bytes)
    }
}

impl Drop for H264Encoder {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe { lark_h264_close(self.raw) }
        }
    }
}

unsafe extern "C" {
    fn lark_h264_open(out: *mut *mut std::ffi::c_void, width: i32, height: i32, gop: i32) -> i32;
    fn lark_h264_encode(
        encoder: *mut std::ffi::c_void,
        y: *mut u8,
        u: *mut u8,
        v: *mut u8,
        y_stride: i32,
        c_stride: i32,
        speed: i32,
        frame_bytes: i32,
        qp_min: i32,
        qp_max: i32,
        data: *mut *mut u8,
        size: *mut i32,
    ) -> i32;
    fn lark_h264_close(encoder: *mut std::ffi::c_void);
}

#[cfg(unix)]
unsafe extern "C" {
    fn setpriority(which: i32, who: u32, prio: i32) -> i32;
}

struct BackgroundPriority {
    restore: bool,
    #[cfg(windows)]
    previous: i32,
}

impl BackgroundPriority {
    fn enter() -> Self {
        #[cfg(unix)]
        {
            let restore = unsafe { setpriority(0, 0, 10) == 0 };
            return Self { restore };
        }
        #[cfg(windows)]
        {
            const BELOW_NORMAL: i32 = -1;
            const ERROR_RETURN: i32 = 0x7fff_ffff;
            unsafe {
                let thread = GetCurrentThread();
                let previous = GetThreadPriority(thread);
                if previous == ERROR_RETURN || SetThreadPriority(thread, BELOW_NORMAL) == 0 {
                    return Self {
                        restore: false,
                        previous: 0,
                    };
                }
                Self {
                    restore: true,
                    previous,
                }
            }
        }
        #[cfg(not(any(unix, windows)))]
        {
            Self { restore: false }
        }
    }
}

impl Drop for BackgroundPriority {
    fn drop(&mut self) {
        if !self.restore {
            return;
        }
        #[cfg(unix)]
        unsafe {
            setpriority(0, 0, 0);
        }
        #[cfg(windows)]
        unsafe {
            SetThreadPriority(GetCurrentThread(), self.previous);
        }
    }
}

#[cfg(windows)]
unsafe extern "system" {
    fn GetCurrentThread() -> isize;
    fn GetThreadPriority(thread: isize) -> i32;
    fn SetThreadPriority(thread: isize, priority: i32) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    use crate::clip::{prepare_frame, ClipBuffer, CLIP_SAMPLE_INTERVAL_MS};

    fn solid(width: u32, height: u32, pixel: [u8; 4]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(width as usize * height as usize * 4);
        for _ in 0..width * height {
            bytes.extend_from_slice(&pixel);
        }
        bytes
    }

    fn clip_from(width: u32, height: u32, frames: usize) -> ClipPlan {
        let rgba = solid(width, height, [20, 90, 160, 255]);
        let mut buffer = ClipBuffer::default();
        for index in 0..frames {
            buffer.push(
                prepare_frame(&rgba, width, height, index as u64 * CLIP_SAMPLE_INTERVAL_MS)
                    .unwrap(),
            );
        }
        buffer.plan().unwrap()
    }

    #[test]
    fn software_encoder_writes_a_faststart_mp4() {
        let plan = clip_from(32, 18, 4);
        let encoded = encode_software(&plan).unwrap();
        assert!(mp4mux::moov_before_mdat(&encoded.bytes));
        mp4mux::require_discord_mp4(&encoded.bytes).unwrap();
        assert!(encoded.width % 16 == 0 && encoded.height % 16 == 0);
        assert!(!encoded.bytes.is_empty());
        assert_eq!(&encoded.bytes[4..8], b"ftyp");
        let ffmpeg = PathBuf::from("/usr/bin/ffmpeg");
        if !ffmpeg.is_file() {
            if std::env::var_os("CI").is_some() {
                panic!("ffmpeg is required in CI to decode the built-in encoder");
            }
            return;
        }
        let path = std::env::temp_dir().join(format!("lark-clip-soft-{}.mp4", std::process::id()));
        std::fs::write(&path, &encoded.bytes).unwrap();
        let decoded = Command::new(&ffmpeg)
            .args(["-v", "error", "-i"])
            .arg(&path)
            .args(["-f", "null", "-"])
            .output()
            .unwrap();
        let _ = std::fs::remove_file(&path);
        assert!(
            decoded.status.success(),
            "{}",
            String::from_utf8_lossy(&decoded.stderr)
        );
    }

    #[test]
    fn ffmpeg_sidecar_writes_a_faststart_mp4_when_present() {
        let ffmpeg = PathBuf::from("/usr/bin/ffmpeg");
        if !ffmpeg.is_file() {
            if std::env::var_os("CI").is_some() {
                panic!("ffmpeg is required in CI to check the sidecar encoder");
            }
            return;
        }
        let plan = clip_from(64, 48, 4);
        let encoded = encode_with_ffmpeg(&ffmpeg, &plan, Some("libx264")).unwrap();
        mp4mux::require_discord_mp4(&encoded.bytes).unwrap();
        assert!(mp4mux::moov_before_mdat(&encoded.bytes));
        let path = std::env::temp_dir().join(format!("lark-clip-test-{}.mp4", std::process::id()));
        std::fs::write(&path, &encoded.bytes).unwrap();
        let decoded = Command::new(&ffmpeg)
            .args(["-v", "error", "-i"])
            .arg(&path)
            .args(["-f", "null", "-"])
            .output()
            .unwrap();
        let _ = std::fs::remove_file(&path);
        assert!(
            decoded.status.success(),
            "{}",
            String::from_utf8_lossy(&decoded.stderr)
        );
    }
}
