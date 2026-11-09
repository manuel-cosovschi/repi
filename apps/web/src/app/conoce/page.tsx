// REPI Experience Hub (D205): presentación comercial pública. Estática: no lee sesión ni datos (carga rápida desde el QR).
import { ConoceHub } from "@/components/conoce/ConoceHub";
import { conoceMetadata, conoceViewport } from "./meta";
import "@/styles/site.css";
import "@/styles/conoce.css";
import "@/styles/conoce3.css";

export const viewport = conoceViewport;
export const metadata = conoceMetadata({
  path: "/conoce",
  title: "REPI · Entrenamiento inteligente para gimnasios, entrenadores y alumnos",
  description: "Entrenamiento inteligente en la app de cada socio o planificación supervisada con pantalla en el gimnasio. Probá la demo sin cuenta o pedí una propuesta.",
});

export default function ConocePage() {
  return <ConoceHub profile={null} />;
}
