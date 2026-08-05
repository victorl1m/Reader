import { renderScreenshot } from "@/lib/og/screenshots";

/** Mobile install-prompt screenshot: the drop-a-comic entry screen. */
export function GET() {
  return renderScreenshot("library", 720, 1280);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
