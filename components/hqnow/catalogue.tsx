"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  HqNowError,
  chapterLabel,
  hqById,
  popularHqs,
  recentHqs,
  searchHqs,
  type Hq,
  type HqSummary,
} from "@/lib/hqnow/api";
import { useOpenChapter } from "@/lib/hqnow/use-open-chapter";
import {
  getIntegrations,
  getServerIntegrations,
  setIntegration,
  subscribeIntegrations,
} from "@/lib/integrations/prefs";

/** Typing pauses this long before the catalogue is asked anything. */
const DEBOUNCE_MS = 350;
/** Below this a search matches most of the catalogue and answers nothing. */
const MIN_QUERY = 2;
const SHELF_SIZE = 12;
/**
 * How many results are listed. A common word answers with hundreds — "batman"
 * alone is 246 — and a list that long is scrolling, not choosing. The count
 * below it says what was left out rather than pretending this was all of it.
 */
const RESULT_LIMIT = 60;

/**
 * The HQ Now catalogue: search, pick a comic, pick a chapter, read it.
 *
 * Everything here is one client component holding one screen's worth of state,
 * rather than a route per comic. The reader is a static, installable app with
 * no server of its own, and a chapter is opened into memory the same way a
 * dropped file is — so a URL per comic would promise a permalink the reader
 * can't actually restore.
 */
export function HqNowCatalogue() {
  const enabled = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  ).hqnow;

  const [selected, setSelected] = useState<HqSummary | null>(null);

  // Switching the integration off takes the catalogue off screen at once —
  // which also unmounts whatever was mid-request and aborts it.
  if (!enabled) return <EnablePrompt />;

  return selected ? (
    <HqDetail summary={selected} onBack={() => setSelected(null)} />
  ) : (
    <Browse onSelect={setSelected} />
  );
}

// --------------------------------------------------------------- gate

function EnablePrompt() {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-6">
      <h1 className="text-2xl font-semibold">A integração com o HQ Now está desligada</h1>
      <p className="text-muted">
        Com ela ligada, o Flowless procura quadrinhos no acervo do{" "}
        <span className="text-foreground">hq-now.com</span> e abre os capítulos aqui
        no leitor. Isso significa que o seu aparelho passa a falar com esse site —
        só enquanto a integração estiver ligada.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIntegration("hqnow", true)}
          className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Ligar a integração
        </button>
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-full border border-border-subtle px-5 text-sm text-muted transition-colors hover:text-foreground"
        >
          Voltar
        </Link>
      </div>
    </section>
  );
}

// --------------------------------------------------------------- browse

function Browse({ onSelect }: { onSelect: (hq: HqSummary) => void }) {
  const searchId = useId();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  /**
   * The last answer the catalogue gave, tagged with the query it answered.
   *
   * Held as one tagged value rather than as `results` + `busy` + `error` kept
   * in step by hand: an answer for a query the reader has since typed past is
   * simply not the current one, so "still searching" is something to derive
   * rather than a flag that can disagree with what is on screen.
   */
  const [answer, setAnswer] = useState<{
    query: string;
    results?: HqSummary[];
    error?: string;
  } | null>(null);

  const [shelves, setShelves] = useState<{
    popular: HqSummary[];
    recent: HqSummary[];
  } | null>(null);
  const [shelfError, setShelfError] = useState<string | null>(null);

  // Wait for a pause in typing before asking the catalogue anything.
  useEffect(() => {
    const trimmed = term.trim();
    const timer = window.setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (query.length < MIN_QUERY) return;

    const controller = new AbortController();

    searchHqs(query, controller.signal)
      .then((results) => setAnswer({ query, results }))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setAnswer({ query, error: message(cause) });
      });

    return () => controller.abort();
  }, [query]);

  // The shelves are the empty state, so they are fetched once and kept.
  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      popularHqs(SHELF_SIZE, controller.signal),
      recentHqs(SHELF_SIZE, controller.signal),
    ])
      .then(([popular, recent]) => setShelves({ popular, recent }))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setShelfError(message(cause));
      });

    return () => controller.abort();
  }, []);

  const searching = query.length >= MIN_QUERY;
  const current = answer?.query === query ? answer : null;
  const results = current?.results ?? null;
  const busy = searching && current === null;
  const failed = (searching ? current?.error : shelfError) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="text-sm text-muted">
          Procurar no acervo do HQ Now
        </label>
        <input
          id={searchId}
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Batman, Homem-Aranha, Sandman…"
          autoComplete="off"
          className="min-h-12 rounded-2xl border border-border-subtle bg-surface px-4 text-base text-foreground placeholder:text-muted focus:border-brand focus:outline-none"
        />
      </div>

      {failed ? (
        <p role="alert" className="text-sm text-brand">
          {failed}
        </p>
      ) : null}

      {searching ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">
            {busy ? "Procurando…" : `Resultados para “${query}”`}
          </h2>
          {busy ? (
            <Sweeping />
          ) : results && results.length ? (
            <>
              <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface">
                {results.slice(0, RESULT_LIMIT).map((hq) => (
                  <li key={hq.id}>
                    <HqRow hq={hq} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
              {results.length > RESULT_LIMIT ? (
                <p className="text-xs text-muted">
                  Mostrando {RESULT_LIMIT} de {results.length}. Escreva mais para
                  afinar a busca.
                </p>
              ) : null}
            </>
          ) : results ? (
            <p className="text-muted">
              Nada com esse nome. Tente escrever de outro jeito.
            </p>
          ) : null}
        </section>
      ) : shelves ? (
        <>
          <Shelf title="Mais lidos" hqs={shelves.popular} onSelect={onSelect} />
          <Shelf
            title="Atualizados há pouco"
            hqs={shelves.recent}
            onSelect={onSelect}
          />
        </>
      ) : failed ? null : (
        <Sweeping />
      )}
    </div>
  );
}

function Shelf({
  title,
  hqs,
  onSelect,
}: {
  title: string;
  hqs: HqSummary[];
  onSelect: (hq: HqSummary) => void;
}) {
  if (!hqs.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {hqs.map((hq) => (
          <li key={hq.id}>
            <HqCard hq={hq} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HqCard({
  hq,
  onSelect,
}: {
  hq: HqSummary;
  onSelect: (hq: HqSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(hq)}
      className="group flex w-full flex-col gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span className="block aspect-[2/3] w-full overflow-hidden rounded-xl border border-border-subtle bg-surface">
        {hq.cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={hq.cover}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : null}
      </span>
      <span className="line-clamp-2 text-sm text-foreground">{hq.name}</span>
      {hq.publisher ? (
        <span className="text-xs text-muted">{hq.publisher}</span>
      ) : null}
    </button>
  );
}

function HqRow({ hq, onSelect }: { hq: HqSummary; onSelect: (hq: HqSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(hq)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-foreground">{hq.name}</span>
        <span className="truncate text-xs text-muted">
          {[hq.publisher, hq.status].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted" aria-hidden>
        →
      </span>
    </button>
  );
}

// --------------------------------------------------------------- one comic

function HqDetail({ summary, onBack }: { summary: HqSummary; onBack: () => void }) {
  // Tagged with the comic it describes, so a detail still arriving for the
  // previous one is never mistaken for this one's. See `Browse`.
  const [loaded, setLoaded] = useState<{
    id: number;
    hq?: Hq;
    error?: string;
  } | null>(null);
  const { open, opening, failed: openFailed } = useOpenChapter();

  useEffect(() => {
    const controller = new AbortController();
    const id = summary.id;

    hqById(id, controller.signal)
      .then((hq) => setLoaded({ id, hq }))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setLoaded({ id, error: message(cause) });
      });

    return () => controller.abort();
  }, [summary.id]);

  const current = loaded?.id === summary.id ? loaded : null;
  const hq = current?.hq ?? null;
  const failed = current?.error ?? null;

  const openChapter = useCallback(
    (chapterId: number) => {
      void open(chapterId, { hqId: summary.id, hqName: summary.name });
    },
    [open, summary.id, summary.name],
  );

  const cover = hq?.cover ?? summary.cover;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start rounded-full px-1 text-sm text-muted transition-colors hover:text-foreground"
      >
        ← Voltar ao acervo
      </button>

      <div className="flex flex-col gap-5 sm:flex-row">
        {cover ? (
          <div className="w-32 shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-surface sm:w-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              draggable={false}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold text-balance">{summary.name}</h1>
          <p className="text-sm text-muted">
            {[hq?.publisher ?? summary.publisher, hq?.status ?? summary.status]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {hq?.synopsis ? (
            <p className="text-sm leading-relaxed text-muted text-pretty">
              {hq.synopsis}
            </p>
          ) : null}
        </div>
      </div>

      {failed ? (
        <p role="alert" className="text-sm text-brand">
          {failed}
        </p>
      ) : null}
      {openFailed ? (
        <p role="alert" className="text-sm text-brand">
          {openFailed}
        </p>
      ) : null}

      {!hq && !failed ? <Sweeping /> : null}

      {hq ? (
        hq.chapters.length ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">
              {hq.chapters.length === 1
                ? "1 capítulo"
                : `${hq.chapters.length} capítulos`}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {hq.chapters.map((chapter) => (
                <li key={chapter.id}>
                  <button
                    type="button"
                    onClick={() => openChapter(chapter.id)}
                    disabled={opening !== null}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-brand/60 hover:bg-surface-raised disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="truncate">{chapterLabel(chapter)}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {opening === chapter.id ? "Abrindo…" : "Ler"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-muted">Esse quadrinho ainda não tem capítulos no acervo.</p>
        )
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------- bits

function Sweeping() {
  return (
    <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-raised" role="status">
      <div className="h-full w-1/3 rounded-full bg-brand animate-flow-sweep" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

function message(cause: unknown): string {
  return cause instanceof HqNowError
    ? cause.message
    : "Algo deu errado ao falar com o HQ Now.";
}
