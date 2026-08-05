import { renderScreenshot } from "@/lib/og/screenshots";

/** Desktop install-prompt screenshot: the drop-a-comic entry screen. */
export function GET() {
  return renderScreenshot("library", 1280, 800);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
