/**
 * Remote images, resized by this origin.
 *
 * Catalogue images are megabyte-sized page scans on a host that sends no CORS
 * header, so the browser can neither fetch nor downscale them itself — drawing
 * one to a canvas taints it. The image optimiser is the way out: it fetches
 * server-side and answers with a copy the size we actually draw, which is also
 * what keeps a strip of thumbnails from costing more than the comic.
 *
 * The widths here have to match `images.imageSizes` in `next.config.ts`. The
 * optimiser refuses anything else, which is what stops the endpoint from being
 * a general-purpose image proxy.
 */

/** Page thumbnail in the reader's rail: 48px of rail at 2× density. */
export const THUMB_WIDTH = 96;
/** Cover in a catalogue grid, which is at most ~180px wide. */
export const COVER_WIDTH = 256;

export function optimized(url: string, width: number, quality = 60): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}
