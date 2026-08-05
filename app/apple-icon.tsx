import { renderIcon } from "@/lib/og/icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS applies its own squircle mask, so the background stays edge-to-edge. */
export default function AppleIcon() {
  return renderIcon(size.width);
}
