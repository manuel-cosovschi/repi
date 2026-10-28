import type { MetadataRoute } from "next";

// Manifest estable: nunca tokens, invitaciones ni datos privados. Los íconos salen de scripts/brand-icons.ts (D117):
// la marca aprobada en un cuadrado a sangre, sin esquinas propias, para que el sistema aplique su máscara una sola vez.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "REPI", short_name: "REPI", description: "Cada repetición cuenta.", lang: "es-AR",
    id: "/", start_url: "/?source=pwa", scope: "/", display: "standalone", background_color: "#000c18", theme_color: "#0B0F14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
