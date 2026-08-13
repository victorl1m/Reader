import { Logo } from "@/components/brand/logo";
import { Hero } from "@/components/home/hero";
import { FileDrop } from "@/components/reader/file-drop";
import { InstallButton } from "@/components/pwa/install-button";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { UpdateHint } from "@/components/pwa/update-hint";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import { ResumeCard } from "@/components/reader/resume-card";
import { Shelf } from "@/components/reader/shelf";
import { IntegrationsCard } from "@/components/integrations/integrations-card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header
        data-app-bar
        className="flex items-center justify-between px-6 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10"
      >
        <Logo size={34} />
        {/* One action at most: installing and updating are opposite states. */}
        <div className="flex items-center gap-2">
          <UpdateHint />
          <InstallButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-10">
        <Hero />

        <ResumeCard />

        <FileDrop />

        <Shelf />

        <IntegrationsCard />
      </main>

      <footer className="px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted sm:px-10">
        Um produto <span className="text-foreground">Flowless</span>.
      </footer>

      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}
