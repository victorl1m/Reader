import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/read` is pure client state over a local file and `/hqs` is someone
      // else's catalogue, fetched in the browser — there is nothing at either
      // to index, and the generated imagery is not content.
      disallow: ["/read", "/hqs", "/icons/", "/screenshots/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
