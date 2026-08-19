"use server";

/**
 * The catalogue, as server actions — now fronting two backends.
 *
 * Every call the Biblioteca makes goes through here, which means the browser
 * only ever talks to this origin: each third-party catalogue is reached from
 * the server, with no CORS to depend on, no third-party request from the
 * reader's device, and one place to normalise or cache it later.
 *
 * `hq-now` (Quadrinhos) and MangaDex (Mangá, Manhwa) disagree about
 * everything below this file — numeric ids versus UUIDs, GraphQL versus REST
 * — so every function here takes the content type or provider explicitly and
 * answers with the same shared shape either way (see `./types.ts`). A
 * component never needs to know which backend it's talking to beyond that.
 *
 * Failure is returned, never thrown. An error thrown inside a server action
 * reaches the browser with its message replaced by a generic one in
 * production, so anything the reader should actually read has to travel as a
 * value.
 */

import {
  CatalogueError,
  chapterById as hqChapterById,
  comicById as hqComicById,
  coversByIds,
  popularComics,
  recentComics,
  searchComics,
} from "./api";
import {
  MangaDexError,
  chapterById as mdChapterById,
  mangaById,
  popularManga,
  recentManga,
  searchManga,
  type MangaLanguage,
} from "./mangadex";
import type { Chapter, Comic, ComicSummary, Provider } from "./types";

/** Ceiling on a shelf, so a caller can't ask a catalogue for everything. */
const MAX_SHELF = 24;
/**
 * Ceiling on one cover request. Each id is a separate lookup upstream, so this
 * is the number that decides how much work a single call can cause.
 */
const MAX_COVERS = 24;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** The three tabs the Biblioteca offers, each backed by one provider. */
export type ContentType = "quadrinhos" | "manga" | "manhwa";

async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (cause) {
    if (cause instanceof CatalogueError || cause instanceof MangaDexError) {
      return { ok: false, error: cause.message };
    }
    // Anything else is ours, not the reader's: log it here, where the server
    // can see it, and say something true but unalarming.
    console.error("[catalogue]", cause);
    return { ok: false, error: "Algo deu errado ao falar com a biblioteca." };
  }
}

function clamp(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_SHELF;
  return Math.max(1, Math.min(MAX_SHELF, Math.trunc(limit)));
}

/** "Mangá" and "Manhwa" are the same catalogue, split by origin language. */
function mangaLanguage(type: "manga" | "manhwa"): MangaLanguage {
  return type === "manhwa" ? "ko" : "ja";
}

/** hq-now's own summary, tagged and re-keyed into the shared shape. */
function wrapHqSummary(row: {
  id: number;
  name: string;
  publisher: string | null;
  status: string | null;
  cover: string | null;
}): ComicSummary {
  return { ...row, id: String(row.id), provider: "hqnow" };
}

export async function search(
  type: ContentType,
  name: string,
): Promise<Result<ComicSummary[]>> {
  const term = typeof name === "string" ? name.trim() : "";
  if (term.length < 2) return { ok: true, data: [] };

  if (type === "quadrinhos") {
    return attempt(async () => (await searchComics(term)).map(wrapHqSummary));
  }
  return attempt(() => searchManga(term, mangaLanguage(type)));
}

export async function popular(
  type: ContentType,
  limit: number,
): Promise<Result<ComicSummary[]>> {
  const n = clamp(limit);
  if (type === "quadrinhos") {
    return attempt(async () => (await popularComics(n)).map(wrapHqSummary));
  }
  return attempt(() => popularManga(n, mangaLanguage(type)));
}

export async function recent(
  type: ContentType,
  limit: number,
): Promise<Result<ComicSummary[]>> {
  const n = clamp(limit);
  if (type === "quadrinhos") {
    return attempt(async () => (await recentComics(n)).map(wrapHqSummary));
  }
  return attempt(() => recentManga(n, mangaLanguage(type)));
}

/**
 * Covers for comics already found, fetched after the fact.
 *
 * Only ever meaningful for `hq-now`'s search results, which come back without
 * one — MangaDex's always carry a cover already. Ids that aren't valid
 * `hq-now` ids are silently dropped rather than failing the whole request,
 * since a caller may pass a mixed list without checking provider first.
 */
export async function covers(
  ids: string[],
): Promise<Result<{ id: string; cover: string | null }[]>> {
  const wanted = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
        .map(Math.trunc),
    ),
  ).slice(0, MAX_COVERS);

  if (!wanted.length) return { ok: true, data: [] };
  return attempt(async () => {
    const found = await coversByIds(wanted);
    return found.map((entry) => ({ id: String(entry.id), cover: entry.cover }));
  });
}

export async function comic(provider: Provider, id: string): Promise<Result<Comic>> {
  if (provider === "hqnow") {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return { ok: false, error: "Quadrinho desconhecido." };
    return attempt(async () => {
      const hq = await hqComicById(numericId);
      return {
        ...hq,
        id: String(hq.id),
        provider: "hqnow",
        chapters: hq.chapters.map((chapter) => ({ ...chapter, id: String(chapter.id) })),
      };
    });
  }
  return attempt(() => mangaById(id));
}

export async function chapter(provider: Provider, id: string): Promise<Result<Chapter>> {
  if (provider === "hqnow") {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return { ok: false, error: "Capítulo desconhecido." };
    return attempt(async () => {
      const hq = await hqChapterById(numericId);
      return {
        ...hq,
        id: String(hq.id),
        provider: "hqnow",
        comicId: hq.comicId !== null ? String(hq.comicId) : null,
      };
    });
  }
  return attempt(async () => {
    const md = await mdChapterById(id);
    return { ...md, provider: "mangadex" };
  });
}
