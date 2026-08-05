"use client";

import { useEffect } from "react";
import { startUpdates } from "@/lib/pwa/update";

/**
 * Registers the offline service worker. Renders nothing.
 *
 * This sits in the root layout so the worker is registered on every route, but
 * an update is only ever *offered* on the landing page: applying one reloads,
 * and a reload inside the reader would drop the comic held in memory. The state
 * lives in `lib/pwa/update`, which `UpdateHint` and `UpdatePrompt` read.
 */
export function ServiceWorker() {
  /**
   * In development, tear down anything a production build left behind.
   *
   * The worker serves assets cache-first, which is safe for a real build
   * because its chunk URLs are content-hashed. Dev chunk URLs are not: they are
   * stable paths whose contents change on every edit. So a worker installed by
   * one `next build && next start` on localhost keeps answering `next dev` with
   * the code from that build, and the browser shows a fixed file still failing —
   * a stale chunk mapped onto new sources, which reads as an impossible error.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (!registrations.length) return;

        const wasControlled = Boolean(navigator.serviceWorker.controller);
        await Promise.all(registrations.map((registration) => registration.unregister()));
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((key) => key.startsWith("flowless-")).map((key) => caches.delete(key)),
        );

        // Whatever is on screen came from the worker that was just removed, so
        // it has to be fetched again. Unregistering first means the reload can't
        // loop: the next load finds no registration and stops here.
        if (wasControlled) window.location.reload();
      } catch {
        // Nothing to clean up, or storage is unavailable.
      }
    })();
  }, []);

  useEffect(() => {
    startUpdates();
  }, []);

  return null;
}
