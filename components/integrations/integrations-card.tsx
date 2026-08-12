"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getIntegrations,
  getServerIntegrations,
  setIntegration,
  subscribeIntegrations,
} from "@/lib/integrations/prefs";

/**
 * Integrations, on the home screen.
 *
 * The reader opens files without a server, and that is the whole promise of it,
 * so anything that reaches out to the network is presented as what it is: named
 * third parties, off by default, switched on one at a time and switchable back
 * off in the same place. The copy says who is contacted rather than hiding it
 * behind "conectar".
 */
export function IntegrationsCard() {
  const integrations = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">Integrações</h2>
        <p className="text-sm text-muted">
          Opcionais e desligadas por padrão. Enquanto estiverem desligadas, o
          Flowless não fala com nenhum servidor.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Biblioteca</span>
            <span className="text-sm text-muted">
              Procurar e ler quadrinhos de um acervo online
            </span>
          </div>

          <Switch
            label="Biblioteca"
            on={integrations.hqnow}
            onChange={(on) => setIntegration("hqnow", on)}
          />
        </div>

        {integrations.hqnow ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <p className="text-xs text-muted">
              Ligada: as buscas e os capítulos passam pela internet. Seus arquivos
              continuam abrindo só no seu aparelho.
            </p>
            <Link
              href="/biblioteca"
              className="flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Abrir Biblioteca
            </Link>
          </div>
        ) : null}
      </div>
    </section>
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
        on ? "border-brand bg-brand" : "border-border-subtle bg-surface-raised"
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
