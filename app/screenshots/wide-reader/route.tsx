import { renderScreenshot } from "@/lib/og/screenshots";

/** Desktop install-prompt screenshot: the two-page spread reader. */
export function GET() {
  return renderScreenshot("reader", 1280, 800);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
