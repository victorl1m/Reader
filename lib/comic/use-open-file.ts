"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useComic } from "./store";
import { LIMITS } from "./types";

/**
 * Accepts a picked or dropped file and takes the reader to it.
 *
 * Shared by every entry point (the drop target, the resume card) so the size
 * checks and the navigation behave the same wherever the file came from.
 */
export function useOpenFile() {
  const router = useRouter();
  const { open } = useComic();
  const [rejected, setRejected] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;

      // Caught here as well as in the worker so an obviously impossible file
      // never gets read into memory at all.
      if (file.size > LIMITS.maxArchiveBytes) {
        setRejected(
          `“${file.name}” tem ${(file.size / 1024 ** 3).toFixed(1)} GB. O Reader abre arquivos de até ${
            LIMITS.maxArchiveBytes / 1024 ** 3
          } GB.`,
        );
        return;
      }
      if (file.size === 0) {
        setRejected(`“${file.name}” está vazio.`);
        return;
      }

      setRejected(null);
      open(file);
      router.push("/read");
    },
    [open, router],
  );

  return { accept, rejected };
}
