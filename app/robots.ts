import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/read` is pure client state over a local file and `/biblioteca` is a
      // catalogue fetched per request — there is nothing at either to index,
      // and the generated imagery is not content.
      disallow: ["/read", "/biblioteca", "/icons/", "/screenshots/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
