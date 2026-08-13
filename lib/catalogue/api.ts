/**
 * The catalogue behind the Biblioteca: HQ Now's public GraphQL API.
 *
 * This module runs on the server only — it is reached through the actions in
 * `./actions.ts`, never from a component — so the browser talks to this origin
 * and nothing else. Keeping it here rather than in the browser also means the
 * catalogue's shape is ours to normalise before anything reaches a component.
 *
 * The queries below are the ones the source site issues, kept verbatim in shape
 * so a schema change breaks here in an obvious way rather than silently
 * returning nulls.
 */

const ENDPOINT = "https://admin.hq-now.com/graphql";

/** A catalogue that stops answering must not hang a request forever. */
const TIMEOUT_MS = 15_000;

/** Anything a caller can show to the reader as-is. */
export class CatalogueError extends Error {}

/**
 * What an action answers with.
 *
 * A thrown error does not survive the trip from a server action to the
 * browser: React replaces the message with a generic one in production, which
 * is right for a stack trace and useless for "that chapter has no pages". So
 * failure is a value here, and it is the only kind a component ever sees.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// --------------------------------------------------------------- shapes

/** A comic as it appears in a list: enough to identify and open it. */
export type ComicSummary = {
  id: number;
  name: string;
  publisher: string | null;
  status: string | null;
  /** Absent from search results, which the catalogue answers without covers. */
  cover: string | null;
};

export type ComicChapter = {
  id: number;
  /** Issue number as text: it can be negative (annuals) or fractional. */
  number: string;
  name: string | null;
};

export type Comic = ComicSummary & {
  synopsis: string | null;
  chapters: ComicChapter[];
};

/** A chapter with its pages resolved: what the reader actually opens. */
export type Chapter = {
  id: number;
  name: string | null;
  number: string | null;
  oneshot: boolean;
  comicId: number | null;
  comicName: string | null;
  /** Page image URLs in reading order. */
  pages: string[];
};

// --------------------------------------------------------------- plumbing

/**
 * Forces a URL to HTTPS, or rejects it.
 *
 * Every image the catalogue reports is served from an `http://` host that also
 * answers over HTTPS. Left alone those are blocked as mixed content — the app
 * is HTTPS — so the page would be a permanent spinner. Anything that isn't
 * plain http(s) (a `javascript:` URL above all) is dropped instead of upgraded.
 */
export function secureUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

type GraphQLPayload = {
  data?: Record<string, unknown> | null;
  errors?: { message?: string }[];
};

async function query(
  document: string,
  variables: Record<string, unknown>,
  field: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // The catalogue is public and this is a third party: send it nothing
      // beyond the request itself, and never cache someone else's shelf.
      credentials: "omit",
      referrer: "",
      cache: "no-store",
    });
  } catch (cause) {
    throw new CatalogueError(
      cause instanceof DOMException && cause.name === "TimeoutError"
        ? "A biblioteca demorou demais para responder. Tente de novo."
        : "Não foi possível falar com a biblioteca agora.",
    );
  }

  if (!response.ok) {
    throw new CatalogueError(`A biblioteca respondeu com erro (${response.status}).`);
  }

  let payload: GraphQLPayload;
  try {
    payload = (await response.json()) as GraphQLPayload;
  } catch {
    throw new CatalogueError("A biblioteca respondeu algo que não deu para entender.");
  }

  if (payload.errors?.length) {
    throw new CatalogueError(
      text(payload.errors[0]?.message) ?? "A biblioteca recusou a consulta.",
    );
  }

  return payload.data?.[field] ?? null;
}

// --------------------------------------------------------------- normalising

function toSummary(raw: unknown): ComicSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = int(row.id ?? row.hqId);
  const name = text(row.name);
  if (id === null || !name) return null;
  return {
    id,
    name,
    publisher: text(row.publisherName),
    status: text(row.status),
    cover: secureUrl(row.hqCover),
  };
}

function toSummaries(raw: unknown): ComicSummary[] {
  return list(raw)
    .map(toSummary)
    .filter((comic): comic is ComicSummary => comic !== null);
}

/**
 * Chapters in reading order.
 *
 * `number` is text and regularly isn't a plain integer: annuals come through
 * negative, tie-ins fractional. Sorting numerically puts those where a reader
 * expects them; anything unparseable keeps the order the catalogue gave.
 */
function toChapters(raw: unknown): ComicChapter[] {
  const chapters = list(raw)
    .map((entry, position) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = int(row.id);
      if (id === null) return null;
      const number = text(row.number) ?? "";
      const parsed = Number.parseFloat(number);
      return {
        chapter: { id, number, name: text(row.name) } satisfies ComicChapter,
        order: Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER,
        position,
      };
    })
    .filter((entry) => entry !== null);

  chapters.sort((a, b) => a.order - b.order || a.position - b.position);
  return chapters.map((entry) => entry.chapter);
}

// --------------------------------------------------------------- queries

const SEARCH = `query getHqsByName($name: String!) {
  getHqsByName(name: $name) {
    id
    name
    status
    publisherName
    impressionsCount
  }
}`;

const BY_FILTERS = `query getHqsByFilters($orderByViews: Boolean, $limit: Int, $loadCovers: Boolean) {
  getHqsByFilters(orderByViews: $orderByViews, limit: $limit, loadCovers: $loadCovers) {
    id
    name
    status
    publisherName
    hqCover
  }
}`;

const RECENT = `query getRecentlyUpdatedHqs {
  getRecentlyUpdatedHqs {
    id
    name
    hqCover
  }
}`;

const BY_ID = `query getHqsById($id: Int!) {
  getHqsById(id: $id) {
    id
    name
    synopsis
    status
    publisherName
    hqCover
    capitulos {
      id
      name
      number
    }
  }
}`;

const CHAPTER = `query getChapterById($chapterId: Int!) {
  getChapterById(chapterId: $chapterId) {
    name
    number
    oneshot
    pictures {
      pictureUrl
    }
    hq {
      id
      name
    }
  }
}`;

/** Comics whose name contains `name`. Two characters is the useful minimum. */
export async function searchComics(name: string): Promise<ComicSummary[]> {
  return toSummaries(await query(SEARCH, { name: name.trim() }, "getHqsByName"));
}

/** The catalogue's most-read comics, with covers, for an empty search box. */
export async function popularComics(limit: number): Promise<ComicSummary[]> {
  return toSummaries(
    await query(
      BY_FILTERS,
      { orderByViews: true, loadCovers: true, limit },
      "getHqsByFilters",
    ),
  );
}

/** Comics that gained chapters recently. */
export async function recentComics(limit: number): Promise<ComicSummary[]> {
  const all = toSummaries(await query(RECENT, {}, "getRecentlyUpdatedHqs"));
  return all.slice(0, limit);
}

/** One comic with its chapter list. */
export async function comicById(id: number): Promise<Comic> {
  // Despite the singular name this answers with an array of one.
  const raw = await query(BY_ID, { id }, "getHqsById");
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
  const summary = toSummary(row);
  if (!summary) throw new CatalogueError("Esse quadrinho não está mais na biblioteca.");
  return {
    ...summary,
    synopsis: text(row?.synopsis),
    chapters: toChapters(row?.capitulos),
  };
}

const COVER = `query getHqsById($id: Int!) {
  getHqsById(id: $id) {
    id
    hqCover
  }
}`;

/**
 * Covers for comics found by name.
 *
 * Search answers without them — `hqCover` comes back null there and the query
 * takes no `loadCovers` — so a cover is one lookup per comic, and twelve of
 * those take about four seconds. Blocking a search on that would be absurd, so
 * this is a second, later call, and what it finds is kept: the same comics come
 * back for the same words, and the second search should not pay again.
 */
const covers = new Map<number, string | null>();
/** Ceiling on the cover cache, so a long-lived server can't grow forever. */
const COVER_CACHE_MAX = 500;

function remember(id: number, cover: string | null) {
  // Re-inserting moves the entry to the end, so the oldest is always first.
  covers.delete(id);
  covers.set(id, cover);
  if (covers.size > COVER_CACHE_MAX) {
    const oldest = covers.keys().next();
    if (!oldest.done) covers.delete(oldest.value);
  }
}

export async function coversByIds(
  ids: number[],
): Promise<{ id: number; cover: string | null }[]> {
  return Promise.all(
    ids.map(async (id) => {
      const known = covers.get(id);
      if (known !== undefined) return { id, cover: known };

      try {
        const raw = await query(COVER, { id }, "getHqsById");
        const row = (Array.isArray(raw) ? raw[0] : raw) as Record<
          string,
          unknown
        > | null;
        const cover = secureUrl(row?.hqCover);
        remember(id, cover);
        return { id, cover };
      } catch {
        // One missing cover is a gap in a grid, not a failed search. It is not
        // cached either, so a hiccup doesn't blank that comic until restart.
        return { id, cover: null };
      }
    }),
  );
}

/** One chapter with its page images resolved. */
export async function chapterById(chapterId: number): Promise<Chapter> {
  const raw = (await query(CHAPTER, { chapterId }, "getChapterById")) as Record<
    string,
    unknown
  > | null;

  const pages = list(raw?.pictures)
    .map((picture) =>
      picture && typeof picture === "object"
        ? secureUrl((picture as Record<string, unknown>).pictureUrl)
        : null,
    )
    .filter((url): url is string => url !== null);

  // A chapter that was pulled still answers, with every field null.
  if (!pages.length) {
    throw new CatalogueError("Esse capítulo está sem páginas na biblioteca.");
  }

  const comic = (raw?.hq ?? null) as Record<string, unknown> | null;
  return {
    id: chapterId,
    name: text(raw?.name),
    number: text(raw?.number),
    oneshot: raw?.oneshot === true,
    comicId: int(comic?.id),
    comicName: text(comic?.name),
    pages,
  };
}
