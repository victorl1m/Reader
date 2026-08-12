import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Catalogue } from "@/components/library/catalogue";

export const metadata: Metadata = {
  title: "Biblioteca",
  description: "Procure quadrinhos e leia os capítulos no Flowless Reader.",
  // The catalogue is fetched per request and only when the Biblioteca is on:
  // there is nothing here for a crawler to index.
  robots: { index: false },
};

export default function BibliotecaPage() {
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
        <Catalogue />
      </main>
    </div>
  );
}
