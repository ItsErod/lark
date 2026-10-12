# Plugins and themes moved to the store

Plugin and theme source is no longer part of the Lark download. The app runs with nothing installed. People add items from the store.

## New plugin

Put it in `store/plugins/<id>/`.

- `manifest.json` with `id`, `name`, `description`, `author`, `version`, `category`, `minLark`, `entry`, `icon`, and `changelog`
- The entry file named in the manifest. Use `plugin.js`
- `id` is a lowercase slug: `[a-z0-9][a-z0-9-]{0,63}`
- `version` and `minLark` are `major.minor.patch`
- The script stays on the existing plugin API (`onMessage`, `describe`, and `api`). It does not receive the token and it does not call the network

## New theme

Put it in `store/themes/<id>/`.

- `manifest.json` with the same fields
- `theme.css` as the entry
- The CSS rules are unchanged: one `:root` block, an optional `html.is-vibrancy` block, and no blur, animation, or remote URLs

## Index

Do not edit `store/index.json` by hand. From the repo root:

```sh
node scripts/build-store.mjs
```

CI checks that the index matches the folders. The pages workflow publishes that index, the files, and a zip for each item.

## In-flight pull requests

If a branch still adds `plugins/<id>.js` or `themes/<id>.css`, move that file into the folder above and add a manifest. The old directories are gone.
