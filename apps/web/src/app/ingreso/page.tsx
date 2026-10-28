// Destino del QR dinámico de ingreso (D127) al escanearlo con la cámara del teléfono. Requiere sesión: el QR no identifica a nadie.
// El token viaja en el fragmento (#c=…): no llega al servidor en la URL ni queda en logs; la página lo envía por POST.
import type { Metadata } from "next";
import { AccessShell } from "@/components/access/AccessShell";
import { CheckinLanding } from "@/components/gym-access/CheckinLanding";
import { requireUser } from "@/server/access/guard";
import "@/styles/access.css";
import "@/styles/member.css";

export const metadata: Metadata = { title: "Validar ingreso · REPI" };

export default async function CheckinPage() {
  await requireUser("/ingreso");
  return <AccessShell><CheckinLanding /></AccessShell>;
}
