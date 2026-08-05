"use client";

import { useInstall } from "@/lib/pwa/use-install";
import { useUpdate } from "@/lib/pwa/use-update";
import { applyUpdate } from "@/lib/pwa/update";

/**
 * Header hint that a newer version is waiting, in the slot the install button
 * would otherwise occupy — the two can never both apply, since one only shows
 * before the app is installed and the other only after.
 *
 * Unlike the banner this can't be dismissed: it is the thing left behind when
 * the banner is closed, so "Depois" doesn't have to mean "never tell me again".
 */
export function UpdateHint() {
  const { status } = useInstall();
  const { ready } = useUpdate();

  // Updates matter to the installed app, which has no address bar to reload
  // from. A browser tab picks up new code on its own next visit.
  if (status !== "installed" || !ready) return null;

  return (
    <button
      type="button"
      onClick={applyUpdate}
      aria-label="Atualizar para a nova versão"
      className="flex min-h-11 items-center gap-2 rounded-full border border-brand/50 bg-brand/10 px-4 text-sm font-medium text-brand transition-colors hover:bg-brand/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span aria-hidden className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
        <span className="relative h-2 w-2 rounded-full bg-brand" />
      </span>
      Atualizar
    </button>
  );
}
