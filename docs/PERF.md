# Performance

Lark is measured against a production build in Chromium, not the dev server. The harness is `npm run bench`. It loads `/?demo=1&bench=1` with the HTTP cache off, five times, and keeps the median. The bench flag paints 80 messages and 160 members so virtualization and history cost are part of the number. A normal session still opens 20 messages.

Scroll FPS is capped by the display. This machine vsyncs at 60.

Rust figures are the median of 21 debug runs from `cargo test -p lark-core boot_timing -- --nocapture`. They are microseconds for one pass, after a short warmup.

| Metric | Before | After |
| --- | ---: | ---: |
| Cold start to first interactive | 175.4 ms | 128.4 ms |
| Channel switch | 7.9 ms | 8.9 ms |
| Initial message load | 22.3 ms | 41.5 ms |
| Scroll FPS | 61 | 61 |
| Input latency | 0.5 ms | 0.2 ms |
| Idle memory | 4.0 MB | 3.0 MB |
| Idle CPU | 0.3% | 0.3% |
| JS bundle | 839,410 bytes | 889,210 bytes |
| CSS bundle | 68,440 bytes | 69,242 bytes |
| Rust config parse | 472 µs | 456 µs |
| Rust message-cache decode | 832 µs | 823 µs |
| Rust gateway frame parse | 4 µs | 4 µs |

Cold start is navigation to a visible message and a usable composer, with the splash out of the way. Channel switch is the in-page click on #welcome until that channel's messages are on screen. Initial message load is the landing channel's history paint (`lastLoad`). Input latency is the synchronous cost of one composer `input` event. Idle memory is `JSHeapUsedSize` after the interaction. Idle CPU is main-thread task time over the following second.

Before was recorded on 12 Oct 2026, Linux, Chromium 153, viewport 1280×800. Five cold-start samples were 215, 175.4, 172.1, 171.7, and 180 ms.

After was recorded the same day on the same machine, after the speed pass and a rebase onto current main. Five cold-start samples were 147.9, 131.1, 122.8, 126.7, and 128.4 ms. A re-run of the unchanged tree (main before these edits) was 169.8 ms cold start, so the drop to 128.4 ms is from this pass. One idle sample spiked to 44.9% CPU and 5.9 MB while the other four stayed near 0.3% and 3.0 MB. The table uses the median.

What changed:

- The plugin catalog and theme fetch no longer block the first paint. A normal session starts them immediately. The benchmark starts them after the sample so they are not inside the idle window.
- Demo history is painted once. The shell does not render an empty pass before that paint.
- Composer height, the character count, draft saving, and mention suggestions run on the next frame. The measured input cost is the event itself.
- The call timer starts when a call starts and stops when the call ends.
- Message list signatures are a hash, so a repaint can bail out without joining every body.
- Settings pages, guild settings, channel settings, and thread chrome load when they are opened. The JS total is higher than the first baseline because main gained features after that measurement, and the split chunks are still counted. On the tree just before these edits the total was 872,795 bytes. After the rebase it is 889,210 bytes.
- Inter 400 stays on the first paint. The other weights load when the browser is idle.
- REST page reads are cached for 15 seconds. A repeated gateway ready with the same guild and channel ids does not rebuild the guild list. Tokens, auth headers, and bearer secrets are not stored.
- Message and member lists were already virtualized. The bench still uses both (80 messages, 160 members). Adjacent channels still preload when the browser is idle.
- Tray, global hotkeys, and the store link register after the window exists. The Rust microbench only times config parse, cache decode, and one gateway frame, which were not rewritten. The few microseconds of difference are run noise.

Initial message load is higher because that timer now includes the first layout. It used to start after an earlier shell paint. Cold start, which is the time until the message is actually on screen, is lower. Channel switch stayed within the noise of the 7–12 ms samples. Scroll stays on the display refresh.

A later pass, recorded 13 Oct 2026 on the same class of machine (Linux, Chromium, viewport 1280×800, five runs, median), was rebased onto main after offline search, smart notifications, the clip gallery, server navigation keys, streamer invite redaction, store search, voice HUD quality, incoming-call ringing, the muted-talk banner, and the extra Mono store themes had landed. Those features stay. Main's cold start on that tree was 148.8 ms. The after column below was measured again once contrast themes and the HUD mute hotkeys were on the branch too.

| Metric | Before (main) | After |
| --- | ---: | ---: |
| Cold start to first interactive | 148.8 ms | 131.7 ms |
| Channel switch | 7.9 ms | 6.4 ms |
| Initial message load | 44.9 ms | 36.3 ms |
| Scroll FPS | 62 | 61 |
| Input latency | 0.2 ms | 0.2 ms |
| Idle memory | 4.3 MB | 3.8 MB |
| Idle CPU | 0.6% | 0.5% |
| JS bundle | 1,111,422 bytes | 1,125,497 bytes |
| CSS bundle | 99,768 bytes | 99,768 bytes |

Cold-start samples before were 176.4, 148.5, 141.2, 148.8, and 168.9 ms. After were 175.4, 128.5, 131.7, 131.8, and 131.6 ms. Channel-switch samples after were 6.4, 5.9, 6.2, 6.5, and 7.0 ms. Message-load samples after were 49.3, 35.0, 34.6, 36.3, and 36.7 ms. Idle memory sat between 3.76 and 3.86 MB on every run. One main idle-CPU sample spiked to 63.9% while the other four stayed near 0.6%. The table uses the median.

The counted JS total is higher because split chunks are still summed. The first-paint files are smaller: `main` is 792,520 bytes and the shared `hud` chunk is 30,912 bytes. On main those were 841,372 and 110,799 bytes. The phrase catalog (81,264 bytes) and the late client chunk (36,542 bytes) load after the sample.

What this pass changed:

- French, Spanish, German, and Portuguese phrase tables load when the language is not English. English first paint does not parse that catalog.
- Settings, profiles, friends, inbox, mod view, game desk, and call tiles load after first paint. The benchmark waits 8 seconds, outside the idle sample. An empty call does not build camera or share tiles.
- Hover actions on a message mount on pointer or focus. The row paints text, avatar, and timestamp first. Right-click still opens the menu.
- The message window keeps two rows outside the viewport. Scrolling reuses rows by id. A pinned tail measures row heights on the next frame, after the newest messages are already on screen.
- Leaving a channel keeps the newest page and drops cached heights for the rest. The bench history is already one page, so that trim does not move the bench heap. The heap drop above is the smaller first paint.

Scroll stays on the display refresh. Input latency was already the cost of one composer event. Voice crypto was not changed. Dashboard tiles were already loaded only while the dashboard is open.
