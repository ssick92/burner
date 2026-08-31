import type { MetadataRoute } from "next";

import { burnerSiteUrl } from "../lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/my-burns", "/auth/", "/reset-password"],
    },
    sitemap: `${burnerSiteUrl}/sitemap.xml`,
  };
}
