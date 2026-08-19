import { renderScreenshot } from "@/lib/og/screenshots";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Reader: abra um .cbr ou .cbz e comece a ler";

export default function OpenGraphImage() {
  return renderScreenshot("library", size.width, size.height);
}
