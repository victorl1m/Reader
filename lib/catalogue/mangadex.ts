/**
 * The catalogue behind Mangá and Manhwa: MangaDex's public REST API.
 *
 * Public and keyless, unlike `./api.ts`'s GraphQL endpoint, but with two rules
 * of its own worth centralising here rather than repeating at every call
 * site: a real User-Agent identifying this app (MangaDex's guidelines ask for
 * one rather than an anonymous client), and an explicit content rating filter
 * on every listing — left off, the API answers with erotica and pornographic
 * titles mixed into an otherwise general-audience shelf.
 *
 * "Mangá" and "Manhwa" are both this same catalogue, split by `originalLanguage`
 * (`ja` versus `ko`) rather than by two separate integrations — MangaDex hosts
 * both under one API. Like `./api.ts`, this runs on the server only, reached
 * through `./actions.ts`.
 */

import { SITE_URL } from "@/lib/site";
import type { Comic, ComicChapter, ComicSummary } from "./types";

const ENDPOINT = "https://api.mangadex.org";
const UPLOADS = "https://uploads.mangadex.org";
const TIMEOUT_MS = 15_000;
const USER_AGENT = `Reader (+${SITE_URL})`;
/** Erotica and pornographic titles excluded from every listing by default. */
const CONTENT_RATINGS = ["safe", "suggestive"];
/** Chapters fetched per manga; a longer-running series simply shows the first this many. */
const MAX_CHAPTERS = 500;

export class MangaDexError extends Error {}

export type MangaLanguage = "ja" | "ko";

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const STATUS_LABEL: Record<string, string> = {
  ongoing: "Em andamento",
  completed: "Concluído",
  hiatus: "Em hiato",
  cancelled: "Cancelado",
};

function statusLabel(value: unknown): string | null {
  return typeof value === "string" ? (STATUS_LABEL[value] ?? null) : null;
}

/**
 * A title or description, keyed by language: Portuguese first, then English,
 * then whatever exists. Both `attributes.title` and `attributes.description`
 * arrive in this same shape.
 */
function pickLocalized(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return (
    text(row["pt-br"]) ??
    text(row.pt) ??
    text(row.en) ??
    text(row["ja-ro"]) ??
    text(row["ko-ro"]) ??
    text(Object.values(row)[0])
  );
}

/**
 * A Portuguese name, from the list of alternate titles.
 *
 * `attributes.title` is a single language — almost always the original one,
 * `ja`/`ko`/`zh` — not a localised name at all. A Portuguese title, when a
 * scanlation group has given one, lives in `altTitles` instead: a list of
 * single-key `{ lang: title }` entries, one per language contributed.
 */
function pickAltTitle(altTitles: unknown, lang: string): string | null {
  for (const entry of list(altTitles)) {
    if (!entry || typeof entry !== "object") continue;
    const picked = text((entry as Record<string, unknown>)[lang]);
    if (picked) return picked;
  }
  return null;
}

function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(`${key}[]`, entry);
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function request(path: string, params: Record<string, string | number | string[] | undefined>): Promise<unknown> {
  const url = `${ENDPOINT}${path}?${buildQuery(params)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      credentials: "omit",
      referrer: "",
      cache: "no-store",
    });
  } catch (cause) {
    throw new MangaDexError(
      cause instanceof DOMException && cause.name === "TimeoutError"
        ? "O MangaDex demorou demais para responder. Tente de novo."
        : "Não foi possível falar com o MangaDex agora.",
    );
  }

  if (!response.ok) {
    throw new MangaDexError(`O MangaDex respondeu com erro (${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MangaDexError("O MangaDex respondeu algo que não deu para entender.");
  }

  const row = payload as { result?: string; data?: unknown };
  if (row.result !== "ok") {
    throw new MangaDexError("O MangaDex recusou a consulta.");
  }
  return row.data;
}

function coverFileName(relationships: unknown): string | null {
  const relationship = list(relationships).find(
    (entry): entry is { type: string; attributes?: { fileName?: unknown } } =>
      Boolean(entry) && typeof entry === "object" && (entry as { type?: unknown }).type === "cover_art",
  );
  return text(relationship?.attributes?.fileName);
}

function toSummary(raw: unknown): ComicSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const attributes = row.attributes as Record<string, unknown> | undefined;
  const name =
    pickAltTitle(attributes?.altTitles, "pt-br") ??
    pickAltTitle(attributes?.altTitles, "pt") ??
    pickLocalized(attributes?.title);
  if (!id || !name) return null;

  const cover = coverFileName(row.relationships);
  return {
    id,
    provider: "mangadex",
    name,
    publisher: null,
    status: statusLabel(attributes?.status),
    cover: cover ? `${UPLOADS}/covers/${id}/${cover}` : null,
  };
}

function toSummaries(raw: unknown): ComicSummary[] {
  return list(raw)
    .map(toSummary)
    .filter((comic): comic is ComicSummary => comic !== null);
}

/** Titles matching `term`, restricted to one origin language ("Mangá" or "Manhwa"). */
export async function searchManga(term: string, language: MangaLanguage): Promise<ComicSummary[]> {
  const data = await request("/manga", {
    title: term,
    originalLanguage: [language],
    contentRating: CONTENT_RATINGS,
    includes: ["cover_art"],
    limit: 24,
  });
  return toSummaries(data);
}

/** Most-followed titles, for an empty search box. */
export async function popularManga(limit: number, language: MangaLanguage): Promise<ComicSummary[]> {
  const data = await request("/manga", {
    originalLanguage: [language],
    contentRating: CONTENT_RATINGS,
    includes: ["cover_art"],
    "order[followedCount]": "desc",
    limit,
  });
  return toSummaries(data);
}

/** Titles with the most recently uploaded chapters. */
export async function recentManga(limit: number, language: MangaLanguage): Promise<ComicSummary[]> {
  const data = await request("/manga", {
    originalLanguage: [language],
    contentRating: CONTENT_RATINGS,
    includes: ["cover_art"],
    "order[latestUploadedChapter]": "desc",
    limit,
  });
  return toSummaries(data);
}

/**
 * Chapters in reading order, for whichever translation a reader can actually
 * read: Portuguese if a scanlation group has done it, English otherwise.
 */
async function chapterList(mangaId: string): Promise<ComicChapter[]> {
  for (const translatedLanguage of ["pt-br", "en"]) {
    const data = await request(`/manga/${mangaId}/feed`, {
      translatedLanguage: [translatedLanguage],
      contentRating: CONTENT_RATINGS,
      "order[chapter]": "asc",
      limit: MAX_CHAPTERS,
    });

    const seen = new Set<string>();
    const chapters: ComicChapter[] = [];
    for (const entry of list(data)) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const id = text(row.id);
      const attributes = row.attributes as Record<string, unknown> | undefined;
      const number = text(attributes?.chapter) ?? "";
      if (!id || seen.has(number)) continue;
      seen.add(number);
      chapters.push({ id, number, name: text(attributes?.title) });
    }
    if (chapters.length) return chapters;
  }
  return [];
}

/** One title with its chapter list, chosen from whatever translation exists. */
export async function mangaById(id: string): Promise<Comic> {
  const raw = await request(`/manga/${id}`, { includes: ["cover_art"] });
  const row = raw as Record<string, unknown>;
  const summary = toSummary(row);
  if (!summary) throw new MangaDexError("Esse título não está mais no MangaDex.");

  const attributes = row.attributes as Record<string, unknown> | undefined;
  return {
    ...summary,
    synopsis: pickLocalized(attributes?.description),
    chapters: await chapterList(id),
  };
}

/** A chapter's page images, resolved through MangaDex's at-home CDN. */
export async function chapterById(chapterId: string): Promise<{
  id: string;
  name: string | null;
  number: string | null;
  /** MangaDex has no oneshot concept distinct from a numbered chapter. */
  oneshot: false;
  comicId: string | null;
  comicName: string | null;
  pages: string[];
}> {
  const chapterRaw = await request(`/chapter/${chapterId}`, { includes: ["manga"] });
  const chapterRow = chapterRaw as Record<string, unknown>;
  const attributes = chapterRow.attributes as Record<string, unknown> | undefined;
  const manga = list(chapterRow.relationships).find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && (entry as { type?: unknown }).type === "manga",
  );
  const mangaAttributes = manga?.attributes as Record<string, unknown> | undefined;

  const home = await fetchAtHome(chapterId);
  const pages = home.data.map((file) => `${home.baseUrl}/data/${home.hash}/${file}`);

  return {
    id: chapterId,
    name: text(attributes?.title),
    number: text(attributes?.chapter),
    oneshot: false,
    comicId: text(manga?.id),
    comicName:
      pickAltTitle(mangaAttributes?.altTitles, "pt-br") ??
      pickAltTitle(mangaAttributes?.altTitles, "pt") ??
      pickLocalized(mangaAttributes?.title),
    pages,
  };
}

/**
 * The at-home server answers `{ result, baseUrl, chapter: { hash, data } }`
 * with no `data` envelope around the whole payload — unlike every other
 * endpoint here — so it's fetched directly rather than through `request`.
 */
async function fetchAtHome(
  chapterId: string,
): Promise<{ baseUrl: string; hash: string; data: string[] }> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/at-home/server/${chapterId}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      credentials: "omit",
      referrer: "",
      cache: "no-store",
    });
  } catch {
    throw new MangaDexError("Não foi possível buscar as páginas no MangaDex.");
  }
  if (!response.ok) {
    throw new MangaDexError("Esse capítulo não respondeu no MangaDex.");
  }

  const payload = (await response.json()) as {
    result?: string;
    baseUrl?: string;
    chapter?: { hash?: string; data?: string[] };
  };
  if (payload.result !== "ok" || !payload.baseUrl || !payload.chapter?.hash) {
    throw new MangaDexError("Esse capítulo está sem páginas no MangaDex.");
  }

  return {
    baseUrl: payload.baseUrl,
    hash: payload.chapter.hash,
    data: list(payload.chapter.data).filter((entry): entry is string => typeof entry === "string"),
  };
}
