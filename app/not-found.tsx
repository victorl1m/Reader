import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <Logo size={38} />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-muted">
          Esse endereço não existe por aqui. Que tal abrir um quadrinho?
        </p>
      </div>
      <Link
        href="/"
        className="min-h-11 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Ir para o início
      </Link>
    </main>
  );
}
