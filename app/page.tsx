import { Logo } from "@/components/brand/logo";
import { FileDrop } from "@/components/reader/file-drop";
import { InstallButton } from "@/components/pwa/install-button";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ResumeCard } from "@/components/reader/resume-card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header
        data-app-bar
        className="flex items-center justify-between px-6 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10"
      >
        <Logo size={34} />
        <InstallButton />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-10">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
            Seus quadrinhos, página um{" "}
            <span className="text-brand">num segundo</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted text-pretty">
            Abra um <code className="font-mono text-[0.9em] text-foreground">.cbr</code>{" "}
            ou <code className="font-mono text-[0.9em] text-foreground">.cbz</code> e
            comece a ler na hora, sem cadastro e sem espera.{" "}
            <strong className="font-semibold text-brand">
              Não guardamos nada: o arquivo é aberto pelo seu próprio aparelho e
              nenhum servidor recebe nem uma página.
            </strong>
          </p>
          <p className="max-w-xl text-sm leading-relaxed text-muted">
            Só o seu navegador guarda, aqui neste aparelho, a página em que você
            parou e o jeito que você gosta de ler.
          </p>
        </div>

        <ResumeCard />

        <FileDrop />
      </main>

      <footer className="px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted sm:px-10">
        Um produto <span className="text-foreground">Flowless</span>.
      </footer>

      <InstallPrompt />
    </div>
  );
}
