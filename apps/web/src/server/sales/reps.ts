// REPI Sales Force (D209) · vendedores: alta, invitación, estados, perfil, plan asignado y frecuencia de liquidación.
// Sólo REPI Admin (con 2FA) crea vendedores o cambia permisos y condiciones. Nadie se otorga el rol por una API: la
// relación se vincula a una cuenta sólo cuando esa cuenta, con el email verificado, acepta una invitación vigente.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  ENGAGEMENT, PAYOUT_FREQUENCY, REP_STATUS, isEmail, isPayoutFrequency, isRepStatus, normalizeEmail, repCodeFrom, type PayoutFrequency, type RepStatus,
} from "@repi/domain";
import { db, schema } from "@/db";
import { addDays, newToken, sha256, type Tx } from "../access/util";
import { MailError, deliverMail } from "../mailer";
import { logError } from "../log";
import { AccessError, NF, audit, clean, isDay, notifyAdmins, notifyRep, requireRep, salesAdmin, today, type Rep } from "./core";

const { salesRep, salesRepInvitation, salesRepPlan, commissionPlanVersion, commissionPlan, salesRegion, salesRequest, user } = schema;
const INVITE_DAYS = 7;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const PAGE = 25;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = repCodeFrom(randomBytes(6));
    const [x] = await db.select({ id: salesRep.id }).from(salesRep).where(eq(salesRep.code, code));
    if (!x) return code;
  }
  throw new AccessError("error", "No pudimos generar un código comercial. Probá de nuevo.", 500);
}
async function repById(repId: string) {
  const [r] = await db.select().from(salesRep).where(eq(salesRep.id, repId));
  if (!r) throw NF();
  return r;
}

export type RepInput = {
  name: string; email: string; phone?: string | null; city?: string | null; province?: string | null; zone?: string | null; regionId?: string | null;
  managerRepId?: string | null; engagement?: keyof typeof ENGAGEMENT; canSellCoaches?: boolean; payoutFrequency?: PayoutFrequency; payoutNote?: string | null; agreementRef?: string | null;
};

// ── Admin ───────────────────────────────────────────────────────────────────
export async function listReps(actorId: string, f: { q?: string | null; status?: string | null; province?: string | null; sort?: string | null; page?: number } = {}) {
  await salesAdmin(actorId);
  const where = [];
  if (f.q?.trim()) { const q = `%${f.q.trim().replace(/[%_]/g, "")}%`; where.push(or(ilike(salesRep.name, q), ilike(salesRep.email, q), ilike(salesRep.code, q), ilike(salesRep.city, q))); }
  if (f.status && isRepStatus(f.status)) where.push(eq(salesRep.status, f.status));
  if (f.province?.trim()) where.push(ilike(salesRep.province, f.province.trim()));
  const order = f.sort === "recent" ? desc(salesRep.createdAt) : f.sort === "status" ? asc(salesRep.status) : asc(salesRep.name);
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const cond = where.length ? and(...where) : undefined;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(salesRep).where(cond);
  const rows = await db.select().from(salesRep).where(cond).orderBy(order, asc(salesRep.id)).limit(PAGE).offset((page - 1) * PAGE);
  const ids = rows.map((r) => r.id);
  const deals = ids.length ? await db.select({ rep: schema.salesDeal.repId, status: schema.salesDeal.status, n: sql<number>`count(*)::int` }).from(schema.salesDeal)
    .where(inArray(schema.salesDeal.repId, ids)).groupBy(schema.salesDeal.repId, schema.salesDeal.status) : [];
  const opps = ids.length ? await db.select({ rep: schema.salesOpportunity.repId, n: sql<number>`count(*)::int` }).from(schema.salesOpportunity)
    .where(and(inArray(schema.salesOpportunity.repId, ids), inArray(schema.salesOpportunity.stage, ["new", "contacted", "interested", "meeting", "demo", "proposal", "negotiation", "declared"]))).groupBy(schema.salesOpportunity.repId) : [];
  const provinces = (await db.selectDistinct({ p: salesRep.province }).from(salesRep)).map((x) => x.p).filter(Boolean).sort() as string[];
  return {
    total: n, page, pageSize: PAGE, provinces,
    rows: rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, email: r.email, phone: r.phone, city: r.city, province: r.province, zone: r.zone, status: r.status, statusLabel: REP_STATUS[r.status as RepStatus],
      payoutFrequency: r.payoutFrequency, joinedAt: r.joinedAt, createdAt: r.createdAt,
      openOpportunities: opps.find((o) => o.rep === r.id)?.n ?? 0,
      approvedDeals: deals.filter((d) => d.rep === r.id && d.status === "approved").reduce((a, d) => a + d.n, 0),
      pendingDeals: deals.filter((d) => d.rep === r.id && (d.status === "declared" || d.status === "needs_correction")).reduce((a, d) => a + d.n, 0),
    })),
  };
}

function validateInput(p: Partial<RepInput>, partial: boolean) {
  const missing = [
    !partial && (p.name ?? "").trim().length < 2 && "nombre y apellido",
    !partial && !isEmail(p.email) && "email válido",
    p.engagement !== undefined && !(p.engagement in ENGAGEMENT) && "tipo de vinculación",
    p.payoutFrequency !== undefined && !isPayoutFrequency(p.payoutFrequency) && "frecuencia de liquidación",
    p.payoutFrequency === "custom" && !(p.payoutNote ?? "").trim() && "detalle de la frecuencia «otra»",
  ].filter(Boolean);
  if (missing.length) throw new AccessError("invalid", `Revisá: ${missing.join(", ")}.`);
}
async function checkRefs(p: Partial<RepInput>, selfId?: string) {
  if (p.regionId) { const [x] = await db.select({ id: salesRegion.id }).from(salesRegion).where(eq(salesRegion.id, p.regionId)); if (!x) throw new AccessError("invalid", "La región no existe."); }
  if (p.managerRepId) {
    if (p.managerRepId === selfId) throw new AccessError("invalid", "Un vendedor no puede ser su propio responsable.");
    const m = await repById(p.managerRepId);
    if (m.status === "terminated") throw new AccessError("invalid", "El responsable elegido está desvinculado.");
    if (selfId && m.managerRepId === selfId) throw new AccessError("invalid", "Esa asignación forma un círculo de responsables.");
  }
}

export async function createRep(actorId: string, p: RepInput) {
  await salesAdmin(actorId);
  validateInput(p, false);
  await checkRefs(p);
  const email = normalizeEmail(p.email);
  const [dup] = await db.select({ id: salesRep.id }).from(salesRep).where(and(eq(salesRep.email, email), ne(salesRep.status, "terminated")));
  if (dup) throw new AccessError("exists", "Ya hay un vendedor con ese email.", 409, { repId: dup.id });
  const code = await uniqueCode();
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(salesRep).values({
      code, name: p.name.trim().slice(0, 120), email, phone: clean(p.phone, 40), city: clean(p.city, 80), province: clean(p.province, 80), zone: clean(p.zone, 120),
      regionId: p.regionId || null, managerRepId: p.managerRepId || null, engagement: p.engagement ?? "independent", canSellCoaches: !!p.canSellCoaches,
      payoutFrequency: p.payoutFrequency ?? "monthly", payoutNote: clean(p.payoutNote, 300), agreementRef: clean(p.agreementRef, 200), createdBy: actorId,
    }).onConflictDoNothing().returning();
    if (!r) throw new AccessError("exists", "Ya hay un vendedor con ese email.", 409);
    await audit(tx, { actorUserId: actorId, action: "sales.rep_created", resourceType: "sales_rep", resourceId: r.id, meta: { code } });
    return { id: r.id, code: r.code };
  });
}

export async function updateRep(actorId: string, repId: string, p: Partial<RepInput>) {
  await salesAdmin(actorId);
  validateInput(p, true);
  const r = await repById(repId);
  await checkRefs(p, repId);
  const set: Partial<typeof salesRep.$inferInsert> = {};
  if (p.name !== undefined) { if (p.name.trim().length < 2) throw new AccessError("invalid", "Nombre inválido."); set.name = p.name.trim().slice(0, 120); }
  if (p.email !== undefined && normalizeEmail(p.email) !== r.email) {
    if (!isEmail(p.email)) throw new AccessError("invalid", "Email inválido.");
    if (r.userId) throw new AccessError("invalid_state", "El vendedor ya vinculó su cuenta: el email se cambia desde su cuenta REPI.", 409);
    set.email = normalizeEmail(p.email);
  }
  for (const k of ["phone", "city", "province", "zone", "payoutNote", "agreementRef"] as const) if (p[k] !== undefined) set[k] = clean(p[k], k === "zone" || k === "agreementRef" ? 200 : 80) as never;
  if (p.regionId !== undefined) set.regionId = p.regionId || null;
  if (p.managerRepId !== undefined) set.managerRepId = p.managerRepId || null;
  if (p.engagement !== undefined) set.engagement = p.engagement;
  if (p.canSellCoaches !== undefined) set.canSellCoaches = !!p.canSellCoaches;
  if (p.payoutFrequency !== undefined) set.payoutFrequency = p.payoutFrequency;
  if (!Object.keys(set).length) throw new AccessError("invalid", "No hay cambios para guardar.");
  await db.transaction(async (tx) => {
    await tx.update(salesRep).set({ ...set, updatedAt: new Date() }).where(eq(salesRep.id, repId));
    // Si cambió el email, una invitación vigente al anterior deja de servir.
    if (set.email) await tx.update(salesRepInvitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(salesRepInvitation.repId, repId), eq(salesRepInvitation.status, "pending")));
    await audit(tx, { actorUserId: actorId, action: "sales.rep_updated", resourceType: "sales_rep", resourceId: repId, meta: { fields: Object.keys(set) } });
    if (set.payoutFrequency && set.payoutFrequency !== r.payoutFrequency) {
      await notifyRep(tx, repId, { kind: "payout_frequency", title: `Frecuencia de liquidación: ${PAYOUT_FREQUENCY[set.payoutFrequency]}`, body: "REPI actualizó cómo se agrupan tus liquidaciones. No cambia importes ni adelanta comisiones.", url: "/ventas?s=perfil", dedupeKey: `freq:${Date.now()}` });
    }
  });
  return { ok: true };
}

const TRANSITIONS: Record<RepStatus, RepStatus[]> = {
  invited: ["terminated"], pending_acceptance: ["terminated"], active: ["paused", "suspended", "terminated"],
  paused: ["active", "suspended", "terminated"], suspended: ["active", "terminated"], terminated: ["active"],
};
/**
 * Pausar, suspender, reactivar o desvincular. La desvinculación corta el acceso comercial (CRM y ventas) en el servidor,
 * revoca invitaciones y conserva todo el historial y los derechos económicos ya devengados.
 */
export async function setRepStatus(actorId: string, repId: string, to: RepStatus, reason: string) {
  await salesAdmin(actorId);
  if (!isRepStatus(to)) throw new AccessError("invalid", "Estado inválido.");
  if ((reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo.");
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(salesRep).where(eq(salesRep.id, repId)).for("update");
    if (!r) throw NF();
    if (!TRANSITIONS[r.status as RepStatus].includes(to)) throw new AccessError("invalid_state", `No se puede pasar de «${REP_STATUS[r.status as RepStatus]}» a «${REP_STATUS[to]}».`, 409);
    let next = to;
    if (to === "active" && !r.userId) next = "invited"; // reactivar a alguien que nunca aceptó: vuelve a invitarse
    if (r.status === "terminated" && to === "active") {
      const [dup] = await tx.select({ id: salesRep.id }).from(salesRep).where(and(eq(salesRep.email, r.email), ne(salesRep.status, "terminated"), ne(salesRep.id, r.id)));
      if (dup) throw new AccessError("exists", "Ya hay otro vendedor activo con ese email.", 409);
    }
    await tx.update(salesRep).set({ status: next, statusReason: reason.trim().slice(0, 300), terminatedAt: next === "terminated" ? new Date() : next === "active" || next === "invited" ? null : r.terminatedAt, updatedAt: new Date() }).where(eq(salesRep.id, repId));
    if (next === "terminated") await tx.update(salesRepInvitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(salesRepInvitation.repId, repId), eq(salesRepInvitation.status, "pending")));
    await audit(tx, { actorUserId: actorId, action: "sales.rep_status", resourceType: "sales_rep", resourceId: repId, meta: { from: r.status, to: next } });
    await notifyRep(tx, repId, { kind: "rep_status", title: `Tu cuenta comercial: ${REP_STATUS[next]}`, body: `Motivo: ${reason.trim().slice(0, 200)}.`, url: "/ventas", dedupeKey: `status:${next}:${Date.now()}` });
    return { status: next };
  });
}

/** Envía o reenvía la invitación: token aleatorio (sólo se guarda el hash), vence en 7 días, un solo uso, ligado al email. */
export async function sendRepInvitation(actorId: string, repId: string) {
  await salesAdmin(actorId);
  const r = await repById(repId);
  if (r.userId && r.status !== "invited") throw new AccessError("invalid_state", "Este vendedor ya aceptó su invitación.", 409);
  if (r.status === "terminated" || r.status === "suspended" || r.status === "paused") throw new AccessError("invalid_state", "Reactivá al vendedor antes de invitarlo.", 409);
  const token = newToken();
  const inv = await db.transaction(async (tx) => {
    await tx.select({ id: salesRep.id }).from(salesRep).where(eq(salesRep.id, repId)).for("update");
    await tx.update(salesRepInvitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(salesRepInvitation.repId, repId), eq(salesRepInvitation.status, "pending")));
    const [i] = await tx.insert(salesRepInvitation).values({ repId, email: r.email, tokenHash: sha256(token), expiresAt: addDays(new Date(), INVITE_DAYS), invitedBy: actorId }).returning();
    await tx.update(salesRep).set({ status: "pending_acceptance", updatedAt: new Date() }).where(eq(salesRep.id, repId));
    await audit(tx, { actorUserId: actorId, action: "sales.rep_invited", resourceType: "sales_rep_invitation", resourceId: i.id, meta: { repId } });
    return i;
  });
  let delivery: "submitted" | "local_only" | "failed";
  try {
    delivery = await deliverMail({ to: r.email, subject: "Te invitamos a vender REPI", body: `Hola ${r.name.split(" ")[0]}:\n\nREPI te invitó a su equipo comercial (código ${r.code}). Aceptá la invitación y entrá a tu panel de ventas:\n${appUrl()}/ventas/activar/${token}\n\nEs personal: sólo funciona con ${r.email}. Vence en ${INVITE_DAYS} días.` });
  } catch (e) {
    delivery = "failed";
    if (!(e instanceof MailError)) logError("sales.invite_mail", e);
  }
  await db.update(salesRepInvitation).set({ delivery }).where(eq(salesRepInvitation.id, inv.id));
  await audit(db, { actorUserId: actorId, action: "sales.rep_invitation_delivery", resourceType: "sales_rep_invitation", resourceId: inv.id, result: delivery === "failed" ? "error" : "ok", meta: { delivery } });
  if (delivery === "failed") throw new AccessError("mail_failed", "El proveedor de correo no aceptó la invitación. No se envió: probá reenviarla en unos minutos.", 502);
  return { id: inv.id, expiresAt: inv.expiresAt, delivery };
}
export async function revokeRepInvitation(actorId: string, repId: string) {
  await salesAdmin(actorId);
  const r = await repById(repId);
  await db.transaction(async (tx) => {
    const rows = await tx.update(salesRepInvitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(salesRepInvitation.repId, repId), eq(salesRepInvitation.status, "pending"))).returning();
    if (rows.length && r.status === "pending_acceptance") await tx.update(salesRep).set({ status: "invited", updatedAt: new Date() }).where(eq(salesRep.id, repId));
    await audit(tx, { actorUserId: actorId, action: "sales.rep_invitation_revoked", resourceType: "sales_rep", resourceId: repId, meta: { revoked: rows.length } });
  });
  return { ok: true };
}

export async function assignPlan(actorId: string, repId: string, p: { planVersionId: string; effectiveFrom: string; reason: string }) {
  await salesAdmin(actorId);
  await repById(repId);
  if (!isDay(p.effectiveFrom)) throw new AccessError("invalid", "Fecha de vigencia inválida.");
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo.");
  const [v] = await db.select().from(commissionPlanVersion).where(eq(commissionPlanVersion.id, p.planVersionId));
  if (!v || v.status !== "approved") throw new AccessError("invalid", "Sólo se asignan versiones de plan aprobadas.");
  if (p.effectiveFrom < v.effectiveFrom) throw new AccessError("invalid", "La asignación no puede empezar antes de la vigencia de la versión.");
  const [row] = await db.insert(salesRepPlan).values({ repId, planVersionId: v.id, effectiveFrom: p.effectiveFrom, reason: p.reason.trim().slice(0, 300), assignedBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, action: "sales.plan_assigned", resourceType: "sales_rep", resourceId: repId, meta: { planVersionId: v.id, effectiveFrom: p.effectiveFrom } });
  const [plan] = await db.select().from(commissionPlan).where(eq(commissionPlan.id, v.planId));
  await notifyRep(db, repId, { kind: "plan", title: `Plan de comisiones: ${plan.name} v${v.version}`, body: `Rige desde el ${p.effectiveFrom} para las ventas que cierres desde esa fecha. Lo ya aprobado conserva su plan.`, url: "/ventas?s=comisiones", dedupeKey: `plan:${row.id}` });
  return { id: row.id };
}
/** Plan vigente de un vendedor en una fecha: la asignación con mayor vigencia ≤ fecha (empate: la más reciente). */
export async function planVersionAt(repId: string, dateIso: string, q: Tx | typeof db = db) {
  const rows = await q.select({ a: salesRepPlan, v: commissionPlanVersion, p: commissionPlan }).from(salesRepPlan)
    .innerJoin(commissionPlanVersion, eq(commissionPlanVersion.id, salesRepPlan.planVersionId)).innerJoin(commissionPlan, eq(commissionPlan.id, commissionPlanVersion.planId))
    .where(and(eq(salesRepPlan.repId, repId), sql`${salesRepPlan.effectiveFrom} <= ${dateIso}`)).orderBy(desc(salesRepPlan.effectiveFrom), desc(salesRepPlan.createdAt)).limit(1);
  return rows[0] ?? null;
}

// ── Invitación: aceptación por el vendedor ─────────────────────────────────
async function invitationByToken(token: string) {
  const [r] = await db.select({ i: salesRepInvitation, rep: salesRep }).from(salesRepInvitation).innerJoin(salesRep, eq(salesRep.id, salesRepInvitation.repId))
    .where(eq(salesRepInvitation.tokenHash, sha256((token ?? "").trim())));
  return r ?? null;
}
const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");
export async function lookupRepInvitation(token: string) {
  const r = await invitationByToken(token);
  if (!r) throw new AccessError("invalid_link", "El enlace no es válido.", 404);
  const state = r.i.status !== "pending" ? r.i.status : r.i.expiresAt < new Date() ? "expired" : "pending";
  return { state, orgName: "Equipo comercial de REPI", kind: "seller" as const, emailHint: maskEmail(r.i.email), role: "seller" };
}
/** Un solo uso, cuenta verificada con el mismo email, sin duplicar cuentas. Dos aceptaciones simultáneas → una sola gana. */
export async function acceptRepInvitation(userId: string, token: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u?.emailVerified) throw new AccessError("unverified", "Verificá tu email para continuar.", 403);
  const r = await invitationByToken(token);
  if (!r) throw new AccessError("invalid_link", "El enlace no es válido.", 404);
  // El rechazo por email ajeno se audita fuera de la transacción (si no, el rollback lo borraría).
  if (r.i.status === "pending" && normalizeEmail(r.i.email) !== normalizeEmail(u.email)) {
    await audit(db, { actorUserId: userId, action: "sales.rep_accept", resourceType: "sales_rep_invitation", resourceId: r.i.id, result: "denied", meta: { reason: "email_mismatch" } });
    throw new AccessError("email_mismatch", "Esta invitación es para otro email. Ingresá con la cuenta invitada.", 403);
  }
  return db.transaction(async (tx) => {
    const [i] = await tx.select().from(salesRepInvitation).where(eq(salesRepInvitation.id, r.i.id)).for("update");
    const [rep] = await tx.select().from(salesRep).where(eq(salesRep.id, i.repId)).for("update");
    if (i.status !== "pending" || i.expiresAt < new Date()) throw new AccessError("invalid_link", i.status === "accepted" ? "Esta invitación ya se usó." : "La invitación venció o fue revocada. Pedí una nueva a REPI.", 409);
    if (normalizeEmail(i.email) !== normalizeEmail(u.email)) throw new AccessError("email_mismatch", "Esta invitación es para otro email. Ingresá con la cuenta invitada.", 403);
    if (rep.status === "terminated" || rep.status === "suspended") throw new AccessError("invalid_link", "La invitación ya no está vigente.", 409);
    const [other] = await tx.select({ id: salesRep.id }).from(salesRep).where(and(eq(salesRep.userId, userId), ne(salesRep.id, rep.id)));
    if (other) throw new AccessError("exists", "Tu cuenta ya está vinculada a otro perfil comercial. Escribí a REPI.", 409);
    await tx.update(salesRep).set({ userId, status: "active", joinedAt: rep.joinedAt ?? new Date(), updatedAt: new Date() }).where(eq(salesRep.id, rep.id));
    await tx.update(salesRepInvitation).set({ status: "accepted", acceptedBy: userId, acceptedAt: new Date() }).where(eq(salesRepInvitation.id, i.id));
    await audit(tx, { actorUserId: userId, action: "sales.rep_joined", resourceType: "sales_rep", resourceId: rep.id });
    await notifyAdmins(tx, { kind: "rep_joined", title: `${rep.name} aceptó la invitación de vendedor`, body: `Código ${rep.code}. Ya puede entrar a su panel de ventas.`, url: `/admin?s=sales&rep=${rep.id}`, dedupeKey: `rep_joined:${rep.id}:${i.id}` });
    return { repId: rep.id, href: "/ventas" };
  });
}

// ── Perfil del vendedor ─────────────────────────────────────────────────────
export function publicRep(r: Rep) {
  return { id: r.id, code: r.code, name: r.name, email: r.email, phone: r.phone, city: r.city, province: r.province, zone: r.zone, status: r.status, statusLabel: REP_STATUS[r.status as RepStatus],
    engagement: r.engagement, canSellCoaches: r.canSellCoaches, payoutFrequency: r.payoutFrequency, payoutNote: r.payoutNote, joinedAt: r.joinedAt, profileCompletedAt: r.profileCompletedAt };
}
export async function myProfile(userId: string) {
  const r = await requireRep(userId, "moneyRead");
  const plan = await planVersionAt(r.id, today());
  const [req] = await db.select().from(salesRequest).where(and(eq(salesRequest.repId, r.id), eq(salesRequest.kind, "payout_frequency"))).orderBy(desc(salesRequest.createdAt)).limit(1);
  const [mgr] = r.managerRepId ? await db.select({ name: salesRep.name }).from(salesRep).where(eq(salesRep.id, r.managerRepId)) : [];
  return { rep: publicRep(r), manager: mgr?.name ?? null, plan: plan ? { name: plan.p.name, version: plan.v.version, rules: plan.v.rules, effectiveFrom: plan.a.effectiveFrom } : null,
    frequencyRequest: req ? { status: req.status, payload: req.payload, resolution: req.resolution, createdAt: req.createdAt } : null,
    referralUrl: `${appUrl()}/conoce?ref=${r.code}` };
}
export async function updateMyProfile(userId: string, p: { phone?: string | null; city?: string | null; province?: string | null; zone?: string | null }) {
  const r = await requireRep(userId, "profileWrite");
  const phone = clean(p.phone, 40), city = clean(p.city, 80), province = clean(p.province, 80);
  if (!phone || (phone.replace(/\D/g, "").length < 8)) throw new AccessError("invalid", "Escribí un teléfono con código de área.");
  if (!city || !province) throw new AccessError("invalid", "Completá ciudad y provincia.");
  await db.update(salesRep).set({ phone, city, province, zone: clean(p.zone, 120) ?? r.zone, profileCompletedAt: r.profileCompletedAt ?? new Date(), updatedAt: new Date() }).where(eq(salesRep.id, r.id));
  await audit(db, { actorUserId: userId, action: "sales.profile_updated", resourceType: "sales_rep", resourceId: r.id });
  return { ok: true };
}
/** El vendedor pide otra frecuencia: queda una solicitud para Admin. No cambia nada hasta que Admin la apruebe. */
export async function requestPayoutFrequency(userId: string, p: { frequency: PayoutFrequency; message?: string | null }) {
  const r = await requireRep(userId, "profileWrite");
  if (!isPayoutFrequency(p.frequency) || p.frequency === "custom") throw new AccessError("invalid", "Elegí una frecuencia.");
  if (p.frequency === r.payoutFrequency) throw new AccessError("invalid", "Ya es tu frecuencia actual.");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(salesRequest).values({ kind: "payout_frequency", repId: r.id, payload: { from: r.payoutFrequency, to: p.frequency }, message: clean(p.message, 500) }).onConflictDoNothing().returning();
    if (!row) throw new AccessError("exists", "Ya tenés una solicitud de cambio en revisión.", 409);
    await notifyAdmins(tx, { kind: "frequency_request", title: `${r.name} pidió liquidación ${PAYOUT_FREQUENCY[p.frequency].toLowerCase()}`, body: "Revisala en Ventas › Solicitudes.", url: "/admin?s=sales&tab=requests", dedupeKey: `freq_req:${row.id}` });
    await audit(tx, { actorUserId: userId, action: "sales.frequency_requested", resourceType: "sales_request", resourceId: row.id });
    return { id: row.id };
  });
}

// ── Regiones ────────────────────────────────────────────────────────────────
export async function listRegions(actorId: string) {
  await salesAdmin(actorId);
  return db.select().from(salesRegion).orderBy(asc(salesRegion.name));
}
export async function saveRegion(actorId: string, p: { id?: string | null; name: string; provinces?: string | null; note?: string | null; active?: boolean }) {
  await salesAdmin(actorId);
  if ((p.name ?? "").trim().length < 2) throw new AccessError("invalid", "Nombre de región inválido.");
  const v = { name: p.name.trim().slice(0, 80), provinces: clean(p.provinces, 300), note: clean(p.note, 300), active: p.active ?? true };
  try {
    if (p.id) { const r = await db.update(salesRegion).set(v).where(eq(salesRegion.id, p.id)).returning(); if (!r.length) throw NF(); return { id: p.id }; }
    const [r] = await db.insert(salesRegion).values({ ...v, createdBy: actorId }).returning();
    await audit(db, { actorUserId: actorId, action: "sales.region_saved", resourceType: "sales_region", resourceId: r.id });
    return { id: r.id };
  } catch (e) {
    if ((e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505") throw new AccessError("exists", "Ya existe una región con ese nombre.", 409);
    throw e;
  }
}

export async function repOptions(actorId: string) {
  await salesAdmin(actorId);
  return db.select({ id: salesRep.id, name: salesRep.name, code: salesRep.code, status: salesRep.status }).from(salesRep).where(isNull(salesRep.terminatedAt)).orderBy(asc(salesRep.name));
}
