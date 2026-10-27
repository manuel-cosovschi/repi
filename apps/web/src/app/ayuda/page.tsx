// Ayuda y soporte (N-O11, D93). Pública: también para quien no puede entrar. Sin datos de otras personas.
import type { Metadata } from "next";
import { AccessShell } from "@/components/access/AccessShell";
import { Support } from "@/components/access/Support";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Ayuda · REPI" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SupportPage({ searchParams }: { searchParams: SP }) {
  const d = (await searchParams).desde;
  const from = (Array.isArray(d) ? d[0] : d)?.slice(0, 100);
  return <AccessShell><Support from={from?.startsWith("/") && !from.startsWith("//") ? from : undefined} /></AccessShell>;
}
