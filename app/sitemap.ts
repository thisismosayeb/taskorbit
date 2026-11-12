import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://taskorbit.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/about", "/developers", "/privacy", "/terms", "/login", "/signup"];
  return pages.map((p) => ({
    url: `${BASE}${p}`,
    lastModified: new Date(),
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.6,
  }));
}
