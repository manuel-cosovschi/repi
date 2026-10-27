import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";

// Fuentes OFL autoalojadas por next/font (sin pedidos a Google en tiempo de ejecución).
// Selección G · Atlética (REPI_SELECCION_VISUAL.md): Barlow en interfaz, Barlow Condensed sólo en títulos destacados.
// El logo sigue siendo el PNG aprobado: ninguna de estas familias lo reemplaza.
const ui = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow-condensed", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "REPI",
  description: "Cada repetición cuenta.",
  icons: { icon: "/brand/repi_icon.png", apple: "/brand/repi_icon.png" },
  appleWebApp: { capable: true, title: "REPI", statusBarStyle: "black-translucent" },
};

// El navegador entrega beforeinstallprompt una vez y puede ser antes de hidratar: se guarda para la guía de inicio.
const CATCH_INSTALL = "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__repiBIP=e;dispatchEvent(new Event('repi:bip'))});addEventListener('appinstalled',function(){window.__repiBIP=undefined})";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0B0F14" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${ui.variable} ${display.variable} ${mono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: CATCH_INSTALL }} /></head>
      <body>{children}</body>
    </html>
  );
}
