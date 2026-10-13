//! Acoustic echo cancellation for speaker playback.
//!
//! [`EchoControl`] is WebRTC AEC3 (via the pure-Rust `sonora` port). Each 10 ms
//! hop of the speaker mix is the far-end reference. The microphone is cancelled
//! after that, still at 48 kHz, before automatic gain control, RNNoise, and Opus.
//! The internal rate stays at 32 kHz, which is WebRTC's usual voice band and
//! keeps the extra work inside the capture thread's 20 ms budget. The filter
//! bank delays the microphone by about 10 ms. This path does not add another queue.

use std::collections::VecDeque;

use sonora::config::{DownmixMethod, EchoCanceller, MaxProcessingRate, Pipeline};
use sonora::{AudioProcessing, Config, StreamConfig};

const RATE: u32 = 48_000;
/// 10 ms at 48 kHz. AEC3 only accepts hops of this size.
const HOP: usize = 480;
/// One second. A stalled media thread must not replay a backlog into the canceller.
const RENDER_CAP: usize = RATE as usize;

pub struct EchoControl {
    apm: AudioProcessing,
    pending: VecDeque<f32>,
}

impl Default for EchoControl {
    fn default() -> Self {
        Self::new()
    }
}

impl EchoControl {
    pub fn new() -> Self {
        let pipeline = Pipeline {
            maximum_internal_processing_rate: MaxProcessingRate::Rate32kHz,
            multi_channel_render: false,
            multi_channel_capture: false,
            capture_downmix_method: DownmixMethod::AverageChannels,
        };
        let config = Config {
            pipeline,
            echo_canceller: Some(EchoCanceller::default()),
            ..Config::default()
        };
        let stream = StreamConfig::new(RATE, 1);
        debug_assert_eq!(stream.num_frames(), HOP);
        let mut apm = AudioProcessing::builder()
            .config(config)
            .capture_config(stream)
            .render_config(stream)
            .build();
        let _ = apm.set_stream_delay_ms(0);
        Self {
            apm,
            pending: VecDeque::with_capacity(HOP * 4),
        }
    }

    /// Queue speaker samples and run every full 10 ms hop through the far-end path.
    pub fn push_render(&mut self, reference: &[f32]) {
        for sample in reference {
            let sample = if sample.is_finite() {
                sample.clamp(-1.0, 1.0)
            } else {
                0.0
            };
            self.pending.push_back(sample);
        }
        if self.pending.len() > RENDER_CAP {
            let extra = self.pending.len() - RENDER_CAP;
            self.pending.drain(..extra);
        }
        let mut hop = [0f32; HOP];
        let mut out = [0f32; HOP];
        while self.take_hop(&mut hop) {
            let _ = self.apm.process_render_f32(&[&hop], &mut [&mut out]);
        }
    }

    /// Cancel echo in `mic`. `mic` stays 48 kHz mono. A short tail that is not
    /// a full hop is left unchanged so the Opus frame boundary stays put.
    pub fn cancel(&mut self, mic: &mut [f32]) {
        let mut hop = [0f32; HOP];
        let mut out = [0f32; HOP];
        let mut offset = 0;
        while offset + HOP <= mic.len() {
            hop.copy_from_slice(&mic[offset..offset + HOP]);
            for sample in &mut hop {
                if !sample.is_finite() {
                    *sample = 0.0;
                } else {
                    *sample = sample.clamp(-1.0, 1.0);
                }
            }
            if self
                .apm
                .process_capture_f32(&[&hop], &mut [&mut out])
                .is_ok()
            {
                for (slot, sample) in mic[offset..offset + HOP].iter_mut().zip(out) {
                    *slot = if sample.is_finite() {
                        sample.clamp(-1.0, 1.0)
                    } else {
                        0.0
                    };
                }
            }
            offset += HOP;
        }
    }

    /// Far-end first, then the microphone, one 10 ms hop at a time.
    pub fn process(&mut self, mic: &mut [f32], reference: &[f32]) {
        let mut mic_at = 0;
        let mut ref_at = 0;
        loop {
            let have_ref = ref_at + HOP <= reference.len();
            let have_mic = mic_at + HOP <= mic.len();
            if !have_ref && !have_mic {
                break;
            }
            if have_ref {
                self.push_render(&reference[ref_at..ref_at + HOP]);
                ref_at += HOP;
            }
            if have_mic {
                self.cancel(&mut mic[mic_at..mic_at + HOP]);
                mic_at += HOP;
            }
        }
        if ref_at < reference.len() {
            self.push_render(&reference[ref_at..]);
        }
    }

    pub fn reported_delay_ms(&self) -> Option<i32> {
        self.apm.statistics().delay_ms
    }

    pub fn reported_erle_db(&self) -> Option<f64> {
        self.apm.statistics().echo_return_loss_enhancement
    }

    fn take_hop(&mut self, hop: &mut [f32; HOP]) -> bool {
        if self.pending.len() < HOP {
            return false;
        }
        for slot in hop.iter_mut() {
            *slot = self.pending.pop_front().unwrap_or(0.0);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: usize = 960;

    fn power(samples: &[f32]) -> f64 {
        samples
            .iter()
            .map(|sample| {
                let value = f64::from(*sample);
                value * value
            })
            .sum()
    }

    fn db10(ratio: f64) -> f64 {
        10.0 * ratio.max(1.0e-12).log10()
    }

    fn unit_noise(seed: &mut u32) -> f32 {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 17;
        *seed ^= *seed << 5;
        (*seed as i32 as f32) / (i32::MAX as f32)
    }

    /// Speech-shaped far end: low-passed noise with a slow envelope.
    fn far_sample(index: usize, seed: &mut u32, state: &mut f32) -> f32 {
        let noise = unit_noise(seed);
        *state = 0.85 * *state + 0.15 * noise;
        let t = index as f32 / RATE as f32;
        let env = 0.55 + 0.45 * (t * 5.0 * std::f32::consts::TAU).sin();
        (*state * 0.9 * env).clamp(-0.8, 0.8)
    }

    /// Linear speaker path: a direct arrival plus two reflections.
    fn echo_at(far: &[f32], index: usize) -> f32 {
        const TAPS: [(usize, f32); 3] = [(2_400, 0.62), (3_456, 0.28), (5_280, 0.12)];
        let mut mixed = 0.0f32;
        for (delay, gain) in TAPS {
            if index >= delay {
                mixed += gain * far[index - delay];
            }
        }
        mixed.clamp(-1.0, 1.0)
    }

    fn near_sample(index: usize) -> f32 {
        let t = index as f32 / RATE as f32;
        let mut voiced = 0.0f32;
        let fundamental = 180.0f32;
        for harmonic in 1..=6 {
            let multiple = harmonic as f32;
            voiced += (t * fundamental * multiple * std::f32::consts::TAU).sin() / multiple;
        }
        let syllable = if (t * 3.5).fract() < 0.7 { 1.0 } else { 0.2 };
        (voiced * 0.18 * syllable).clamp(-0.8, 0.8)
    }

    fn best_corr(reference: &[f32], out: &[f32]) -> (f64, usize) {
        let mut best = 0.0f64;
        let mut best_lag = 0usize;
        let max_lag = 960.min(reference.len() / 2);
        for lag in 0..max_lag {
            let mut ab = 0.0f64;
            let mut aa = 0.0f64;
            let mut bb = 0.0f64;
            let count = reference.len() - lag;
            for index in 0..count {
                let left = f64::from(reference[index]);
                let right = f64::from(out[index + lag]);
                ab += left * right;
                aa += left * left;
                bb += right * right;
            }
            let corr = ab / (aa.sqrt() * bb.sqrt() + 1.0e-12);
            if corr.abs() > best.abs() {
                best = corr;
                best_lag = lag;
            }
        }
        (best, best_lag)
    }

    struct Scores {
        erle: f64,
        near_db: f64,
        near_corr: f64,
        near_lag: usize,
        talk_db: f64,
        talk_corr: f64,
        talk_lag: usize,
        mic_corr: f64,
        delay: Option<i32>,
        reported: Option<f64>,
        window_erle: Option<f64>,
    }

    fn run() -> Scores {
        let adapt = 5 * RATE as usize / 2;
        let echo_len = RATE as usize / 2;
        let talk_len = RATE as usize;
        let flush = RATE as usize / 4;
        let near_len = RATE as usize;
        let total = adapt + echo_len + talk_len + flush + near_len;
        let mut seed = 0xAEC3_5EED;
        let mut colour = 0.0f32;
        let mut far = vec![0f32; total];
        for (index, sample) in far.iter_mut().enumerate() {
            *sample = far_sample(index, &mut seed, &mut colour);
        }
        let mut echo = EchoControl::new();
        let mut echo_in = Vec::new();
        let mut echo_out = Vec::new();
        let mut near_in = Vec::new();
        let mut near_out = Vec::new();
        let mut talk_near = Vec::new();
        let mut talk_mic = Vec::new();
        let mut talk_out = Vec::new();
        let echo_at_start = adapt;
        let talk_at = adapt + echo_len;
        let talk_keep = talk_at + RATE as usize / 4;
        let near_at = talk_at + talk_len + flush;
        let near_keep = near_at + RATE as usize / 5;
        let mut offset = 0;
        let mut window_erle = None;
        while offset + FRAME <= total {
            let silent_far = offset >= talk_at + talk_len;
            let reference: Vec<f32> = if silent_far {
                vec![0.0; FRAME]
            } else {
                far[offset..offset + FRAME].to_vec()
            };
            let mut mic = vec![0f32; FRAME];
            let mut spoken = vec![0f32; FRAME];
            let echo_only = offset < talk_at;
            for index in 0..FRAME {
                let at = offset + index;
                let leaked = if silent_far { 0.0 } else { echo_at(&far, at) };
                let voice = if echo_only { 0.0 } else { near_sample(at) };
                spoken[index] = voice;
                mic[index] = (leaked + voice).clamp(-1.0, 1.0);
            }
            let keep_echo = offset >= echo_at_start && offset < talk_at;
            let keep_talk = offset >= talk_keep && offset < talk_at + talk_len;
            let keep_near = offset >= near_keep;
            if keep_echo {
                echo_in.extend_from_slice(&mic);
            }
            if keep_talk {
                talk_near.extend_from_slice(&spoken);
                talk_mic.extend_from_slice(&mic);
            }
            if keep_near {
                near_in.extend_from_slice(&spoken);
            }
            echo.process(&mut mic, &reference);
            if keep_echo {
                echo_out.extend_from_slice(&mic);
            }
            if keep_talk {
                talk_out.extend_from_slice(&mic);
            }
            if keep_near {
                near_out.extend_from_slice(&mic);
            }
            if window_erle.is_none() && offset + FRAME >= talk_at {
                window_erle = echo.reported_erle_db();
            }
            offset += FRAME;
        }
        let (near_corr, near_lag) = best_corr(&near_in, &near_out);
        let (talk_corr, talk_lag) = best_corr(&talk_near, &talk_out);
        let (mic_corr, _) = best_corr(&talk_near, &talk_mic);
        Scores {
            erle: db10(power(&echo_in) / power(&echo_out).max(1.0e-12)),
            near_db: db10(power(&near_out) / power(&near_in).max(1.0e-12)),
            near_corr: near_corr.abs(),
            near_lag,
            talk_db: db10(power(&talk_out) / power(&talk_near).max(1.0e-12)),
            talk_corr: talk_corr.abs(),
            talk_lag,
            mic_corr: mic_corr.abs(),
            delay: echo.reported_delay_ms(),
            reported: echo.reported_erle_db(),
            window_erle,
        }
    }

    #[test]
    fn echo_suppression_erle_and_near_end() {
        let scores = run();
        eprintln!(
            "AEC3 ERLE {:.1} dB (library at echo window {:?}, at end {:?}), delay {:?}; near-end {:.1} dB corr {:.3} lag {}; double-talk {:.1} dB corr {:.3} lag {} (mic corr {:.3})",
            scores.erle,
            scores.window_erle,
            scores.reported,
            scores.delay,
            scores.near_db,
            scores.near_corr,
            scores.near_lag,
            scores.talk_db,
            scores.talk_corr,
            scores.talk_lag,
            scores.mic_corr,
        );
        assert!(scores.erle.is_finite() && scores.near_db.is_finite());
        assert!(
            scores.erle >= 20.0,
            "ERLE {:.1} dB is below 20 dB on a 50 ms speaker path",
            scores.erle
        );
        assert!(
            scores.near_db > -4.0,
            "near-end speech changed by {:.1} dB with a silent far end",
            scores.near_db
        );
        assert!(
            scores.near_corr > 0.9,
            "near-end correlation {:.3} with a silent far end",
            scores.near_corr
        );
        assert!(
            scores.near_lag < 960,
            "near-end delay {} samples is past 20 ms",
            scores.near_lag
        );
        let delay = scores.delay.expect("delay estimate");
        assert!(
            (30..=80).contains(&delay),
            "delay estimate {delay} ms, speaker path is 50 ms"
        );
        assert!(
            scores.talk_db > -6.0,
            "double-talk speech level {:.1} dB",
            scores.talk_db
        );
        assert!(
            scores.talk_corr + 0.02 >= scores.mic_corr,
            "double-talk correlation {:.3} fell behind the echoey mic {:.3}",
            scores.talk_corr,
            scores.mic_corr
        );
    }
}
