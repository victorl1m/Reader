import type { Metadata } from "next";
import { Reader } from "@/components/reader/reader";

export const metadata: Metadata = {
  title: "Reading",
  // The reader is pure client state over a local file; there is nothing here
  // for a crawler to index.
  robots: { index: false },
};

export default function ReadPage() {
  return <Reader />;
}
