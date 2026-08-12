"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useComic } from "@/lib/comic/store";
import { HqNowError, chapterById, chapterSource, chapterTitle } from "./api";

/**
 * Fetches a chapter's page list and takes the reader to it.
 *
 * Shared by every way in (the catalogue, the resume card) so that opening a
 * chapter always means the same thing: one request for the page URLs, the comic
 * handed to the store, and `/read` from there. The chapter's images are only
 * fetched later, by the reader, and only the ones it is actually showing.
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
      fallback?: { hqId?: number; hqName?: string | null },
    ) => {
      setOpening(chapterId);
      setFailed(null);
      try {
        const chapter = await chapterById(chapterId);
        openRemote({
          name: chapterTitle(chapter, fallback?.hqName),
          pages: chapter.pages,
          source: chapterSource(chapter, fallback?.hqId),
        });
        router.push("/read");
      } catch (cause) {
        setFailed(
          cause instanceof HqNowError
            ? cause.message
            : "Não deu para abrir esse capítulo.",
        );
        setOpening(null);
      }
    },
    [openRemote, router],
  );

  return { open, opening, failed };
}
