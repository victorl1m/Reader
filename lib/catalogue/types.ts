/**
 * Shapes shared by every catalogue the Biblioteca can talk to.
 *
 * `hq-now` (Quadrinhos) and MangaDex (Mangá, Manhwa) disagree about almost
 * everything — numeric ids versus UUIDs, GraphQL versus REST, one language
 * versus many — so `./actions.ts` normalises both into these before a
 * component ever sees them. `provider` is what a caller needs to fetch a
 * comic or chapter again: it says which backend `id` belongs to.
 */

export type Provider = "hqnow" | "mangadex";

/** A comic as it appears in a list: enough to identify and open it. */
export type ComicSummary = {
  id: string;
  provider: Provider;
  name: string;
  publisher: string | null;
  status: string | null;
  cover: string | null;
};

export type ComicChapter = {
  id: string;
  /** Issue/chapter number as text: it can be negative (annuals) or fractional. */
  number: string;
  name: string | null;
};

export type Comic = ComicSummary & {
  synopsis: string | null;
  chapters: ComicChapter[];
};

/** A chapter with its pages resolved: what the reader actually opens. */
export type Chapter = {
  id: string;
  provider: Provider;
  name: string | null;
  number: string | null;
  oneshot: boolean;
  comicId: string | null;
  comicName: string | null;
  /** Page image URLs in reading order. */
  pages: string[];
};
