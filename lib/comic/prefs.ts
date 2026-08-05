/**
 * Reading preferences, persisted to localStorage.
 *
 * Modelled as an external store rather than state hydrated inside an effect:
 * `useSyncExternalStore` renders the defaults on the server, swaps to the
 * stored values on the client without a flash of wrong layout, and keeps every
 * open tab of the reader consistent.
 */

export type FitMode = "height" | "width" | "original";

export type Prefs = {
  fit: FitMode;
  rtl: boolean;
  spread: boolean;
};

const KEY = "flowless:prefs";

const DEFAULTS: Prefs = { fit: "height", rtl: false, spread: false };
const FITS: FitMode[] = ["height", "width", "original"];

const listeners = new Set<() => void>();

// `getSnapshot` must return a referentially stable value between changes, so
// the parsed prefs are cached rather than re-read on every render.
let cache: Prefs = DEFAULTS;
let loaded = false;

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      fit: FITS.includes(parsed.fit as FitMode) ? (parsed.fit as FitMode) : DEFAULTS.fit,
      rtl: typeof parsed.rtl === "boolean" ? parsed.rtl : DEFAULTS.rtl,
      spread: typeof parsed.spread === "boolean" ? parsed.spread : DEFAULTS.spread,
    };
  } catch {
    // Corrupt JSON or blocked storage just means defaults.
    return DEFAULTS;
  }
}

export function subscribePrefs(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getPrefs(): Prefs {
  if (!loaded) {
    cache = read();
    loaded = true;
  }
  return cache;
}

export function getServerPrefs(): Prefs {
  return DEFAULTS;
}

export function setPrefs(patch: Partial<Prefs>) {
  cache = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private-mode storage failures shouldn't stop the setting from applying.
  }
  for (const listener of listeners) listener();
}
