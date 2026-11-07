// Metadatos compartidos de /conoce (D205): título, descripción, Open Graph y canónica absolutas en repiclub.com.
import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/contact";

export const conoceViewport: Viewport = { themeColor: "#0B0F14" };
const OG = { url: `${SITE.url}/conoce/og.png`, width: 1200, height: 630, alt: "REPI · Cada repetición cuenta" };

export function conoceMetadata(p: { path: string; title: string; description: string }): Metadata {
  return {
    metadataBase: new URL(SITE.url),
    title: p.title,
    description: p.description,
    alternates: { canonical: p.path },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "es_AR", siteName: "REPI", url: p.path, title: p.title, description: p.description, images: [OG] },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [OG.url] },
  };
}
