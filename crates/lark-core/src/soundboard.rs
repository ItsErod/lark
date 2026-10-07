//! Local soundboard clips mixed into the outgoing voice frame.
//!
//! Clips are PCM WAV files. Playback is a short queue of 48 kHz mono samples
//! the voice thread adds on top of the microphone. It is not a second call.

use std::collections::VecDeque;

pub const SAMPLE_RATE: u32 = 48_000;
pub const MAX_SECONDS: u32 = 15;
pub const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_TRACKS: usize = 4;
const MAX_SAMPLES: usize = SAMPLE_RATE as usize * MAX_SECONDS as usize;

#[derive(Debug, Default)]
pub struct SoundMix {
    tracks: Vec<VecDeque<f32>>,
}

impl SoundMix {
    pub fn new() -> Self {
        Self { tracks: Vec::new() }
    }

    pub fn clear(&mut self) {
        self.tracks.clear();
    }

    pub fn push(&mut self, pcm: Vec<f32>) {
        if pcm.is_empty() {
            return;
        }
        if self.tracks.len() >= MAX_TRACKS {
            self.tracks.remove(0);
        }
        self.tracks.push(VecDeque::from(pcm));
    }

    /// Adds queued clip audio onto `frame`. Returns true when any sample was mixed.
    pub fn mix_into(&mut self, frame: &mut [f32]) -> bool {
        let mut played = false;
        for track in &mut self.tracks {
            for sample in frame.iter_mut() {
                let Some(extra) = track.pop_front() else { break };
                *sample = (*sample + extra).clamp(-1.0, 1.0);
                played = true;
            }
        }
        self.tracks.retain(|track| !track.is_empty());
        played
    }
}

/// Decode a PCM WAV into 48 kHz mono samples in `-1.0..1.0`.
pub fn decode_wav_mono(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() > MAX_BYTES {
        return Err("That sound file is larger than 8 MB.".into());
    }
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Soundboard clips have to be WAV files.".into());
    }
    let mut offset = 12usize;
    let mut format = 0u16;
    let mut channels = 0u16;
    let mut rate = 0u32;
    let mut bits = 0u16;
    let mut data: Option<&[u8]> = None;
    while offset + 8 <= bytes.len() {
        let id = &bytes[offset..offset + 4];
        let size = read_u32(bytes, offset + 4).ok_or_else(|| "That WAV file is incomplete.".to_string())? as usize;
        let start = offset + 8;
        let end = start.checked_add(size).ok_or_else(|| "That WAV file is incomplete.".to_string())?;
        if end > bytes.len() {
            return Err("That WAV file is incomplete.".into());
        }
        if id == b"fmt " && size >= 16 {
            format = read_u16(bytes, start).unwrap_or(0);
            channels = read_u16(bytes, start + 2).unwrap_or(0);
            rate = read_u32(bytes, start + 4).unwrap_or(0);
            bits = read_u16(bytes, start + 14).unwrap_or(0);
        } else if id == b"data" {
            data = Some(&bytes[start..end]);
        }
        offset = end + (size % 2);
    }
    let data = data.ok_or_else(|| "That WAV file has no audio.".to_string())?;
    if !(1..=2).contains(&channels) || !(8_000..=96_000).contains(&rate) {
        return Err("That WAV file uses a sample rate or channel count Lark cannot play.".into());
    }
    let mono = match (format, bits) {
        (1, 16) => pcm16_mono(data, channels)?,
        (1, 8) => pcm8_mono(data, channels)?,
        (3, 32) => pcm32_mono(data, channels)?,
        _ => return Err("That WAV file is not 8-bit, 16-bit, or 32-bit float PCM.".into()),
    };
    if mono.is_empty() {
        return Err("That WAV file has no audio.".into());
    }
    let samples = to_48k(&mono, rate);
    if samples.len() > MAX_SAMPLES {
        return Err("That clip is longer than 15 seconds.".into());
    }
    Ok(samples)
}

fn pcm16_mono(data: &[u8], channels: u16) -> Result<Vec<f32>, String> {
    let width = channels as usize * 2;
    let frames = data.len() / width;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let mut sum = 0f32;
        for channel in 0..channels as usize {
            let at = frame * width + channel * 2;
            let sample = i16::from_le_bytes([data[at], data[at + 1]]) as f32 / 32_768.0;
            sum += sample;
        }
        mono.push((sum / channels as f32).clamp(-1.0, 1.0));
    }
    Ok(mono)
}

fn pcm8_mono(data: &[u8], channels: u16) -> Result<Vec<f32>, String> {
    let width = channels as usize;
    let frames = data.len() / width;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let mut sum = 0f32;
        for channel in 0..width {
            let sample = (data[frame * width + channel] as f32 - 128.0) / 128.0;
            sum += sample;
        }
        mono.push((sum / channels as f32).clamp(-1.0, 1.0));
    }
    Ok(mono)
}

fn pcm32_mono(data: &[u8], channels: u16) -> Result<Vec<f32>, String> {
    let width = channels as usize * 4;
    let frames = data.len() / width;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let mut sum = 0f32;
        for channel in 0..channels as usize {
            let at = frame * width + channel * 4;
            let sample = f32::from_le_bytes([data[at], data[at + 1], data[at + 2], data[at + 3]]);
            sum += sample;
        }
        mono.push((sum / channels as f32).clamp(-1.0, 1.0));
    }
    Ok(mono)
}

fn to_48k(mono: &[f32], rate: u32) -> Vec<f32> {
    if rate == SAMPLE_RATE {
        return mono.to_vec();
    }
    let out_len = ((mono.len() as u64 * u64::from(SAMPLE_RATE)) / u64::from(rate)).max(1) as usize;
    resample(mono, out_len.min(MAX_SAMPLES + SAMPLE_RATE as usize))
}

fn resample(input: &[f32], out_len: usize) -> Vec<f32> {
    if out_len == 0 {
        return Vec::new();
    }
    if input.is_empty() {
        return vec![0.0; out_len];
    }
    if input.len() == out_len {
        return input.to_vec();
    }
    let mut out = Vec::with_capacity(out_len);
    let last = (input.len() - 1) as f32;
    let scale = if out_len == 1 { 0.0 } else { last / (out_len - 1) as f32 };
    for index in 0..out_len {
        let pos = index as f32 * scale;
        let idx = pos.floor() as usize;
        let frac = pos - idx as f32;
        let a = input[idx.min(input.len() - 1)];
        let b = input[(idx + 1).min(input.len() - 1)];
        out.push(a + (b - a) * frac);
    }
    out
}

fn read_u16(bytes: &[u8], at: usize) -> Option<u16> {
    bytes.get(at..at + 2).map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
}

fn read_u32(bytes: &[u8], at: usize) -> Option<u32> {
    bytes.get(at..at + 4).map(|chunk| u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav_pcm16(rate: u32, channels: u16, samples: &[i16]) -> Vec<u8> {
        let data_bytes = samples.len() * 2;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_bytes as u32).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&rate.to_le_bytes());
        let block = channels * 2;
        bytes.extend_from_slice(&(rate * u32::from(block)).to_le_bytes());
        bytes.extend_from_slice(&block.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(data_bytes as u32).to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn pcm16_mono_comes_back_at_48k() {
        let wav = wav_pcm16(48_000, 1, &[0, 16_384, -16_384]);
        let pcm = decode_wav_mono(&wav).unwrap();
        assert_eq!(pcm.len(), 3);
        assert!(pcm[0].abs() < 0.001);
        assert!((pcm[1] - 0.5).abs() < 0.01);
        assert!((pcm[2] + 0.5).abs() < 0.01);
    }

    #[test]
    fn stereo_is_averaged_and_other_rates_are_resampled() {
        let wav = wav_pcm16(8_000, 2, &[16_384, 0, 0, 0]);
        let pcm = decode_wav_mono(&wav).unwrap();
        assert!(pcm.len() > 2);
        assert!(pcm[0] > 0.2);
    }

    #[test]
    fn a_non_wav_is_refused() {
        assert!(decode_wav_mono(b"not a wav").is_err());
    }

    #[test]
    fn overlapping_clips_add_until_they_end() {
        let mut mix = SoundMix::new();
        mix.push(vec![0.4, 0.4, 0.4]);
        mix.push(vec![0.4, 0.4]);
        let mut frame = vec![0.0; 4];
        assert!(mix.mix_into(&mut frame));
        assert!((frame[0] - 0.8).abs() < 0.001);
        assert!((frame[1] - 0.8).abs() < 0.001);
        assert!((frame[2] - 0.4).abs() < 0.001);
        assert_eq!(frame[3], 0.0);
        assert!(!mix.mix_into(&mut frame));
    }
}
