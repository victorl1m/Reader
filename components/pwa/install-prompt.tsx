"use client";

import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { useInstall } from "@/lib/pwa/use-install";
import { dismissInstall, promptInstall } from "@/lib/pwa/install";

/**
 * Invitation to install, shown only when the app is running in a browser tab
 * and the visitor hasn't recently said no.
 *
 * iOS Safari can install a PWA but exposes no API for it, so that path shows
 * the actual steps instead of a button that couldn't do anything.
 */
export function InstallPrompt() {
  const { status, dismissed } = useInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (dismissed) return null;
  if (status === "installed" || status === "unsupported") return null;

  const manual = status === "manual";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="dialog"
        aria-labelledby="install-prompt-title"
        className="animate-rise pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-raised/95 p-4 shadow-2xl backdrop-blur"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
            <LogoMark size={22} />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p id="install-prompt-title" className="text-sm font-medium text-foreground">
              Instale o Flowless
            </p>
            <p className="text-sm leading-relaxed text-muted">
              Abre em tela cheia, funciona offline e fica na sua tela de início.
            </p>
          </div>

          <button
            type="button"
            onClick={() => dismissInstall()}
            aria-label="Dispensar convite de instalação"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

        {manual && showSteps ? (
          <ol className="flex flex-col gap-2 rounded-xl bg-background p-3 text-sm text-muted">
            <li className="flex items-center gap-2">
              <span className="text-brand">1.</span>
              <span className="flex items-center gap-1.5">
                Toque em
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-label="Compartilhar"
                  role="img"
                >
                  <path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                </svg>
                <span className="text-foreground">Compartilhar</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-brand">2.</span>
              <span>
                Escolha{" "}
                <span className="text-foreground">Adicionar à Tela de Início</span>
              </span>
            </li>
          </ol>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => dismissInstall()}
            className="flex min-h-11 items-center rounded-full px-4 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => {
              if (manual) setShowSteps((open) => !open);
              else void promptInstall();
            }}
            aria-expanded={manual ? showSteps : undefined}
            className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {manual ? (showSteps ? "Entendi" : "Como instalar") : "Instalar"}
          </button>
        </div>
      </div>
    </div>
  );
}
