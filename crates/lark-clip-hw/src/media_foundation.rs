//! Media Foundation H.264 + AAC file writer.
//!
//! Hardware transforms are requested on the sink writer. The encode runs only for
//! the frames already in the clip ring, with throttling off so it does not pace
//! itself against the display clock while a game is running.

use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;

use windows::core::PCWSTR;
use windows::Win32::Media::MediaFoundation::{
    IMFMediaType, IMFSinkWriter, MFAudioFormat_AAC, MFAudioFormat_PCM, MFCreateAttributes,
    MFCreateMediaType, MFCreateMemoryBuffer, MFCreateSample, MFCreateSinkWriterFromURL,
    MFMediaType_Audio, MFMediaType_Video, MFStartup, MFVideoFormat_H264, MFVideoFormat_RGB32,
    MFVideoInterlace_Progressive, MFSTARTUP_NOSOCKET, MF_MT_AAC_PAYLOAD_TYPE,
    MF_MT_AUDIO_AVG_BYTES_PER_SECOND, MF_MT_AUDIO_BITS_PER_SAMPLE, MF_MT_AUDIO_BLOCK_ALIGNMENT,
    MF_MT_AUDIO_NUM_CHANNELS, MF_MT_AUDIO_SAMPLES_PER_SECOND, MF_MT_AVG_BITRATE,
    MF_MT_DEFAULT_STRIDE, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE, MF_MT_INTERLACE_MODE,
    MF_MT_MAJOR_TYPE, MF_MT_PIXEL_ASPECT_RATIO, MF_MT_SUBTYPE,
    MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, MF_SINK_WRITER_DISABLE_THROTTLING, MF_VERSION,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use crate::HardwareClip;

pub fn encode(
    width: u32,
    height: u32,
    fps: u32,
    frame_count: usize,
    mut rgba_at: impl FnMut(usize) -> Result<Vec<u8>, String>,
) -> Result<HardwareClip, String> {
    if width < 2 || height < 2 || width % 2 != 0 || height % 2 != 0 || fps == 0 || frame_count == 0
    {
        return Err("Media Foundation cannot encode that clip.".into());
    }
    let path = std::env::temp_dir().join(format!(
        "lark-mf-{}-{}.mp4",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0)
    ));
    let written = unsafe { write_mp4(&path, width, height, fps, frame_count, &mut rgba_at) };
    let bytes = match &written {
        Ok(()) => std::fs::read(&path)
            .map_err(|err| format!("Couldn't read the Media Foundation clip: {err}")),
        Err(err) => Err(err.clone()),
    };
    let _ = std::fs::remove_file(&path);
    Ok(HardwareClip::Mp4(bytes?))
}

unsafe fn write_mp4(
    path: &PathBuf,
    width: u32,
    height: u32,
    fps: u32,
    frame_count: usize,
    rgba_at: &mut impl FnMut(usize) -> Result<Vec<u8>, String>,
) -> Result<(), String> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)
        .map_err(|err| format!("Media Foundation did not start: {err}"))?;
    let mut attributes = None;
    MFCreateAttributes(&mut attributes, 4)
        .map_err(|err| format!("Media Foundation did not start: {err}"))?;
    let attributes = attributes.ok_or("Media Foundation did not start.")?;
    attributes
        .SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1)
        .map_err(|err| format!("Media Foundation hardware encoder was refused: {err}"))?;
    let _ = attributes.SetUINT32(&MF_SINK_WRITER_DISABLE_THROTTLING, 1);
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let writer = MFCreateSinkWriterFromURL(PCWSTR(wide.as_ptr()), None, &attributes)
        .map_err(|err| format!("Media Foundation could not open the clip: {err}"))?;
    let bitrate = target_bitrate(frame_count, fps);
    let video = add_video(&writer, width, height, fps, bitrate)?;
    let audio = add_audio(&writer)?;
    writer
        .BeginWriting()
        .map_err(|err| format!("Media Foundation could not start writing: {err}"))?;
    let frame_ticks = 10_000_000i64 / i64::from(fps);
    for index in 0..frame_count {
        let rgba = rgba_at(index)?;
        if rgba.len() != width as usize * height as usize * 4 {
            return Err("A clip frame changed size.".into());
        }
        write_video_frame(
            &writer,
            video,
            &rgba,
            width,
            index as i64 * frame_ticks,
            frame_ticks,
        )?;
    }
    let audio_ticks = 1_024i64 * 10_000_000 / 44_100;
    let mut written = 0i64;
    while written < frame_ticks * frame_count as i64 {
        write_silence(&writer, audio, written, audio_ticks)?;
        written += audio_ticks;
    }
    writer
        .Finalize()
        .map_err(|err| format!("Media Foundation could not finish the clip: {err}"))?;
    Ok(())
}

unsafe fn add_video(
    writer: &IMFSinkWriter,
    width: u32,
    height: u32,
    fps: u32,
    bitrate: u32,
) -> Result<u32, String> {
    let output =
        MFCreateMediaType().map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    output
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    output
        .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    output
        .SetUINT32(&MF_MT_AVG_BITRATE, bitrate)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    set_size(&output, &MF_MT_FRAME_SIZE, width, height)?;
    set_ratio(&output, &MF_MT_FRAME_RATE, fps, 1)?;
    set_ratio(&output, &MF_MT_PIXEL_ASPECT_RATIO, 1, 1)?;
    output
        .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    let index = writer
        .AddStream(&output)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    let input =
        MFCreateMediaType().map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    input
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    input
        .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    set_size(&input, &MF_MT_FRAME_SIZE, width, height)?;
    set_ratio(&input, &MF_MT_FRAME_RATE, fps, 1)?;
    set_ratio(&input, &MF_MT_PIXEL_ASPECT_RATIO, 1, 1)?;
    input
        .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    input
        .SetUINT32(&MF_MT_DEFAULT_STRIDE, width.saturating_mul(4))
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    writer
        .SetInputMediaType(index, &input, None)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))?;
    Ok(index)
}

unsafe fn add_audio(writer: &IMFSinkWriter) -> Result<u32, String> {
    let output =
        MFCreateMediaType().map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 44_100)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetUINT32(&MF_MT_AAC_PAYLOAD_TYPE, 0)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    output
        .SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 16_000)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    let index = writer
        .AddStream(&output)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    let input =
        MFCreateMediaType().map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 44_100)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 4)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    input
        .SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 44_100 * 4)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    writer
        .SetInputMediaType(index, &input, None)
        .map_err(|err| format!("Media Foundation audio setup failed: {err}"))?;
    Ok(index)
}

unsafe fn write_video_frame(
    writer: &IMFSinkWriter,
    stream: u32,
    rgba: &[u8],
    width: u32,
    time: i64,
    duration: i64,
) -> Result<(), String> {
    let byte_count = rgba.len() as u32;
    let sample = MFCreateSample()
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    let buffer = MFCreateMemoryBuffer(byte_count)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    let mut data = std::ptr::null_mut();
    buffer
        .Lock(&mut data, None, None)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    if !data.is_null() {
        let pixels = width as usize;
        let height = rgba.len() / (pixels * 4);
        for row in 0..height {
            let src = &rgba[row * pixels * 4..(row + 1) * pixels * 4];
            let dst = std::slice::from_raw_parts_mut(data.add(row * pixels * 4), pixels * 4);
            for pixel in 0..pixels {
                dst[pixel * 4] = src[pixel * 4 + 2];
                dst[pixel * 4 + 1] = src[pixel * 4 + 1];
                dst[pixel * 4 + 2] = src[pixel * 4];
                dst[pixel * 4 + 3] = 255;
            }
        }
    }
    buffer.Unlock().ok();
    buffer
        .SetCurrentLength(byte_count)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    sample
        .AddBuffer(&buffer)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    sample
        .SetSampleTime(time)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    sample
        .SetSampleDuration(duration)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    writer
        .WriteSample(stream, &sample)
        .map_err(|err| format!("Media Foundation could not write a frame: {err}"))?;
    Ok(())
}

unsafe fn write_silence(
    writer: &IMFSinkWriter,
    stream: u32,
    time: i64,
    duration: i64,
) -> Result<(), String> {
    let byte_count = 1_024u32 * 4;
    let sample =
        MFCreateSample().map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    let buffer = MFCreateMemoryBuffer(byte_count)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    let mut data = std::ptr::null_mut();
    buffer
        .Lock(&mut data, None, None)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    if !data.is_null() {
        std::ptr::write_bytes(data, 0, byte_count as usize);
    }
    buffer.Unlock().ok();
    buffer
        .SetCurrentLength(byte_count)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    sample
        .AddBuffer(&buffer)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    sample
        .SetSampleTime(time)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    sample
        .SetSampleDuration(duration)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    writer
        .WriteSample(stream, &sample)
        .map_err(|err| format!("Media Foundation could not write audio: {err}"))?;
    Ok(())
}

unsafe fn set_size(
    media_type: &IMFMediaType,
    key: &windows::core::GUID,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let packed = (u64::from(width) << 32) | u64::from(height);
    media_type
        .SetUINT64(key, packed)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))
}

unsafe fn set_ratio(
    media_type: &IMFMediaType,
    key: &windows::core::GUID,
    numerator: u32,
    denominator: u32,
) -> Result<(), String> {
    let packed = (u64::from(numerator) << 32) | u64::from(denominator);
    media_type
        .SetUINT64(key, packed)
        .map_err(|err| format!("Media Foundation video setup failed: {err}"))
}

fn target_bitrate(frames: usize, fps: u32) -> u32 {
    let millis = (frames.max(1) as u64) * 1000 / u64::from(fps.max(1));
    let bits = 6_500_000u64 * 8 * 1000 / millis.max(1);
    bits.clamp(200_000, 4_000_000) as u32
}
