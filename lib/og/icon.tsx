import { ImageResponse } from "next/og";
import { BRAND, markDataUri } from "./brand";

/**
 * Renders the app icon at a given size.
 *
 * `scale` is the fraction of the canvas the mark occupies. Launcher icons use
 * ~0.72; maskable icons drop to ~0.5 so the mark stays inside the centre 80%
 * safe zone that maskable croppers guarantee.
 */
export function renderIcon(size: number, scale = 0.72) {
  const mark = Math.round(size * scale);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(145deg, ${BRAND.surfaceRaised} 0%, ${BRAND.bg} 70%)`,
        }}
      >
        <img src={markDataUri()} width={mark} height={mark} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
