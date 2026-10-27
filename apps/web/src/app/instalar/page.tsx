// Ayuda posterior «Cómo agregar Repi a inicio» (anexo PWA). Pública, sin datos personales ni contexto de alta.
import type { Metadata } from "next";
import { AccessShell } from "@/components/access/AccessShell";
import { InstallHelp } from "@/components/access/InstallHelp";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Agregar a inicio · REPI" };

export default function InstallPage() {
  return <AccessShell><InstallHelp /></AccessShell>;
}
