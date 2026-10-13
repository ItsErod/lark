# Themes

Lark themes are CSS files that set colour and type variables. Layout, motion, and the frame cap stay in the app. The gallery in **Settings → Appearance** previews every installed theme and applies one with a click. The command palette entry is **Theme gallery**.

Themes are not part of the app download. The files live in `store/themes/<id>/`. Installing one writes it into the app config folder. A file you already have there is left alone, including one you edited. With nothing installed, the built-in colours in the app stylesheet stay on. They are the Minimal Mono palette: near-black surfaces, a white accent, and hairline edges.

| File | Look |
| --- | --- |
| `discord` | The default. Discord's dark palette: charcoal panels, blurple accent, Inter at Discord-like sizes. gg sans is not redistributable. |
| `modern-dark` | Warm ink and apricot. The previous default, still in the gallery. |
| `linear-dark` | Neutral zinc, indigo accent. The clean dark option if you want Linear or Vercel rather than Discord or warm ink. |
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
| `mono-oled` | Minimal Mono on pure black. White accent, hairline edges, unused pixels stay off. |
| `mono-graphite` | Minimal Mono on warm graphite. Warm-white accent, no apricot. |
| `mono-light` | Minimal Mono in daylight. White surfaces, black type, black accent. |
| `daylight` | Warm paper. |
| `ink-contrast` | The earlier bright-room black. `high-contrast` is the stricter one. |

`modern-dark`, `daylight`, and `ink-contrast` keep their original overlay shadow. Discord and the rest of the pack use a 1–2px shadow or a hairline, which is what the message list and the overlays read from `--shadow`.

Discord also sets the rail, channel, chat, and user-panel colours (`--bg-0` `#1e1f22`, `--bg-1` `#2b2d31`, `--bg-2` `#313338`, `--bg-panel` `#232428`), blurple `--accent` `#5865f2`, text `#dbdee1`, muted `#949ba4`, online `#23a55a`, and danger `#f23f43`. A theme can override `--hover`, `--selected`, `--message-hover`, `--highlight`, and `--scrollbar`. The server rail, channel rows, message hover, and thin scrollbars live in the app and follow those variables. A config that already names `modern-dark` stays on warm ink. A new config uses `discord`. Until that file is installed, the app shows the built-in Minimal Mono palette.

## What a file can contain

A theme is one `:root` block, plus an optional `html.is-vibrancy` block of the same kind of declarations:

- `color-scheme: dark` or `light`
- custom properties: `--bg-0` through `--bg-4`, `--bg-panel`, `--hover`, `--selected`, `--message-hover`, `--line`, `--text`, `--muted`, `--faint`, `--heading`, `--accent`, `--accent-ink`, `--accent-soft`, `--ok`, `--idle`, `--busy`, `--danger`, `--speak`, `--mention-bg`, `--mention-fg`, `--highlight`, `--highlight-bar`, `--link`, `--pill`, `--scrollbar`, `--scrollbar-hover`, `--shadow`, `--font`, `--mono`, `--emoji`
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

The font control still wins when it is System, Serif, or Mono. **Inter** means “use the theme”. Phosphor is the one shipped theme that sets a different `--font`. Discord uses Inter, which is the redistributable stand-in for Discord's face, at 16px with medium channel names and semibold headers.

## Frame rate

Themes do not schedule paints. Scrolling, the gallery, and overlays still follow the display, up to the 240 fps cap in Desktop settings. A still channel does not animate a theme.

## App tokens

Spacing, radii, elevation, type, icons, and motion live in `src/design.css`. A theme file does not set them. Colour still comes from the theme, and from Light, Ash, Dark, and Onyx.

The app uses an 8px spacing scale (`--space-1` 4px through `--space-9` 64px), radii from `--radius-xs` to `--radius-full`, elevation `--elev-1` through `--elev-3`, a type scale from `--text-xs` to `--text-2xl` with `--weight-regular` through `--weight-bold`, icon sizes `--icon-xs` through `--icon-lg`, and motion `--motion-fast` 120ms, `--motion-base` 160ms, `--motion-slow` 200ms on `--ease-out`. `prefers-reduced-motion: reduce` sets those durations to 0ms.

`--color-bg`, `--color-fg`, `--color-accent`, and the other colour aliases point at the existing theme variables (`--bg-0`, `--text`, `--accent`, and the rest). The gallery and the four colour modes keep owning the palette.
