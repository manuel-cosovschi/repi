// REPI Sales Force (D207) · CRM: prospectos, oportunidades, pipeline, actividades y prevención de duplicados.
// Cada vendedor ve sólo lo que tiene asignado; Admin ve y reasigna todo. Nada se fusiona automáticamente.
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  ACTIVITY_KINDS, DUP_SIGNAL_LABEL, OPEN_STAGES, STAGES, canMoveStage, duplicateSignals, isActivityKind, isEmail, isProspectSource, isStage,
  missingOpportunityFields, normalizeEmail, type DupCandidate, type DupSignal, type Stage,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, NF, audit, clean, isDay, logActivity, notifyAdmins, notifyRep, requireRep, salesAdmin, today, type Rep } from "./core";

const { salesProspect: P, salesOpportunity: O, salesActivity: A, salesRep, salesRequest, organization, clientContract, commercialLead, user } = schema;
const PAGE = 50;
const intOrNull = (n: unknown, max = 10_000_000) => (n === null || n === undefined || n === "" ? null : Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= max ? Number(n) : (() => { throw new AccessError("invalid", "Revisá los números ingresados."); })());

export type ProspectInput = {
  kind?: "gym" | "coach"; name: string; legalName?: string | null; cuit?: string | null; city?: string | null; province?: string | null; address?: string | null;
  estMembers?: number | null; locations?: number | null; website?: string | null; instagram?: string | null; phone?: string | null; email?: string | null;
  contactName?: string | null; contactRole?: string | null; contactChannel?: "whatsapp" | "phone" | "email" | "in_person" | null; notes?: string | null; source?: string | null; capturedOn?: string | null;
};
export type OpportunityInput = {
  kind?: "new" | "renewal" | "modification"; category?: "hot" | "warm" | "cold" | null; probabilityPct?: number | null; estMembers?: number | null; estUnitPriceMinor?: number | null;
  currency?: "ARS" | "USD"; nextContactOn?: string | null; expectedCloseOn?: string | null; notes?: string | null;
};

function prospectValues(p: Partial<ProspectInput>, partial: boolean) {
  if (!partial && (p.name ?? "").trim().length < 2) throw new AccessError("invalid", "Escribí el nombre comercial.");
  if (p.email && !isEmail(p.email)) throw new AccessError("invalid", "El email no es válido.");
  if (p.cuit && p.cuit.replace(/\D/g, "").length !== 11) throw new AccessError("invalid", "El CUIT tiene 11 dígitos (o dejalo vacío).");
  if (p.source && !isProspectSource(p.source)) throw new AccessError("invalid", "Origen inválido.");
  if (p.capturedOn && !isDay(p.capturedOn)) throw new AccessError("invalid", "Fecha de captación inválida.");
  const v: Partial<typeof P.$inferInsert> = {};
  if (p.kind !== undefined) v.kind = p.kind === "coach" ? "coach" : "gym";
  if (p.name !== undefined) v.name = p.name.trim().slice(0, 120);
  for (const k of ["legalName", "city", "province", "address", "website", "instagram", "phone", "contactName", "contactRole"] as const) if (p[k] !== undefined) v[k] = clean(p[k], 160);
  if (p.cuit !== undefined) v.cuit = p.cuit ? p.cuit.replace(/\D/g, "") : null;
  if (p.email !== undefined) v.email = p.email ? normalizeEmail(p.email) : null;
  if (p.notes !== undefined) v.notes = clean(p.notes, 2000);
  if (p.estMembers !== undefined) v.estMembers = intOrNull(p.estMembers);
  if (p.locations !== undefined) v.locations = intOrNull(p.locations, 1000);
  if (p.contactChannel !== undefined) v.contactChannel = p.contactChannel && ["whatsapp", "phone", "email", "in_person"].includes(p.contactChannel) ? p.contactChannel : null;
  if (p.source !== undefined) v.source = p.source ?? "field";
  if (p.capturedOn !== undefined) v.capturedOn = p.capturedOn ?? today();
  return v;
}
function oppValues(p: Partial<OpportunityInput>) {
  const v: Partial<typeof O.$inferInsert> = {};
  if (p.kind !== undefined) v.kind = ["new", "renewal", "modification"].includes(p.kind) ? p.kind : "new";
  if (p.category !== undefined) v.category = p.category && ["hot", "warm", "cold"].includes(p.category) ? p.category : null;
  if (p.probabilityPct !== undefined) { const n = intOrNull(p.probabilityPct, 100); v.probabilityPct = n; }
  if (p.estMembers !== undefined) v.estMembers = intOrNull(p.estMembers);
  if (p.estUnitPriceMinor !== undefined) v.estUnitPriceMinor = intOrNull(p.estUnitPriceMinor, 2_147_483_647);
  if (p.currency !== undefined) v.currency = p.currency === "USD" ? "USD" : "ARS";
  for (const k of ["nextContactOn", "expectedCloseOn"] as const) if (p[k] !== undefined) { if (p[k] && !isDay(p[k])) throw new AccessError("invalid", "Fecha inválida."); v[k] = p[k] || null; }
  if (p.notes !== undefined) v.notes = clean(p.notes, 2000);
  return v;
}

// ── Duplicados ──────────────────────────────────────────────────────────────
type Match = { type: "client" | "prospect" | "lead"; id: string; name: string; ownerRepId: string | null; signals: DupSignal[]; strong: boolean };
export async function scanDuplicates(c: DupCandidate, excludeProspectId?: string): Promise<Match[]> {
  const out: Match[] = [];
  const orgs = await db.select({ id: organization.id, name: organization.name, cuit: organization.cuit, isDemo: organization.isDemo, legal: clientContract.legalName, email: clientContract.responsibleEmail })
    .from(organization).leftJoin(clientContract, eq(clientContract.orgId, organization.id));
  for (const o of orgs) {
    if (o.isDemo) continue;
    const s = duplicateSignals(c, { name: o.name, cuit: o.cuit, email: o.email });
    const s2 = o.legal ? duplicateSignals(c, { name: o.legal }) : { signals: [] as DupSignal[], strong: false };
    const signals = [...new Set([...s.signals, ...s2.signals])];
    if (signals.length) out.push({ type: "client", id: o.id, name: o.name, ownerRepId: null, signals, strong: s.strong || s2.strong });
  }
  const pros = await db.select().from(P).where(isNull(P.archivedAt));
  for (const p of pros) {
    if (p.id === excludeProspectId) continue;
    const s = duplicateSignals(c, { name: p.name, cuit: p.cuit, email: p.email, phone: p.phone, website: p.website, city: p.city });
    if (s.signals.length) out.push({ type: "prospect", id: p.id, name: p.name, ownerRepId: p.ownerRepId, ...s });
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong));
}
/** Lo que ve el vendedor de un posible duplicado: sin datos de otros vendedores ni contactos ajenos. */
function maskedMatches(ms: Match[], rep: Rep) {
  return ms.map((m) => ({
    type: m.type === "prospect" ? (m.ownerRepId === rep.id ? "mine" : "other") : m.type,
    name: m.type === "client" || m.ownerRepId === rep.id ? m.name : null,
    prospectId: m.ownerRepId === rep.id ? m.id : null,
    signals: m.signals.map((s) => DUP_SIGNAL_LABEL[s]), strong: m.strong,
  }));
}
export async function checkDuplicates(userId: string, c: DupCandidate) {
  const rep = await requireRep(userId, "crmRead");
  if ((c.name ?? "").trim().length < 2) return { matches: [] };
  return { matches: maskedMatches(await scanDuplicates(c), rep) };
}

// ── Prospectos ──────────────────────────────────────────────────────────────
async function ownProspect(rep: Rep, prospectId: string) {
  const [p] = await db.select().from(P).where(and(eq(P.id, prospectId), eq(P.ownerRepId, rep.id)));
  if (!p) throw NF();
  return p;
}

/**
 * Alta rápida de prospecto (y su oportunidad). Antes de crear busca coincidencias con clientes y prospectos. Ante una
 * señal fuerte pide confirmación: si el vendedor sigue, queda marcado para revisión y Admin recibe la solicitud.
 */
export async function createProspect(userId: string, p: ProspectInput & { opportunity?: OpportunityInput | null; duplicateAck?: boolean; duplicateMessage?: string | null }) {
  const rep = await requireRep(userId, "crmWrite");
  const v = prospectValues(p, false);
  if (v.kind === "coach" && !rep.canSellCoaches) throw new AccessError("forbidden", "Tu acuerdo comercial no incluye venta a entrenadores independientes.", 403);
  const matches = await scanDuplicates({ name: v.name!, cuit: v.cuit, email: v.email, phone: v.phone, website: v.website, city: v.city });
  const strong = matches.filter((m) => m.strong);
  if (strong.length && !p.duplicateAck) throw new AccessError("possible_duplicate", "Puede que este negocio ya esté cargado. Revisá las coincidencias.", 409, { matches: maskedMatches(matches, rep) });
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(P).values({ ...v, name: v.name!, ownerRepId: rep.id, originRepId: rep.id, capturedOn: v.capturedOn ?? today(), source: v.source ?? "field",
      duplicateStatus: strong.length ? "review" : "none", createdBy: userId }).returning();
    let oppId: string | null = null;
    if (p.opportunity !== null) {
      const [o] = await tx.insert(O).values({ prospectId: row.id, repId: rep.id, estMembers: row.estMembers, ...oppValues(p.opportunity ?? {}) }).returning();
      oppId = o.id;
    }
    await logActivity(tx, { prospectId: row.id, opportunityId: oppId, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "created", summary: "Prospecto registrado." });
    if (strong.length) {
      const [req] = await tx.insert(salesRequest).values({ kind: "duplicate_review", repId: rep.id, prospectId: row.id, payload: { matches: strong.map((m) => ({ type: m.type, id: m.id, signals: m.signals })) }, message: clean(p.duplicateMessage, 500) }).returning();
      await notifyAdmins(tx, { kind: "duplicate", title: `Posible duplicado: ${row.name}`, body: `${rep.name} lo cargó igual y pidió revisión.`, url: "/admin?s=sales&tab=requests", dedupeKey: `dup:${req.id}` });
    }
    await audit(tx, { actorUserId: userId, action: "sales.prospect_created", resourceType: "sales_prospect", resourceId: row.id, meta: { duplicate: strong.length > 0 } });
    return { id: row.id, opportunityId: oppId, duplicateReview: strong.length > 0 };
  });
}

export async function updateProspect(userId: string, prospectId: string, p: Partial<ProspectInput>) {
  const rep = await requireRep(userId, "crmWrite");
  await ownProspect(rep, prospectId);
  const v = prospectValues(p, true);
  if (v.kind === "coach" && !rep.canSellCoaches) throw new AccessError("forbidden", "Tu acuerdo comercial no incluye venta a entrenadores independientes.", 403);
  if (!Object.keys(v).length) throw new AccessError("invalid", "No hay cambios para guardar.");
  await db.update(P).set({ ...v, updatedAt: new Date() }).where(eq(P.id, prospectId));
  await logActivity(db, { prospectId, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "edited", summary: `Datos actualizados: ${Object.keys(v).join(", ")}.` });
  return { ok: true };
}

function boardRow(p: typeof P.$inferSelect, o: typeof O.$inferSelect | null, t: string) {
  return {
    prospectId: p.id, name: p.name, kind: p.kind, city: p.city, province: p.province, contactName: p.contactName, phone: p.phone, email: p.email, duplicateStatus: p.duplicateStatus, orgId: p.orgId,
    opportunityId: o?.id ?? null, stage: (o?.stage ?? null) as Stage | null, stageLabel: o ? STAGES[o.stage as Stage] : "Sin oportunidad", category: o?.category ?? null, estMembers: o?.estMembers ?? p.estMembers,
    estUnitPriceMinor: o?.estUnitPriceMinor ?? null, currency: o?.currency ?? "ARS", potentialMinor: o?.estMembers && o?.estUnitPriceMinor ? o.estMembers * o.estUnitPriceMinor : null,
    nextContactOn: o?.nextContactOn ?? null, overdue: !!o?.nextContactOn && o.nextContactOn < t && OPEN_STAGES.includes(o.stage as Stage), expectedCloseOn: o?.expectedCloseOn ?? null,
    revision: o?.revision ?? null, updatedAt: (o?.updatedAt ?? p.updatedAt),
    missing: o ? missingOpportunityFields({ contactName: p.contactName, phone: p.phone, email: p.email, estMembers: o.estMembers, estUnitPriceMinor: o.estUnitPriceMinor, nextContactOn: o.nextContactOn, expectedCloseOn: o.expectedCloseOn, stage: o.stage as Stage }) : [],
  };
}

/** Pipeline del vendedor (tablero y tabla). Sólo sus prospectos y oportunidades. */
export async function myPipeline(userId: string, f: { q?: string | null; stage?: string | null } = {}) {
  const rep = await requireRep(userId, "crmRead");
  const where = [eq(P.ownerRepId, rep.id), isNull(P.archivedAt)];
  if (f.q?.trim()) { const q = `%${f.q.trim().replace(/[%_]/g, "")}%`; where.push(or(ilike(P.name, q), ilike(P.city, q), ilike(P.contactName, q))!); }
  const rows = await db.select({ p: P, o: O }).from(P).leftJoin(O, and(eq(O.prospectId, P.id), eq(O.repId, rep.id))).where(and(...where)).orderBy(desc(P.updatedAt)).limit(500);
  const t = today();
  const out = rows.map((r) => boardRow(r.p, r.o, t)).filter((r) => !f.stage || r.stage === f.stage);
  return { rows: out, stages: STAGES };
}

export async function prospectDetail(userId: string, prospectId: string) {
  const rep = await requireRep(userId, "crmRead");
  const p = await ownProspect(rep, prospectId);
  return prospectView(p, rep.id);
}
async function prospectView(p: typeof P.$inferSelect, repId: string | null) {
  const opps = await db.select().from(O).where(repId ? and(eq(O.prospectId, p.id), eq(O.repId, repId)) : eq(O.prospectId, p.id)).orderBy(desc(O.createdAt));
  const acts = await db.select({ a: A, actor: user.name }).from(A).leftJoin(user, eq(user.id, A.actorUserId)).where(eq(A.prospectId, p.id)).orderBy(desc(A.createdAt)).limit(200);
  const deals = await db.select({ id: schema.salesDeal.id, status: schema.salesDeal.status, kind: schema.salesDeal.kind, members: schema.salesDeal.members, createdAt: schema.salesDeal.createdAt })
    .from(schema.salesDeal).where(repId ? and(eq(schema.salesDeal.prospectId, p.id), eq(schema.salesDeal.repId, repId)) : eq(schema.salesDeal.prospectId, p.id));
  const t = today();
  return {
    prospect: p, deals,
    opportunities: opps.map((o) => ({ ...o, stageLabel: STAGES[o.stage as Stage], potentialMinor: o.estMembers && o.estUnitPriceMinor ? o.estMembers * o.estUnitPriceMinor : null,
      missing: missingOpportunityFields({ contactName: p.contactName, phone: p.phone, email: p.email, estMembers: o.estMembers, estUnitPriceMinor: o.estUnitPriceMinor, nextContactOn: o.nextContactOn, expectedCloseOn: o.expectedCloseOn, stage: o.stage as Stage }) })),
    activities: acts.map(({ a, actor }) => ({ id: a.id, kind: a.kind, kindLabel: ACTIVITY_KINDS[a.kind as keyof typeof ACTIVITY_KINDS] ?? null, summary: a.summary, actor: actor ?? (a.actorRole === "system" ? "REPI" : "—"), actorRole: a.actorRole,
      dueOn: a.dueOn, doneAt: a.doneAt, overdue: !!a.dueOn && !a.doneAt && a.dueOn < t, createdAt: a.createdAt })),
  };
}

export async function createOpportunity(userId: string, prospectId: string, p: OpportunityInput) {
  const rep = await requireRep(userId, "crmWrite");
  const pr = await ownProspect(rep, prospectId);
  const [o] = await db.insert(O).values({ prospectId, repId: rep.id, estMembers: pr.estMembers, ...oppValues(p) }).returning();
  await logActivity(db, { prospectId, opportunityId: o.id, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "created", summary: "Oportunidad creada." });
  return { id: o.id };
}
async function ownOpp(rep: Rep, oppId: string) {
  const [o] = await db.select().from(O).where(and(eq(O.id, oppId), eq(O.repId, rep.id)));
  if (!o) throw NF();
  return o;
}
export async function updateOpportunity(userId: string, oppId: string, p: OpportunityInput & { revision: number }) {
  const rep = await requireRep(userId, "crmWrite");
  const o = await ownOpp(rep, oppId);
  if (["won", "pending_validation"].includes(o.stage)) throw new AccessError("invalid_state", "Esta oportunidad está en revisión o ganada: los datos se cambian desde la venta.", 409);
  const v = oppValues(p);
  const r = await db.update(O).set({ ...v, revision: sql`${O.revision} + 1`, updatedAt: new Date() }).where(and(eq(O.id, oppId), eq(O.revision, p.revision))).returning();
  if (!r.length) throw new AccessError("stale", "Alguien cambió esta oportunidad mientras la editabas. Recargá y probá de nuevo.", 409);
  return { revision: r[0].revision };
}

/** Mover de etapa con las reglas del pipeline. «Ganado» sólo lo pone la aprobación de Admin. */
export async function moveStage(userId: string, oppId: string, p: { to: string; reason?: string | null; revision: number }) {
  const rep = await requireRep(userId, "crmWrite");
  const o = await ownOpp(rep, oppId);
  if (!isStage(p.to) || !canMoveStage(o.stage as Stage, p.to, "rep")) throw new AccessError("invalid_transition", `No se puede pasar de «${STAGES[o.stage as Stage]}» a «${isStage(p.to) ? STAGES[p.to] : p.to}».`, 409);
  if (p.to === "lost" && (p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Contá por qué se perdió.");
  return db.transaction(async (tx) => {
    const r = await tx.update(O).set({ stage: p.to as Stage, lostReason: p.to === "lost" ? p.reason!.trim().slice(0, 300) : o.lostReason, stageChangedAt: new Date(), revision: sql`${O.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(O.id, oppId), eq(O.revision, p.revision))).returning();
    if (!r.length) throw new AccessError("stale", "La oportunidad cambió mientras la movías. Recargá y probá de nuevo.", 409);
    await logActivity(tx, { prospectId: o.prospectId, opportunityId: o.id, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: "stage",
      summary: `Etapa: ${STAGES[o.stage as Stage]} → ${STAGES[p.to as Stage]}${p.to === "lost" ? ` (${p.reason!.trim().slice(0, 200)})` : ""}.` });
    await tx.update(P).set({ updatedAt: new Date() }).where(eq(P.id, o.prospectId));
    return { stage: p.to, revision: r[0].revision };
  });
}

/**
 * Registrar llamada, WhatsApp, email, visita, demo, reunión, nota, tarea o recordatorio. Registrar no envía nada: los
 * enlaces de contacto abren la app del teléfono y REPI no afirma que un mensaje se haya enviado.
 */
export async function addActivity(userId: string, prospectId: string, p: { kind: string; summary: string; opportunityId?: string | null; dueOn?: string | null }) {
  const rep = await requireRep(userId, "crmWrite");
  await ownProspect(rep, prospectId);
  if (!isActivityKind(p.kind)) throw new AccessError("invalid", "Tipo de actividad inválido.");
  if ((p.summary ?? "").trim().length < 2) throw new AccessError("invalid", "Escribí qué pasó o qué hay que hacer.");
  if ((p.kind === "task" || p.kind === "reminder") && !isDay(p.dueOn)) throw new AccessError("invalid", "Las tareas y recordatorios necesitan fecha.");
  if (p.opportunityId) await ownOpp(rep, p.opportunityId);
  const a = await logActivity(db, { prospectId, opportunityId: p.opportunityId ?? null, repId: rep.id, actorUserId: userId, actorRole: "rep", kind: p.kind, summary: p.summary.trim(), dueOn: p.dueOn ?? null });
  await db.update(P).set({ updatedAt: new Date() }).where(eq(P.id, prospectId));
  return { id: a.id };
}
export async function completeActivity(userId: string, activityId: string) {
  const rep = await requireRep(userId, "crmWrite");
  const r = await db.update(A).set({ doneAt: new Date() }).where(and(eq(A.id, activityId), eq(A.repId, rep.id), isNull(A.doneAt), inArray(A.kind, ["task", "reminder"]))).returning();
  if (!r.length) throw NF();
  return { ok: true };
}
/** Próximas acciones: tareas y recordatorios, seguimientos vencidos y oportunidades sin movimiento hace 14 días. */
export async function myAgenda(userId: string) {
  const rep = await requireRep(userId, "crmRead");
  const t = today();
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const tasks = await db.select({ a: A, name: P.name }).from(A).innerJoin(P, eq(P.id, A.prospectId))
    .where(and(eq(A.repId, rep.id), inArray(A.kind, ["task", "reminder"]), isNull(A.doneAt), lte(A.dueOn, soon))).orderBy(asc(A.dueOn)).limit(30);
  const follow = await db.select({ o: O, name: P.name, pid: P.id }).from(O).innerJoin(P, eq(P.id, O.prospectId))
    .where(and(eq(O.repId, rep.id), inArray(O.stage, OPEN_STAGES), lte(O.nextContactOn, soon))).orderBy(asc(O.nextContactOn)).limit(30);
  const stale = await db.select({ o: O, name: P.name, pid: P.id }).from(O).innerJoin(P, eq(P.id, O.prospectId))
    .where(and(eq(O.repId, rep.id), inArray(O.stage, OPEN_STAGES), lte(O.updatedAt, new Date(Date.now() - 14 * 86_400_000)))).limit(20);
  return {
    tasks: tasks.map(({ a, name }) => ({ id: a.id, prospectId: a.prospectId, name, kind: a.kind, summary: a.summary, dueOn: a.dueOn, overdue: (a.dueOn ?? "") < t })),
    followUps: follow.map(({ o, name, pid }) => ({ opportunityId: o.id, prospectId: pid, name, stage: STAGES[o.stage as Stage], nextContactOn: o.nextContactOn, overdue: (o.nextContactOn ?? "") < t })),
    stale: stale.map(({ o, name, pid }) => ({ opportunityId: o.id, prospectId: pid, name, stage: STAGES[o.stage as Stage], updatedAt: o.updatedAt })),
  };
}

// ── Admin ───────────────────────────────────────────────────────────────────
export async function adminProspects(actorId: string, f: { q?: string | null; repId?: string | null; stage?: string | null; province?: string | null; unassigned?: boolean; page?: number } = {}) {
  await salesAdmin(actorId);
  const where = [isNull(P.archivedAt)];
  if (f.q?.trim()) { const q = `%${f.q.trim().replace(/[%_]/g, "")}%`; where.push(or(ilike(P.name, q), ilike(P.city, q), ilike(P.email, q))!); }
  if (f.repId) where.push(eq(P.ownerRepId, f.repId));
  if (f.unassigned) where.push(isNull(P.ownerRepId));
  if (f.province?.trim()) where.push(ilike(P.province, f.province.trim()));
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const rows = await db.select({ p: P, o: O, rep: salesRep.name }).from(P).leftJoin(O, eq(O.prospectId, P.id)).leftJoin(salesRep, eq(salesRep.id, P.ownerRepId))
    .where(and(...where)).orderBy(desc(P.updatedAt), asc(P.id)).limit(PAGE + 1).offset((page - 1) * PAGE);
  const t = today();
  const out = rows.slice(0, PAGE).map((r) => ({ ...boardRow(r.p, r.o, t), repName: r.rep })).filter((r) => !f.stage || r.stage === f.stage);
  return { rows: out, page, hasMore: rows.length > PAGE };
}
export async function adminProspectDetail(actorId: string, prospectId: string) {
  await salesAdmin(actorId);
  const [p] = await db.select().from(P).where(eq(P.id, prospectId));
  if (!p) throw NF();
  return prospectView(p, null);
}

/** Asignar o reasignar un prospecto (con sus oportunidades abiertas). El vendedor de origen se conserva. */
export async function assignProspect(actorId: string, prospectId: string, p: { repId: string; reason: string }) {
  await salesAdmin(actorId);
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo.");
  const [to] = await db.select().from(salesRep).where(eq(salesRep.id, p.repId));
  if (!to || to.status !== "active") throw new AccessError("invalid", "Elegí un vendedor activo.");
  return db.transaction(async (tx) => {
    const [pr] = await tx.select().from(P).where(eq(P.id, prospectId)).for("update");
    if (!pr) throw NF();
    if (pr.ownerRepId === to.id) throw new AccessError("invalid", "Ya está asignado a ese vendedor.");
    if (pr.kind === "coach" && !to.canSellCoaches) throw new AccessError("invalid", "Ese vendedor no tiene habilitada la venta a entrenadores.");
    await tx.update(P).set({ ownerRepId: to.id, originRepId: pr.originRepId ?? (pr.ownerRepId ? pr.ownerRepId : null), updatedAt: new Date() }).where(eq(P.id, prospectId));
    await tx.update(O).set({ repId: to.id, updatedAt: new Date() }).where(and(eq(O.prospectId, prospectId), inArray(O.stage, [...OPEN_STAGES, "declared", "lost"])));
    await logActivity(tx, { prospectId, repId: to.id, actorUserId: actorId, actorRole: "admin", kind: "assign", summary: `Asignado a ${to.name}. Motivo: ${p.reason.trim().slice(0, 200)}.` });
    await notifyRep(tx, to.id, { kind: "prospect_assigned", title: `Te asignaron un prospecto: ${pr.name}`, body: p.reason.trim().slice(0, 200), url: `/ventas?s=pipeline&p=${prospectId}`, dedupeKey: `assign:${prospectId}:${Date.now()}` });
    await audit(tx, { actorUserId: actorId, action: "sales.prospect_assigned", resourceType: "sales_prospect", resourceId: prospectId, meta: { from: pr.ownerRepId, to: to.id } });
    return { ok: true };
  });
}

/** Cartera de un vendedor (al desvincularlo, por ejemplo) hacia otro: prospectos abiertos y clientes asignados. */
export async function reassignPortfolio(actorId: string, fromRepId: string, p: { toRepId: string; reason: string; includeClients: boolean }) {
  await salesAdmin(actorId);
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo.");
  if (fromRepId === p.toRepId) throw new AccessError("invalid", "Elegí otro vendedor.");
  const [to] = await db.select().from(salesRep).where(eq(salesRep.id, p.toRepId));
  if (!to || to.status !== "active") throw new AccessError("invalid", "Elegí un vendedor activo.");
  const pros = await db.select({ id: P.id }).from(P).where(and(eq(P.ownerRepId, fromRepId), isNull(P.archivedAt), isNull(P.orgId)));
  let moved = 0;
  for (const x of pros) { try { await assignProspect(actorId, x.id, { repId: to.id, reason: p.reason }); moved++; } catch { /* coach sin permiso u otro estado: queda para revisión manual */ } }
  let clients = 0;
  if (p.includeClients) {
    const { reassignClient } = await import("./deals");
    const cur = await db.select({ orgId: schema.salesAttribution.orgId }).from(schema.salesAttribution).where(and(eq(schema.salesAttribution.assignedRepId, fromRepId), isNull(schema.salesAttribution.endedAt)));
    for (const c of cur) { await reassignClient(actorId, c.orgId, { repId: to.id, reason: p.reason }); clients++; }
  }
  return { prospects: moved, skipped: pros.length - moved, clients };
}

/** Contacto web → prospecto. Si llegó con el enlace de un vendedor activo, ese vendedor queda como origen (no como cierre). */
export async function leadToProspect(actorId: string, leadId: string, p: { repId?: string | null }) {
  await salesAdmin(actorId);
  const [l] = await db.select().from(commercialLead).where(eq(commercialLead.id, leadId));
  if (!l) throw NF();
  if (l.kind === "partner") throw new AccessError("invalid", "Los aliados no se cargan como prospectos de venta.");
  const [exists] = await db.select({ id: P.id }).from(P).where(eq(P.commercialLeadId, leadId));
  if (exists) throw new AccessError("exists", "Este contacto ya es un prospecto.", 409, { prospectId: exists.id });
  const [ref] = l.referralCode ? await db.select().from(salesRep).where(and(eq(salesRep.code, l.referralCode), eq(salesRep.status, "active"))) : [];
  const ownerId = p.repId ?? ref?.id ?? null;
  const [owner] = ownerId ? await db.select().from(salesRep).where(eq(salesRep.id, ownerId)) : [];
  if (ownerId && (!owner || owner.status !== "active")) throw new AccessError("invalid", "Elegí un vendedor activo.");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(P).values({ kind: l.kind === "coach" ? "coach" : "gym", name: l.orgName === "—" ? l.contactName : l.orgName, email: l.email, phone: l.phone, contactName: l.contactName,
      notes: l.message, source: ref ? "referral_link" : "web_lead", capturedOn: l.createdAt.toISOString().slice(0, 10), ownerRepId: owner?.id ?? null, originRepId: ref?.id ?? null,
      commercialLeadId: l.id, createdBy: actorId }).returning();
    if (owner) await tx.insert(O).values({ prospectId: row.id, repId: owner.id });
    await tx.update(commercialLead).set({ status: "contacted" }).where(and(eq(commercialLead.id, l.id), eq(commercialLead.status, "new")));
    await logActivity(tx, { prospectId: row.id, repId: owner?.id ?? null, actorUserId: actorId, actorRole: "admin", kind: "created", summary: `Creado desde un contacto web${ref ? ` que llegó con el enlace de ${ref.name}` : ""}.` });
    if (owner) await notifyRep(tx, owner.id, { kind: "prospect_assigned", title: `Te asignaron un contacto web: ${row.name}`, body: "Contactalo desde tu pipeline.", url: `/ventas?s=pipeline&p=${row.id}`, dedupeKey: `lead:${l.id}` });
    await audit(tx, { actorUserId: actorId, action: "sales.lead_to_prospect", resourceType: "sales_prospect", resourceId: row.id, meta: { leadId: l.id, referral: !!ref } });
    return { id: row.id };
  });
}
