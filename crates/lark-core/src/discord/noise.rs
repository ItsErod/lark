//! Microphone noise suppression.
//!
//! This is the RNNoise model (via the `nnnoiseless` port), not a high-pass gate.
//! It does not cancel echo. The state has to survive from one 20 ms voice frame
//! to the next, so the media thread owns one suppressor for the whole call.

use nnnoiseless::DenoiseState;

const FRAME: usize = DenoiseState::FRAME_SIZE;

pub struct NoiseSuppressor {
    state: Box<DenoiseState<'static>>,
}

impl NoiseSuppressor {
    pub fn new() -> Self {
        Self { state: DenoiseState::new() }
    }

    /// `samples` are mono PCM in `-1.0..1.0` at 48 kHz. Lengths that are not a
    /// multiple of 10 ms keep the tail unchanged.
    pub fn process(&mut self, samples: &mut [f32]) {
        let mut input = [0f32; FRAME];
        let mut output = [0f32; FRAME];
        let mut offset = 0;
        while offset + FRAME <= samples.len() {
            for (slot, sample) in input.iter_mut().zip(samples[offset..offset + FRAME].iter()) {
                *slot = sample * 32_768.0;
            }
            self.state.process_frame(&mut output, &input);
            for (sample, cleaned) in samples[offset..offset + FRAME].iter_mut().zip(output.iter()) {
                *sample = (cleaned / 32_768.0).clamp(-1.0, 1.0);
            }
            offset += FRAME;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn energy(samples: &[f32]) -> f32 {
        samples.iter().map(|sample| sample * sample).sum()
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
}
