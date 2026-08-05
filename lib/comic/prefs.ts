/**
 * Every reading setting the user can change, persisted to localStorage.
 *
 * Modelled as an external store rather than state hydrated inside an effect:
 * `useSyncExternalStore` renders the defaults on the server, swaps to the
 * stored values on the client without a flash of wrong layout, and keeps every
 * open tab of the reader consistent.
 *
 * Anything the reader can toggle lives here, including the chrome and the rail.
 * A setting that resets on the next open is a setting the reader has to apply
 * again every session, which is indistinguishable from not having it.
 */

/** Paged turns one page at a time; scroll is one continuous vertical strip. */
export type ReadingMode = "page" | "scroll";

export type Prefs = {
  mode: ReadingMode;
  /** Right-to-left (manga) order. */
  rtl: boolean;
  /** Two pages side by side, paged mode only. */
  spread: boolean;
  /** Thumbnail rail open. */
  rail: boolean;
  /** Toolbar and rail shown at all, toggled by tapping the middle of a page. */
  chrome: boolean;
  /** Strip width in scroll mode, as a fraction of the viewport. */
  strip: number;
};

const KEY = "flowless:prefs";

const DEFAULTS: Prefs = {
  mode: "page",
  rtl: false,
  spread: false,
  rail: true,
  chrome: true,
  strip: 1,
};

const MODES: ReadingMode[] = ["page", "scroll"];

/** Offered widths for the vertical strip, widest first. */
export const STRIP_WIDTHS = [1, 0.8, 0.62] as const;

const listeners = new Set<() => void>();

// `getSnapshot` must return a referentially stable value between changes, so
// the parsed prefs are cached rather than re-read on every render.
let cache: Prefs = DEFAULTS;
let loaded = false;

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      mode: MODES.includes(parsed.mode as ReadingMode)
        ? (parsed.mode as ReadingMode)
        : DEFAULTS.mode,
      rtl: bool(parsed.rtl, DEFAULTS.rtl),
      spread: bool(parsed.spread, DEFAULTS.spread),
      rail: bool(parsed.rail, DEFAULTS.rail),
      chrome: bool(parsed.chrome, DEFAULTS.chrome),
      strip: (STRIP_WIDTHS as readonly number[]).includes(parsed.strip as number)
        ? (parsed.strip as number)
        : DEFAULTS.strip,
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

/** Cycles to the next offered strip width, wrapping at the narrowest. */
export function nextStripWidth(current: number): number {
  const at = (STRIP_WIDTHS as readonly number[]).indexOf(current);
  return STRIP_WIDTHS[(at + 1) % STRIP_WIDTHS.length];
}
