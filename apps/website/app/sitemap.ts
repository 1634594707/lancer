import type { MetadataRoute } from "next";
import { SITE_URL, SITE_PUBLISHED } from "./site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_PUBLISHED) return [];
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
