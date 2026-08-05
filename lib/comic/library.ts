/**
 * Where each comic was left off.
 *
 * Keyed by file *name* and nothing else. The same issue re-downloaded, moved
 * between folders or re-saved by a different tool has a different size and
 * timestamp while still being the same read, and a key built from those loses
 * the position for no benefit. A name collision costs one wrong starting page.
 *
 * Only the name, the page and a timestamp are stored. The archive itself is
 * never written anywhere: it is read from disk by a worker and forgotten.
 */

export type Spot = {
  /** File name as the reader last picked it, kept for display. */
  name: string;
  index: number;
  /** Page count at the time, so a card can say "12 de 61" without the file. */
  total: number;
  /** Epoch millis of the last read, used for pruning and for "most recent". */
  at: number;
};

const PREFIX = "flowless:spot:v1:";
/** Positions keyed by name+size+mtime, from before this cache was name-keyed. */
const LEGACY_PREFIX = "flowless:position:v1:";
/** Cap on remembered positions, so storage can't grow without bound. */
const MAX_SPOTS = 100;

/** Names differing only in case or surrounding space are the same book. */
export const spotKey = (name: string) => `${PREFIX}${name.trim().toLowerCase()}`;

function parse(raw: string | null): Spot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Spot>;
    if (typeof value.index !== "number" || value.index < 0) return null;
    return {
      name: typeof value.name === "string" ? value.name : "",
      index: Math.floor(value.index),
      total: typeof value.total === "number" && value.total > 0 ? value.total : 0,
      at: typeof value.at === "number" ? value.at : 0,
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

export function rememberSpot(name: string, index: number, total: number, at: number) {
  try {
    const spot: Spot = { name, index, total, at };
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

// ------------------------------------------------------- most recent, as a store

/**
 * The most recently read comic, exposed as an external store.
 *
 * Read through `useSyncExternalStore` rather than an effect: the server has no
 * localStorage, so the card renders empty and fills in on hydration, without a
 * second render pass chasing it. The snapshot has to be referentially stable
 * between changes, hence the cache.
 */

const listeners = new Set<() => void>();
let cached: Spot | null = null;
let cacheValid = false;

function compute(): Spot | null {
  try {
    let best: Spot | null = null;
    for (const key of keys()) {
      const spot = parse(localStorage.getItem(key));
      if (spot && spot.name && (!best || spot.at > best.at)) best = spot;
    }
    return best;
  } catch {
    return null;
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

export function getLatestSpot(): Spot | null {
  if (!cacheValid) {
    cached = compute();
    cacheValid = true;
  }
  return cached;
}

export function getServerLatestSpot(): Spot | null {
  return null;
}
