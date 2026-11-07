import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import "@/styles/motion-nav.css";
import { SessionBoundary } from "@/components/session/SessionBoundary";
import { UpdateWatcher } from "@/components/session/UpdateWatcher";
import { appVersion } from "@/server/version";
import { DemoTour } from "@/components/demo/DemoTour";
import { ThemeRuntime } from "@/components/theme/ThemeRuntime";
import { THEME_BOOT } from "@/lib/theme-boot";
import { tokens } from "@repi/domain/tokens";

// Fuentes OFL autoalojadas por next/font (sin pedidos a Google en tiempo de ejecución).
// Selección G · Atlética (REPI_SELECCION_VISUAL.md): Barlow en interfaz, Barlow Condensed sólo en títulos destacados.
// El logo sigue siendo el PNG aprobado: ninguna de estas familias lo reemplaza.
const ui = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow-condensed", display: "swap" });
// Mono sólo en códigos y etiquetas chicas: sin precarga (no compite con el título y los textos en la primera pintura).
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "REPI",
  description: "Cada repetición cuenta.",
  icons: { icon: [{ url: "/icons/favicon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "REPI", statusBarStyle: "black-translucent" },
};

// El navegador entrega beforeinstallprompt una vez y puede ser antes de hidratar: se guarda para la guía de inicio.
const CATCH_INSTALL = "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__repiBIP=e;dispatchEvent(new Event('repi:bip'))});addEventListener('appinstalled',function(){window.__repiBIP=undefined})";
// D188: la barra del navegador sigue al tema. Sin preferencia elegida, por el modo del dispositivo; con Claro u Oscuro
// elegidos, ThemeRuntime ajusta el color. viewport-fit y escala intactos (correcciones de iOS D121/D122).
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: tokens.theme.light.statusbar }, { media: "(prefers-color-scheme: dark)", color: tokens.theme.dark.statusbar }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_BOOT fija data-theme en <html> antes de hidratar (sólo afecta a ese elemento).
    <html lang="es-AR" className={`${ui.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /><meta name="repi-version" content={appVersion()} /><script dangerouslySetInnerHTML={{ __html: CATCH_INSTALL }} /></head>
      <body><ThemeRuntime /><SessionBoundary />{children}<DemoTour /><UpdateWatcher /></body>
    </html>
  );
}
