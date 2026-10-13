//! Rolling system and microphone audio for a clip.
//!
//! Samples are mono 16-bit at 48 kHz. The window matches the video buffer, and
//! each track is capped so a two-minute buffer stays near 23 MB for both tracks.
//! Encoding to AAC happens when the clip is saved.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};

pub const PCM_RATE: u32 = 48_000;

/// One mono track. Older samples fall off the front as the window fills.
#[derive(Debug, Clone)]
pub struct PcmRing {
    window_ms: u64,
    samples: VecDeque<i16>,
}

impl PcmRing {
    pub fn new(window_ms: u64) -> Self {
        Self {
            window_ms: window_ms.max(1_000),
            samples: VecDeque::new(),
        }
    }

    pub fn set_window(&mut self, window_ms: u64) {
        self.window_ms = window_ms.max(1_000);
        self.trim();
    }

    pub fn clear(&mut self) {
        self.samples.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn stored_bytes(&self) -> usize {
        self.samples.len().saturating_mul(2)
    }

    pub fn push(&mut self, incoming: &[f32]) {
        for sample in incoming {
            let clamped = sample.clamp(-1.0, 1.0);
            self.samples.push_back((clamped * 32_767.0).round() as i16);
        }
        self.trim();
    }

    pub fn to_i16(&self) -> Vec<i16> {
        self.samples.iter().copied().collect()
    }

    fn cap(&self) -> usize {
        let seconds = (self.window_ms / 1_000).clamp(1, 120) as usize;
        (PCM_RATE as usize).saturating_mul(seconds)
    }

    fn trim(&mut self) {
        let cap = self.cap();
        while self.samples.len() > cap {
            self.samples.pop_front();
        }
    }
}

/// Fit a track to the video length. A missing track becomes silence of that length.
pub fn fit_pcm(samples: &[i16], duration_ms: u64) -> Vec<i16> {
    let needed = ((duration_ms.max(1) * u64::from(PCM_RATE)) / 1_000).max(1) as usize;
    let mut out = samples.to_vec();
    if out.len() > needed {
        out.truncate(needed);
    } else {
        out.resize(needed, 0);
    }
    out
}

pub fn wav_mono_i16(samples: &[i16], rate: u32) -> Vec<u8> {
    let rate = rate.max(1);
    let data_bytes = samples.len().saturating_mul(2);
    let mut out = Vec::with_capacity(44 + data_bytes);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_bytes as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate.saturating_mul(2)).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_bytes as u32).to_le_bytes());
    for sample in samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

/// Default input, mono f32. The capture thread pulls this. A missing device is an error.
pub struct MicTap {
    _stream: Stream,
    samples: Arc<Mutex<Vec<f32>>>,
}

impl MicTap {
    pub fn open() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No microphone is available.")?;
        let supported = device
            .default_input_config()
            .map_err(|err| format!("Couldn't open the microphone: {err}"))?;
        let channels = supported.channels().max(1) as usize;
        let config: StreamConfig = supported.config();
        let samples = Arc::new(Mutex::new(Vec::new()));
        let incoming = samples.clone();
        let format = supported.sample_format();
        let stream = match format {
            SampleFormat::F32 => device.build_input_stream(
                &config,
                move |data: &[f32], _| push_mono(&incoming, data, channels),
                |_| {},
                None,
            ),
            SampleFormat::I16 => {
                let incoming = samples.clone();
                device.build_input_stream(
                    &config,
                    move |data: &[i16], _| {
                        let floats: Vec<f32> = data
                            .iter()
                            .map(|sample| f32::from(*sample) / 32_768.0)
                            .collect();
                        push_mono(&incoming, &floats, channels);
                    },
                    |_| {},
                    None,
                )
            }
            _ => return Err("The microphone format is not supported.".into()),
        }
        .map_err(|err| format!("Couldn't open the microphone: {err}"))?;
        stream
            .play()
            .map_err(|err| format!("Couldn't start the microphone: {err}"))?;
        Ok(Self {
            _stream: stream,
            samples,
        })
    }

    pub fn pull(&self) -> Vec<f32> {
        let mut guard = self.samples.lock().unwrap_or_else(|err| err.into_inner());
        std::mem::take(&mut *guard)
    }
}

fn push_mono(samples: &Mutex<Vec<f32>>, frames: &[f32], channels: usize) {
    let channels = channels.max(1);
    let mut guard = samples.lock().unwrap_or_else(|err| err.into_inner());
    let mut index = 0;
    while index + channels <= frames.len() {
        let mut sum = 0f32;
        for channel in 0..channels {
            sum += frames[index + channel];
        }
        guard.push((sum / channels as f32).clamp(-1.0, 1.0));
        index += channels;
    }
    let cap = (PCM_RATE as usize).saturating_mul(2);
    if guard.len() > cap {
        let extra = guard.len() - cap;
        guard.drain(..extra);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ring_respects_the_window_and_the_memory_cap() {
        let mut ring = PcmRing::new(15_000);
        ring.push(&vec![0.5; PCM_RATE as usize * 30]);
        assert_eq!(ring.len(), PCM_RATE as usize * 15);
        assert!(ring.stored_bytes() <= PCM_RATE as usize * 15 * 2);
        ring.set_window(120_000);
        ring.push(&vec![0.25; PCM_RATE as usize * 200]);
        assert_eq!(ring.len(), PCM_RATE as usize * 120);
        assert!(ring.stored_bytes() <= 48_000 * 120 * 2);
        let both_tracks = ring.stored_bytes() * 2;
        assert!(both_tracks <= 24 * 1024 * 1024);
    }

    #[test]
    fn wav_and_fit_cover_the_video() {
        let fitted = fit_pcm(&[1, -1], 1_000);
        assert_eq!(fitted.len(), PCM_RATE as usize);
        assert_eq!(fitted[0], 1);
        assert_eq!(*fitted.last().unwrap(), 0);
        let wav = wav_mono_i16(&fitted[..4], PCM_RATE);
        assert!(wav.starts_with(b"RIFF"));
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(wav.len(), 44 + 8);
    }
}
