/**
 * Comics starred from the Biblioteca, so they're easy to find again.
 *
 * Kept as one small blob rather than per-comic keys like `library.ts`: a
 * favorite is chosen on purpose and there's no expectation of ever having
 * enough of them to need pruning. A snapshot of the name/cover/publisher is
 * stored alongside the id so a shelf of favorites can be shown without a
 * round trip to the catalogue.
 *
 * Keyed by provider and id together — `hq-now`'s numeric ids and MangaDex's
 * UUIDs share no numbering, so the same id string could otherwise mean two
 * different comics.
 */

import type { Provider } from "./types";

export type Favorite = {
  id: string;
  provider: Provider;
  name: string;
  publisher: string | null;
  status: string | null;
  cover: string | null;
  /** Epoch millis when it was starred, for "most recently favorited" order. */
  at: number;
};

const KEY = "flowless:favorites:v1";

function favoriteKey(provider: Provider, id: string): string {
  return `${provider}:${id}`;
}

/** A number or a non-empty string, either way as a string — ids were numeric before providers existed. */
function toId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function read(): Record<string, Favorite> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Favorite>>;
    const result: Record<string, Favorite> = {};
    for (const value of Object.values(parsed)) {
      const id = toId(value.id);
      if (id === null || typeof value.name !== "string" || !value.name) continue;
      // Every favorite starred before MangaDex existed is one from hq-now.
      const provider: Provider = value.provider === "mangadex" ? "mangadex" : "hqnow";
      result[favoriteKey(provider, id)] = {
        id,
        provider,
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

function write(map: Record<string, Favorite>) {
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

/** Whether `(provider, id)` is among a snapshot from `getFavorites`. */
export function isFavorite(
  favorites: readonly Favorite[],
  provider: Provider,
  id: string,
): boolean {
  return favorites.some((favorite) => favorite.provider === provider && favorite.id === id);
}

export function setFavorite(
  comic: {
    id: string;
    provider: Provider;
    name: string;
    publisher?: string | null;
    status?: string | null;
    cover?: string | null;
  },
  on: boolean,
  at = Date.now(),
) {
  const map = read();
  const key = favoriteKey(comic.provider, comic.id);
  if (on) {
    map[key] = {
      id: comic.id,
      provider: comic.provider,
      name: comic.name,
      publisher: comic.publisher ?? null,
      status: comic.status ?? null,
      cover: comic.cover ?? null,
      at,
    };
  } else {
    delete map[key];
  }
  write(map);
  publish();
}
