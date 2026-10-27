import type { MetadataRoute } from "next";

// Manifest PWA. Ícono: PNG original aprobado (162 px). Los tamaños 192/512 para instalación esperan el vector
// verificado (DEC-01): no se reescala la marca. Sin ellos Chrome no ofrece su instalador y la guía muestra los pasos
// manuales (D35). Identidad y punto de inicio estables para todos: nunca tokens, códigos ni datos por gimnasio.
// "/" decide: sin sesión → Acceso (que retoma el alta guardada); con sesión → el espacio que corresponda.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "REPI", short_name: "REPI", description: "Cada repetición cuenta.", lang: "es-AR",
    id: "/", start_url: "/?source=pwa", scope: "/", display: "standalone", background_color: "#0B0F14", theme_color: "#0B0F14",
    icons: [{ src: "/brand/repi_icon.png", sizes: "162x162", type: "image/png" }],
  };
}
