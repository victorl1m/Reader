"use client";

import { useId, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useComic } from "@/lib/comic/store";
import {
  forgetSpot,
  getLatestSpot,
  getServerLatestSpot,
  subscribeSpots,
  type Spot,
} from "@/lib/comic/library";
import { useOpenFile } from "@/lib/comic/use-open-file";
import { useOpenChapter } from "@/lib/hqnow/use-open-chapter";
import {
  getIntegrations,
  getServerIntegrations,
  subscribeIntegrations,
} from "@/lib/integrations/prefs";

/**
 * "Continue reading", in two situations.
 *
 * While a comic is open in memory this is just a way back into it, so leaving
 * the reader doesn't look like the file was lost. After a reload there is no
 * file any more, only the remembered name and page, so the card names the comic
 * and asks for it again: positions are keyed by file name, so picking the same
 * comic lands on the same page even if it was re-downloaded in the meantime.
 */
export function ResumeCard() {
  const { status, fileName, index, total, close } = useComic();
  const { accept } = useOpenFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const spot = useSyncExternalStore(
    subscribeSpots,
    getLatestSpot,
    getServerLatestSpot,
  );

  const open = status !== "idle" && status !== "error" && Boolean(fileName);

  if (open) {
    return (
      <Card>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">
            {fileName}
          </span>
          <span className="text-sm text-muted">
            {total ? `Página ${index + 1} de ${total}` : "Abrindo…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            Fechar
          </button>
          <Link
            href="/read"
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-soft"
          >
            Continuar lendo
          </Link>
        </div>
      </Card>
    );
  }

  if (!spot) return null;

  return (
    <Card>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {spot.name}
        </span>
        <span className="text-sm text-muted">
          {spot.total
            ? `Você parou na página ${spot.index + 1} de ${spot.total}`
            : `Você parou na página ${spot.index + 1}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => forgetSpot(spot.name)}
          className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          Esquecer
        </button>

        {spot.source ? (
          <ResumeIntegration name={spot.name} source={spot.source} />
        ) : (
          <>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              className="sr-only"
              aria-label={`Abrir ${spot.name} outra vez`}
              onChange={(event) => {
                accept(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-soft"
            >
              Abrir de novo
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Resuming a comic that came from an integration.
 *
 * Unlike a local file this one *can* be fetched again, so the card asks for
 * nothing — unless the integration has since been switched off, in which case
 * the only honest offer is a way to switch it back on.
 */
function ResumeIntegration({
  name,
  source,
}: {
  /** Display name of the spot, which starts with the comic's own name. */
  name: string;
  source: NonNullable<Spot["source"]>;
}) {
  const enabled = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  ).hqnow;
  const { open, opening, failed } = useOpenChapter();

  if (!enabled) {
    return (
      <Link
        href="/hqs"
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-soft"
      >
        Ligar o HQ Now
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="text-sm text-brand">
          {failed}
        </span>
      ) : null}
      <button
        type="button"
        disabled={opening !== null}
        onClick={() =>
          void open(source.chapterId, {
            hqId: source.hqId,
            hqName: name.split(" — ")[0],
          })
        }
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-soft disabled:opacity-60"
      >
        {opening !== null ? "Abrindo…" : "Continuar lendo"}
      </button>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4">
      {children}
    </div>
  );
}
