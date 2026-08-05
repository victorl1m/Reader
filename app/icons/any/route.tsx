import { renderIcon } from "@/lib/og/icon";

/**
 * 512×512 "any" purpose PWA icon, referenced by `app/manifest.ts`. Rendered as
 * a route component so the artwork has a single source of truth
 * (`lib/og/brand`) rather than a checked-in binary that drifts from the design.
 */
export function GET() {
  return renderIcon(512);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
