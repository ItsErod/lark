//! VideoToolbox H.264 encoder.
//!
//! The session asks for the hardware encoder and real-time mode, and it does not
//! reorder frames. Parameter sets come from the format description. The caller muxes
//! them with AAC into a faststart MP4.

use std::ffi::c_void;
use std::sync::Mutex;

use crate::HardwareClip;

pub fn encode(
    width: u32,
    height: u32,
    fps: u32,
    frame_count: usize,
    mut rgba_at: impl FnMut(usize) -> Result<Vec<u8>, String>,
) -> Result<HardwareClip, String> {
    if width < 2 || height < 2 || width % 2 != 0 || height % 2 != 0 || fps == 0 || frame_count == 0
    {
        return Err("VideoToolbox cannot encode that clip.".into());
    }
    unsafe { encode_session(width, height, fps, frame_count, &mut rgba_at) }
}

unsafe fn encode_session(
    width: u32,
    height: u32,
    fps: u32,
    frame_count: usize,
    rgba_at: &mut impl FnMut(usize) -> Result<Vec<u8>, String>,
) -> Result<HardwareClip, String> {
    let sink = Mutex::new(VtSink::default());
    let bitrate = cf_number_i32(target_bitrate(frame_count, fps) as i32);
    let frame_rate = cf_number_i32(fps as i32);
    let key_interval = cf_number_i32(fps as i32);
    let hardware = cf_dict(
        &[kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder],
        &[kCFBooleanTrue],
    );
    let mut session = std::ptr::null_mut();
    let created = VTCompressionSessionCreate(
        std::ptr::null(),
        width as i32,
        height as i32,
        u32::from_be_bytes(*b"avc1"),
        hardware,
        std::ptr::null(),
        std::ptr::null(),
        vt_output,
        &sink as *const Mutex<VtSink> as *mut c_void,
        &mut session,
    );
    if created != 0 || session.is_null() {
        let retry = VTCompressionSessionCreate(
            std::ptr::null(),
            width as i32,
            height as i32,
            u32::from_be_bytes(*b"avc1"),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            vt_output,
            &sink as *const Mutex<VtSink> as *mut c_void,
            &mut session,
        );
        if retry != 0 || session.is_null() {
            release(hardware);
            release(bitrate);
            release(frame_rate);
            release(key_interval);
            return Err(format!("VideoToolbox could not start ({created:#x})."));
        }
    }
    release(hardware);
    let _ = VTSessionSetProperty(session, kVTCompressionPropertyKey_RealTime, kCFBooleanTrue);
    let _ = VTSessionSetProperty(
        session,
        kVTCompressionPropertyKey_AllowFrameReordering,
        kCFBooleanFalse,
    );
    let _ = VTSessionSetProperty(
        session,
        kVTCompressionPropertyKey_ProfileLevel,
        kVTProfileLevel_H264_Baseline_AutoLevel,
    );
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
    release(bitrate);
    release(frame_rate);
    release(key_interval);
    if VTCompressionSessionPrepareToEncodeFrames(session) != 0 {
        VTCompressionSessionInvalidate(session);
        release(session);
        return Err("VideoToolbox could not prepare the encoder.".into());
    }
    let iosurface = cf_dict(&[], &[]);
    let pixel_attrs = cf_dict(&[kCVPixelBufferIOSurfacePropertiesKey], &[iosurface]);
    for index in 0..frame_count {
        let rgba = rgba_at(index)?;
        if rgba.len() != width as usize * height as usize * 4 {
            release(pixel_attrs);
            release(iosurface);
            VTCompressionSessionInvalidate(session);
            release(session);
            return Err("A clip frame changed size.".into());
        }
        let mut pixel = std::ptr::null_mut();
        let created = CVPixelBufferCreate(
            std::ptr::null(),
            width as usize,
            height as usize,
            u32::from_be_bytes(*b"BGRA"),
            pixel_attrs,
            &mut pixel,
        );
        if created != 0 || pixel.is_null() {
            release(pixel_attrs);
            release(iosurface);
            VTCompressionSessionInvalidate(session);
            release(session);
            return Err(format!(
                "VideoToolbox could not allocate a frame ({created:#x})."
            ));
        }
        if CVPixelBufferLockBaseAddress(pixel, 0) == 0 {
            let base = CVPixelBufferGetBaseAddress(pixel) as *mut u8;
            let stride = CVPixelBufferGetBytesPerRow(pixel);
            if !base.is_null() {
                copy_bgra(&rgba, width, height, base, stride);
            }
            CVPixelBufferUnlockBaseAddress(pixel, 0);
        }
        let mut frame_props = std::ptr::null_mut();
        if index == 0 {
            frame_props = cf_dict(&[kVTEncodeFrameOptionKey_ForceKeyFrame], &[kCFBooleanTrue]);
        }
        let status = VTCompressionSessionEncodeFrame(
            session,
            pixel,
            cm_time(index as i64, fps as i32),
            cm_time(1, fps as i32),
            frame_props,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        release(frame_props);
        release(pixel);
        if status != 0 {
            release(pixel_attrs);
            release(iosurface);
            VTCompressionSessionInvalidate(session);
            release(session);
            return Err(format!(
                "VideoToolbox could not encode a frame ({status:#x})."
            ));
        }
    }
    release(pixel_attrs);
    release(iosurface);
    let _ = VTCompressionSessionCompleteFrames(session, cm_time_invalid());
    VTCompressionSessionInvalidate(session);
    release(session);
    let guard = sink.lock().unwrap_or_else(|err| err.into_inner());
    if guard.error != 0 {
        return Err(format!(
            "VideoToolbox could not encode the clip ({:#x}).",
            guard.error
        ));
    }
    if guard.sps.is_empty() || guard.pps.is_empty() || guard.samples.is_empty() {
        return Err("VideoToolbox did not write H.264 frames.".into());
    }
    Ok(HardwareClip::Avcc {
        sps: guard.sps.clone(),
        pps: guard.pps.clone(),
        samples: guard.samples.clone(),
        sync: guard.sync.clone(),
    })
}

fn copy_bgra(rgba: &[u8], width: u32, height: u32, base: *mut u8, stride: usize) {
    let pixels = width as usize;
    for row in 0..height as usize {
        unsafe {
            let dst = std::slice::from_raw_parts_mut(base.add(row * stride), pixels * 4);
            let src = &rgba[row * pixels * 4..(row + 1) * pixels * 4];
            for pixel in 0..pixels {
                dst[pixel * 4] = src[pixel * 4 + 2];
                dst[pixel * 4 + 1] = src[pixel * 4 + 1];
                dst[pixel * 4 + 2] = src[pixel * 4];
                dst[pixel * 4 + 3] = 255;
            }
        }
    }
}

fn target_bitrate(frames: usize, fps: u32) -> u32 {
    let millis = (frames.max(1) as u64) * 1000 / u64::from(fps.max(1));
    let bits = 6_500_000u64 * 8 * 1000 / millis.max(1);
    bits.clamp(200_000, 4_000_000) as u32
}

#[derive(Default)]
struct VtSink {
    samples: Vec<Vec<u8>>,
    sync: Vec<bool>,
    sps: Vec<u8>,
    pps: Vec<u8>,
    error: i32,
}

unsafe extern "C" fn vt_output(
    output: *mut c_void,
    _source: *mut c_void,
    status: i32,
    _flags: u32,
    sample: *mut c_void,
) {
    if output.is_null() {
        return;
    }
    let sink = &*(output as *const Mutex<VtSink>);
    let Ok(mut guard) = sink.lock() else {
        return;
    };
    if status != 0 {
        guard.error = status;
        return;
    }
    if sample.is_null() {
        return;
    }
    if guard.sps.is_empty() {
        let format = CMSampleBufferGetFormatDescription(sample);
        if !format.is_null() {
            guard.sps = parameter_set(format, 0);
            guard.pps = parameter_set(format, 1);
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
    guard.sync.push(access_unit_is_idr(&bytes));
    guard.samples.push(bytes);
}

fn parameter_set(format: *mut c_void, index: usize) -> Vec<u8> {
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

fn access_unit_is_idr(sample: &[u8]) -> bool {
    let mut cursor = 0usize;
    while cursor + 4 <= sample.len() {
        let length = u32::from_be_bytes(sample[cursor..cursor + 4].try_into().unwrap()) as usize;
        if length == 0 || cursor + 4 + length > sample.len() {
            break;
        }
        if sample[cursor + 4] & 0x1f == 5 {
            return true;
        }
        cursor += 4 + length;
    }
    false
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

fn release(value: *mut c_void) {
    if !value.is_null() {
        unsafe { CFRelease(value) }
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
struct CmTime {
    value: i64,
    timescale: i32,
    flags: u32,
    epoch: i64,
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

#[link(name = "CoreFoundation", kind = "framework")]
#[link(name = "CoreVideo", kind = "framework")]
#[link(name = "CoreMedia", kind = "framework")]
#[link(name = "VideoToolbox", kind = "framework")]
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
    static kVTProfileLevel_H264_Baseline_AutoLevel: *const c_void;
    static kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder: *const c_void;
    static kVTEncodeFrameOptionKey_ForceKeyFrame: *const c_void;
    static kCVPixelBufferIOSurfacePropertiesKey: *const c_void;

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

    fn CVPixelBufferCreate(
        allocator: *const c_void,
        width: usize,
        height: usize,
        pixel_format: u32,
        attributes: *const c_void,
        pixel_out: *mut *mut c_void,
    ) -> i32;
    fn CVPixelBufferLockBaseAddress(pixel: *mut c_void, flags: u32) -> i32;
    fn CVPixelBufferUnlockBaseAddress(pixel: *mut c_void, flags: u32) -> i32;
    fn CVPixelBufferGetBaseAddress(pixel: *mut c_void) -> *mut c_void;
    fn CVPixelBufferGetBytesPerRow(pixel: *mut c_void) -> usize;

    fn CMSampleBufferGetFormatDescription(sample: *mut c_void) -> *mut c_void;
    fn CMSampleBufferGetDataBuffer(sample: *mut c_void) -> *mut c_void;
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
}
