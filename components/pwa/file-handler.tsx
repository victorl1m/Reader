"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useComic } from "@/lib/comic/store";

type LaunchParams = { files: FileSystemFileHandle[] };
type LaunchQueue = { setConsumer: (consumer: (params: LaunchParams) => void) => void };

/**
 * Handles OS-level "open with Flowless".
 *
 * The manifest registers the installed app as a handler for `.cbr`/`.cbz`.
 * Without this consumer the OS launches the app and silently drops the file,
 * so the declaration in `app/manifest.ts` depends on this component staying
 * mounted at the root.
 */
export function FileHandler() {
  const router = useRouter();
  const { open } = useComic();

  useEffect(() => {
    const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
    if (!queue) return;

    queue.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (!handle) return;
      try {
        const file = await handle.getFile();
        open(file);
        router.push("/read");
      } catch {
        // Permission can be revoked between launch and read; the user still
        // lands on the reader's empty state and can pick the file manually.
      }
    });
  }, [open, router]);

  return null;
}
