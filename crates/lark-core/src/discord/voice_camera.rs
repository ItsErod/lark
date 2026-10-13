//! Camera video on the main voice UDP socket.
//!
//! Frames are H.264 access units. They are packetized and sealed with the voice
//! transport cipher (`encrypt_voice`). Opus and DAVE `seal_opus` are not used.
//!
//! Discord's voice video is one H.264 stream on that socket: payload type 101,
//! RTX payload type 102, video SSRC = audio SSRC + 1, RTX SSRC = audio SSRC + 2.
//! Opcode 12 advertises a single simulcast layer, `rid` `"100"`, with
//! `max_resolution`, `max_framerate`, and `max_bitrate`. A remote client
//! subscribed to that rid receives the layer. Lark does not send a second
//! spatial layer (that would encode the camera twice). When the link gets
//! worse, the shell steps this one layer down and sends opcode 12 again.
//! RTP is a 90 kHz clock, RFC 6184 single-NAL or FU-A, and the marker bit on
//! the last packet of the access unit. The audio-level header extension is
//! not added: that extension belongs to Opus.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tokio::sync::Notify;

use super::stream::{packetize_h264, video_attributes, H264Assembler, VideoSpan};
use super::voice::{decrypt_voice, encrypt_voice, CipherMode};

/// Unset capture. The shell replaces this with a [`CameraProfile`] before it sends.
pub const CAMERA_WIDTH: u32 = 320;
pub const CAMERA_HEIGHT: u32 = 176;
pub const CAMERA_FPS: u8 = 15;
/// 720p30. Discord's usual camera picture. 2.5 Mbps is the opcode 12 max.
pub const CAMERA_HD_WIDTH: u32 = 1280;
pub const CAMERA_HD_HEIGHT: u32 = 720;
pub const CAMERA_HD_FPS: u8 = 30;
pub const CAMERA_HD_BITRATE: u32 = 2_500_000;
const VIDEO_CLOCK: u32 = 90_000;
const PAYLOAD_TYPE: u8 = 101;

/// One camera encoding. `width` and `height` are the picture Discord is told
/// about. The software encoder also requires both to be multiples of 16, so
/// 1920×1080 is hardware-only and 1920×1088 is the padded software size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CameraProfile {
    pub width: u32,
    pub height: u32,
    pub fps: u8,
    pub bitrate: u32,
}

impl CameraProfile {
    pub const THUMB: Self = Self {
        width: CAMERA_WIDTH,
        height: CAMERA_HEIGHT,
        fps: CAMERA_FPS,
        bitrate: 400_000,
    };
    pub const HD: Self = Self {
        width: CAMERA_HD_WIDTH,
        height: CAMERA_HD_HEIGHT,
        fps: CAMERA_HD_FPS,
        bitrate: CAMERA_HD_BITRATE,
    };

    pub fn legal(self) -> bool {
        let size = matches!(
            (self.width, self.height),
            (320, 176) | (640, 360) | (848, 480) | (1280, 720) | (1920, 1080) | (1920, 1088)
        );
        size && matches!(self.fps, 15 | 30) && (100_000..=8_000_000).contains(&self.bitrate)
    }
}

/// Snap a settings choice onto a profile Discord can describe.
/// Unknown sizes are rejected. 24 fps and above becomes 30. Below that, 15.
pub fn profile_from_parts(width: u32, height: u32, fps: u8, bitrate: u32) -> Option<CameraProfile> {
    let fps = if fps >= 24 { 30 } else { 15 };
    let profile = CameraProfile {
        width,
        height,
        fps,
        bitrate: bitrate.clamp(100_000, 8_000_000),
    };
    profile.legal().then_some(profile)
}

pub struct CameraFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub struct CameraInbox {
    frames: Mutex<VecDeque<CameraFrame>>,
    /// Annex-B access units already encoded by the shell (hardware or software).
    access: Mutex<VecDeque<Vec<u8>>>,
    profile: Mutex<CameraProfile>,
    notify: Notify,
    active: AtomicBool,
}

impl CameraInbox {
    pub fn new() -> Self {
        Self {
            frames: Mutex::new(VecDeque::new()),
            access: Mutex::new(VecDeque::new()),
            profile: Mutex::new(CameraProfile::THUMB),
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

    pub fn profile(&self) -> CameraProfile {
        self.profile
            .lock()
            .map(|slot| *slot)
            .unwrap_or(CameraProfile::THUMB)
    }

    /// Stores a legal profile and drops queued pictures from the previous one.
    pub fn set_profile(&self, profile: CameraProfile) -> bool {
        if !profile.legal() {
            return false;
        }
        let changed = self
            .profile
            .lock()
            .map(|mut slot| {
                let changed = *slot != profile;
                *slot = profile;
                changed
            })
            .unwrap_or(false);
        if changed {
            if let Ok(mut queue) = self.frames.lock() {
                queue.clear();
            }
            if let Ok(mut queue) = self.access.lock() {
                queue.clear();
            }
            self.notify.notify_one();
        }
        true
    }

    pub fn push(&self, frame: CameraFrame) {
        let profile = self.profile();
        if frame.width != profile.width || frame.height != profile.height {
            return;
        }
        let expected = (profile.width as usize) * (profile.height as usize) * 4;
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

    /// One already-encoded access unit. Two are kept. Older ones are dropped.
    pub fn push_access(&self, annex_b: Vec<u8>) {
        if annex_b.len() < 5 || annex_b.len() > 1_500_000 {
            return;
        }
        if let Ok(mut queue) = self.access.lock() {
            if queue.len() >= 2 {
                queue.pop_front();
            }
            queue.push_back(annex_b);
        }
        self.notify.notify_one();
    }

    pub fn drain(&self) -> Vec<CameraFrame> {
        self.frames
            .lock()
            .map(|mut queue| queue.drain(..).collect())
            .unwrap_or_default()
    }

    pub fn drain_access(&self) -> Vec<Vec<u8>> {
        self.access
            .lock()
            .map(|mut queue| queue.drain(..).collect())
            .unwrap_or_default()
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
/// One rid `"100"` layer. `profile` is what a remote client should expect.
pub fn camera_attributes(audio_ssrc: u32, active: bool, profile: CameraProfile) -> String {
    video_attributes(
        audio_ssrc,
        audio_ssrc.wrapping_add(1),
        audio_ssrc.wrapping_add(2),
        VideoSpan {
            width: profile.width,
            height: profile.height,
            fps: profile.fps,
            bitrate: profile.bitrate,
            active,
            preset_height: profile.height,
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

pub fn camera_timestamp_step(fps: u8) -> u32 {
    VIDEO_CLOCK / u32::from(fps.max(1))
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
        Self {
            assemblers: HashMap::new(),
        }
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
        let unit = self
            .assemblers
            .entry(ssrc)
            .or_default()
            .push(&payload, marker)?;
        let user_id = users
            .get(&ssrc)
            .cloned()
            .or_else(|| users.get(&ssrc.wrapping_sub(1)).cloned())
            .filter(|id| !id.is_empty())?;
        Some(CameraPicture {
            user_id,
            annex_b: unit,
        })
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
    Some(u32::from_be_bytes([
        packet[8], packet[9], packet[10], packet[11],
    ]))
}

pub struct CameraSender {
    raw: *mut std::ffi::c_void,
    sequence: u16,
    timestamp: u32,
    nonce: u32,
    sent_active: Option<bool>,
    sent_profile: Option<CameraProfile>,
    enc_width: i32,
    enc_height: i32,
    enc_fps: i32,
    fps: u8,
    bitrate: u32,
    y_plane: Vec<u64>,
    u_plane: Vec<u64>,
    v_plane: Vec<u64>,
}

impl Default for CameraSender {
    fn default() -> Self {
        Self {
            raw: std::ptr::null_mut(),
            sequence: 0,
            timestamp: 0,
            nonce: 0,
            sent_active: None,
            sent_profile: None,
            enc_width: 0,
            enc_height: 0,
            enc_fps: 0,
            fps: 0,
            bitrate: 0,
            y_plane: Vec::new(),
            u_plane: Vec::new(),
            v_plane: Vec::new(),
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
    /// Sends opcode 12 when the camera turns on, when it turns off, and when
    /// the advertised profile changes.
    pub fn note_active(
        &mut self,
        active: bool,
        audio_ssrc: u32,
        profile: CameraProfile,
    ) -> Option<String> {
        if self.sent_active == Some(active) && self.sent_profile == Some(profile) {
            return None;
        }
        if !active && self.sent_active != Some(true) {
            self.sent_active = Some(false);
            self.sent_profile = Some(profile);
            return None;
        }
        self.sent_active = Some(active);
        self.sent_profile = Some(profile);
        Some(camera_attributes(audio_ssrc, active, profile))
    }

    pub fn take_packets(
        &mut self,
        mode: CipherMode,
        key: &[u8; 32],
        audio_ssrc: u32,
        inbox: &CameraInbox,
    ) -> Vec<Vec<u8>> {
        let profile = inbox.profile();
        self.fps = profile.fps;
        self.bitrate = profile.bitrate;
        if !inbox.active() {
            let _ = inbox.drain();
            let _ = inbox.drain_access();
            return Vec::new();
        }
        let access = inbox.drain_access();
        let frames = inbox.drain();
        let mut out = Vec::new();
        if !access.is_empty() {
            for unit in access {
                self.seal_unit(&unit, mode, key, audio_ssrc, &mut out);
            }
            return out;
        }
        for frame in frames {
            let Some(unit) = self.encode(&frame) else {
                continue;
            };
            self.seal_unit(&unit, mode, key, audio_ssrc, &mut out);
        }
        out
    }

    fn seal_unit(
        &mut self,
        access: &[u8],
        mode: CipherMode,
        key: &[u8; 32],
        audio_ssrc: u32,
        out: &mut Vec<Vec<u8>>,
    ) {
        let step = camera_timestamp_step(self.fps.max(1));
        out.extend(seal_camera_access(
            access,
            mode,
            key,
            audio_ssrc,
            &mut self.sequence,
            self.timestamp,
            &mut self.nonce,
        ));
        self.timestamp = self.timestamp.wrapping_add(step);
    }

    fn encode(&mut self, frame: &CameraFrame) -> Option<Vec<u8>> {
        if frame.width < 16 || frame.height < 16 || frame.width % 16 != 0 || frame.height % 16 != 0
        {
            return None;
        }
        let fps = i32::from(if self.fps == 0 { CAMERA_FPS } else { self.fps });
        self.ensure(frame.width as i32, frame.height as i32, fps)?;
        if !fill_planes(
            &mut self.y_plane,
            &mut self.u_plane,
            &mut self.v_plane,
            &frame.rgba,
            frame.width as usize,
            frame.height as usize,
        ) {
            return None;
        }
        let rate = if self.bitrate == 0 {
            CameraProfile::THUMB.bitrate
        } else {
            self.bitrate
        };
        let frame_bytes =
            (rate / 8 / u32::try_from(fps).unwrap_or(15).max(1)).clamp(2_000, 250_000) as i32;
        let mut data = std::ptr::null_mut();
        let mut size = 0i32;
        let status = unsafe {
            lark_h264_encode(
                self.raw,
                self.y_plane.as_mut_ptr() as *mut u8,
                self.u_plane.as_mut_ptr() as *mut u8,
                self.v_plane.as_mut_ptr() as *mut u8,
                frame.width as i32,
                (frame.width / 2) as i32,
                10,
                frame_bytes,
                18,
                40,
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

    fn ensure(&mut self, width: i32, height: i32, fps: i32) -> Option<()> {
        if !self.raw.is_null()
            && self.enc_width == width
            && self.enc_height == height
            && self.enc_fps == fps
        {
            return Some(());
        }
        self.close();
        let mut raw = std::ptr::null_mut();
        let gop = (fps * 2).max(1);
        let status = unsafe { lark_h264_open(&mut raw, width, height, gop) };
        if status != 0 || raw.is_null() {
            return None;
        }
        self.raw = raw;
        self.enc_width = width;
        self.enc_height = height;
        self.enc_fps = fps;
        Some(())
    }

    fn close(&mut self) {
        if !self.raw.is_null() {
            unsafe { lark_h264_close(self.raw) };
            self.raw = std::ptr::null_mut();
        }
        self.enc_width = 0;
        self.enc_height = 0;
        self.enc_fps = 0;
    }
}

fn fill_planes(
    y_plane: &mut Vec<u64>,
    u_plane: &mut Vec<u64>,
    v_plane: &mut Vec<u64>,
    rgba: &[u8],
    width: usize,
    height: usize,
) -> bool {
    if width < 16 || height < 16 || width % 2 != 0 || height % 2 != 0 {
        return false;
    }
    if rgba.len() < width * height * 4 {
        return false;
    }
    let y = plane_bytes(y_plane, width * height);
    let chroma_w = width / 2;
    let chroma_h = height / 2;
    let u = plane_bytes(u_plane, chroma_w * chroma_h);
    let v = plane_bytes(v_plane, chroma_w * chroma_h);
    for row in 0..height {
        for col in 0..width {
            let at = (row * width + col) * 4;
            let (yy, uu, vv) = yuv(rgba[at], rgba[at + 1], rgba[at + 2]);
            y[row * width + col] = yy;
            if row % 2 == 0 && col % 2 == 0 {
                let c = (row / 2) * chroma_w + (col / 2);
                u[c] = uu;
                v[c] = vv;
            }
        }
    }
    true
}

fn plane_bytes(plane: &mut Vec<u64>, len: usize) -> &mut [u8] {
    let words = len.div_ceil(8);
    if plane.len() < words {
        plane.resize(words, 0);
    }
    // SAFETY: `words` u64s are at least `len` bytes, and this slice is the only borrow.
    unsafe { std::slice::from_raw_parts_mut(plane.as_mut_ptr() as *mut u8, len) }
}

fn yuv(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    let r = i32::from(r);
    let g = i32::from(g);
    let b = i32::from(b);
    let y = (77 * r + 150 * g + 29 * b) >> 8;
    let u = 128 + ((-43 * r - 85 * g + 128 * b) >> 8);
    let v = 128 + ((128 * r - 107 * g - 21 * b) >> 8);
    (
        y.clamp(0, 255) as u8,
        u.clamp(0, 255) as u8,
        v.clamp(0, 255) as u8,
    )
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
        let packets = seal_camera_access(
            &access,
            CipherMode::Aes256GcmRtpSize,
            &key(),
            50,
            &mut sequence,
            6_000,
            &mut nonce,
        );
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
        let access = sender
            .encode(&CameraFrame {
                width: CAMERA_WIDTH,
                height: CAMERA_HEIGHT,
                rgba,
            })
            .unwrap();
        assert!(
            access.windows(3).any(|win| win == [0, 0, 1])
                || access.windows(4).any(|win| win == [0, 0, 0, 1])
        );
        let mut sequence = 0u16;
        let mut nonce = 0u32;
        let packets = seal_camera_access(
            &access,
            CipherMode::Aes256GcmRtpSize,
            &key(),
            9,
            &mut sequence,
            0,
            &mut nonce,
        );
        assert!(!packets.is_empty());
        let opened = decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &packets[0]).unwrap();
        assert!(!opened.is_empty());
        assert_ne!(
            &opened[..opened.len().min(3)],
            &[0xF8, 0xFF, 0xFE][..opened.len().min(3)]
        );
    }

    #[test]
    fn remote_camera_decrypts_and_reassembles_without_dave() {
        let mut nal = vec![0x65u8, 0x88];
        nal.extend(std::iter::repeat(0x3c).take(1_500));
        let mut access = vec![0, 0, 0, 1];
        access.extend_from_slice(&nal);
        let mut sequence = 1u16;
        let mut nonce = 9u32;
        let packets = seal_camera_access(
            &access,
            CipherMode::Aes256GcmRtpSize,
            &key(),
            50,
            &mut sequence,
            0,
            &mut nonce,
        );
        assert!(packets.len() > 1, "a large access unit has to fragment");
        let mut users = HashMap::new();
        users.insert(50, "222".to_string());
        let mut receiver = CameraReceiver::new();
        let mut picture = None;
        for packet in &packets {
            assert!(is_camera_rtp(packet));
            if let Some(next) =
                receiver.push(packet, CipherMode::Aes256GcmRtpSize, &key(), 7, &users)
            {
                picture = Some(next);
            }
        }
        let picture = picture.expect("the marker packet rebuilds the access unit");
        assert_eq!(picture.user_id, "222");
        assert!(picture
            .annex_b
            .windows(nal.len())
            .any(|win| win == nal.as_slice()));
        let opus = crate::discord::voice::rtp_header(1, 960, 99);
        assert!(!is_camera_rtp(&opus));
        assert!(receiver
            .push(&opus, CipherMode::Aes256GcmRtpSize, &key(), 7, &users)
            .is_none());
        let mut wrong = key();
        wrong[0] ^= 0xff;
        assert!(CameraReceiver::new()
            .push(&packets[0], CipherMode::Aes256GcmRtpSize, &wrong, 7, &users)
            .is_none());
        assert!(CameraReceiver::new()
            .push(
                &packets[0],
                CipherMode::Aes256GcmRtpSize,
                &key(),
                50,
                &users
            )
            .is_none());
    }

    #[test]
    fn inbox_drops_a_frame_that_is_the_wrong_size() {
        let inbox = CameraInbox::new();
        inbox.push(CameraFrame {
            width: 16,
            height: 16,
            rgba: vec![0; 16 * 16 * 4],
        });
        assert!(inbox.drain().is_empty());
        let rgba = vec![0u8; (CAMERA_WIDTH as usize) * (CAMERA_HEIGHT as usize) * 4];
        inbox.push(CameraFrame {
            width: CAMERA_WIDTH,
            height: CAMERA_HEIGHT,
            rgba: rgba.clone(),
        });
        assert_eq!(inbox.drain().len(), 1);
        assert!(inbox.set_profile(CameraProfile::HD));
        inbox.push(CameraFrame {
            width: CAMERA_WIDTH,
            height: CAMERA_HEIGHT,
            rgba,
        });
        assert!(inbox.drain().is_empty());
    }

    #[test]
    fn discord_720p30_is_one_rid_100_layer() {
        let mut sender = CameraSender::default();
        assert!(sender
            .note_active(false, 50, CameraProfile::THUMB)
            .is_none());
        let on = sender
            .note_active(true, 50, CameraProfile::HD)
            .expect("turning the camera on advertises the layer");
        let value: serde_json::Value = serde_json::from_str(&on).unwrap();
        assert_eq!(value["op"], 12);
        assert_eq!(value["d"]["audio_ssrc"], 50);
        assert_eq!(value["d"]["video_ssrc"], 51);
        assert_eq!(value["d"]["rtx_ssrc"], 52);
        let streams = value["d"]["streams"].as_array().unwrap();
        assert_eq!(streams.len(), 1, "one spatial layer, not a second encode");
        let stream = &streams[0];
        assert_eq!(stream["type"], "video");
        assert_eq!(stream["rid"], "100");
        assert_eq!(stream["ssrc"], 51);
        assert_eq!(stream["rtx_ssrc"], 52);
        assert_eq!(stream["active"], true);
        assert_eq!(stream["quality"], 100);
        assert_eq!(stream["max_bitrate"], CAMERA_HD_BITRATE);
        assert_eq!(stream["max_framerate"], 30);
        assert_eq!(stream["max_resolution"]["type"], "fixed");
        assert_eq!(stream["max_resolution"]["width"], 1280);
        assert_eq!(stream["max_resolution"]["height"], 720);
        assert!(sender.note_active(true, 50, CameraProfile::HD).is_none());
        let stepped = sender
            .note_active(
                true,
                50,
                CameraProfile {
                    bitrate: 1_200_000,
                    ..CameraProfile::HD
                },
            )
            .expect("a bitrate change is a new opcode 12");
        assert!(stepped.contains("1200000"));
        assert_eq!(camera_timestamp_step(30), 3_000);
        assert_eq!(camera_timestamp_step(15), 6_000);
        assert!(profile_from_parts(1280, 720, 30, 2_500_000).is_some());
        assert!(profile_from_parts(1920, 1080, 30, 4_500_000).is_some());
        assert!(profile_from_parts(640, 480, 30, 2_500_000).is_none());
    }

    #[test]
    fn a_large_720p_nal_is_fu_a_at_the_90khz_clock() {
        let mut nal = vec![0x65u8, 0x88];
        nal.extend(std::iter::repeat(0x3c).take(20_000));
        let mut access = vec![0, 0, 0, 1];
        access.extend_from_slice(&nal);
        let mut sequence = 1u16;
        let mut nonce = 1u32;
        let packets = seal_camera_access(
            &access,
            CipherMode::Aes256GcmRtpSize,
            &key(),
            50,
            &mut sequence,
            9_000,
            &mut nonce,
        );
        assert!(packets.len() > 8);
        let last = packets.len() - 1;
        for (index, packet) in packets.iter().enumerate() {
            assert_eq!(packet[1] & 0x7f, PAYLOAD_TYPE);
            assert_eq!(u32::from_be_bytes(packet[4..8].try_into().unwrap()), 9_000);
            assert_eq!(
                u32::from_be_bytes(packet[8..12].try_into().unwrap()),
                51,
                "video ssrc is the audio ssrc plus one"
            );
            let marker = packet[1] & 0x80 != 0;
            assert_eq!(marker, index == last);
            let payload = decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), packet).unwrap();
            assert_eq!(payload[0] & 0x1f, 28, "a nal this large is FU-A");
            if index == 0 {
                assert_ne!(payload[1] & 0x80, 0, "start bit");
            }
            if index == last {
                assert_ne!(payload[1] & 0x40, 0, "end bit");
            }
        }
    }

    #[test]
    fn a_preencoded_access_unit_is_sealed_without_the_software_encoder() {
        let inbox = CameraInbox::new();
        inbox.set_active(true);
        assert!(inbox.set_profile(CameraProfile::HD));
        let access = vec![0, 0, 0, 1, 0x65, 0x11, 0x22, 0x33, 0x44];
        inbox.push_access(access);
        let mut sender = CameraSender::default();
        let packets = sender.take_packets(CipherMode::Aes256GcmRtpSize, &key(), 9, &inbox);
        assert_eq!(packets.len(), 1);
        let opened = decrypt_voice(CipherMode::Aes256GcmRtpSize, &key(), &packets[0]).unwrap();
        assert_eq!(opened, [0x65, 0x11, 0x22, 0x33, 0x44]);
        assert_eq!(u32::from_be_bytes(packets[0][4..8].try_into().unwrap()), 0);
        inbox.push_access(vec![0, 0, 0, 1, 0x41, 0x01, 0x02, 0x03, 0x04]);
        let next = sender.take_packets(CipherMode::Aes256GcmRtpSize, &key(), 9, &inbox);
        assert_eq!(u32::from_be_bytes(next[0][4..8].try_into().unwrap()), 3_000);
    }

    #[test]
    fn software_encoder_accepts_720p_and_rejects_unaligned_1080() {
        let mut raw = std::ptr::null_mut();
        let status = unsafe { lark_h264_open(&mut raw, 1280, 720, 60) };
        assert_eq!(status, 0);
        assert!(!raw.is_null());
        unsafe { lark_h264_close(raw) };
        let mut raw = std::ptr::null_mut();
        let status = unsafe { lark_h264_open(&mut raw, 1920, 1080, 30) };
        assert_ne!(status, 0);
        assert!(raw.is_null());
    }
}
