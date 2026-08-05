<div align="center">

<img src="app/icon.svg" width="84" height="84" alt="Flowless Reader">

# Flowless Reader

**A manga and comic reader that runs entirely in your browser.**

Drop in a `.cbr` or `.cbz` and start reading immediately. Pages appear as the
archive is decoded, and the file never leaves your device.

[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-087ea4?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square)](#install-as-an-app)
[![No upload](https://img.shields.io/badge/uploads-zero-ff6a2b?style=flat-square)](#privacy)
[![License: MIT](https://img.shields.io/badge/License-MIT-3fb950?style=flat-square)](LICENSE)

### [→ Open the reader](https://m-reader-xi.vercel.app/)

[How it works](#how-it-works) · [Controls](#controls) · [Privacy](#privacy) · [Security](#security)

</div>

---

## Why

Most web comic readers ask you to upload your library to somebody's server
first. This one does not have a server in the loop at all: the archive is opened
by your own device, decoded page by page in a worker, and thrown away when the
tab closes. No account, no upload, no waiting for a 200 page book to finish
extracting before the first panel shows up.

The interface is in Brazilian Portuguese. Code, comments and docs are in English.

## Features

|  | |
| --- | --- |
| **Opens `.cbz` and `.cbr`** | ZIP via [fflate](https://github.com/101arrowz/fflate), RAR4/RAR5 via [node-unrar-js](https://github.com/YuJianrong/node-unrar.js) compiled to WebAssembly. The container is detected by magic bytes, because `.cbr` files are regularly ZIPs. |
| **First page in milliseconds** | Decoding is on demand, so the reader opens on the page you want instead of after the whole archive. |
| **Bounded memory** | A retention window sized from the device's reported memory keeps resident pages flat no matter how far you jump. |
| **Two reading modes** | One page at a time in a pan and zoom viewport, or the whole book as a continuous vertical strip. |
| **Manga order** | Right to left reading, single page or two page spread. |
| **Full gesture support** | Swipe, pinch to zoom, double tap, drag to pan, `Ctrl`/`⌘` + wheel. |
| **Thumbnail rail** | A background pass builds one small WebP per page so you can jump anywhere. |
| **Resumes where you stopped** | The last page of your 100 most recent books is remembered locally. |
| **Installable PWA** | Offline app shell, launcher icons, and OS level file handlers so a double clicked `.cbz` opens here. |
| **Layout that never jumps** | Every page box is reserved from the aspect ratio learned during the thumbnail pass. |

## Quick start

```bash
git clone https://github.com/victorl1m/m-reader.git
cd m-reader
npm install
npm run dev          # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run verify` | `typecheck` + `lint` + `test` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run sync:assets` | Copy the unrar WASM binary into `public/` and generate the service worker |

`predev` and `prebuild` run `sync:assets` for you. It copies the unrar
WebAssembly binary out of `node_modules` and generates `public/sw.js` from
`scripts/sw.template.js` with a build ID stamped into its cache names. Both
outputs are generated and git-ignored.

> [!TIP]
> Run a production build on `localhost` once and its service worker keeps
> controlling the origin, answering `next dev` with that build's chunks
> cache-first. The symptom is an error in a file you have already fixed, on a
> fresh server, because the stale chunk is mapped onto the new source.
> `components/pwa/service-worker.tsx` unregisters it in development, so a single
> reload clears it.

### Deploying

The live deployment is [m-reader-xi.vercel.app](https://m-reader-xi.vercel.app/).
Nothing but a static host and a Node runtime is required: there is no database,
no storage bucket and no API key, because there is no backend.

Set `NEXT_PUBLIC_SITE_URL` to the stable public origin so canonical and Open
Graph URLs are correct:

```
NEXT_PUBLIC_SITE_URL=https://m-reader-xi.vercel.app
```

Without it, `lib/site.ts` falls back to the deployment URL injected by the host
and then to a hardcoded default. On Vercel that host-injected value is the
per-deployment URL rather than the production alias, so leaving it unset makes
every deploy advertise a different canonical origin.

## Controls

| Input | Action |
| --- | --- |
| `←` `→` | Turn the page (follows right-to-left mode) |
| `↑` `↓` `space` | Previous / next page; a screenful in scroll mode |
| `Home` `End` | First / last page |
| `v` | Paged or continuous scroll |
| `w` | Strip width in scroll mode (100 / 80 / 62%) |
| `s` | Single page or two-page spread (paged mode) |
| `d` | Toggle right-to-left (manga) order |
| `t` | Toggle the thumbnail rail |
| `f` | Fullscreen |
| Swipe | Turn the page, when not zoomed |
| Pinch | Zoom about the point between your fingers |
| Double tap | Toggle between fitted and 2.5× |
| Drag | Pan a zoomed page, within bounds |
| `Ctrl`/`⌘` + wheel | Zoom; a plain wheel pans |
| Tap centre | Hide the chrome for full-bleed reading |

## How it works

Opening a comic never touches the network.

1. `components/reader/file-drop.tsx` hands the `File` to the store.
2. `lib/comic/store.tsx` spawns `lib/comic/decoder.worker.ts` and posts it the file.
3. The worker sniffs the container by magic bytes (`Rar!` or `PK`) rather than
   trusting the extension.
4. It lists the entries, drops the junk (`__MACOSX`, `Thumbs.db`,
   `ComicInfo.xml`), and sorts the rest into **reading** order. Digit runs
   compare numerically, so `page10.jpg` lands after `page2.jpg`.

### Memory

A comic reader that keeps every decoded page alive is a reader that kills the
tab. Decoding a single entry costs about the same as decoding it as part of a
full sequential pass (~10 ms either way on a 61 page RAR), and position in the
archive does not matter, so nothing is retained:

- The worker decodes only what the UI asks for and forgets it immediately.
- The UI keeps a window of pages around the current one, sized from
  `navigator.deviceMemory`, and revokes the rest.
- Anything evicted is re-requested if the reader comes back to it.
- A background pass builds one small WebP thumbnail per page for the rail.
  Those are cheap enough to keep for the whole session, and the pass yields to
  page requests so a page turn never waits behind it.

Measured on a 61 page test archive: resident full-size pages stay between 7 and
25 (about 20 MB) no matter how far you jump, instead of growing to the size of
the whole book.

> [!WARNING]
> **Careful with `extractor.extract()`**: its generator must be drained to
> completion. node-unrar-js only closes the archive after its loop ends, so
> breaking out early, including an implicit `return` inside `for…of`, leaves the
> handle open and makes the *next* read fail. That symptom looks like every
> other page failing to decode.

### Reading

There are two modes. **Paged** (`components/reader/page-viewport.tsx`) turns one
page at a time in a pan and zoom viewport. **Scroll**
(`components/reader/page-scroller.tsx`) joins the whole book into one vertical
strip and leans on native scrolling, because momentum, scroll anchoring and the
scrollbar are all things the browser does better than a hand-rolled transform.

The paged viewport owns every gesture and derives its transform from a zoom
multiplier plus a pan offset, so a page that finishes decoding, a rotated phone
or a changed mode all re-fit on their own. The scroller inverts the
relationship: the current page is *derived* from the scroll position, so the
counter, the rail and the saved position follow the reader's eye, while jumps
from outside (the rail, a keypress) scroll the strip instead.

Both modes reserve each page's box from the aspect ratio reported by the
thumbnail pass, which runs far ahead of full-size decoding, so a page arriving
never shoves the layout around.

## Privacy

Nothing leaves the device and no archive is ever written anywhere. Two things
are kept in `localStorage`:

- **Every setting** (`lib/comic/prefs.ts`): mode, reading direction, spread,
  rail, chrome, strip width. A setting that resets on the next open is a setting
  the reader has to apply again every session.
- **The last page read** (`lib/comic/library.ts`), keyed by file *name* alone.
  The same issue re-downloaded or moved has a different size and timestamp while
  still being the same read, so keying on those loses the position for no
  benefit. Capped at 100 archives, pruned least-recently-read first. The most
  recent one backs the "continue reading" card on the landing page, which asks
  for the file again and lands on the page it left off.

## Security

`next.config.ts` sets HSTS, `nosniff`, `X-Frame-Options: DENY`, a
`Permissions-Policy` and cross-origin isolation headers, and disables
`X-Powered-By`.

There is **no Content-Security-Policy**, deliberately. node-unrar-js is an
Emscripten build whose embind runtime calls `new Function(...)` while
registering its bindings, so the decoder needs `'unsafe-eval'` to start at all.
Granting that to the worker alone does not hold up: Chrome on Android inherits
the document policy into dedicated workers, so any policy strict enough to be
worth shipping also stops the reader from opening a `.cbr`. Adding a CSP back
requires a decoder that is not built with embind.

`lib/comic/types.ts` holds the input limits, the only thing standing between a
malformed or malicious archive and a dead tab:

| Limit | Value |
| --- | --- |
| Archive size | 2 GB |
| Entries | 5,000 |
| Single decoded page | 256 MB |
| Total declared uncompressed size (zip-bomb guard) | 8 GB |

## Install as an app

The manifest only declares what is implemented. `file_handlers` is backed by
`components/pwa/file-handler.tsx` using `launchQueue`, so the OS can hand a
`.cbz` straight to the reader. There is no "continue reading" shortcut, because
a comic lives in memory for the session only.

Everything visual is generated from one source of truth; no binary icons are
checked in.

- `components/brand/logo.tsx` — the mark and wordmark used in the app
- `app/icon.svg` — the favicon, mirroring the same geometry
- `lib/og/brand.tsx` — the mark as an SVG string, shared by every generated image
- `app/icons/{small,any,maskable}/route.tsx` — PNG launcher icons via `ImageResponse`
- `app/screenshots/{wide,narrow}-{library,reader}/route.tsx` — install prompt screenshots
- `app/manifest.ts`, `scripts/sw.template.js` — manifest and offline app shell

All are `force-static`, so they are generated once at build time.

## Project layout

```
app/                  routes, metadata, manifest, generated imagery
components/brand/     logo and wordmark
components/reader/    drop target, reader shell, viewport, scroller, rail, toolbar
components/pwa/       service worker, install button, OS file handler
lib/comic/            decoder worker, entry sorting, client store, prefs, positions
lib/og/               shared artwork for ImageResponse routes
scripts/              build-time asset generation
```

## Contributing

Issues and pull requests are welcome. Before opening one:

```bash
npm run verify
```

Two conventions worth knowing: all user-facing copy is Brazilian Portuguese
while code, comments and docs are English, and this repo tracks a version of
Next.js whose APIs may differ from what you remember, so `AGENTS.md` points at
the bundled docs in `node_modules/next/dist/docs/`.

## License

[MIT](LICENSE) © Victor Lima

The comics you open are your own files and are never part of this project.

<div align="center">
<sub>Built by <a href="https://github.com/victorl1m">Victor Lima</a> · Flowless</sub>
</div>
