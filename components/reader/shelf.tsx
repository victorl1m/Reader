"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useComic } from "@/lib/comic/store";
import {
  forgetSpot,
  getAllSpots,
  getServerAllSpots,
  spotKey,
  subscribeSpots,
  type Spot,
} from "@/lib/comic/library";
import { useOpenFile } from "@/lib/comic/use-open-file";
import { useOpenChapter } from "@/lib/catalogue/use-open-chapter";
import {
  getIntegrations,
  getServerIntegrations,
  subscribeIntegrations,
} from "@/lib/integrations/prefs";

/** Rows shown before the list is collapsed behind a "show all". */
const PREVIEW = 6;

/**
 * Everything read on this device, most recent first.
 *
 * The storage behind it always held up to a hundred comics; only the last one
 * was ever shown. What each row can offer depends on where the comic came
 * from: a chapter from the Biblioteca can simply be fetched again, while a
 * local file can only be asked for, because the archive itself was never
 * stored anywhere — which is the point.
 */
export function Shelf() {
  const spots = useSyncExternalStore(subscribeSpots, getAllSpots, getServerAllSpots);
  const { status, fileName } = useComic();
  const [expanded, setExpanded] = useState(false);

  const { accept } = useOpenFile();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Which row asked for a file, so the picker can name what it wants. */
  const [wanted, setWanted] = useState<string | null>(null);

  const { open: openChapter, opening, failed } = useOpenChapter();
  const library = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  ).hqnow;

  // The open comic has its own card above; listing it again would offer to
  // reopen something that is already open.
  const openKey =
    status !== "idle" && status !== "error" && fileName ? spotKey(fileName) : null;
  const shelf = spots.filter((spot) => spotKey(spot.name) !== openKey);

  if (!shelf.length) return null;

  const shown = expanded ? shelf : shelf.slice(0, PREVIEW);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Você já leu</h2>
        <p className="text-sm text-muted">
          {shelf.length === 1 ? "1 quadrinho" : `${shelf.length} quadrinhos`}, só
          neste aparelho
        </p>
      </div>

      {failed ? (
        <p role="alert" className="text-sm text-brand">
          {failed}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label={wanted ? `Abrir ${wanted} outra vez` : "Abrir um quadrinho"}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        {shown.map((spot) => (
          <li
            key={spotKey(spot.name)}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm text-foreground">{spot.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {spot.total
                  ? `Página ${spot.index + 1} de ${spot.total}`
                  : `Página ${spot.index + 1}`}
                {spot.source ? (
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    Biblioteca
                  </span>
                ) : null}
              </span>
              {spot.total ? <Progress spot={spot} /> : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => forgetSpot(spot.name)}
                aria-label={`Esquecer ${spot.name}`}
                className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
              >
                Esquecer
              </button>
              <Reopen
                spot={spot}
                library={library}
                opening={opening}
                onFetch={(chapterId, fallback) => void openChapter(chapterId, fallback)}
                onPick={() => {
                  setWanted(spot.name);
                  inputRef.current?.click();
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      {shelf.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="self-start rounded-full px-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          {expanded ? "Mostrar menos" : `Mostrar todos (${shelf.length})`}
        </button>
      ) : null}
    </section>
  );
}

/** How far in, at a glance. */
function Progress({ spot }: { spot: Spot }) {
  const done = Math.min(1, (spot.index + 1) / spot.total);
  return (
    <span
      className="mt-1 block h-0.5 w-full max-w-40 overflow-hidden rounded-full bg-surface-raised"
      aria-hidden
    >
      <span
        className="block h-full rounded-full bg-brand"
        style={{ width: `${Math.round(done * 100)}%` }}
      />
    </span>
  );
}

function Reopen({
  spot,
  library,
  opening,
  onFetch,
  onPick,
}: {
  spot: Spot;
  /** Whether the Biblioteca is currently switched on. */
  library: boolean;
  /** The chapter being fetched right now, if any. */
  opening: number | null;
  onFetch: (
    chapterId: number,
    fallback: { comicId: number; comicName: string },
  ) => void;
  onPick: () => void;
}) {
  const action =
    "rounded-full bg-brand px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-soft disabled:opacity-60";

  if (!spot.source) {
    return (
      <button type="button" onClick={onPick} className={action}>
        Abrir de novo
      </button>
    );
  }

  // Switched off, the only honest offer is a way to switch it back on.
  if (!library) {
    return <span className="px-2 text-xs text-muted">Ligue a Biblioteca</span>;
  }

  const source = spot.source;
  return (
    <button
      type="button"
      disabled={opening !== null}
      onClick={() =>
        onFetch(source.chapterId, {
          comicId: source.comicId,
          comicName: spot.name.split(" — ")[0],
        })
      }
      className={action}
    >
      {opening === source.chapterId ? "Abrindo…" : "Continuar"}
    </button>
  );
}
