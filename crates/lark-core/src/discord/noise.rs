//! Microphone noise suppression.
//!
//! Standard quality is the RNNoise model (via the `nnnoiseless` port) after an
//! 80 Hz high-pass. A speech-probability blend keeps a little of the original
//! while someone is talking.
//!
//! Higher quality is an original spectral suppressor (Hann-free Wiener gain on
//! a short FFT) plus a longer FIR echo canceller. Both are in this crate.
//! Neither path is Krisp.

use nnnoiseless::DenoiseState;

const FRAME: usize = DenoiseState::FRAME_SIZE;
/// One-pole high-pass near 80 Hz at 48 kHz: `exp(-2π·80/48000)`.
const HP_R: f32 = 0.9896;
const FFT: usize = 512;
const BINS: usize = FFT / 2 + 1;
const FIR: usize = 64;

pub struct NoiseSuppressor {
    state: Box<DenoiseState<'static>>,
    hp_x: f32,
    hp_y: f32,
}

impl NoiseSuppressor {
    pub fn new() -> Self {
        Self { state: DenoiseState::new(), hp_x: 0.0, hp_y: 0.0 }
    }

    /// `samples` are mono PCM in `-1.0..1.0` at 48 kHz. Lengths that are not a
    /// multiple of 10 ms keep the tail unchanged.
    pub fn process(&mut self, samples: &mut [f32]) {
        self.highpass(samples);
        let mut input = [0f32; FRAME];
        let mut output = [0f32; FRAME];
        let mut offset = 0;
        while offset + FRAME <= samples.len() {
            let view = &samples[offset..offset + FRAME];
            for (slot, sample) in input.iter_mut().zip(view.iter()) {
                *slot = sample * 32_768.0;
            }
            let vad = self.state.process_frame(&mut output, &input).clamp(0.0, 1.0);
            let keep = (vad * 0.2).min(0.2);
            for (index, cleaned) in output.iter().enumerate() {
                let original = samples[offset + index];
                let denoised = (cleaned / 32_768.0).clamp(-1.0, 1.0);
                samples[offset + index] = (denoised * (1.0 - keep) + original * keep).clamp(-1.0, 1.0);
            }
            offset += FRAME;
        }
    }

    fn highpass(&mut self, samples: &mut [f32]) {
        let mut x1 = self.hp_x;
        let mut y1 = self.hp_y;
        for sample in samples.iter_mut() {
            let x = *sample;
            let y = (x - x1 + HP_R * y1).clamp(-1.0, 1.0);
            x1 = x;
            y1 = y;
            *sample = y;
        }
        self.hp_x = x1;
        self.hp_y = y1;
    }
}

/// Spectral noise suppressor. Stationary noise is tracked per bin and pulled down.
/// A sudden louder tone is left mostly alone.
pub struct SpectralSuppressor {
    noise: [f32; BINS],
    frames: u32,
}

impl SpectralSuppressor {
    pub fn new() -> Self {
        Self { noise: [0.0; BINS], frames: 0 }
    }

    pub fn process(&mut self, samples: &mut [f32]) {
        let mut offset = 0;
        while offset + FRAME <= samples.len() {
            self.process_hop(&mut samples[offset..offset + FRAME]);
            offset += FRAME;
        }
    }

    fn process_hop(&mut self, hop: &mut [f32]) {
        let mut re = [0f32; FFT];
        let mut im = [0f32; FFT];
        re[..hop.len()].copy_from_slice(hop);
        fft(&mut re, &mut im, false);
        let mut gain = [1f32; BINS];
        for bin in 0..BINS {
            let power = re[bin] * re[bin] + im[bin] * im[bin];
            let floor = &mut self.noise[bin];
            if self.frames < 6 || power < *floor * 1.5 {
                *floor = 0.8 * *floor + 0.2 * power;
            } else {
                *floor = 0.995 * *floor + 0.005 * power;
            }
            let prior = power / (*floor + 1.0e-8);
            gain[bin] = (prior / (1.0 + prior)).clamp(0.05, 1.0);
        }
        for bin in 0..FFT {
            let band = if bin <= FFT / 2 { bin } else { FFT - bin };
            re[bin] *= gain[band];
            im[bin] *= gain[band];
        }
        fft(&mut re, &mut im, true);
        hop.copy_from_slice(&re[..hop.len()]);
        for sample in hop.iter_mut() {
            if !sample.is_finite() {
                *sample = 0.0;
            } else {
                *sample = sample.clamp(-1.0, 1.0);
            }
        }
        self.frames = self.frames.saturating_add(1);
    }
}

/// FIR NLMS echo canceller. Adapts a short filter against the playback reference
/// and freezes while near-end speech is much louder than the reference.
pub struct FirAec {
    weights: [f32; FIR],
    hist: [f32; FIR],
}

impl FirAec {
    pub fn new() -> Self {
        Self { weights: [0.0; FIR], hist: [0.0; FIR] }
    }

    pub fn process(&mut self, frame: &mut [f32], reference: &[f32]) {
        let count = frame.len().min(reference.len());
        for index in 0..count {
            self.hist.copy_within(0..FIR - 1, 1);
            self.hist[0] = reference[index];
            let mut echo = 0.0;
            let mut power = 1.0e-4;
            for tap in 0..FIR {
                echo += self.weights[tap] * self.hist[tap];
                power += self.hist[tap] * self.hist[tap];
            }
            let err = frame[index] - echo;
            let near = frame[index].abs();
            let far = reference[index].abs();
            let far_energy: f32 = self.hist.iter().map(|sample| sample * sample).sum();
            let freeze = far_energy < 0.01 || (near > 0.15 && far < 0.05 && echo.abs() < near * 0.3);
            if !freeze {
                let step = 0.45 / power;
                for tap in 0..FIR {
                    let next = self.weights[tap] + step * err * self.hist[tap];
                    self.weights[tap] = next.clamp(-2.0, 2.0);
                }
            }
            frame[index] = err.clamp(-1.0, 1.0);
        }
    }
}

fn fft(re: &mut [f32], im: &mut [f32], inverse: bool) {
    let n = re.len();
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = std::f32::consts::TAU / len as f32 * if inverse { 1.0 } else { -1.0 };
        let wlen_re = ang.cos();
        let wlen_im = ang.sin();
        let mut start = 0;
        while start < n {
            let mut w_re = 1.0;
            let mut w_im = 0.0;
            for k in 0..len / 2 {
                let a = start + k;
                let b = a + len / 2;
                let t_re = w_re * re[b] - w_im * im[b];
                let t_im = w_re * im[b] + w_im * re[b];
                re[b] = re[a] - t_re;
                im[b] = im[a] - t_im;
                re[a] += t_re;
                im[a] += t_im;
                let next_re = w_re * wlen_re - w_im * wlen_im;
                w_im = w_re * wlen_im + w_im * wlen_re;
                w_re = next_re;
            }
            start += len;
        }
        len <<= 1;
    }
    if inverse {
        let scale = 1.0 / n as f32;
        for index in 0..n {
            re[index] *= scale;
            im[index] *= scale;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn energy(samples: &[f32]) -> f32 {
        samples.iter().map(|sample| sample * sample).sum()
    }

    fn unit_noise(seed: &mut u32) -> f32 {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 17;
        *seed ^= *seed << 5;
        (*seed as i32 as f32) / (i32::MAX as f32)
    }

    #[test]
    fn silence_stays_near_silence() {
        let mut denoiser = NoiseSuppressor::new();
        let mut frame = vec![0f32; FRAME * 2];
        denoiser.process(&mut frame);
        denoiser.process(&mut frame);
        assert!(frame.iter().all(|sample| sample.is_finite() && sample.abs() < 0.02));
    }

    #[test]
    fn a_steady_hum_gets_quieter() {
        let mut denoiser = NoiseSuppressor::new();
        let hum = vec![0.02f32; FRAME];
        let before = energy(&hum);
        let mut last = hum.clone();
        for _ in 0..24 {
            last = hum.clone();
            denoiser.process(&mut last);
        }
        let after = energy(&last);
        assert!(last.iter().all(|sample| sample.is_finite() && sample.abs() <= 1.0));
        assert!(after < before * 0.5, "hum energy {before} -> {after}");
    }

    #[test]
    fn a_cosine_lands_on_its_fft_bin() {
        let mut re = [0f32; FFT];
        let mut im = [0f32; FFT];
        let bin = 8usize;
        for (index, sample) in re.iter_mut().enumerate() {
            *sample = (index as f32 * bin as f32 * std::f32::consts::TAU / FFT as f32).cos();
        }
        fft(&mut re, &mut im, false);
        let peak = (0..BINS).max_by(|&a, &b| {
            let pa = re[a] * re[a] + im[a] * im[a];
            let pb = re[b] * re[b] + im[b] * im[b];
            pa.partial_cmp(&pb).unwrap()
        });
        assert_eq!(peak, Some(bin));
    }

    #[test]
    fn spectral_suppression_quiets_noise_and_keeps_a_tone() {
        let mut spectral = SpectralSuppressor::new();
        let mut seed = 0x1234_5678u32;
        let mut last = vec![0f32; FRAME];
        let mut before = 0.0;
        for _ in 0..12 {
            let mut hop = vec![0f32; FRAME];
            for sample in &mut hop {
                *sample = unit_noise(&mut seed) * 0.02;
            }
            before = energy(&hop);
            spectral.process(&mut hop);
            last = hop;
        }
        let after = energy(&last);
        assert!(after < before * 0.55, "noise energy {before} -> {after}");

        let mut tone = vec![0f32; FRAME];
        for (index, sample) in tone.iter_mut().enumerate() {
            *sample = (index as f32 * 1_000.0 * std::f32::consts::TAU / 48_000.0).sin() * 0.4;
        }
        let loud = energy(&tone);
        spectral.process(&mut tone);
        let kept = energy(&tone);
        assert!(kept > loud * 0.25, "tone energy {loud} -> {kept}");
        assert!(tone.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn fir_aec_cancels_a_delayed_echo_and_freezes_on_double_talk() {
        let mut aec = FirAec::new();
        let mut seed = 0x00C0_FFEE_u32;
        let delay = 20usize;
        let mut line = vec![0f32; delay];
        let mut cursor = 0usize;
        let mut raw = 0.0;
        let mut left = 0.0;
        for _ in 0..60 {
            let mut reference = vec![0f32; 320];
            let mut mic = vec![0f32; 320];
            for index in 0..320 {
                let sample = unit_noise(&mut seed) * 0.4;
                reference[index] = sample;
                mic[index] = 0.6 * line[cursor];
                line[cursor] = sample;
                cursor = (cursor + 1) % delay;
            }
            raw = energy(&mic);
            aec.process(&mut mic, &reference);
            left = energy(&mic);
        }
        assert!(left < raw * 0.2, "echo energy {raw} -> {left}");

        let mut drain = vec![0f32; FIR];
        aec.process(&mut drain, &vec![0f32; FIR]);
        let weights = aec.weights;
        let mut speech = vec![0.3f32; 320];
        aec.process(&mut speech, &vec![0f32; 320]);
        assert!(speech.iter().all(|sample| (*sample - 0.3).abs() < 0.05));
        assert_eq!(aec.weights, weights);
    }
}
