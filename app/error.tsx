"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console and any attached error reporter.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <Logo size={38} />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Algo deu errado</h1>
        <p className="text-muted">
          Isso é um problema nosso, não do seu arquivo. Tente de novo. Se
          continuar, recarregue a página.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted">Código: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-full bg-brand px-5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Tentar de novo
        </button>
        <Link
          href="/"
          className="min-h-11 rounded-full border border-border-subtle px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
