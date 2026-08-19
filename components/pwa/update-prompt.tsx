"use client";

import { LogoMark } from "@/components/brand/logo";
import { useComic } from "@/lib/comic/store";
import { useInstall } from "@/lib/pwa/use-install";
import { useUpdate } from "@/lib/pwa/use-update";
import { applyUpdate, dismissUpdate } from "@/lib/pwa/update";

/**
 * Offer to take a newer build, shown on the landing page only.
 *
 * Applying an update reloads, and the reader holds the open comic in memory
 * alone, so the reader is the one place this must never appear. Even here a
 * comic can still be open behind the page, so the copy says what a reload
 * actually costs: the remembered page survives, the loaded file does not.
 *
 * Closing it leaves `UpdateHint` in the header, which is the way back.
 */
export function UpdatePrompt() {
  const { status } = useInstall();
  const { ready, dismissed } = useUpdate();
  const { status: comicStatus, fileName } = useComic();

  if (status !== "installed" || !ready || dismissed) return null;

  const comicOpen =
    comicStatus !== "idle" && comicStatus !== "error" && Boolean(fileName);

  return (
    <div
      className={
        // Clears the mobile tab bar on a narrow screen, which has no
        // equivalent on a wide one where there's no tab bar to clear.
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 " +
        "pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      }
    >
      <div
        role="status"
        className="animate-rise pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-raised/95 p-4 shadow-2xl backdrop-blur"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
            <LogoMark size={22} />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Nova versão disponível
            </p>
            <p className="text-sm leading-relaxed text-muted">
              {comicOpen
                ? "Atualizar reinicia o app. A página em que você parou fica salva, mas o arquivo aberto precisa ser escolhido de novo."
                : "Atualizar reinicia o app e leva só um instante."}
            </p>
          </div>

          <button
            type="button"
            onClick={dismissUpdate}
            aria-label="Dispensar aviso de atualização"
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismissUpdate}
            className="flex min-h-11 items-center rounded-full px-4 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Depois
          </button>
          <button
            type="button"
            onClick={applyUpdate}
            className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
