"use client";

import { useInstall } from "@/lib/pwa/use-install";
import { promptInstall } from "@/lib/pwa/install";

/**
 * Compact install action for the header. Unlike the banner this ignores the
 * "not now" dismissal, so someone who waved the prompt away still has a way
 * back to it.
 *
 * Once the app is installed it stops appearing for good, and the header slot
 * belongs to `UpdateHint` instead.
 */
export function InstallButton() {
  const { status } = useInstall();

  // The manual (iOS) path has nothing to click here; the banner explains it.
  if (status !== "installable") return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="flex min-h-11 items-center rounded-full border border-border-subtle bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-brand/60 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      Instalar app
    </button>
  );
}
