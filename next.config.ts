import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Security headers.
 *
 * There is deliberately no Content-Security-Policy. node-unrar-js is an
 * Emscripten build whose embind runtime calls `new Function(...)` while
 * registering its bindings, so the decoder needs `'unsafe-eval'` to start at
 * all. Granting that only to the worker doesn't work in practice: Chrome on
 * Android inherits the document's policy into dedicated workers, so any policy
 * strict enough to be worth having also stops the reader from opening a `.cbr`.
 *
 * The headers below still cover clickjacking, MIME sniffing, referrer leakage,
 * transport security and unwanted device APIs. If a CSP is wanted later, it
 * needs a decoder that isn't built with embind.
 */
const securityHeaders = [
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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  /**
   * Thumbnails for the Biblioteca's pages.
   *
   * A remote chapter has no thumbnail pass behind it — there is no decoder in
   * the loop to build one — and the catalogue's images carry no CORS header, so
   * the browser can neither fetch nor downscale them itself: drawing one to a
   * canvas taints it. The optimiser is the way out. It fetches server-side and
   * hands back a 96px copy of a page that is otherwise a megabyte, which is
   * what makes a rail of them affordable at all.
   *
   * Only this host, only these sizes: the endpoint is public, and an
   * unrestricted one is an open image proxy.
   */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static.hq-now.com", pathname: "/**" },
    ],
    imageSizes: [96],
    deviceSizes: [640],
    qualities: [60],
    // A page is read once and the rail is redrawn on every open; a long TTL
    // keeps the optimiser from re-fetching the same page all day.
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Documents must always be revalidated.
        //
        // Next serves prerendered HTML with `s-maxage` only, which leaves a
        // browser cache free to reuse it heuristically. A stored HTML response
        // replays its stored *headers* too, so a page cached under an old
        // security policy keeps enforcing that policy long after the server
        // stopped sending it. Revalidation is a 304 in the common case.
        source: "/:path*",
        has: [{ type: "header", key: "accept", value: ".*text/html.*" }],
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
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
