import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ComicProvider } from "@/lib/comic/store";
import { SPOT_PREFIX } from "@/lib/comic/library";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { FileHandler } from "@/components/pwa/file-handler";
import { SITE, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE.title,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  appleWebApp: {
    capable: true,
    title: SITE.shortName,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
};

/**
 * Marks the document before the first paint if anything has ever been read
 * here, so the landing page's pitch is hidden for a returning reader instead of
 * flashing and collapsing on every visit. React can't do this on its own: the
 * evidence is in `localStorage`, which the server can't see, so anything driven
 * by state alone only knows once the page is already on screen.
 *
 * Deliberately tiny and failure-tolerant: storage can be blocked entirely, and
 * the only cost of that is seeing the pitch again.
 */
const RETURNING_READER = `try{for(var k in localStorage){if(k.lastIndexOf(${JSON.stringify(
  SPOT_PREFIX,
)},0)===0){document.documentElement.dataset.returning="true";break}}}catch(e){}`;

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Pinch zoom stays enabled. The reader has its own fit modes, but capping
  // scale would leave anyone who needs magnification with no way to get it.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: RETURNING_READER }} />
        <ComicProvider>
          {children}
          <FileHandler />
        </ComicProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
