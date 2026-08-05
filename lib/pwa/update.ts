/**
 * Service-worker registration and update state.
 *
 * Detecting an update is fiddlier than it looks. The worker calls
 * `skipWaiting()`, so a new build can go from `installing` to `activated`
 * before anything on the page has looked — by which point there is no `waiting`
 * worker left to notice and `updatefound` has already fired. Three signals are
 * watched so an update can't be missed:
 *
 * - a worker already `installing` or `waiting` when we register,
 * - `updatefound` for one that arrives later,
 * - `controllerchange`, which means a new worker took over regardless.
 *
 * Reloading is never automatic: a reader part-way through a comic holds it only
 * in memory, and a surprise reload would throw it away. That is also why this
 * is a store rather than local state in the component that registers the
 * worker — an update noticed while reading has to survive the trip back to the
 * landing page, which is the only place it is offered.
 */

export type UpdateSnapshot = {
  /** A newer build is on the device, waiting for a reload. */
  ready: boolean;
  /** True after "Depois": the banner is gone, the header hint stays. */
  dismissed: boolean;
};

const SERVER_SNAPSHOT: UpdateSnapshot = { ready: false, dismissed: false };

const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | null = null;
let started = false;
let ready = false;
let dismissed = false;
/** Set only by `applyUpdate`, so an automatic takeover can't reload the page. */
let accepted = false;
let reloading = false;
// `getUpdateSnapshot` must be referentially stable between changes.
let snapshot: UpdateSnapshot = SERVER_SNAPSHOT;

function refresh() {
  if (ready === snapshot.ready && dismissed === snapshot.dismissed) return;
  snapshot = { ready, dismissed };
  for (const listener of listeners) listener();
}

function markReady() {
  if (ready) return;
  ready = true;
  refresh();
}

function reload() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

/**
 * Registers the worker and starts watching for newer builds. Idempotent, and a
 * no-op outside production — see the dev cleanup in `ServiceWorker`.
 */
export function startUpdates() {
  if (started || typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;
  started = true;

  /**
   * A first install also fires `controllerchange` when the worker claims the
   * page. That is not an update, so the initial state is remembered.
   */
  let hadController = Boolean(navigator.serviceWorker.controller);

  /** Flags a worker as an update once it reaches a usable state. */
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const check = () => {
      // On a very first install there is no previous version to replace.
      if (!navigator.serviceWorker.controller) return;
      if (worker.state === "installed" || worker.state === "activated") {
        markReady();
      }
    };
    check();
    worker.addEventListener("statechange", check);
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (accepted) {
      reload();
      return;
    }
    if (!hadController) {
      // The initial claim on a first install.
      hadController = true;
      return;
    }
    // A new worker took over on its own; the page's code is now stale.
    markReady();
  });

  // Catches a build deployed while the tab sat in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void registration?.update().catch(() => {});
  });

  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      // An update already in flight before this ran.
      watch(registration.installing);
      watch(registration.waiting);

      registration.addEventListener("updatefound", () => {
        watch(registration?.installing ?? null);
      });
    } catch {
      // An unavailable service worker only costs offline support.
    }
  };

  if (document.readyState === "complete") {
    void register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

export function subscribeUpdate(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getUpdateSnapshot(): UpdateSnapshot {
  return snapshot;
}

export function getServerUpdateSnapshot(): UpdateSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Hides the banner without applying the update.
 *
 * Deliberately not persisted. The only thing that clears `ready` is a load of
 * the new code, so anything longer-lived than this page would have to be
 * matched against a build id to avoid silencing a *later* update too. The
 * header hint stays either way, and closing the app applies the update by
 * itself: the new worker is already in control, so the next launch is new code.
 */
export function dismissUpdate() {
  if (dismissed) return;
  dismissed = true;
  refresh();
}

/** Takes the new build, reloading once it is in control. */
export function applyUpdate() {
  accepted = true;
  const waiting = registration?.waiting;
  if (waiting) {
    // `controllerchange` reloads once the new worker takes over.
    waiting.postMessage("skip-waiting");
    return;
  }
  // It already activated on its own; a plain reload picks up the new code.
  reload();
}
