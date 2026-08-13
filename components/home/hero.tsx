"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getAllSpots,
  getServerAllSpots,
  subscribeSpots,
} from "@/lib/comic/library";

/**
 * The pitch, for people who haven't read anything here yet.
 *
 * Once there is a shelf, this is a paragraph explaining the app to someone who
 * is already using it, sitting between them and the thing they came back for.
 * So it goes away on the first read and comes back if they forget everything.
 *
 * Hidden by CSS rather than by returning `null`, because *when* it disappears
 * matters: whether anything has been read is in `localStorage`, which the
 * server cannot see, so React can only know after hydration and the hero would
 * flash on every visit. The inline script in `app/layout.tsx` sets the same
 * attribute before the first paint; this effect owns it from then on, so
 * forgetting the last comic brings the hero back without a reload.
 */
export function Hero() {
  const spots = useSyncExternalStore(subscribeSpots, getAllSpots, getServerAllSpots);
  const returning = spots.length > 0;

  useEffect(() => {
    const root = document.documentElement;
    if (returning) root.dataset.returning = "true";
    else delete root.dataset.returning;
  }, [returning]);

  return (
    <div data-hero className="flex flex-col gap-4">
      <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
        Seus quadrinhos abrem <span className="text-brand">na hora</span>, aqui no
        navegador
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted text-pretty">
        Arraste um <code className="font-mono text-[0.9em] text-foreground">.cbr</code>{" "}
        ou <code className="font-mono text-[0.9em] text-foreground">.cbz</code> e a
        leitura já começa na primeira página, enquanto o resto do arquivo ainda está
        abrindo. Sem cadastro, sem instalar nada.{" "}
        <strong className="font-semibold text-brand">
          E sem upload: quem abre o arquivo é o seu próprio navegador, então nenhuma
          página chega a servidor nenhum.
        </strong>
      </p>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        A página em que você parou e o seu jeito de ler ficam guardados só aqui, neste
        aparelho.
      </p>
    </div>
  );
}
