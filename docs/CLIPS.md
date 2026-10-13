# Clips: status against the ShadowPlay / Medal brief

Audit of `main` for [#242](https://github.com/ItsErod/lark/issues/242). Lark captures the screen or a shared window only. It never injects into a game process, so anti-cheat has nothing to flag.

## Working

| Brief item | Status |
| --- | --- |
| Hotkey saves the last 15 s–2 min | Global hotkey (Ctrl+Shift+C by default, remappable). Replay length 15, 30, 60, 90, or 120 s. |
| GPU encode without fps loss | Hardware H.264/HEVC capture (NVENC, AMF, QSV, Media Foundation, VideoToolbox) with a software fallback. 60/120/240 fps, 720p–2160p. |
| Game + mic audio | WASAPI process loopback for a shared window, display loopback otherwise, plus the microphone, saved as three AAC tracks: Game + Microphone (default, what players and Discord play), then Game and Microphone alone for editing. Each source can be turned off in Settings → Clips. |
| Gallery by game | Clip names carry the detected game; the gallery shows a filter chip per game when clips span more than one. |
| Save sound and toast | A short chime and a small always-on-top, click-through toast on save, with no game hooks. Shows over borderless/windowed fullscreen; exclusive fullscreen cannot show any overlay. Toggle in Settings → Clips. |
| Name after the game | `lark-clip-{game}-{time}.mp4` when a game is detected. |
| Quick trim | Trim in the gallery keeps the original file. |
| Gallery | Clips view and the Settings library: play, rename, delete, reveal. |
| One-click channel share | Share sends the clip to the open channel and compresses over the upload limit (always, ask, or never). |

## Remaining gaps

- No automatic highlight capture (kills, wins) — that needs game hooks, which Lark avoids on purpose.
- Clips are not uploaded to a sharing page; sharing is a Discord attachment only.
