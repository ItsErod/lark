//! GPU capture and a hardware encoder for the rolling clip ring.
//!
//! DXGI Desktop Duplication is tried first. It does not show a capture border and it
//! sees borderless games. Windows Graphics Capture is the fallback, with the yellow
//! border turned off. Frames stay on the GPU: a video processor scales them to NV12
//! and a Media Foundation hardware transform (NVENC, AMF, or Quick Sync) emits
//! H.264 or HEVC access units. The ring stores those units, not the textures.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use windows::core::Interface;
use windows::Win32::Foundation::{HMODULE, HWND, POINT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::D3D11_TEX2D_VPIV;
use windows::Win32::Graphics::Direct3D11::D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread, ID3D11Texture2D,
    ID3D11VideoContext, ID3D11VideoDevice, ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator,
    ID3D11VideoProcessorOutputView, D3D11_BIND_RENDER_TARGET, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    D3D11_CREATE_DEVICE_VIDEO_SUPPORT, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_DEFAULT, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE, D3D11_VIDEO_PROCESSOR_CONTENT_DESC,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC,
    D3D11_VIDEO_PROCESSOR_STREAM, D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
    D3D11_VPIV_DIMENSION_TEXTURE2D, D3D11_VPOV_DIMENSION_TEXTURE2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_NV12, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter1, IDXGIDevice, IDXGIFactory1, IDXGIOutput, IDXGIOutput1,
    IDXGIOutputDuplication, IDXGIResource, DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_UNSUPPORTED,
    DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, MonitorFromPoint, DEVMODEW, ENUM_CURRENT_SETTINGS, HMONITOR,
    MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::Media::MediaFoundation::{
    IMFActivate, IMFSample, IMFTransform, MFCreateDXGIDeviceManager, MFCreateDXGISurfaceBuffer,
    MFCreateMediaType, MFCreateSample, MFMediaType_Video, MFStartup, MFTEnumEx,
    MFT_FRIENDLY_NAME_Attribute, MFVideoFormat_H264, MFVideoFormat_HEVC, MFVideoFormat_NV12,
    MFVideoInterlace_Progressive, MFSTARTUP_NOSOCKET, MFT_CATEGORY_VIDEO_ENCODER,
    MFT_ENUM_FLAG_HARDWARE, MFT_ENUM_FLAG_SORTANDFILTER, MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,
    MFT_MESSAGE_NOTIFY_START_OF_STREAM, MFT_MESSAGE_SET_D3D_MANAGER, MFT_OUTPUT_DATA_BUFFER,
    MFT_REGISTER_TYPE_INFO, MF_E_NO_EVENTS_AVAILABLE, MF_E_TRANSFORM_NEED_MORE_INPUT,
    MF_E_TRANSFORM_STREAM_CHANGE, MF_MT_AVG_BITRATE, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE,
    MF_MT_INTERLACE_MODE, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,
    MF_TRANSFORM_ASYNC, MF_TRANSFORM_ASYNC_UNLOCK, MF_VERSION,
};
use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{
    GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL, THREAD_PRIORITY_BELOW_NORMAL,
    THREAD_PRIORITY_NORMAL,
};

use crate::{HardwareProbe, LiveConfig, LivePacket};

struct CachedProbe {
    at: Instant,
    probe: HardwareProbe,
}

static PROBE: Mutex<Option<CachedProbe>> = Mutex::new(None);

pub fn probe() -> HardwareProbe {
    let guard = PROBE.lock().unwrap_or_else(|err| err.into_inner());
    if let Some(cached) = guard.as_ref() {
        if cached.at.elapsed() < Duration::from_secs(5) {
            return cached.probe;
        }
    }
    drop(guard);
    let probe = read_probe();
    *PROBE.lock().unwrap_or_else(|err| err.into_inner()) = Some(CachedProbe {
        at: Instant::now(),
        probe,
    });
    probe
}

pub fn set_thread_pace(game_mode: bool) {
    unsafe {
        let priority = if game_mode {
            THREAD_PRIORITY_BELOW_NORMAL
        } else {
            THREAD_PRIORITY_NORMAL
        };
        let _ = SetThreadPriority(GetCurrentThread(), priority);
    }
}

/// Go Live stays above the game. Game Mode must not call this with a low priority.
pub fn set_stream_priority() {
    unsafe {
        let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
    }
}

pub struct Session {
    backend: &'static str,
    hevc: bool,
    fps: u32,
    width: u32,
    height: u32,
    started: Instant,
    frame_index: u64,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: Option<IDXGIOutputDuplication>,
    wgc: Option<Wgc>,
    scaler: Scaler,
    encoder: Encoder,
    stream: bool,
    idr_every: u64,
    force_idr: Arc<AtomicBool>,
    audio: Option<crate::audio_win::AudioPump>,
}

impl Session {
    pub fn open(config: &LiveConfig) -> Result<Self, String> {
        com_init()?;
        if config.stream {
            set_stream_priority();
        } else {
            set_thread_pace(config.game_mode);
        }
        let found = output_for(&config.source)?;
        let (device, context) = create_device(&found.adapter)?;
        let (duplication, wgc) = if config.stream {
            open_stream_capture(&device, &found, config)?
        } else {
            let duplication = duplicate(&found.output, &device).ok();
            let wgc = if duplication.is_none() {
                Some(Wgc::start(&device, found.monitor, config.game_mode)?)
            } else {
                None
            };
            (duplication, wgc)
        };
        if duplication.is_none() && wgc.is_none() {
            return Err("Couldn't start DXGI or Windows Graphics Capture.".into());
        }
        let scaler = Scaler::new(&device, &context, config.width, config.height)?;
        let (encoder, hevc, vendor) = Encoder::open(&device, config)?;
        let api = if duplication.is_some() {
            "DXGI"
        } else {
            "Windows Graphics Capture"
        };
        Ok(Self {
            backend: backend_name(api, vendor, hevc),
            hevc,
            fps: config.fps.max(1),
            width: config.width,
            height: config.height,
            started: Instant::now(),
            frame_index: 0,
            device,
            context,
            duplication,
            wgc,
            scaler,
            encoder,
            stream: config.stream,
            idr_every: if config.stream {
                u64::from(if config.idr_interval == 0 { config.fps.max(1).saturating_mul(2) } else { config.idr_interval }).max(2)
            } else {
                u64::from(config.fps.max(1))
            },
            force_idr: Arc::new(AtomicBool::new(false)),
            audio: if config.stream && config.app_audio {
                crate::audio_win::AudioPump::start(&config.source).ok()
            } else {
                None
            },
        })
    }

    pub fn request_idr(&mut self) {
        self.force_idr.store(true, Ordering::Relaxed);
    }

    pub fn pull_audio(&mut self) -> Vec<f32> {
        self.audio.as_ref().map(|audio| audio.pull()).unwrap_or_default()
    }

    pub fn backend(&self) -> &'static str {
        self.backend
    }

    pub fn hevc(&self) -> bool {
        self.hevc
    }

    pub fn tick(&mut self) -> Result<Vec<LivePacket>, String> {
        let timeout = (1000 / self.fps.max(1)).clamp(1, 50);
        let texture = if let Some(duplication) = self.duplication.as_ref() {
            match acquire_dxgi(duplication, timeout) {
                Ok(Some(texture)) => {
                    let scaled = self.scaler.blit(&self.context, &texture)?;
                    unsafe {
                        let _ = duplication.ReleaseFrame();
                    }
                    scaled
                }
                Ok(None) => return Ok(Vec::new()),
                Err(err) => {
                    if let Some(duplication) = self.duplication.as_ref() {
                        unsafe {
                            let _ = duplication.ReleaseFrame();
                        }
                    }
                    return Err(err);
                }
            }
        } else if let Some(wgc) = self.wgc.as_ref() {
            match wgc.next_texture() {
                Ok(Some(texture)) => self.scaler.blit(&self.context, &texture)?,
                Ok(None) => return Ok(Vec::new()),
                Err(err) => return Err(err),
            }
        } else {
            return Err("The capture session has no display.".into());
        };
        let pts_ms = self.started.elapsed().as_millis() as u64;
        let period = if self.stream { self.idr_every } else { u64::from(self.fps.max(1)) };
        let force_key = self.force_idr.swap(false, Ordering::Relaxed)
            || self.frame_index == 0
            || self.frame_index % period.max(1) == 0;
        self.frame_index += 1;
        self.encoder.encode(&texture, pts_ms, self.fps, force_key)
    }
}

struct FoundOutput {
    adapter: IDXGIAdapter1,
    output: IDXGIOutput,
    monitor: HMONITOR,
    width: u32,
    height: u32,
    refresh_hz: u32,
}

fn read_probe() -> HardwareProbe {
    let _ = com_init();
    let (width, height, refresh) = match primary_output() {
        Ok(found) => (found.width, found.height, found.refresh_hz),
        Err(_) => (0, 0, 0),
    };
    let (encoder_name, hevc, h264) = match list_encoders() {
        Ok(list) => list,
        Err(_) => ("unavailable", false, false),
    };
    HardwareProbe {
        display_width: width,
        display_height: height,
        refresh_hz: refresh,
        encoder_name,
        hevc,
        h264,
    }
}

fn com_init() -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)
            .map_err(|err| format!("Media Foundation did not start: {err}"))
    }
}

fn primary_output() -> Result<FoundOutput, String> {
    unsafe {
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|err| format!("Couldn't enumerate displays: {err}"))?;
        let primary = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        let mut chosen: Option<FoundOutput> = None;
        let mut index = 0u32;
        while let Ok(adapter) = factory.EnumAdapters1(index) {
            let mut output_index = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_index) {
                if let Ok(desc) = output.GetDesc() {
                    let width = desc
                        .DesktopCoordinates
                        .right
                        .saturating_sub(desc.DesktopCoordinates.left)
                        .max(0) as u32;
                    let height = desc
                        .DesktopCoordinates
                        .bottom
                        .saturating_sub(desc.DesktopCoordinates.top)
                        .max(0) as u32;
                    let refresh = refresh_hz(&desc.DeviceName);
                    let found = FoundOutput {
                        adapter: adapter.clone(),
                        output: output.clone(),
                        monitor: desc.Monitor,
                        width,
                        height,
                        refresh_hz: refresh,
                    };
                    if desc.Monitor == primary || chosen.is_none() {
                        let replace = desc.Monitor == primary || chosen.is_none();
                        if replace {
                            chosen = Some(found);
                        }
                    }
                }
                output_index += 1;
            }
            index += 1;
        }
        chosen.ok_or_else(|| "No display found.".into())
    }
}

fn output_for(source: &str) -> Result<FoundOutput, String> {
    let index = source
        .strip_prefix("screen:")
        .and_then(|text| text.parse::<u32>().ok());
    if index.is_none() || index == Some(0) {
        return primary_output();
    }
    let want = index.unwrap_or(0);
    let outputs = list_outputs()?;
    outputs.into_iter().nth(want as usize).or_else(|| {
        list_outputs().ok().and_then(|mut items| items.pop())
    }).ok_or_else(|| "No display found.".into())
}

fn list_outputs() -> Result<Vec<FoundOutput>, String> {
    unsafe {
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|err| format!("Couldn't enumerate displays: {err}"))?;
        let mut found = Vec::new();
        let mut index = 0u32;
        while let Ok(adapter) = factory.EnumAdapters1(index) {
            let mut output_index = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_index) {
                if let Ok(desc) = output.GetDesc() {
                    let width = desc.DesktopCoordinates.right.saturating_sub(desc.DesktopCoordinates.left).max(0) as u32;
                    let height = desc.DesktopCoordinates.bottom.saturating_sub(desc.DesktopCoordinates.top).max(0) as u32;
                    found.push(FoundOutput {
                        adapter: adapter.clone(),
                        output,
                        monitor: desc.Monitor,
                        width,
                        height,
                        refresh_hz: refresh_hz(&desc.DeviceName),
                    });
                }
                output_index += 1;
            }
            index += 1;
        }
        if found.is_empty() {
            Err("No display found.".into())
        } else {
            Ok(found)
        }
    }
}

fn open_stream_capture(
    device: &ID3D11Device,
    found: &FoundOutput,
    config: &crate::LiveConfig,
) -> Result<(Option<IDXGIOutputDuplication>, Option<Wgc>), String> {
    if let Some(hwnd) = window_handle(&config.source) {
        let wgc = Wgc::start_window(device, hwnd)?;
        return Ok((None, Some(wgc)));
    }
    if let Ok(wgc) = Wgc::start(device, found.monitor, false) {
        return Ok((None, Some(wgc)));
    }
    let duplication = duplicate(&found.output, device)?;
    Ok((Some(duplication), None))
}

fn window_handle(source: &str) -> Option<HWND> {
    let text = source.strip_prefix("window:")?;
    let value = text.parse::<isize>().ok()?;
    if value == 0 {
        return None;
    }
    Some(HWND(value as *mut std::ffi::c_void))
}

fn refresh_hz(name: &[u16]) -> u32 {
    unsafe {
        let mut mode = DEVMODEW {
            dmSize: std::mem::size_of::<DEVMODEW>() as u16,
            ..DEVMODEW::default()
        };
        if EnumDisplaySettingsW(
            windows::core::PCWSTR(name.as_ptr()),
            ENUM_CURRENT_SETTINGS,
            &mut mode,
        )
        .as_bool()
        {
            mode.dmDisplayFrequency
        } else {
            0
        }
    }
}

fn create_device(adapter: &IDXGIAdapter1) -> Result<(ID3D11Device, ID3D11DeviceContext), String> {
    unsafe {
        let mut device = None;
        let mut context = None;
        let flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
        D3D11CreateDevice(
            adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            HMODULE::default(),
            flags,
            Some(&[D3D_FEATURE_LEVEL_11_0]),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .map_err(|err| format!("Couldn't open the GPU: {err}"))?;
        let device = device.ok_or("Couldn't open the GPU.")?;
        let context = context.ok_or("Couldn't open the GPU.")?;
        if let Ok(multithread) = device.cast::<ID3D11Multithread>() {
            let _ = multithread.SetMultithreadProtected(true);
        }
        Ok((device, context))
    }
}

fn duplicate(
    output: &IDXGIOutput,
    device: &ID3D11Device,
) -> Result<IDXGIOutputDuplication, String> {
    unsafe {
        let output1: IDXGIOutput1 = output
            .cast()
            .map_err(|err| format!("Desktop Duplication is not available: {err}"))?;
        output1
            .DuplicateOutput(device)
            .map_err(|err| format!("Desktop Duplication is not available: {err}"))
    }
}

fn acquire_dxgi(
    duplication: &IDXGIOutputDuplication,
    timeout_ms: u32,
) -> Result<Option<ID3D11Texture2D>, String> {
    unsafe {
        let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;
        match duplication.AcquireNextFrame(timeout_ms, &mut info, &mut resource) {
            Ok(()) => {}
            Err(err) if err.code() == DXGI_ERROR_WAIT_TIMEOUT => return Ok(None),
            Err(err) if err.code() == DXGI_ERROR_ACCESS_LOST => {
                return Err("The display changed. Clip capture will start again.".into());
            }
            Err(err) if err.code() == DXGI_ERROR_UNSUPPORTED => {
                return Err("Desktop Duplication is not available on this display.".into());
            }
            Err(err) => return Err(format!("Couldn't capture the display: {err}")),
        }
        if info.AccumulatedFrames == 0 {
            let _ = duplication.ReleaseFrame();
            return Ok(None);
        }
        let resource = resource.ok_or("The display capture was empty.")?;
        let texture: ID3D11Texture2D = resource
            .cast()
            .map_err(|err| format!("Couldn't read the captured frame: {err}"))?;
        Ok(Some(texture))
    }
}

struct Scaler {
    device: ID3D11Device,
    video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    output: ID3D11Texture2D,
    output_view: ID3D11VideoProcessorOutputView,
    width: u32,
    height: u32,
}

impl Scaler {
    fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        width: u32,
        height: u32,
    ) -> Result<Self, String> {
        unsafe {
            let video_device: ID3D11VideoDevice = device
                .cast()
                .map_err(|err| format!("The GPU cannot scale frames: {err}"))?;
            let video_context: ID3D11VideoContext = context
                .cast()
                .map_err(|err| format!("The GPU cannot scale frames: {err}"))?;
            let content = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
                InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
                InputFrameRate: windows::Win32::Graphics::Dxgi::Common::DXGI_RATIONAL {
                    Numerator: 60,
                    Denominator: 1,
                },
                InputWidth: width,
                InputHeight: height,
                OutputFrameRate: windows::Win32::Graphics::Dxgi::Common::DXGI_RATIONAL {
                    Numerator: 60,
                    Denominator: 1,
                },
                OutputWidth: width,
                OutputHeight: height,
                Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
            };
            let enumerator = video_device
                .CreateVideoProcessorEnumerator(&content)
                .map_err(|err| format!("The GPU cannot scale frames: {err}"))?;
            let processor = video_device
                .CreateVideoProcessor(&enumerator, 0)
                .map_err(|err| format!("The GPU cannot scale frames: {err}"))?;
            let desc = D3D11_TEXTURE2D_DESC {
                Width: width,
                Height: height,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_NV12,
                SampleDesc: DXGI_SAMPLE_DESC {
                    Count: 1,
                    Quality: 0,
                },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut output = None;
            device
                .CreateTexture2D(&desc, None, Some(&mut output))
                .map_err(|err| format!("Couldn't allocate an NV12 frame: {err}"))?;
            let output = output.ok_or("Couldn't allocate an NV12 frame.")?;
            let view_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
                ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
                Anonymous:
                    windows::Win32::Graphics::Direct3D11::D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
                        Texture2D: windows::Win32::Graphics::Direct3D11::D3D11_TEX2D_VPOV {
                            MipSlice: 0,
                        },
                    },
            };
            let mut output_view = None;
            video_device
                .CreateVideoProcessorOutputView(
                    &output,
                    &enumerator,
                    &view_desc,
                    Some(&mut output_view),
                )
                .map_err(|err| format!("Couldn't allocate an NV12 frame: {err}"))?;
            let output_view = output_view.ok_or("Couldn't allocate an NV12 frame.")?;
            let _ = desc;
            Ok(Self {
                device: device.clone(),
                video_device,
                video_context,
                enumerator,
                processor,
                output,
                output_view,
                width,
                height,
            })
        }
    }

    fn blit(
        &self,
        _context: &ID3D11DeviceContext,
        source: &ID3D11Texture2D,
    ) -> Result<ID3D11Texture2D, String> {
        unsafe {
            let mut src_desc = D3D11_TEXTURE2D_DESC::default();
            source.GetDesc(&mut src_desc);
            let input_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                FourCC: 0,
                ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                    Texture2D: D3D11_TEX2D_VPIV {
                        MipSlice: 0,
                        ArraySlice: 0,
                    },
                },
            };
            let mut input = None;
            self.video_device
                .CreateVideoProcessorInputView(
                    source,
                    &self.enumerator,
                    &input_desc,
                    Some(&mut input),
                )
                .map_err(|err| format!("Couldn't scale the frame: {err}"))?;
            let input = input.ok_or("Couldn't scale the frame.")?;
            let mut stream = D3D11_VIDEO_PROCESSOR_STREAM::default();
            stream.Enable = true.into();
            stream.pInputSurface = std::mem::ManuallyDrop::new(Some(input));
            let blitted = self.video_context.VideoProcessorBlt(
                &self.processor,
                &self.output_view,
                0,
                std::slice::from_ref(&stream),
            );
            let _input = std::mem::ManuallyDrop::into_inner(stream.pInputSurface);
            let _right = std::mem::ManuallyDrop::into_inner(stream.pInputSurfaceRight);
            blitted.map_err(|err| format!("Couldn't scale the frame: {err}"))?;
            let _ = src_desc;
            Ok(self.output.clone())
        }
    }
}

struct Encoder {
    transform: IMFTransform,
    width: u32,
    height: u32,
}

impl Encoder {
    fn open(
        device: &ID3D11Device,
        config: &LiveConfig,
    ) -> Result<(Self, bool, &'static str), String> {
        let want_hevc = config.hevc;
        let (transform, hevc, vendor) = activate_encoder(device, config, want_hevc)
            .or_else(|_| activate_encoder(device, config, false))?;
        Ok((
            Self {
                transform,
                width: config.width,
                height: config.height,
            },
            hevc,
            vendor,
        ))
    }

    fn encode(
        &mut self,
        texture: &ID3D11Texture2D,
        pts_ms: u64,
        fps: u32,
        force_key: bool,
    ) -> Result<Vec<LivePacket>, String> {
        unsafe {
            if force_key {
                let _ = force_keyframe(&self.transform);
            }
            let buffer = MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, texture, 0, false)
                .map_err(|err| format!("Couldn't hand the frame to the encoder: {err}"))?;
            let sample = MFCreateSample()
                .map_err(|err| format!("Couldn't hand the frame to the encoder: {err}"))?;
            sample
                .AddBuffer(&buffer)
                .map_err(|err| format!("Couldn't hand the frame to the encoder: {err}"))?;
            let ticks = 10_000_000i64 / i64::from(fps.max(1));
            sample
                .SetSampleTime(pts_ms as i64 * 10_000)
                .map_err(|err| format!("Couldn't hand the frame to the encoder: {err}"))?;
            sample
                .SetSampleDuration(ticks)
                .map_err(|err| format!("Couldn't hand the frame to the encoder: {err}"))?;
            self.transform
                .ProcessInput(0, &sample, 0)
                .map_err(|err| format!("The hardware encoder rejected a frame: {err}"))?;
            self.drain(pts_ms)
        }
    }

    unsafe fn drain(&self, pts_ms: u64) -> Result<Vec<LivePacket>, String> {
        let mut packets = Vec::new();
        for _ in 0..8 {
            let mut output = MFT_OUTPUT_DATA_BUFFER {
                dwStreamID: 0,
                pSample: std::mem::ManuallyDrop::new(None),
                dwStatus: 0,
                pEvents: std::mem::ManuallyDrop::new(None),
            };
            let mut status = 0u32;
            let produced =
                self.transform
                    .ProcessOutput(0, std::slice::from_mut(&mut output), &mut status);
            let sample = std::mem::ManuallyDrop::into_inner(output.pSample);
            let _events = std::mem::ManuallyDrop::into_inner(output.pEvents);
            match produced {
                Ok(()) => {
                    if let Some(sample) = sample {
                        if let Some(bytes) = sample_bytes(&sample) {
                            packets.push(LivePacket {
                                pts_ms,
                                duration_ticks: 0,
                                bytes,
                            });
                        }
                    }
                }
                Err(err) if err.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => break,
                Err(err) if err.code() == MF_E_TRANSFORM_STREAM_CHANGE => continue,
                Err(err) if err.code() == MF_E_NO_EVENTS_AVAILABLE => break,
                Err(err) => return Err(format!("The hardware encoder stopped: {err}")),
            }
        }
        Ok(packets)
    }
}

fn activate_encoder(
    device: &ID3D11Device,
    config: &LiveConfig,
    hevc: bool,
) -> Result<(IMFTransform, bool, &'static str), String> {
    unsafe {
        let subtype = if hevc {
            MFVideoFormat_HEVC
        } else {
            MFVideoFormat_H264
        };
        let input = MFT_REGISTER_TYPE_INFO {
            guidMajorType: MFMediaType_Video,
            guidSubtype: MFVideoFormat_NV12,
        };
        let output = MFT_REGISTER_TYPE_INFO {
            guidMajorType: MFMediaType_Video,
            guidSubtype: subtype,
        };
        let mut activates: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0u32;
        let flags = MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER;
        MFTEnumEx(
            MFT_CATEGORY_VIDEO_ENCODER,
            flags,
            Some(&input),
            Some(&output),
            &mut activates,
            &mut count,
        )
        .map_err(|err| format!("No hardware encoder is available: {err}"))?;
        if activates.is_null() || count == 0 {
            return Err("No hardware encoder is available.".into());
        }
        let list = std::slice::from_raw_parts(activates, count as usize);
        let prefer = config.encoder.to_ascii_lowercase();
        let mut chosen: Option<(IMFTransform, &'static str)> = None;
        let mut fallback: Option<(IMFTransform, &'static str)> = None;
        for activate in list.iter().flatten() {
            let vendor = vendor_of(activate);
            if let Ok(transform) = activate.ActivateObject::<IMFTransform>() {
                if prepare_transform(&transform, device, config, hevc).is_ok() {
                    if !prefer.is_empty() && prefer != "auto" && vendor == prefer.as_str() && chosen.is_none() {
                        chosen = Some((transform, vendor));
                    } else if fallback.is_none() {
                        fallback = Some((transform, vendor));
                    }
                }
            }
        }
        if chosen.is_none() {
            chosen = fallback;
        }
        CoTaskMemFree(Some(activates as *const std::ffi::c_void));
        let (transform, vendor) = chosen.ok_or("No hardware encoder accepted this format.")?;
        Ok((transform, hevc, vendor))
    }
}

fn vendor_of(activate: &IMFActivate) -> &'static str {
    unsafe {
        let mut value = windows::core::PWSTR::null();
        let mut len = 0u32;
        if activate
            .GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut value, &mut len)
            .is_err()
            || value.is_null()
        {
            return "nvenc";
        }
        let slice = std::slice::from_raw_parts(value.0, len as usize);
        let name = String::from_utf16_lossy(slice).to_ascii_lowercase();
        CoTaskMemFree(Some(value.0 as *const std::ffi::c_void));
        if name.contains("nvidia") {
            "nvenc"
        } else if name.contains("amd") || name.contains("radeon") || name.contains("amf") {
            "amf"
        } else if name.contains("intel") || name.contains("quick sync") {
            "qsv"
        } else {
            "nvenc"
        }
    }
}

unsafe fn prepare_transform(
    transform: &IMFTransform,
    device: &ID3D11Device,
    config: &LiveConfig,
    hevc: bool,
) -> Result<(), String> {
    let attributes = transform
        .GetAttributes()
        .map_err(|err| format!("The hardware encoder did not start: {err}"))?;
    let async_mft = attributes.GetUINT32(&MF_TRANSFORM_ASYNC).unwrap_or(0) != 0;
    if async_mft {
        attributes
            .SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)
            .map_err(|err| format!("The hardware encoder did not start: {err}"))?;
    }
    let _ = attributes.SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1);
    let output = MFCreateMediaType().map_err(|err| err.to_string())?;
    output
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
        .map_err(|err| err.to_string())?;
    output
        .SetGUID(
            &MF_MT_SUBTYPE,
            if hevc {
                &MFVideoFormat_HEVC
            } else {
                &MFVideoFormat_H264
            },
        )
        .map_err(|err| err.to_string())?;
    output
        .SetUINT32(&MF_MT_AVG_BITRATE, config.bitrate)
        .map_err(|err| err.to_string())?;
    output
        .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
        .map_err(|err| err.to_string())?;
    output
        .SetUINT64(&MF_MT_FRAME_SIZE, pack_u32(config.width, config.height))
        .map_err(|err| err.to_string())?;
    output
        .SetUINT64(&MF_MT_FRAME_RATE, pack_u32(config.fps.max(1), 1))
        .map_err(|err| err.to_string())?;
    transform.SetOutputType(0, &output, 0).map_err(|err| {
        format!(
            "The hardware encoder rejected {0}×{1}: {err}",
            config.width, config.height
        )
    })?;
    let input = MFCreateMediaType().map_err(|err| err.to_string())?;
    input
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
        .map_err(|err| err.to_string())?;
    input
        .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12)
        .map_err(|err| err.to_string())?;
    input
        .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
        .map_err(|err| err.to_string())?;
    input
        .SetUINT64(&MF_MT_FRAME_SIZE, pack_u32(config.width, config.height))
        .map_err(|err| err.to_string())?;
    input
        .SetUINT64(&MF_MT_FRAME_RATE, pack_u32(config.fps.max(1), 1))
        .map_err(|err| err.to_string())?;
    transform
        .SetInputType(0, &input, 0)
        .map_err(|err| format!("The hardware encoder rejected NV12 input: {err}"))?;
    attach_device(transform, device)?;
    transform
        .ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)
        .map_err(|err| format!("The hardware encoder did not start: {err}"))?;
    transform
        .ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)
        .map_err(|err| format!("The hardware encoder did not start: {err}"))?;
    if config.stream {
        apply_stream_codec(transform, config);
    }
    let _ = hevc;
    Ok(())
}

unsafe fn apply_stream_codec(transform: &IMFTransform, config: &crate::LiveConfig) {
    use windows::Win32::Media::MediaFoundation::{
        CODECAPI_AVEncCommonRateControlMode, CODECAPI_AVEncMPVGOPSize, CODECAPI_AVEncMPVDefaultBPictureCount,
        CODECAPI_AVLowLatencyMode, ICodecAPI,
    };
    let Ok(codec) = transform.cast::<ICodecAPI>() else { return };
    let gop = if config.idr_interval == 0 {
        config.fps.max(1).saturating_mul(2)
    } else {
        config.idr_interval
    };
    let _ = set_codec_u32(&codec, &CODECAPI_AVLowLatencyMode, 1);
    let _ = set_codec_u32(&codec, &CODECAPI_AVEncCommonRateControlMode, 0);
    let _ = set_codec_u32(&codec, &CODECAPI_AVEncMPVDefaultBPictureCount, 0);
    let _ = set_codec_u32(&codec, &CODECAPI_AVEncMPVGOPSize, gop);
}

unsafe fn set_codec_u32(codec: &windows::Win32::Media::MediaFoundation::ICodecAPI, key: &windows::core::GUID, value: u32) -> Result<(), String> {
    use windows::Win32::System::Variant::{VARIANT, VT_UI4};
    let mut variant = VARIANT::default();
    let inner = &mut *variant.Anonymous.Anonymous;
    inner.vt = VT_UI4;
    inner.Anonymous.ulVal = value;
    codec.SetValue(key, &variant).map_err(|err| err.to_string())
}

unsafe fn attach_device(transform: &IMFTransform, device: &ID3D11Device) -> Result<(), String> {
    let dxgi: IDXGIDevice = device
        .cast()
        .map_err(|err| format!("Couldn't share the GPU with the encoder: {err}"))?;
    let mut token = 0u32;
    let mut manager = None;
    MFCreateDXGIDeviceManager(&mut token, &mut manager)
        .map_err(|err| format!("Couldn't share the GPU with the encoder: {err}"))?;
    let manager = manager.ok_or("Couldn't share the GPU with the encoder.")?;
    manager
        .ResetDevice(&dxgi, token)
        .map_err(|err| format!("Couldn't share the GPU with the encoder: {err}"))?;
    let unknown: windows::core::IUnknown = manager
        .cast()
        .map_err(|err| format!("Couldn't share the GPU with the encoder: {err}"))?;
    transform
        .ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, unknown.as_raw() as usize)
        .map_err(|err| format!("Couldn't share the GPU with the encoder: {err}"))?;
    Ok(())
}

fn pack_u32(high: u32, low: u32) -> u64 {
    (u64::from(high) << 32) | u64::from(low)
}

unsafe fn force_keyframe(transform: &IMFTransform) -> Result<(), String> {
    use windows::Win32::Media::MediaFoundation::{CODECAPI_AVEncVideoForceKeyFrame, ICodecAPI};
    use windows::Win32::System::Variant::{VARIANT, VT_UI4};
    let codec: ICodecAPI = transform.cast().map_err(|err| err.to_string())?;
    let mut value = VARIANT::default();
    let inner = &mut *value.Anonymous.Anonymous;
    inner.vt = VT_UI4;
    inner.Anonymous.ulVal = 1;
    codec
        .SetValue(&CODECAPI_AVEncVideoForceKeyFrame, &value)
        .map_err(|err| err.to_string())?;
    Ok(())
}

unsafe fn sample_bytes(sample: &IMFSample) -> Option<Vec<u8>> {
    let buffer = sample.ConvertToContiguousBuffer().ok()?;
    let mut data = std::ptr::null_mut();
    let mut current = 0u32;
    buffer.Lock(&mut data, None, Some(&mut current)).ok()?;
    let bytes = if data.is_null() || current == 0 {
        None
    } else {
        Some(std::slice::from_raw_parts(data, current as usize).to_vec())
    };
    let _ = buffer.Unlock();
    bytes
}

fn list_encoders() -> Result<(&'static str, bool, bool), String> {
    let _ = com_init()?;
    let hevc = unsafe { encoder_vendors(true).unwrap_or_default() };
    let h264 = unsafe { encoder_vendors(false).unwrap_or_default() };
    let hevc_ok = !hevc.is_empty();
    let h264_ok = !h264.is_empty();
    if !hevc_ok && !h264_ok {
        return Ok(("unavailable", false, false));
    }
    let name = ["nvenc", "amf", "qsv"]
        .into_iter()
        .find(|name| hevc.iter().any(|item| item == name) || h264.iter().any(|item| item == name))
        .unwrap_or("nvenc");
    Ok((name, hevc_ok, h264_ok))
}

unsafe fn encoder_vendors(hevc: bool) -> Result<Vec<&'static str>, String> {
    let subtype = if hevc {
        MFVideoFormat_HEVC
    } else {
        MFVideoFormat_H264
    };
    let input = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: MFVideoFormat_NV12,
    };
    let output = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: subtype,
    };
    let mut activates: *mut Option<IMFActivate> = std::ptr::null_mut();
    let mut count = 0u32;
    MFTEnumEx(
        MFT_CATEGORY_VIDEO_ENCODER,
        MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
        Some(&input),
        Some(&output),
        &mut activates,
        &mut count,
    )
    .map_err(|err| err.to_string())?;
    if activates.is_null() || count == 0 {
        return Ok(Vec::new());
    }
    let list = std::slice::from_raw_parts(activates, count as usize);
    let vendors: Vec<&'static str> = list.iter().flatten().map(vendor_of).collect();
    CoTaskMemFree(Some(activates as *const std::ffi::c_void));
    Ok(vendors)
}

fn backend_name(api: &str, vendor: &str, hevc: bool) -> &'static str {
    match (api, vendor, hevc) {
        ("DXGI", "nvenc", true) => "DXGI · NVENC HEVC",
        ("DXGI", "nvenc", false) => "DXGI · NVENC",
        ("DXGI", "amf", true) => "DXGI · AMF HEVC",
        ("DXGI", "amf", false) => "DXGI · AMF",
        ("DXGI", "qsv", true) => "DXGI · Quick Sync HEVC",
        ("DXGI", "qsv", false) => "DXGI · Quick Sync",
        ("DXGI", _, true) => "DXGI · NVENC HEVC",
        ("DXGI", _, false) => "DXGI · NVENC",
        (_, "amf", true) => "Windows Graphics Capture · AMF HEVC",
        (_, "amf", false) => "Windows Graphics Capture · AMF",
        (_, "qsv", true) => "Windows Graphics Capture · Quick Sync HEVC",
        (_, "qsv", false) => "Windows Graphics Capture · Quick Sync",
        (_, _, true) => "Windows Graphics Capture · NVENC HEVC",
        (_, _, false) => "Windows Graphics Capture · NVENC",
    }
}

struct Wgc {
    pool: windows::Graphics::Capture::Direct3D11CaptureFramePool,
    session: windows::Graphics::Capture::GraphicsCaptureSession,
}

impl Wgc {
    fn start(device: &ID3D11Device, monitor: HMONITOR, game_mode: bool) -> Result<Self, String> {
        unsafe {
            use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem};
            use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
            use windows::Graphics::DirectX::DirectXPixelFormat;
            use windows::Win32::System::WinRT::Direct3D11::CreateDirect3D11DeviceFromDXGIDevice;
            use windows::Win32::System::WinRT::Direct3D11::IDirect3DDxgiInterfaceAccess;
            use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
            let _ = IDirect3DDxgiInterfaceAccess::IID;
            let interop =
                windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                    .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let item: GraphicsCaptureItem = interop
                .CreateForMonitor(monitor)
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let dxgi: IDXGIDevice = device
                .cast()
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi)
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let winrt_device: IDirect3DDevice = inspectable
                .cast()
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let size = item
                .Size()
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let buffers = if game_mode { 1 } else { 2 };
            let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
                &winrt_device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                buffers,
                size,
            )
            .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let session = pool
                .CreateCaptureSession(&item)
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let _ = session.SetIsBorderRequired(false);
            let _ = session.SetIsCursorCaptureEnabled(true);
            session
                .StartCapture()
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            Ok(Self { pool, session })
        }
    }

    fn start_window(device: &ID3D11Device, window: HWND) -> Result<Self, String> {
        unsafe {
            use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem};
            use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
            use windows::Graphics::DirectX::DirectXPixelFormat;
            use windows::Win32::System::WinRT::Direct3D11::CreateDirect3D11DeviceFromDXGIDevice;
            use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
            let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let item: GraphicsCaptureItem = interop
                .CreateForWindow(window)
                .map_err(|err| format!("Couldn't capture that window: {err}"))?;
            let dxgi: IDXGIDevice = device.cast().map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi)
                .map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let winrt_device: IDirect3DDevice = inspectable.cast().map_err(|err| format!("Windows Graphics Capture is not available: {err}"))?;
            let size = item.Size().map_err(|err| format!("Couldn't capture that window: {err}"))?;
            let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
                &winrt_device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                2,
                size,
            )
            .map_err(|err| format!("Couldn't capture that window: {err}"))?;
            let session = pool.CreateCaptureSession(&item).map_err(|err| format!("Couldn't capture that window: {err}"))?;
            let _ = session.SetIsBorderRequired(false);
            let _ = session.SetIsCursorCaptureEnabled(true);
            session.StartCapture().map_err(|err| format!("Couldn't capture that window: {err}"))?;
            Ok(Self { pool, session })
        }
    }

    fn next_texture(&self) -> Result<Option<ID3D11Texture2D>, String> {
        use windows::Win32::System::WinRT::Direct3D11::IDirect3DDxgiInterfaceAccess;
        let frame = match self.pool.TryGetNextFrame() {
            Ok(frame) => frame,
            Err(_) => return Ok(None),
        };
        let surface = frame
            .Surface()
            .map_err(|err| format!("Couldn't read a capture frame: {err}"))?;
        let access: IDirect3DDxgiInterfaceAccess = surface
            .cast()
            .map_err(|err| format!("Couldn't read a capture frame: {err}"))?;
        let texture = unsafe { access.GetInterface::<ID3D11Texture2D>() }
            .map_err(|err| format!("Couldn't read a capture frame: {err}"))?;
        Ok(Some(texture))
    }
}

impl Drop for Wgc {
    fn drop(&mut self) {
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}
