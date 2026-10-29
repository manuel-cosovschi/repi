import type { Metadata } from "next";
import { AccessFlow } from "@/components/access/AccessFlow";
import { AccessShell } from "@/components/access/AccessShell";
import { socialAvailable } from "@/server/env";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Ingresá · REPI" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 200);

export default async function AccesoPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <AccessShell>
      <AccessFlow initial={{ code: one(sp.code), proof: one(sp.p)?.slice(0, 64), sede: one(sp.sede), step: one(sp.step), next: one(sp.next) }} social={socialAvailable} />
    </AccessShell>
  );
}
