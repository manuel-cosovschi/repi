import type { MetadataRoute } from "next";

// Manifest PWA. Ícono: PNG original aprobado (162 px). Los tamaños 192/512 para instalación esperan el vector
// verificado (DEC-01): no se reescala la marca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "REPI", short_name: "REPI", description: "Cada repetición cuenta.", lang: "es-AR",
    start_url: "/app", scope: "/", display: "standalone", background_color: "#0B0F14", theme_color: "#0B0F14",
    icons: [{ src: "/brand/repi_icon.png", sizes: "162x162", type: "image/png" }],
  };
}
