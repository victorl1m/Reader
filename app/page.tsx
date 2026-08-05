import { Logo } from "@/components/brand/logo";
import { FileDrop } from "@/components/reader/file-drop";
import { InstallButton } from "@/components/pwa/install-button";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ResumeCard } from "@/components/reader/resume-card";

const FEATURES = [
  {
    title: "Páginas conforme ela lê",
    body: "A primeira página aparece em menos de um segundo. O resto do arquivo continua sendo lido enquanto você avança.",
  },
  {
    title: "Nada é enviado",
    body: "O arquivo é aberto por um worker no seu próprio dispositivo. Nenhum servidor vê o conteúdo.",
  },
  {
    title: "CBR e CBZ",
    body: "Arquivos RAR e ZIP de quadrinhos, identificados pelo conteúdo, então um .cbr rotulado errado abre do mesmo jeito.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
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
            comece a ler na hora. O Flowless entrega as páginas conforme as
            descompacta, então você nunca fica olhando para uma barra de
            progresso.
          </p>
        </div>

        <ResumeCard />

        <FileDrop />

        <dl className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-1.5">
              <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                {feature.title}
              </dt>
              <dd className="text-sm leading-relaxed text-muted">{feature.body}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted sm:px-10">
        Um produto <span className="text-foreground">Flowless</span>.
      </footer>

      <InstallPrompt />
    </div>
  );
}
