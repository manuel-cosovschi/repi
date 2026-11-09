// REPI Control (D213): pantalla de consulta de rutinas del gimnasio (tablet o monitor). No usa la sesión de una persona: el
// enlace trae un secreto revocable (en el fragmento) que queda en el equipo. Cada socio se identifica con su código y su PIN.
import type { Metadata, Viewport } from "next";
import { KioskApp } from "@/components/kiosk/KioskApp";
import "@/styles/kiosk.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rutinas · REPI", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0A0F1A", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RoutinesKioskPage() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://repiclub.com").replace(/\/$/, "");
  return <KioskApp appUrl={appUrl} />;
}
