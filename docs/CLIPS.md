# Clips: status against the ShadowPlay / Medal brief

Audit of `main` for [#242](https://github.com/ItsErod/lark/issues/242). Lark captures the screen or a shared window only. It never injects into a game process, so anti-cheat has nothing to flag.

## Working

| Brief item | Status |
| --- | --- |
| Hotkey saves the last 15 s–2 min | Global hotkey (Ctrl+Shift+C by default, remappable). Replay length 15, 30, 60, 90, or 120 s. |
| GPU encode without fps loss | Hardware H.264/HEVC capture (NVENC, AMF, QSV, Media Foundation, VideoToolbox) with a software fallback. 60/120/240 fps, 720p–2160p. |
| Game + mic audio | WASAPI process loopback for a shared window, display loopback otherwise, plus the microphone, mixed into AAC on save. Each track can now be turned off in Settings → Clips. |
| Name after the game | `lark-clip-{game}-{time}.mp4` when a game is detected. |
| Quick trim | Trim in the gallery keeps the original file. |
| Gallery | Clips view and the Settings library: play, rename, delete, reveal. |
| One-click channel share | Share sends the clip to the open channel and compresses over the upload limit (always, ask, or never). |

## Remaining gaps

- Audio tracks are mixed into one stereo track. Separate game and mic tracks in the file (for editing) are not written yet.
- No per-game folders or filter in the gallery; names carry the game instead.
- No save sound or on-screen toast over a full-screen game; the in-app banner shows once Lark is visible.
- No automatic highlight capture (kills, wins) — that needs game hooks, which Lark avoids on purpose.
- Clips are not uploaded to a sharing page; sharing is a Discord attachment only.
