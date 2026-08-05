/** Messages sent from the UI thread into the decoder worker. */
export type WorkerRequest =
  | {
      type: "open";
      file: File;
      /** Page the reader will land on, so its window is decoded first. */
      startIndex: number;
    }
  | {
      type: "need";
      /** Full-size pages the UI wants resident, most important first. */
      indices: number[];
    };

/** Messages the decoder worker sends back. */
export type WorkerResponse =
  | {
      type: "meta";
      /** Archive file name, as picked by the user. */
      name: string;
      /** Detected container format. */
      format: ArchiveFormat;
      /** Page names in reading order; `pages[i]` is page number `i + 1`. */
      pages: string[];
    }
  | {
      type: "page";
      /** Index into the `pages` array from the `meta` message. */
      index: number;
      bytes: ArrayBuffer;
      /** MIME type inferred from the entry's extension. */
      mime: string;
    }
  | {
      type: "thumb";
      index: number;
      bytes: ArrayBuffer;
      mime: string;
    }
  | { type: "thumbs-progress"; ready: number; total: number }
  | { type: "thumbs-done" }
  | { type: "error"; message: string; code: ComicErrorCode };

export type ArchiveFormat = "rar" | "zip";

export type ComicErrorCode =
  | "unsupported-format"
  | "encrypted"
  | "no-pages"
  | "too-large"
  | "corrupt"
  | "unknown";

/** A single page as tracked on the UI thread. */
export type Page = {
  index: number;
  name: string;
  /**
   * Object URL for the full-size image, or `null` when the page is not
   * currently resident. Pages outside the retention window are evicted and
   * re-decoded on demand, so this flips back to `null` during a long read.
   */
  url: string | null;
  /** Object URL for the rail thumbnail. Retained for the whole session. */
  thumb: string | null;
};

export type ComicStatus = "idle" | "opening" | "ready" | "error";

/**
 * Hard limits. Comic archives are opened from disk with no server in the loop,
 * so the only thing standing between a malicious or malformed file and a dead
 * tab is this file.
 */
export const LIMITS = {
  /** Largest archive we'll read into memory. */
  maxArchiveBytes: 2 * 1024 * 1024 * 1024,
  /** Refuse absurd entry counts before allocating anything per-entry. */
  maxEntries: 5000,
  /** Largest single decoded page. */
  maxPageBytes: 256 * 1024 * 1024,
  /**
   * Largest total declared uncompressed size. Guards against a small archive
   * that claims to inflate to something enormous.
   */
  maxTotalUncompressedBytes: 8 * 1024 * 1024 * 1024,
} as const;

export const PAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".jpe",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
] as const;

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpe": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

export function mimeForName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot >= 0 && MIME_BY_EXT[name.slice(dot).toLowerCase()]) || "image/jpeg";
}

/**
 * Detects the real container. `.cbr` files are regularly ZIPs and `.cbz` files
 * are regularly RARs, so the extension is a hint, not an answer.
 */
export function detectFormat(head: Uint8Array): ArchiveFormat | null {
  const at = (i: number) => head[i];
  // "Rar!\x1a\x07" covers both RAR4 (…\x00) and RAR5 (…\x01\x00).
  if (
    at(0) === 0x52 &&
    at(1) === 0x61 &&
    at(2) === 0x72 &&
    at(3) === 0x21 &&
    at(4) === 0x1a &&
    at(5) === 0x07
  ) {
    return "rar";
  }
  // "PK", plus the local-file, empty- and spanned-archive record variants.
  if (at(0) === 0x50 && at(1) === 0x4b && [3, 5, 7].includes(at(2))) {
    return "zip";
  }
  return null;
}
