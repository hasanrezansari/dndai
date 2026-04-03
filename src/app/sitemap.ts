import type { MetadataRoute } from "next";

import { listPublishedWorlds } from "@/server/services/world-service";
import { getSiteBaseUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteBaseUrl();
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/worlds`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  let worldEntries: MetadataRoute.Sitemap = [];
  try {
    const worlds = await listPublishedWorlds();
    worldEntries = worlds.map((w) => ({
      url: `${base}/worlds/${w.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    /* DB unavailable at build / prerender — skip dynamic rows */
  }

  return [...staticEntries, ...worldEntries];
}
