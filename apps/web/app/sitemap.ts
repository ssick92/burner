import type { MetadataRoute } from "next";

import { burnerSiteUrl } from "../lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: burnerSiteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${burnerSiteUrl}/studio`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${burnerSiteUrl}/b/demo`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${burnerSiteUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${burnerSiteUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
