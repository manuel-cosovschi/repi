// Destino del QR fijo de cada sede (anexo §5). Público: muestra el gimnasio y la sede, nunca datos de socios.
import type { Metadata } from "next";
import { AccessFlow } from "@/components/access/AccessFlow";
import { AccessShell } from "@/components/access/AccessShell";
import { socialAvailable } from "@/server/env";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Pedí tu acceso · REPI" };

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <AccessShell>
      <AccessFlow initial={{ join: slug.slice(0, 64) }} social={socialAvailable} />
    </AccessShell>
  );
}
