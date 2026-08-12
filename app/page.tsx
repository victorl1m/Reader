import { Logo } from "@/components/brand/logo";
import { FileDrop } from "@/components/reader/file-drop";
import { InstallButton } from "@/components/pwa/install-button";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { UpdateHint } from "@/components/pwa/update-hint";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import { ResumeCard } from "@/components/reader/resume-card";
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
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
            Seus quadrinhos abrem{" "}
            <span className="text-brand">na hora</span>, aqui no navegador
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted text-pretty">
            Arraste um{" "}
            <code className="font-mono text-[0.9em] text-foreground">.cbr</code> ou{" "}
            <code className="font-mono text-[0.9em] text-foreground">.cbz</code> e a
            leitura já começa na primeira página, enquanto o resto do arquivo ainda
            está abrindo. Sem cadastro, sem instalar nada.{" "}
            <strong className="font-semibold text-brand">
              E sem upload: quem abre o arquivo é o seu próprio navegador, então
              nenhuma página chega a servidor nenhum.
            </strong>
          </p>
          <p className="max-w-xl text-sm leading-relaxed text-muted">
            A página em que você parou e o seu jeito de ler ficam guardados só aqui,
            neste aparelho.
          </p>
        </div>

        <ResumeCard />

        <FileDrop />

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
