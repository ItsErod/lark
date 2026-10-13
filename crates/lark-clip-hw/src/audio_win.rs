//! App audio for a Go Live stream.
//!
//! A window share uses WASAPI process loopback for that process tree. A whole
//! screen falls back to the default render endpoint's loopback. Samples leave as
//! mono f32 at 48 kHz. The capture thread is not lowered for Game Mode.

use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use windows::core::{implement, Interface};
use windows::Win32::Foundation::HWND;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

pub struct AudioPump {
    stop: Sender<()>,
    samples: Arc<Mutex<Vec<f32>>>,
    join: Option<JoinHandle<()>>,
}

impl AudioPump {
    pub fn start(source: &str) -> Result<Self, String> {
        let pid = window_pid(source);
        let (stop_tx, stop_rx) = mpsc::channel();
        let samples = Arc::new(Mutex::new(Vec::new()));
        let incoming = samples.clone();
        let join = std::thread::Builder::new()
            .name("lark-app-audio".into())
            .spawn(move || {
                let _ = capture_loop(pid, &incoming, &stop_rx);
            })
            .map_err(|err| err.to_string())?;
        Ok(Self {
            stop: stop_tx,
            samples,
            join: Some(join),
        })
    }

    pub fn pull(&self) -> Vec<f32> {
        let mut guard = self.samples.lock().unwrap_or_else(|err| err.into_inner());
        std::mem::take(&mut *guard)
    }
}

impl Drop for AudioPump {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

fn window_pid(source: &str) -> Option<u32> {
    let text = source.strip_prefix("window:")?;
    let value = text.parse::<isize>().ok()?;
    if value == 0 {
        return None;
    }
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(HWND(value as *mut std::ffi::c_void), Some(&mut pid));
        if pid == 0 {
            None
        } else {
            Some(pid)
        }
    }
}

fn capture_loop(
    pid: Option<u32>,
    samples: &Mutex<Vec<f32>>,
    stop: &mpsc::Receiver<()>,
) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Some(pid) = pid {
            if process_loopback(pid, samples, stop).is_ok() {
                return Ok(());
            }
        }
        device_loopback(samples, stop)
    }
}

unsafe fn device_loopback(
    samples: &Mutex<Vec<f32>>,
    stop: &mpsc::Receiver<()>,
) -> Result<(), String> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    let device = enumerator
        .GetDefaultAudioEndpoint(eRender, eConsole)
        .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    let client: IAudioClient = device
        .Activate(CLSCTX_ALL, None)
        .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    let format = client
        .GetMixFormat()
        .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    client
        .Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            0,
            0,
            format,
            None,
        )
        .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    let capture: IAudioCaptureClient = client
        .GetService()
        .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    client
        .Start()
        .map_err(|err| format!("WASAPI loopback did not start: {err}"))?;
    let result = pump(&capture, format, samples, stop);
    let _ = client.Stop();
    CoTaskMemFree(Some(format as *const std::ffi::c_void));
    result
}

struct LoopbackGate {
    client: Mutex<Option<IAudioClient>>,
    ready: Mutex<bool>,
    cv: Condvar,
}

#[implement(windows::Win32::Media::Audio::IActivateAudioInterfaceCompletionHandler)]
struct ProcessLoopbackHandler(Arc<LoopbackGate>);

impl windows::Win32::Media::Audio::IActivateAudioInterfaceCompletionHandler_Impl
    for ProcessLoopbackHandler_Impl
{
    fn ActivateCompleted(
        &self,
        operation: windows::core::Ref<
            '_,
            windows::Win32::Media::Audio::IActivateAudioInterfaceAsyncOperation,
        >,
    ) -> windows::core::Result<()> {
        unsafe {
            if let Some(operation) = operation.as_ref() {
                let mut code = windows::core::HRESULT(0);
                let mut unknown: Option<windows::core::IUnknown> = None;
                if operation.GetActivateResult(&mut code, &mut unknown).is_ok() && code.is_ok() {
                    if let Some(unknown) = unknown {
                        if let Ok(client) = unknown.cast::<IAudioClient>() {
                            if let Ok(mut slot) = self.0.client.lock() {
                                *slot = Some(client);
                            }
                        }
                    }
                }
            }
            if let Ok(mut ready) = self.0.ready.lock() {
                *ready = true;
            }
            self.0.cv.notify_one();
        }
        Ok(())
    }
}

unsafe fn process_loopback(
    pid: u32,
    samples: &Mutex<Vec<f32>>,
    stop: &mpsc::Receiver<()>,
) -> Result<(), String> {
    use windows::Win32::Media::Audio::{
        ActivateAudioInterfaceAsync, IActivateAudioInterfaceCompletionHandler,
        AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_LOOPBACK,
        AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, AUDIOCLIENT_ACTIVATION_PARAMS,
        AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
        PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
    };
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Variant::VT_BLOB;

    let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: windows::Win32::Media::Audio::AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: pid,
                ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
            },
        },
    };

    let mut prop = PROPVARIANT::default();
    {
        let inner = &mut prop.Anonymous.Anonymous;
        inner.vt = VT_BLOB;
        inner.Anonymous.blob = windows::Win32::System::Com::BLOB {
            cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
            pBlobData: &mut params as *mut AUDIOCLIENT_ACTIVATION_PARAMS as *mut u8,
        };
    }

    let gate = Arc::new(LoopbackGate {
        client: Mutex::new(None),
        ready: Mutex::new(false),
        cv: Condvar::new(),
    });
    let handler: IActivateAudioInterfaceCompletionHandler =
        ProcessLoopbackHandler(gate.clone()).into();
    let _operation = ActivateAudioInterfaceAsync(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
        &IAudioClient::IID,
        Some(&prop),
        &handler,
    )
    .map_err(|err| format!("Process loopback did not start: {err}"))?;

    let ready = gate
        .ready
        .lock()
        .map_err(|_| "Process loopback did not start.".to_string())?;
    let (ready, wait) = gate
        .cv
        .wait_timeout(ready, Duration::from_secs(2))
        .map_err(|_| "Process loopback did not start.".to_string())?;
    if wait.timed_out() || !*ready {
        return Err("Process loopback timed out.".into());
    }
    drop(ready);
    let client = gate
        .client
        .lock()
        .ok()
        .and_then(|mut slot| slot.take())
        .ok_or_else(|| "Process loopback returned no client.".to_string())?;
    let format = client
        .GetMixFormat()
        .map_err(|err| format!("Process loopback did not start: {err}"))?;
    let flags = AUDCLNT_STREAMFLAGS_LOOPBACK
        | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
        | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    client
        .Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, format, None)
        .map_err(|err| format!("Process loopback did not start: {err}"))?;
    let capture: IAudioCaptureClient = client
        .GetService()
        .map_err(|err| format!("Process loopback did not start: {err}"))?;
    client
        .Start()
        .map_err(|err| format!("Process loopback did not start: {err}"))?;
    let result = pump(&capture, format, samples, stop);
    let _ = client.Stop();
    CoTaskMemFree(Some(format as *const std::ffi::c_void));
    result
}

unsafe fn pump(
    capture: &IAudioCaptureClient,
    format: *mut windows::Win32::Media::Audio::WAVEFORMATEX,
    samples: &Mutex<Vec<f32>>,
    stop: &mpsc::Receiver<()>,
) -> Result<(), String> {
    if format.is_null() {
        return Err("WASAPI mix format was empty.".into());
    }
    let rate = (*format).nSamplesPerSec.max(1);
    let channels = (*format).nChannels.max(1) as usize;
    let bits = (*format).wBitsPerSample;
    let float = (*format).wFormatTag == 3 || bits == 32;
    loop {
        if stop.recv_timeout(Duration::from_millis(5)).is_ok() {
            return Ok(());
        }
        let mut data = std::ptr::null_mut();
        let mut frames = 0u32;
        let mut flags = 0u32;
        if capture
            .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
            .is_err()
        {
            continue;
        }
        if !data.is_null() && frames > 0 && flags & 0b10 == 0 {
            let count = frames as usize * channels;
            let mut mono = Vec::with_capacity(frames as usize);
            if float && bits == 32 {
                let pcm = std::slice::from_raw_parts(data as *const f32, count);
                for frame in 0..frames as usize {
                    let mut sum = 0f32;
                    for channel in 0..channels {
                        sum += pcm[frame * channels + channel];
                    }
                    mono.push(sum / channels as f32);
                }
            } else if bits == 16 {
                let pcm = std::slice::from_raw_parts(data as *const i16, count);
                for frame in 0..frames as usize {
                    let mut sum = 0f32;
                    for channel in 0..channels {
                        sum += f32::from(pcm[frame * channels + channel]) / 32768.0;
                    }
                    mono.push(sum / channels as f32);
                }
            }
            if rate != 48_000 && !mono.is_empty() {
                mono = resample(&mono, rate, 48_000);
            }
            if let Ok(mut guard) = samples.lock() {
                guard.extend(mono);
                if guard.len() > 48_000 {
                    let extra = guard.len() - 48_000;
                    guard.drain(..extra);
                }
            }
        }
        let _ = capture.ReleaseBuffer(frames);
    }
}

fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == 0 || input.is_empty() {
        return Vec::new();
    }
    let out_len = ((input.len() as u64 * u64::from(to)) / u64::from(from)).max(1) as usize;
    let mut out = Vec::with_capacity(out_len);
    for index in 0..out_len {
        let src = (index as u64 * u64::from(from)) / u64::from(to);
        out.push(input[(src as usize).min(input.len() - 1)]);
    }
    out
}
