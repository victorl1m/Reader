"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getIntegrations,
  getServerIntegrations,
  setIntegration,
  subscribeIntegrations,
} from "@/lib/integrations/prefs";

/**
 * Everything that changes how the reader behaves, rather than what it's
 * showing right now, collapsed behind one gear icon instead of living as a
 * permanent card on the home page.
 */
export function SettingsMenu() {
  const integrations = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  );
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Configurações"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
          open
            ? "bg-surface-raised text-foreground"
            : "text-muted hover:bg-surface-raised hover:text-foreground"
        }`}
      >
        <GearIcon />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Configurações"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-2xl"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">Biblioteca</span>
                <span className="text-xs text-muted">
                  Buscar e ler quadrinhos de um acervo online
                </span>
              </div>
              <Switch
                label="Biblioteca"
                on={integrations.hqnow}
                onChange={(on) => setIntegration("hqnow", on)}
              />
            </div>

            {integrations.hqnow ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    Somente Biblioteca
                  </span>
                  <span className="text-xs text-muted">
                    Esconde o seletor de arquivo local
                  </span>
                </div>
                <Switch
                  label="Somente Biblioteca"
                  on={integrations.libraryOnly}
                  onChange={(on) => setIntegration("libraryOnly", on)}
                />
              </div>
            ) : (
              <p className="border-t border-border-subtle pt-4 text-xs text-muted">
                Ligada, as buscas e os capítulos passam pela internet. Seus arquivos
                locais continuam abrindo só neste aparelho.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A switch, as a real button with `role="switch"` rather than a styled input. */
function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        on ? "border-brand bg-brand" : "border-border-subtle bg-surface"
      }`}
    >
      <span
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left,background-color] ${
          on ? "left-6 bg-black" : "left-0.5 bg-muted"
        }`}
        aria-hidden
      />
    </button>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
