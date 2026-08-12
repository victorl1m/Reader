"use client";

import Link from "next/link";
import { useComic } from "@/lib/comic/store";

/**
 * The comic that is open right now.
 *
 * Only that one. It exists so that leaving the reader doesn't look like the
 * file was lost — everything already *read* lives in the shelf below, which is
 * backed by storage rather than by memory. Splitting the two keeps this card
 * honest: what it offers is a way back into something still open, never a
 * promise to reopen something that isn't.
 */
export function ResumeCard() {
  const { status, fileName, index, total, close } = useComic();

  const open = status !== "idle" && status !== "error" && Boolean(fileName);
  if (!open) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{fileName}</span>
        <span className="text-sm text-muted">
          {total ? `Página ${index + 1} de ${total}` : "Abrindo…"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          Fechar
        </button>
        <Link
          href="/read"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-soft"
        >
          Continuar lendo
        </Link>
      </div>
    </div>
  );
}
