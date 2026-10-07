//! ScreenCaptureKit capture into a VideoToolbox hardware encoder.
//!
//! Frames stay in IOSurface pixel buffers. The encoder callback keeps H.264 or HEVC
//! access units only. Game Mode targets a utility queue and a depth of one so the
//! capture system drops frames instead of queuing raw ones.

use std::ffi::{c_void, CStr};
use std::os::raw::c_char;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use block::ConcreteBlock;
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel};
use objc::{class, msg_send, sel, sel_impl};
use objc::{Encode, Encoding};

use crate::{HardwareProbe, LiveConfig, LivePacket};

pub struct Session {
    backend: &'static str,
    hevc: bool,
    state: Arc<Shared>,
    stream: *mut Object,
    output: *mut Object,
    queue: *mut c_void,
    vt: *mut c_void,
}

struct Shared {
    vt: Mutex<usize>,
    packets: Mutex<Vec<LivePacket>>,
    error: Mutex<String>,
    started: Instant,
    fps: u32,
    hevc: bool,
    force_idr: AtomicBool,
    audio: Mutex<Vec<f32>>,
}

pub fn probe() -> HardwareProbe {
    unsafe {
        let id = CGMainDisplayID();
        let width = CGDisplayPixelsWide(id) as u32;
        let height = CGDisplayPixelsHigh(id) as u32;
        let mode = CGDisplayCopyDisplayMode(id);
        let mut refresh = 0u32;
        if !mode.is_null() {
            let rate = CGDisplayModeGetRefreshRate(mode);
            if rate.is_finite() && rate > 1.0 {
                refresh = rate.round() as u32;
            }
            CFRelease(mode);
        }
        let hevc = hardware_codec(true);
        let h264 = hardware_codec(false);
        HardwareProbe {
            display_width: width,
            display_height: height,
            refresh_hz: refresh,
            encoder_name: if hevc || h264 {
                "videotoolbox"
            } else {
                "unavailable"
            },
            hevc,
            h264,
        }
    }
}

pub fn set_thread_pace(game_mode: bool) {
    let class = if game_mode { 0x11u32 } else { 0x19u32 };
    unsafe {
        let _ = pthread_set_qos_class_self_np(class, 0);
    }
}

/// User-interactive QoS. Game Mode does not move a Go Live capture onto the utility queue.
pub fn set_stream_priority() {
    unsafe {
        let _ = pthread_set_qos_class_self_np(0x21, 0);
    }
}

impl Session {
    pub fn open(config: &LiveConfig) -> Result<Self, String> {
        if config.stream {
            set_stream_priority();
        } else {
            set_thread_pace(config.game_mode);
        }
        let hevc = if config.hevc && hardware_codec(true) {
            true
        } else if hardware_codec(false) {
            false
        } else if config.hevc {
            true
        } else {
            return Err("VideoToolbox has no hardware encoder.".into());
        };
        let state = Arc::new(Shared {
            vt: Mutex::new(0),
            packets: Mutex::new(Vec::new()),
            error: Mutex::new(String::new()),
            started: Instant::now(),
            fps: config.fps.max(1),
            hevc,
            force_idr: AtomicBool::new(false),
            audio: Mutex::new(Vec::new()),
        });
        let vt = unsafe { open_encoder(config, hevc, Arc::as_ptr(&state) as *mut c_void)? };
        *state.vt.lock().unwrap_or_else(|err| err.into_inner()) = vt as usize;
        let (stream, output, queue) =
            unsafe { open_stream(config, Arc::as_ptr(&state) as *mut c_void)? };
        Ok(Self {
            backend: if hevc {
                "ScreenCaptureKit · VideoToolbox HEVC"
            } else {
                "ScreenCaptureKit · VideoToolbox"
            },
            hevc,
            state,
            stream,
            output,
            queue,
            vt,
        })
    }

    pub fn backend(&self) -> &'static str {
        self.backend
    }

    pub fn hevc(&self) -> bool {
        self.hevc
    }

    pub fn tick(&mut self) -> Result<Vec<LivePacket>, String> {
        let error = self
            .state
            .error
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone();
        if !error.is_empty() {
            return Err(error);
        }
        let mut packets = self
            .state
            .packets
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        Ok(std::mem::take(&mut *packets))
    }

    pub fn request_idr(&mut self) {
        self.state.force_idr.store(true, Ordering::Relaxed);
    }

    pub fn pull_audio(&mut self) -> Vec<f32> {
        let mut audio = self.state.audio.lock().unwrap_or_else(|err| err.into_inner());
        std::mem::take(&mut *audio)
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            if !self.stream.is_null() {
                let (tx, rx) = mpsc::sync_channel(1);
                let block = ConcreteBlock::new(move |_error: *mut Object| {
                    let _ = tx.send(());
                })
                .copy();
                let _: () = msg_send![self.stream, stopCaptureWithCompletionHandler: &*block];
                let _ = rx.recv_timeout(Duration::from_millis(500));
                let _: () = msg_send![self.stream, release];
            }
            if !self.vt.is_null() {
                let _ = VTCompressionSessionCompleteFrames(self.vt, cm_time_invalid());
                VTCompressionSessionInvalidate(self.vt);
                CFRelease(self.vt);
            }
            if !self.output.is_null() {
                let _: () = msg_send![self.output, release];
            }
            if !self.queue.is_null() {
                dispatch_release(self.queue);
            }
        }
    }
}

unsafe fn open_stream(
    config: &LiveConfig,
    sink: *mut c_void,
) -> Result<(*mut Object, *mut Object, *mut c_void), String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let block = ConcreteBlock::new(move |content: *mut Object, error: *mut Object| {
        if !content.is_null() {
            let _: *mut Object = msg_send![content, retain];
        }
        let _ = tx.send((content as usize, error as usize));
    })
    .copy();
    let _: () = msg_send![
        class!(SCShareableContent),
        getShareableContentWithCompletionHandler: &*block
    ];
    let (content, error) = rx
        .recv_timeout(Duration::from_secs(3))
        .map_err(|_| "Screen capture did not answer.".to_string())?;
    let content = content as *mut Object;
    if content.is_null() {
        return Err(format!(
            "{}. Allow Lark under System Settings → Privacy & Security → Screen Recording, then turn capture on again.",
            describe(error as *mut Object)
        ));
    }
    let displays: *mut Object = msg_send![content, displays];
    let count: usize = msg_send![displays, count];
    if count == 0 {
        let _: () = msg_send![content, release];
        return Err("No display found.".into());
    }
    let main = CGMainDisplayID();
    let screen_index = config.source.strip_prefix("screen:").and_then(|text| text.parse::<usize>().ok());
    let window_id = config.source.strip_prefix("window:").and_then(|text| text.parse::<u32>().ok());
    let mut chosen: *mut Object = std::ptr::null_mut();
    let mut seen = 0usize;
    for index in 0..count {
        let display: *mut Object = msg_send![displays, objectAtIndex: index];
        let id: usize = msg_send![display, displayID];
        if let Some(want) = screen_index {
            if seen == want {
                chosen = display;
                break;
            }
            seen += 1;
            continue;
        }
        if chosen.is_null() || id as u32 == main {
            chosen = display;
        }
        if id as u32 == main {
            break;
        }
    }
    let mut window: *mut Object = std::ptr::null_mut();
    if let Some(want) = window_id {
        let windows: *mut Object = msg_send![content, windows];
        let window_count: usize = msg_send![windows, count];
        for index in 0..window_count {
            let item: *mut Object = msg_send![windows, objectAtIndex: index];
            let id: u32 = msg_send![item, windowID];
            if id == want {
                window = item;
                break;
            }
        }
    }
    let empty: *mut Object = msg_send![class!(NSArray), array];
    let filter: *mut Object = msg_send![class!(SCContentFilter), alloc];
    let filter: *mut Object = if !window.is_null() {
        let independent = sel!(initWithDesktopIndependentWindow:);
        let responds: bool = msg_send![filter, respondsToSelector: independent];
        if responds {
            msg_send![filter, initWithDesktopIndependentWindow: window]
        } else {
            msg_send![filter, initWithWindow: window]
        }
    } else {
        msg_send![filter, initWithDisplay: chosen excludingWindows: empty]
    };
    let stream_config: *mut Object = msg_send![class!(SCStreamConfiguration), new];
    let _: () = msg_send![stream_config, setWidth: config.width as usize];
    let _: () = msg_send![stream_config, setHeight: config.height as usize];
    let _: () = msg_send![stream_config, setPixelFormat: 0x4247_5241u32];
    let _: () = msg_send![stream_config, setShowsCursor: true];
    if config.stream && config.app_audio {
        let captures = sel!(setCapturesAudio:);
        let responds: bool = msg_send![stream_config, respondsToSelector: captures];
        if responds {
            let _: () = msg_send![stream_config, setCapturesAudio: true];
        }
        let exclude = sel!(setExcludesCurrentProcessAudio:);
        let responds: bool = msg_send![stream_config, respondsToSelector: exclude];
        if responds {
            let _: () = msg_send![stream_config, setExcludesCurrentProcessAudio: true];
        }
    }
    let depth: isize = if config.stream {
        2
    } else if config.game_mode {
        1
    } else {
        2
    };
    let _: () = msg_send![stream_config, setQueueDepth: depth];
    let interval = CmTime {
        value: 1,
        timescale: config.fps.max(1) as i32,
        flags: 1,
        epoch: 0,
    };
    let _: () = msg_send![stream_config, setMinimumFrameInterval: interval];
    let scales = sel!(setScalesToFit:);
    let responds: bool = msg_send![stream_config, respondsToSelector: scales];
    if responds {
        let _: () = msg_send![stream_config, setScalesToFit: true];
    }
    let output: *mut Object = msg_send![output_class(), alloc];
    let output: *mut Object = msg_send![output, init];
    (*output).set_ivar("sink", sink);
    let label = b"lark.clip\0".as_ptr() as *const c_char;
    let queue = dispatch_queue_create(label, std::ptr::null());
    let qos: isize = if config.stream {
        0x21
    } else if config.game_mode {
        0x11
    } else {
        0x19
    };
    let target = dispatch_get_global_queue(qos, 0);
    dispatch_set_target_queue(queue, target);
    let stream: *mut Object = msg_send![class!(SCStream), alloc];
    let stream: *mut Object = msg_send![stream, initWithFilter: filter configuration: stream_config delegate: std::ptr::null_mut::<Object>()];
    let mut add_error: *mut Object = std::ptr::null_mut();
    let added: bool = msg_send![stream, addStreamOutput: output type: 0usize sampleHandlerQueue: queue error: &mut add_error];
    if added && config.stream && config.app_audio {
        let mut audio_error: *mut Object = std::ptr::null_mut();
        let _: bool = msg_send![stream, addStreamOutput: output type: 1usize sampleHandlerQueue: queue error: &mut audio_error];
    }
    if !added {
        let _: () = msg_send![content, release];
        return Err(describe(add_error));
    }
    let (start_tx, start_rx) = mpsc::sync_channel(1);
    let start = ConcreteBlock::new(move |error: *mut Object| {
        let _ = start_tx.send(error as usize);
    })
    .copy();
    let _: () = msg_send![stream, startCaptureWithCompletionHandler: &*start];
    let start_error = start_rx
        .recv_timeout(Duration::from_secs(3))
        .map_err(|_| "Screen capture did not start.".to_string())?;
    let _: () = msg_send![content, release];
    let _: () = msg_send![filter, release];
    if start_error != 0 {
        let _: () = msg_send![stream, release];
        let _: () = msg_send![output, release];
        dispatch_release(queue);
        return Err(format!(
            "{}. Allow Lark under System Settings → Privacy & Security → Screen Recording, then turn capture on again.",
            describe(start_error as *mut Object)
        ));
    }
    Ok((stream, output, queue))
}

#[repr(C)]
struct AudioStreamBasicDescription {
    sample_rate: f64,
    format_id: u32,
    format_flags: u32,
    bytes_per_packet: u32,
    frames_per_packet: u32,
    bytes_per_frame: u32,
    channels: u32,
    bits: u32,
    reserved: u32,
}

fn capture_audio(this: &Object, sample: *mut Object) {
    let sink = unsafe { *this.get_ivar::<*mut c_void>("sink") } as *const Shared;
    if sink.is_null() {
        return;
    }
    let state = unsafe { &*sink };
    unsafe {
        let format = CMSampleBufferGetFormatDescription(sample as *mut c_void);
        let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format);
        if asbd.is_null() {
            return;
        }
        let desc = &*asbd;
        if desc.bits != 32 || desc.channels == 0 {
            return;
        }
        let block = CMSampleBufferGetDataBuffer(sample as *mut c_void);
        if block.is_null() {
            return;
        }
        let length = CMBlockBufferGetDataLength(block);
        if length < 4 {
            return;
        }
        let mut bytes = vec![0u8; length];
        if CMBlockBufferCopyDataBytes(block, 0, length, bytes.as_mut_ptr() as *mut c_void) != 0 {
            return;
        }
        let floats = bytes.len() / 4;
        let pcm = std::slice::from_raw_parts(bytes.as_ptr() as *const f32, floats);
        let channels = desc.channels as usize;
        let mut mono = Vec::with_capacity(floats / channels);
        let mut index = 0;
        while index + channels <= pcm.len() {
            let mut sum = 0f32;
            for channel in 0..channels {
                sum += pcm[index + channel];
            }
            mono.push(sum / channels as f32);
            index += channels;
        }
        let rate = if desc.sample_rate > 1.0 { desc.sample_rate.round() as u32 } else { 48_000 };
        if rate != 48_000 && !mono.is_empty() {
            let out_len = ((mono.len() as u64 * 48_000) / u64::from(rate.max(1))).max(1) as usize;
            let mut scaled = Vec::with_capacity(out_len);
            for step in 0..out_len {
                let src = (step as u64 * u64::from(rate)) / 48_000;
                scaled.push(mono[src.min(mono.len() as u64 - 1) as usize]);
            }
            mono = scaled;
        }
        let mut audio = state.audio.lock().unwrap_or_else(|err| err.into_inner());
        audio.extend(mono);
        if audio.len() > 48_000 {
            let extra = audio.len() - 48_000;
            audio.drain(..extra);
        }
    }
}

fn describe(error: *mut Object) -> String {
    if error.is_null() {
        return "Screen capture failed.".into();
    }
    unsafe {
        let text: *mut Object = msg_send![error, localizedDescription];
        if text.is_null() {
            return "Screen capture failed.".into();
        }
        let bytes: *const c_char = msg_send![text, UTF8String];
        if bytes.is_null() {
            return "Screen capture failed.".into();
        }
        CStr::from_ptr(bytes).to_string_lossy().into_owned()
    }
}

fn output_class() -> &'static Class {
    static CLASS: OnceLock<&'static Class> = OnceLock::new();
    CLASS.get_or_init(|| {
        let mut decl =
            ClassDecl::new("LarkClipStreamOutput", class!(NSObject)).expect("clip output class");
        decl.add_ivar::<*mut c_void>("sink");
        unsafe {
            decl.add_method(
                sel!(stream:didOutputSampleBuffer:ofType:),
                did_output as extern "C" fn(&Object, Sel, *mut Object, *mut Object, isize),
            );
        }
        decl.register()
    })
}

extern "C" fn did_output(
    this: &Object,
    _: Sel,
    _stream: *mut Object,
    sample: *mut Object,
    kind: isize,
) {
    if sample.is_null() {
        return;
    }
    if kind == 1 {
        capture_audio(this, sample);
        return;
    }
    if kind != 0 {
        return;
    }
    let sink = unsafe { *this.get_ivar::<*mut c_void>("sink") } as *const Shared;
    if sink.is_null() {
        return;
    }
    let state = unsafe { &*sink };
    let image = unsafe { CMSampleBufferGetImageBuffer(sample as *mut c_void) };
    if image.is_null() {
        return;
    }
    let vt = state.vt.lock().unwrap_or_else(|err| err.into_inner());
    let vt = *vt as *mut c_void;
    if vt.is_null() {
        return;
    }
    let pts_ms = state.started.elapsed().as_millis() as u64;
    let force = state.force_idr.swap(false, Ordering::Relaxed);
    let status = unsafe {
        let mut frame_props = std::ptr::null_mut();
        if force {
            frame_props = cf_dict(&[kVTEncodeFrameOptionKey_ForceKeyFrame], &[kCFBooleanTrue]);
        }
        let status = VTCompressionSessionEncodeFrame(
            vt,
            image,
            cm_time(pts_ms as i64, 1000),
            cm_time(1, state.fps as i32),
            frame_props,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        if !frame_props.is_null() {
            CFRelease(frame_props);
        }
        status
    };
    if status != 0 {
        *state.error.lock().unwrap_or_else(|err| err.into_inner()) =
            format!("VideoToolbox could not encode a frame ({status:#x}).");
    }
}

unsafe fn open_encoder(
    config: &LiveConfig,
    hevc: bool,
    sink: *mut c_void,
) -> Result<*mut c_void, String> {
    let codec = if hevc {
        u32::from_be_bytes(*b"hvc1")
    } else {
        u32::from_be_bytes(*b"avc1")
    };
    let bitrate = cf_number_i32(config.bitrate as i32);
    let frame_rate = cf_number_i32(config.fps.max(1) as i32);
    let idr = if config.stream {
        if config.idr_interval == 0 { config.fps.max(1).saturating_mul(2) } else { config.idr_interval }
    } else {
        config.fps.max(1)
    };
    let key_interval = cf_number_i32(idr as i32);
    let require = cf_dict(
        &[kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder],
        &[kCFBooleanTrue],
    );
    let mut session = std::ptr::null_mut();
    let created = VTCompressionSessionCreate(
        std::ptr::null(),
        config.width as i32,
        config.height as i32,
        codec,
        require,
        std::ptr::null(),
        std::ptr::null(),
        vt_output,
        sink,
        &mut session,
    );
    CFRelease(require);
    if created != 0 || session.is_null() {
        CFRelease(bitrate);
        CFRelease(frame_rate);
        CFRelease(key_interval);
        return Err(format!("VideoToolbox could not start ({created:#x})."));
    }
    let _ = VTSessionSetProperty(session, kVTCompressionPropertyKey_RealTime, kCFBooleanTrue);
    let _ = VTSessionSetProperty(
        session,
        kVTCompressionPropertyKey_AllowFrameReordering,
        kCFBooleanFalse,
    );
    if hevc {
        let _ = VTSessionSetProperty(
            session,
            kVTCompressionPropertyKey_ProfileLevel,
            kVTProfileLevel_HEVC_Main_AutoLevel,
        );
    } else {
        let _ = VTSessionSetProperty(
            session,
            kVTCompressionPropertyKey_ProfileLevel,
            kVTProfileLevel_H264_Baseline_AutoLevel,
        );
    }
    let _ = VTSessionSetProperty(session, kVTCompressionPropertyKey_AverageBitRate, bitrate);
    let _ = VTSessionSetProperty(
        session,
        kVTCompressionPropertyKey_ExpectedFrameRate,
        frame_rate,
    );
    let _ = VTSessionSetProperty(
        session,
        kVTCompressionPropertyKey_MaxKeyFrameInterval,
        key_interval,
    );
    CFRelease(bitrate);
    CFRelease(frame_rate);
    CFRelease(key_interval);
    if VTCompressionSessionPrepareToEncodeFrames(session) != 0 {
        VTCompressionSessionInvalidate(session);
        CFRelease(session);
        return Err("VideoToolbox could not prepare the encoder.".into());
    }
    Ok(session)
}

unsafe extern "C" fn vt_output(
    output: *mut c_void,
    _source: *mut c_void,
    status: i32,
    _flags: u32,
    sample: *mut c_void,
) {
    if output.is_null() || status != 0 || sample.is_null() {
        return;
    }
    let shared = &*(output as *const Shared);
    let format = CMSampleBufferGetFormatDescription(sample);
    let mut prefix = Vec::new();
    if !format.is_null() {
        if shared.hevc {
            for index in 0..3 {
                let nal = hevc_parameter_set(format, index);
                if !nal.is_empty() {
                    prefix.extend_from_slice(&(nal.len() as u32).to_be_bytes());
                    prefix.extend_from_slice(&nal);
                }
            }
        } else {
            for index in 0..2 {
                let nal = h264_parameter_set(format, index);
                if !nal.is_empty() {
                    prefix.extend_from_slice(&(nal.len() as u32).to_be_bytes());
                    prefix.extend_from_slice(&nal);
                }
            }
        }
    }
    let block = CMSampleBufferGetDataBuffer(sample);
    if block.is_null() {
        return;
    }
    let length = CMBlockBufferGetDataLength(block);
    if length == 0 {
        return;
    }
    let mut bytes = vec![0u8; length];
    if CMBlockBufferCopyDataBytes(block, 0, length, bytes.as_mut_ptr() as *mut c_void) != 0 {
        return;
    }
    if !prefix.is_empty() && sample_is_sync(sample) {
        prefix.extend_from_slice(&bytes);
        bytes = prefix;
    }
    let pts_ms = shared.started.elapsed().as_millis() as u64;
    shared
        .packets
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .push(LivePacket {
            pts_ms,
            duration_ticks: 0,
            bytes,
        });
}

fn sample_is_sync(sample: *mut c_void) -> bool {
    unsafe {
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, 0);
        if attachments.is_null() {
            return true;
        }
        let count = CFArrayGetCount(attachments);
        if count == 0 {
            return true;
        }
        let dict = CFArrayGetValueAtIndex(attachments, 0);
        if dict.is_null() {
            return true;
        }
        let not_sync = CFDictionaryGetValue(dict, kCMSampleAttachmentKey_NotSync);
        not_sync.is_null() || not_sync == kCFBooleanFalse
    }
}

fn hardware_codec(hevc: bool) -> bool {
    static HEVC: OnceLock<bool> = OnceLock::new();
    static H264: OnceLock<bool> = OnceLock::new();
    if hevc {
        *HEVC.get_or_init(|| unsafe { tiny_session(true) })
    } else {
        *H264.get_or_init(|| unsafe { tiny_session(false) })
    }
}

unsafe fn tiny_session(hevc: bool) -> bool {
    let codec = if hevc {
        u32::from_be_bytes(*b"hvc1")
    } else {
        u32::from_be_bytes(*b"avc1")
    };
    let require = cf_dict(
        &[kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder],
        &[kCFBooleanTrue],
    );
    let mut session = std::ptr::null_mut();
    let created = VTCompressionSessionCreate(
        std::ptr::null(),
        64,
        64,
        codec,
        require,
        std::ptr::null(),
        std::ptr::null(),
        vt_output,
        std::ptr::null_mut(),
        &mut session,
    );
    CFRelease(require);
    if created != 0 || session.is_null() {
        return false;
    }
    VTCompressionSessionInvalidate(session);
    CFRelease(session);
    true
}

fn hevc_parameter_set(format: *mut c_void, index: usize) -> Vec<u8> {
    unsafe {
        let mut pointer = std::ptr::null();
        let mut size = 0usize;
        let mut count = 0usize;
        let mut nal_length = 0i32;
        if CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(
            format,
            index,
            &mut pointer,
            &mut size,
            &mut count,
            &mut nal_length,
        ) != 0
            || pointer.is_null()
            || size == 0
        {
            return Vec::new();
        }
        std::slice::from_raw_parts(pointer, size).to_vec()
    }
}

fn h264_parameter_set(format: *mut c_void, index: usize) -> Vec<u8> {
    unsafe {
        let mut pointer = std::ptr::null();
        let mut size = 0usize;
        let mut count = 0usize;
        let mut nal_length = 0i32;
        if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
            format,
            index,
            &mut pointer,
            &mut size,
            &mut count,
            &mut nal_length,
        ) != 0
            || pointer.is_null()
            || size == 0
        {
            return Vec::new();
        }
        std::slice::from_raw_parts(pointer, size).to_vec()
    }
}

fn cf_number_i32(value: i32) -> *mut c_void {
    unsafe { CFNumberCreate(std::ptr::null(), 3, &value as *const i32 as *const c_void) }
}

fn cf_dict(keys: &[*const c_void], values: &[*const c_void]) -> *mut c_void {
    unsafe {
        CFDictionaryCreate(
            std::ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            keys.len() as isize,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        )
    }
}

fn cm_time(value: i64, timescale: i32) -> CmTime {
    CmTime {
        value,
        timescale,
        flags: 1,
        epoch: 0,
    }
}

fn cm_time_invalid() -> CmTime {
    CmTime {
        value: 0,
        timescale: 0,
        flags: 0,
        epoch: 0,
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CmTime {
    value: i64,
    timescale: i32,
    flags: u32,
    epoch: i64,
}

unsafe impl Encode for CmTime {
    fn encode() -> Encoding {
        unsafe { Encoding::from_str("{CMTime=qiIq}") }
    }
}

#[repr(C)]
struct CFDictionaryKeyCallBacks {
    version: isize,
    retain: *const c_void,
    release: *const c_void,
    copy_description: *const c_void,
    equal: *const c_void,
    hash: *const c_void,
}

#[repr(C)]
struct CFDictionaryValueCallBacks {
    version: isize,
    retain: *const c_void,
    release: *const c_void,
    copy_description: *const c_void,
    equal: *const c_void,
}

#[link(name = "System")]
unsafe extern "C" {
    fn pthread_set_qos_class_self_np(class: u32, relative: i32) -> i32;
    fn dispatch_queue_create(label: *const c_char, attr: *const c_void) -> *mut c_void;
    fn dispatch_release(queue: *mut c_void);
    fn dispatch_get_global_queue(identifier: isize, flags: usize) -> *mut c_void;
    fn dispatch_set_target_queue(queue: *mut c_void, target: *mut c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
#[link(name = "CoreGraphics", kind = "framework")]
#[link(name = "CoreMedia", kind = "framework")]
#[link(name = "CoreVideo", kind = "framework")]
#[link(name = "VideoToolbox", kind = "framework")]
#[link(name = "Foundation", kind = "framework")]
#[link(name = "ScreenCaptureKit", kind = "framework")]
unsafe extern "C" {
    static kCFBooleanTrue: *const c_void;
    static kCFBooleanFalse: *const c_void;
    static kCFTypeDictionaryKeyCallBacks: CFDictionaryKeyCallBacks;
    static kCFTypeDictionaryValueCallBacks: CFDictionaryValueCallBacks;
    static kVTCompressionPropertyKey_RealTime: *const c_void;
    static kVTCompressionPropertyKey_AllowFrameReordering: *const c_void;
    static kVTCompressionPropertyKey_ProfileLevel: *const c_void;
    static kVTCompressionPropertyKey_AverageBitRate: *const c_void;
    static kVTCompressionPropertyKey_ExpectedFrameRate: *const c_void;
    static kVTCompressionPropertyKey_MaxKeyFrameInterval: *const c_void;
    static kVTEncodeFrameOptionKey_ForceKeyFrame: *const c_void;
    static kVTProfileLevel_H264_Baseline_AutoLevel: *const c_void;
    static kVTProfileLevel_HEVC_Main_AutoLevel: *const c_void;
    static kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: *const c_void;
    static kCMSampleAttachmentKey_NotSync: *const c_void;

    fn CFRelease(value: *mut c_void);
    fn CFNumberCreate(allocator: *const c_void, kind: isize, value: *const c_void) -> *mut c_void;
    fn CFDictionaryCreate(
        allocator: *const c_void,
        keys: *const *const c_void,
        values: *const *const c_void,
        count: isize,
        key_callbacks: *const CFDictionaryKeyCallBacks,
        value_callbacks: *const CFDictionaryValueCallBacks,
    ) -> *mut c_void;
    fn CFArrayGetCount(array: *mut c_void) -> isize;
    fn CFArrayGetValueAtIndex(array: *mut c_void, index: isize) -> *mut c_void;
    fn CFDictionaryGetValue(dict: *mut c_void, key: *const c_void) -> *const c_void;

    fn CGMainDisplayID() -> u32;
    fn CGDisplayPixelsWide(display: u32) -> usize;
    fn CGDisplayPixelsHigh(display: u32) -> usize;
    fn CGDisplayCopyDisplayMode(display: u32) -> *mut c_void;
    fn CGDisplayModeGetRefreshRate(mode: *mut c_void) -> f64;

    fn VTCompressionSessionCreate(
        allocator: *const c_void,
        width: i32,
        height: i32,
        codec: u32,
        encoder_specification: *const c_void,
        source_image_attributes: *const c_void,
        compressed_allocator: *const c_void,
        output_callback: unsafe extern "C" fn(*mut c_void, *mut c_void, i32, u32, *mut c_void),
        callback_refcon: *mut c_void,
        session_out: *mut *mut c_void,
    ) -> i32;
    fn VTSessionSetProperty(session: *mut c_void, key: *const c_void, value: *const c_void) -> i32;
    fn VTCompressionSessionPrepareToEncodeFrames(session: *mut c_void) -> i32;
    fn VTCompressionSessionEncodeFrame(
        session: *mut c_void,
        image: *mut c_void,
        presentation: CmTime,
        duration: CmTime,
        frame_properties: *const c_void,
        source_frame: *mut c_void,
        info_flags: *mut u32,
    ) -> i32;
    fn VTCompressionSessionCompleteFrames(session: *mut c_void, until: CmTime) -> i32;
    fn VTCompressionSessionInvalidate(session: *mut c_void);

    fn CMSampleBufferGetImageBuffer(sample: *mut c_void) -> *mut c_void;
    fn CMSampleBufferGetFormatDescription(sample: *mut c_void) -> *mut c_void;
    fn CMAudioFormatDescriptionGetStreamBasicDescription(format: *mut c_void) -> *const AudioStreamBasicDescription;
    fn CMSampleBufferGetDataBuffer(sample: *mut c_void) -> *mut c_void;
    fn CMSampleBufferGetSampleAttachmentsArray(sample: *mut c_void, create: i32) -> *mut c_void;
    fn CMBlockBufferGetDataLength(block: *mut c_void) -> usize;
    fn CMBlockBufferCopyDataBytes(
        block: *mut c_void,
        offset: usize,
        length: usize,
        destination: *mut c_void,
    ) -> i32;
    fn CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
        format: *mut c_void,
        index: usize,
        parameter_set: *mut *const u8,
        parameter_set_size: *mut usize,
        parameter_set_count: *mut usize,
        nal_header_length: *mut i32,
    ) -> i32;
    fn CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(
        format: *mut c_void,
        index: usize,
        parameter_set: *mut *const u8,
        parameter_set_size: *mut usize,
        parameter_set_count: *mut usize,
        nal_header_length: *mut i32,
    ) -> i32;
}
