import { renderScreenshot } from "@/lib/og/screenshots";

/** Mobile install-prompt screenshot: single-page reading with progress. */
export function GET() {
  return renderScreenshot("reader", 720, 1280);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
