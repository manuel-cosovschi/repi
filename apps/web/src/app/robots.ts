// D205: guía para buscadores. Se indexan el sitio público y /conoce; la app, las APIs y el QR (que sólo redirige) no.
import type { MetadataRoute } from "next";
import { SITE } from "@/lib/contact";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/app", "/coach/", "/gym/", "/admin", "/qr", "/activar", "/unirse/", "/tutor/", "/cuenta", "/ranking/", "/dev"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
