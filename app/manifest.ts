import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // The app name, not the page title: the installed app shows this in front
    // of the document title, and "Reader: Mangá e Quadrinhos - …"
    // spent the whole window on branding before saying anything.
    name: SITE.name,
    short_name: SITE.shortName,
    description: SITE.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["books", "entertainment", "utilities"],
    lang: "pt-BR",
    dir: "ltr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/small", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/any", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/wide-library",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Solte um .cbr ou .cbz para começar a ler",
      },
      {
        src: "/screenshots/wide-reader",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Leitura em página dupla com trilha de miniaturas",
      },
      {
        src: "/screenshots/narrow-library",
        sizes: "720x1280",
        type: "image/png",
        form_factor: "narrow",
        label: "Abra um quadrinho pelo celular",
      },
      {
        src: "/screenshots/narrow-reader",
        sizes: "720x1280",
        type: "image/png",
        form_factor: "narrow",
        label: "Leitura de página inteira",
      },
    ],
    // Only "open" is offered: a comic lives in memory for the session, so
    // there is no "continue reading" to resume after a cold launch.
    shortcuts: [
      {
        name: "Abrir um quadrinho",
        short_name: "Abrir",
        description: "Escolha um .cbr ou .cbz do seu aparelho",
        url: "/?open=1",
      },
    ],
    // Backed by `components/pwa/file-handler.tsx`.
    file_handlers: [
      {
        action: "/read",
        accept: {
          "application/vnd.comicbook-rar": [".cbr"],
          "application/vnd.comicbook+zip": [".cbz"],
          "application/x-cbr": [".cbr"],
          "application/x-cbz": [".cbz"],
        },
      },
    ],
  };
}
