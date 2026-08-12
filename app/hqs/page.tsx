import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { HqNowCatalogue } from "@/components/hqnow/catalogue";

export const metadata: Metadata = {
  title: "Acervo HQ Now",
  description:
    "Procure quadrinhos no acervo do HQ Now e leia os capítulos no Flowless Reader.",
  // The catalogue is someone else's, fetched in the browser and only when the
  // integration is on: there is nothing here for a crawler to index.
  robots: { index: false },
};

export default function HqsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header
        data-app-bar
        className="flex items-center justify-between px-6 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10"
      >
        <Link href="/" aria-label="Voltar ao início">
          <Logo size={34} />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8 sm:px-10">
        <HqNowCatalogue />
      </main>

      <footer className="px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted sm:px-10">
        Acervo e páginas são do{" "}
        <a
          href="https://hq-now.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="text-foreground underline decoration-border-subtle underline-offset-4 hover:decoration-brand"
        >
          hq-now.com
        </a>
        . O Flowless só lê.
      </footer>
    </div>
  );
}
