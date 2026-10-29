// Pantalla autorizada de ingreso (D127): tablet o TV de recepción que muestra el QR dinámico de su sede.
// No usa la sesión de una persona: el enlace trae un secreto revocable (en el fragmento, no viaja en la URL) que queda en el equipo.
import type { Metadata, Viewport } from "next";
import { KioskDisplay } from "@/components/gym-access/KioskDisplay";
import "@/styles/gym-access.css";

export const metadata: Metadata = { title: "Ingreso · REPI", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0A0F1A" };

export default function KioskPage() {
  return <KioskDisplay />;
}
