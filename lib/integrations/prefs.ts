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
   * The Biblioteca: search and read comics from an online catalogue.
   *
   * Stored under its original key, so switching it on once keeps it on across
   * the rename.
   */
  hqnow: boolean;
};

const KEY = "flowless:integrations";

const DEFAULTS: Integrations = {
  hqnow: false,
};

const listeners = new Set<() => void>();

// `getSnapshot` has to be referentially stable between changes.
let cache: Integrations = DEFAULTS;
let loaded = false;

function read(): Integrations {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Integrations>;
    return {
      hqnow: typeof parsed.hqnow === "boolean" ? parsed.hqnow : DEFAULTS.hqnow,
    };
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
  cache = { ...getIntegrations(), [name]: enabled };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private-mode storage failures shouldn't stop the switch from working for
    // this session.
  }
  for (const listener of listeners) listener();
}
