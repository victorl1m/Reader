/**
 * How a chapter is named, on both sides of the wire.
 *
 * Pure and free of any fetching, so a component can import it without dragging
 * the catalogue client into the browser bundle.
 */

import type { RemoteSource } from "@/lib/comic/types";
import type { Chapter } from "./api";

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
export function chapterTitle(
  chapter: Chapter,
  fallbackComicName?: string | null,
): string {
  const comic = chapter.comicName ?? fallbackComicName ?? "Biblioteca";
  return `${comic} — ${chapterLabel(chapter)}`;
}

/** Where a chapter came from, for resuming it later. */
export function chapterSource(chapter: Chapter, fallbackComicId?: number): RemoteSource {
  return {
    kind: "catalogue",
    comicId: chapter.comicId ?? fallbackComicId ?? 0,
    chapterId: chapter.id,
  };
}
