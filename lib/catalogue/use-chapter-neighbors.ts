"use client";

import { useEffect, useState } from "react";
import type { Provider, RemoteSource } from "@/lib/comic/types";
import { comic as fetchComic } from "./actions";

export type ChapterNeighbors = {
  provider: Provider;
  comicId: string;
  comicName: string;
  previousChapterId: string | null;
  nextChapterId: string | null;
};

/**
 * The chapter before and after the one currently open, for a "next chapter"
 * prompt at the end of the book.
 *
 * Only meaningful for a chapter opened from the Biblioteca — a local file has
 * no `source` and no sibling chapters to speak of. The comic's full chapter
 * list (already in reading order) is fetched once per chapter and searched
 * for the current one by id.
 */
export function useChapterNeighbors(source: RemoteSource | null): ChapterNeighbors | null {
  // Tagged with the source it was fetched for, so a stale answer for the
  // chapter read before this one is never shown as this one's neighbors —
  // the moment `source` changes, `loaded` no longer matches and the hook
  // reports nothing until the new fetch resolves.
  const [loaded, setLoaded] = useState<{
    source: RemoteSource;
    neighbors: ChapterNeighbors;
  } | null>(null);

  useEffect(() => {
    if (!source) return;

    let live = true;
    fetchComic(source.provider, source.comicId).then((result) => {
      if (!live || !result.ok) return;
      const chapters = result.data.chapters;
      const at = chapters.findIndex((chapter) => chapter.id === source.chapterId);
      if (at === -1) return;
      setLoaded({
        source,
        neighbors: {
          provider: source.provider,
          comicId: source.comicId,
          comicName: result.data.name,
          previousChapterId: at > 0 ? chapters[at - 1].id : null,
          nextChapterId: at < chapters.length - 1 ? chapters[at + 1].id : null,
        },
      });
    });

    return () => {
      live = false;
    };
  }, [source]);

  return loaded?.source === source ? loaded.neighbors : null;
}
