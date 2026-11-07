// REPI Sales Force (D207) · liquidaciones de comisiones y registro de pagos a vendedores.
// REPI no transfiere dinero: Admin registra el pago hecho por fuera con su evidencia. Cada asiento entra en una sola
// liquidación (índice único), una liquidación abierta por vendedor y moneda, pagos con clave idempotente y bloqueo de fila.
// El resumen es una liquidación interna: no es factura ni comprobante fiscal.
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { PAYOUT_FREQUENCY, fmtMoney, payoutCutoff, type CommissionRules, type Currency, type PayoutFrequency } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, NF, audit, isDay, notifyRep, requireRep, salesAdmin, today } from "./core";
import { planVersionAt } from "./reps";

const { payoutBatch: B, payoutItem: I, payoutPayment: PP, commissionEntry: E, salesRep, organization, user } = schema;
const money = (m: number, c: string) => fmtMoney(m, c as Currency);
export const PAYOUT_METHODS = { transferencia: "Transferencia", deposito: "Depósito", efectivo: "Efectivo", otro: "Otro" } as const;

/** Asientos disponibles y todavía fuera de toda liquidación (un revertido y su reversión se netean juntos). */
async function availableFor(repId: string, currency: string | null, cutoff: string, tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db = db) {
  return tx.select({ e: E }).from(E).leftJoin(I, eq(I.entryId, E.id))
    .where(and(eq(E.repId, repId), isNull(I.id), lte(E.availableOn, cutoff), currency ? eq(E.currency, currency) : undefined)).orderBy(asc(E.availableOn), asc(E.createdAt));
}

/** Qué hay para liquidar hoy por vendedor y moneda, según su frecuencia y el mínimo de su plan. */
export async function payoutPreview(actorId: string, asOf = today()) {
  await salesAdmin(actorId);
  const reps = await db.select().from(salesRep).orderBy(asc(salesRep.name));
  const open = await db.select().from(B).where(inArray(B.status, ["draft", "approved", "partially_paid"]));
  const out = [];
  for (const r of reps) {
    const cutoff = payoutCutoff(r.payoutFrequency as PayoutFrequency, asOf);
    const rows = await availableFor(r.id, null, cutoff);
    const all = await availableFor(r.id, null, asOf);
    const byCur = new Map<string, { total: number; n: number }>();
    for (const { e } of rows) { const x = byCur.get(e.currency) ?? { total: 0, n: 0 }; x.total += e.amountMinor; x.n++; byCur.set(e.currency, x); }
    const later = new Map<string, number>();
    for (const { e } of all) if (e.availableOn > cutoff) later.set(e.currency, (later.get(e.currency) ?? 0) + e.amountMinor);
    const pv = await planVersionAt(r.id, asOf);
    const min = pv ? (pv.v.rules as CommissionRules).minPayoutMinor : 0;
    for (const cur of new Set([...byCur.keys(), ...later.keys()])) {
      const x = byCur.get(cur) ?? { total: 0, n: 0 };
      const hasOpen = open.some((b) => b.repId === r.id && b.currency === cur && (b.status === "draft" || b.status === "approved"));
      out.push({ repId: r.id, repName: r.name, repStatus: r.status, frequency: r.payoutFrequency, frequencyLabel: PAYOUT_FREQUENCY[r.payoutFrequency as PayoutFrequency], cutoff, currency: cur,
        totalMinor: x.total, entries: x.n, laterMinor: later.get(cur) ?? 0, minPayoutMinor: pv && (pv.v.rules as CommissionRules).currency === cur ? min : 0, hasOpen,
        due: !hasOpen && x.total > 0 && x.total >= (pv && (pv.v.rules as CommissionRules).currency === cur ? min : 0) });
    }
  }
  return { asOf, rows: out };
}

/**
 * Borrador de liquidación: toma los asientos disponibles hasta el corte, sin duplicar ninguno. Un doble clic o dos
 * administradores a la vez producen una sola liquidación (clave idempotente + una abierta por vendedor y moneda).
 */
export async function generateBatch(actorId: string, p: { repId: string; currency: "ARS" | "USD"; cutoffOn?: string | null; idempotencyKey: string; note?: string | null; ignoreMinimum?: boolean }) {
  await salesAdmin(actorId);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(p.idempotencyKey ?? "")) throw new AccessError("invalid", "Falta la clave de la operación. Recargá.");
  const [again] = await db.select().from(B).where(eq(B.idempotencyKey, p.idempotencyKey));
  if (again) return { id: again.id, repeated: true };
  const [r] = await db.select().from(salesRep).where(eq(salesRep.id, p.repId));
  if (!r) throw NF();
  const cutoff = p.cutoffOn ?? payoutCutoff(r.payoutFrequency as PayoutFrequency, today());
  if (!isDay(cutoff) || cutoff > today()) throw new AccessError("invalid", "El corte no puede ser futuro.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payout:${r.id}`}))`);
    const [open] = await tx.select({ id: B.id }).from(B).where(and(eq(B.repId, r.id), eq(B.currency, p.currency), inArray(B.status, ["draft", "approved"])));
    if (open) throw new AccessError("exists", "Este vendedor ya tiene una liquidación abierta en esa moneda: terminala o cancelala primero.", 409, { batchId: open.id });
    const rows = await availableFor(r.id, p.currency, cutoff, tx);
    const total = rows.reduce((a, x) => a + x.e.amountMinor, 0);
    if (!rows.length || total <= 0) throw new AccessError("nothing", "No hay comisiones disponibles para liquidar hasta ese corte (o el saldo es negativo por reversiones).", 409);
    const pv = await planVersionAt(r.id, today());
    const min = pv && (pv.v.rules as CommissionRules).currency === p.currency ? (pv.v.rules as CommissionRules).minPayoutMinor : 0;
    if (total < min && !p.ignoreMinimum) throw new AccessError("below_minimum", `El total (${money(total, p.currency)}) no llega al mínimo de liquidación del plan (${money(min, p.currency)}).`, 409);
    const [b] = await tx.insert(B).values({ repId: r.id, currency: p.currency, cutoffOn: cutoff, frequency: r.payoutFrequency, totalMinor: total, idempotencyKey: p.idempotencyKey, note: p.note?.trim().slice(0, 300) || null, createdBy: actorId }).returning();
    await tx.insert(I).values(rows.map(({ e }) => ({ batchId: b.id, entryId: e.id, amountMinor: e.amountMinor })));
    await audit(tx, { actorUserId: actorId, action: "sales.payout_drafted", resourceType: "payout_batch", resourceId: b.id, meta: { repId: r.id, totalMinor: total, currency: p.currency, entries: rows.length } });
    return { id: b.id, totalMinor: total, entries: rows.length };
  });
}

async function lockBatch(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string) {
  const [b] = await tx.select().from(B).where(eq(B.id, id)).for("update");
  if (!b) throw NF();
  return b;
}
export async function approveBatch(actorId: string, batchId: string) {
  await salesAdmin(actorId);
  return db.transaction(async (tx) => {
    const b = await lockBatch(tx, batchId);
    if (b.status !== "draft") throw new AccessError("invalid_state", "Sólo se aprueba un borrador.", 409);
    await tx.update(B).set({ status: "approved", approvedBy: actorId, approvedAt: new Date() }).where(eq(B.id, b.id));
    await audit(tx, { actorUserId: actorId, action: "sales.payout_approved", resourceType: "payout_batch", resourceId: b.id });
    await notifyRep(tx, b.repId, { kind: "payout_ready", title: `Liquidación aprobada: ${money(b.totalMinor, b.currency)}`, body: `Corte al ${b.cutoffOn}. Te avisamos cuando REPI registre el pago.`, url: `/ventas?s=liquidaciones&b=${b.id}`, dedupeKey: `payout_ok:${b.id}` });
    return { status: "approved" };
  });
}
/** Cancelar una liquidación sin pagos: los asientos vuelven a estar disponibles; queda la constancia de lo que tenía. */
export async function cancelBatch(actorId: string, batchId: string, reason: string) {
  await salesAdmin(actorId);
  if ((reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo.");
  return db.transaction(async (tx) => {
    const b = await lockBatch(tx, batchId);
    if (b.status !== "draft" && b.status !== "approved") throw new AccessError("invalid_state", "Una liquidación con pagos registrados no se cancela: anulá los pagos o registrá un ajuste.", 409);
    const items = await tx.select().from(I).where(eq(I.batchId, b.id));
    await tx.delete(I).where(eq(I.batchId, b.id));
    await tx.update(B).set({ status: "cancelled", cancelledBy: actorId, cancelledAt: new Date(), cancelReason: reason.trim().slice(0, 300), snapshot: { items: items.map((i) => ({ entryId: i.entryId, amountMinor: i.amountMinor })) } }).where(eq(B.id, b.id));
    await audit(tx, { actorUserId: actorId, action: "sales.payout_cancelled", resourceType: "payout_batch", resourceId: b.id, meta: { items: items.length } });
    return { status: "cancelled" };
  });
}

/** Registrar un pago (total o parcial). Nunca permite pagar más que el total de la liquidación. */
export async function recordPayout(actorId: string, batchId: string, p: { amountMinor: number; paidOn: string; method: keyof typeof PAYOUT_METHODS; reference: string; note?: string | null; idempotencyKey: string }) {
  await salesAdmin(actorId);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(p.idempotencyKey ?? "")) throw new AccessError("invalid", "Falta la clave de la operación. Recargá.");
  if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0) throw new AccessError("invalid", "El importe tiene que ser mayor que cero.");
  if (!isDay(p.paidOn) || p.paidOn > today()) throw new AccessError("invalid", "La fecha de pago no puede ser futura.");
  if (!(p.method in PAYOUT_METHODS)) throw new AccessError("invalid", "Elegí el medio de pago.");
  if ((p.reference ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí la evidencia: número de operación o comprobante.");
  const [again] = await db.select().from(PP).where(eq(PP.idempotencyKey, p.idempotencyKey));
  if (again) return { id: again.id, repeated: true };
  return db.transaction(async (tx) => {
    const b = await lockBatch(tx, batchId);
    if (b.status !== "approved" && b.status !== "partially_paid") throw new AccessError("invalid_state", b.status === "draft" ? "Aprobá la liquidación antes de registrar el pago." : "Esta liquidación no admite pagos.", 409);
    const [{ s }] = await tx.select({ s: sql<number>`coalesce(sum(${PP.amountMinor}), 0)::bigint` }).from(PP).where(and(eq(PP.batchId, b.id), eq(PP.status, "recorded")));
    const paid = Number(s);
    if (paid + p.amountMinor > b.totalMinor) throw new AccessError("overpay", `El pago supera el saldo de la liquidación (${money(b.totalMinor - paid, b.currency)}).`, 409);
    const [row] = await tx.insert(PP).values({ batchId: b.id, amountMinor: p.amountMinor, paidOn: p.paidOn, method: p.method, reference: p.reference.trim().slice(0, 200), note: p.note?.trim().slice(0, 300) || null, idempotencyKey: p.idempotencyKey, createdBy: actorId })
      .onConflictDoNothing().returning();
    if (!row) { const [x] = await tx.select().from(PP).where(eq(PP.idempotencyKey, p.idempotencyKey)); return { id: x.id, repeated: true }; }
    const newPaid = paid + p.amountMinor;
    await tx.update(B).set({ paidMinor: newPaid, status: newPaid === b.totalMinor ? "paid" : "partially_paid" }).where(eq(B.id, b.id));
    await audit(tx, { actorUserId: actorId, action: "sales.payout_paid", resourceType: "payout_payment", resourceId: row.id, meta: { batchId: b.id, amountMinor: p.amountMinor, currency: b.currency } });
    await notifyRep(tx, b.repId, { kind: "payout_paid", title: `Pago registrado: ${money(p.amountMinor, b.currency)}`, body: `${PAYOUT_METHODS[p.method]} del ${p.paidOn}${newPaid < b.totalMinor ? `. Saldo pendiente: ${money(b.totalMinor - newPaid, b.currency)}` : ". Liquidación saldada"}.`, url: `/ventas?s=liquidaciones&b=${b.id}`, dedupeKey: `payout_paid:${row.id}` });
    return { id: row.id, status: newPaid === b.totalMinor ? "paid" : "partially_paid" };
  });
}
export async function voidPayout(actorId: string, paymentId: string, reason: string) {
  await salesAdmin(actorId);
  if ((reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí por qué se anula.");
  return db.transaction(async (tx) => {
    const [pp] = await tx.select().from(PP).where(eq(PP.id, paymentId));
    if (!pp) throw NF();
    const b = await lockBatch(tx, pp.batchId);
    const r = await tx.update(PP).set({ status: "voided", voidReason: reason.trim().slice(0, 300), voidedBy: actorId, voidedAt: new Date() }).where(and(eq(PP.id, paymentId), eq(PP.status, "recorded"))).returning();
    if (!r.length) throw new AccessError("invalid_state", "El pago ya está anulado.", 409);
    const paid = b.paidMinor - pp.amountMinor;
    await tx.update(B).set({ paidMinor: paid, status: paid === 0 ? "approved" : "partially_paid" }).where(eq(B.id, b.id));
    await audit(tx, { actorUserId: actorId, action: "sales.payout_payment_voided", resourceType: "payout_payment", resourceId: pp.id, meta: { batchId: b.id } });
    await notifyRep(tx, b.repId, { kind: "payout_voided", title: `Pago anulado: ${money(pp.amountMinor, b.currency)}`, body: reason.trim().slice(0, 200), url: `/ventas?s=liquidaciones&b=${b.id}`, dedupeKey: `payout_void:${pp.id}` });
    return { ok: true };
  });
}

async function batchView(b: typeof B.$inferSelect) {
  const items = await db.select({ i: I, e: E, client: organization.name }).from(I).innerJoin(E, eq(E.id, I.entryId)).leftJoin(organization, eq(organization.id, E.orgId)).where(eq(I.batchId, b.id)).orderBy(asc(E.accrualOn));
  const pays = await db.select({ p: PP, by: user.name }).from(PP).leftJoin(user, eq(user.id, PP.createdBy)).where(eq(PP.batchId, b.id)).orderBy(asc(PP.createdAt));
  const [rep] = await db.select({ name: salesRep.name, code: salesRep.code, email: salesRep.email }).from(salesRep).where(eq(salesRep.id, b.repId));
  return {
    batch: { ...b, snapshot: undefined }, rep,
    items: items.map(({ i, e, client }) => ({ entryId: e.id, concept: e.concept, client, accrualOn: e.accrualOn, availableOn: e.availableOn, baseMinor: e.baseMinor, rateBps: e.rateBps, amountMinor: i.amountMinor, sourceType: e.sourceType, reason: e.reason })),
    payments: pays.map(({ p, by }) => ({ id: p.id, amountMinor: p.amountMinor, paidOn: p.paidOn, method: p.method, methodLabel: PAYOUT_METHODS[p.method], reference: p.reference, note: p.note, status: p.status, voidReason: p.voidReason, by })),
  };
}
export async function adminBatches(actorId: string, f: { repId?: string | null; status?: string | null } = {}) {
  await salesAdmin(actorId);
  const rows = await db.select({ b: B, rep: salesRep.name }).from(B).innerJoin(salesRep, eq(salesRep.id, B.repId))
    .where(and(f.repId ? eq(B.repId, f.repId) : undefined, f.status ? eq(B.status, f.status as "draft") : undefined)).orderBy(desc(B.createdAt)).limit(300);
  return rows.map(({ b, rep }) => ({ ...b, snapshot: undefined, repName: rep }));
}
export async function adminBatch(actorId: string, batchId: string) {
  await salesAdmin(actorId);
  const [b] = await db.select().from(B).where(eq(B.id, batchId));
  if (!b) throw NF();
  return batchView(b);
}
/** Detalle o resumen imprimible: Admin o el vendedor dueño. Otro vendedor → 404. */
export async function myBatch(userId: string, batchId: string) {
  const rep = await requireRep(userId, "moneyRead");
  const [b] = await db.select().from(B).where(and(eq(B.id, batchId), eq(B.repId, rep.id)));
  if (!b) throw NF();
  return batchView(b);
}
export async function statementFor(userId: string, batchId: string) {
  const [u] = await db.select({ role: user.platformRole, twoFactor: user.twoFactorEnabled }).from(user).where(eq(user.id, userId));
  if (u?.role === "admin") return adminBatch(userId, batchId);
  return myBatch(userId, batchId);
}

// ── Exportación contable ────────────────────────────────────────────────────
const cell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
const decimal = (m: number) => (m / 100).toFixed(2);
/** CSV para contabilidad (entradas del libro o pagos). Importes con punto decimal; sin datos de socios. */
export async function exportCsv(actorId: string, kind: "ledger" | "payments") {
  await salesAdmin(actorId);
  const reps = new Map((await db.select({ id: salesRep.id, name: salesRep.name, code: salesRep.code }).from(salesRep)).map((r) => [r.id, r]));
  let lines: unknown[][];
  if (kind === "ledger") {
    const rows = await db.select({ e: E, batchId: I.batchId, client: organization.name }).from(E).leftJoin(I, eq(I.entryId, E.id)).leftJoin(organization, eq(organization.id, E.orgId)).orderBy(asc(E.accrualOn), asc(E.createdAt));
    lines = [["fecha_devengo", "disponible_desde", "vendedor", "codigo", "cliente", "concepto", "tipo", "base", "tasa_bps", "importe", "moneda", "liquidacion", "motivo"],
      ...rows.map(({ e, batchId, client }) => [e.accrualOn, e.availableOn, reps.get(e.repId)?.name, reps.get(e.repId)?.code, client, e.concept, e.sourceType, e.baseMinor !== null && e.sourceType !== "tier" ? decimal(e.baseMinor) : e.baseMinor, e.rateBps, decimal(e.amountMinor), e.currency, batchId, e.reason])];
  } else {
    const rows = await db.select({ p: PP, b: B }).from(PP).innerJoin(B, eq(B.id, PP.batchId)).orderBy(asc(PP.paidOn));
    lines = [["fecha_pago", "vendedor", "codigo", "liquidacion", "corte", "importe", "moneda", "medio", "referencia", "estado", "motivo_anulacion"],
      ...rows.map(({ p, b }) => [p.paidOn, reps.get(b.repId)?.name, reps.get(b.repId)?.code, b.id, b.cutoffOn, decimal(p.amountMinor), b.currency, PAYOUT_METHODS[p.method], p.reference, p.status, p.voidReason])];
  }
  await audit(db, { actorUserId: actorId, action: "sales.export", resourceType: "export", meta: { kind } });
  return lines.map((l) => l.map(cell).join(",")).join("\n") + "\n";
}
