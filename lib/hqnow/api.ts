/**
 * Client for the HQ Now catalogue.
 *
 * HQ Now (https://hq-now.com) publishes a public, unauthenticated GraphQL API
 * that answers with `Access-Control-Allow-Origin: *`, so the browser talks to it
 * directly and the reader keeps working as a static, serverless app. Nothing is
 * proxied through us: enabling the integration means the *reader's* browser
 * contacts hq-now.com, and it stops the moment they turn it off.
 *
 * The queries below are the ones the site itself issues, kept verbatim in shape
 * so a schema change breaks here in an obvious way rather than silently
 * returning nulls.
 */

import type { RemoteSource } from "@/lib/comic/types";

const ENDPOINT = "https://admin.hq-now.com/graphql";

/** A catalogue that stops answering must not hang a search box forever. */
const TIMEOUT_MS = 15_000;

/** Anything a caller can show to the reader as-is. */
export class HqNowError extends Error {}

// --------------------------------------------------------------- shapes

/** A comic as it appears in a list: enough to identify and open it. */
export type HqSummary = {
  id: number;
  name: string;
  publisher: string | null;
  status: string | null;
  /** Absent from search results, which the API answers without covers. */
  cover: string | null;
};

export type HqChapter = {
  id: number;
  /** Issue number as text: it can be negative (annuals) or fractional. */
  number: string;
  name: string | null;
};

export type Hq = HqSummary & {
  synopsis: string | null;
  chapters: HqChapter[];
};

/** A chapter with its pages resolved: what the reader actually opens. */
export type Chapter = {
  id: number;
  name: string | null;
  number: string | null;
  oneshot: boolean;
  hqId: number | null;
  hqName: string | null;
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

/** Caller cancellation plus a deadline of our own, as one signal. */
function deadline(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, timeout])
    : signal;
}

type GraphQLPayload = {
  data?: Record<string, unknown> | null;
  errors?: { message?: string }[];
};

async function query(
  document: string,
  variables: Record<string, unknown>,
  field: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: document, variables }),
      signal: deadline(signal),
      // The catalogue is public and this is a third party: send it nothing
      // that identifies the reader beyond the request itself.
      credentials: "omit",
      referrerPolicy: "no-referrer",
      mode: "cors",
    });
  } catch (cause) {
    // A cancelled search is not a failure; let the caller's abort through
    // untouched so it can be ignored rather than reported.
    if (signal?.aborted) throw cause;
    throw new HqNowError(
      cause instanceof DOMException && cause.name === "TimeoutError"
        ? "O HQ Now demorou demais para responder. Tente de novo."
        : "Não foi possível falar com o HQ Now. Confira sua conexão.",
    );
  }

  if (!response.ok) {
    throw new HqNowError(`O HQ Now respondeu com erro (${response.status}).`);
  }

  let payload: GraphQLPayload;
  try {
    payload = (await response.json()) as GraphQLPayload;
  } catch {
    throw new HqNowError("O HQ Now respondeu algo que não deu para entender.");
  }

  if (payload.errors?.length) {
    throw new HqNowError(
      text(payload.errors[0]?.message) ?? "O HQ Now recusou a consulta.",
    );
  }

  return payload.data?.[field] ?? null;
}

// --------------------------------------------------------------- normalising

function toSummary(raw: unknown): HqSummary | null {
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

function toSummaries(raw: unknown): HqSummary[] {
  return list(raw)
    .map(toSummary)
    .filter((hq): hq is HqSummary => hq !== null);
}

/**
 * Chapters in reading order.
 *
 * `number` is text and regularly isn't a plain integer: annuals come through
 * negative, tie-ins fractional. Sorting numerically puts those where a reader
 * expects them; anything unparseable keeps the order the API gave.
 */
function toChapters(raw: unknown): HqChapter[] {
  const chapters = list(raw)
    .map((entry, position) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = int(row.id);
      if (id === null) return null;
      const number = text(row.number) ?? "";
      const parsed = Number.parseFloat(number);
      return {
        chapter: { id, number, name: text(row.name) } satisfies HqChapter,
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
export async function searchHqs(
  name: string,
  signal?: AbortSignal,
): Promise<HqSummary[]> {
  return toSummaries(await query(SEARCH, { name: name.trim() }, "getHqsByName", signal));
}

/** The catalogue's most-read comics, with covers, for an empty search box. */
export async function popularHqs(
  limit: number,
  signal?: AbortSignal,
): Promise<HqSummary[]> {
  return toSummaries(
    await query(
      BY_FILTERS,
      { orderByViews: true, loadCovers: true, limit },
      "getHqsByFilters",
      signal,
    ),
  );
}

/** Comics that gained chapters recently. */
export async function recentHqs(
  limit: number,
  signal?: AbortSignal,
): Promise<HqSummary[]> {
  const all = toSummaries(await query(RECENT, {}, "getRecentlyUpdatedHqs", signal));
  return all.slice(0, limit);
}

/** One comic with its chapter list. */
export async function hqById(id: number, signal?: AbortSignal): Promise<Hq> {
  // Despite the singular name this answers with an array of one.
  const raw = await query(BY_ID, { id }, "getHqsById", signal);
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
  const summary = toSummary(row);
  if (!summary) throw new HqNowError("Esse quadrinho não está mais no HQ Now.");
  return {
    ...summary,
    synopsis: text(row?.synopsis),
    chapters: toChapters(row?.capitulos),
  };
}

/** One chapter with its page images resolved. */
export async function chapterById(
  chapterId: number,
  signal?: AbortSignal,
): Promise<Chapter> {
  const raw = (await query(CHAPTER, { chapterId }, "getChapterById", signal)) as
    | Record<string, unknown>
    | null;

  const pages = list(raw?.pictures)
    .map((picture) =>
      picture && typeof picture === "object"
        ? secureUrl((picture as Record<string, unknown>).pictureUrl)
        : null,
    )
    .filter((url): url is string => url !== null);

  // A chapter that was pulled still answers, with every field null.
  if (!pages.length) {
    throw new HqNowError("Esse capítulo está sem páginas no HQ Now.");
  }

  const hq = (raw?.hq ?? null) as Record<string, unknown> | null;
  return {
    id: chapterId,
    name: text(raw?.name),
    number: text(raw?.number),
    oneshot: raw?.oneshot === true,
    hqId: int(hq?.id),
    hqName: text(hq?.name),
    pages,
  };
}

// --------------------------------------------------------------- naming

/** How a chapter is labelled in a list, on its own. */
export function chapterLabel(chapter: {
  number?: string | null;
  name?: string | null;
  oneshot?: boolean;
}): string {
  if (chapter.oneshot) return chapter.name ?? "Edição única";
  const number = chapter.number?.trim();
  const numbered = number ? `#${number}` : null;
  if (numbered && chapter.name) return `${numbered} · ${chapter.name}`;
  return numbered ?? chapter.name ?? "Capítulo";
}

/**
 * The name a chapter is read and remembered under.
 *
 * Reading positions are keyed by this string, so it has to be derived only from
 * catalogue data that doesn't drift — the same chapter opened next week must
 * land on the same key, or the reader loses their page.
 */
export function chapterTitle(chapter: Chapter, fallbackHqName?: string | null): string {
  const hq = chapter.hqName ?? fallbackHqName ?? "HQ Now";
  return `${hq} — ${chapterLabel(chapter)}`;
}

/** Where a chapter came from, for resuming it later. */
export function chapterSource(chapter: Chapter, fallbackHqId?: number): RemoteSource {
  return {
    kind: "hqnow",
    hqId: chapter.hqId ?? fallbackHqId ?? 0,
    chapterId: chapter.id,
  };
}
