//! Timing for the work the shell does before the window can take input.
//! Config parse, the on-disk message cache, and one gateway frame.

use std::hint::black_box;
use std::time::Instant;

use serde_json::json;

use crate::cache::{decode_cache, encode_cache, CachedChannel};
use crate::config::parse_config;
use crate::discord::gateway::parse_frame;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BootSample {
    pub config_us: u128,
    pub cache_us: u128,
    pub frame_us: u128,
}

/// Median microseconds for one pass of each critical step.
pub fn measure_boot(iters: u32) -> BootSample {
    let rounds = iters.max(1);
    let config = include_str!("../../../config.example.toml");
    let cache = sample_cache();
    let frame = sample_frame();
    BootSample {
        config_us: median_us(rounds, || {
            black_box(parse_config(black_box(config)).is_ok());
        }),
        cache_us: median_us(rounds, || {
            black_box(decode_cache(black_box(&cache)).len());
        }),
        frame_us: median_us(rounds, || {
            black_box(parse_frame(black_box(&frame)).is_ok());
        }),
    }
}

fn median_us(iters: u32, body: impl Fn()) -> u128 {
    let warmup = 3u32;
    for _ in 0..warmup {
        body();
    }
    let mut samples = Vec::with_capacity(iters as usize);
    for _ in 0..iters {
        let start = Instant::now();
        body();
        samples.push(start.elapsed().as_nanos());
    }
    samples.sort_unstable();
    let mid = samples[samples.len() / 2];
    mid / 1_000
}

fn sample_cache() -> String {
    let mut channels = Vec::with_capacity(12);
    for channel in 0..12 {
        let mut messages = Vec::with_capacity(40);
        for index in 0..40 {
            messages.push(json!({
                "id": format!("{channel}{index:04}"),
                "content": "cached line",
                "author": "ada"
            }));
        }
        channels.push(CachedChannel {
            channel_id: format!("1000000000000000{channel:02}"),
            messages,
        });
    }
    encode_cache(&channels)
}

fn sample_frame() -> String {
    json!({
        "op": 0,
        "t": "MESSAGE_CREATE",
        "s": 8,
        "d": {
            "id": "100000000000000099",
            "channel_id": "100000000000000021",
            "content": "hello from the gateway",
            "author": { "id": "100000000000000001", "username": "ada" }
        }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boot_timing() {
        let sample = measure_boot(21);
        assert!(sample.config_us > 0 || sample.cache_us > 0 || sample.frame_us > 0);
        println!(
            "LARK_BOOT {{\"config_us\":{},\"cache_us\":{},\"frame_us\":{}}}",
            sample.config_us, sample.cache_us, sample.frame_us
        );
    }
}
