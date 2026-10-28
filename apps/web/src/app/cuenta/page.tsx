// Mi cuenta (D119): seguridad de la cuenta propia. La verificación en dos pasos es optativa para todos; acá se activa o se quita.
import type { Metadata } from "next";
import { AccessShell } from "@/components/access/AccessShell";
import { Account } from "@/components/access/Account";
import { requireUser } from "@/server/access/guard";
import "@/styles/access.css";

export const metadata: Metadata = { title: "Mi cuenta · REPI" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: SP }) {
  const { user } = await requireUser("/cuenta");
  const d = (await searchParams).desde;
  const from = (Array.isArray(d) ? d[0] : d)?.slice(0, 100);
  return (
    <AccessShell>
      <Account name={user.name} email={user.email} twoFactor={!!user.twoFactorEnabled} from={from?.startsWith("/") && !from.startsWith("//") ? from : undefined} />
    </AccessShell>
  );
}
