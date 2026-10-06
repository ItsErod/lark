# Themes

Lark themes are CSS files that set colour and type variables. Layout, motion, and the frame cap stay in the app. The gallery in **Settings → Appearance** previews every installed theme and applies one with a click. The command palette entry is **Theme gallery**.

Shipped files live in `themes/`. On first launch, and whenever a new file is missing, Lark copies it into the app config folder. A file you already have there is left alone, including one you edited.

| File | Look |
| --- | --- |
| `linear-dark` | Neutral zinc, indigo accent. The clean dark default if you want Linear or Vercel rather than warm ink. |
| `linear-light` | White surfaces, zinc type, the same indigo. |
| `oled` | `#000000` panels so unused pixels stay off. Hairline edges, no shadow blur. |
| `nord` | Polar night and frost, from the Nord palette. |
| `tokyo-night` | Blue-black with a periwinkle accent. |
| `catppuccin-mocha` | Catppuccin Mocha: crust, mantle, mauve. |
| `catppuccin-latte` | Catppuccin Latte, the light pair of Mocha. |
| `dracula` | Dracula purple, with pink mentions. |
| `gruvbox` | Gruvbox dark, orange accent. |
| `synthwave` | Deep purple and hot pink. The neon is the colour. There is no glow blur. |
| `rgb` | Dark chassis, cyan accent, magenta mentions, lime online. The accent does not cycle. |
| `frosted` | Cool glass. On macOS and Windows it asks for native vibrancy. Everywhere else it stays opaque. |
| `phosphor` | Green on black. The UI uses the mono stack while the font setting is still Inter. |
| `high-contrast` | White and near-white type on black, yellow accent. Text pairs are at least 7:1. |
| `modern-dark` | The original warm ink and apricot. Still the config default. |
| `daylight` | Warm paper. |
| `ink-contrast` | The earlier bright-room black. `high-contrast` is the stricter one. |

`modern-dark` and `daylight` keep their original overlay shadow. New themes use a 1–2px shadow or a hairline, which is what the message list and the overlays read from `--shadow`.

## What a file can contain

A theme is one `:root` block, plus an optional `html.is-vibrancy` block of the same kind of declarations:

- `color-scheme: dark` or `light`
- custom properties: `--bg-0` through `--bg-4`, `--line`, `--text`, `--muted`, `--faint`, `--accent`, `--accent-ink`, `--accent-soft`, `--ok`, `--idle`, `--busy`, `--danger`, `--mention-bg`, `--mention-fg`, `--shadow`, `--font`, `--mono`, `--emoji`
- `--window-material: vibrancy` or `none`

`--bg-0`, `--text`, and `--accent` are required. The name of the file is the theme id: a lowercase slug, `[a-z0-9][a-z0-9-]{0,63}`.

These are refused, on import and when the desktop app writes a file:

- `backdrop-filter`, `blur(`, and `drop-shadow`
- `@keyframes`, `animation:`, and `will-change`
- `@import`, `url(`, and any selector other than `:root` or `html.is-vibrancy`
- a `--shadow` blur larger than 64px
- a file over 16 KB

The gallery cards are static. They set the theme's variables on a small tree and do not animate.

## Frosted glass

`frosted` sets `--window-material: vibrancy`. The desktop app turns on the system material and adds `is-vibrancy` on `<html>` only after that succeeds:

- **macOS:** `HudWindow` vibrancy, macOS 11 and newer.
- **Windows:** `MicaDark`, drawn by the desktop window manager. Windows 11. Windows 10 keeps the opaque colours.
- **Linux and the browser preview:** no native material. The opaque colours in `:root` are what you see.

The translucent colours live in `html.is-vibrancy` inside the theme file. The app does not use CSS `backdrop-filter`. The window itself is transparent so the system material can show through those panels. Other themes paint opaque backgrounds, so the transparent window does not show the desktop behind them.

Switching away from Frosted clears the effect.

## Import and export

Appearance has **Export CSS**, **Export JSON**, and **Import**.

CSS is the file format above. JSON is the same colours, plus the original CSS so a round trip does not drop the vibrancy block:

```json
{
  "name": "nord",
  "colorScheme": "dark",
  "material": "none",
  "vars": { "--bg-0": "#2e3440", "--text": "#eceff4", "--accent": "#88c0d0" },
  "css": "/* optional full file */"
}
```

A JSON file with only `name`, `colorScheme`, and `vars` is enough. `name` has to be a slug. On the desktop app, import writes `name.css` in the themes folder and applies it. In the browser preview, import keeps the theme in this browser only.

The theme editor still edits `--bg-0`, `--bg-2`, `--text`, and the accent live. Export includes those overrides. A per-server accent you set in the editor is included, and it replaces the theme accent in the app. Demo server colours do not, so Nord stays Nord on screen and in an export.

## Font

The font control still wins when it is System, Serif, or Mono. **Inter** means “use the theme”. Phosphor is the one shipped theme that sets a different `--font`.

## Frame rate

Themes do not schedule paints. Scrolling, the gallery, and overlays still follow the display, up to the 240 fps cap in Desktop settings. A still channel does not animate a theme.
