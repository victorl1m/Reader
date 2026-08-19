"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
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

type ShelfItem =
  | { kind: "comic"; comicId: number; comicName: string; spots: Spot[]; at: number }
  | { kind: "single"; spot: Spot; at: number };

/**
 * Chapters of the same comic folded into one entry.
 *
 * `spots` arrives most-recent-first (see `getAllSpots`), so building each
 * group in that same order keeps its chapters most-recent-first too, with no
 * second sort. A local file has no `source` — and so no comic id to group
 * by — and stays its own row, same as before.
 */
function groupSpots(spots: readonly Spot[]): ShelfItem[] {
  const groups = new Map<number, Spot[]>();
  const items: ShelfItem[] = [];

  for (const spot of spots) {
    if (!spot.source) {
      items.push({ kind: "single", spot, at: spot.at });
      continue;
    }

    const existing = groups.get(spot.source.comicId);
    if (existing) {
      existing.push(spot);
      continue;
    }

    const group: Spot[] = [spot];
    groups.set(spot.source.comicId, group);
    items.push({
      kind: "comic",
      comicId: spot.source.comicId,
      comicName: spot.name.split(" — ")[0],
      spots: group,
      at: spot.at,
    });
  }

  items.sort((a, b) => b.at - a.at);
  return items;
}

/**
 * Everything read on this device, most recent first, one HQ per entry.
 *
 * The storage behind it always held up to a hundred positions; only the last
 * one was ever shown. What each row can offer depends on where the comic came
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
  const items = useMemo(() => groupSpots(shelf), [shelf]);

  if (!items.length) return null;

  const shown = expanded ? items : items.slice(0, PREVIEW);
  const onFetch = (chapterId: number, fallback: { comicId: number; comicName: string }) =>
    void openChapter(chapterId, fallback);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Você já leu</h2>
        <p className="text-sm text-muted">
          {items.length === 1 ? "1 quadrinho" : `${items.length} quadrinhos`}, só
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
        {shown.map((item) =>
          item.kind === "comic" ? (
            <ComicFolder
              key={`comic-${item.comicId}`}
              comicName={item.comicName}
              spots={item.spots}
              library={library}
              opening={opening}
              onFetch={onFetch}
            />
          ) : (
            <SpotRow
              key={spotKey(item.spot.name)}
              spot={item.spot}
              library={library}
              opening={opening}
              onFetch={onFetch}
              onPick={() => {
                setWanted(item.spot.name);
                inputRef.current?.click();
              }}
            />
          ),
        )}
      </ul>

      {items.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="self-start rounded-full px-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          {expanded ? "Mostrar menos" : `Mostrar todos (${items.length})`}
        </button>
      ) : null}
    </section>
  );
}

/** Every chapter read of one comic, collapsed behind its name. */
function ComicFolder({
  comicName,
  spots,
  library,
  opening,
  onFetch,
}: {
  comicName: string;
  spots: Spot[];
  library: boolean;
  opening: number | null;
  onFetch: (chapterId: number, fallback: { comicId: number; comicName: string }) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-raised"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm text-foreground">{comicName}</span>
          <span className="text-xs text-muted">
            {spots.length === 1 ? "1 capítulo lido" : `${spots.length} capítulos lidos`}
          </span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <ul className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle bg-surface-raised/40 pl-4">
          {spots.map((spot) => (
            <SpotRow
              key={spotKey(spot.name)}
              spot={spot}
              label={chapterLabelOf(spot, comicName)}
              library={library}
              opening={opening}
              onFetch={onFetch}
              onPick={() => {}}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The chapter half of a remembered name, once the comic's own name is known. */
function chapterLabelOf(spot: Spot, comicName: string): string {
  const prefix = `${comicName} — `;
  return spot.name.startsWith(prefix) ? spot.name.slice(prefix.length) : spot.name;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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

function SpotRow({
  spot,
  label,
  library,
  opening,
  onFetch,
  onPick,
}: {
  spot: Spot;
  /** Shown instead of the full remembered name, once inside a comic's folder. */
  label?: string;
  library: boolean;
  opening: number | null;
  onFetch: (chapterId: number, fallback: { comicId: number; comicName: string }) => void;
  onPick: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-foreground">{label ?? spot.name}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {spot.total
            ? `Página ${spot.index + 1} de ${spot.total}`
            : `Página ${spot.index + 1}`}
          {spot.source && !label ? (
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
          onFetch={onFetch}
          onPick={onPick}
        />
      </div>
    </li>
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
