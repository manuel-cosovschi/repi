// D207: resumen imprimible de una liquidación de comisiones (Admin o el vendedor dueño). Es una liquidación interna de
// REPI: no es factura ni comprobante fiscal. Se imprime o guarda como PDF desde el navegador.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtMoney, type Currency } from "@repi/domain";
import { requireUser } from "@/server/access/guard";
import { AccessError } from "@/server/access/util";
import { salesEnabled } from "@/server/sales/core";
import { statementFor } from "@/server/sales/payouts";
import { PrintButton } from "./PrintButton";
import "@/styles/coach.css";
import "@/styles/sales.css";

export const metadata: Metadata = { title: "Liquidación interna · REPI" };
const ST: Record<string, string> = { draft: "En preparación", approved: "Aprobada, pendiente de pago", partially_paid: "Pago parcial", paid: "Pagada", cancelled: "Cancelada" };

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  if (!salesEnabled()) notFound();
  const { id } = await params;
  const { user } = await requireUser(`/ventas/liquidacion/${id}`);
  const v = await statementFor(user.id, id.slice(0, 64)).catch((e) => { if (e instanceof AccessError) notFound(); throw e; });
  const m = (x: number) => fmtMoney(x, v.batch.currency as Currency);
  const live = v.payments.filter((p) => p.status === "recorded");
  return (
    <main className="co" style={{ display: "block", background: "var(--ui-page)" }}>
      <div className="co-content" style={{ maxWidth: 860, margin: "0 auto" }}>
        <div className="co-head"><div><span className="co-kicker">REPI · Liquidación interna de comisiones</span><h1>{v.rep?.name}</h1></div><div className="co-actions sv-print-hide"><PrintButton /></div></div>
        <p className="gy-warn" style={{ margin: 0 }}>Documento interno de REPI. No es factura ni comprobante fiscal. Los importes surgen del libro de comisiones y de los pagos registrados.</p>
        <section className="card">
          <dl className="sv-preview">
            <dt>Vendedor</dt><dd>{v.rep?.name} ({v.rep?.code})</dd><dt>Liquidación</dt><dd>{v.batch.id}</dd><dt>Corte</dt><dd>{v.batch.cutoffOn}</dd>
            <dt>Estado</dt><dd>{ST[v.batch.status] ?? v.batch.status}</dd><dt>Generada</dt><dd>{v.batch.createdAt.toISOString().slice(0, 10)}</dd>
            <dt>Total</dt><dd>{m(v.batch.totalMinor)}</dd><dt>Pagado</dt><dd>{m(v.batch.paidMinor)}</dd><dt>Saldo</dt><dd>{m(v.batch.totalMinor - v.batch.paidMinor)}</dd>
          </dl>
        </section>
        <section className="card" style={{ padding: 0 }}><table className="gy-table"><thead><tr><th>Concepto</th><th>Cliente</th><th>Devengada</th><th>Importe</th></tr></thead>
          <tbody>{v.items.map((i) => <tr key={i.entryId}><td>{i.concept}{i.reason ? ` · ${i.reason}` : ""}</td><td>{i.client ?? "—"}</td><td>{i.accrualOn}</td><td className="sv-money">{m(i.amountMinor)}</td></tr>)}</tbody></table></section>
        <section className="card"><h2>Pagos registrados</h2>
          {!live.length ? <p className="sv-note">Sin pagos registrados.</p> : <ul className="sv-timeline">{live.map((p) => <li key={p.id}><b>{m(p.amountMinor)}</b> · {p.methodLabel} · {p.paidOn} · referencia {p.reference}</li>)}</ul>}
        </section>
      </div>
    </main>
  );
}
