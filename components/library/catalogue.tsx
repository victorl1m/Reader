"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  comic as fetchComic,
  covers as fetchCovers,
  popular,
  recent,
  search,
} from "@/lib/catalogue/actions";
import type { Comic, ComicSummary } from "@/lib/catalogue/api";
import { chapterLabel } from "@/lib/catalogue/format";
import { useOpenChapter } from "@/lib/catalogue/use-open-chapter";
import {
  getFavorites,
  getServerFavorites,
  setFavorite,
  subscribeFavorites,
} from "@/lib/comic/favorites";
import { COVER_WIDTH, optimized } from "@/lib/images";
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
 * How many results are shown. A common word answers with hundreds — "batman"
 * alone is 246 — and a grid that long is scrolling, not choosing. It is also
 * the number of cover lookups a search causes, since each one is its own
 * request upstream. The count below the grid says what was left out rather
 * than pretending this was all of it.
 */
const RESULT_LIMIT = 24;

/**
 * The Biblioteca: search, pick a comic, pick a chapter, read it.
 *
 * Which comic's detail is open lives in the URL (`?comic=<id>`) rather than in
 * local state: opening one pushes a history entry, so the back gesture — a
 * swipe, the hardware button, the browser's own back button — closes the
 * detail and lands back on the search/shelves screen instead of leaving the
 * Biblioteca entirely. A chapter opened from here still reads its pages from
 * memory only for the session; the query param is just metadata, refetched
 * from the catalogue whenever it's present.
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

  const router = useRouter();
  const searchParams = useSearchParams();
  const rawId = searchParams.get("comic");
  const parsedId = rawId ? Number(rawId) : NaN;
  const selectedId = Number.isFinite(parsedId) ? parsedId : null;

  /**
   * The card just clicked, so its detail shows a name and cover at once
   * instead of waiting on the fetch. Only the latest pick is kept — good
   * enough for "just navigated here", and it doesn't survive a remount
   * (leaving `/biblioteca` and coming back), which only costs that instant
   * paint. The detail still loads the same way it would cold.
   */
  const [pickedSummary, setPickedSummary] = useState<ComicSummary | null>(null);

  const openComic = useCallback(
    (comic: ComicSummary) => {
      setPickedSummary(comic);
      router.push(`/biblioteca?comic=${comic.id}`);
    },
    [router],
  );

  // Mirrors the button the reader tapped to get here: closing the detail is
  // the same action as the back gesture, so the two can never disagree.
  const closeComic = useCallback(() => router.back(), [router]);

  // Switching the Biblioteca off takes it off screen at once, along with
  // anything it was showing.
  if (!enabled) return <EnablePrompt />;

  return selectedId !== null ? (
    <ComicDetail
      key={selectedId}
      comicId={selectedId}
      cachedSummary={pickedSummary?.id === selectedId ? pickedSummary : null}
      onBack={closeComic}
    />
  ) : (
    <Browse onSelect={openComic} />
  );
}

// --------------------------------------------------------------- gate

function EnablePrompt() {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-6">
      <h1 className="text-2xl font-semibold">A Biblioteca está desligada</h1>
      <p className="text-muted">
        Com ela ligada, o Reader procura quadrinhos em um acervo online e abre
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

  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavorites,
    getServerFavorites,
  );

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

  // Memoised so the cover lookup below keys off the answer, not off renders.
  const shown = useMemo(() => results?.slice(0, RESULT_LIMIT) ?? null, [results]);
  const covers = useCovers(shown);

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
          ) : shown && shown.length ? (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((comic) => (
                  <li key={comic.id}>
                    <ComicCard
                      comic={comic}
                      cover={comic.cover ?? covers[comic.id] ?? null}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
              {results && results.length > RESULT_LIMIT ? (
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
          {favorites.length ? (
            <Shelf
              title="Favoritos"
              comics={favorites.map((favorite) => ({
                id: favorite.id,
                name: favorite.name,
                publisher: favorite.publisher,
                status: favorite.status,
                cover: favorite.cover,
              }))}
              onSelect={onSelect}
            />
          ) : null}
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

/**
 * Covers for comics that arrived without one.
 *
 * Search results have no cover in them, so they are fetched once the names are
 * already on screen and each card fills in as its own arrives. What has been
 * asked for is tracked in a ref rather than derived from the answers, so a
 * comic with genuinely no cover is asked about once and not on every render.
 */
function useCovers(comics: ComicSummary[] | null) {
  const [covers, setCovers] = useState<Record<number, string | null>>({});
  const asked = useRef(new Set<number>());

  useEffect(() => {
    if (!comics?.length) return;

    const wanted = comics
      .filter((comic) => !comic.cover && !asked.current.has(comic.id))
      .map((comic) => comic.id);
    if (!wanted.length) return;

    for (const id of wanted) asked.current.add(id);

    let live = true;
    fetchCovers(wanted).then((result) => {
      if (!live || !result.ok) return;
      setCovers((current) => {
        const next = { ...current };
        for (const { id, cover } of result.data) next[id] = cover;
        return next;
      });
    });

    return () => {
      live = false;
    };
  }, [comics]);

  return covers;
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
            <ComicCard comic={comic} cover={comic.cover} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComicCard({
  comic,
  cover,
  onSelect,
}: {
  comic: ComicSummary;
  /** Null while it is still being looked up, or if there simply isn't one. */
  cover: string | null;
  onSelect: (comic: ComicSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(comic)}
      className="group flex w-full flex-col gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span className="block aspect-[2/3] w-full overflow-hidden rounded-xl border border-border-subtle bg-surface">
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={optimized(cover, COVER_WIDTH)}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-end p-2">
            <span className="line-clamp-3 text-xs text-muted">{comic.name}</span>
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-sm text-foreground">{comic.name}</span>
      {[comic.publisher, comic.status].filter(Boolean).length ? (
        <span className="line-clamp-1 text-xs text-muted">
          {[comic.publisher, comic.status].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </button>
  );
}

// --------------------------------------------------------------- one comic

function ComicDetail({
  comicId,
  cachedSummary,
  onBack,
}: {
  comicId: number;
  /** The card just clicked, if this session has one, for an instant paint. */
  cachedSummary: ComicSummary | null;
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
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavorites,
    getServerFavorites,
  );

  useEffect(() => {
    let live = true;

    fetchComic(comicId).then((result) => {
      if (!live) return;
      setLoaded(
        result.ok
          ? { id: comicId, comic: result.data }
          : { id: comicId, error: result.error },
      );
    });

    return () => {
      live = false;
    };
  }, [comicId]);

  const current = loaded?.id === comicId ? loaded : null;
  const comic = current?.comic ?? null;
  const failed = current?.error ?? null;
  const name = comic?.name ?? cachedSummary?.name ?? null;
  const cover = comic?.cover ?? cachedSummary?.cover ?? null;
  const publisher = comic?.publisher ?? cachedSummary?.publisher ?? null;
  const status = comic?.status ?? cachedSummary?.status ?? null;

  const openChapter = useCallback(
    (chapterId: number) => {
      void open(chapterId, { comicId, comicName: name });
    },
    [open, comicId, name],
  );

  const favorite = favorites.some((entry) => entry.id === comicId);
  const toggleFavorite = useCallback(() => {
    setFavorite({ id: comicId, name: name ?? "Quadrinho", publisher, status, cover }, !favorite);
  }, [comicId, name, publisher, status, cover, favorite]);

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start rounded-full py-1 pl-1 pr-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon />
        Voltar à Biblioteca
      </button>

      {name ? (
        <div className="flex flex-col gap-5 sm:flex-row">
          {cover ? (
            <div className="w-32 shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-surface sm:w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimized(cover, COVER_WIDTH)}
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
                draggable={false}
              />
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 text-2xl font-semibold text-balance">{name}</h1>
              <button
                type="button"
                onClick={toggleFavorite}
                aria-pressed={favorite}
                aria-label={favorite ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
                className={`shrink-0 rounded-full p-2 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  favorite ? "text-brand" : "text-muted"
                }`}
              >
                <StarIcon filled={favorite} />
              </button>
            </div>
            <p className="text-sm text-muted">
              {[publisher, status].filter(Boolean).join(" · ")}
            </p>
            {comic?.synopsis ? (
              <p className="text-sm leading-relaxed text-muted text-pretty">
                {comic.synopsis}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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

function ChevronLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z" />
    </svg>
  );
}
