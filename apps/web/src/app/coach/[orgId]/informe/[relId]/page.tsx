// Informe mensual de un cliente para el coach (F-CO-16, D96): sólo sesiones de su relación y con permiso de entrenamientos.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localDate } from "@repi/domain";
import { MonthlyReport } from "@/components/report/MonthlyReport";
import { requireOrgMember } from "@/server/access/guard";
import { AccessError } from "@/server/access/util";
import { clientMonthlyReport } from "@/server/training/report";
import "@/styles/report.css";

export const metadata: Metadata = { title: "Informe mensual · REPI Coach" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ClientReportPage({ params, searchParams }: { params: Promise<{ orgId: string; relId: string }>; searchParams: SP }) {
  const { orgId, relId } = await params;
  const { user } = await requireOrgMember(orgId, "coach", `/coach/${orgId}`);
  const cur = localDate(new Date()).slice(0, 7);
  const q = (await searchParams).mes;
  const month = (Array.isArray(q) ? q[0] : q)?.slice(0, 7) ?? cur;
  try {
    const r = await clientMonthlyReport(user.id, orgId, relId, month);
    return <MonthlyReport r={r} unit="kg" base={`/coach/${orgId}/informe/${relId}?`} back={{ href: `/coach/${orgId}?s=clients&c=${relId}`, label: "Volver a la ficha" }} currentMonth={cur} />;
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    if (e instanceof AccessError) return <main className="rp"><p className="rp-empty" role="alert">{e.message}</p></main>;
    throw e;
  }
}
