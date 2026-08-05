# Flowless Reader

A manga and comic reader by **Flowless**. Open a `.cbr` or `.cbz` and start
reading immediately: pages appear as the archive is read, and the file never
leaves the device.

The interface is in Brazilian Portuguese. Code, comments and docs are in English.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run verify   # typecheck + lint + tests
npm run build
```

`predev` and `prebuild` run `npm run sync:assets`, which copies the unrar
WebAssembly binary out of `node_modules` into `public/` and generates
`public/sw.js` from `scripts/sw.template.js` with a build ID stamped into its
cache names. Both files are generated and git-ignored.

Set `NEXT_PUBLIC_SITE_URL` for correct canonical and Open Graph URLs; without
it the app falls back to the deployment URL, then to the production default.

## How it works

Opening a comic never touches the network.

1. `components/reader/file-drop.tsx` hands the `File` to the store.
2. `lib/comic/store.tsx` spawns `lib/comic/decoder.worker.ts` and posts it the file.
3. The worker sniffs the container by magic bytes (`Rar!` or `PK`) rather than
   trusting the extension, since `.cbr` files are regularly ZIPs.
4. It lists the entries, drops the junk (`__MACOSX`, `Thumbs.db`,
   `ComicInfo.xml`), and sorts the rest into **reading** order. Digit runs
   compare numerically, so `page10.jpg` lands after `page2.jpg`.

### Memory

A comic reader that keeps every decoded page alive is a reader that kills the
tab. Decoding a single entry costs about the same as decoding it as part of a
full sequential pass (~10 ms either way on a 61-page RAR), and position in the
archive doesn't matter, so nothing is retained:

- The worker decodes only what the UI asks for and forgets it immediately.
- The UI keeps a window of pages around the current one, sized from
  `navigator.deviceMemory`, and revokes the rest.
- Anything evicted is re-requested if the reader comes back to it.
- A background pass builds one small WebP thumbnail per page for the rail.
  Those are cheap enough to keep for the whole session, and the pass yields to
  page requests so a page turn never waits behind it.

Measured on the 61-page test archive: resident full-size pages stay between 7
and 25 (about 20 MB) no matter how far you jump, instead of growing to the size
of the whole book.

> **Careful with `extractor.extract()`**: its generator must be drained to
> completion. node-unrar-js only closes the archive after its loop ends, so
> breaking out early — including an implicit `return` inside `for…of` — leaves
> the handle open and makes the *next* read fail. That symptom looks like every
> other page failing to decode.

### Reading

| Input | Action |
| --- | --- |
| `←` `→` | Turn the page (follows right-to-left mode) |
| `↑` `↓` `space` | Previous / next page |
| `Home` `End` | First / last page |
| `s` | Single page or two-page spread |
| `d` | Toggle right-to-left (manga) order |
| `t` | Toggle the thumbnail rail |
| `f` | Fullscreen |
| Swipe | Turn the page, when not zoomed |
| Pinch | Zoom about the point between your fingers |
| Double tap | Toggle between fitted and 2.5× |
| Drag | Pan a zoomed page, within bounds |
| `Ctrl`/`⌘` + wheel | Zoom; a plain wheel pans |
| Tap centre | Hide the chrome for full-bleed reading |

`components/reader/page-viewport.tsx` owns every gesture and derives its
transform from a zoom multiplier plus a pan offset, so a page that finishes
decoding, a rotated phone or a changed fit mode all re-fit on their own.

View preferences and the last page read are persisted, the latter capped at 100
archives and pruned least-recently-read first.

## Security

`next.config.ts` sets CSP, HSTS, `nosniff`, `frame-ancestors 'none'`, a
`Permissions-Policy` and cross-origin isolation headers, and disables
`X-Powered-By`.

`'unsafe-eval'` is granted **only** to `/_next/static/chunks/*`, because
node-unrar-js is an Emscripten build whose embind runtime calls `new Function`.
A dedicated worker takes its policy from its own response headers, and the
header is ignored on scripts loaded normally as subresources, so the page itself
never gets that privilege.

`lib/comic/types.ts` holds the input limits: maximum archive size, entry count,
per-page size, and total declared uncompressed size (a zip-bomb guard).

## Brand and PWA assets

Everything visual is generated from one source of truth; no binary icons are
checked in.

- `components/brand/logo.tsx` — the mark and wordmark used in the app.
- `app/icon.svg` — the favicon, mirroring the same geometry.
- `lib/og/brand.tsx` — the mark as an SVG string, shared by every generated image.
- `app/icons/{small,any,maskable}/route.tsx` — PNG launcher icons via `ImageResponse`.
- `app/screenshots/{wide,narrow}-{library,reader}/route.tsx` — install-prompt screenshots.
- `app/manifest.ts`, `scripts/sw.template.js` — manifest and offline app shell.

All are `force-static`, so they are generated once at build time.

The manifest only declares what is implemented: `file_handlers` is backed by
`components/pwa/file-handler.tsx` (`launchQueue`), and there is no "continue
reading" shortcut because a comic lives in memory for the session only.

## Layout

```
app/                  routes, metadata, manifest, generated imagery
components/brand/     logo and wordmark
components/reader/    drop target, reader shell, pan/zoom viewport, rail, toolbar
components/pwa/       service worker, install button, OS file handler
lib/comic/            decoder worker, entry sorting, client store, prefs
lib/og/               shared artwork for ImageResponse routes
scripts/              build-time asset generation
```
