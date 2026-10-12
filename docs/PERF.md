# Performance

Lark is measured against a production build in Chromium, not the dev server. The harness is `npm run bench`. It loads `/?demo=1&bench=1` with the HTTP cache off, five times, and keeps the median. The bench flag paints 80 messages and 160 members so virtualization and history cost are part of the number. A normal session still opens 20 messages.

Scroll FPS is capped by the display. This machine vsyncs at 60.

Rust figures are the median of 21 debug runs from `cargo test -p lark-core boot_timing -- --nocapture`. They are microseconds for one pass, after a short warmup.

| Metric | Before | After |
| --- | ---: | ---: |
| Cold start to first interactive | 175.4 ms | |
| Channel switch | 7.9 ms | |
| Initial message load | 22.3 ms | |
| Scroll FPS | 61 | |
| Input latency | 0.5 ms | |
| Idle memory | 4.0 MB | |
| Idle CPU | 0.3% | |
| JS bundle | 839,410 bytes | |
| CSS bundle | 68,440 bytes | |
| Rust config parse | 472 µs | |
| Rust message-cache decode | 832 µs | |
| Rust gateway frame parse | 4 µs | |

Cold start is navigation to a visible message and a usable composer, with the splash out of the way. Channel switch is the in-page click on #welcome until that channel's messages are on screen. Initial message load is the landing channel's history paint (`lastLoad`). Input latency is the synchronous cost of one composer `input` event. Idle memory is `JSHeapUsedSize` after the interaction. Idle CPU is main-thread task time over the following second.

Before was recorded on 12 Oct 2026, Linux, Chromium 153, viewport 1280×800. Five cold-start samples were 215, 175.4, 172.1, 171.7, and 180 ms.
