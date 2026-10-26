import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";

// Fuentes OFL autoalojadas por next/font (sin pedidos a Google en tiempo de ejecución).
const ui = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter-tight", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "REPI",
  description: "Cada repetición cuenta.",
  icons: { icon: "/brand/repi_icon.png", apple: "/brand/repi_icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0B0F14" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
