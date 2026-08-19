/**
 * Which optional integrations the reader has turned on.
 *
 * Every integration here is off until someone switches it on, and that matters
 * more than a default usually does: the reader's promise is that opening a
 * comic touches no server at all, and an integration is precisely the thing
 * that breaks it — for one catalogue, on purpose, at the reader's request. So
 * the setting is stored and read exactly like the reading prefs (an external
 * store, so the server renders "off" and the client swaps in the real value
 * without a flash), and nothing in `lib/catalogue` is reached for until it is
 * on.
 */

export type Integrations = {
  /**
   * Quadrinhos: search and read Western comics from hq-now's catalogue.
   *
   * Stored under its original key, so switching it on once keeps it on across
   * the rename.
   */
  hqnow: boolean;
  /** Mangá and Manhwa: search and read from MangaDex. */
  mangadex: boolean;
  /**
   * Hides the local file picker/drop zone, for someone who only ever wants to
   * read from the Biblioteca. Meaningless with both providers off — nothing
   * would be left to open — so it's read as off whenever neither is on,
   * regardless of what was stored, rather than as a setting that could strand
   * the reader.
   */
  libraryOnly: boolean;
};

const KEY = "flowless:integrations";

const DEFAULTS: Integrations = {
  hqnow: false,
  mangadex: false,
  libraryOnly: false,
};

const listeners = new Set<() => void>();

// `getSnapshot` has to be referentially stable between changes.
let cache: Integrations = DEFAULTS;
let loaded = false;

/** `libraryOnly` never outlives every provider being off, however that happened. */
function normalize(parsed: Partial<Integrations>): Integrations {
  const hqnow = typeof parsed.hqnow === "boolean" ? parsed.hqnow : DEFAULTS.hqnow;
  const mangadex = typeof parsed.mangadex === "boolean" ? parsed.mangadex : DEFAULTS.mangadex;
  return {
    hqnow,
    mangadex,
    libraryOnly:
      (hqnow || mangadex) && typeof parsed.libraryOnly === "boolean"
        ? parsed.libraryOnly
        : DEFAULTS.libraryOnly,
  };
}

function read(): Integrations {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return normalize(JSON.parse(raw) as Partial<Integrations>);
  } catch {
    // Corrupt JSON or blocked storage means everything stays off, which is the
    // safe direction for a setting that decides whether a third party is
    // contacted at all.
    return DEFAULTS;
  }
}

export function subscribeIntegrations(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getIntegrations(): Integrations {
  if (!loaded) {
    cache = read();
    loaded = true;
  }
  return cache;
}

export function getServerIntegrations(): Integrations {
  return DEFAULTS;
}

export function setIntegration(name: keyof Integrations, enabled: boolean) {
  cache = normalize({ ...getIntegrations(), [name]: enabled });
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private-mode storage failures shouldn't stop the switch from working for
    // this session.
  }
  for (const listener of listeners) listener();
}
