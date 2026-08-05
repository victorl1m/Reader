import { PAGE_EXTENSIONS } from "./types";

/**
 * Junk that ships inside comic archives but isn't a page: macOS resource
 * forks, Windows thumbnail caches, and ComicRack metadata.
 */
function isJunk(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return (
    path.startsWith("__MACOSX/") ||
    path.includes("/__MACOSX/") ||
    name.startsWith("._") ||
    name === ".DS_Store" ||
    name.toLowerCase() === "thumbs.db" ||
    name.toLowerCase() === "comicinfo.xml"
  );
}

export function isPageEntry(path: string): boolean {
  if (isJunk(path)) return false;
  const lower = path.toLowerCase();
  return PAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Orders pages the way a human numbers them: `page2.jpg` before `page10.jpg`,
 * and `001b` right after `001`. Plain lexical sort gets both wrong, which is
 * how comic readers end up showing page 10 second.
 *
 * Digit runs compare numerically, everything else compares case-insensitively.
 * Paths are compared segment by segment so a chapter folder never interleaves
 * with the one next to it.
 */
export function compareNatural(a: string, b: string): number {
  const segA = a.split("/");
  const segB = b.split("/");
  const depth = Math.min(segA.length, segB.length);

  for (let i = 0; i < depth; i++) {
    // A directory always sorts before a file at the same level, so that a
    // trailing loose page can't jump ahead of a folder's contents.
    const lastA = i === segA.length - 1;
    const lastB = i === segB.length - 1;
    if (lastA !== lastB) return lastA ? 1 : -1;

    const cmp = compareChunked(segA[i], segB[i]);
    if (cmp !== 0) return cmp;
  }
  return segA.length - segB.length;
}

function compareChunked(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const ca = a.toLowerCase().match(re) ?? [];
  const cb = b.toLowerCase().match(re) ?? [];

  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    const x = ca[i];
    const y = cb[i];
    const xNum = /^\d/.test(x);
    const yNum = /^\d/.test(y);

    if (xNum && yNum) {
      // Compare as numbers, falling back to length so "01" and "1" are stable.
      const nx = Number(x);
      const ny = Number(y);
      if (nx !== ny) return nx - ny;
      if (x.length !== y.length) return x.length - y.length;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return ca.length - cb.length;
}

export function sortPages(paths: string[]): string[] {
  return [...paths].sort(compareNatural);
}
