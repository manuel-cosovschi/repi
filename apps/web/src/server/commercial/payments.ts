// Pagos externos del cliente a REPI registrados por Admin (F-AD-04, N-O22, D102). Propuesta de piloto sujeta a
// confirmación: REPI no cobra ni mueve dinero; Admin deja constancia del pago recibido por fuera con su evidencia y lo
// concilia contra el cierre del período. Un cierre simulado no es un cobro, y esto tampoco es un comprobante fiscal.
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { fmtMoney, localDate, type Currency } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireAdmin } from "./services";

const { billingPayment: pay, billingSnapshot: snap, clientContract, user } = schema;
export const PAYMENT_METHODS = { transferencia: "Transferencia", deposito: "Depósito", efectivo: "Efectivo", otro: "Otro" } as const;
type Method = keyof typeof PAYMENT_METHODS;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

async function contractOf(contractId: string) {
  const [c] = await db.select().from(clientContract).where(eq(clientContract.id, contractId));
  if (!c) throw new AccessError("not_found", "No encontramos ese contrato.", 404);
  return c;
}

/** Pagos del contrato y conciliación por cierre: esperado (subtotal del cierre) vs. registrado. */
export async function contractPayments(actorId: string, contractId: string) {
  await requireAdmin(actorId);
  const c = await contractOf(contractId);
  const rows = await db.select({ p: pay, by: user.name }).from(pay).innerJoin(user, eq(user.id, pay.createdBy))
    .where(eq(pay.contractId, c.id)).orderBy(desc(pay.receivedOn), desc(pay.createdAt));
  const snaps = await db.select().from(snap).where(eq(snap.contractId, c.id)).orderBy(asc(snap.periodStart));
  const money = (m: number, cur: string) => fmtMoney(m, cur as Currency);
  const live = rows.filter((r) => r.p.status === "recorded");
  const reconciliation = snaps.map((s) => {
    const paid = live.filter((r) => r.p.snapshotId === s.id).reduce((a, r) => a + r.p.amountMinor, 0);
    const balance = s.subtotalMinor - paid;
    return { snapshotId: s.id, period: `${s.periodStart} → ${s.periodEnd}`, expectedTxt: money(s.subtotalMinor, s.currency), paidTxt: money(paid, s.currency),
      balanceTxt: money(Math.abs(balance), s.currency), state: balance === 0 ? "paid" : balance > 0 ? (paid ? "partial" : "unpaid") : "over" };
  });
  return {
    currency: c.currency, methods: PAYMENT_METHODS,
    payments: rows.map(({ p, by }) => ({ id: p.id, snapshotId: p.snapshotId, amountTxt: money(p.amountMinor, p.currency), amountMinor: p.amountMinor, currency: p.currency,
      receivedOn: p.receivedOn, method: p.method, reference: p.reference, note: p.note, status: p.status, voidReason: p.voidReason, by, createdAt: p.createdAt })),
    reconciliation,
    unassignedTxt: money(live.filter((r) => !r.p.snapshotId).reduce((a, r) => a + r.p.amountMinor, 0), c.currency),
  };
}

export async function recordPayment(actorId: string, contractId: string, p: {
  amountMinor: number; receivedOn: string; method: Method; reference: string; snapshotId?: string | null; note?: string | null;
}, now = new Date()) {
  await requireAdmin(actorId);
  const c = await contractOf(contractId);
  if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) throw new AccessError("invalid", "El importe tiene que ser mayor que cero.");
  // QA 29/10 (DATA-4): la columna es int4; arriba de 2.147.483.647 centavos la base fallaba con un 500.
  if (p.amountMinor > 2_147_483_647) throw new AccessError("invalid", "El importe es demasiado alto.");
  if (!isDay(p.receivedOn) || p.receivedOn > localDate(now)) throw new AccessError("invalid", "La fecha de pago no puede ser futura.");
  if (!(p.method in PAYMENT_METHODS)) throw new AccessError("invalid", "Elegí el medio de pago.");
  if ((p.reference ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí la evidencia: número de operación o comprobante del cliente.");
  if (p.snapshotId) {
    const [s] = await db.select().from(snap).where(and(eq(snap.id, p.snapshotId), eq(snap.contractId, c.id)));
    if (!s) throw new AccessError("invalid", "Ese cierre no es de este contrato.");
    if (s.currency !== c.currency) throw new AccessError("invalid", "La moneda del cierre no coincide con la del contrato.");
  }
  const [row] = await db.insert(pay).values({
    contractId: c.id, snapshotId: p.snapshotId || null, amountMinor: p.amountMinor, currency: c.currency, receivedOn: p.receivedOn, method: p.method,
    reference: p.reference.trim().slice(0, 200), note: p.note?.trim().slice(0, 300) || null, createdBy: actorId, createdAt: now,
  }).returning();
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "billing.payment_recorded", resourceType: "billing_payment", resourceId: row.id, meta: { amountMinor: row.amountMinor, currency: row.currency } });
  return { id: row.id, amountTxt: fmtMoney(row.amountMinor, row.currency as Currency) };
}

/** Anular (error de carga, pago rebotado): queda en el historial con motivo y autor. */
export async function voidPayment(actorId: string, paymentId: string, reason: string, now = new Date()) {
  await requireAdmin(actorId);
  if ((reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí por qué se anula.");
  const [p] = await db.update(pay).set({ status: "voided", voidReason: reason.trim().slice(0, 200), voidedBy: actorId, voidedAt: now })
    .where(and(eq(pay.id, paymentId), eq(pay.status, "recorded"))).returning();
  if (!p) throw new AccessError("not_found", "El pago no existe o ya está anulado.", 404);
  const c = await contractOf(p.contractId);
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "billing.payment_voided", resourceType: "billing_payment", resourceId: p.id });
  return { ok: true };
}

/** Para el Resumen: pagos externos registrados en el mes (hora AR), por moneda. Nunca suma monedas distintas. */
export async function paymentsThisMonth(now = new Date()) {
  const month = localDate(now).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const rows = await db.select({ a: pay.amountMinor, c: pay.currency, contract: pay.contractId }).from(pay)
    .where(and(eq(pay.status, "recorded"), gte(pay.receivedOn, `${month}-01`), lt(pay.receivedOn, `${next}-01`)));
  const demo = rows.length ? new Set((await db.select({ id: clientContract.id }).from(clientContract)
    .innerJoin(schema.organization, eq(schema.organization.id, clientContract.orgId))
    .where(and(inArray(clientContract.id, [...new Set(rows.map((r) => r.contract))]), eq(schema.organization.isDemo, true)))).map((x) => x.id)) : new Set<string>();
  const by = new Map<string, number>();
  for (const r of rows) if (!demo.has(r.contract)) by.set(r.c, (by.get(r.c) ?? 0) + r.a);
  return [...by.entries()].map(([currency, minor]) => fmtMoney(minor, currency as Currency));
}
