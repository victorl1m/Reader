import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * `script-src` keeps `'unsafe-inline'` deliberately. Every route here is
 * statically prerendered, and Next inlines the RSC payload as `<script>` tags;
 * switching to a nonce means running middleware on every request, which would
 * make all of those routes dynamic. The app loads no third-party scripts and
 * renders no user-supplied HTML, so the directives that actually contain an
 * injection — `object-src`, `base-uri`, `frame-ancestors`, `form-action` — are
 * locked down instead.
 *
 * The unusual entries are all load-bearing:
 * - `'wasm-unsafe-eval'` — the unrar WebAssembly decoder.
 * - `worker-src blob:` — the bundled decoder worker.
 * - `img-src blob:` — decoded pages are handed to `<img>` as object URLs.
 *
 * Note that `'unsafe-eval'` is deliberately absent here and granted only to the
 * decoder worker, below.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  `connect-src 'self' blob: data:${isDev ? " ws: http://localhost:*" : ""}`,
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // The reader asks for a screen wake lock; nothing else is needed.
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "screen-wake-lock=(self)",
    ].join(", "),
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

/**
 * The decoder worker needs one privilege the page does not.
 *
 * node-unrar-js is an Emscripten build, and embind's runtime calls
 * `new Function(...)` while registering its bindings, so the worker cannot
 * start under a policy without `'unsafe-eval'`.
 *
 * A dedicated worker loaded from an http(s) URL takes its policy from its own
 * response headers, so this grant applies inside the worker only. On a chunk
 * loaded normally as a subresource the header is ignored — CSP applies to
 * documents and workers, not to individual scripts — so scoping it to the
 * chunk directory keeps `'unsafe-eval'` out of the page itself.
 */
const workerCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/_next/static/chunks/:path*",
        headers: [{ key: "Content-Security-Policy", value: workerCsp }],
      },
      {
        // The decoder wasm is content-stable for a given dependency version and
        // is re-synced on every build.
        source: "/unrar.wasm",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // The service worker must never be served stale, or a deploy can't
        // roll out.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
