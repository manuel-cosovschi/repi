// D205: páginas públicas para buscadores (la presentación comercial primero).
import type { MetadataRoute } from "next";
import { SITE } from "@/lib/contact";
import { PROFILES } from "@/lib/site-events";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/conoce`, changeFrequency: "weekly", priority: 1 },
    ...PROFILES.map((p) => ({ url: `${SITE.url}/conoce/${p}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: `${SITE.url}/`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/demo`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE.url}/instalar`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
