import type { MetadataRoute } from "next";
import { tools } from "@/lib/tools";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = ["/", "/privacy", ...tools.map((t) => t.href)];
  return routes.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}/`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: route === "/" ? 1 : 0.8,
  }));
}
