import type { Metadata } from "next";
import { Reader } from "@/components/reader/reader";

export const metadata: Metadata = {
  // Absolute, so the installed app doesn't end up titled "Reader -
  // Leitura · Reader". The reader replaces this with the comic's name
  // once one is open; see `Reader`.
  title: { absolute: "Leitura" },
  // The reader is pure client state over a local file; there is nothing here
  // for a crawler to index.
  robots: { index: false },
};

export default function ReadPage() {
  return <Reader />;
}
