/**
 * Flowless Reader service worker.
 *
 * The app is a pure client-side reader — comics are opened from the user's own
 * disk — so offline support only needs the app shell and the RAR decoder wasm.
 * Nothing a user opens is ever cached.
 *
 * `BUILD` and `BUILD_ASSETS` are rewritten at build time by
 * `scripts/build-sw.mjs`, so a deploy always lands in a fresh cache instead of
 * serving the previous shell forever.
 */

const BUILD = "__BUILD_ID__";
const SHELL_CACHE = `flowless-shell-${BUILD}`;
const ASSET_CACHE = `flowless-assets-${BUILD}`;

/**
 * Every JS chunk the build produced.
 *
 * Caching these lazily is not enough. The decoder lives in a worker chunk that
 * is only fetched the first time a comic is opened, so a reader who installed
 * the app and then went offline had nothing to load: the shell came back but
 * picking a file failed. Precaching the build means the reader works offline
 * from the moment it is installed.
 */
const BUILD_ASSETS = __PRECACHE_ASSETS__;

/**
 * Routes that must work with no network at all.
 *
 * `/biblioteca` is here for its shell only. What fills it comes from the
 * network and is offline by definition when there is none; what this buys is
 * the page loading and saying so, instead of the reader landing on the generic
 * offline fallback.
 */
const SHELL_ROUTES = ["/", "/read", "/biblioteca"];
const PRECACHE = [
  ...SHELL_ROUTES,
  "/unrar.wasm",
  "/icon.svg",
  "/manifest.webmanifest",
  ...BUILD_ASSETS,
];

/** Runtime asset cache ceiling, so a long session can't grow without bound. */
const MAX_ASSET_ENTRIES = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Added one at a time: `addAll` rejects the whole batch if any single
      // request fails, which would leave the app with no offline shell at all.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      // Activate immediately rather than waiting for every tab to close.
      //
      // A waiting worker keeps serving its own caches, which means a bad build
      // can pin itself on a device indefinitely — including replaying stale
      // response headers from cached documents. Taking over at once is what
      // makes the app recoverable. The page never reloads on its own, so this
      // can't yank a comic away mid-read; assets are content-hashed, so mixing
      // old and new within a session is safe.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("flowless-") &&
              key !== SHELL_CACHE &&
              key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Lets the page trigger an immediate update instead of waiting for every tab
// to close.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // Cache keys are insertion-ordered, so the oldest are at the front.
  await Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
}

/** Network-first, falling back to the cached shell. Used for navigations. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ??
      (await caches.match("/read")) ??
      (await caches.match("/")) ??
      new Response(
        "<!doctype html><meta charset=utf-8><title>Offline</title>" +
          "<body style=\"background:#09090b;color:#fafafa;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0\">" +
          "<p>Você está offline. Reconecte e recarregue.</p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    );
  }
}

/** Cache-first. Used for build-hashed assets and the decoder wasm. */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(ASSET_CACHE).then(async (cache) => {
      await cache.put(request, copy);
      await trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
    });
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the worker itself; it is revalidated by Cache-Control.
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request));
});
