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
      ],
    }];
  },
};
export default config;
