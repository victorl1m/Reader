"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { comic as fetchComic, popular, recent, search } from "@/lib/catalogue/actions";
import type { Comic, ComicSummary } from "@/lib/catalogue/api";
import { chapterLabel } from "@/lib/catalogue/format";
import { useOpenChapter } from "@/lib/catalogue/use-open-chapter";
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
 * The Biblioteca: search, pick a comic, pick a chapter, read it.
 *
 * Everything here is one client component holding one screen's worth of state,
 * rather than a route per comic. The reader is an installable app whose comics
 * live in memory for the session, so a URL per comic would promise a permalink
 * it can't actually restore.
 *
 * Every request goes through a server action, so a stale answer can't be
 * cancelled mid-flight the way an aborted fetch could. Instead each answer
 * carries the question it answers and is dropped unless it is still the one on
 * screen — which is also what makes an out-of-order reply harmless.
 */
export function Catalogue() {
  const enabled = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  ).hqnow;

  const [selected, setSelected] = useState<ComicSummary | null>(null);

  // Switching the Biblioteca off takes it off screen at once, along with
  // anything it was showing.
  if (!enabled) return <EnablePrompt />;

  return selected ? (
    <ComicDetail summary={selected} onBack={() => setSelected(null)} />
  ) : (
    <Browse onSelect={setSelected} />
  );
}

// --------------------------------------------------------------- gate

function EnablePrompt() {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-6">
      <h1 className="text-2xl font-semibold">A Biblioteca está desligada</h1>
      <p className="text-muted">
        Com ela ligada, o Flowless procura quadrinhos em um acervo online e abre
        os capítulos aqui no leitor. Enquanto estiver desligada, nada sai deste
        aparelho.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIntegration("hqnow", true)}
          className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Ligar a Biblioteca
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

function Browse({ onSelect }: { onSelect: (comic: ComicSummary) => void }) {
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
    results?: ComicSummary[];
    error?: string;
  } | null>(null);
  /** The question in flight, so a slower earlier reply can be ignored. */
  const asked = useRef("");

  const [shelves, setShelves] = useState<{
    popular: ComicSummary[];
    recent: ComicSummary[];
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
    asked.current = query;

    search(query).then((result) => {
      if (asked.current !== query) return;
      setAnswer(
        result.ok ? { query, results: result.data } : { query, error: result.error },
      );
    });
  }, [query]);

  // The shelves are the empty state, so they are fetched once and kept.
  useEffect(() => {
    let live = true;

    Promise.all([popular(SHELF_SIZE), recent(SHELF_SIZE)]).then(([top, fresh]) => {
      if (!live) return;
      if (!top.ok || !fresh.ok) {
        setShelfError(top.ok ? (fresh.ok ? null : fresh.error) : top.error);
        return;
      }
      setShelves({ popular: top.data, recent: fresh.data });
    });

    return () => {
      live = false;
    };
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
          Procurar na Biblioteca
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
                {results.slice(0, RESULT_LIMIT).map((comic) => (
                  <li key={comic.id}>
                    <ComicRow comic={comic} onSelect={onSelect} />
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
          <Shelf title="Mais lidos" comics={shelves.popular} onSelect={onSelect} />
          <Shelf
            title="Atualizados há pouco"
            comics={shelves.recent}
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
  comics,
  onSelect,
}: {
  title: string;
  comics: ComicSummary[];
  onSelect: (comic: ComicSummary) => void;
}) {
  if (!comics.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {comics.map((comic) => (
          <li key={comic.id}>
            <ComicCard comic={comic} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComicCard({
  comic,
  onSelect,
}: {
  comic: ComicSummary;
  onSelect: (comic: ComicSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(comic)}
      className="group flex w-full flex-col gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span className="block aspect-[2/3] w-full overflow-hidden rounded-xl border border-border-subtle bg-surface">
        {comic.cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={comic.cover}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : null}
      </span>
      <span className="line-clamp-2 text-sm text-foreground">{comic.name}</span>
      {comic.publisher ? (
        <span className="text-xs text-muted">{comic.publisher}</span>
      ) : null}
    </button>
  );
}

function ComicRow({
  comic,
  onSelect,
}: {
  comic: ComicSummary;
  onSelect: (comic: ComicSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(comic)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-foreground">{comic.name}</span>
        <span className="truncate text-xs text-muted">
          {[comic.publisher, comic.status].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted" aria-hidden>
        →
      </span>
    </button>
  );
}

// --------------------------------------------------------------- one comic

function ComicDetail({
  summary,
  onBack,
}: {
  summary: ComicSummary;
  onBack: () => void;
}) {
  // Tagged with the comic it describes, so a detail still arriving for the
  // previous one is never mistaken for this one's. See `Browse`.
  const [loaded, setLoaded] = useState<{
    id: number;
    comic?: Comic;
    error?: string;
  } | null>(null);
  const { open, opening, failed: openFailed } = useOpenChapter();

  useEffect(() => {
    const id = summary.id;
    let live = true;

    fetchComic(id).then((result) => {
      if (!live) return;
      setLoaded(result.ok ? { id, comic: result.data } : { id, error: result.error });
    });

    return () => {
      live = false;
    };
  }, [summary.id]);

  const openChapter = useCallback(
    (chapterId: number) => {
      void open(chapterId, { comicId: summary.id, comicName: summary.name });
    },
    [open, summary.id, summary.name],
  );

  const current = loaded?.id === summary.id ? loaded : null;
  const comic = current?.comic ?? null;
  const failed = current?.error ?? null;
  const cover = comic?.cover ?? summary.cover;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start rounded-full px-1 text-sm text-muted transition-colors hover:text-foreground"
      >
        ← Voltar à Biblioteca
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
              referrerPolicy="no-referrer"
              draggable={false}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold text-balance">{summary.name}</h1>
          <p className="text-sm text-muted">
            {[comic?.publisher ?? summary.publisher, comic?.status ?? summary.status]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {comic?.synopsis ? (
            <p className="text-sm leading-relaxed text-muted text-pretty">
              {comic.synopsis}
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

      {!comic && !failed ? <Sweeping /> : null}

      {comic ? (
        comic.chapters.length ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">
              {comic.chapters.length === 1
                ? "1 capítulo"
                : `${comic.chapters.length} capítulos`}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {comic.chapters.map((chapter) => (
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
          <p className="text-muted">Esse quadrinho ainda não tem capítulos por aqui.</p>
        )
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------- bits

function Sweeping() {
  return (
    <div
      className="h-1 w-40 overflow-hidden rounded-full bg-surface-raised"
      role="status"
    >
      <div className="h-full w-1/3 rounded-full bg-brand animate-flow-sweep" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
