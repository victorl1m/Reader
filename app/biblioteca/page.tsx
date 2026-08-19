import type { Metadata } from "next";
import { Suspense } from "react";
import { AppNav } from "@/components/nav/app-nav";
import { MobileTabBar } from "@/components/nav/mobile-tab-bar";
import { Catalogue } from "@/components/library/catalogue";

export const metadata: Metadata = {
  title: "Biblioteca",
  description: "Procure quadrinhos e leia os capítulos no Reader.",
  // The catalogue is fetched per request and only when the Biblioteca is on:
  // there is nothing here for a crawler to index.
  robots: { index: false },
};

export default function BibliotecaPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppNav active="biblioteca" />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8 pb-28 sm:px-10 sm:pb-8">
        <Suspense fallback={null}>
          <Catalogue />
        </Suspense>
      </main>

      <MobileTabBar active="biblioteca" />
    </div>
  );
}
