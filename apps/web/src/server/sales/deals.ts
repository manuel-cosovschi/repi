// REPI Sales Force (D209) · ventas declaradas, revisión de Admin, vínculo con clientes y contratos reales y atribución.
// El vendedor carga y propone; nunca habilita un cliente ni cambia un contrato. La aprobación comercial, la aceptación del
// contrato, la habilitación y el pago son eventos distintos: aprobar crea (o vincula) el cliente en BORRADOR y sigue el
// circuito existente de Clientes (aceptación registrada → habilitación → bienvenida).
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  ACTIVATION_LABEL, DEAL_KIND, DEAL_STATUS, DUP_SIGNAL_LABEL, PAYOUT_FREQUENCY, activationStage, dealPreview, fmtMoney, isBillingPeriodicity, isEmail, isPayoutFrequency, normalizeEmail,
  termAt, validateRules, validateSplit, type CommissionRules, type ContractStatus, type Currency, type DealKind, type Split, type Term,
} from "@repi/domain";
import { db, schema } from "@/db";
import { addTermTx, createClientTx, publishTermNotice, type TermInput } from "../commercial/services";
import { enabledAccesses } from "../join/services";
import { AccessError, NF, audit, clean, isDay, logActivity, notifyAdmins, notifyRep, requireRep, salesAdmin, today, type Rep } from "./core";
import { scanDuplicates } from "./crm";
import { planVersionAt } from "./reps";
import { estimateForDeal, syncContractSafe } from "./commissions";

const { salesDeal: D, salesOpportunity: O, salesProspect: P, salesAttribution: AT, salesRep, salesRequest, clientContract, contractTerm, organization, commissionPlanVersion, commissionPlan, billingPayment, user } = schema;

export type DealInput = {
  idempotencyKey: string; prospectId?: string | null; opportunityId?: string | null; kind?: DealKind; clientKind: "gym" | "coach"; orgId?: string | null;
  businessName: string; legalName?: string | null; cuit?: string | null; contactName: string; contactEmail?: string | null; contactPhone?: string | null;
  city?: string | null; province?: string | null; address?: string | null; locations?: string[] | null;
  members: number; unitPriceMinor: number; currency: "ARS" | "USD"; periodicity: string; contractStart: string; durationMonths?: number | null; renewalNote?: string | null;
  discountBps?: number | null; setupFeeMinor?: number | null; specialConditions?: string | null; evidence: string; closedOn: string; notes?: string | null;
};

function dealValues(p: DealInput, t: string) {
  const errs: string[] = [];
  if ((p.businessName ?? "").trim().length < 2) errs.push("gimnasio o cliente");
  if ((p.contactName ?? "").trim().length < 2) errs.push("responsable");
  if (!isEmail(p.contactEmail) && (p.contactPhone ?? "").replace(/\D/g, "").length < 8) errs.push("email o teléfono del responsable");
  if (p.contactEmail && !isEmail(p.contactEmail)) errs.push("email válido");
  if (p.currency !== "ARS" && p.currency !== "USD") errs.push("moneda");
  if (!isBillingPeriodicity(p.periodicity)) errs.push("periodicidad");
  if (!isDay(p.closedOn) || p.closedOn > t) errs.push("fecha de cierre (no futura)");
  if ((p.evidence ?? "").trim().length < 5) errs.push("evidencia del acuerdo (link, número de propuesta o descripción)");
  if (p.cuit && p.cuit.replace(/\D/g, "").length !== 11) errs.push("CUIT de 11 dígitos");
  if (!["gym", "coach"].includes(p.clientKind)) errs.push("tipo de cliente");
  const prev = dealPreview({ members: p.members, unitPriceMinor: p.unitPriceMinor, periodicity: p.periodicity as never, contractStart: p.contractStart, durationMonths: p.durationMonths, discountBps: p.discountBps, setupFeeMinor: p.setupFeeMinor });
  if (!prev.ok) errs.push(...prev.errors.map((e) => e.replace(/\.$/, "").toLowerCase()));
  if (errs.length) throw new AccessError("invalid", `Revisá: ${errs.join(", ")}.`);
  return {
    kind: (["new", "renewal", "modification"].includes(p.kind ?? "new") ? p.kind ?? "new" : "new") as DealKind, clientKind: p.clientKind,
    businessName: p.businessName.trim().slice(0, 120), legalName: clean(p.legalName, 160), cuit: p.cuit ? p.cuit.replace(/\D/g, "") : null,
    contactName: p.contactName.trim().slice(0, 80), contactEmail: p.contactEmail ? normalizeEmail(p.contactEmail) : null, contactPhone: clean(p.contactPhone, 40),
    city: clean(p.city, 80), province: clean(p.province, 80), address: clean(p.address, 200), locations: (p.locations ?? []).map((l) => l.trim().slice(0, 80)).filter(Boolean).slice(0, 30),
    members: p.members, unitPriceMinor: p.unitPriceMinor, currency: p.currency, periodicity: p.periodicity as "monthly", contractStart: p.contractStart, durationMonths: p.durationMonths ?? null,
    renewalNote: clean(p.renewalNote, 300), discountBps: p.discountBps ?? 0, setupFeeMinor: p.setupFeeMinor ?? 0, specialConditions: clean(p.specialConditions, 1000),
    evidence: p.evidence.trim().slice(0, 1000), closedOn: p.closedOn, notes: clean(p.notes, 1000),
  };
}

/** Clientes cuya atribución vigente tiene al vendedor como asignado o como quien cerró. */
async function myOrgIds(repId: string) {
  const rows = await db.select({ orgId: AT.orgId }).from(AT).where(and(isNull(AT.endedAt), or(eq(AT.assignedRepId, repId), eq(AT.closingRepId, repId))));
  return new Set(rows.map((r) => r.orgId));
}

/**
 * Declarar una venta cerrada. Idempotente por clave del cliente: un reintento por red devuelve la misma venta. Empieza
 * como «pendiente de revisión»; no devenga comisiones ni toca clientes o contratos.
 */
export async function declareDeal(userId: string, p: DealInput) {
  const rep = await requireRep(userId, "dealsWrite");
  const key = (p.idempotencyKey ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new AccessError("invalid", "Falta la clave de envío. Recargá la pantalla.");
  const [again] = await db.select().from(D).where(and(eq(D.repId, rep.id), eq(D.idempotencyKey, key)));
  if (again) return { id: again.id, status: again.status, repeated: true };
  const v = dealValues(p, today());
  if (v.clientKind === "coach" && !rep.canSellCoaches) throw new AccessError("forbidden", "Tu acuerdo comercial no incluye venta a entrenadores independientes.", 403);
  if (p.prospectId) { const [x] = await db.select({ id: P.id }).from(P).where(and(eq(P.id, p.prospectId), eq(P.ownerRepId, rep.id))); if (!x) throw NF(); }
  let opp: typeof O.$inferSelect | null = null;
  if (p.opportunityId) {
    [opp] = await db.select().from(O).where(and(eq(O.id, p.opportunityId), eq(O.repId, rep.id)));
    if (!opp) throw NF();
    if (["won", "pending_validation"].includes(opp.stage)) throw new AccessError("invalid_state", "Esa oportunidad ya tiene una venta en revisión o aprobada.", 409);
  }
  if (p.orgId) {
    if (!(await myOrgIds(rep.id)).has(p.orgId)) throw NF();
  } else if (v.kind !== "new") throw new AccessError("invalid", "Para una renovación o ampliación elegí el cliente en «Mis clientes».");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(D).values({ ...v, repId: rep.id, idempotencyKey: key, prospectId: p.prospectId ?? opp?.prospectId ?? null, opportunityId: opp?.id ?? null, orgId: p.orgId ?? null })
      .onConflictDoNothing().returning();
    if (!row) { const [x] = await tx.select().from(D).where(and(eq(D.repId, rep.id), eq(D.idempotencyKey, key))); return { id: x.id, status: x.status, repeated: true }; }
    if (opp) await tx.update(O).set({ stage: "pending_validation", stageChangedAt: new Date(), revision: sql`${O.revision} + 1`, updatedAt: new Date() }).where(eq(O.id, opp.id));
    await logActivity(tx, { prospectId: row.prospectId, opportunityId: row.opportunityId, dealId: row.id, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "deal",
      summary: `Venta declarada: ${row.members} socios × ${fmtMoney(row.unitPriceMinor, row.currency as Currency)}. Pendiente de revisión.` });
    await notifyAdmins(tx, { kind: "deal_declared", title: `Nueva venta declarada: ${row.businessName}`, body: `${rep.name} · ${row.members} socios × ${fmtMoney(row.unitPriceMinor, row.currency as Currency)}.`, url: `/admin?s=sales&tab=deals&deal=${row.id}`, dedupeKey: `deal:${row.id}` });
    await audit(tx, { actorUserId: userId, action: "sales.deal_declared", resourceType: "sales_deal", resourceId: row.id });
    return { id: row.id, status: row.status, repeated: false };
  });
}

async function ownDeal(rep: Rep, dealId: string) {
  const [d] = await db.select().from(D).where(and(eq(D.id, dealId), eq(D.repId, rep.id)));
  if (!d) throw NF();
  return d;
}
/** Corregir una venta pedida a corregir (o todavía sin revisar) y volver a enviarla. Lo aprobado no se modifica. */
export async function updateDeal(userId: string, dealId: string, p: Omit<DealInput, "idempotencyKey"> & { revision: number }) {
  const rep = await requireRep(userId, "dealsWrite");
  const d = await ownDeal(rep, dealId);
  if (d.status !== "declared" && d.status !== "needs_correction") throw new AccessError("invalid_state", "Esta venta ya fue resuelta: no se puede modificar.", 409);
  const v = dealValues({ ...p, idempotencyKey: d.idempotencyKey, kind: d.kind as DealKind, orgId: d.orgId }, today());
  if (v.clientKind === "coach" && !rep.canSellCoaches) throw new AccessError("forbidden", "Tu acuerdo comercial no incluye venta a entrenadores independientes.", 403);
  return db.transaction(async (tx) => {
    const r = await tx.update(D).set({ ...v, kind: d.kind as DealKind, status: "declared", revision: sql`${D.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(D.id, dealId), eq(D.revision, p.revision), inArray(D.status, ["declared", "needs_correction"]))).returning();
    if (!r.length) throw new AccessError("stale", "La venta cambió mientras la editabas (puede que Admin la haya revisado). Recargá.", 409);
    await logActivity(tx, { prospectId: d.prospectId, opportunityId: d.opportunityId, dealId, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "deal", summary: d.status === "needs_correction" ? "Corrección enviada." : "Venta editada antes de la revisión." });
    if (d.status === "needs_correction") await notifyAdmins(tx, { kind: "deal_corrected", title: `Corrección enviada: ${v.businessName}`, body: `${rep.name} reenvió la venta.`, url: `/admin?s=sales&tab=deals&deal=${dealId}`, dedupeKey: `deal_fix:${dealId}:${r[0].revision}` });
    return { revision: r[0].revision };
  });
}
export async function withdrawDeal(userId: string, dealId: string) {
  const rep = await requireRep(userId, "dealsWrite");
  const d = await ownDeal(rep, dealId);
  return db.transaction(async (tx) => {
    const r = await tx.update(D).set({ status: "withdrawn", updatedAt: new Date() }).where(and(eq(D.id, dealId), inArray(D.status, ["declared", "needs_correction"]))).returning();
    if (!r.length) throw new AccessError("invalid_state", "Sólo se retira una venta que todavía no fue resuelta.", 409);
    if (d.opportunityId) await tx.update(O).set({ stage: "negotiation", stageChangedAt: new Date(), revision: sql`${O.revision} + 1`, updatedAt: new Date() }).where(and(eq(O.id, d.opportunityId), eq(O.stage, "pending_validation")));
    await logActivity(tx, { prospectId: d.prospectId, opportunityId: d.opportunityId, dealId, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "deal", summary: "Venta retirada por el vendedor." });
    return { status: "withdrawn" };
  });
}

function dealView(d: typeof D.$inferSelect) {
  const prev = dealPreview({ members: d.members, unitPriceMinor: d.unitPriceMinor, periodicity: d.periodicity, contractStart: d.contractStart, durationMonths: d.durationMonths, discountBps: d.discountBps, setupFeeMinor: d.setupFeeMinor });
  return { ...d, statusLabel: DEAL_STATUS[d.status], kindLabel: DEAL_KIND[d.kind as DealKind], preview: prev.ok ? prev : null };
}
export async function myDeals(userId: string) {
  const rep = await requireRep(userId, "crmRead");
  const rows = await db.select().from(D).where(eq(D.repId, rep.id)).orderBy(desc(D.createdAt)).limit(200);
  const plan = await planVersionAt(rep.id, today());
  return rows.map((d) => ({ ...dealView(d), estimate: d.status === "approved" ? null : plan ? estimateForDeal(plan.v.rules as CommissionRules, d) : null }));
}
export async function myDeal(userId: string, dealId: string) {
  const rep = await requireRep(userId, "crmRead");
  const d = await ownDeal(rep, dealId);
  const plan = await planVersionAt(rep.id, d.closedOn);
  return { ...dealView(d), estimate: plan ? estimateForDeal(plan.v.rules as CommissionRules, d) : null, planName: plan ? `${plan.p.name} v${plan.v.version}` : null };
}

// ── Admin: revisión ─────────────────────────────────────────────────────────
export async function adminDeals(actorId: string, f: { status?: string | null; repId?: string | null } = {}) {
  await salesAdmin(actorId);
  const where = [];
  if (f.status === "open") where.push(inArray(D.status, ["declared", "needs_correction"]));
  else if (f.status && f.status in DEAL_STATUS) where.push(eq(D.status, f.status as keyof typeof DEAL_STATUS));
  if (f.repId) where.push(eq(D.repId, f.repId));
  const rows = await db.select({ d: D, rep: salesRep.name, code: salesRep.code }).from(D).innerJoin(salesRep, eq(salesRep.id, D.repId))
    .where(where.length ? and(...where) : undefined).orderBy(desc(D.createdAt)).limit(300);
  return rows.map(({ d, rep, code }) => ({ ...dealView(d), repName: rep, repCode: code }));
}

async function currentTerms(contractId: string) {
  return (await db.select().from(contractTerm).where(eq(contractTerm.contractId, contractId)).orderBy(asc(contractTerm.version)))
    .map((t): Term => ({ id: t.id, kind: t.kind, version: t.version, value: t.value, currency: (t.currency as Currency) ?? null, effectiveFrom: t.effectiveFrom, createdAt: t.createdAt }));
}

export async function dealReview(actorId: string, dealId: string) {
  await salesAdmin(actorId);
  const [row] = await db.select({ d: D, rep: salesRep }).from(D).innerJoin(salesRep, eq(salesRep.id, D.repId)).where(eq(D.id, dealId));
  if (!row) throw NF();
  const d = row.d;
  const matches = (await scanDuplicates({ name: d.businessName, cuit: d.cuit, email: d.contactEmail, phone: d.contactPhone, city: d.city }, d.prospectId ?? undefined));
  const clientMatches = matches.filter((m) => m.type === "client");
  const contracts = clientMatches.length ? await db.select({ id: clientContract.id, orgId: clientContract.orgId, status: clientContract.status, name: organization.name })
    .from(clientContract).innerJoin(organization, eq(organization.id, clientContract.orgId)).where(inArray(clientContract.orgId, clientMatches.map((m) => m.id))) : [];
  const linked = d.orgId ? (await db.select({ id: clientContract.id, orgId: clientContract.orgId, status: clientContract.status, name: organization.name })
    .from(clientContract).innerJoin(organization, eq(organization.id, clientContract.orgId)).where(eq(clientContract.orgId, d.orgId)))[0] ?? null : null;
  const orgForAttr = linked?.orgId ?? d.orgId;
  const [attribution] = orgForAttr ? await db.select().from(AT).where(and(eq(AT.orgId, orgForAttr), isNull(AT.endedAt))) : [];
  const plan = await planVersionAt(d.repId, d.closedOn);
  const plans = await db.select({ id: commissionPlanVersion.id, name: commissionPlan.name, version: commissionPlanVersion.version }).from(commissionPlanVersion)
    .innerJoin(commissionPlan, eq(commissionPlan.id, commissionPlanVersion.planId)).where(eq(commissionPlanVersion.status, "approved")).orderBy(asc(commissionPlan.name), desc(commissionPlanVersion.version));
  const acts = await db.select({ a: schema.salesActivity, actor: user.name }).from(schema.salesActivity).leftJoin(user, eq(user.id, schema.salesActivity.actorUserId))
    .where(eq(schema.salesActivity.dealId, d.id)).orderBy(desc(schema.salesActivity.createdAt));
  return {
    deal: dealView(d), rep: { id: row.rep.id, name: row.rep.name, code: row.rep.code, status: row.rep.status },
    duplicates: matches.slice(0, 10).map((m) => ({ type: m.type, id: m.id, name: m.name, signals: m.signals.map((x) => DUP_SIGNAL_LABEL[x]), strong: m.strong, mine: m.ownerRepId === d.repId })),
    candidateContracts: [...(linked ? [{ ...linked, strong: true }] : []), ...contracts.filter((c) => c.id !== linked?.id).map((c) => ({ ...c, strong: clientMatches.some((m) => m.id === c.orgId && m.strong) }))]
      .sort((a, b) => Number(b.strong) - Number(a.strong)),
    attribution: attribution ?? null,
    plan: plan ? { versionId: plan.v.id, name: plan.p.name, version: plan.v.version, rules: plan.v.rules } : null, plans,
    estimate: plan ? estimateForDeal(plan.v.rules as CommissionRules, d) : null,
    history: acts.map(({ a, actor }) => ({ summary: a.summary, actor: actor ?? "REPI", role: a.actorRole, at: a.createdAt })),
  };
}

async function lockDeal(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], dealId: string, revision: number) {
  const [d] = await tx.select().from(D).where(eq(D.id, dealId)).for("update");
  if (!d) throw NF();
  if (d.revision !== revision) throw new AccessError("stale", "La venta cambió mientras la revisabas. Recargá antes de decidir.", 409);
  if (d.status !== "declared") throw new AccessError("invalid_state", d.status === "needs_correction" ? "Hay una corrección pedida: esperá a que el vendedor la reenvíe." : "Esta venta ya fue resuelta.", 409);
  return d;
}
export async function requestDealCorrection(actorId: string, dealId: string, p: { note: string; revision: number }) {
  await salesAdmin(actorId);
  if ((p.note ?? "").trim().length < 5) throw new AccessError("invalid", "Explicá qué hay que corregir.");
  return db.transaction(async (tx) => {
    const d = await lockDeal(tx, dealId, p.revision);
    await tx.update(D).set({ status: "needs_correction", reviewNote: p.note.trim().slice(0, 1000), reviewedBy: actorId, reviewedAt: new Date(), revision: d.revision + 1, updatedAt: new Date() }).where(eq(D.id, d.id));
    await logActivity(tx, { prospectId: d.prospectId, opportunityId: d.opportunityId, dealId, repId: d.repId, actorUserId: actorId, actorRole: "admin", kind: "deal", summary: `Corrección pedida: ${p.note.trim().slice(0, 300)}` });
    await notifyRep(tx, d.repId, { kind: "deal_correction", title: `Corregí la venta de ${d.businessName}`, body: p.note.trim().slice(0, 300), url: `/ventas?s=ventas&deal=${d.id}`, dedupeKey: `deal_corr:${d.id}:${d.revision}` });
    await audit(tx, { actorUserId: actorId, action: "sales.deal_correction", resourceType: "sales_deal", resourceId: d.id });
    return { status: "needs_correction" };
  });
}
export async function rejectDeal(actorId: string, dealId: string, p: { note: string; revision: number }) {
  await salesAdmin(actorId);
  if ((p.note ?? "").trim().length < 5) throw new AccessError("invalid", "Explicá el motivo del rechazo.");
  return db.transaction(async (tx) => {
    const d = await lockDeal(tx, dealId, p.revision);
    await tx.update(D).set({ status: "rejected", reviewNote: p.note.trim().slice(0, 1000), reviewedBy: actorId, reviewedAt: new Date(), revision: d.revision + 1, updatedAt: new Date() }).where(eq(D.id, d.id));
    if (d.opportunityId) await tx.update(O).set({ stage: "negotiation", stageChangedAt: new Date(), revision: sql`${O.revision} + 1`, updatedAt: new Date() }).where(and(eq(O.id, d.opportunityId), eq(O.stage, "pending_validation")));
    await logActivity(tx, { prospectId: d.prospectId, opportunityId: d.opportunityId, dealId, repId: d.repId, actorUserId: actorId, actorRole: "admin", kind: "deal", summary: `Venta rechazada: ${p.note.trim().slice(0, 300)}` });
    await notifyRep(tx, d.repId, { kind: "deal_rejected", title: `Venta rechazada: ${d.businessName}`, body: p.note.trim().slice(0, 300), url: `/ventas?s=ventas&deal=${d.id}`, dedupeKey: `deal_rej:${d.id}` });
    await audit(tx, { actorUserId: actorId, action: "sales.deal_rejected", resourceType: "sales_deal", resourceId: d.id });
    return { status: "rejected" };
  });
}

export type ApproveInput = {
  revision: number;
  link: { mode: "create" } | { mode: "existing"; contractId: string };
  quantity: number; unitPriceMinor: number; effectiveFrom: string; applyTerms: boolean; termsReason?: string | null;
  planVersionId?: string | null; split?: Split | null;
  attribution?: { originRepId?: string | null; assignedRepId?: string | null } | null; replaceAttribution?: boolean; note?: string | null;
};
/**
 * Aprobar una venta. En una sola transacción (la venta queda tomada con bloqueo de fila; dos aprobaciones simultáneas →
 * una sola): crea el cliente en borrador o lo vincula a un contrato existente, agrega cantidad y precio como versiones con
 * fecha de efecto (sin reescribir períodos cerrados), registra la atribución, congela el plan de comisiones aplicable y
 * marca la oportunidad como ganada. No habilita al cliente, no registra aceptación ni cobros.
 */
export async function approveDeal(actorId: string, dealId: string, p: ApproveInput) {
  await salesAdmin(actorId);
  if (!isDay(p.effectiveFrom)) throw new AccessError("invalid", "Fecha de efecto inválida.");
  if (!Number.isSafeInteger(p.quantity) || p.quantity < 1 || !Number.isSafeInteger(p.unitPriceMinor) || p.unitPriceMinor < 1) throw new AccessError("invalid", "Revisá cantidad y precio aprobados.");
  if (p.split) { const e = validateSplit(p.split); if (e) throw new AccessError("invalid", e); }
  const result = await db.transaction(async (tx) => {
    const d = await lockDeal(tx, dealId, p.revision);
    const [rep] = await tx.select().from(salesRep).where(eq(salesRep.id, d.repId));
    let planVersionId: string | null = null;
    if (p.planVersionId) {
      const [v] = await tx.select().from(commissionPlanVersion).where(eq(commissionPlanVersion.id, p.planVersionId));
      if (!v || v.status !== "approved" || validateRules(v.rules as CommissionRules).length) throw new AccessError("invalid", "Elegí una versión de plan aprobada.");
      planVersionId = v.id;
    } else planVersionId = (await planVersionAt(d.repId, d.closedOn))?.v.id ?? null;
    const split: Split = p.split ?? [{ repId: d.repId, shareBps: 10000 }];
    const splitReps = await tx.select({ id: salesRep.id }).from(salesRep).where(inArray(salesRep.id, split.map((s) => s.repId)));
    if (splitReps.length !== split.length) throw new AccessError("invalid", "Un vendedor del reparto no existe.");

    let contract: typeof clientContract.$inferSelect;
    if (p.link.mode === "create") {
      if (d.kind !== "new") throw new AccessError("invalid", "Una renovación o ampliación se vincula a un contrato existente.");
      if (!d.contactEmail) throw new AccessError("invalid", "Para crear el cliente hace falta el email del responsable: pedí la corrección.");
      const strong = (await scanDuplicates({ name: d.businessName, cuit: d.cuit, email: d.contactEmail, phone: d.contactPhone, city: d.city })).filter((m) => m.type === "client" && m.strong);
      if (strong.length) throw new AccessError("possible_duplicate", `Ya existe un cliente con señales coincidentes (${strong.map((m) => m.name).join(", ")}). Vinculá la venta a ese contrato.`, 409, { orgIds: strong.map((m) => m.id) });
      const created = await createClientTx(tx, actorId, { kind: d.clientKind, orgName: d.businessName, legalName: d.legalName, responsibleName: d.contactName, responsibleEmail: d.contactEmail, currency: d.currency, locations: d.locations ?? [] }, { salesDealId: d.id });
      if (d.cuit) await tx.update(organization).set({ cuit: d.cuit }).where(eq(organization.id, created.orgId));
      [contract] = await tx.select().from(clientContract).where(eq(clientContract.id, created.contractId));
    } else {
      const [c] = await tx.select().from(clientContract).where(eq(clientContract.id, p.link.contractId));
      if (!c) throw new AccessError("invalid", "El contrato elegido no existe.");
      if (c.currency !== d.currency) throw new AccessError("invalid", `La venta es en ${d.currency} y el contrato en ${c.currency}. Pedí la corrección.`);
      if (d.orgId && d.orgId !== c.orgId) throw new AccessError("invalid", "El vendedor declaró otro cliente: revisá el contrato elegido.");
      const [other] = await tx.select({ id: D.id }).from(D).where(and(eq(D.contractId, c.id), eq(D.status, "approved"), eq(D.kind, "new")));
      if (other && d.kind === "new") throw new AccessError("exists", "Ese contrato ya tiene una venta de alta aprobada. Si es otra operación, aprobala como renovación o ampliación.", 409);
      contract = c;
    }
    const before = await currentTerms(contract.id);
    const previousMembers = termAt(before, "quantity", p.effectiveFrom)?.value ?? 0;
    const termsAdded: { input: TermInput; t: Awaited<ReturnType<typeof addTermTx>> }[] = [];
    if (p.applyTerms || p.link.mode === "create") {
      const reason = (p.termsReason ?? "").trim() || `Venta ${DEAL_KIND[d.kind as DealKind].toLowerCase()} aprobada (${rep.code})`;
      const evidence = d.evidence.slice(0, 300);
      const curQ = termAt(before, "quantity", p.effectiveFrom), curP = termAt(before, "unit_price", p.effectiveFrom);
      if (!curQ || curQ.value !== p.quantity) { const input: TermInput = { kind: "quantity", value: p.quantity, effectiveFrom: p.effectiveFrom, reason, evidence }; termsAdded.push({ input, t: await addTermTx(tx, actorId, contract, input) }); }
      if (!curP || curP.value !== p.unitPriceMinor) { const input: TermInput = { kind: "unit_price", value: p.unitPriceMinor, effectiveFrom: p.effectiveFrom, reason, evidence }; termsAdded.push({ input, t: await addTermTx(tx, actorId, contract, input) }); }
    }
    // Atribución
    const [cur] = await tx.select().from(AT).where(and(eq(AT.orgId, contract.orgId), isNull(AT.endedAt))).for("update");
    const [prospect] = d.prospectId ? await tx.select().from(P).where(eq(P.id, d.prospectId)) : [];
    const [opp] = d.opportunityId ? await tx.select().from(O).where(eq(O.id, d.opportunityId)) : [];
    if (cur && cur.assignedRepId && cur.assignedRepId !== (p.attribution?.assignedRepId ?? d.repId) && !p.replaceAttribution) {
      const [owner] = await tx.select({ name: salesRep.name }).from(salesRep).where(eq(salesRep.id, cur.assignedRepId));
      throw new AccessError("attribution_conflict", `Este cliente está asignado a ${owner?.name ?? "otro vendedor"}. Confirmá el cambio de atribución para continuar.`, 409, { assignedRepId: cur.assignedRepId });
    }
    if (cur) await tx.update(AT).set({ endedAt: new Date() }).where(eq(AT.id, cur.id));
    await tx.insert(AT).values({
      orgId: contract.orgId, contractId: contract.id, dealId: d.id, effectiveFrom: p.effectiveFrom, createdBy: actorId,
      originRepId: p.attribution?.originRepId ?? cur?.originRepId ?? prospect?.originRepId ?? d.repId,
      opportunityRepId: opp?.repId ?? d.repId, closingRepId: d.repId, assignedRepId: p.attribution?.assignedRepId ?? d.repId,
      source: prospect?.source ?? null, reason: cur ? `Nueva venta aprobada (${DEAL_KIND[d.kind as DealKind]})` : "Venta aprobada",
    });
    await tx.update(D).set({ status: "approved", approvedAt: new Date(), reviewedBy: actorId, reviewedAt: new Date(), reviewNote: clean(p.note, 1000), contractId: contract.id, orgId: contract.orgId,
      planVersionId, split, previousMembers: d.kind === "new" ? 0 : previousMembers, revision: d.revision + 1, updatedAt: new Date() }).where(eq(D.id, d.id));
    if (d.opportunityId) await tx.update(O).set({ stage: "won", stageChangedAt: new Date(), revision: sql`${O.revision} + 1`, updatedAt: new Date() }).where(eq(O.id, d.opportunityId));
    if (d.prospectId) await tx.update(P).set({ orgId: contract.orgId, updatedAt: new Date() }).where(eq(P.id, d.prospectId));
    await logActivity(tx, { prospectId: d.prospectId, opportunityId: d.opportunityId, dealId: d.id, repId: d.repId, actorUserId: actorId, actorRole: "admin", kind: "deal",
      summary: `Venta aprobada${p.link.mode === "create" ? ": cliente creado en borrador" : ": vinculada a un contrato existente"}.${planVersionId ? "" : " Sin plan de comisiones asignado."}` });
    await notifyRep(tx, d.repId, { kind: "deal_approved", title: `¡Venta aprobada! ${d.businessName}`, body: "REPI sigue con el contrato y la habilitación del cliente. Las comisiones se devengan según tu plan y los eventos verificados.", url: `/ventas?s=clientes`, dedupeKey: `deal_ok:${d.id}` });
    await audit(tx, { actorUserId: actorId, orgId: contract.orgId, action: "sales.deal_approved", resourceType: "sales_deal", resourceId: d.id, meta: { mode: p.link.mode, contractId: contract.id, planVersionId, terms: termsAdded.length } });
    return { contract, termsAdded, orgId: contract.orgId, contractId: contract.id };
  });
  for (const t of result.termsAdded) await publishTermNotice(result.contract, t.input, t.t, actorId);
  await syncContractSafe(result.contractId);
  return { orgId: result.orgId, contractId: result.contractId };
}

// ── Atribución ──────────────────────────────────────────────────────────────
/** Cambio de responsable comercial de un cliente: cierra la atribución vigente y abre otra; el historial queda. */
export async function reassignClient(actorId: string, orgId: string, p: { repId: string; reason: string }) {
  await salesAdmin(actorId);
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo.");
  const [to] = await db.select().from(salesRep).where(eq(salesRep.id, p.repId));
  if (!to || to.status !== "active") throw new AccessError("invalid", "Elegí un vendedor activo.");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(AT).where(and(eq(AT.orgId, orgId), isNull(AT.endedAt))).for("update");
    const [c] = await tx.select().from(clientContract).where(eq(clientContract.orgId, orgId));
    if (!c) throw NF();
    if (cur?.assignedRepId === to.id) throw new AccessError("invalid", "Ya está asignado a ese vendedor.");
    if (cur) await tx.update(AT).set({ endedAt: new Date() }).where(eq(AT.id, cur.id));
    await tx.insert(AT).values({ orgId, contractId: c.id, originRepId: cur?.originRepId ?? null, opportunityRepId: cur?.opportunityRepId ?? null, closingRepId: cur?.closingRepId ?? null,
      assignedRepId: to.id, dealId: cur?.dealId ?? null, source: cur?.source ?? null, effectiveFrom: today(), reason: p.reason.trim().slice(0, 300), createdBy: actorId });
    await notifyRep(tx, to.id, { kind: "client_assigned", title: "Te asignaron un cliente", body: p.reason.trim().slice(0, 200), url: "/ventas?s=clientes", dedupeKey: `client:${orgId}:${Date.now()}` });
    await audit(tx, { actorUserId: actorId, orgId, action: "sales.client_reassigned", resourceType: "sales_attribution", resourceId: orgId, meta: { from: cur?.assignedRepId ?? null, to: to.id } });
    return { ok: true };
  });
}
export async function attributionHistory(actorId: string, orgId: string) {
  await salesAdmin(actorId);
  const rows = await db.select().from(AT).where(eq(AT.orgId, orgId)).orderBy(desc(AT.createdAt));
  const ids = [...new Set(rows.flatMap((r) => [r.originRepId, r.opportunityRepId, r.closingRepId, r.assignedRepId]).filter(Boolean) as string[])];
  const names = new Map((ids.length ? await db.select({ id: salesRep.id, name: salesRep.name }).from(salesRep).where(inArray(salesRep.id, ids)) : []).map((x) => [x.id, x.name]));
  const n = (id: string | null) => (id ? names.get(id) ?? "—" : "—");
  return rows.map((r) => ({ ...r, origin: n(r.originRepId), opportunity: n(r.opportunityRepId), closing: n(r.closingRepId), assigned: n(r.assignedRepId) }));
}

/** Mis clientes: atribución vigente donde el vendedor está asignado o cerró la venta. Sólo datos comerciales del cliente. */
export async function myClients(userId: string) {
  const rep = await requireRep(userId, "moneyRead");
  const rows = await db.select({ a: AT, o: organization, c: clientContract }).from(AT).innerJoin(organization, eq(organization.id, AT.orgId)).innerJoin(clientContract, eq(clientContract.orgId, AT.orgId))
    .where(and(isNull(AT.endedAt), or(eq(AT.assignedRepId, rep.id), eq(AT.closingRepId, rep.id)))).orderBy(asc(organization.name));
  const t = today();
  const out = [];
  for (const { a, o, c } of rows) {
    const terms = await currentTerms(c.id);
    const q = termAt(terms, "quantity", t), pr = termAt(terms, "unit_price", t);
    const owner = await db.select({ id: schema.staffMembership.id }).from(schema.staffMembership).where(and(eq(schema.staffMembership.orgId, o.id), inArray(schema.staffMembership.role, ["owner", "coach_owner"]), eq(schema.staffMembership.status, "active"))).limit(1);
    const stage = activationStage({ contract: c.status as ContractStatus, invitationSent: false, ownerJoined: owner.length > 0, setupDone: !!c.setupDoneAt || owner.length > 0 });
    const [paid] = await db.select({ s: sql<number>`coalesce(sum(${billingPayment.amountMinor}), 0)::bigint` }).from(billingPayment).where(and(eq(billingPayment.contractId, c.id), eq(billingPayment.status, "recorded")));
    out.push({
      orgId: o.id, name: o.name, kind: o.kind, contractStatus: c.status, stage, stageLabel: ACTIVATION_LABEL[stage], role: a.assignedRepId === rep.id ? (a.closingRepId === rep.id ? "Cerraste y atendés" : "Asignado") : "Cerraste la venta",
      agreed: q?.value ?? null, unitPrice: pr ? fmtMoney(pr.value, (pr.currency ?? c.currency) as Currency) : null, monthlyMinor: q && pr ? q.value * pr.value : null, currency: c.currency,
      enabledAccesses: await enabledAccesses(o.id), collectedMinor: Number(paid?.s ?? 0), since: a.effectiveFrom,
    });
  }
  return out;
}

// ── Solicitudes (duplicados, reclamos de atribución, frecuencia) ────────────
export async function requestReview(userId: string, p: { kind: "duplicate_review" | "attribution_claim"; prospectId?: string | null; message: string }) {
  const rep = await requireRep(userId, "crmWrite");
  if (!["duplicate_review", "attribution_claim"].includes(p.kind)) throw new AccessError("invalid", "Tipo de solicitud inválido.");
  if ((p.message ?? "").trim().length < 5) throw new AccessError("invalid", "Contá qué hay que revisar.");
  if (p.prospectId) { const [x] = await db.select({ id: P.id }).from(P).where(and(eq(P.id, p.prospectId), eq(P.ownerRepId, rep.id))); if (!x) throw NF(); }
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(salesRequest).values({ kind: p.kind, repId: rep.id, prospectId: p.prospectId ?? null, message: p.message.trim().slice(0, 1000) }).returning();
    await notifyAdmins(tx, { kind: p.kind, title: p.kind === "attribution_claim" ? `Reclamo de atribución de ${rep.name}` : `Revisión de duplicado pedida por ${rep.name}`, body: p.message.trim().slice(0, 200), url: "/admin?s=sales&tab=requests", dedupeKey: `req:${r.id}` });
    return { id: r.id };
  });
}
export async function listRequests(actorId: string, status: "open" | "all" = "open") {
  await salesAdmin(actorId);
  const rows = await db.select({ r: salesRequest, rep: salesRep.name, prospect: P.name }).from(salesRequest).innerJoin(salesRep, eq(salesRep.id, salesRequest.repId)).leftJoin(P, eq(P.id, salesRequest.prospectId))
    .where(status === "open" ? eq(salesRequest.status, "open") : undefined).orderBy(desc(salesRequest.createdAt)).limit(200);
  return rows.map(({ r, rep, prospect }) => ({ ...r, repName: rep, prospectName: prospect }));
}
/**
 * Resolver una solicitud. Frecuencia: aprobar cambia la preferencia (no importes). Duplicado: «no es duplicado», «asociar
 * al cliente» (vincula el prospecto a la organización existente, sin fusionar) o archivar. Reclamo: se resuelve con nota
 * y, si corresponde, con una reasignación explícita (reassignClient / assignProspect).
 */
export async function resolveRequest(actorId: string, requestId: string, p: { decision: "approve" | "reject"; resolution: string; action?: "clear" | "associate" | "archive" | null; orgId?: string | null }) {
  await salesAdmin(actorId);
  if ((p.resolution ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí la resolución.");
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(salesRequest).where(eq(salesRequest.id, requestId)).for("update");
    if (!r) throw NF();
    if (r.status !== "open") throw new AccessError("invalid_state", "Esta solicitud ya fue resuelta.", 409);
    if (r.kind === "payout_frequency" && p.decision === "approve") {
      const to = (r.payload as { to?: string } | null)?.to;
      if (!isPayoutFrequency(to)) throw new AccessError("invalid", "Solicitud inválida.");
      await tx.update(salesRep).set({ payoutFrequency: to, updatedAt: new Date() }).where(eq(salesRep.id, r.repId));
    }
    if (r.kind === "duplicate_review" && r.prospectId && p.decision === "approve") {
      if (p.action === "associate") {
        if (!p.orgId) throw new AccessError("invalid", "Elegí el cliente al que se asocia.");
        const [o] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, p.orgId));
        if (!o) throw new AccessError("invalid", "El cliente no existe.");
        await tx.update(P).set({ orgId: o.id, duplicateStatus: "associated", updatedAt: new Date() }).where(eq(P.id, r.prospectId));
      } else if (p.action === "archive") await tx.update(P).set({ archivedAt: new Date(), duplicateStatus: "associated", updatedAt: new Date() }).where(eq(P.id, r.prospectId));
      else await tx.update(P).set({ duplicateStatus: "cleared", updatedAt: new Date() }).where(eq(P.id, r.prospectId));
    }
    await tx.update(salesRequest).set({ status: p.decision === "approve" ? "approved" : "rejected", resolution: p.resolution.trim().slice(0, 1000), resolvedBy: actorId, resolvedAt: new Date() }).where(eq(salesRequest.id, r.id));
    const what = r.kind === "payout_frequency" ? `Cambio de frecuencia ${p.decision === "approve" ? `aprobado: ${PAYOUT_FREQUENCY[(r.payload as { to: keyof typeof PAYOUT_FREQUENCY }).to]}` : "rechazado"}`
      : r.kind === "duplicate_review" ? "Revisión de duplicado resuelta" : "Reclamo de atribución resuelto";
    await notifyRep(tx, r.repId, { kind: "request_resolved", title: what, body: p.resolution.trim().slice(0, 300), url: r.kind === "payout_frequency" ? "/ventas?s=perfil" : "/ventas?s=pipeline", dedupeKey: `req_done:${r.id}` });
    await audit(tx, { actorUserId: actorId, action: "sales.request_resolved", resourceType: "sales_request", resourceId: r.id, meta: { kind: r.kind, decision: p.decision, action: p.action ?? null } });
    return { ok: true };
  });
}
