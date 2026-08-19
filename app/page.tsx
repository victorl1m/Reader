import { AppNav } from "@/components/nav/app-nav";
import { MobileTabBar } from "@/components/nav/mobile-tab-bar";
import { Hero } from "@/components/home/hero";
import { FileDrop } from "@/components/reader/file-drop";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import { ResumeCard } from "@/components/reader/resume-card";
import { Shelf } from "@/components/reader/shelf";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppNav active="home" />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-10 pb-28 sm:px-10 sm:py-12 sm:pb-12">
        <Hero />

        <ResumeCard />

        <FileDrop />

        <Shelf />
      </main>

      <MobileTabBar active="home" />
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}
