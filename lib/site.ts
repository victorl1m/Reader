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
  name: "Flowless Reader",
  /** Home screen and app-switcher label. */
  shortName: "Flowless Reader",
  title: "Flowless Reader: Mangá e Quadrinhos",
  description:
    "Abra um .cbr ou .cbz e comece a ler na hora. As páginas aparecem conforme são lidas, e nada sai do seu dispositivo.",
} as const;
