// REPI Sales Force (D209) · planes de comisión versionados y motor de devengamiento.
// Un plan aprobado es inmutable; un cambio es una versión nueva con vigencia. La venta aprobada congela su versión.
// Los asientos se calculan desde eventos verificados (aprobación, habilitación, cobros registrados por Admin), con clave
// idempotente única y un trigger que impide editarlos o borrarlos. Un cierre o una simulación nunca son un cobro.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  COMPONENT_LABEL, ENTRY_STATE_LABEL, TRIGGER_LABEL, applyBps, dealPreview, desiredEntries, diffLedger, entryState, fmtMoney, holdUntil, localDate, tierBonusFor, validateRules,
  type CommissionRules, type Currency, type DealKind, type EntryState,
} from "@repi/domain";
import { db, schema } from "@/db";
import { logError } from "../log";
import { AccessError, NF, audit, isDay, notifyRep, requireRep, salesAdmin, today } from "./core";

const { commissionPlan: PL, commissionPlanVersion: PV, commissionEntry: E, salesDeal: D, salesRep, salesRepPlan, clientContract, billingPayment, payoutItem, payoutBatch, organization } = schema;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const money = (m: number, c: string) => fmtMoney(m, c as Currency);

// ── Planes ──────────────────────────────────────────────────────────────────
export async function listPlans(actorId: string) {
  await salesAdmin(actorId);
  const plans = await db.select().from(PL).orderBy(asc(PL.name));
  const versions = await db.select().from(PV).orderBy(asc(PV.version));
  const assigned = await db.select({ v: salesRepPlan.planVersionId, n: sql<number>`count(distinct ${salesRepPlan.repId})::int` }).from(salesRepPlan).groupBy(salesRepPlan.planVersionId);
  return plans.map((p) => ({ ...p, versions: versions.filter((v) => v.planId === p.id).map((v) => ({ ...v, reps: assigned.find((a) => a.v === v.id)?.n ?? 0 })) }));
}
export async function createPlan(actorId: string, p: { name: string; description?: string | null }) {
  await salesAdmin(actorId);
  if ((p.name ?? "").trim().length < 2) throw new AccessError("invalid", "Escribí el nombre del plan.");
  const [r] = await db.insert(PL).values({ name: p.name.trim().slice(0, 120), description: p.description?.trim().slice(0, 600) || null, createdBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, action: "sales.plan_created", resourceType: "commission_plan", resourceId: r.id });
  return { id: r.id };
}
/** Nueva versión en borrador. No rige ni se asigna hasta aprobarla. */
export async function saveDraftVersion(actorId: string, planId: string, p: { versionId?: string | null; rules: CommissionRules; effectiveFrom: string; notes?: string | null }) {
  await salesAdmin(actorId);
  if (!isDay(p.effectiveFrom)) throw new AccessError("invalid", "Fecha de vigencia inválida.");
  const errs = validateRules(p.rules);
  if (errs.length) throw new AccessError("invalid", errs.join(" "));
  const [plan] = await db.select().from(PL).where(eq(PL.id, planId));
  if (!plan || plan.status !== "active") throw NF();
  const rules: CommissionRules = { ...p.rules, notes: p.rules.notes?.toString().slice(0, 1000) || null };
  if (p.versionId) {
    const r = await db.update(PV).set({ rules, effectiveFrom: p.effectiveFrom, notes: p.notes?.trim().slice(0, 600) || null }).where(and(eq(PV.id, p.versionId), eq(PV.planId, planId), eq(PV.status, "draft"))).returning();
    if (!r.length) throw new AccessError("invalid_state", "Sólo se edita un borrador: una versión aprobada es inmutable.", 409);
    return { id: r[0].id, version: r[0].version };
  }
  return db.transaction(async (tx) => {
    await tx.select({ id: PL.id }).from(PL).where(eq(PL.id, planId)).for("update");
    const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${PV.version}), 0)::int` }).from(PV).where(eq(PV.planId, planId));
    const [r] = await tx.insert(PV).values({ planId, version: v + 1, rules, effectiveFrom: p.effectiveFrom, notes: p.notes?.trim().slice(0, 600) || null, createdBy: actorId }).returning();
    await audit(tx, { actorUserId: actorId, action: "sales.plan_version_drafted", resourceType: "commission_plan_version", resourceId: r.id });
    return { id: r.id, version: r.version };
  });
}
export async function approveVersion(actorId: string, versionId: string) {
  await salesAdmin(actorId);
  const [v] = await db.select().from(PV).where(eq(PV.id, versionId));
  if (!v) throw NF();
  const errs = validateRules(v.rules as CommissionRules);
  if (errs.length) throw new AccessError("invalid", errs.join(" "));
  const r = await db.update(PV).set({ status: "approved", approvedBy: actorId, approvedAt: new Date() }).where(and(eq(PV.id, versionId), eq(PV.status, "draft"))).returning();
  if (!r.length) throw new AccessError("invalid_state", "Esa versión ya está aprobada.", 409);
  await audit(db, { actorUserId: actorId, action: "sales.plan_version_approved", resourceType: "commission_plan_version", resourceId: versionId, meta: { rules: v.rules } });
  return { ok: true };
}
export async function archivePlan(actorId: string, planId: string) {
  await salesAdmin(actorId);
  await db.update(PL).set({ status: "archived" }).where(eq(PL.id, planId));
  await audit(db, { actorUserId: actorId, action: "sales.plan_archived", resourceType: "commission_plan", resourceId: planId });
  return { ok: true };
}

/** Estimación visible antes de que algo se devengue. No es una comisión: se rotula «estimada». */
export function estimateForDeal(rules: CommissionRules, d: { members: number; unitPriceMinor: number; periodicity: string; contractStart: string; durationMonths: number | null; discountBps: number; setupFeeMinor: number; currency: string; kind: string; previousMembers?: number }) {
  if (validateRules(rules).length) return null;
  const prev = dealPreview({ members: d.members, unitPriceMinor: d.unitPriceMinor, periodicity: d.periodicity as never, contractStart: d.contractStart, durationMonths: d.durationMonths, discountBps: d.discountBps, setupFeeMinor: d.setupFeeMinor });
  if (!prev.ok) return null;
  const lines: { label: string; amountMinor: number | null; currency: string; note: string }[] = [];
  for (const c of rules.components) {
    if (c.type === "fixed_per_sale") lines.push({ label: COMPONENT_LABEL[c.type], amountMinor: d.currency === rules.currency ? c.amountMinor : null, currency: rules.currency, note: TRIGGER_LABEL[c.trigger] });
    else if (c.type === "per_member") {
      const base = d.kind === "new" ? d.members : Math.max(0, d.members - (d.previousMembers ?? 0));
      const n = c.maxMembers ? Math.min(base, c.maxMembers) : base;
      lines.push({ label: COMPONENT_LABEL[c.type], amountMinor: d.currency === rules.currency ? n * c.amountMinor : null, currency: rules.currency, note: `${n} socios · ${TRIGGER_LABEL[c.trigger]}` });
    } else if (c.type === "first_payment_pct") lines.push({ label: COMPONENT_LABEL[c.type], amountMinor: applyBps(prev.perPeriod, c.bps), currency: d.currency, note: "Si el primer cobro registrado es el importe del período" });
    else if (c.type === "recurring_pct") lines.push({ label: COMPONENT_LABEL[c.type], amountMinor: applyBps(prev.monthlyNet, c.bps) * c.months, currency: d.currency, note: `Si se cobra lo pactado durante ${c.months} meses` });
    else if (c.type === "tier_bonus") lines.push({ label: COMPONENT_LABEL[c.type], amountMinor: null, currency: rules.currency, note: "Depende de lo aprobado en el mes" });
  }
  return { lines, disclaimer: "Estimación sobre lo pactado. Se devenga sólo con eventos verificados y cobros registrados por REPI." };
}

// ── Sincronización de un contrato ───────────────────────────────────────────
/**
 * Recalcula lo que corresponde para todas las ventas aprobadas de un contrato y registra sólo la diferencia (altas y
 * reversiones). Idempotente y serializado por contrato. Cada cobro cuenta para una sola venta: la última aprobada cuya
 * fecha de inicio es anterior o igual al cobro (una renovación toma los cobros desde su inicio).
 */
export async function syncContract(contractId: string, now = new Date()) {
  const t = localDate(now);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`commission:${contractId}`}))`);
    const [c] = await tx.select().from(clientContract).where(eq(clientContract.id, contractId));
    if (!c) return { added: 0, reversed: 0 };
    const deals = await tx.select().from(D).where(and(eq(D.contractId, contractId), eq(D.status, "approved"), isNotNull(D.planVersionId))).orderBy(asc(D.contractStart), asc(D.approvedAt));
    if (!deals.length) return { added: 0, reversed: 0 };
    const payments = await tx.select().from(billingPayment).where(eq(billingPayment.contractId, contractId));
    let stoppedOn: string | null = null;
    if (c.status === "suspended" || c.status === "ended") {
      const [ev] = await tx.select({ at: schema.auditEvent.at }).from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, c.id), eq(schema.auditEvent.action, "commercial.suspended"))).orderBy(desc(schema.auditEvent.at)).limit(1);
      stoppedOn = ev ? localDate(ev.at) : t;
    }
    let added = 0, reversed = 0;
    for (const d of deals) {
      const [v] = await tx.select().from(PV).where(eq(PV.id, d.planVersionId!));
      const rules = v.rules as CommissionRules;
      if (validateRules(rules).length) continue;
      const next = deals.filter((x) => x.id !== d.id && x.contractStart > d.contractStart).map((x) => x.contractStart).sort()[0] ?? null;
      const mine = payments.filter((p) => p.receivedOn >= d.contractStart && (!next || p.receivedOn < next) && p.currency === d.currency)
        .map((p) => ({ id: p.id, amountMinor: p.amountMinor, currency: p.currency, receivedOn: p.receivedOn, status: p.status, createdAt: p.createdAt.toISOString() }));
      const split = d.split ?? [{ repId: d.repId, shareBps: 10000 }];
      const reps = await tx.select({ id: salesRep.id, terminatedAt: salesRep.terminatedAt }).from(salesRep).where(inArray(salesRep.id, split.map((s) => s.repId)));
      const term = Object.fromEntries(reps.map((r) => [r.id, r.terminatedAt ? localDate(r.terminatedAt) : null]));
      const { entries } = desiredEntries(rules, {
        id: d.id, kind: d.kind as DealKind, currency: d.currency, contractStart: d.contractStart, approvedOn: localDate(d.approvedAt ?? now), members: d.members, previousMembers: d.previousMembers,
        split, contractEnabledOn: c.enabledAt ? localDate(c.enabledAt) : null, contractStoppedOn: stoppedOn,
      }, mine, term, t);
      const existing = await tx.select({ key: E.key, amountMinor: E.amountMinor, reversalOf: E.reversalOf, id: E.id, repId: E.repId, currency: E.currency, concept: E.concept, availableOn: E.availableOn })
        .from(E).where(and(eq(E.dealId, d.id), inArray(E.sourceType, ["deal", "payment", "reversal"])));
      const diff = diffLedger(existing, entries);
      for (const a of diff.add) {
        const [row] = await tx.insert(E).values({ key: a.finalKey, repId: a.repId, dealId: d.id, orgId: c.orgId, contractId: c.id, planVersionId: v.id, componentIndex: a.componentIndex, component: a.component,
          sourceType: a.sourceType, sourceId: a.sourceId, baseMinor: a.baseMinor, rateBps: a.rateBps, amountMinor: a.amountMinor, currency: a.currency, accrualOn: a.accrualOn,
          availableOn: holdUntil(a.accrualOn, rules.holdDays), concept: a.concept, createdBy: null }).onConflictDoNothing().returning();
        if (row) {
          added++;
          await notifyRep(tx, a.repId, { kind: "commission_accrued", title: `Comisión devengada: ${money(a.amountMinor, a.currency)}`, body: `${a.concept} · ${d.businessName}. Disponible desde el ${row.availableOn}.`, url: "/ventas?s=comisiones", dedupeKey: `acc:${row.key}` });
        }
      }
      for (const r of diff.reverse) {
        const orig = existing.find((x) => x.key === r.key)!;
        const [row] = await tx.insert(E).values({ key: `rev:${r.key}`, repId: orig.repId, dealId: d.id, orgId: c.orgId, contractId: c.id, planVersionId: v.id, sourceType: "reversal", sourceId: orig.id, reversalOf: r.key,
          amountMinor: -r.amountMinor, currency: orig.currency, accrualOn: t, availableOn: orig.availableOn > t ? orig.availableOn : t, concept: `Reversión: ${orig.concept}`, reason: "El evento que la originó dejó de corresponder (cobro anulado o cambio del primer cobro).", createdBy: null })
          .onConflictDoNothing().returning();
        if (row) {
          reversed++;
          await notifyRep(tx, orig.repId, { kind: "commission_reversed", title: `Comisión revertida: ${money(r.amountMinor, orig.currency)}`, body: `${orig.concept} · ${d.businessName}. El cobro que la originó fue anulado o cambió.`, url: "/ventas?s=comisiones", dedupeKey: `rev:${row.key}` });
          await notifyAdmins(tx, orig.repId, d.businessName, r.amountMinor, orig.currency);
        }
      }
    }
    return { added, reversed };
  });
}
async function notifyAdmins(tx: Tx, repId: string, client: string, amount: number, currency: string) {
  const { notifyAdmins: n } = await import("./core");
  await n(tx, { kind: "commission_discrepancy", title: `Comisión revertida (${client})`, body: `Se revirtieron ${money(amount, currency)}. Si ya estaba pagada, se descuenta de la próxima liquidación.`, url: "/admin?s=sales&tab=ledger", dedupeKey: `rev_admin:${repId}:${client}:${Date.now()}` });
}
/** Para los ganchos de pagos y habilitación: nunca hace fallar la operación original; el error queda en el log. */
export async function syncContractSafe(contractId: string) {
  try { await syncContract(contractId); } catch (e) { logError("sales.commission_sync", e); }
}
export async function syncAll(actorId: string) {
  await salesAdmin(actorId);
  const ids = (await db.selectDistinct({ c: D.contractId }).from(D).where(and(eq(D.status, "approved"), isNotNull(D.contractId)))).map((x) => x.c!);
  let added = 0, reversed = 0;
  for (const id of ids) { const r = await syncContract(id); added += r.added; reversed += r.reversed; }
  await audit(db, { actorUserId: actorId, action: "sales.commission_sync_all", resourceType: "commission_entry", meta: { contracts: ids.length, added, reversed } });
  return { contracts: ids.length, added, reversed };
}

/** Bonos escalonados de un mes cerrado (AAAA-MM). Idempotente por vendedor, versión, componente y mes. */
export async function evaluateTiers(actorId: string, month: string) {
  await salesAdmin(actorId);
  if (!/^\d{4}-\d{2}$/.test(month) || month >= today().slice(0, 7)) throw new AccessError("invalid", "Elegí un mes ya cerrado.");
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const reps = await db.select().from(salesRep);
  const { planVersionAt } = await import("./reps");
  let created = 0;
  for (const r of reps) {
    const pv = await planVersionAt(r.id, last);
    if (!pv) continue;
    const rules = pv.v.rules as CommissionRules;
    for (const [i, c] of rules.components.entries()) {
      if (c.type !== "tier_bonus") continue;
      const deals = await db.select({ members: D.members, approvedAt: D.approvedAt }).from(D).where(and(eq(D.repId, r.id), eq(D.status, "approved")));
      const inMonth = deals.filter((d) => d.approvedAt && localDate(d.approvedAt).startsWith(month));
      const value = c.metric === "approved_deals" ? inMonth.length : inMonth.reduce((a, d) => a + d.members, 0);
      const hit = tierBonusFor(c.tiers, value);
      if (!hit) continue;
      const [row] = await db.insert(E).values({ key: `tier:${r.id}:${pv.v.id}:${i}:${month}`, repId: r.id, planVersionId: pv.v.id, componentIndex: i, component: c.type, sourceType: "tier", sourceId: month,
        baseMinor: value, amountMinor: hit.amountMinor, currency: rules.currency, accrualOn: last, availableOn: holdUntil(last, rules.holdDays),
        concept: `Bono escalonado ${month}: ${value} ${c.metric === "approved_deals" ? "ventas aprobadas" : "socios"} (escalón ${hit.min}+)`, createdBy: actorId }).onConflictDoNothing().returning();
      if (row) { created++; await notifyRep(db, r.id, { kind: "commission_accrued", title: `Bono devengado: ${money(row.amountMinor, row.currency)}`, body: row.concept, url: "/ventas?s=comisiones", dedupeKey: `acc:${row.key}` }); }
    }
  }
  await audit(db, { actorUserId: actorId, action: "sales.tiers_evaluated", resourceType: "commission_entry", meta: { month, created } });
  return { created };
}

/** Ajuste manual auditable (positivo o negativo). Nunca edita un asiento existente. */
export async function adjustCommission(actorId: string, p: { repId: string; amountMinor: number; currency: "ARS" | "USD"; reason: string; dealId?: string | null; idempotencyKey?: string | null }) {
  await salesAdmin(actorId);
  if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor === 0 || Math.abs(p.amountMinor) > 100_000_000_000) throw new AccessError("invalid", "Importe inválido.");
  if (p.currency !== "ARS" && p.currency !== "USD") throw new AccessError("invalid", "Moneda inválida.");
  if ((p.reason ?? "").trim().length < 5) throw new AccessError("invalid", "Explicá el motivo del ajuste.");
  const [r] = await db.select().from(salesRep).where(eq(salesRep.id, p.repId));
  if (!r) throw NF();
  let dealOrg: { orgId: string | null; contractId: string | null } = { orgId: null, contractId: null };
  if (p.dealId) { const [d] = await db.select().from(D).where(and(eq(D.id, p.dealId), eq(D.repId, p.repId))); if (!d) throw new AccessError("invalid", "La venta no es de este vendedor."); dealOrg = { orgId: d.orgId, contractId: d.contractId }; }
  const key = `adj:${(p.idempotencyKey ?? "").trim() || randomUUID()}`;
  const t = today();
  const [row] = await db.insert(E).values({ key, repId: r.id, dealId: p.dealId ?? null, ...dealOrg, sourceType: "adjustment", amountMinor: p.amountMinor, currency: p.currency, accrualOn: t, availableOn: t,
    concept: p.amountMinor > 0 ? "Ajuste a favor" : "Ajuste en contra", reason: p.reason.trim().slice(0, 500), createdBy: actorId }).onConflictDoNothing().returning();
  if (!row) return { repeated: true };
  await audit(db, { actorUserId: actorId, action: "sales.commission_adjusted", resourceType: "commission_entry", resourceId: row.id, meta: { repId: r.id, amountMinor: p.amountMinor, currency: p.currency } });
  await notifyRep(db, r.id, { kind: "commission_adjusted", title: `Ajuste de comisión: ${money(p.amountMinor, p.currency)}`, body: p.reason.trim().slice(0, 300), url: "/ventas?s=comisiones", dedupeKey: `adj:${row.id}` });
  return { id: row.id };
}

// ── Libro y estados ─────────────────────────────────────────────────────────
type Bucket = Record<EntryState | "pending_validation", number>;
const zero = (): Bucket => ({ accrued: 0, available: 0, in_payout: 0, paid: 0, reversed: 0, adjustment: 0, pending_validation: 0 });
export async function ledgerFor(repIds: string[] | null, t = today()) {
  const rows = await db.select({ e: E, batchStatus: payoutBatch.status, batchId: payoutBatch.id, client: organization.name }).from(E)
    .leftJoin(payoutItem, eq(payoutItem.entryId, E.id)).leftJoin(payoutBatch, eq(payoutBatch.id, payoutItem.batchId)).leftJoin(organization, eq(organization.id, E.orgId))
    .where(repIds ? inArray(E.repId, repIds) : undefined).orderBy(desc(E.accrualOn), desc(E.createdAt)).limit(2000);
  const reversedKeys = new Set(rows.filter((r) => r.e.reversalOf).map((r) => r.e.reversalOf!));
  const entries = rows.map(({ e, batchStatus, batchId, client }) => {
    const state = entryState({ amountMinor: e.amountMinor, availableOn: e.availableOn, reversed: reversedKeys.has(e.key), payoutStatus: batchStatus, isReversal: !!e.reversalOf }, t);
    return { id: e.id, repId: e.repId, dealId: e.dealId, client, concept: e.concept, component: e.component, sourceType: e.sourceType, baseMinor: e.baseMinor, rateBps: e.rateBps, amountMinor: e.amountMinor,
      currency: e.currency, accrualOn: e.accrualOn, availableOn: e.availableOn, reason: e.reason, state, stateLabel: e.sourceType === "adjustment" ? ENTRY_STATE_LABEL.adjustment : ENTRY_STATE_LABEL[state],
      reversed: reversedKeys.has(e.key), batchId, createdAt: e.createdAt };
  });
  const totals: Record<string, Bucket> = {};
  for (const x of entries) {
    const b = (totals[x.currency] ??= zero());
    // Saldo: cada asiento (incluidas reversiones y ajustes) suma en su estado; un revertido y su reversión se compensan.
    if (x.state === "reversed") b.reversed += x.amountMinor;
    const s = x.state === "reversed" ? (x.availableOn <= t ? "available" : "accrued") : x.state;
    b[s] += x.amountMinor;
  }
  return { entries, totals };
}

export async function myCommissions(userId: string) {
  const rep = await requireRep(userId, "moneyRead");
  const t = today();
  const { entries, totals } = await ledgerFor([rep.id], t);
  // Pendientes de validación: estimación de las ventas declaradas todavía no aprobadas (no son comisiones).
  const { planVersionAt } = await import("./reps");
  const pv = await planVersionAt(rep.id, t);
  const pending = await db.select().from(D).where(and(eq(D.repId, rep.id), inArray(D.status, ["declared", "needs_correction"])));
  const estimates = pv ? pending.map((d) => ({ dealId: d.id, client: d.businessName, estimate: estimateForDeal(pv.v.rules as CommissionRules, d) })) : [];
  for (const e of estimates) for (const l of e.estimate?.lines ?? []) if (l.amountMinor) (totals[l.currency] ??= zero()).pending_validation += l.amountMinor;
  const batches = await db.select().from(payoutBatch).where(eq(payoutBatch.repId, rep.id)).orderBy(desc(payoutBatch.createdAt)).limit(100);
  return { entries: entries.map(({ repId: _r, ...x }) => x), totals, estimates, batches: batches.map((b) => ({ id: b.id, status: b.status, currency: b.currency, totalMinor: b.totalMinor, paidMinor: b.paidMinor, cutoffOn: b.cutoffOn, createdAt: b.createdAt, approvedAt: b.approvedAt })), labels: ENTRY_STATE_LABEL };
}
export async function adminLedger(actorId: string, f: { repId?: string | null; state?: string | null } = {}) {
  await salesAdmin(actorId);
  const { entries, totals } = await ledgerFor(f.repId ? [f.repId] : null);
  const names = new Map((await db.select({ id: salesRep.id, name: salesRep.name }).from(salesRep)).map((r) => [r.id, r.name]));
  return { entries: entries.filter((e) => !f.state || e.state === f.state).slice(0, 500).map((e) => ({ ...e, repName: names.get(e.repId) ?? "—" })), totals };
}
