import type { MetadataRoute } from "next";
import { SITE_URL, SITE_PUBLISHED } from "./site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(SITE_PUBLISHED ? { allow: "/" } : { disallow: "/" }),
    },
    ...(SITE_PUBLISHED ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
