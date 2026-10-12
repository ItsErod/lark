//! Microphone and speaker streams. The callbacks only copy samples.
//! Device names come from the voice settings. An empty name, or a browser
//! device id that is not a host device name, uses the communications endpoint
//! on Windows and the host default everywhere else.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, SampleFormat, SampleRate, Stream, StreamConfig};

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

/// Which listed device to open. `None` means the host default.
///
/// A saved browser `deviceId` is not a cpal name. Treating that as "no device"
/// closed both directions while the voice channel still joined. An unknown id
/// follows the same path as Default: the communications endpoint when Windows
/// has one, otherwise the host default.
pub fn choose_listed_name<'a>(wanted: &str, names: &'a [String], communications: Option<&str>) -> Option<&'a str> {
    let wanted = wanted.trim();
    if !wants_default(wanted) {
        if let Some(found) = names.iter().find(|name| name.as_str() == wanted) {
            return Some(found.as_str());
        }
    }
    let communications = communications?;
    names.iter().find(|name| name.as_str() == communications).map(|name| name.as_str())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceChoice {
    Listed,
    HostDefault,
}

/// Enumeration failure still keeps the host default. Dropping the fallback
/// left the microphone and speakers closed together.
pub fn device_choice(wanted: &str, names: &[String], communications: Option<&str>, enumerated: bool) -> DeviceChoice {
    if enumerated && choose_listed_name(wanted, names, communications).is_some() {
        DeviceChoice::Listed
    } else {
        DeviceChoice::HostDefault
    }
}

fn pick_device(wanted: &str, devices: Result<impl Iterator<Item = Device>, cpal::DevicesError>, fallback: Option<Device>, input: bool) -> Option<Device> {
    let listed = match devices {
        Ok(iter) => iter.collect::<Vec<_>>(),
        Err(_) => Vec::new(),
    };
    let names: Vec<String> = listed.iter().filter_map(|device| device.name().ok()).filter(|name| !name.is_empty()).collect();
    let communications = communications_name(input);
    if let Some(chosen) = choose_listed_name(wanted, &names, communications.as_deref()) {
        if let Some(index) = listed.iter().position(|device| device.name().ok().as_deref() == Some(chosen)) {
            return listed.into_iter().nth(index);
        }
    }
    fallback
}

struct StreamAttempt {
    format: SampleFormat,
    config: StreamConfig,
}

/// Shared-mode formats to try when the mix format is one cpal cannot map.
/// Windows 24-bit mix formats make `default_*_config` fail and used to close
/// both devices. WASAPI shared mode still accepts float and 16-bit PCM.
fn shared_mode_fallbacks() -> Vec<(u32, u16, &'static str)> {
    let mut out = Vec::new();
    for &rate in &[48_000u32, 44_100, 96_000] {
        for &channels in &[2u16, 1] {
            out.push((rate, channels, "f32"));
            out.push((rate, channels, "i16"));
        }
    }
    out
}

fn stream_attempts(preferred: Option<cpal::SupportedStreamConfig>) -> Vec<StreamAttempt> {
    let mut out = Vec::new();
    let mut seen = Vec::new();
    let mut push = |format: SampleFormat, rate: u32, channels: u16| {
        let channels = channels.max(1);
        let rate = rate.max(1);
        let key = format!("{format:?}:{rate}:{channels}");
        if seen.contains(&key) {
            return;
        }
        seen.push(key);
        out.push(StreamAttempt {
            format,
            config: StreamConfig {
                channels,
                sample_rate: SampleRate(rate),
                buffer_size: BufferSize::Default,
            },
        });
    };
    if let Some(supported) = preferred {
        push(supported.sample_format(), supported.sample_rate().0, supported.channels());
    }
    for (rate, channels, kind) in shared_mode_fallbacks() {
        let format = if kind == "f32" { SampleFormat::F32 } else { SampleFormat::I16 };
        push(format, rate, channels);
    }
    out
}

fn open_input(wanted: &str, capture: Arc<Mutex<CaptureBuf>>) -> Result<Stream, String> {
    let host = cpal::default_host();
    let device = pick_device(wanted, host.input_devices(), host.default_input_device(), true).ok_or_else(|| "No microphone".to_string())?;
    let mut last = "No supported microphone format".to_string();
    for attempt in stream_attempts(device.default_input_config().ok()) {
        let channels = attempt.config.channels;
        let rate = attempt.config.sample_rate.0.max(1);
        if let Ok(mut buf) = capture.lock() {
            buf.rate = rate;
            buf.samples.clear();
        }
        let built = match attempt.format {
            SampleFormat::F32 => build_input::<f32>(&device, &attempt.config, channels, capture.clone()),
            SampleFormat::I16 => build_input::<i16>(&device, &attempt.config, channels, capture.clone()),
            SampleFormat::U16 => build_input::<u16>(&device, &attempt.config, channels, capture.clone()),
            SampleFormat::I32 => build_input::<i32>(&device, &attempt.config, channels, capture.clone()),
            SampleFormat::F64 => build_input::<f64>(&device, &attempt.config, channels, capture.clone()),
            other => Err(format!("Unsupported microphone format {other}")),
        };
        match built.and_then(|stream| stream.play().map(|_| stream).map_err(|err| err.to_string())) {
            Ok(stream) => return Ok(stream),
            Err(err) => last = err,
        }
    }
    Err(last)
}

fn open_output(wanted: &str, playback: Arc<Mutex<Playback>>, volumes: Arc<Mutex<HashMap<String, f32>>>) -> Result<Stream, String> {
    let host = cpal::default_host();
    let device = pick_device(wanted, host.output_devices(), host.default_output_device(), false).ok_or_else(|| "No speakers".to_string())?;
    let mut last = "No supported speaker format".to_string();
    for attempt in stream_attempts(device.default_output_config().ok()) {
        let channels = attempt.config.channels.max(1);
        let rate = attempt.config.sample_rate.0.max(1);
        if let Ok(mut play) = playback.lock() {
            play.rate = rate;
            play.channels = channels;
        }
        let built = match attempt.format {
            SampleFormat::F32 => build_output::<f32>(&device, &attempt.config, channels, playback.clone(), volumes.clone()),
            SampleFormat::I16 => build_output::<i16>(&device, &attempt.config, channels, playback.clone(), volumes.clone()),
            SampleFormat::U16 => build_output::<u16>(&device, &attempt.config, channels, playback.clone(), volumes.clone()),
            SampleFormat::I32 => build_output::<i32>(&device, &attempt.config, channels, playback.clone(), volumes.clone()),
            SampleFormat::F64 => build_output::<f64>(&device, &attempt.config, channels, playback.clone(), volumes.clone()),
            other => Err(format!("Unsupported speaker format {other}")),
        };
        match built.and_then(|stream| stream.play().map(|_| stream).map_err(|err| err.to_string())) {
            Ok(stream) => return Ok(stream),
            Err(err) => last = err,
        }
    }
    Err(last)
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

/// Friendly name of the Windows communications endpoint, which is the device
/// Discord voice uses. cpal's default is the console role. Other platforms
/// have no separate communications device.
#[cfg(not(windows))]
fn communications_name(_input: bool) -> Option<String> {
    None
}

#[cfg(windows)]
fn communications_name(input: bool) -> Option<String> {
    use windows_sys::core::GUID;
    use windows_sys::Win32::Media::Audio::{eCapture, eCommunications, eRender, MMDeviceEnumerator};
    use windows_sys::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
    use windows_sys::Win32::System::Com::StructuredStorage::{PropVariantClear, PROPVARIANT};
    use windows_sys::Win32::System::Variant::VT_LPWSTR;

    // mmdeviceapi.h. windows-sys 0.59 exposes the CLSID and roles, not the COM methods.
    const IID_IMM_DEVICE_ENUMERATOR: GUID = GUID::from_u128(0xA95664D2_9614_4F35_A746_DE8DB63617E6);
    // PKEY_Device_FriendlyName, the same property cpal reads.
    const FRIENDLY_NAME: PropertyKey = PropertyKey {
        fmtid: GUID::from_u128(0xA45C254E_DF1C_4EFD_8020_67D146A850E0),
        pid: 14,
    };

    #[repr(C)]
    struct PropertyKey {
        fmtid: GUID,
        pid: u32,
    }
    #[repr(C)]
    struct IUnknownVtbl {
        query_interface: unsafe extern "system" fn(*mut core::ffi::c_void, *const GUID, *mut *mut core::ffi::c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut core::ffi::c_void) -> u32,
        release: unsafe extern "system" fn(*mut core::ffi::c_void) -> u32,
    }
    #[repr(C)]
    struct EnumeratorVtbl {
        base: IUnknownVtbl,
        enum_audio_endpoints: unsafe extern "system" fn(*mut core::ffi::c_void, i32, u32, *mut *mut core::ffi::c_void) -> i32,
        get_default_audio_endpoint: unsafe extern "system" fn(*mut core::ffi::c_void, i32, i32, *mut *mut core::ffi::c_void) -> i32,
        get_device: unsafe extern "system" fn(*mut core::ffi::c_void, *const u16, *mut *mut core::ffi::c_void) -> i32,
    }
    #[repr(C)]
    struct DeviceVtbl {
        base: IUnknownVtbl,
        activate: unsafe extern "system" fn(*mut core::ffi::c_void, *const GUID, u32, *mut core::ffi::c_void, *mut *mut core::ffi::c_void) -> i32,
        open_property_store: unsafe extern "system" fn(*mut core::ffi::c_void, u32, *mut *mut core::ffi::c_void) -> i32,
        get_id: unsafe extern "system" fn(*mut core::ffi::c_void, *mut *mut u16) -> i32,
        get_state: unsafe extern "system" fn(*mut core::ffi::c_void, *mut u32) -> i32,
    }
    #[repr(C)]
    struct StoreVtbl {
        base: IUnknownVtbl,
        get_count: unsafe extern "system" fn(*mut core::ffi::c_void, *mut u32) -> i32,
        get_at: unsafe extern "system" fn(*mut core::ffi::c_void, u32, *mut PropertyKey) -> i32,
        get_value: unsafe extern "system" fn(*mut core::ffi::c_void, *const PropertyKey, *mut PROPVARIANT) -> i32,
        set_value: unsafe extern "system" fn(*mut core::ffi::c_void, *const PropertyKey, *const PROPVARIANT) -> i32,
        commit: unsafe extern "system" fn(*mut core::ffi::c_void) -> i32,
    }

    unsafe fn release(ptr: *mut core::ffi::c_void) {
        if ptr.is_null() {
            return;
        }
        let vtbl = *(ptr as *const *const IUnknownVtbl);
        if !vtbl.is_null() {
            ((*vtbl).release)(ptr);
        }
    }

    unsafe {
        let _ = CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED as u32);
        let mut enumerator: *mut core::ffi::c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &MMDeviceEnumerator,
            std::ptr::null_mut(),
            CLSCTX_ALL,
            &IID_IMM_DEVICE_ENUMERATOR,
            &mut enumerator,
        );
        if hr < 0 || enumerator.is_null() {
            return None;
        }
        let flow = if input { eCapture } else { eRender };
        let enum_vtbl = *(enumerator as *const *const EnumeratorVtbl);
        let mut device: *mut core::ffi::c_void = std::ptr::null_mut();
        let hr = ((*enum_vtbl).get_default_audio_endpoint)(enumerator, flow, eCommunications, &mut device);
        if hr < 0 || device.is_null() {
            release(enumerator);
            return None;
        }
        let device_vtbl = *(device as *const *const DeviceVtbl);
        let mut store: *mut core::ffi::c_void = std::ptr::null_mut();
        let hr = ((*device_vtbl).open_property_store)(device, STGM_READ, &mut store);
        if hr < 0 || store.is_null() {
            release(device);
            release(enumerator);
            return None;
        }
        let store_vtbl = *(store as *const *const StoreVtbl);
        let mut value: PROPVARIANT = std::mem::zeroed();
        let hr = ((*store_vtbl).get_value)(store, &FRIENDLY_NAME, &mut value);
        let name = if hr >= 0 {
            let inner = value.Anonymous.Anonymous;
            if inner.vt == VT_LPWSTR {
                wide_to_string(inner.Anonymous.pwszVal as *const u16)
            } else {
                None
            }
        } else {
            None
        };
        let _ = PropVariantClear(&mut value);
        release(store);
        release(device);
        release(enumerator);
        name.filter(|text| !text.is_empty())
    }
}

#[cfg(windows)]
fn wide_to_string(ptr: *const u16) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    unsafe {
        while len < 512 && *ptr.add(len) != 0 {
            len += 1;
        }
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len)))
    }
}

#[cfg(test)]
mod tests {
    use super::{choose_listed_name, device_choice, shared_mode_fallbacks, DeviceChoice};

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn a_browser_id_uses_the_communications_device() {
        let listed = names(&["Speakers (Realtek Audio)", "Headset (Realtek Audio)"]);
        let chosen = choose_listed_name("a1b2c3d4browser", &listed, Some("Headset (Realtek Audio)"));
        assert_eq!(chosen, Some("Headset (Realtek Audio)"));
    }

    #[test]
    fn an_exact_device_name_wins_over_the_communications_role() {
        let listed = names(&["Speakers (Realtek Audio)", "Headset (Realtek Audio)"]);
        let chosen = choose_listed_name("Speakers (Realtek Audio)", &listed, Some("Headset (Realtek Audio)"));
        assert_eq!(chosen, Some("Speakers (Realtek Audio)"));
    }

    #[test]
    fn default_prefers_communications_and_otherwise_the_host_default() {
        let listed = names(&["Speakers (Realtek Audio)", "Headset (Realtek Audio)"]);
        assert_eq!(choose_listed_name("", &listed, Some("Headset (Realtek Audio)")), Some("Headset (Realtek Audio)"));
        assert_eq!(choose_listed_name("default", &listed, Some("Headset (Realtek Audio)")), Some("Headset (Realtek Audio)"));
        assert_eq!(choose_listed_name("default Speakers", &listed, None), None);
        assert_eq!(device_choice("a1b2c3d4browser", &[], None, false), DeviceChoice::HostDefault);
        assert_eq!(
            device_choice("Headset (Realtek Audio)", &listed, None, true),
            DeviceChoice::Listed
        );
    }

    #[test]
    fn shared_mode_fallbacks_cover_float_and_pcm() {
        let fallbacks = shared_mode_fallbacks();
        assert!(fallbacks.iter().any(|item| item.0 == 48_000 && item.1 == 2 && item.2 == "f32"));
        assert!(fallbacks.iter().any(|item| item.0 == 44_100 && item.2 == "i16"));
        assert!(fallbacks.iter().any(|item| item.0 == 96_000));
    }
}
