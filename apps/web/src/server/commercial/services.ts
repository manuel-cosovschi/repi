// Alta comercial y condiciones por cliente (anexo 26/10 §4 y §9). Sólo REPI Admin (con 2FA) crea clientes, registra
// aceptaciones, habilita y edita cantidad/precio. El cliente ve sus condiciones y pide correcciones; nunca las edita.
// Nada de esto emite cobros reales: la vista previa y el cierre simulado no son facturas (D01–D05 siguen pendientes).
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  ACTIVATION_LABEL, TERMS_VERSION, activationStage, fmtMoney, isCurrency, isEmail, normalizeEmail, overAgreed, previewPeriod,
  type ContractStatus, type Currency, type Term,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit, newInviteCode, newToken, sha256 } from "../access/util";
import { sendMail } from "../mailer";
import { enabledAccesses } from "../join/services";

const { user, organization, gymLocation, staffMembership, invitation, clientContract, contractTerm, billingSnapshot, correctionRequest, commercialLead, legalAcceptance } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const OWNER_INVITE_DAYS = 7;

export async function requireAdmin(actorId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, actorId));
  if (!u || u.platformRole !== "admin") throw NOT_FOUND();
  if (!u.twoFactorEnabled) throw new AccessError("twofa_required", "REPI Admin exige verificación en dos pasos.", 403);
  return u;
}

// ── Contacto comercial público (reemplaza la autoalta) ──────────────────────
export async function createLead(p: { kind: string; orgName: string; contactName: string; email: string; phone?: string | null; message?: string | null }) {
  if (!["gym", "coach"].includes(p.kind) || (p.orgName ?? "").trim().length < 2 || (p.contactName ?? "").trim().length < 2 || !isEmail(p.email)) {
    throw new AccessError("invalid", "Completá tus datos para que te contactemos.");
  }
  await db.insert(commercialLead).values({ kind: p.kind as "gym" | "coach", orgName: p.orgName.trim().slice(0, 120), contactName: p.contactName.trim().slice(0, 80),
    email: normalizeEmail(p.email), phone: p.phone?.trim().slice(0, 40) || null, message: p.message?.trim().slice(0, 600) || null });
  return { ok: true };
}

// ── Listado de clientes y regularización ────────────────────────────────────
async function termsOf(contractIds: string[]) {
  return contractIds.length ? db.select().from(contractTerm).where(inArray(contractTerm.contractId, contractIds)).orderBy(asc(contractTerm.version)) : [];
}
const asTerm = (t: typeof contractTerm.$inferSelect): Term => ({ id: t.id, kind: t.kind, version: t.version, value: t.value, currency: (t.currency as Currency) ?? null, effectiveFrom: t.effectiveFrom, createdAt: t.createdAt });

export async function listClients(actorId: string) {
  await requireAdmin(actorId);
  // Las organizaciones de la demo guiada (D85) son de cada visitante y se borran solas: no se listan.
  const sandbox = new Set((await db.select({ o: schema.demoSandbox.orgIds }).from(schema.demoSandbox)).flatMap((b) => b.o as string[]));
  const orgs = (await db.select().from(organization).orderBy(asc(organization.name))).filter((o) => !sandbox.has(o.id));
  const contracts = await db.select().from(clientContract);
  const terms = await termsOf(contracts.map((c) => c.id));
  const owners = await db.select({ org: staffMembership.orgId }).from(staffMembership).where(and(inArray(staffMembership.role, ["owner", "coach_owner"]), eq(staffMembership.status, "active")));
  const invites = await db.select({ org: invitation.orgId, status: invitation.status }).from(invitation).where(eq(invitation.kind, "org_owner"));
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const o of orgs) {
    const c = contracts.find((x) => x.orgId === o.id);
    const ts = c ? terms.filter((t) => t.contractId === c.id).map(asTerm) : [];
    const q = ts.filter((t) => t.kind === "quantity" && t.effectiveFrom <= today).at(-1) ?? null;
    const p = ts.filter((t) => t.kind === "unit_price" && t.effectiveFrom <= today).at(-1) ?? null;
    const enabled = await enabledAccesses(o.id);
    const stage = c ? activationStage({ contract: c.status as ContractStatus, invitationSent: invites.some((i) => i.org === o.id), ownerJoined: owners.some((x) => x.org === o.id), setupDone: !!c.setupDoneAt || owners.some((x) => x.org === o.id) }) : null;
    out.push({
      orgId: o.id, name: o.name, kind: o.kind, demo: o.isDemo, commercialStatus: o.commercialStatus, contractId: c?.id ?? null,
      stage, stageLabel: stage ? ACTIVATION_LABEL[stage] : o.commercialStatus === "legacy" ? "A regularizar (cliente previo al anexo)" : "Sin contrato",
      agreed: q?.value ?? null, unitPrice: p ? fmtMoney(p.value, (p.currency ?? "ARS") as Currency) : null, enabledAccesses: enabled, overAgreed: overAgreed(q?.value ?? null, enabled),
    });
  }
  const leads = await db.select().from(commercialLead).orderBy(desc(commercialLead.createdAt)).limit(30);
  return { clients: out.filter((x) => !x.demo), demo: out.filter((x) => x.demo), leads };
}

/**
 * F-AD-01: resumen de Admin desde acuerdos y eventos reales, sin DEMO. Separa lo acordado (cantidad × precio del contrato)
 * de la adopción (accesos habilitados) y no muestra cobros: todavía no se registran pagos reales (D24/§12 del anexo).
 */
export async function adminSummary(actorId: string, now = new Date()) {
  const { clients, leads } = await listClients(actorId);
  const since7 = new Date(now.getTime() - 7 * 86_400_000), since1 = new Date(now.getTime() - 86_400_000);
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  const enabled = clients.filter((c) => c.commercialStatus === "enabled");
  return {
    clients: {
      total: clients.length, enabled: enabled.length,
      draft: clients.filter((c) => c.stage && c.commercialStatus !== "enabled").length,
      legacy: clients.filter((c) => c.commercialStatus === "legacy").length,
      gyms: clients.filter((c) => c.kind === "gym").length, coaches: clients.filter((c) => c.kind === "coach").length,
    },
    agreed: enabled.reduce((a, c) => a + (c.agreed ?? 0), 0),
    adoption: enabled.reduce((a, c) => a + c.enabledAccesses, 0),
    overAgreed: clients.filter((c) => c.overAgreed).length,
    collected: null as null, // sin registro de pagos reales: no se informa «cobrado»
    leadsNew: leads.filter((l) => l.status === "new").length,
    privacyPending: await count(db.select({ n }).from(schema.privacyRequest).where(eq(schema.privacyRequest.status, "pending"))),
    deniedLast7d: await count(db.select({ n }).from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "access.denied"), gte(schema.auditEvent.at, since7)))),
    pushFailedLast24h: await count(db.select({ n }).from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.status, "failed"), gte(schema.notificationOutbox.createdAt, since1)))),
  };
}

/** Alta comercial: crea la ficha y una organización SIN habilitar (no admite altas operativas) y el contrato en borrador. */
export async function createClient(actorId: string, p: {
  kind: "gym" | "coach"; orgName: string; legalName: string; responsibleName: string; responsibleEmail: string; currency: string;
  scope?: "organization" | "locations"; scopeNote?: string | null; quantityDefinition?: string | null; locations?: string[];
}) {
  await requireAdmin(actorId);
  if (!["gym", "coach"].includes(p.kind) || (p.orgName ?? "").trim().length < 2 || (p.legalName ?? "").trim().length < 2 || (p.responsibleName ?? "").trim().length < 2 || !isEmail(p.responsibleEmail) || !isCurrency(p.currency)) {
    throw new AccessError("invalid", "Completá tipo, nombres, email del responsable y moneda.");
  }
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organization).values({ kind: p.kind, name: p.orgName.trim().slice(0, 120), status: "active", commercialStatus: "pending", createdBy: actorId }).returning();
    if (p.kind === "gym") {
      const locs = (p.locations ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 30);
      for (const name of locs.length ? locs : ["Sede principal"]) await tx.insert(gymLocation).values({ orgId: org.id, name: name.slice(0, 80) });
    }
    const [c] = await tx.insert(clientContract).values({
      orgId: org.id, kind: p.kind, legalName: p.legalName.trim().slice(0, 160), responsibleName: p.responsibleName.trim().slice(0, 80), responsibleEmail: normalizeEmail(p.responsibleEmail),
      currency: p.currency as Currency, scope: p.scope ?? "organization", scopeNote: p.scopeNote?.trim() || null, quantityDefinition: p.quantityDefinition?.trim() || null, createdBy: actorId,
    }).returning();
    await audit(tx, { actorUserId: actorId, orgId: org.id, action: "commercial.client_created", resourceType: "client_contract", resourceId: c.id });
    return { orgId: org.id, contractId: c.id };
  });
}

/** Regularizar un cliente previo: crea el contrato en borrador sin inferir precios ni cobrar retroactivamente. */
export async function regularize(actorId: string, orgId: string, p: { legalName: string; responsibleName: string; responsibleEmail: string; currency: string }) {
  await requireAdmin(actorId);
  const [o] = await db.select().from(organization).where(eq(organization.id, orgId));
  if (!o) throw NOT_FOUND();
  if (!isEmail(p.responsibleEmail) || !isCurrency(p.currency) || (p.legalName ?? "").trim().length < 2) throw new AccessError("invalid", "Completá razón social, responsable y moneda.");
  const [c] = await db.insert(clientContract).values({ orgId, kind: o.kind, legalName: p.legalName.trim(), responsibleName: (p.responsibleName ?? "").trim() || "Responsable", responsibleEmail: normalizeEmail(p.responsibleEmail), currency: p.currency as Currency, createdBy: actorId })
    .onConflictDoNothing().returning();
  if (!c) throw new AccessError("exists", "Este cliente ya tiene contrato.", 409);
  await audit(db, { actorUserId: actorId, orgId, action: "commercial.regularization_started", resourceType: "client_contract", resourceId: c.id });
  return { contractId: c.id };
}

async function contractFor(contractId: string) {
  const [c] = await db.select().from(clientContract).where(eq(clientContract.id, contractId));
  if (!c) throw NOT_FOUND();
  return c;
}

export async function contractDetail(actorId: string, contractId: string, period?: { start: string; end: string }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  const terms = (await termsOf([c.id]));
  const authors = new Map((terms.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(terms.map((t) => t.createdBy))])) : []).map((u) => [u.id, u.name]));
  const invites = await db.select().from(invitation).where(and(eq(invitation.orgId, c.orgId), eq(invitation.kind, "org_owner"))).orderBy(desc(invitation.createdAt));
  const snaps = await db.select().from(billingSnapshot).where(eq(billingSnapshot.contractId, c.id)).orderBy(desc(billingSnapshot.periodStart));
  const corrections = await db.select().from(correctionRequest).where(eq(correctionRequest.contractId, c.id)).orderBy(desc(correctionRequest.createdAt));
  const enabled = await enabledAccesses(c.orgId);
  const pr = period ?? currentPeriod();
  const prev = previewPeriod(terms.map(asTerm), pr);
  const latestQ = terms.filter((t) => t.kind === "quantity").at(-1);
  return {
    contract: c, org: o, enabledAccesses: enabled, overAgreed: overAgreed(prev.quantity?.value ?? null, enabled),
    quantityAgeDays: latestQ ? Math.floor((Date.now() - latestQ.createdAt.getTime()) / 86_400_000) : null,
    terms: terms.map((t) => ({ ...t, author: authors.get(t.createdBy) ?? "", display: t.kind === "unit_price" ? fmtMoney(t.value, (t.currency ?? c.currency) as Currency) : String(t.value) })),
    preview: prev.ok ? { ...prev, subtotalTxt: fmtMoney(prev.subtotal, prev.currency), period: pr } : { ...prev, period: pr },
    invitations: invites.map((i) => ({ id: i.id, email: i.email, status: i.status, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    snapshots: snaps.map((s) => ({ ...s, subtotalTxt: fmtMoney(s.subtotalMinor, s.currency as Currency) })), corrections,
    pending: ["Qué socios/alumnos cuentan como vigentes", "Ciclo, corte y prorrateo", "Mora y suspensión", "Cobertura multisede sin duplicados"].filter((x, i) => i !== 0 || !c.quantityDefinition),
  };
}
function currentPeriod() {
  const d = new Date(); const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export async function recordAcceptance(actorId: string, contractId: string, p: { method: "external" | "in_app"; ref: string; acceptedAt: string; termsVersion: string }) {
  await requireAdmin(actorId);
  if (p.method !== "external" || (p.ref ?? "").trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(p.acceptedAt) || !(p.termsVersion ?? "").trim()) {
    throw new AccessError("invalid", "Registrá referencia, fecha y versión del acuerdo aceptado por fuera de la app.");
  }
  const r = await db.update(clientContract).set({ status: "accepted", acceptedMethod: "external", acceptedRef: p.ref.trim().slice(0, 200), acceptedAt: new Date(`${p.acceptedAt}T12:00:00Z`), acceptedRecordedBy: actorId, termsVersion: p.termsVersion.trim().slice(0, 40), updatedAt: new Date() })
    .where(and(eq(clientContract.id, contractId), eq(clientContract.status, "draft"))).returning();
  if (!r.length) throw new AccessError("invalid_state", "Sólo un borrador puede registrar la aceptación.", 409);
  await audit(db, { actorUserId: actorId, orgId: r[0].orgId, action: "commercial.accepted_recorded", resourceType: "client_contract", resourceId: contractId, meta: { method: "external" } });
  return { status: "accepted" };
}

/** Habilitación comercial por Admin: sólo con aceptación registrada. Prueba gratuita únicamente si se concede explícitamente. */
export async function enableClient(actorId: string, contractId: string, p: { trialUntil?: string | null }) {
  await requireAdmin(actorId);
  if (p.trialUntil && !/^\d{4}-\d{2}-\d{2}$/.test(p.trialUntil)) throw new AccessError("invalid", "Fecha de prueba inválida.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientContract).where(eq(clientContract.id, contractId)).for("update");
    if (!c) throw NOT_FOUND();
    if (c.status !== "accepted" && c.status !== "suspended") throw new AccessError("invalid_state", "Primero registrá la aceptación del acuerdo.", 409);
    await tx.update(clientContract).set({ status: "enabled", enabledBy: actorId, enabledAt: new Date(), trialUntil: p.trialUntil ?? c.trialUntil, updatedAt: new Date() }).where(eq(clientContract.id, c.id));
    await tx.update(organization).set({ commercialStatus: "enabled", trialEndsAt: p.trialUntil ? new Date(`${p.trialUntil}T23:59:59-03:00`) : null }).where(eq(organization.id, c.orgId));
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.enabled", resourceType: "client_contract", resourceId: c.id, meta: { trialUntil: p.trialUntil ?? null } });
    return { status: "enabled" };
  });
}
/** Suspensión explícita (política del contrato): bloquea nuevas altas operativas; no marca a los socios como morosos del gym. */
export async function suspendClient(actorId: string, contractId: string, reason: string) {
  await requireAdmin(actorId);
  if ((reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo de la suspensión.");
  const c = await contractFor(contractId);
  await db.update(clientContract).set({ status: "suspended", updatedAt: new Date() }).where(eq(clientContract.id, c.id));
  await db.update(organization).set({ commercialStatus: "suspended" }).where(eq(organization.id, c.orgId));
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "commercial.suspended", resourceType: "client_contract", resourceId: c.id, meta: { reason: reason.trim().slice(0, 200) } });
  return { status: "suspended" };
}

/** Nueva versión de cantidad acordada o precio por unidad. Nunca cambia snapshots ya cerrados. */
export async function addTerm(actorId: string, contractId: string, p: { kind: "quantity" | "unit_price"; value: number; effectiveFrom: string; reason: string; evidence?: string | null }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  if (!["quantity", "unit_price"].includes(p.kind) || !Number.isSafeInteger(p.value) || p.value < 0 || (p.kind === "quantity" && p.value > 10_000_000)) throw new AccessError("invalid", "Valor inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom)) throw new AccessError("invalid", "Fecha de efecto inválida.");
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo del cambio.");
  const closed = await db.select({ s: billingSnapshot.periodEnd }).from(billingSnapshot).where(eq(billingSnapshot.contractId, c.id));
  if (closed.some((s) => s.s >= p.effectiveFrom)) throw new AccessError("closed_period", "Esa fecha cae en un período ya cerrado: registrá un ajuste explícito en lugar de reescribirlo.", 409);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`terms:${c.id}:${p.kind}`}))`);
    const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${contractTerm.version}), 0)::int` }).from(contractTerm).where(and(eq(contractTerm.contractId, c.id), eq(contractTerm.kind, p.kind)));
    const [t] = await tx.insert(contractTerm).values({ contractId: c.id, kind: p.kind, version: v + 1, value: p.value, currency: p.kind === "unit_price" ? c.currency : null, effectiveFrom: p.effectiveFrom,
      reason: p.reason.trim().slice(0, 300), evidence: p.evidence?.trim().slice(0, 300) || null, createdBy: actorId }).returning();
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.term_added", resourceType: "contract_term", resourceId: t.id, meta: { kind: p.kind, version: t.version } });
    return { version: t.version };
  });
}

/** Cierre simulado del período: guarda un snapshot inmutable. No es un cobro (política de corte y cobro pendientes). */
export async function closePeriodSimulated(actorId: string, contractId: string, period: { start: string; end: string }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const terms = (await termsOf([c.id])).map(asTerm);
  const prev = previewPeriod(terms, period);
  if (!prev.ok) throw new AccessError("incomplete", `No se puede cerrar: ${prev.reason}`, 409);
  const [s] = await db.insert(billingSnapshot).values({
    contractId: c.id, periodStart: period.start, periodEnd: period.end, mode: "simulated_close", quantity: prev.quantity.value, quantityTermId: prev.quantity.id,
    unitPriceMinor: prev.price.value, priceTermId: prev.price.id, currency: prev.currency, subtotalMinor: prev.subtotal, lines: prev.lines,
    rules: { base: "cantidad acordada × precio unitario vigentes al inicio", prorrateo: "pendiente (D04)", note: prev.note, contractStatus: c.status, termsVersion: c.termsVersion },
    createdBy: actorId,
  }).onConflictDoNothing().returning();
  if (!s) throw new AccessError("exists", "Ese período ya tiene un cierre simulado.", 409);
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "billing.simulated_close", resourceType: "billing_snapshot", resourceId: s.id });
  return { id: s.id, subtotal: fmtMoney(s.subtotalMinor, s.currency as Currency) };
}

// ── Invitación al responsable (bienvenida) ──────────────────────────────────
/** Envía (o reenvía) la invitación: ligada al email del responsable, vence, se revoca y es de un solo uso. Reenviar invalida la anterior. */
export async function sendOwnerInvitation(actorId: string, contractId: string) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  if (c.status !== "enabled") throw new AccessError("invalid_state", "Habilitá comercialmente al cliente antes de invitar al responsable.", 409);
  const token = newToken();
  const inv = await db.transaction(async (tx) => {
    await tx.update(invitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(invitation.orgId, c.orgId), eq(invitation.kind, "org_owner"), eq(invitation.status, "pending")));
    const [i] = await tx.insert(invitation).values({ code: `O${newInviteCode()}${newInviteCode()}`, kind: "org_owner", orgId: c.orgId, role: c.kind === "gym" ? "owner" : "coach_owner",
      email: c.responsibleEmail, invitedBy: actorId, tokenHash: sha256(token), contractId: c.id, expiresAt: addDays(new Date(), OWNER_INVITE_DAYS) }).returning();
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.owner_invited", resourceType: "invitation", resourceId: i.id });
    return i;
  });
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  await sendMail({ to: c.responsibleEmail, subject: `Bienvenido a REPI · ${o.name}`, body: `Activá tu espacio en ${appUrl()}/activar/${token}\nEs personal: sólo funciona con ${c.responsibleEmail}. Vence en ${OWNER_INVITE_DAYS} días.` })
    .catch(() => { /* el envío fallido no pierde la invitación: Admin puede reenviar (D24) */ });
  return { id: inv.id, expiresAt: inv.expiresAt };
}
export async function revokeOwnerInvitation(actorId: string, contractId: string) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  await db.update(invitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(invitation.orgId, c.orgId), eq(invitation.kind, "org_owner"), eq(invitation.status, "pending")));
  return { ok: true };
}
/** Cambiar responsable: acción autorizada que revoca las invitaciones vigentes. */
export async function changeResponsible(actorId: string, contractId: string, p: { name: string; email: string }) {
  await requireAdmin(actorId);
  if (!isEmail(p.email) || (p.name ?? "").trim().length < 2) throw new AccessError("invalid", "Nombre y email válidos.");
  const c = await contractFor(contractId);
  await db.update(clientContract).set({ responsibleName: p.name.trim(), responsibleEmail: normalizeEmail(p.email), updatedAt: new Date() }).where(eq(clientContract.id, c.id));
  await db.update(invitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(invitation.orgId, c.orgId), eq(invitation.kind, "org_owner"), eq(invitation.status, "pending")));
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "commercial.responsible_changed", resourceType: "client_contract", resourceId: c.id });
  return { ok: true };
}

async function ownerInviteByToken(token: string) {
  const [r] = await db.select({ i: invitation, o: organization }).from(invitation).innerJoin(organization, eq(organization.id, invitation.orgId))
    .where(and(eq(invitation.kind, "org_owner"), eq(invitation.tokenHash, sha256(token.trim()))));
  return r ?? null;
}
const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");
export async function lookupOwnerInvitation(token: string) {
  const r = await ownerInviteByToken(token);
  if (!r) throw new AccessError("invalid_link", "El enlace no es válido.", 404);
  const state = r.i.status !== "pending" ? r.i.status : r.i.expiresAt < new Date() ? "expired" : "pending";
  return { state, orgName: r.o.name, kind: r.o.kind, emailHint: maskEmail(r.i.email ?? ""), role: r.i.role };
}
/** Aceptar la bienvenida: la cuenta verificada tiene que ser la del destinatario. Un solo uso; no duplica cuentas. */
export async function acceptOwnerInvitation(userId: string, token: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u?.emailVerified) throw new AccessError("unverified", "Verificá tu email para continuar.", 403);
  return db.transaction(async (tx) => {
    const r = await ownerInviteByToken(token);
    if (!r) throw new AccessError("invalid_link", "El enlace no es válido.", 404);
    const [i] = await tx.select().from(invitation).where(eq(invitation.id, r.i.id)).for("update");
    if (i.status !== "pending" || i.expiresAt < new Date()) throw new AccessError("invalid_link", i.status === "accepted" ? "Esta invitación ya se usó." : "La invitación venció o fue revocada. Pedí una nueva a REPI.", 409);
    if (normalizeEmail(i.email ?? "") !== normalizeEmail(u.email)) {
      await audit(tx, { actorUserId: userId, orgId: i.orgId, action: "commercial.owner_accept", resourceType: "invitation", resourceId: i.id, result: "denied", meta: { reason: "email_mismatch" } });
      throw new AccessError("email_mismatch", "Esta invitación es para otro email. Ingresá con la cuenta del responsable.", 403);
    }
    const [c] = await tx.select().from(clientContract).where(eq(clientContract.orgId, i.orgId));
    if (!c || c.status !== "enabled") throw new AccessError("org_not_enabled", "El espacio no está habilitado comercialmente.", 409);
    await tx.insert(staffMembership).values({ userId, orgId: i.orgId, role: i.role as "owner" | "coach_owner" }).onConflictDoNothing();
    if (r.o.kind === "gym") {
      const docs = await tx.select({ d: legalAcceptance.document }).from(legalAcceptance).where(and(eq(legalAcceptance.userId, userId), eq(legalAcceptance.orgId, i.orgId)));
      if (!docs.some((x) => x.d === "dpa")) await tx.insert(legalAcceptance).values({ userId, orgId: i.orgId, document: "dpa", version: TERMS_VERSION });
    }
    await tx.update(invitation).set({ status: "accepted", acceptedBy: userId, acceptedAt: new Date() }).where(eq(invitation.id, i.id));
    await audit(tx, { actorUserId: userId, orgId: i.orgId, action: "commercial.owner_joined", resourceType: "invitation", resourceId: i.id });
    return { orgId: i.orgId, kind: r.o.kind, href: r.o.kind === "gym" ? `/gym/${i.orgId}` : `/coach/${i.orgId}` };
  });
}

// ── Condiciones visibles para el cliente ────────────────────────────────────
export async function myConditions(actorId: string, orgId: string) {
  const roles = (await db.select({ r: staffMembership.role }).from(staffMembership).where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")))).map((x) => x.r);
  if (!roles.some((r) => r === "owner" || r === "coach_owner")) throw NOT_FOUND();
  const [c] = await db.select().from(clientContract).where(eq(clientContract.orgId, orgId));
  const [o] = await db.select().from(organization).where(eq(organization.id, orgId));
  const enabled = await enabledAccesses(orgId);
  if (!c) return { contract: null, commercialStatus: o.commercialStatus, enabledAccesses: enabled, terms: [], corrections: [] };
  const terms = await termsOf([c.id]);
  const corrections = await db.select().from(correctionRequest).where(eq(correctionRequest.contractId, c.id)).orderBy(desc(correctionRequest.createdAt));
  const today = new Date().toISOString().slice(0, 10);
  return {
    commercialStatus: o.commercialStatus, enabledAccesses: enabled,
    contract: { status: c.status, legalName: c.legalName, currency: c.currency, scope: c.scope, scopeNote: c.scopeNote, quantityDefinition: c.quantityDefinition, termsVersion: c.termsVersion, acceptedAt: c.acceptedAt, trialUntil: c.trialUntil },
    terms: terms.map((t) => ({ kind: t.kind, version: t.version, display: t.kind === "unit_price" ? fmtMoney(t.value, (t.currency ?? c.currency) as Currency) : String(t.value), effectiveFrom: t.effectiveFrom, current: t.effectiveFrom <= today })),
    corrections: corrections.map((x) => ({ text: x.text, status: x.status, answer: x.answer, at: x.createdAt })),
  };
}
export async function requestCorrection(actorId: string, orgId: string, text: string) {
  const roles = (await db.select({ r: staffMembership.role }).from(staffMembership).where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")))).map((x) => x.r);
  if (!roles.some((r) => r === "owner" || r === "coach_owner")) throw NOT_FOUND();
  const [c] = await db.select().from(clientContract).where(eq(clientContract.orgId, orgId));
  if (!c) throw new AccessError("no_contract", "Tu espacio todavía no tiene condiciones cargadas.", 409);
  if ((text ?? "").trim().length < 5) throw new AccessError("invalid", "Contá qué hay que corregir.");
  await db.insert(correctionRequest).values({ contractId: c.id, requestedBy: actorId, text: text.trim().slice(0, 800) });
  return { ok: true };
}
export async function answerCorrection(actorId: string, id: string, answer: string) {
  await requireAdmin(actorId);
  if ((answer ?? "").trim().length < 2) throw new AccessError("invalid", "Escribí la respuesta.");
  const [r] = await db.update(correctionRequest).set({ status: "answered", answer: answer.trim().slice(0, 800) }).where(eq(correctionRequest.id, id)).returning();
  if (!r) throw NOT_FOUND();
  await audit(db, { actorUserId: actorId, action: "commercial.correction_answered", resourceType: "correction_request", resourceId: id });
  return { ok: true };
}
export async function setLeadStatus(actorId: string, id: string, status: "contacted" | "converted" | "discarded") {
  await requireAdmin(actorId);
  const [r] = await db.update(commercialLead).set({ status }).where(eq(commercialLead.id, id)).returning();
  if (!r) throw NOT_FOUND();
  return { status };
}
