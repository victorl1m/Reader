"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registers the offline service worker and offers updates.
 *
 * Detecting an update is fiddlier than it looks. The worker calls
 * `skipWaiting()`, so a new build can go from `installing` to `activated`
 * before this component even mounts — by which point there is no `waiting`
 * worker left to notice and `updatefound` has already fired. Three signals are
 * watched so the prompt can't be missed:
 *
 * - a worker already `installing` or `waiting` when we register,
 * - `updatefound` for one that arrives later,
 * - `controllerchange`, which means a new worker took over regardless.
 *
 * Reloading is never automatic: a reader part-way through a comic holds it only
 * in memory, and a surprise reload would throw it away.
 */
export function ServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  /** Set only by the button, so an automatic takeover can't reload the page. */
  const acceptedUpdate = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;
    let reloading = false;
    /**
     * A first install also fires `controllerchange` when the worker claims the
     * page. That is not an update, so the initial state is remembered.
     */
    let hadController = Boolean(navigator.serviceWorker.controller);

    /** Flags a worker as an update once it reaches a usable state. */
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (disposed) return;
        // On a very first install there is no previous version to replace.
        if (!navigator.serviceWorker.controller) return;
        if (worker.state === "installed" || worker.state === "activated") {
          setUpdateReady(true);
        }
      };
      check();
      worker.addEventListener("statechange", check);
    };

    const onControllerChange = () => {
      if (acceptedUpdate.current) {
        if (!reloading) {
          reloading = true;
          window.location.reload();
        }
        return;
      }
      if (!hadController) {
        // The initial claim on a first install.
        hadController = true;
        return;
      }
      // A new worker took over on its own; the page's code is now stale.
      setUpdateReady(true);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void registrationRef.current?.update().catch(() => {});
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (disposed) return;
        registrationRef.current = registration;

        // An update already in flight before this component mounted.
        watch(registration.installing);
        watch(registration.waiting);

        registration.addEventListener("updatefound", () => {
          watch(registration.installing);
        });
      } catch {
        // An unavailable service worker only costs offline support.
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    // Catches a build deployed while the tab sat in the background.
    document.addEventListener("visibilitychange", onVisible);

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  const update = useCallback(() => {
    acceptedUpdate.current = true;
    const waiting = registrationRef.current?.waiting;
    if (waiting) {
      // `controllerchange` reloads once the new worker takes over.
      waiting.postMessage("skip-waiting");
      return;
    }
    // It already activated on its own; a plain reload picks up the new code.
    window.location.reload();
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-border-subtle bg-surface-raised px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm"
    >
      <span className="text-foreground">
        Uma nova versão do Flowless Reader está pronta.
      </span>
      <button
        type="button"
        onClick={update}
        className="flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Atualizar
      </button>
    </div>
  );
}
