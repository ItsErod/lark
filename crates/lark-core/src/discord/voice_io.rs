//! Microphone and speaker streams. The callbacks only copy samples.
//! Device names come from the voice settings; an empty name uses the default.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};

use super::voice_media::{CaptureBuf, Playback};

pub struct DeviceStreams {
    capture: Arc<Mutex<CaptureBuf>>,
    playback: Arc<Mutex<Playback>>,
    volumes: Arc<Mutex<HashMap<String, f32>>>,
    input: Option<Stream>,
    output: Option<Stream>,
    input_name: String,
    output_name: String,
    last_input: Instant,
    last_output: Instant,
    input_error: String,
    output_error: String,
}

impl DeviceStreams {
    pub fn new(
        capture: Arc<Mutex<CaptureBuf>>,
        playback: Arc<Mutex<Playback>>,
        volumes: Arc<Mutex<HashMap<String, f32>>>,
    ) -> Self {
        Self {
            capture,
            playback,
            volumes,
            input: None,
            output: None,
            input_name: String::new(),
            output_name: String::new(),
            last_input: Instant::now() - Duration::from_secs(30),
            last_output: Instant::now() - Duration::from_secs(30),
            input_error: String::new(),
            output_error: String::new(),
        }
    }

    pub fn sync(&mut self, input_name: &str, output_name: &str) {
        let now = Instant::now();
        if self.input_name != input_name || (self.input.is_none() && now.duration_since(self.last_input) >= Duration::from_secs(2)) {
            self.input_name = input_name.to_string();
            self.last_input = now;
            prepare_audio_thread();
            match open_input(input_name, self.capture.clone()) {
                Ok(stream) => {
                    self.input = Some(stream);
                    self.input_error.clear();
                }
                Err(err) => {
                    self.input = None;
                    self.input_error = err;
                }
            }
        }
        if self.output_name != output_name || (self.output.is_none() && now.duration_since(self.last_output) >= Duration::from_secs(2)) {
            self.output_name = output_name.to_string();
            self.last_output = now;
            prepare_audio_thread();
            match open_output(output_name, self.playback.clone(), self.volumes.clone()) {
                Ok(stream) => {
                    self.output = Some(stream);
                    self.output_error.clear();
                }
                Err(err) => {
                    self.output = None;
                    self.output_error = err;
                }
            }
        }
    }

    pub fn input_open(&self) -> bool {
        self.input.is_some()
    }

    pub fn output_open(&self) -> bool {
        self.output.is_some()
    }

    pub fn input_error(&self) -> &str {
        &self.input_error
    }

    pub fn output_error(&self) -> &str {
        &self.output_error
    }
}

/// WASAPI needs the thread in the multi-threaded COM apartment before a device
/// is opened. cpal does this too; doing it first keeps a later STA init from
/// stealing the thread. Other platforms have nothing to prepare.
fn prepare_audio_thread() {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED as u32);
        }
    }
}

pub fn list_input_output() -> (Vec<String>, Vec<String>) {
    let host = cpal::default_host();
    (device_names(host.input_devices().ok()), device_names(host.output_devices().ok()))
}

fn device_names(iter: Option<impl Iterator<Item = Device>>) -> Vec<String> {
    let mut names = Vec::new();
    let Some(iter) = iter else { return names };
    for device in iter {
        if let Ok(name) = device.name() {
            if !name.is_empty() && !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names
}

fn wants_default(name: &str) -> bool {
    let name = name.trim();
    name.is_empty() || name.eq_ignore_ascii_case("default") || name.to_ascii_lowercase().starts_with("default ")
}

fn pick_device(wanted: &str, devices: Result<impl Iterator<Item = Device>, cpal::DevicesError>, fallback: Option<Device>) -> Option<Device> {
    if wants_default(wanted) {
        return fallback;
    }
    let wanted = wanted.trim();
    devices.ok()?.find(|device| device.name().ok().as_deref() == Some(wanted)).or(fallback)
}

fn open_input(wanted: &str, capture: Arc<Mutex<CaptureBuf>>) -> Result<Stream, String> {
    let host = cpal::default_host();
    let device = pick_device(wanted, host.input_devices(), host.default_input_device()).ok_or_else(|| "No microphone".to_string())?;
    let supported = device.default_input_config().map_err(|err| err.to_string())?;
    let rate = supported.sample_rate().0;
    let channels = supported.channels();
    let format = supported.sample_format();
    let config: StreamConfig = supported.into();
    if let Ok(mut buf) = capture.lock() {
        buf.rate = rate.max(1);
        buf.samples.clear();
    }
    let stream = match format {
        SampleFormat::F32 => build_input::<f32>(&device, &config, channels, capture)?,
        SampleFormat::I16 => build_input::<i16>(&device, &config, channels, capture)?,
        SampleFormat::U16 => build_input::<u16>(&device, &config, channels, capture)?,
        SampleFormat::I32 => build_input::<i32>(&device, &config, channels, capture)?,
        SampleFormat::F64 => build_input::<f64>(&device, &config, channels, capture)?,
        other => return Err(format!("Unsupported microphone format {other}")),
    };
    stream.play().map_err(|err| err.to_string())?;
    Ok(stream)
}

fn open_output(wanted: &str, playback: Arc<Mutex<Playback>>, volumes: Arc<Mutex<HashMap<String, f32>>>) -> Result<Stream, String> {
    let host = cpal::default_host();
    let device = pick_device(wanted, host.output_devices(), host.default_output_device()).ok_or_else(|| "No speakers".to_string())?;
    let supported = device.default_output_config().map_err(|err| err.to_string())?;
    let rate = supported.sample_rate().0.max(1);
    let channels = supported.channels().max(1);
    let format = supported.sample_format();
    let config: StreamConfig = supported.into();
    if let Ok(mut play) = playback.lock() {
        play.rate = rate;
        play.channels = channels;
    }
    let stream = match format {
        SampleFormat::F32 => build_output::<f32>(&device, &config, channels, playback, volumes)?,
        SampleFormat::I16 => build_output::<i16>(&device, &config, channels, playback, volumes)?,
        SampleFormat::U16 => build_output::<u16>(&device, &config, channels, playback, volumes)?,
        SampleFormat::I32 => build_output::<i32>(&device, &config, channels, playback, volumes)?,
        SampleFormat::F64 => build_output::<f64>(&device, &config, channels, playback, volumes)?,
        other => return Err(format!("Unsupported speaker format {other}")),
    };
    stream.play().map_err(|err| err.to_string())?;
    Ok(stream)
}

fn build_input<T>(device: &Device, config: &StreamConfig, channels: u16, capture: Arc<Mutex<CaptureBuf>>) -> Result<Stream, String>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    device
        .build_input_stream::<T, _, _>(
            config,
            move |data, _| push_input(data, channels, &capture),
            |_| {},
            None,
        )
        .map_err(|err| err.to_string())
}

fn build_output<T>(
    device: &Device,
    config: &StreamConfig,
    channels: u16,
    playback: Arc<Mutex<Playback>>,
    volumes: Arc<Mutex<HashMap<String, f32>>>,
) -> Result<Stream, String>
where
    T: cpal::SizedSample + cpal::FromSample<f32>,
{
    device
        .build_output_stream::<T, _, _>(
            config,
            move |data, _| fill_output(data, channels, &playback, &volumes),
            |_| {},
            None,
        )
        .map_err(|err| err.to_string())
}

fn push_input<T>(data: &[T], channels: u16, capture: &Mutex<CaptureBuf>)
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let width = usize::from(channels.max(1));
    let Ok(mut buf) = capture.try_lock() else { return };
    for frame in data.chunks(width) {
        let mut sum = 0f32;
        for sample in frame {
            sum += sample.to_sample::<f32>();
        }
        buf.samples.push_back(sum / frame.len().max(1) as f32);
    }
    while buf.samples.len() > 48_000 {
        buf.samples.pop_front();
    }
}

fn fill_output<T>(data: &mut [T], channels: u16, playback: &Mutex<Playback>, volumes: &Mutex<HashMap<String, f32>>)
where
    T: cpal::SizedSample + cpal::FromSample<f32>,
{
    let width = usize::from(channels.max(1));
    let frames = data.len() / width;
    let mixed = if let Ok(mut play) = playback.try_lock() {
        let vols = volumes.try_lock().map(|guard| guard.clone()).unwrap_or_default();
        play.render(frames, &vols)
    } else {
        vec![0.0; frames]
    };
    for sample in data.iter_mut() {
        *sample = T::from_sample(0.0);
    }
    for (index, value) in mixed.iter().enumerate() {
        for channel in 0..width {
            if let Some(slot) = data.get_mut(index * width + channel) {
                *slot = T::from_sample(*value);
            }
        }
    }
}
