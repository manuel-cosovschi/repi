// REPI Sales Force (D209) · indicadores del vendedor, centro de control comercial de Admin, objetivos y material.
// Fórmulas explícitas (SALES_DEFINITIONS). Nunca se mezcla lo contratado (cantidad × precio vigentes) con lo cobrado
// (pagos registrados por Admin) ni con las comisiones. Monedas distintas nunca se suman.
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  MATERIAL_KINDS, OPEN_STAGES, PAYOUT_FREQUENCY, STAGES, TARGET_METRICS, isMaterialKind, isTargetMetric, localDate, nextPayoutDate, termAt,
  type Currency, type PayoutFrequency, type Stage, type Term,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, NF, audit, clean, notifyRep, requireRep, salesAdmin, today } from "./core";
import { ledgerFor } from "./commissions";
import { publicRep } from "./reps";

const { salesDeal: D, salesOpportunity: O, salesProspect: P, salesActivity: A, salesAttribution: AT, salesRep, salesTarget: T, salesMaterial: M, clientContract, contractTerm, billingPayment, payoutBatch, organization } = schema;

export const SALES_DEFINITIONS = {
  confirmed: "Ventas aprobadas por REPI Admin con fecha de aprobación en el período.",
  pending: "Ventas declaradas o con corrección pedida, todavía sin resolver (hoy).",
  newClients: "Clientes atribuidos al vendedor (cerró la venta) que REPI habilitó dentro del período.",
  activeClients: "Clientes con atribución vigente al vendedor y contrato habilitado.",
  negotiating: "Oportunidades propias entre «Interesado» y «Cierre declarado».",
  members: "Suma de la cantidad acordada vigente hoy en los clientes activos (no son usuarios habilitados en la app).",
  contracted: "Contratado mensual: cantidad acordada × precio por unidad vigentes hoy, por moneda. No es lo cobrado.",
  collected: "Pagos externos registrados por Admin en el período para contratos atribuidos (base de las comisiones %).",
  commissions: "Asientos del libro de comisiones por estado: devengada (en retención), disponible, en liquidación y pagada.",
  conversion: "Ventas aprobadas en el período ÷ oportunidades creadas en el período.",
  timeToClose: "Días promedio entre la creación de la oportunidad y la aprobación de su venta.",
  retention: "Clientes atribuidos con contrato suspendido o finalizado ÷ clientes atribuidos.",
} as const;

type Range = { start: string; end: string };
export function periodRange(period: string, t = today()): { cur: Range; prev: Range; label: string } {
  const [y, m] = t.split("-").map(Number);
  const mon = (yy: number, mm: number) => { const d = new Date(Date.UTC(yy, mm - 1, 1)); const e = new Date(Date.UTC(yy, mm, 0)); return { start: d.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) }; };
  if (period === "prev_month") return { cur: mon(y, m - 1), prev: mon(y, m - 2), label: "Mes anterior" };
  if (period === "quarter") { const s = mon(y, m - 2).start; return { cur: { start: s, end: t }, prev: { start: mon(y, m - 5).start, end: mon(y, m - 3).end }, label: "Últimos 3 meses" }; }
  if (period === "year") return { cur: { start: `${y}-01-01`, end: t }, prev: { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }, label: `Año ${y}` };
  return { cur: { start: mon(y, m).start, end: t }, prev: mon(y, m - 1), label: "Este mes" };
}
const inRange = (d: Date | string | null | undefined, r: Range) => { if (!d) return false; const s = typeof d === "string" ? d : localDate(d); return s >= r.start && s <= r.end; };
const addCur = (o: Record<string, number>, c: string, v: number) => { o[c] = (o[c] ?? 0) + v; };

async function termsByContract(ids: string[]) {
  const rows = ids.length ? await db.select().from(contractTerm).where(inArray(contractTerm.contractId, ids)) : [];
  const m = new Map<string, Term[]>();
  for (const t of rows) (m.get(t.contractId) ?? m.set(t.contractId, []).get(t.contractId)!).push({ id: t.id, kind: t.kind, version: t.version, value: t.value, currency: (t.currency as Currency) ?? null, effectiveFrom: t.effectiveFrom, createdAt: t.createdAt });
  return m;
}

/** Métricas comerciales de un conjunto de vendedores (uno para su panel; todos o filtrados para Admin). */
async function metricsFor(repIds: string[], r: Range, t: string) {
  if (!repIds.length) return { confirmed: 0, membersSold: 0, pending: 0, newClients: 0, activeClients: 0, negotiating: 0, members: 0, contracted: {} as Record<string, number>, collected: {} as Record<string, number>, retentionLost: 0, attributed: 0 };
  const deals = await db.select().from(D).where(inArray(D.repId, repIds));
  const confirmed = deals.filter((d) => d.status === "approved" && inRange(d.approvedAt, r));
  const pending = deals.filter((d) => d.status === "declared" || d.status === "needs_correction").length;
  const attr = await db.select({ a: AT, c: clientContract }).from(AT).innerJoin(clientContract, eq(clientContract.orgId, AT.orgId))
    .where(and(isNull(AT.endedAt), or(inArray(AT.assignedRepId, repIds), inArray(AT.closingRepId, repIds))));
  const terms = await termsByContract(attr.map((x) => x.c.id));
  const active = attr.filter((x) => x.c.status === "enabled" && x.a.assignedRepId && repIds.includes(x.a.assignedRepId));
  const contracted: Record<string, number> = {};
  let members = 0;
  for (const x of active) {
    const ts = terms.get(x.c.id) ?? [];
    const q = termAt(ts, "quantity", t), p = termAt(ts, "unit_price", t);
    if (q) members += q.value;
    if (q && p) addCur(contracted, p.currency ?? x.c.currency, q.value * p.value);
  }
  const newClients = attr.filter((x) => x.a.closingRepId && repIds.includes(x.a.closingRepId) && inRange(x.c.enabledAt, r)).length;
  const pays = attr.length ? await db.select().from(billingPayment).where(and(inArray(billingPayment.contractId, attr.map((x) => x.c.id)), eq(billingPayment.status, "recorded"), gte(billingPayment.receivedOn, r.start), lte(billingPayment.receivedOn, r.end))) : [];
  const collected: Record<string, number> = {};
  for (const p of pays) addCur(collected, p.currency, p.amountMinor);
  const [{ n: negotiating }] = await db.select({ n: sql<number>`count(*)::int` }).from(O).where(and(inArray(O.repId, repIds), inArray(O.stage, ["interested", "meeting", "demo", "proposal", "negotiation", "declared"])));
  return { confirmed: confirmed.length, membersSold: confirmed.reduce((a, d) => a + d.members, 0), pending, newClients, activeClients: active.length, negotiating, members, contracted, collected,
    retentionLost: attr.filter((x) => x.c.status === "suspended" || x.c.status === "ended").length, attributed: attr.length };
}

// ── Objetivos ───────────────────────────────────────────────────────────────
export async function targetProgress(repId: string, month: string) {
  const targets = await db.select().from(T).where(and(eq(T.repId, repId), eq(T.month, month)));
  if (!targets.length) return [];
  const r: Range = { start: `${month}-01`, end: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) };
  const deals = (await db.select().from(D).where(and(eq(D.repId, repId), eq(D.status, "approved")))).filter((d) => inRange(d.approvedAt, r));
  const acts = (await db.select({ kind: A.kind, at: A.createdAt }).from(A).where(and(eq(A.repId, repId), eq(A.actorRole, "rep")))).filter((a) => inRange(a.at, r));
  return targets.map((x) => {
    const actual = x.metric === "new_clients" ? deals.filter((d) => d.kind === "new").length
      : x.metric === "contacts" ? acts.filter((a) => ["call", "whatsapp", "email", "visit"].includes(a.kind)).length
      : x.metric === "meetings" ? acts.filter((a) => a.kind === "meeting").length
      : x.metric === "demos" ? acts.filter((a) => a.kind === "demo").length
      : x.metric === "approved_deals" ? deals.length
      : x.metric === "agreed_members" ? deals.reduce((a, d) => a + d.members, 0)
      : deals.filter((d) => d.currency === (x.currency ?? "ARS")).reduce((a, d) => a + d.members * d.unitPriceMinor, 0);
    return { id: x.id, metric: x.metric, label: TARGET_METRICS[x.metric as keyof typeof TARGET_METRICS] ?? x.metric, target: x.target, currency: x.currency, actual, pct: x.target ? Math.round((actual / x.target) * 100) : null };
  });
}
export async function setTarget(actorId: string, repId: string, p: { month: string; metric: string; target: number; currency?: string | null }) {
  await salesAdmin(actorId);
  if (!/^\d{4}-\d{2}$/.test(p.month)) throw new AccessError("invalid", "Mes inválido.");
  if (!isTargetMetric(p.metric)) throw new AccessError("invalid", "Métrica inválida.");
  if (!Number.isSafeInteger(p.target) || p.target <= 0) throw new AccessError("invalid", "El objetivo tiene que ser mayor que cero.");
  const currency = p.metric === "contract_value" ? (p.currency === "USD" ? "USD" : "ARS") : null;
  const [r] = await db.select({ id: salesRep.id }).from(salesRep).where(eq(salesRep.id, repId));
  if (!r) throw NF();
  await db.insert(T).values({ repId, month: p.month, metric: p.metric, target: p.target, currency, createdBy: actorId })
    .onConflictDoUpdate({ target: [T.repId, T.month, T.metric], set: { target: p.target, currency, updatedAt: new Date() } });
  await audit(db, { actorUserId: actorId, action: "sales.target_set", resourceType: "sales_rep", resourceId: repId, meta: { month: p.month, metric: p.metric, target: p.target } });
  await notifyRep(db, repId, { kind: "target", title: `Objetivo ${p.month}: ${TARGET_METRICS[p.metric]}`, body: `Meta: ${p.target}.`, url: "/ventas?s=objetivos", dedupeKey: `target:${p.month}:${p.metric}:${p.target}` });
  return { ok: true };
}
export async function deleteTarget(actorId: string, targetId: string) {
  await salesAdmin(actorId);
  const r = await db.delete(T).where(eq(T.id, targetId)).returning();
  if (!r.length) throw NF();
  await audit(db, { actorUserId: actorId, action: "sales.target_deleted", resourceType: "sales_rep", resourceId: r[0].repId, meta: { month: r[0].month, metric: r[0].metric } });
  return { ok: true };
}
export async function myTargets(userId: string) {
  const rep = await requireRep(userId, "crmRead");
  const t = today();
  const months = [t.slice(0, 7), localDate(new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 2, 15))).slice(0, 7)];
  return Promise.all(months.map(async (m) => ({ month: m, items: await targetProgress(rep.id, m) })));
}

// ── Panel del vendedor ──────────────────────────────────────────────────────
export async function myDashboard(userId: string, period = "month") {
  const rep = await requireRep(userId, "moneyRead");
  const t = today();
  const pr = periodRange(period, t);
  const crm = rep.status === "active" || rep.status === "paused";
  const [cur, prev] = await Promise.all([metricsFor([rep.id], pr.cur, t), metricsFor([rep.id], pr.prev, t)]);
  const { totals } = await ledgerFor([rep.id], t);
  const opps = crm ? await db.select().from(O).where(and(eq(O.repId, rep.id), inArray(O.stage, OPEN_STAGES))) : [];
  const quality = { open: opps.length, withNext: opps.filter((o) => o.nextContactOn).length, overdue: opps.filter((o) => o.nextContactOn && o.nextContactOn < t).length,
    stale: opps.filter((o) => o.updatedAt.getTime() < Date.now() - 14 * 86_400_000).length };
  const freq = rep.payoutFrequency as PayoutFrequency;
  return {
    rep: publicRep(rep), period: { ...pr, key: period }, current: cur, previous: prev, commissions: totals, quality,
    nextPayout: { frequency: PAYOUT_FREQUENCY[freq], date: nextPayoutDate(freq, t), note: freq === "custom" ? rep.payoutNote : null },
    targets: await targetProgress(rep.id, t.slice(0, 7)), definitions: SALES_DEFINITIONS,
  };
}

// ── Centro de control (Admin) ───────────────────────────────────────────────
export async function controlCenter(actorId: string, f: { period?: string | null; repId?: string | null; province?: string | null; clientKind?: string | null; source?: string | null } = {}) {
  await salesAdmin(actorId);
  const t = today();
  const pr = periodRange(f.period ?? "month", t);
  const repsAll = await db.select().from(salesRep).orderBy(asc(salesRep.name));
  const reps = repsAll.filter((r) => (!f.repId || r.id === f.repId) && (!f.province || (r.province ?? "").toLowerCase() === f.province.toLowerCase()));
  const ids = reps.map((r) => r.id);
  const allOpps = ids.length ? await db.select({ o: O, p: P }).from(O).innerJoin(P, eq(P.id, O.prospectId)).where(inArray(O.repId, ids)) : [];
  const opps = allOpps.filter((x) => (!f.clientKind || x.p.kind === f.clientKind) && (!f.source || x.p.source === f.source));
  const byStage = Object.fromEntries((Object.keys(STAGES) as Stage[]).map((s) => [s, opps.filter((x) => x.o.stage === s).length]));
  const deals = ids.length ? (await db.select().from(D).where(inArray(D.repId, ids))).filter((d) => !f.clientKind || d.clientKind === f.clientKind) : [];
  const approvedInRange = deals.filter((d) => d.status === "approved" && inRange(d.approvedAt, pr.cur));
  const oppsCreated = opps.filter((x) => inRange(x.o.createdAt, pr.cur)).length;
  const closeDays = approvedInRange.map((d) => { const o = opps.find((x) => x.o.id === d.opportunityId); return o && d.approvedAt ? (d.approvedAt.getTime() - o.o.createdAt.getTime()) / 86_400_000 : null; }).filter((x): x is number => x !== null);
  const m = await metricsFor(ids, pr.cur, t);
  const { entries, totals } = await ledgerFor(ids.length ? ids : ["-"], t);
  const perRep = [];
  for (const r of reps) {
    const rm = await metricsFor([r.id], pr.cur, t);
    const owed: Record<string, number> = {}, paid: Record<string, number> = {}, accrued: Record<string, number> = {};
    for (const e of entries.filter((x) => x.repId === r.id)) {
      if (e.state === "paid") addCur(paid, e.currency, e.amountMinor); else addCur(owed, e.currency, e.amountMinor);
      if (inRange(e.accrualOn, pr.cur)) addCur(accrued, e.currency, e.amountMinor);
    }
    perRep.push({ id: r.id, name: r.name, code: r.code, province: r.province, status: r.status, approved: rm.confirmed, membersSold: rm.membersSold, pending: rm.pending, activeClients: rm.activeClients,
      contracted: rm.contracted, collected: rm.collected, accrued, owed, paid, openOpps: opps.filter((x) => x.o.repId === r.id && OPEN_STAGES.includes(x.o.stage as Stage)).length });
  }
  const byProvince = new Map<string, { approved: number; members: number; reps: number }>();
  for (const r of perRep) { const k = r.province || "Sin provincia"; const x = byProvince.get(k) ?? { approved: 0, members: 0, reps: 0 }; x.approved += r.approved; x.members += r.membersSold; x.reps++; byProvince.set(k, x); }
  // Evolución: últimos 6 meses de ventas aprobadas y socios contratados.
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const ds = deals.filter((x) => x.status === "approved" && x.approvedAt && localDate(x.approvedAt).startsWith(key));
    trend.push({ month: key, approved: ds.length, members: ds.reduce((a, x) => a + x.members, 0) });
  }
  const [{ n: prospects }] = await db.select({ n: sql<number>`count(*)::int` }).from(P).where(isNull(P.archivedAt));
  return {
    period: pr, filters: f, provinces: [...new Set(repsAll.map((r) => r.province).filter(Boolean))].sort(),
    reps: repsAll.map((r) => ({ id: r.id, name: r.name })),
    kpis: {
      activeReps: repsAll.filter((r) => r.status === "active").length, prospects, openOpportunities: opps.filter((x) => OPEN_STAGES.includes(x.o.stage as Stage)).length,
      approved: approvedInRange.length, clientsObtained: approvedInRange.filter((d) => d.kind === "new").length, membersSold: approvedInRange.reduce((a, d) => a + d.members, 0),
      pendingReview: deals.filter((d) => d.status === "declared").length, needsCorrection: deals.filter((d) => d.status === "needs_correction").length,
      conversionPct: oppsCreated ? Math.round((approvedInRange.length / oppsCreated) * 100) : null, avgDaysToClose: closeDays.length ? Math.round(closeDays.reduce((a, x) => a + x, 0) / closeDays.length) : null,
      contracted: m.contracted, collected: m.collected, commissions: totals, retentionLostPct: m.attributed ? Math.round((m.retentionLost / m.attributed) * 100) : null, attributedClients: m.attributed,
    },
    byStage, perRep, byProvince: [...byProvince.entries()].map(([province, x]) => ({ province, ...x })), trend, definitions: SALES_DEFINITIONS,
  };
}

/** Ficha completa del vendedor para Admin. */
export async function repProfile(actorId: string, repId: string) {
  await salesAdmin(actorId);
  const [r] = await db.select().from(salesRep).where(eq(salesRep.id, repId));
  if (!r) throw NF();
  const t = today();
  const invitations = await db.select().from(schema.salesRepInvitation).where(eq(schema.salesRepInvitation.repId, repId)).orderBy(desc(schema.salesRepInvitation.createdAt));
  const plans = await db.select({ a: schema.salesRepPlan, v: schema.commissionPlanVersion, p: schema.commissionPlan }).from(schema.salesRepPlan)
    .innerJoin(schema.commissionPlanVersion, eq(schema.commissionPlanVersion.id, schema.salesRepPlan.planVersionId)).innerJoin(schema.commissionPlan, eq(schema.commissionPlan.id, schema.commissionPlanVersion.planId))
    .where(eq(schema.salesRepPlan.repId, repId)).orderBy(desc(schema.salesRepPlan.effectiveFrom), desc(schema.salesRepPlan.createdAt));
  const clients = await db.select({ a: AT, name: organization.name, status: clientContract.status }).from(AT).innerJoin(organization, eq(organization.id, AT.orgId)).innerJoin(clientContract, eq(clientContract.orgId, AT.orgId))
    .where(and(isNull(AT.endedAt), or(eq(AT.assignedRepId, repId), eq(AT.closingRepId, repId), eq(AT.originRepId, repId))));
  const deals = await db.select().from(D).where(eq(D.repId, repId)).orderBy(desc(D.createdAt)).limit(100);
  const funnel = Object.fromEntries((Object.keys(STAGES) as Stage[]).map((s) => [s, 0]));
  for (const o of await db.select({ stage: O.stage }).from(O).where(eq(O.repId, repId))) funnel[o.stage]++;
  const { totals } = await ledgerFor([repId], t);
  const batches = await db.select().from(payoutBatch).where(eq(payoutBatch.repId, repId)).orderBy(desc(payoutBatch.createdAt)).limit(50);
  const acts = await db.select({ a: A, name: P.name }).from(A).leftJoin(P, eq(P.id, A.prospectId)).where(eq(A.repId, repId)).orderBy(desc(A.createdAt)).limit(40);
  const overdue = (await db.select({ id: A.id }).from(A).where(and(eq(A.repId, repId), inArray(A.kind, ["task", "reminder"]), isNull(A.doneAt), lte(A.dueOn, t)))).length;
  const history = await db.select().from(schema.auditEvent).where(or(eq(schema.auditEvent.resourceId, repId), sql`${schema.auditEvent.meta}->>'repId' = ${repId}`)).orderBy(desc(schema.auditEvent.at)).limit(60);
  const [region] = r.regionId ? await db.select().from(schema.salesRegion).where(eq(schema.salesRegion.id, r.regionId)) : [];
  const [mgr] = r.managerRepId ? await db.select({ name: salesRep.name }).from(salesRep).where(eq(salesRep.id, r.managerRepId)) : [];
  return {
    rep: { ...publicRep(r), regionId: r.regionId, managerRepId: r.managerRepId, agreementRef: r.agreementRef, statusReason: r.statusReason, terminatedAt: r.terminatedAt, createdAt: r.createdAt, userLinked: !!r.userId },
    region: region?.name ?? null, manager: mgr?.name ?? null,
    invitations: invitations.map((i) => ({ id: i.id, status: i.status, delivery: i.delivery, expiresAt: i.expiresAt, createdAt: i.createdAt, acceptedAt: i.acceptedAt })),
    plans: plans.map(({ a, v, p }) => ({ id: a.id, plan: p.name, version: v.version, versionId: v.id, effectiveFrom: a.effectiveFrom, reason: a.reason, rules: v.rules })),
    clients: clients.map(({ a, name, status }) => ({ orgId: a.orgId, name, contractStatus: status, roles: [a.originRepId === repId && "origen", a.closingRepId === repId && "cierre", a.assignedRepId === repId && "asignado"].filter(Boolean) })),
    deals: deals.map((d) => ({ id: d.id, businessName: d.businessName, status: d.status, kind: d.kind, members: d.members, unitPriceMinor: d.unitPriceMinor, currency: d.currency, createdAt: d.createdAt, approvedAt: d.approvedAt })),
    funnel, commissions: totals, batches: batches.map((b) => ({ ...b, snapshot: undefined })),
    targets: await targetProgress(repId, t.slice(0, 7)),
    activity: acts.map(({ a, name }) => ({ id: a.id, kind: a.kind, summary: a.summary, prospect: name, at: a.createdAt, actorRole: a.actorRole })),
    alerts: [overdue && `${overdue} tarea(s) o recordatorio(s) vencidos`, deals.filter((d) => d.status === "declared").length && `${deals.filter((d) => d.status === "declared").length} venta(s) esperando revisión`,
      !plans.length && "Sin plan de comisiones asignado", r.status === "pending_acceptance" && "Invitación pendiente de aceptación"].filter(Boolean),
    history: history.map((h) => ({ action: h.action, result: h.result, at: h.at, actor: h.actorUserId })),
  };
}

// ── Material de ventas ──────────────────────────────────────────────────────
type MaterialInput = { kind: string; title: string; description?: string | null; url?: string | null; body?: string | null; validUntil?: string | null };
function materialValues(p: MaterialInput) {
  if (!isMaterialKind(p.kind)) throw new AccessError("invalid", "Tipo de material inválido.");
  if ((p.title ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí un título.");
  const url = (p.url ?? "").trim();
  if (url && !/^https:\/\/[^\s]+$|^\/[^\s/][^\s]*$/.test(url)) throw new AccessError("invalid", "El enlace tiene que empezar con https:// o ser una ruta de REPI.");
  if (!url && !(p.body ?? "").trim()) throw new AccessError("invalid", "Agregá un enlace o un texto.");
  if (p.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil)) throw new AccessError("invalid", "Fecha de vigencia inválida.");
  return { kind: p.kind, title: p.title.trim().slice(0, 160), description: clean(p.description, 600), url: url || null, body: clean(p.body, 8000), validUntil: p.validUntil || null };
}
export async function adminMaterials(actorId: string) {
  await salesAdmin(actorId);
  return db.select().from(M).orderBy(desc(M.updatedAt));
}
export async function saveMaterial(actorId: string, p: MaterialInput & { id?: string | null }) {
  await salesAdmin(actorId);
  const v = materialValues(p);
  if (p.id) {
    const [cur] = await db.select().from(M).where(eq(M.id, p.id));
    if (!cur) throw NF();
    const changed = cur.url !== v.url || cur.body !== v.body || cur.title !== v.title || cur.validUntil !== v.validUntil;
    await db.update(M).set({ ...v, version: changed ? cur.version + 1 : cur.version, updatedBy: actorId, updatedAt: new Date() }).where(eq(M.id, p.id));
    await audit(db, { actorUserId: actorId, action: "sales.material_updated", resourceType: "sales_material", resourceId: p.id, meta: { version: changed ? cur.version + 1 : cur.version } });
    return { id: p.id };
  }
  const [r] = await db.insert(M).values({ ...v, createdBy: actorId, updatedBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, action: "sales.material_created", resourceType: "sales_material", resourceId: r.id });
  return { id: r.id };
}
export async function setMaterialStatus(actorId: string, id: string, status: "draft" | "published" | "archived") {
  await salesAdmin(actorId);
  if (!["draft", "published", "archived"].includes(status)) throw new AccessError("invalid", "Estado inválido.");
  const r = await db.update(M).set({ status, publishedAt: status === "published" ? new Date() : undefined, updatedBy: actorId, updatedAt: new Date() }).where(eq(M.id, id)).returning();
  if (!r.length) throw NF();
  await audit(db, { actorUserId: actorId, action: "sales.material_status", resourceType: "sales_material", resourceId: id, meta: { status } });
  return { ok: true };
}
/** Material publicado para vendedores. Lo vencido se muestra con advertencia, nunca como vigente. */
export async function myMaterials(userId: string) {
  await requireRep(userId, "crmRead");
  const t = today();
  const rows = await db.select().from(M).where(eq(M.status, "published")).orderBy(asc(M.kind), desc(M.updatedAt));
  return rows.map((m) => ({ id: m.id, kind: m.kind, kindLabel: MATERIAL_KINDS[m.kind as keyof typeof MATERIAL_KINDS] ?? m.kind, title: m.title, description: m.description, url: m.url, body: m.body, version: m.version, validUntil: m.validUntil,
    expired: !!m.validUntil && m.validUntil < t, updatedAt: m.updatedAt }));
}
