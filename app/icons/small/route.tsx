import { renderIcon } from "@/lib/og/icon";

/** 192×192 launcher icon — the size Android and Lighthouse both expect. */
export function GET() {
  return renderIcon(192);
}

/** Generated once at build time — the artwork never varies per request. */
export const dynamic = "force-static";
