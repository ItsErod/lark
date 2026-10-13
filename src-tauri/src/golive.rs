//! Go Live from the desktop shell.
//!
//! The clip ring keeps running. This module opens a second encoder for the
//! stream, then the stream voice connection. Game Mode never reaches that encoder.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use lark_clip_hw::{LiveConfig, LiveSession};
use lark_core::discord::stream::{
    adapt_preset, output_size, preferred_encoder, preset_bitrate, snap_share_fps,
    snap_share_height, stream_encoder_profile, stream_frame_interval_ms, stream_key, SharePreset,
    StreamKind, VideoSpan,
};
use lark_core::discord::stream_link::{maintain_stream, StreamHello, StreamLinkEvent};
use lark_core::discord::GatewayCommand;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use lark_core::screen::{scale_rgba, thumbnail_jpeg};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch};

#[derive(Clone)]
struct Offer {
    endpoint: String,
    token: String,
}

pub struct StreamHub {
    stop: Mutex<Option<watch::Sender<bool>>>,
    watch_stop: Mutex<Option<watch::Sender<bool>>>,
    paused: watch::Sender<bool>,
    quality: watch::Sender<VideoSpan>,
    force_idr: Arc<AtomicBool>,
    offers: Mutex<HashMap<String, Offer>>,
    tick: watch::Sender<u64>,
    key: Mutex<String>,
}

impl StreamHub {
    pub fn new() -> Self {
        let (paused, _) = watch::channel(false);
        let (quality, _) = watch::channel(VideoSpan {
            width: 1920,
            height: 1080,
            fps: 30,
            bitrate: 4_500_000,
            active: true,
            preset_height: 1080,
        });
        let (tick, _) = watch::channel(0);
        Self {
            stop: Mutex::new(None),
            watch_stop: Mutex::new(None),
            paused,
            quality,
            force_idr: Arc::new(AtomicBool::new(false)),
            offers: Mutex::new(HashMap::new()),
            tick,
            key: Mutex::new(String::new()),
        }
    }

    pub fn note_server(&self, stream_key: &str, endpoint: &str, token: &str) {
        if let Ok(mut offers) = self.offers.lock() {
            offers.insert(
                stream_key.to_string(),
                Offer {
                    endpoint: endpoint.to_string(),
                    token: token.to_string(),
                },
            );
        }
        let _ = self.tick.send(self.tick.borrow().wrapping_add(1));
    }

    pub fn active_key(&self) -> String {
        self.key.lock().map(|key| key.clone()).unwrap_or_default()
    }

    pub fn set_paused_local(&self, paused: bool) {
        let _ = self.paused.send(paused);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareSource {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub thumbnail: String,
}

pub fn list_sources() -> Vec<ShareSource> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        return platform_sources();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Vec::new()
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn platform_sources() -> Vec<ShareSource> {
    let mut sources = Vec::new();
    if let Ok(monitors) = xcap::Monitor::all() {
        for (index, monitor) in monitors.iter().enumerate() {
            let name = monitor
                .name()
                .unwrap_or_else(|_| format!("Screen {}", index + 1));
            let width = monitor.width().unwrap_or(0);
            let height = monitor.height().unwrap_or(0);
            let primary = monitor.is_primary().unwrap_or(false);
            let label = if primary {
                format!("{name} (primary)")
            } else {
                name
            };
            let thumbnail = monitor.capture_image().ok().and_then(|image| {
                let width = image.width();
                let height = image.height();
                thumb(&image.into_raw(), width, height)
            });
            sources.push(ShareSource {
                id: format!("screen:{index}"),
                kind: "screen".into(),
                name: label,
                width,
                height,
                thumbnail: thumbnail.unwrap_or_default(),
            });
        }
    }
    if let Ok(windows) = xcap::Window::all() {
        for window in windows {
            let title = window.title().unwrap_or_default();
            if title.trim().is_empty() {
                continue;
            }
            if window.is_minimized().unwrap_or(false) {
                continue;
            }
            let app = window.app_name().unwrap_or_default();
            let name = if app.is_empty() {
                title.clone()
            } else {
                format!("{app} — {title}")
            };
            let width = window.width().unwrap_or(0);
            let height = window.height().unwrap_or(0);
            if width < 32 || height < 32 {
                continue;
            }
            let id = window.id().unwrap_or(0);
            if id == 0 {
                continue;
            }
            let thumbnail = window.capture_image().ok().and_then(|image| {
                let width = image.width();
                let height = image.height();
                thumb(&image.into_raw(), width, height)
            });
            sources.push(ShareSource {
                id: format!("window:{id}"),
                kind: "window".into(),
                name,
                width,
                height,
                thumbnail: thumbnail.unwrap_or_default(),
            });
            if sources.len() > 48 {
                break;
            }
        }
    }
    sources
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn thumb(rgba: &[u8], width: u32, height: u32) -> Option<String> {
    let (scaled, w, h) = scale_rgba(rgba, width, height, 320)?;
    let jpeg = thumbnail_jpeg(&scaled, w, h)?;
    Some(base64::engine::general_purpose::STANDARD.encode(jpeg))
}

pub struct ShareStart {
    pub guild_id: String,
    pub channel_id: String,
    pub user_id: String,
    pub session_id: String,
    pub source_id: String,
    pub resolution: String,
    pub fps: u8,
    pub app_audio: bool,
    pub encoder: String,
    pub source_width: u32,
    pub source_height: u32,
}

pub async fn start_share(
    app: AppHandle,
    hub: Arc<StreamHub>,
    gateway: mpsc::UnboundedSender<GatewayCommand>,
    request: ShareStart,
) -> Result<(), String> {
    if request.channel_id.is_empty() || request.session_id.is_empty() || request.user_id.is_empty()
    {
        return Err("Join a voice channel before sharing your screen.".into());
    }
    stop_publish(&hub, &gateway).await;
    let kind = if request.guild_id.is_empty() {
        StreamKind::Call
    } else {
        StreamKind::Guild
    };
    let key = stream_key(
        kind,
        Some(&request.guild_id),
        &request.channel_id,
        &request.user_id,
    );
    let preset = SharePreset {
        height: snap_share_height(&request.resolution),
        fps: snap_share_fps(request.fps),
    };
    let (width, height) = output_size(preset, request.source_width, request.source_height);
    let bitrate = preset_bitrate(preset, request.source_width, request.source_height);
    let profile = stream_encoder_profile(preset.fps);
    let span = VideoSpan {
        width,
        height,
        fps: preset.fps,
        bitrate,
        active: true,
        preset_height: preset.height,
    };
    let _ = hub.quality.send(span);
    let _ = hub.paused.send(false);
    hub.force_idr.store(false, Ordering::Relaxed);
    if let Ok(mut slot) = hub.key.lock() {
        *slot = key.clone();
    }

    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let (frame_tx, mut frame_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let (audio_tx, mut audio_rx) = mpsc::unbounded_channel::<Vec<f32>>();
    let (stop_tx, stop_rx) = watch::channel(false);
    let quality_tx = hub.quality.clone();
    let quality_rx = hub.quality.subscribe();
    let paused_rx = hub.paused.subscribe();
    let force = hub.force_idr.clone();
    let capture_source = request.source_id.clone();
    let capture_encoder = preferred_encoder(std::env::consts::OS, &request.encoder).to_string();
    let app_audio = request.app_audio;
    let app_for_note = app.clone();
    std::thread::Builder::new()
        .name("lark-golive".into())
        .spawn(move || {
            capture_thread(
                ready_tx,
                frame_tx,
                audio_tx,
                stop_rx,
                quality_tx,
                quality_rx,
                paused_rx,
                force,
                capture_source,
                capture_encoder,
                app_audio,
                preset,
                request.source_width,
                request.source_height,
                app_for_note,
            );
        })
        .map_err(|err| err.to_string())?;

    let opened = tokio::task::spawn_blocking(move || ready_rx.recv_timeout(Duration::from_secs(8)))
        .await
        .map_err(|_| "Screen capture did not start.".to_string())?;
    match opened {
        Ok(Ok(())) => {}
        Ok(Err(err)) => {
            let _ = stop_tx.send(true);
            return Err(err);
        }
        Err(_) => {
            let _ = stop_tx.send(true);
            return Err("Screen capture did not start.".into());
        }
    }

    let mut offers = hub.tick.subscribe();
    gateway
        .send(GatewayCommand::StreamCreate {
            guild: !request.guild_id.is_empty(),
            guild_id: if request.guild_id.is_empty() {
                None
            } else {
                Some(request.guild_id.clone())
            },
            channel_id: request.channel_id.clone(),
        })
        .map_err(|_| "Gateway is closed.".to_string())?;
    let offer = wait_offer(&hub, &key, &mut offers).await?;
    if let Ok(mut slot) = hub.stop.lock() {
        *slot = Some(stop_tx.clone());
    }

    let hello = StreamHello {
        endpoint: offer.endpoint,
        server_id: if request.guild_id.is_empty() {
            request.channel_id.clone()
        } else {
            request.guild_id.clone()
        },
        channel_id: request.channel_id,
        user_id: request.user_id,
        session_id: request.session_id,
        token: offer.token,
        publish: true,
        width,
        height,
        fps: preset.fps,
        bitrate,
    };
    let (bridge_tx, bridge_rx) = mpsc::unbounded_channel();
    let (audio_bridge_tx, audio_bridge_rx) = mpsc::unbounded_channel();
    let app_frames = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(frame) = frame_rx.recv().await {
            if bridge_tx.send(frame).is_err() {
                break;
            }
        }
    });
    tauri::async_runtime::spawn(async move {
        while let Some(pcm) = audio_rx.recv().await {
            if audio_bridge_tx.send(pcm).is_err() {
                break;
            }
        }
    });
    let paused = hub.paused.subscribe();
    let quality = hub.quality.subscribe();
    let force = hub.force_idr.clone();
    let cancel = stop_tx.subscribe();
    tauri::async_runtime::spawn(async move {
        maintain_stream(
            hello,
            cancel,
            paused,
            quality,
            bridge_rx,
            audio_bridge_rx,
            force,
            move |event| {
                let payload = match event {
                    StreamLinkEvent::Status { state, detail } => serde_json::json!({
                        "kind": "screenShare",
                        "state": state,
                        "detail": detail,
                    }),
                    StreamLinkEvent::Frame { annex_b } => serde_json::json!({
                        "kind": "streamFrame",
                        "annexB": base64::engine::general_purpose::STANDARD.encode(annex_b),
                    }),
                };
                let _ = app_frames.emit("discord", payload);
            },
        )
        .await;
    });
    let _ = profile;
    let _ = app;
    Ok(())
}

fn capture_thread(
    ready: std::sync::mpsc::Sender<Result<(), String>>,
    frames: mpsc::UnboundedSender<Vec<u8>>,
    audio: mpsc::UnboundedSender<Vec<f32>>,
    stop: watch::Receiver<bool>,
    quality_tx: watch::Sender<VideoSpan>,
    mut quality: watch::Receiver<VideoSpan>,
    paused: watch::Receiver<bool>,
    force: Arc<AtomicBool>,
    source: String,
    encoder: String,
    app_audio: bool,
    mut preset: SharePreset,
    source_w: u32,
    source_h: u32,
    app: AppHandle,
) {
    let open_at = |preset: SharePreset| -> Result<LiveSession, String> {
        let (width, height) = output_size(preset, source_w, source_h);
        let bitrate = preset_bitrate(preset, source_w, source_h);
        let profile = stream_encoder_profile(preset.fps);
        LiveSession::open(&LiveConfig {
            width,
            height,
            fps: u32::from(preset.fps),
            bitrate,
            hevc: false,
            game_mode: false,
            stream: true,
            source: source.clone(),
            app_audio,
            encoder: encoder.clone(),
            idr_interval: profile.idr_interval_frames,
        })
    };
    let mut session = match open_at(preset) {
        Ok(session) => session,
        Err(err) => {
            let _ = ready.send(Err(err));
            return;
        }
    };
    let _ = ready.send(Ok(()));
    let mut slow = 0u8;
    let mut sent = 0u32;
    loop {
        if *stop.borrow() {
            break;
        }
        if *paused.borrow() {
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }
        if quality.has_changed().unwrap_or(false) {
            let span = *quality.borrow_and_update();
            preset = SharePreset {
                height: span.preset_height,
                fps: span.fps,
            };
            if let Ok(next) = open_at(preset) {
                session = next;
            }
        }
        if force.swap(false, Ordering::Relaxed) {
            session.request_idr();
        }
        let started = Instant::now();
        match session.tick() {
            Ok(packets) => {
                sent = sent.wrapping_add(1);
                if sent % 15 == 0 {
                    if let Some(packet) = packets.first() {
                        if packet.bytes.len() <= 100_000 {
                            let _ = app.emit(
                                "discord",
                                serde_json::json!({
                                    "kind": "streamFrame",
                                    "preview": true,
                                    "annexB": base64::engine::general_purpose::STANDARD.encode(&packet.bytes),
                                }),
                            );
                        }
                    }
                }
                for packet in packets {
                    if frames.send(packet.bytes).is_err() {
                        return;
                    }
                }
                let pcm = session.pull_audio();
                if !pcm.is_empty() {
                    let _ = audio.send(pcm);
                }
                let budget = Duration::from_millis(stream_frame_interval_ms(preset.fps, false));
                if started.elapsed() > budget.saturating_mul(2) {
                    slow = slow.saturating_add(1);
                } else {
                    slow = 0;
                }
                if slow >= 3 {
                    slow = 0;
                    let (next, note) = adapt_preset(preset, false);
                    if next != preset {
                        preset = next;
                        let (width, height) = output_size(preset, source_w, source_h);
                        let bitrate = preset_bitrate(preset, source_w, source_h);
                        let _ = quality_tx.send(VideoSpan {
                            width,
                            height,
                            fps: preset.fps,
                            bitrate,
                            active: true,
                            preset_height: preset.height,
                        });
                        let _ = app.emit(
                            "discord",
                            serde_json::json!({
                                "kind": "screenShare",
                                "state": "adapted",
                                "width": width,
                                "height": height,
                                "fps": preset.fps,
                                "bitrate": bitrate,
                                "note": note.unwrap_or_default(),
                            }),
                        );
                        if let Ok(reopened) = open_at(preset) {
                            session = reopened;
                        }
                    }
                }
            }
            Err(err) => {
                let (next, note) = adapt_preset(preset, false);
                let message = note.unwrap_or(err);
                if next == preset {
                    let _ = app.emit("discord", serde_json::json!({"kind": "screenShare", "state": "failed", "note": message}));
                    return;
                }
                preset = next;
                if let Ok(reopened) = open_at(preset) {
                    session = reopened;
                    let (width, height) = output_size(preset, source_w, source_h);
                    let bitrate = preset_bitrate(preset, source_w, source_h);
                    let _ = quality_tx.send(VideoSpan {
                        width,
                        height,
                        fps: preset.fps,
                        bitrate,
                        active: true,
                        preset_height: preset.height,
                    });
                    let _ = app.emit("discord", serde_json::json!({"kind": "screenShare", "state": "adapted", "note": message, "width": width, "height": height, "fps": preset.fps, "bitrate": bitrate}));
                } else {
                    let _ = app.emit("discord", serde_json::json!({"kind": "screenShare", "state": "failed", "note": message}));
                    return;
                }
            }
        }
        let wait = Duration::from_millis(stream_frame_interval_ms(preset.fps, true));
        let slice = wait.saturating_sub(started.elapsed());
        if !slice.is_zero() {
            std::thread::sleep(slice);
        }
    }
}

async fn wait_offer(
    hub: &StreamHub,
    key: &str,
    tick: &mut watch::Receiver<u64>,
) -> Result<Offer, String> {
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if let Some(offer) = hub
            .offers
            .lock()
            .ok()
            .and_then(|offers| offers.get(key).cloned())
        {
            return Ok(offer);
        }
        if Instant::now() >= deadline {
            return Err("Discord did not open the stream server.".into());
        }
        tokio::select! {
            _ = tick.changed() => {}
            _ = tokio::time::sleep(Duration::from_millis(200)) => {}
        }
    }
}

pub async fn stop_publish(hub: &StreamHub, gateway: &mpsc::UnboundedSender<GatewayCommand>) {
    if let Some(stop) = hub.stop.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = stop.send(true);
    }
    let key = hub.active_key();
    if !key.is_empty() {
        let _ = gateway.send(GatewayCommand::StreamDelete { stream_key: key });
        if let Ok(mut slot) = hub.key.lock() {
            slot.clear();
        }
    }
}

pub async fn set_paused(
    hub: &StreamHub,
    gateway: &mpsc::UnboundedSender<GatewayCommand>,
    paused: bool,
) {
    let _ = hub.paused.send(paused);
    let key = hub.active_key();
    if !key.is_empty() {
        let _ = gateway.send(GatewayCommand::StreamSetPaused {
            stream_key: key,
            paused,
        });
    }
}

pub fn set_quality(
    hub: &StreamHub,
    resolution: &str,
    fps: u8,
    source_w: u32,
    source_h: u32,
) -> VideoSpan {
    let preset = SharePreset {
        height: snap_share_height(resolution),
        fps: snap_share_fps(fps),
    };
    let (width, height) = output_size(preset, source_w, source_h);
    let bitrate = preset_bitrate(preset, source_w, source_h);
    let span = VideoSpan {
        width,
        height,
        fps: preset.fps,
        bitrate,
        active: true,
        preset_height: preset.height,
    };
    let _ = hub.quality.send(span);
    span
}

pub async fn watch_stream(
    app: AppHandle,
    hub: Arc<StreamHub>,
    gateway: mpsc::UnboundedSender<GatewayCommand>,
    stream_key: String,
    server_id: String,
    channel_id: String,
    user_id: String,
    session_id: String,
) -> Result<(), String> {
    if let Some(stop) = hub.watch_stop.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = stop.send(true);
    }
    let mut offers = hub.tick.subscribe();
    gateway
        .send(GatewayCommand::StreamWatch {
            stream_key: stream_key.clone(),
        })
        .map_err(|_| "Gateway is closed.".to_string())?;
    let offer = wait_offer(&hub, &stream_key, &mut offers).await?;
    let (stop_tx, cancel) = watch::channel(false);
    if let Ok(mut slot) = hub.watch_stop.lock() {
        *slot = Some(stop_tx);
    }
    let (_paused_tx, paused) = watch::channel(false);
    let (_quality_tx, quality) = watch::channel(*hub.quality.borrow());
    let (_frame_tx, frames) = mpsc::unbounded_channel();
    let (_audio_tx, audio) = mpsc::unbounded_channel();
    let hello = StreamHello {
        endpoint: offer.endpoint,
        server_id,
        channel_id,
        user_id,
        session_id,
        token: offer.token,
        publish: false,
        width: 1280,
        height: 720,
        fps: 30,
        bitrate: 2_500_000,
    };
    tauri::async_runtime::spawn(async move {
        maintain_stream(
            hello,
            cancel,
            paused,
            quality,
            frames,
            audio,
            Arc::new(AtomicBool::new(false)),
            move |event| {
                if let StreamLinkEvent::Frame { annex_b } = event {
                    let _ = app.emit(
                        "discord",
                        serde_json::json!({
                            "kind": "streamFrame",
                            "streamKey": stream_key,
                            "annexB": base64::engine::general_purpose::STANDARD.encode(annex_b),
                        }),
                    );
                }
            },
        )
        .await;
    });
    Ok(())
}

pub async fn stop_watch(hub: &StreamHub) {
    if let Some(stop) = hub.watch_stop.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = stop.send(true);
    }
}
