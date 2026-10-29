// Pantalla del ranking en la sala (D146): TV o tablet del gimnasio con el ranking por ejercicio en vivo.
// No usa la sesión de una persona: el enlace trae un secreto revocable (en el fragmento, no viaja en la URL) que queda en el equipo.
import type { Metadata, Viewport } from "next";
import { RankingDisplay } from "@/components/club-screen/RankingDisplay";
import "@/styles/ranking-screen.css";

export const metadata: Metadata = { title: "Ranking · REPI", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0A0F1A" };

export default function RankingScreenPage() {
  return <RankingDisplay />;
}
