// D207: invitación de vendedor. Mismo recorrido que la bienvenida del responsable: ligada al email, vence y es de un solo uso.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessFlow } from "@/components/access/AccessFlow";
import { AccessShell } from "@/components/access/AccessShell";
import { socialAvailable } from "@/server/env";
import { salesEnabled } from "@/server/sales/core";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Equipo comercial · REPI" };

export default async function SellerActivatePage({ params }: { params: Promise<{ token: string }> }) {
  if (!salesEnabled()) notFound();
  const { token } = await params;
  return (
    <AccessShell>
      <AccessFlow initial={{ activate: token.slice(0, 128), activateKind: "seller" }} social={socialAvailable} />
    </AccessShell>
  );
}
