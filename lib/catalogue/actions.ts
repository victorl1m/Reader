"use server";

/**
 * The catalogue, as server actions.
 *
 * Every call the Biblioteca makes goes through here, which means the browser
 * only ever talks to this origin: the third-party catalogue is reached from the
 * server, with no CORS to depend on, no third-party request from the reader's
 * device, and one place to normalise or cache it later.
 *
 * Failure is returned, never thrown. An error thrown inside a server action
 * reaches the browser with its message replaced by a generic one in production,
 * so anything the reader should actually read has to travel as a value.
 */

import {
  CatalogueError,
  chapterById,
  comicById,
  coversByIds,
  popularComics,
  recentComics,
  searchComics,
  type Chapter,
  type Comic,
  type ComicSummary,
  type Result,
} from "./api";

/** Ceiling on a shelf, so a caller can't ask the catalogue for everything. */
const MAX_SHELF = 24;
/**
 * Ceiling on one cover request. Each id is a separate lookup upstream, so this
 * is the number that decides how much work a single call can cause.
 */
const MAX_COVERS = 24;

async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (cause) {
    if (cause instanceof CatalogueError) return { ok: false, error: cause.message };
    // Anything else is ours, not the reader's: log it here, where the server
    // can see it, and say something true but unalarming.
    console.error("[catalogue]", cause);
    return { ok: false, error: "Algo deu errado ao falar com a biblioteca." };
  }
}

export async function search(name: string): Promise<Result<ComicSummary[]>> {
  const term = typeof name === "string" ? name.trim() : "";
  if (term.length < 2) return { ok: true, data: [] };
  return attempt(() => searchComics(term));
}

export async function popular(limit: number): Promise<Result<ComicSummary[]>> {
  return attempt(() => popularComics(clamp(limit)));
}

export async function recent(limit: number): Promise<Result<ComicSummary[]>> {
  return attempt(() => recentComics(clamp(limit)));
}

/**
 * Covers for comics already found, fetched after the fact.
 *
 * Search has no covers in it, so the grid asks for these once the names are
 * already on screen. Answered as a list rather than a keyed object because
 * numeric keys don't survive the trip as numbers.
 */
export async function covers(
  ids: number[],
): Promise<Result<{ id: number; cover: string | null }[]>> {
  const wanted = Array.from(
    new Set((Array.isArray(ids) ? ids : []).filter(Number.isFinite).map(Math.trunc)),
  ).slice(0, MAX_COVERS);

  if (!wanted.length) return { ok: true, data: [] };
  return attempt(() => coversByIds(wanted));
}

export async function comic(id: number): Promise<Result<Comic>> {
  if (!Number.isFinite(id)) return { ok: false, error: "Quadrinho desconhecido." };
  return attempt(() => comicById(Math.trunc(id)));
}

export async function chapter(id: number): Promise<Result<Chapter>> {
  if (!Number.isFinite(id)) return { ok: false, error: "Capítulo desconhecido." };
  return attempt(() => chapterById(Math.trunc(id)));
}

function clamp(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_SHELF;
  return Math.max(1, Math.min(MAX_SHELF, Math.trunc(limit)));
}
