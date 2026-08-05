"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registers the offline service worker and offers updates.
 *
 * The worker activates as soon as it installs, so a broken build can always be
 * replaced. Reloading, however, is never automatic: a reader part-way through a
 * comic holds it only in memory, and a surprise reload would throw it away.
 */
export function ServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  /**
   * Only a reload the reader asked for is allowed. A worker also takes control
   * on its very first activation, and reloading on that would discard a comic
   * that was already open.
   */
  const acceptedUpdate = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (disposed) return;
        registrationRef.current = registration;

        // A worker already parked here from a previous visit.
        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // Only an update: on a first install there is no controller yet.
            if (!navigator.serviceWorker.controller) return;
            if (installing.state === "installed" || installing.state === "activated") {
              setUpdateReady(true);
            }
          });
        });

        // Catch a build deployed while the tab was left open.
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            void registration.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
      } catch {
        // An unavailable service worker only costs offline support.
      }
    };

    let reloading = false;
    const onControllerChange = () => {
      if (!acceptedUpdate.current || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
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
      waiting.postMessage("skip-waiting");
      // `controllerchange` triggers the reload once the new worker takes over.
      return;
    }
    // Already activated; a plain reload picks it up.
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
