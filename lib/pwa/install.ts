/**
 * Install-state store.
 *
 * Three things make this awkward enough to deserve its own module:
 *
 * - Only Chromium fires `beforeinstallprompt`. iOS Safari can install a PWA but
 *   offers no API for it, so it needs written instructions instead of a button.
 * - Whether the app is *already* installed is only knowable from the display
 *   mode, which can change at runtime. A browser tab of an installed app looks
 *   exactly like a tab of an app nobody ever installed, so the answer is
 *   remembered once we've seen it.
 * - The landing page is statically prerendered, so none of this can be read
 *   during render without a hydration mismatch. It's exposed as an external
 *   store so `useSyncExternalStore` can serve a neutral server snapshot.
 */

export type InstallStatus =
  /** Installed already — running as the app, or known to be on this device. */
  | "installed"
  /** The browser handed us a deferred prompt we can fire on demand. */
  | "installable"
  /** Installable by hand only (iOS Safari). */
  | "manual"
  /** No install path on this browser. */
  | "unsupported";

export type InstallSnapshot = {
  status: InstallStatus;
  /** True while a recent "not now" is still being respected. */
  dismissed: boolean;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "flowless:install-dismissed:v1";
/** How long "Agora não" is honoured before the banner may return. */
export const DISMISS_DAYS = 14;

/**
 * Remembers that the app is installed, so a later visit in a browser tab
 * doesn't offer to install it all over again.
 *
 * On iOS this only reaches as far as the storage bucket it was written in: a
 * home-screen app and Safari don't share one, so a flag set inside the app is
 * invisible to the tab that installed it. Nothing in the platform fixes that —
 * see the instructions path in `InstallPrompt`, which treats "Entendi" as an
 * answer instead.
 */
const INSTALLED_KEY = "flowless:installed:v1";

const SERVER_SNAPSHOT: InstallSnapshot = { status: "unsupported", dismissed: true };

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayModes = [
    "standalone",
    "minimal-ui",
    "fullscreen",
    "window-controls-overlay",
  ];
  if (displayModes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)) {
    return true;
  }
  // iOS Safari predates the display-mode media feature for home-screen apps.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * Reads the stored dismissal. Exported with an injectable clock so the expiry
 * window is testable.
 */
export function isDismissed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // Storage blocked: treat as never dismissed rather than hiding forever.
    return false;
  }
}

/** Reads the remembered install. Wrong only if the app was uninstalled. */
export function wasInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    // Storage blocked: fall back to what the display mode says right now.
    return false;
  }
}

// --- store -------------------------------------------------------------

const listeners = new Set<() => void>();
let deferred: InstallPromptEvent | null = null;
let installedFlag = false;
let started = false;
// `getSnapshot` must be referentially stable between changes.
let snapshot: InstallSnapshot = SERVER_SNAPSHOT;

/** Records (or clears) the remembered install and updates the live flag. */
function remember(installed: boolean) {
  installedFlag = installed;
  try {
    if (installed) localStorage.setItem(INSTALLED_KEY, "1");
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // Nothing to persist to; the answer lasts this session only.
  }
}

function compute(): InstallSnapshot {
  if (installedFlag || isStandalone()) return { status: "installed", dismissed: false };
  const dismissed = isDismissed();
  if (deferred) return { status: "installable", dismissed };
  if (isIos()) return { status: "manual", dismissed };
  return { status: "unsupported", dismissed };
}

function refresh() {
  const next = compute();
  if (next.status === snapshot.status && next.dismissed === snapshot.dismissed) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  installedFlag = wasInstalled();

  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppressing the mini-infobar is what lets us place the prompt ourselves.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    // Chromium withholds this event while the app is installed, so receiving it
    // is also how an uninstall becomes visible: forget what we remembered.
    if (installedFlag) remember(false);
    refresh();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    remember(true);
    refresh();
  });

  // Launching the installed app changes the display mode without a reload.
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", () => {
    if (isStandalone()) remember(true);
    refresh();
  });

  // Running as the app is the one unambiguous proof there is.
  if (isStandalone()) remember(true);

  snapshot = compute();
}

export function subscribeInstall(onChange: () => void) {
  start();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getInstallSnapshot(): InstallSnapshot {
  start();
  return snapshot;
}

export function getServerInstallSnapshot(): InstallSnapshot {
  return SERVER_SNAPSHOT;
}

export function dismissInstall(now: number = Date.now()) {
  try {
    localStorage.setItem(DISMISS_KEY, String(now));
  } catch {
    // Nothing to persist to; the banner simply returns next visit.
  }
  refresh();
}

/** Fires the browser's install prompt. Resolves once the user has answered. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  // The event is single-use whatever the user chooses.
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "dismissed") dismissInstall();
    refresh();
    return outcome;
  } catch {
    refresh();
    return "unavailable";
  }
}
