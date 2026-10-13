//! Microphone frames, Opus, and the playback mix.
//!
//! The Opus encoder and decoders stay on one thread. Capture and playback callbacks
//! only move PCM through short queues so a 20 ms voice frame does not wait on the UI.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tokio::sync::{mpsc as async_mpsc, watch};

use crate::soundboard::SoundMix;

use super::noise::{FirAec, NoiseSuppressor, SpectralSuppressor};
use super::voice::{
    decrypt_voice, encrypt_voice, rtp_header, voice_active, CipherMode, OPUS_SILENCE,
};
use super::voice_dave::DaveCall;
use super::voice_io::DeviceStreams;
use super::voice_log::VoiceLog;

const SILENCE_TAIL: u8 = 5;

/// Ordered voice events. Speaking is queued before the packets it covers so the
/// gateway sees opcode 5 before UDP audio.
pub enum VoiceWire {
    Speaking(bool),
    Packet(Vec<u8>),
}

pub const FRAME_SAMPLES: usize = 960;
pub const SAMPLE_RATE: u32 = 48_000;

struct OpusEncoder {
    raw: *mut audiopus_sys::OpusEncoder,
}

impl OpusEncoder {
    fn new() -> Result<Self, ()> {
        let mut error = 0;
        let raw = unsafe {
            audiopus_sys::opus_encoder_create(SAMPLE_RATE as i32, 2, audiopus_sys::OPUS_APPLICATION_VOIP, &mut error)
        };
        if raw.is_null() || error != audiopus_sys::OPUS_OK {
            return Err(());
        }
        unsafe {
            audiopus_sys::opus_encoder_ctl(raw, audiopus_sys::OPUS_SET_BITRATE_REQUEST, 64_000i32);
        }
        Ok(Self { raw })
    }

    fn encode(&mut self, pcm: &[i16], out: &mut [u8]) -> Result<usize, ()> {
        let wrote = unsafe {
            audiopus_sys::opus_encode(
                self.raw,
                pcm.as_ptr(),
                FRAME_SAMPLES as i32,
                out.as_mut_ptr(),
                out.len() as i32,
            )
        };
        if wrote <= 0 { Err(()) } else { Ok(wrote as usize) }
    }
}

impl Drop for OpusEncoder {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe { audiopus_sys::opus_encoder_destroy(self.raw) };
            self.raw = std::ptr::null_mut();
        }
    }
}

struct OpusDecoder {
    raw: *mut audiopus_sys::OpusDecoder,
}

impl OpusDecoder {
    fn new() -> Result<Self, ()> {
        let mut error = 0;
        let raw = unsafe { audiopus_sys::opus_decoder_create(SAMPLE_RATE as i32, 2, &mut error) };
        if raw.is_null() || error != audiopus_sys::OPUS_OK {
            return Err(());
        }
        Ok(Self { raw })
    }

    fn decode(&mut self, packet: Option<&[u8]>, pcm: &mut [i16], frame_size: i32) -> Result<usize, ()> {
        let (ptr, len) = match packet {
            Some(bytes) => (bytes.as_ptr(), bytes.len() as i32),
            None => (std::ptr::null(), 0),
        };
        let wrote = unsafe { audiopus_sys::opus_decode(self.raw, ptr, len, pcm.as_mut_ptr(), frame_size, 0) };
        if wrote <= 0 { Err(()) } else { Ok(wrote as usize) }
    }
}

impl Drop for OpusDecoder {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe { audiopus_sys::opus_decoder_destroy(self.raw) };
            self.raw = std::ptr::null_mut();
        }
    }
}
const MAX_SPEAKERS: usize = 32;
const MAX_PCM: usize = SAMPLE_RATE as usize / 5;
const TARGET_PCM: usize = SAMPLE_RATE as usize / 10;

#[derive(Debug, Clone)]
pub struct VoiceAudio {
    pub deafened: bool,
    pub vad: bool,
    pub sensitivity: u8,
    pub noise_suppression: bool,
    pub input_device: String,
    pub output_device: String,
    pub echo_cancellation: bool,
    pub agc: bool,
    /// 100 is unity. 0 is silence. 200 is twice as loud.
    pub input_volume: u8,
    pub output_volume: u8,
    /// `standard` is RNNoise. `high` is the spectral suppressor and FIR echo filter.
    pub noise_quality: String,
}

impl Default for VoiceAudio {
    fn default() -> Self {
        Self {
            deafened: false,
            vad: true,
            sensitivity: 45,
            noise_suppression: true,
            input_device: String::new(),
            output_device: String::new(),
            echo_cancellation: true,
            agc: true,
            input_volume: 100,
            output_volume: 100,
            noise_quality: "standard".into(),
        }
    }
}

pub fn noise_quality_high(value: &str) -> bool {
    value == "high"
}

#[derive(Debug, Clone)]
pub struct AecState {
    coeff: f32,
}

impl Default for AecState {
    fn default() -> Self {
        Self { coeff: 0.0 }
    }
}

#[derive(Debug, Clone)]
pub struct AgcState {
    gain: f32,
}

impl Default for AgcState {
    fn default() -> Self {
        Self { gain: 1.0 }
    }
}

/// Microphone gain before noise suppression. Unity leaves the samples alone.
pub fn apply_input_gain(frame: &mut [f32], volume: u8) {
    if volume == 100 {
        return;
    }
    let gain = (f32::from(volume) / 100.0).clamp(0.0, 2.0);
    for sample in frame.iter_mut() {
        *sample = (*sample * gain).clamp(-1.0, 1.0);
    }
}

/// One-tap echo canceller. `reference` is the playback mix for this frame.
pub fn apply_aec(frame: &mut [f32], reference: &[f32], state: &mut AecState) {
    let count = frame.len().min(reference.len());
    if count == 0 {
        return;
    }
    let mut power = 1.0e-4;
    for sample in reference.iter().take(count) {
        power += sample * sample;
    }
    for index in 0..count {
        let echo = state.coeff * reference[index];
        let err = frame[index] - echo;
        state.coeff += 0.5 * err * reference[index] / power;
        frame[index] = err.clamp(-1.0, 1.0);
    }
    state.coeff = state.coeff.clamp(-2.0, 2.0);
}

/// Lifts a quiet voice toward a steady level. Exact silence stays silence.
pub fn apply_agc(frame: &mut [f32], state: &mut AgcState) {
    if frame.is_empty() {
        return;
    }
    let energy: f32 = frame.iter().map(|sample| sample * sample).sum();
    let rms = (energy / frame.len() as f32).sqrt();
    if rms < 0.0008 {
        return;
    }
    let desired = (0.05 / rms).clamp(0.25, 8.0);
    state.gain = (state.gain * 0.7 + desired * 0.3).clamp(0.25, 8.0);
    for sample in frame.iter_mut() {
        *sample = (*sample * state.gain).clamp(-1.0, 1.0);
    }
}

#[derive(Debug)]
pub struct CaptureBuf {
    pub samples: VecDeque<f32>,
    pub rate: u32,
}

impl CaptureBuf {
    pub fn new() -> Self {
        Self { samples: VecDeque::new(), rate: 0 }
    }
}

#[derive(Debug)]
pub struct SpeakerBuf {
    pub user_id: String,
    pub samples: VecDeque<f32>,
}

#[derive(Debug)]
pub struct Playback {
    pub speakers: HashMap<u32, SpeakerBuf>,
    pub deafened: bool,
    pub rate: u32,
    pub channels: u16,
    pub output_gain: f32,
    pub last_render: Vec<f32>,
    /// Guild soundboard for the speakers. Not a remote voice stream.
    local: VecDeque<f32>,
}

/// Playback gain ceiling. The voice slider uses 2.0. The volume booster plugin uses 4.0.
pub const USER_GAIN_CAP: f32 = 4.0;

pub fn user_gain(value: f32) -> f32 {
    if !value.is_finite() {
        return 1.0;
    }
    value.clamp(0.0, USER_GAIN_CAP)
}

impl Playback {
    pub fn new() -> Self {
        Self {
            speakers: HashMap::new(),
            deafened: false,
            rate: SAMPLE_RATE,
            channels: 2,
            output_gain: 1.0,
            last_render: Vec::new(),
            local: VecDeque::new(),
        }
    }

    /// Queue speaker-only soundboard audio. A long sound is kept; voice jitter is not.
    pub fn push_local(&mut self, pcm: &[f32]) {
        const LOCAL_CAP: usize = 48_000 * 15;
        self.local.extend(pcm.iter().copied().filter(|sample| sample.is_finite()));
        if self.local.len() > LOCAL_CAP {
            let extra = self.local.len() - LOCAL_CAP;
            self.local.drain(..extra);
        }
    }

    /// Mono PCM at the output device rate. Deafened output is silence, and the
    /// queues are still drained so undeafen does not play a backlog.
    pub fn render(&mut self, device_frames: usize, volumes: &HashMap<String, f32>) -> Vec<f32> {
        if device_frames == 0 {
            return Vec::new();
        }
        let rate = self.rate.max(1);
        let src_frames = ((device_frames as u64 * u64::from(SAMPLE_RATE)) / u64::from(rate)).max(1) as usize;
        let mut mixed = vec![0f32; src_frames];
        for speaker in self.speakers.values_mut() {
            let gain = if self.deafened {
                0.0
            } else {
                user_gain(volumes.get(&speaker.user_id).copied().unwrap_or(1.0))
            };
            for sample in mixed.iter_mut() {
                let Some(input) = speaker.samples.pop_front() else { break };
                *sample += input * gain;
            }
        }
        let local_frames = src_frames.min(self.local.len());
        if self.deafened {
            self.local.drain(..local_frames);
        } else {
            for sample in mixed.iter_mut().take(local_frames) {
                let Some(extra) = self.local.pop_front() else { break };
                *sample = (*sample + extra).clamp(-1.0, 1.0);
            }
        }
        if !self.deafened {
            let gain = self.output_gain;
            for sample in &mut mixed {
                *sample = (*sample * gain).clamp(-1.0, 1.0);
            }
        }
        let mut echo = mixed.clone();
        if echo.len() > FRAME_SAMPLES {
            echo.truncate(FRAME_SAMPLES);
        } else {
            echo.resize(FRAME_SAMPLES, 0.0);
        }
        self.last_render = echo;
        if rate == SAMPLE_RATE && src_frames == device_frames {
            mixed
        } else {
            resample_mono(&mixed, device_frames)
        }
    }
}

pub fn push_speaker(play: &mut Playback, ssrc: u32, user_id: &str, pcm: &[f32]) {
    if pcm.is_empty() {
        return;
    }
    if !play.speakers.contains_key(&ssrc) && play.speakers.len() >= MAX_SPEAKERS {
        return;
    }
    let speaker = play.speakers.entry(ssrc).or_insert_with(|| SpeakerBuf {
        user_id: user_id.to_string(),
        samples: VecDeque::new(),
    });
    if !user_id.is_empty() {
        speaker.user_id = user_id.to_string();
    }
    speaker.samples.extend(pcm);
    if speaker.samples.len() > MAX_PCM {
        let extra = speaker.samples.len() - TARGET_PCM;
        speaker.samples.drain(..extra);
    }
}

pub fn pull_mono_frame(buf: &mut CaptureBuf) -> Option<Vec<f32>> {
    if buf.rate == 0 || buf.samples.is_empty() {
        return None;
    }
    let need = ((FRAME_SAMPLES as u64 * u64::from(buf.rate)) / u64::from(SAMPLE_RATE)).max(1) as usize;
    if buf.samples.len() < need {
        return None;
    }
    let chunk: Vec<f32> = buf.samples.drain(..need).collect();
    if buf.rate == SAMPLE_RATE && chunk.len() == FRAME_SAMPLES {
        Some(chunk)
    } else {
        Some(resample_mono(&chunk, FRAME_SAMPLES))
    }
}

pub fn resample_mono(input: &[f32], out_len: usize) -> Vec<f32> {
    if out_len == 0 {
        return Vec::new();
    }
    if input.is_empty() {
        return vec![0.0; out_len];
    }
    if input.len() == out_len {
        return input.to_vec();
    }
    let mut out = Vec::with_capacity(out_len);
    let last = (input.len() - 1) as f32;
    let scale = if out_len == 1 { 0.0 } else { last / (out_len - 1) as f32 };
    for i in 0..out_len {
        let pos = i as f32 * scale;
        let idx = pos.floor() as usize;
        let frac = pos - idx as f32;
        let a = input[idx.min(input.len() - 1)];
        let b = input[(idx + 1).min(input.len() - 1)];
        out.push(a + (b - a) * frac);
    }
    out
}

pub struct MediaPipe {
    pub outbound: async_mpsc::UnboundedReceiver<VoiceWire>,
    pub inbound: mpsc::SyncSender<Vec<u8>>,
    cancel: Arc<AtomicBool>,
    _join: Option<JoinHandle<()>>,
}

impl Drop for MediaPipe {
    fn drop(&mut self) {
        self.cancel.store(true, Ordering::Relaxed);
    }
}

pub fn start_media(
    mode: CipherMode,
    key: [u8; 32],
    ssrc: u32,
    controls: watch::Receiver<VoiceAudio>,
    transmit: watch::Receiver<bool>,
    volumes: Arc<Mutex<HashMap<String, f32>>>,
    ssrc_users: Arc<Mutex<HashMap<u32, String>>>,
    board: Arc<Mutex<SoundMix>>,
    dave: Option<Arc<Mutex<DaveCall>>>,
    log: Arc<Mutex<VoiceLog>>,
) -> Result<MediaPipe, String> {
    let (outbound_tx, outbound_rx) = async_mpsc::unbounded_channel();
    let (inbound_tx, inbound_rx) = mpsc::sync_channel(64);
    let (inject_tx, inject_rx) = mpsc::sync_channel(8);
    let (pcm_tx, pcm_rx) = mpsc::sync_channel(8);
    if let Ok(mut guard) = log.lock() {
        guard.inject = Some(inject_tx);
        guard.pcm_inject = Some(pcm_tx);
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_thread = cancel.clone();
    let capture = Arc::new(Mutex::new(CaptureBuf::new()));
    let playback = Arc::new(Mutex::new(Playback::new()));
    let join = std::thread::Builder::new()
        .name("lark-voice".into())
        .spawn(move || {
            run_media(MediaArgs {
                mode,
                key,
                ssrc,
                controls,
                transmit,
                volumes,
                ssrc_users,
                board,
                dave,
                log,
                capture,
                playback,
                inbound: inbound_rx,
                outbound: outbound_tx,
                inject: inject_rx,
                pcm_inject: pcm_rx,
                cancel: cancel_thread,
            });
        })
        .map_err(|err| err.to_string())?;
    Ok(MediaPipe {
        outbound: outbound_rx,
        inbound: inbound_tx,
        cancel,
        _join: Some(join),
    })
}

struct MediaArgs {
    mode: CipherMode,
    key: [u8; 32],
    ssrc: u32,
    controls: watch::Receiver<VoiceAudio>,
    transmit: watch::Receiver<bool>,
    volumes: Arc<Mutex<HashMap<String, f32>>>,
    ssrc_users: Arc<Mutex<HashMap<u32, String>>>,
    board: Arc<Mutex<SoundMix>>,
    dave: Option<Arc<Mutex<DaveCall>>>,
    log: Arc<Mutex<VoiceLog>>,
    capture: Arc<Mutex<CaptureBuf>>,
    playback: Arc<Mutex<Playback>>,
    inbound: mpsc::Receiver<Vec<u8>>,
    outbound: async_mpsc::UnboundedSender<VoiceWire>,
    inject: mpsc::Receiver<Vec<u8>>,
    pcm_inject: mpsc::Receiver<Vec<f32>>,
    cancel: Arc<AtomicBool>,
}

struct Incoming {
    decoder: OpusDecoder,
    next_seq: Option<u16>,
    last: Instant,
}

fn run_media(args: MediaArgs) {
    let mut encoder = match OpusEncoder::new() {
        Ok(encoder) => Some(encoder),
        Err(()) => {
            if let Ok(mut log) = args.log.lock() {
                log.opus_error = "Opus encoder failed to start".into();
                log.push("opus encoder failed");
            }
            None
        }
    };
    let mut decoders: HashMap<u32, Incoming> = HashMap::new();
    let mut streams = DeviceStreams::new(args.capture.clone(), args.playback.clone(), args.volumes.clone());
    let mut next_frame = Instant::now();
    let mut seq = 0u16;
    let mut timestamp = 0u32;
    let mut nonce = 0u32;
    let mut last_talking = false;
    let mut silence_left = 0u8;
    let mut scratch = vec![0i16; 12_000];
    let mut pcm = [0i16; FRAME_SAMPLES * 2];
    let mut opus_buf = [0u8; 1_500];
    let mut last_sweep = Instant::now();
    let mut denoiser = NoiseSuppressor::new();
    let mut spectral = SpectralSuppressor::new();
    let mut aec = AecState::default();
    let mut fir = FirAec::new();
    let mut agc = AgcState::default();

    loop {
        if args.cancel.load(Ordering::Relaxed) {
            break;
        }
        let controls = args.controls.borrow().clone();
        streams.sync(&controls.input_device, &controls.output_device);
        if let Ok(mut log) = args.log.lock() {
            log.input_open = streams.input_open();
            log.output_open = streams.output_open();
            log.input_error = streams.input_error().to_string();
            log.output_error = streams.output_error().to_string();
        }
        if let Ok(mut play) = args.playback.lock() {
            play.deafened = controls.deafened;
            play.output_gain = (f32::from(controls.output_volume) / 100.0).clamp(0.0, 2.0);
        }
        drain_heard(&args.board, &args.playback);
        let wait = next_frame.saturating_duration_since(Instant::now()).max(Duration::from_millis(1));
        match args.inbound.recv_timeout(wait) {
            Ok(packet) => handle_packet(&args, &mut decoders, &mut scratch, packet),
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        while let Ok(packet) = args.inbound.try_recv() {
            handle_packet(&args, &mut decoders, &mut scratch, packet);
        }
        if Instant::now() >= next_frame {
            produce_frame(
                &args,
                &controls,
                &mut denoiser,
                &mut spectral,
                &mut aec,
                &mut fir,
                &mut agc,
                &mut encoder,
                &mut pcm,
                &mut opus_buf,
                &mut seq,
                &mut timestamp,
                &mut nonce,
                &mut last_talking,
                &mut silence_left,
            );
            next_frame += Duration::from_millis(20);
            if next_frame + Duration::from_millis(80) < Instant::now() {
                next_frame = Instant::now() + Duration::from_millis(20);
            }
        }
        if last_sweep.elapsed() >= Duration::from_secs(5) {
            let now = Instant::now();
            decoders.retain(|ssrc, incoming| {
                let keep = now.duration_since(incoming.last) < Duration::from_secs(30);
                if !keep {
                    if let Ok(mut play) = args.playback.lock() {
                        play.speakers.remove(ssrc);
                    }
                }
                keep
            });
            last_sweep = now;
        }
    }
}

fn produce_frame(
    args: &MediaArgs,
    controls: &VoiceAudio,
    denoiser: &mut NoiseSuppressor,
    spectral: &mut SpectralSuppressor,
    aec: &mut AecState,
    fir: &mut FirAec,
    agc: &mut AgcState,
    encoder: &mut Option<OpusEncoder>,
    pcm: &mut [i16],
    opus_buf: &mut [u8],
    seq: &mut u16,
    timestamp: &mut u32,
    nonce: &mut u32,
    last_talking: &mut bool,
    silence_left: &mut u8,
) {
    while let Ok(opus) = args.inject.try_recv() {
        set_talking(args, true, last_talking);
        *silence_left = SILENCE_TAIL;
        send_opus(args, &opus, seq, timestamp, nonce);
    }
    let injected = args.pcm_inject.try_recv().ok().map(|mut samples| {
        if samples.len() < FRAME_SAMPLES {
            samples.resize(FRAME_SAMPLES, 0.0);
        } else if samples.len() > FRAME_SAMPLES {
            samples.truncate(FRAME_SAMPLES);
        }
        samples
    });
    let frame = injected.or_else(|| args.capture.lock().ok().and_then(|mut buf| pull_mono_frame(&mut buf)));
    let have_audio = frame.is_some();
    let mut owned = frame.unwrap_or_else(|| vec![0.0; FRAME_SAMPLES]);
    apply_input_gain(&mut owned, controls.input_volume);
    let high = noise_quality_high(&controls.noise_quality);
    if controls.echo_cancellation && have_audio {
        let reference = args.playback.lock().ok().map(|play| play.last_render.clone()).unwrap_or_default();
        let mut reference = reference;
        if reference.len() < FRAME_SAMPLES {
            reference.resize(FRAME_SAMPLES, 0.0);
        }
        if high {
            fir.process(&mut owned, &reference[..FRAME_SAMPLES]);
        } else {
            apply_aec(&mut owned, &reference[..FRAME_SAMPLES], aec);
        }
    }
    if controls.noise_suppression && have_audio {
        if high {
            spectral.process(&mut owned);
        } else {
            denoiser.process(&mut owned);
        }
    }
    if controls.agc && have_audio {
        apply_agc(&mut owned, agc);
    }
    let transmit = *args.transmit.borrow();
    let active = voice_active(&owned, controls.sensitivity);
    let board = args.board.lock().ok().map(|mut mix| mix.mix_into(&mut owned)).unwrap_or(false);
    let talking = encoder.is_some() && (board || (transmit && have_audio && (!controls.vad || active)));
    if talking {
        set_talking(args, true, last_talking);
        *silence_left = SILENCE_TAIL;
        let opus = encoder.as_mut().and_then(|encoder| {
            stereo_from_mono(&owned, pcm);
            match encoder.encode(pcm, opus_buf) {
                Ok(len) if len > 0 => Some(opus_buf[..len].to_vec()),
                _ => None,
            }
        });
        if let Some(opus) = opus {
            send_opus(args, &opus, seq, timestamp, nonce);
        }
        return;
    }
    if *silence_left > 0 {
        *silence_left -= 1;
        send_opus(args, OPUS_SILENCE, seq, timestamp, nonce);
        if *silence_left == 0 {
            set_talking(args, false, last_talking);
        }
    }
}

fn set_talking(args: &MediaArgs, talking: bool, last_talking: &mut bool) {
    if talking == *last_talking {
        return;
    }
    let _ = args.outbound.send(VoiceWire::Speaking(talking));
    *last_talking = talking;
}

fn send_opus(args: &MediaArgs, opus: &[u8], seq: &mut u16, timestamp: &mut u32, nonce: &mut u32) {
    let sealed = match &args.dave {
        Some(dave) => {
            let Ok(mut call) = dave.lock() else { return };
            match call.seal_opus(opus) {
                Ok(bytes) => bytes,
                Err(()) => {
                    drop(call);
                    if let Ok(mut log) = args.log.lock() {
                        log.dave_seal_skip = log.dave_seal_skip.saturating_add(1);
                    }
                    return;
                }
            }
        }
        None => opus.to_vec(),
    };
    if let Ok(mut log) = args.log.lock() {
        log.opus_out = log.opus_out.saturating_add(1);
        log.last_opus_out = opus.to_vec();
    }
    let header = rtp_header(*seq, *timestamp, args.ssrc);
    if let Ok(packet) = encrypt_voice(args.mode, &args.key, &header, &sealed, *nonce) {
        let _ = args.outbound.send(VoiceWire::Packet(packet));
    } else if let Ok(mut log) = args.log.lock() {
        log.encrypt_fail = log.encrypt_fail.saturating_add(1);
    }
    *seq = seq.wrapping_add(1);
    *timestamp = timestamp.wrapping_add(FRAME_SAMPLES as u32);
    *nonce = nonce.wrapping_add(1);
}

/// Opus encoder for app audio on a Go Live stream. The call keeps its own encoder.
///
/// libopus may move with the stream task. One task owns it, so it is not shared.
pub struct AppOpus {
    inner: OpusEncoder,
}

// SAFETY: `OpusEncoder` is an owned pointer. `AppOpus` only uses it through `&mut self`.
unsafe impl Send for AppOpus {}

impl AppOpus {
    pub fn new() -> Result<Self, ()> {
        Ok(Self { inner: OpusEncoder::new()? })
    }

    pub fn frame_from_f32(&self, samples: &[f32]) -> Vec<i16> {
        let mut pcm = vec![0i16; FRAME_SAMPLES * 2];
        stereo_from_mono(samples, &mut pcm);
        pcm
    }

    pub fn encode(&mut self, pcm: &[i16]) -> Result<Vec<u8>, ()> {
        let mut out = vec![0u8; 512];
        let wrote = self.inner.encode(pcm, &mut out)?;
        out.truncate(wrote);
        Ok(out)
    }
}

fn stereo_from_mono(mono: &[f32], pcm: &mut [i16]) {
    for (index, sample) in mono.iter().take(FRAME_SAMPLES).enumerate() {
        let value = (sample.clamp(-1.0, 1.0) * 32_767.0) as i16;
        pcm[index * 2] = value;
        pcm[index * 2 + 1] = value;
    }
}

fn note_drop(log: &Mutex<VoiceLog>, slot: fn(&mut VoiceLog) -> &mut u64) {
    if let Ok(mut guard) = log.lock() {
        let counter = slot(&mut guard);
        *counter = counter.saturating_add(1);
    }
}

fn handle_packet(args: &MediaArgs, decoders: &mut HashMap<u32, Incoming>, scratch: &mut [i16], packet: Vec<u8>) {
    let Some(ssrc) = rtp_ssrc(&packet) else {
        note_drop(&args.log, |log| &mut log.not_rtp);
        return;
    };
    if ssrc == 0 || ssrc == args.ssrc {
        note_drop(&args.log, |log| &mut log.own_ssrc);
        return;
    }
    let Ok(transport) = decrypt_voice(args.mode, &args.key, &packet) else {
        note_drop(&args.log, |log| &mut log.transport_fail);
        return;
    };
    if transport.is_empty() {
        note_drop(&args.log, |log| &mut log.empty_frame);
        return;
    }
    let opus = match &args.dave {
        Some(dave) => {
            if transport.as_slice() == OPUS_SILENCE {
                transport
            } else {
                let user_id = args
                    .ssrc_users
                    .lock()
                    .ok()
                    .and_then(|map| map.get(&ssrc).cloned())
                    .and_then(|id| id.parse::<u64>().ok())
                    .unwrap_or(0);
                if user_id == 0 {
                    note_drop(&args.log, |log| &mut log.dave_no_user);
                    return;
                }
                let Ok(mut call) = dave.lock() else { return };
                match call.open_opus(user_id, &transport) {
                    Ok(plain) => plain,
                    Err(()) => {
                        drop(call);
                        note_drop(&args.log, |log| &mut log.dave_open_fail);
                        return;
                    }
                }
            }
        }
        None => transport,
    };
    if let Ok(mut log) = args.log.lock() {
        log.opus_in = log.opus_in.saturating_add(1);
        log.last_opus_in = opus.clone();
    }
    let seq = rtp_sequence(&packet);
    if !decoders.contains_key(&ssrc) {
        if decoders.len() >= MAX_SPEAKERS {
            return;
        }
        let Some(created) = Incoming::new() else { return };
        decoders.insert(ssrc, created);
    }
    let Some(incoming) = decoders.get_mut(&ssrc) else { return };
    if let (Some(expected), Some(seq)) = (incoming.next_seq, seq) {
        match packets_to_conceal(expected, seq) {
            None => {
                note_drop(&args.log, |log| &mut log.late_packet);
                return;
            }
            Some(missed) => {
                for _ in 0..missed {
                    if let Some(pcm) = decode_mono(&mut incoming.decoder, None, scratch) {
                        deliver(args, ssrc, &pcm);
                    }
                }
            }
        }
    }
    if let Some(seq) = seq {
        incoming.next_seq = Some(seq.wrapping_add(1));
    }
    incoming.last = Instant::now();
    if let Some(pcm) = decode_mono(&mut incoming.decoder, Some(opus.as_slice()), scratch) {
        deliver(args, ssrc, &pcm);
    } else {
        note_drop(&args.log, |log| &mut log.opus_decode_fail);
    }
}

/// Move queued guild sounds onto the speaker mix. They never enter the encoder.
fn drain_heard(board: &Mutex<SoundMix>, playback: &Mutex<Playback>) {
    let chunk = match board.lock() {
        Ok(mut mix) => mix.take_hear(SAMPLE_RATE as usize),
        Err(_) => return,
    };
    if chunk.is_empty() {
        return;
    }
    if let Ok(mut play) = playback.lock() {
        play.push_local(&chunk);
    }
}

fn deliver(args: &MediaArgs, ssrc: u32, pcm: &[f32]) {
    let user_id = args
        .ssrc_users
        .lock()
        .ok()
        .and_then(|map| map.get(&ssrc).cloned())
        .unwrap_or_default();
    if let Ok(mut play) = args.playback.lock() {
        push_speaker(&mut play, ssrc, &user_id, pcm);
        let decoded = pcm.iter().map(|sample| sample * sample).sum();
        let played = playback_frame_energy(pcm, play.deafened, play.output_gain);
        drop(play);
        if let Ok(mut log) = args.log.lock() {
            if decoded > log.decoded_energy {
                log.decoded_energy = decoded;
            }
            if played > log.playback_energy {
                log.playback_energy = played;
            }
        }
    }
}

/// Energy of one decoded frame after the same mix the speakers play.
/// The copy is rendered so the live queue is not drained.
fn playback_frame_energy(pcm: &[f32], deafened: bool, output_gain: f32) -> f32 {
    if pcm.is_empty() {
        return 0.0;
    }
    let frames = pcm.len().min(FRAME_SAMPLES);
    let mut play = Playback::new();
    play.deafened = deafened;
    play.output_gain = output_gain;
    push_speaker(&mut play, 1, "mix", &pcm[..frames]);
    let mixed = play.render(frames, &HashMap::new());
    mixed.iter().map(|sample| sample * sample).sum()
}

impl Incoming {
    fn new() -> Option<Self> {
        OpusDecoder::new().ok().map(|decoder| Self {
            decoder,
            next_seq: None,
            last: Instant::now(),
        })
    }
}

fn decode_mono(decoder: &mut OpusDecoder, packet: Option<&[u8]>, scratch: &mut [i16]) -> Option<Vec<f32>> {
    let space = (scratch.len() / 2) as i32;
    let frame = if packet.is_none() { FRAME_SAMPLES as i32 } else { space };
    let per_channel = decoder.decode(packet, scratch, frame).ok()?;
    if per_channel == 0 {
        return None;
    }
    let mut mono = Vec::with_capacity(per_channel);
    for index in 0..per_channel {
        let left = scratch.get(index * 2).copied().unwrap_or(0) as f32 / 32_768.0;
        let right = scratch.get(index * 2 + 1).map(|sample| *sample as f32 / 32_768.0).unwrap_or(left);
        mono.push((left + right) * 0.5);
    }
    Some(mono)
}

pub fn rtp_ssrc(packet: &[u8]) -> Option<u32> {
    if packet.len() < 12 || packet[0] >> 6 != 2 {
        return None;
    }
    Some(u32::from_be_bytes([packet[8], packet[9], packet[10], packet[11]]))
}

pub fn rtp_sequence(packet: &[u8]) -> Option<u16> {
    if packet.len() < 4 || packet[0] >> 6 != 2 {
        return None;
    }
    Some(u16::from_be_bytes([packet[2], packet[3]]))
}

/// Lost packets to conceal before `seq`, when `expected` is the next sequence.
/// `None` drops a late or duplicate packet. A forward jump larger than five
/// skips concealment and decodes the packet that arrived.
pub fn packets_to_conceal(expected: u16, seq: u16) -> Option<u16> {
    let gap = seq.wrapping_sub(expected);
    if gap == 0 {
        Some(0)
    } else if (1..=5).contains(&gap) {
        Some(gap)
    } else if gap >= 0x8000 {
        None
    } else {
        Some(0)
    }
}

#[cfg(test)]
fn encode_opus_frame(encoder: &mut OpusEncoder, mono: &[f32]) -> Result<Vec<u8>, ()> {
    let mut pcm = [0i16; FRAME_SAMPLES * 2];
    stereo_from_mono(mono, &mut pcm);
    let mut opus_buf = [0u8; 1_500];
    let len = encoder.encode(&pcm, &mut opus_buf).map_err(|_| ())?;
    if len == 0 {
        return Err(());
    }
    Ok(opus_buf[..len].to_vec())
}

#[cfg(test)]
fn decode_opus_frame(decoder: &mut OpusDecoder, packet: &[u8]) -> Result<Vec<f32>, ()> {
    let mut scratch = vec![0i16; 12_000];
    decode_mono(decoder, Some(packet), &mut scratch).ok_or(())
}

/// Opus pair for the mock voice server. The pointers stay on the test task.
#[cfg(test)]
pub struct TestCodec {
    encoder: OpusEncoder,
    decoder: OpusDecoder,
}

#[cfg(test)]
unsafe impl Send for TestCodec {}

#[cfg(test)]
impl TestCodec {
    pub fn new() -> Result<Self, ()> {
        Ok(Self {
            encoder: OpusEncoder::new()?,
            decoder: OpusDecoder::new()?,
        })
    }

    pub fn encode_mono(&mut self, mono: &[f32]) -> Result<Vec<u8>, ()> {
        encode_opus_frame(&mut self.encoder, mono)
    }

    pub fn decode_mono_packet(&mut self, packet: &[u8]) -> Result<Vec<f32>, ()> {
        decode_opus_frame(&mut self.decoder, packet)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_and_pull_keep_a_20ms_frame() {
        let input = vec![0.0, 1.0];
        let out = resample_mono(&input, 3);
        assert_eq!(out.len(), 3);
        assert!(out[1] > 0.4 && out[1] < 0.6);
        let mut capture = CaptureBuf { samples: VecDeque::from(vec![0.25; 960]), rate: 48_000 };
        let frame = pull_mono_frame(&mut capture).unwrap();
        assert_eq!(frame.len(), 960);
        assert!(pull_mono_frame(&mut capture).is_none());
        let mut slow = CaptureBuf { samples: VecDeque::from(vec![0.5; 882]), rate: 44_100 };
        let pulled = pull_mono_frame(&mut slow).unwrap();
        assert_eq!(pulled.len(), 960);
    }

    #[test]
    fn mix_applies_volume_and_deafen_stays_live() {
        let mut play = Playback::new();
        push_speaker(&mut play, 1, "a", &[0.5; 4]);
        push_speaker(&mut play, 2, "b", &[0.5; 4]);
        let mut volumes = HashMap::new();
        volumes.insert("a".into(), 0.0);
        volumes.insert("b".into(), 1.0);
        let mixed = play.render(4, &volumes);
        assert_eq!(mixed.len(), 4);
        assert!(mixed.iter().all(|sample| (*sample - 0.5).abs() < 0.001));
        push_speaker(&mut play, 2, "b", &[0.8; 4]);
        play.deafened = true;
        let silent = play.render(4, &volumes);
        assert!(silent.iter().all(|sample| *sample == 0.0));
        assert!(play.speakers.get(&2).unwrap().samples.is_empty());
    }

    #[test]
    fn booster_gain_reaches_four_before_the_sample_clamp() {
        let mut play = Playback::new();
        push_speaker(&mut play, 1, "a", &[0.2; 4]);
        let mut volumes = HashMap::new();
        volumes.insert("a".into(), 4.0);
        let mixed = play.render(4, &volumes);
        assert!(mixed.iter().all(|sample| (*sample - 0.8).abs() < 0.001));
        assert!((user_gain(9.0) - USER_GAIN_CAP).abs() < f32::EPSILON);
    }

    #[test]
    fn speaker_buffer_drops_old_audio() {
        let mut play = Playback::new();
        push_speaker(&mut play, 7, "a", &vec![1.0; MAX_PCM + 100]);
        let queued = play.speakers.get(&7).unwrap().samples.len();
        assert!(queued <= TARGET_PCM + 1);
        assert!(queued > 100);
    }

    #[test]
    fn opus_frame_round_trips_a_tone() {
        let mut encoder = OpusEncoder::new().unwrap();
        let mut tone = vec![0.0; FRAME_SAMPLES];
        for (index, sample) in tone.iter_mut().enumerate() {
            *sample = (index as f32 * 0.2).sin() * 0.4;
        }
        let packet = encode_opus_frame(&mut encoder, &tone).unwrap();
        assert!(packet.len() > 8);
        let mut decoder = OpusDecoder::new().unwrap();
        let decoded = decode_opus_frame(&mut decoder, &packet).unwrap();
        assert!(decoded.len() >= FRAME_SAMPLES / 2);
        let energy: f32 = decoded.iter().map(|sample| sample * sample).sum();
        assert!(energy > 1.0, "energy {energy}");
    }

    #[test]
    fn a_local_sound_plays_and_a_deafen_drops_the_backlog() {
        let mut play = Playback::new();
        play.push_local(&[0.5, 0.25, f32::NAN]);
        let mixed = play.render(2, &HashMap::new());
        assert!((mixed[0] - 0.5).abs() < 0.001);
        assert!((mixed[1] - 0.25).abs() < 0.001);
        play.push_local(&[0.8, 0.8]);
        play.deafened = true;
        let silent = play.render(2, &HashMap::new());
        assert_eq!(silent, vec![0.0, 0.0]);
        play.deafened = false;
        let after = play.render(2, &HashMap::new());
        assert_eq!(after, vec![0.0, 0.0]);
    }

    #[test]
    fn input_gain_unity_is_unchanged_and_half_scales() {
        let mut frame = vec![0.5, -0.5];
        apply_input_gain(&mut frame, 100);
        assert!((frame[0] - 0.5).abs() < 0.0001);
        apply_input_gain(&mut frame, 50);
        assert!((frame[0] - 0.25).abs() < 0.0001);
    }

    #[test]
    fn echo_cancellation_removes_a_matching_reference() {
        let reference = vec![0.4; 64];
        let mut state = AecState::default();
        let mut frame = reference.clone();
        for _ in 0..12 {
            frame.clone_from(&reference);
            apply_aec(&mut frame, &reference, &mut state);
        }
        let energy: f32 = frame.iter().map(|sample| sample * sample).sum();
        assert!(energy < 1.0, "energy {energy}");
    }

    #[test]
    fn agc_lifts_a_quiet_tone_and_leaves_silence() {
        let mut quiet = vec![0.01; 64];
        apply_agc(&mut quiet, &mut AgcState::default());
        let rms = (quiet.iter().map(|sample| sample * sample).sum::<f32>() / quiet.len() as f32).sqrt();
        assert!(rms > 0.02, "rms {rms}");
        let mut silence = vec![0.0; 64];
        apply_agc(&mut silence, &mut AgcState::default());
        assert!(silence.iter().all(|sample| *sample == 0.0));
    }

    #[test]
    fn in_order_audio_is_kept_and_old_packets_are_dropped() {
        assert_eq!(packets_to_conceal(5, 5), Some(0));
        assert_eq!(packets_to_conceal(5, 6), Some(1));
        assert_eq!(packets_to_conceal(5, 8), Some(3));
        assert_eq!(packets_to_conceal(1, 0), None);
        assert_eq!(packets_to_conceal(65534, 1), Some(3));
    }
}
