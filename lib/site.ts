/**
 * Canonical origin for metadata.
 *
 * Preview and staging deploys must not emit production canonical/OG URLs, so
 * this prefers an explicit `NEXT_PUBLIC_SITE_URL`, then the deployment URL
 * injected by the host, and only then the production default.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://reader.flowless.app";
}

export const SITE_URL = resolveSiteUrl();

export const SITE = {
  /**
   * The app's name. Also the manifest `name`, which the OS prefixes to the
   * document title in window and taskbar chrome — so it stays a name, not a
   * description. `title` is for the document and search results, where the
   * extra words earn their place.
   */
  name: "Reader",
  /** Home screen and app-switcher label. */
  shortName: "Reader",
  title: "Reader: Mangá e Quadrinhos",
  description:
    "Leia mangás e quadrinhos no navegador. Abra um .cbr ou .cbz e comece na hora: quem abre o arquivo é o seu próprio aparelho, e nenhuma página é enviada para lugar nenhum.",
} as const;
