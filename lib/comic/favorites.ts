/**
 * Comics starred from the Biblioteca, so they're easy to find again.
 *
 * Kept as one small blob rather than per-comic keys like `library.ts`: a
 * favorite is chosen on purpose and there's no expectation of ever having
 * enough of them to need pruning. A snapshot of the name/cover/publisher is
 * stored alongside the id so a shelf of favorites can be shown without a
 * round trip to the catalogue.
 */

export type Favorite = {
  id: number;
  name: string;
  publisher: string | null;
  status: string | null;
  cover: string | null;
  /** Epoch millis when it was starred, for "most recently favorited" order. */
  at: number;
};

const KEY = "flowless:favorites:v1";

function read(): Record<number, Favorite> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Favorite>>;
    const result: Record<number, Favorite> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (!Number.isFinite(id) || typeof value.name !== "string" || !value.name) {
        continue;
      }
      result[id] = {
        id,
        name: value.name,
        publisher: typeof value.publisher === "string" ? value.publisher : null,
        status: typeof value.status === "string" ? value.status : null,
        cover: typeof value.cover === "string" ? value.cover : null,
        at: typeof value.at === "number" ? value.at : 0,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function write(map: Record<number, Favorite>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage being unavailable only costs the favorites feature.
  }
}

// ------------------------------------------------------- as an external store

const listeners = new Set<() => void>();
const NONE: readonly Favorite[] = Object.freeze([]);
let cached: readonly Favorite[] = NONE;
let cacheValid = false;

function publish() {
  cacheValid = false;
  for (const listener of listeners) listener();
}

function compute(): readonly Favorite[] {
  const list = Object.values(read());
  if (!list.length) return NONE;
  list.sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
  return list;
}

export function subscribeFavorites(onChange: () => void) {
  listeners.add(onChange);
  // Another tab starring or unstarring a comic should be reflected here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY) publish();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Every favorited comic, most recently starred first. */
export function getFavorites(): readonly Favorite[] {
  if (!cacheValid) {
    cached = compute();
    cacheValid = true;
  }
  return cached;
}

export function getServerFavorites(): readonly Favorite[] {
  return NONE;
}

/** Whether `id` is among a snapshot from `getFavorites`. */
export function isFavorite(favorites: readonly Favorite[], id: number): boolean {
  return favorites.some((favorite) => favorite.id === id);
}

export function setFavorite(
  comic: {
    id: number;
    name: string;
    publisher?: string | null;
    status?: string | null;
    cover?: string | null;
  },
  on: boolean,
  at = Date.now(),
) {
  const map = read();
  if (on) {
    map[comic.id] = {
      id: comic.id,
      name: comic.name,
      publisher: comic.publisher ?? null,
      status: comic.status ?? null,
      cover: comic.cover ?? null,
      at,
    };
  } else {
    delete map[comic.id];
  }
  write(map);
  publish();
}
