// Informe mensual del alumno (F-CO-16, D96). Imprimible; «Guardar PDF» usa la impresión del navegador.
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { MonthlyReport } from "@/components/report/MonthlyReport";
import { requireUser } from "@/server/access/guard";
import { AccessError } from "@/server/access/util";
import { myMonthlyReport } from "@/server/training/report";
import "@/styles/report.css";

export const metadata: Metadata = { title: "Informe mensual · REPI" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MyReportPage({ searchParams }: { searchParams: SP }) {
  const { user } = await requireUser("/app/informe");
  const cur = localDate(new Date()).slice(0, 7);
  const q = (await searchParams).mes;
  const month = (Array.isArray(q) ? q[0] : q)?.slice(0, 7) ?? cur;
  const [pref] = await db.select({ u: schema.userPref.weightUnit }).from(schema.userPref).where(eq(schema.userPref.userId, user.id));
  try {
    const r = await myMonthlyReport(user.id, month);
    return <MonthlyReport r={r} unit={pref?.u ?? "kg"} base="/app/informe?" back={{ href: "/app?t=prog", label: "Volver a Progreso" }} currentMonth={cur} />;
  } catch (e) {
    if (e instanceof AccessError) return <main className="rp"><p className="rp-empty" role="alert">{e.message} <a href="/app/informe">Ver este mes</a></p></main>;
    throw e;
  }
}
