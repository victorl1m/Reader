import { renderIcon } from "@/lib/og/icon";

/**
 * 512×512 "maskable" icon. Launchers crop these to arbitrary shapes and only
 * guarantee the centre 80% circle, so the mark is scaled down into that zone.
 */
export function GET() {
  return renderIcon(512, 0.5);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
