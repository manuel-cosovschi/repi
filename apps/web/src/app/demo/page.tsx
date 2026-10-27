// Demo guiada de REPI (D85): elegir perfil y entrar a un entorno ficticio propio, sin cuenta.
import type { Metadata } from "next";
import { AccessShell } from "@/components/access/AccessShell";
import { DemoPicker } from "@/components/demo/DemoPicker";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Probá REPI · Demo guiada" };

export default function DemoPage() {
  return <AccessShell><DemoPicker /></AccessShell>;
}
