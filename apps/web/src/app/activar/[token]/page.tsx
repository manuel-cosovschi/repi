// Invitación de bienvenida al responsable de un cliente habilitado por Admin (anexo §4). Ligada al email; un solo uso.
import type { Metadata } from "next";
import { AccessFlow } from "@/components/access/AccessFlow";
import { AccessShell } from "@/components/access/AccessShell";
import { socialAvailable } from "@/server/env";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Activá tu espacio · REPI" };

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AccessShell>
      <AccessFlow initial={{ activate: token.slice(0, 128) }} social={socialAvailable} />
    </AccessShell>
  );
}
