//! Camera video on the main voice UDP socket.
//!
//! Frames are H.264 access units. They are packetized and sealed with the voice
//! transport cipher (`encrypt_voice`). Opus and DAVE `seal_opus` are not used.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tokio::sync::Notify;

use super::stream::{packetize_h264, video_attributes, H264Assembler, VideoSpan};
use super::voice::{decrypt_voice, encrypt_voice, CipherMode};

pub const CAMERA_WIDTH: u32 = 320;
pub const CAMERA_HEIGHT: u32 = 176;
pub const CAMERA_FPS: u8 = 15;
const VIDEO_CLOCK: u32 = 90_000;
const PAYLOAD_TYPE: u8 = 101;

pub struct CameraFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub struct CameraInbox {
    frames: Mutex<VecDeque<CameraFrame>>,
    notify: Notify,
    active: AtomicBool,
}

impl CameraInbox {
    pub fn new() -> Self {
        Self {
            frames: Mutex::new(VecDeque::new()),
            notify: Notify::new(),
            active: AtomicBool::new(false),
        }
    }

    pub fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::Relaxed);
        self.notify.notify_one();
    }

    pub fn active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    pub fn push(&self, frame: CameraFrame) {
        if frame.width != CAMERA_WIDTH || frame.height != CAMERA_HEIGHT {
            return;
        }
        let expected = (CAMERA_WIDTH as usize) * (CAMERA_HEIGHT as usize) * 4;
        if frame.rgba.len() < expected {
            return;
        }
        if let Ok(mut queue) = self.frames.lock() {
            if queue.len() >= 2 {
                queue.pop_front();
            }
            queue.push_back(frame);
        }
        self.notify.notify_one();
    }

    pub fn drain(&self) -> Vec<CameraFrame> {
        self.frames.lock().map(|mut queue| queue.drain(..).collect()).unwrap_or_default()
    }

    pub fn notified(&self) -> impl std::future::Future<Output = ()> + '_ {
        self.notify.notified()
    }
}

impl Default for CameraInbox {
    fn default() -> Self {
        Self::new()
    }
}

/// Voice opcode 12 for the camera. Video SSRC is the audio SSRC plus one.
pub fn camera_attributes(audio_ssrc: u32, active: bool) -> String {
    video_attributes(
        audio_ssrc,
        audio_ssrc.wrapping_add(1),
        audio_ssrc.wrapping_add(2),
        VideoSpan {
            width: CAMERA_WIDTH,
            height: CAMERA_HEIGHT,
            fps: CAMERA_FPS,
            bitrate: 400_000,
            active,
            preset_height: CAMERA_HEIGHT,
        },
    )
}

/// Packetize one access unit and seal each RTP packet with the voice transport.
/// The returned bytes are UDP payloads. DAVE is not applied.
pub fn seal_camera_access(
    access_unit: &[u8],
    mode: CipherMode,
    key: &[u8; 32],
    audio_ssrc: u32,
    sequence: &mut u16,
    timestamp: u32,
    nonce: &mut u32,
) -> Vec<Vec<u8>> {
    let video_ssrc = audio_ssrc.wrapping_add(1);
    let packets = packetize_h264(access_unit, video_ssrc, PAYLOAD_TYPE, sequence, timestamp);
    let mut out = Vec::with_capacity(packets.len());
    for item in packets {
        if let Ok(sealed) = encrypt_voice(mode, key, &item.header, &item.payload, *nonce) {
            out.push(sealed);
            *nonce = nonce.wrapping_add(1);
        }
    }
    out
}

pub fn camera_timestamp_step() -> u32 {
    VIDEO_CLOCK / u32::from(CAMERA_FPS.max(1))
}

/// True when the cleartext RTP header is a camera access-unit packet.
/// Opus uses payload type 120. Camera uses 101. The header is outside the cipher.
pub fn is_camera_rtp(packet: &[u8]) -> bool {
    packet.len() >= 12 && packet[0] >> 6 == 2 && packet[1] & 0x7f == PAYLOAD_TYPE
}

pub struct CameraPicture {
    pub user_id: String,
    pub annex_b: Vec<u8>,
}

/// Reassembles remote camera video from the voice UDP socket.
///
/// Packets are transport-encrypted with the voice key. DAVE `open_opus` is not
/// applied: camera video is not an Opus frame.
pub struct CameraReceiver {
    assemblers: HashMap<u32, H264Assembler>,
}

impl CameraReceiver {
    pub fn new() -> Self {
        Self { assemblers: HashMap::new() }
    }

    /// Decrypt one datagram. `local_audio_ssrc` drops this client's own camera.
    /// The video SSRC is the speaker's audio SSRC plus one.
    pub fn push(
        &mut self,
        packet: &[u8],
        mode: CipherMode,
        key: &[u8; 32],
        local_audio_ssrc: u32,
        users: &HashMap<u32, String>,
    ) -> Option<CameraPicture> {
        if !is_camera_rtp(packet) {
            return None;
        }
        let ssrc = packet_ssrc(packet)?;
        if ssrc == 0 || ssrc == local_audio_ssrc || ssrc == local_audio_ssrc.wrapping_add(1) {
            return None;
        }
        let payload = decrypt_voice(mode, key, packet).ok()?;
        if payload.is_empty() {
            return None;
        }
        if !self.assemblers.contains_key(&ssrc) && self.assemblers.len() >= 32 {
            return None;
        }
        let marker = packet[1] & 0x80 != 0;
        let unit = self.assemblers.entry(ssrc).or_default().push(&payload, marker)?;
        let user_id = users
            .get(&ssrc)
            .cloned()
            .or_else(|| users.get(&ssrc.wrapping_sub(1)).cloned())
            .filter(|id| !id.is_empty())?;
        Some(CameraPicture { user_id, annex_b: unit })
    }
}

impl Default for CameraReceiver {
    fn default() -> Self {
        Self::new()
    }
}

fn packet_ssrc(packet: &[u8]) -> Option<u32> {
    if packet.len() < 12 || packet[0] >> 6 != 2 {
        return None;
    }
    Some(u32::from_be_bytes([packet[8], packet[9], packet[10], packet[11]]))
}

pub struct CameraSender {
    raw: *mut std::ffi::c_void,
    sequence: u16,
    timestamp: u32,
    nonce: u32,
    sent_active: Option<bool>,
}

impl Default for CameraSender {
    fn default() -> Self {
        Self {
            raw: std::ptr::null_mut(),
            sequence: 0,
            timestamp: 0,
            nonce: 0,
            sent_active: None,
        }
    }
}

// SAFETY: the encoder pointer is owned by this value and only used on `&mut self`.
unsafe impl Send for CameraSender {}

impl Drop for CameraSender {
    fn drop(&mut self) {
        self.close();
    }
}

impl CameraSender {
    /// Sends opcode 12 when the camera turns on, and again when it turns off.
    pub fn note_active(&mut self, active: bool, audio_ssrc: u32) -> Option<String> {
        if self.sent_active == Some(active) {
            return None;
        }
        if !active && self.sent_active != Some(true) {
            self.sent_active = Some(false);
            return None;
        }
        self.sent_active = Some(active);
        Some(camera_attributes(audio_ssrc, active))
    }

    pub fn take_packets(&mut self, mode: CipherMode, key: &[u8; 32], audio_ssrc: u32, inbox: &CameraInbox) -> Vec<Vec<u8>> {
        if !inbox.active() {
            let _ = inbox.drain();
            return Vec::new();
        }
        let frames = inbox.drain();
        let mut out = Vec::new();
        for frame in frames {
            let Some(access) = self.encode(&frame) else { continue };
            let step = camera_timestamp_step();
            out.extend(seal_camera_access(&access, mode, key, audio_ssrc, &mut self.sequence, self.timestamp, &mut self.nonce));
            self.timestamp = self.timestamp.wrapping_add(step);
        }
        out
    }

    fn encode(&mut self, frame: &CameraFrame) -> Option<Vec<u8>> {
        self.ensure()?;
        let (y, u, v) = rgba_to_planes(&frame.rgba, CAMERA_WIDTH as usize, CAMERA_HEIGHT as usize)?;
        let mut data = std::ptr::null_mut();
        let mut size = 0i32;
        let status = unsafe {
            lark_h264_encode(
                self.raw,
                y.as_ptr() as *mut u8,
                u.as_ptr() as *mut u8,
                v.as_ptr() as *mut u8,
                CAMERA_WIDTH as i32,
                (CAMERA_WIDTH / 2) as i32,
                10,
                12_000,
                20,
                36,
                &mut data,
                &mut size,
            )
        };
        if status != 0 || data.is_null() || size <= 0 {
            return None;
        }
        let bytes = unsafe { std::slice::from_raw_parts(data, size as usize) }.to_vec();
        Some(bytes)
    }

    fn ensure(&mut self) -> Option<()> {
        if !self.raw.is_null() {
            return Some(());
        }
        let mut raw = std::ptr::null_mut();
        let status = unsafe { lark_h264_open(&mut raw, CAMERA_WIDTH as i32, CAMERA_HEIGHT as i32, i32::from(CAMERA_FPS)) };
        if status != 0 || raw.is_null() {
            return None;
        }
        self.raw = raw;
        Some(())
    }

    fn close(&mut self) {
        if !self.raw.is_null() {
            unsafe { lark_h264_close(self.raw) };
            self.raw = std::ptr::null_mut();
        }
    }
}

fn rgba_to_planes(rgba: &[u8], width: usize, height: usize) -> Option<(Vec<u64>, Vec<u64>, Vec<u64>)> {
    if width < 16 || height < 16 || width % 2 != 0 || height % 2 != 0 {
        return None;
    }
    if rgba.len() < width * height * 4 {
        return None;
    }
    let mut y = vec![0u8; width * height];
    let mut u = vec![0u8; (width / 2) * (height / 2)];
    let mut v = vec![0u8; (width / 2) * (height / 2)];
    for row in 0..height {
        for col in 0..width {
            let at = (row * width + col) * 4;
            let (yy, uu, vv) = yuv(rgba[at], rgba[at + 1], rgba[at + 2]);
            y[row * width + col] = yy;
            if row % 2 == 0 && col % 2 == 0 {
                let c = (row / 2) * (width / 2) + (col / 2);
                u[c] = uu;
                v[c] = vv;
            }
        }
    }
    Some((align_plane(&y), align_plane(&u), align_plane(&v)))
}

fn yuv(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    let r = f32::from(r);
    let g = f32::from(g);
    let b = f32::from(b);
    let y = (0.299 * r + 0.587 * g + 0.114 * b).clamp(0.0, 255.0) as u8;
    let u = (128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b).clamp(0.0, 255.0) as u8;
    let v = (128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b).clamp(0.0, 255.0) as u8;
    (y, u, v)
}

fn align_plane(bytes: &[u8]) -> Vec<u64> {
    let mut plane = vec![0u64; bytes.len().div_ceil(8)];
    let dst = unsafe { std::slice::from_raw_parts_mut(plane.as_mut_ptr() as *mut u8, bytes.len()) };
    dst.copy_from_slice(bytes);
    plane
}

unsafe extern "C" {
    fn lark_h264_open(out: *mut *mut std::ffi::c_void, width: i32, height: i32, gop: i32) -> i32;
    fn lark_h264_encode(
        encoder: *mut std::ffi::c_void,
        y: *mut u8,
        u: *mut u8,
        v: *mut u8,
        y_stride: i32,
        c_stride: i32,
        speed: i32,
        frame_bytes: i32,
        qp_min: i32,
        qp_max: i32,
        data: *mut *mut u8,
        size: *mut i32,
    ) -> i32;
    fn lark_h264_close(encoder: *mut std::ffi::c_void);
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::discord::voice::{decrypt_voice, CipherMode};

    fn key() -> [u8; 32] {
        let mut key = [0u8; 32];
        for (index, byte) in key.iter_mut().enumerate() {
            *byte = index as u8;
        }
        key
    }

    #[test]
    fn camera_packets_use_transport_encryption_not_opus() {
        let access = [0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00, 0x11, 0x22];
        let mut sequence = 7u16;
        let mut nonce = 3u32;
        let packets = seal_camera_access(&access, CipherMode::Aes256GcmRtpSize, &key(), 50, &mut sequence, 6_000, &mut nonce);
        assert_eq!(packets.len(), 1);
        assert_eq!(sequence, 8);
        assert_eq!(nonce, 4);
        let opened = decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &packets[0]).unwrap();
        assert_eq!(opened, &access[4..]);
        assert_ne!(opened, [0xF8, 0xFF, 0xFE]);
        let header = &packets[0][1];
        assert_eq!(header & 0x7f, PAYLOAD_TYPE);
    }

    #[test]
    fn a_camera_frame_encodes_to_annex_b() {
        let mut rgba = vec![0u8; (CAMERA_WIDTH as usize) * (CAMERA_HEIGHT as usize) * 4];
        for pixel in rgba.chunks_exact_mut(4) {
            pixel[0] = 40;
            pixel[1] = 80;
            pixel[2] = 160;
            pixel[3] = 255;
        }
        let mut sender = CameraSender::default();
        let access = sender.encode(&CameraFrame { width: CAMERA_WIDTH, height: CAMERA_HEIGHT, rgba }).unwrap();
        assert!(access.windows(3).any(|win| win == [0, 0, 1]) || access.windows(4).any(|win| win == [0, 0, 0, 1]));
        let mut sequence = 0u16;
        let mut nonce = 0u32;
        let packets = seal_camera_access(&access, CipherMode::Aes256GcmRtpSize, &key(), 9, &mut sequence, 0, &mut nonce);
        assert!(!packets.is_empty());
        let opened = decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &packets[0]).unwrap();
        assert!(!opened.is_empty());
        assert_ne!(&opened[..opened.len().min(3)], &[0xF8, 0xFF, 0xFE][..opened.len().min(3)]);
    }

    #[test]
    fn remote_camera_decrypts_and_reassembles_without_dave() {
        let mut nal = vec![0x65u8, 0x88];
        nal.extend(std::iter::repeat(0x3c).take(1_500));
        let mut access = vec![0, 0, 0, 1];
        access.extend_from_slice(&nal);
        let mut sequence = 1u16;
        let mut nonce = 9u32;
        let packets = seal_camera_access(&access, CipherMode::Aes256GcmRtpSize, &key(), 50, &mut sequence, 0, &mut nonce);
        assert!(packets.len() > 1, "a large access unit has to fragment");
        let mut users = HashMap::new();
        users.insert(50, "222".to_string());
        let mut receiver = CameraReceiver::new();
        let mut picture = None;
        for packet in &packets {
            assert!(is_camera_rtp(packet));
            if let Some(next) = receiver.push(packet, CipherMode::Aes256GcmRtpSize, &key(), 7, &users) {
                picture = Some(next);
            }
        }
        let picture = picture.expect("the marker packet rebuilds the access unit");
        assert_eq!(picture.user_id, "222");
        assert!(picture.annex_b.windows(nal.len()).any(|win| win == nal.as_slice()));
        let opus = crate::discord::voice::rtp_header(1, 960, 99);
        assert!(!is_camera_rtp(&opus));
        assert!(receiver.push(&opus, CipherMode::Aes256GcmRtpSize, &key(), 7, &users).is_none());
        let mut wrong = key();
        wrong[0] ^= 0xff;
        assert!(CameraReceiver::new().push(&packets[0], CipherMode::Aes256GcmRtpSize, &wrong, 7, &users).is_none());
        assert!(CameraReceiver::new().push(&packets[0], CipherMode::Aes256GcmRtpSize, &key(), 50, &users).is_none());
    }

    #[test]
    fn inbox_drops_a_frame_that_is_the_wrong_size() {
        let inbox = CameraInbox::new();
        inbox.push(CameraFrame { width: 16, height: 16, rgba: vec![0; 16 * 16 * 4] });
        assert!(inbox.drain().is_empty());
    }
}
