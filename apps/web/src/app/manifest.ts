import type { MetadataRoute } from "next";

// Manifest estable: nunca tokens, invitaciones ni datos privados. Los PNG de instalación son
// renders del ícono original aprobado, conservando dibujo y proporciones (no un rediseño).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "REPI", short_name: "REPI", description: "Cada repetición cuenta.", lang: "es-AR",
    id: "/", start_url: "/?source=pwa", scope: "/", display: "standalone", background_color: "#0B0F14", theme_color: "#0B0F14",
    icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
