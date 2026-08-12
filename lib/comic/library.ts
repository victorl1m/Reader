/**
 * Where each comic was left off.
 *
 * Keyed by file *name* and nothing else. The same issue re-downloaded, moved
 * between folders or re-saved by a different tool has a different size and
 * timestamp while still being the same read, and a key built from those loses
 * the position for no benefit. A name collision costs one wrong starting page.
 *
 * Only the name, the page and a timestamp are stored — plus, for a comic that
 * came from an integration rather than from disk, the ids needed to fetch it
 * again. The archive itself is never written anywhere: it is read from disk by
 * a worker and forgotten.
 */

import type { RemoteSource } from "./types";

export type Spot = {
  /** File name as the reader last picked it, kept for display. */
  name: string;
  index: number;
  /** Page count at the time, so a card can say "12 de 61" without the file. */
  total: number;
  /** Epoch millis of the last read, used for pruning and for "most recent". */
  at: number;
  /**
   * Absent for a local file, which can only be reopened by picking it again.
   * Present when the comic came from an integration, which can fetch it back.
   */
  source?: RemoteSource;
};

const PREFIX = "flowless:spot:v1:";
/** Positions keyed by name+size+mtime, from before this cache was name-keyed. */
const LEGACY_PREFIX = "flowless:position:v1:";
/** Cap on remembered positions, so storage can't grow without bound. */
const MAX_SPOTS = 100;

/** Names differing only in case or surrounding space are the same book. */
export const spotKey = (name: string) => `${PREFIX}${name.trim().toLowerCase()}`;

/**
 * A source only survives a round trip if it is still complete and numeric.
 *
 * `hqnow`/`hqId` is what the first version of this wrote. Reading it back costs
 * two lines and saves anyone who had already started a chapter from losing
 * their place to a rename.
 */
function parseSource(value: unknown): RemoteSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<RemoteSource> & { hqId?: unknown };
  if (source.kind !== "catalogue" && source.kind !== "hqnow") return undefined;
  if (typeof source.chapterId !== "number" || !Number.isFinite(source.chapterId)) {
    return undefined;
  }
  const comicId = source.comicId ?? source.hqId;
  return {
    kind: "catalogue",
    comicId:
      typeof comicId === "number" && Number.isFinite(comicId) ? comicId : 0,
    chapterId: source.chapterId,
  };
}

function parse(raw: string | null): Spot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Spot>;
    if (typeof value.index !== "number" || value.index < 0) return null;
    const source = parseSource(value.source);
    return {
      name: typeof value.name === "string" ? value.name : "",
      index: Math.floor(value.index),
      total: typeof value.total === "number" && value.total > 0 ? value.total : 0,
      at: typeof value.at === "number" ? value.at : 0,
      ...(source ? { source } : {}),
    };
  } catch {
    return null;
  }
}

function keys(): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
}

/** Drops the least recently read entries, plus anything from the old scheme. */
function prune() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key);
  }

  const all = keys();
  if (all.length <= MAX_SPOTS) return;

  const aged = all
    .map((key) => ({ key, at: parse(localStorage.getItem(key))?.at ?? 0 }))
    .sort((a, b) => a.at - b.at);

  for (const { key } of aged.slice(0, all.length - MAX_SPOTS)) {
    localStorage.removeItem(key);
  }
}

export function rememberSpot(
  name: string,
  index: number,
  total: number,
  at: number,
  source?: RemoteSource | null,
) {
  try {
    const spot: Spot = { name, index, total, at, ...(source ? { source } : {}) };
    localStorage.setItem(spotKey(name), JSON.stringify(spot));
    prune();
  } catch {
    // Storage being unavailable only costs the resume feature.
  }
  publish();
}

export function recallSpot(name: string): Spot | null {
  try {
    return parse(localStorage.getItem(spotKey(name)));
  } catch {
    return null;
  }
}

export function forgetSpot(name: string) {
  try {
    localStorage.removeItem(spotKey(name));
  } catch {
    // Nothing to do: the entry either isn't there or can't be reached.
  }
  publish();
}

// ------------------------------------------------------- the shelf, as a store

/**
 * Everything remembered, most recently read first, exposed as an external
 * store.
 *
 * Read through `useSyncExternalStore` rather than an effect: the server has no
 * localStorage, so the shelf renders empty and fills in on hydration, without a
 * second render pass chasing it. The snapshot has to be referentially stable
 * between changes, hence the cache — and it is the *list* that is cached, so
 * that "the most recent one" is just its first entry rather than a second
 * snapshot that could drift out of step with it.
 */

const listeners = new Set<() => void>();
/** Shared empty snapshot, so an empty shelf is still referentially stable. */
const NONE: readonly Spot[] = Object.freeze([]);
let cached: readonly Spot[] = NONE;
let cacheValid = false;

function compute(): readonly Spot[] {
  try {
    const spots: Spot[] = [];
    for (const key of keys()) {
      const spot = parse(localStorage.getItem(key));
      if (spot && spot.name) spots.push(spot);
    }
    if (!spots.length) return NONE;
    // Most recent first, and stable for two reads at the same millisecond.
    spots.sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
    return spots;
  } catch {
    return NONE;
  }
}

function publish() {
  cacheValid = false;
  for (const listener of listeners) listener();
}

export function subscribeSpots(onChange: () => void) {
  listeners.add(onChange);
  // Another tab reading the same comic moves the position too.
  const onStorage = () => publish();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Every remembered comic, most recently read first. */
export function getAllSpots(): readonly Spot[] {
  if (!cacheValid) {
    cached = compute();
    cacheValid = true;
  }
  return cached;
}

export function getServerAllSpots(): readonly Spot[] {
  return NONE;
}

export function getLatestSpot(): Spot | null {
  return getAllSpots()[0] ?? null;
}

export function getServerLatestSpot(): Spot | null {
  return null;
}
