"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useComic } from "@/lib/comic/store";
import { chapter as fetchChapter } from "./actions";
import { chapterSource, chapterTitle } from "./format";

/**
 * Fetches a chapter's page list and takes the reader to it.
 *
 * Shared by every way in (the Biblioteca, the shelf) so that opening a chapter
 * always means the same thing: one action for the page URLs, the comic handed
 * to the store, and `/read` from there. The page images are only fetched later,
 * by the reader, and only the ones it is actually showing.
 */
export function useOpenChapter() {
  const { openRemote } = useComic();
  const router = useRouter();
  /** The chapter currently being fetched, so a list can show which one. */
  const [opening, setOpening] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const open = useCallback(
    async (
      chapterId: number,
      /** Used only when the chapter's own payload doesn't name its comic. */
      fallback?: { comicId?: number; comicName?: string | null },
    ) => {
      setOpening(chapterId);
      setFailed(null);

      const result = await fetchChapter(chapterId);
      if (!result.ok) {
        setFailed(result.error);
        setOpening(null);
        return;
      }

      openRemote({
        name: chapterTitle(result.data, fallback?.comicName),
        pages: result.data.pages,
        source: chapterSource(result.data, fallback?.comicId),
      });
      router.push("/read");
    },
    [openRemote, router],
  );

  return { open, opening, failed };
}
