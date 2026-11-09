import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@repi/domain"],
  // Importa sólo los íconos usados (Phosphor exporta más de 1.500).
  experimental: { optimizePackageImports: ["@phosphor-icons/react"] },
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        // D197: sin tocar scripts ni estilos (Next los inyecta en línea). Bloquea marcos, <base>, plugins y formularios a otros sitios.
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        // Cámara (QR de ingreso) y ubicación (sede) sólo desde REPI; el resto apagado.
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()" },
      ],
    }, {
      // REPI Control (D213): la pantalla de rutinas y su API nunca quedan en una caché (ni del navegador ni compartida).
      source: "/api/kiosk/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "X-Robots-Tag", value: "noindex" }],
    }, {
      source: "/rutinas",
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "X-Robots-Tag", value: "noindex" }],
    }];
  },
};
export default config;
