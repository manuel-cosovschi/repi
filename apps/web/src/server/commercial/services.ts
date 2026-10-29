// Alta comercial y condiciones por cliente (anexo 26/10 §4 y §9). Sólo REPI Admin (con 2FA) crea clientes, registra
// aceptaciones, habilita y edita cantidad/precio. El cliente ve sus condiciones y pide correcciones; nunca las edita.
// Nada de esto emite cobros reales: la vista previa y el cierre simulado no son facturas (D01–D05 siguen pendientes).
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  ACTIVATION_LABEL, TERMS_VERSION, activationStage, fmtMoney, isCurrency, isEmail, localDate, normalizeEmail, overAgreed, previewPeriod, requiresTwoFactor,
  type ContractStatus, type Currency, type Term,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit, newInviteCode, newToken, sha256 } from "../access/util";
import { MailError, deliverMail } from "../mailer";
import { logError } from "../log";
import { enabledAccesses } from "../join/services";
import { supportCounts } from "../support/services";
import { paymentsThisMonth } from "./payments";
import { dayTxt, noticesOf, publishNotice, requireOwner, unitWord } from "./notices";

const { user, organization, gymLocation, staffMembership, invitation, clientContract, contractTerm, billingSnapshot, correctionRequest, commercialLead, legalAcceptance, gymMember, coachClient, membershipRequest, billingPayment } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const OWNER_INVITE_DAYS = 7;

export async function requireAdmin(actorId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, actorId));
  if (!u || u.platformRole !== "admin") throw NOT_FOUND();
  if (requiresTwoFactor({ platformAdmin: true }) && !u.twoFactorEnabled) throw new AccessError("twofa_required", "REPI Admin exige verificación en dos pasos.", 403);
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
  const invites = await db.select({ org: invitation.orgId, status: invitation.status, delivery: invitation.delivery }).from(invitation).where(eq(invitation.kind, "org_owner"));
  const today = localDate(new Date());
  const out = [];
  for (const o of orgs) {
    const c = contracts.find((x) => x.orgId === o.id);
    const ts = c ? terms.filter((t) => t.contractId === c.id).map(asTerm) : [];
    const q = ts.filter((t) => t.kind === "quantity" && t.effectiveFrom <= today).at(-1) ?? null;
    const p = ts.filter((t) => t.kind === "unit_price" && t.effectiveFrom <= today).at(-1) ?? null;
    const enabled = await enabledAccesses(o.id);
    const stage = c ? activationStage({ contract: c.status as ContractStatus, invitationSent: invites.some((i) => i.org === o.id && invitationSent(i)), ownerJoined: owners.some((x) => x.org === o.id), setupDone: !!c.setupDoneAt || owners.some((x) => x.org === o.id) }) : null;
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
    collected: null as null, // REPI no cobra: no se informa «cobrado»
    externalPaymentsMonth: await paymentsThisMonth(now), // pagos externos registrados a mano (D102), por moneda
    leadsNew: leads.filter((l) => l.status === "new").length,
    privacyPending: await count(db.select({ n }).from(schema.privacyRequest).where(eq(schema.privacyRequest.status, "pending"))),
    deniedLast7d: await count(db.select({ n }).from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "access.denied"), gte(schema.auditEvent.at, since7)))),
    pushFailedLast24h: await count(db.select({ n }).from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.status, "failed"), gte(schema.notificationOutbox.createdAt, since1)))),
    ...(await supportCounts()),
  };
}

/** Alta comercial: crea la ficha y una organización SIN habilitar (no admite altas operativas) y el contrato en borrador. */
export async function createClient(actorId: string, p: {
  kind: "gym" | "coach"; orgName: string; legalName?: string | null; responsibleName: string; responsibleEmail: string; currency: string;
  scope?: "organization" | "locations"; scopeNote?: string | null; quantityDefinition?: string | null; locations?: string[];
}) {
  await requireAdmin(actorId);
  // Obligatorios (D117): tipo, nombre visible, responsable, email y moneda. El resto se completa después.
  const missing = [
    !["gym", "coach"].includes(p.kind) && "tipo",
    (p.orgName ?? "").trim().length < 2 && "nombre visible",
    (p.responsibleName ?? "").trim().length < 2 && "responsable",
    !isEmail(p.responsibleEmail) && "email válido del responsable",
    !isCurrency(p.currency) && "moneda",
  ].filter(Boolean);
  if (missing.length) throw new AccessError("invalid", `Falta completar: ${missing.join(", ")}.`);
  const scope = p.kind === "gym" ? p.scope ?? "organization" : "organization"; // un coach no tiene sedes
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organization).values({ kind: p.kind, name: p.orgName.trim().slice(0, 120), status: "active", commercialStatus: "pending", createdBy: actorId }).returning();
    if (p.kind === "gym") {
      const locs = (p.locations ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 30);
      for (const name of locs.length ? locs : ["Sede principal"]) await tx.insert(gymLocation).values({ orgId: org.id, name: name.slice(0, 80) });
    }
    const [c] = await tx.insert(clientContract).values({
      orgId: org.id, kind: p.kind, legalName: p.legalName?.trim().slice(0, 160) || null, responsibleName: p.responsibleName.trim().slice(0, 80), responsibleEmail: normalizeEmail(p.responsibleEmail),
      currency: p.currency as Currency, scope, scopeNote: scope === "locations" ? p.scopeNote?.trim() || null : null, quantityDefinition: p.quantityDefinition?.trim() || null, createdBy: actorId,
    }).returning();
    await audit(tx, { actorUserId: actorId, orgId: org.id, action: "commercial.client_created", resourceType: "client_contract", resourceId: c.id });
    return { orgId: org.id, contractId: c.id };
  });
}

/** Regularizar un cliente previo: crea el contrato en borrador sin inferir precios ni cobrar retroactivamente. */
export async function regularize(actorId: string, orgId: string, p: { legalName?: string | null; responsibleName: string; responsibleEmail: string; currency: string }) {
  await requireAdmin(actorId);
  const [o] = await db.select().from(organization).where(eq(organization.id, orgId));
  if (!o) throw NOT_FOUND();
  const missing = [(p.responsibleName ?? "").trim().length < 2 && "responsable", !isEmail(p.responsibleEmail) && "email válido del responsable", !isCurrency(p.currency) && "moneda"].filter(Boolean);
  if (missing.length) throw new AccessError("invalid", `Falta completar: ${missing.join(", ")}.`);
  const [c] = await db.insert(clientContract).values({ orgId, kind: o.kind, legalName: p.legalName?.trim().slice(0, 160) || null, responsibleName: p.responsibleName.trim().slice(0, 80), responsibleEmail: normalizeEmail(p.responsibleEmail), currency: p.currency as Currency, createdBy: actorId })
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

/** Cuenta como enviada si el proveedor la aceptó o si ya se usó. Buzón local o rechazo no; null = registro previo a D88. */
const invitationSent = (i: { status: string; delivery: string | null }) => i.status === "accepted" || i.delivery === "submitted" || i.delivery === null;

export async function contractDetail(actorId: string, contractId: string, period?: { start: string; end: string }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  const terms = (await termsOf([c.id]));
  const authors = new Map((terms.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(terms.map((t) => t.createdBy))])) : []).map((u) => [u.id, u.name]));
  const invites = await db.select().from(invitation).where(and(eq(invitation.orgId, c.orgId), eq(invitation.kind, "org_owner"))).orderBy(desc(invitation.createdAt));
  const snaps = await db.select().from(billingSnapshot).where(eq(billingSnapshot.contractId, c.id)).orderBy(desc(billingSnapshot.periodStart));
  const corrections = await db.select().from(correctionRequest).where(eq(correctionRequest.contractId, c.id)).orderBy(desc(correctionRequest.createdAt));
  const notices = await noticesOf(c.id);
  const enabled = await enabledAccesses(c.orgId);
  const pr = period ?? currentPeriod();
  const prev = previewPeriod(terms.map(asTerm), pr);
  const latestQ = terms.filter((t) => t.kind === "quantity").at(-1);
  const [ap] = await db.select({ enabled: schema.gymAccessPolicy.enabled, mode: schema.gymAccessPolicy.mode }).from(schema.gymAccessPolicy).where(eq(schema.gymAccessPolicy.orgId, c.orgId));
  return {
    accessControl: { enabled: ap?.enabled ?? false, mode: ap?.mode ?? null },
    contract: c, org: o, enabledAccesses: enabled, overAgreed: overAgreed(prev.quantity?.value ?? null, enabled),
    quantityAgeDays: latestQ ? Math.floor((Date.now() - latestQ.createdAt.getTime()) / 86_400_000) : null,
    terms: terms.map((t) => ({ ...t, author: authors.get(t.createdBy) ?? "", display: t.kind === "unit_price" ? fmtMoney(t.value, (t.currency ?? c.currency) as Currency) : String(t.value) })),
    preview: prev.ok ? { ...prev, subtotalTxt: fmtMoney(prev.subtotal, prev.currency), period: pr } : { ...prev, period: pr },
    invitations: invites.map((i) => ({ id: i.id, email: i.email, status: i.status, delivery: i.delivery, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    snapshots: snaps.map((s) => ({ ...s, subtotalTxt: fmtMoney(s.subtotalMinor, s.currency as Currency) })), corrections, notices,
    pending: ["Qué socios/alumnos cuentan como vigentes", "Ciclo, corte y prorrateo", "Mora y suspensión", "Cobertura multisede sin duplicados"].filter((x, i) => i !== 0 || !c.quantityDefinition),
  };
}
/**
 * REPI Connect (D126): activar o desactivar el piloto de seguimiento de sala en un gimnasio. Sólo muestra u oculta el
 * módulo: no borra pedidos, rutinas, sesiones ni cuentas, y se puede volver a activar con el historial intacto.
 */
export async function setClientConnect(actorId: string, contractId: string, on: boolean) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  if (!o) throw NOT_FOUND();
  if (o.kind !== "gym") throw new AccessError("invalid", "REPI Connect es para gimnasios.");
  if (o.connectEnabled === on) return { connectEnabled: on, changed: false };
  await db.update(organization).set({ connectEnabled: on }).where(eq(organization.id, o.id));
  await audit(db, { actorUserId: actorId, orgId: o.id, action: on ? "connect.enabled" : "connect.disabled", resourceType: "organization", resourceId: o.id });
  return { connectEnabled: on, changed: true };
}
/** Control de acceso del gimnasio (D127): REPI Admin enciende el piloto; el modo lo elige el dueño. Apagar revoca ingresos vigentes. */
export async function setClientAccessControl(actorId: string, contractId: string, on: boolean) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  if (!o) throw NOT_FOUND();
  if (o.kind !== "gym") throw new AccessError("invalid", "El control de acceso es para gimnasios.");
  const { setAccessEnabled } = await import("../gym/access-control");
  return setAccessEnabled(o.id, on, actorId);
}
function currentPeriod() {
  // Mes en curso en hora argentina (DATA-9): el último día a la noche todavía es este mes.
  const [y, mo] = localDate(new Date()).split("-").map(Number); const m = mo - 1;
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
  const r = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientContract).where(eq(clientContract.id, contractId)).for("update");
    if (!c) throw NOT_FOUND();
    if (c.status !== "accepted" && c.status !== "suspended") throw new AccessError("invalid_state", "Primero registrá la aceptación del acuerdo.", 409);
    await tx.update(clientContract).set({ status: "enabled", enabledBy: actorId, enabledAt: new Date(), trialUntil: p.trialUntil ?? c.trialUntil, updatedAt: new Date() }).where(eq(clientContract.id, c.id));
    await tx.update(organization).set({ commercialStatus: "enabled", trialEndsAt: trialEnd(p.trialUntil ?? c.trialUntil) }).where(eq(organization.id, c.orgId));
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.enabled", resourceType: "client_contract", resourceId: c.id, meta: { trialUntil: p.trialUntil ?? null } });
    return { before: c, after: { ...c, status: "enabled" as const, trialUntil: p.trialUntil ?? c.trialUntil } };
  });
  // F-BL-05: la primera habilitación no es un cambio (el cliente recibe la bienvenida); rehabilitar o mover la prueba sí.
  const { before, after } = r;
  const at = Date.now();
  if (before.status === "suspended") await publishNotice(after, { kind: "enabled", title: "Tu espacio volvió a estar habilitado", body: "REPI levantó la suspensión: ya podés volver a dar altas.", dedupeKey: `enabled:${at}`, createdBy: actorId });
  if (p.trialUntil && before.enabledAt && p.trialUntil !== before.trialUntil) {
    await publishNotice(after, { kind: "trial", title: `Prueba gratuita hasta el ${dayTxt(p.trialUntil)}`,
      body: `${before.trialUntil ? `Antes terminaba el ${dayTxt(before.trialUntil)}. ` : ""}Al terminar rigen la cantidad y el precio acordados que ves en esta sección.`, dedupeKey: `trial:${p.trialUntil}:${at}`, createdBy: actorId });
  }
  return { status: "enabled" };
}
const trialEnd = (d: string | null) => (d ? new Date(`${d}T23:59:59-03:00`) : null);

/** Extender, acortar o quitar la prueba de un cliente habilitado: con motivo y aviso al cliente (F-BL-05). */
export async function setTrial(actorId: string, contractId: string, p: { trialUntil: string | null; reason: string }, now = new Date()) {
  await requireAdmin(actorId);
  if (p.trialUntil && (!isDay(p.trialUntil) || p.trialUntil < localDate(now))) throw new AccessError("invalid", "La prueba no puede terminar antes de hoy.");
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo del cambio.");
  const c = await contractFor(contractId);
  if (c.status !== "enabled") throw new AccessError("invalid_state", "La prueba se ajusta con el cliente habilitado.", 409);
  if ((p.trialUntil ?? null) === c.trialUntil) throw new AccessError("invalid", "Es la misma fecha que ya está cargada.");
  await db.update(clientContract).set({ trialUntil: p.trialUntil, updatedAt: now }).where(eq(clientContract.id, c.id));
  await db.update(organization).set({ trialEndsAt: trialEnd(p.trialUntil) }).where(eq(organization.id, c.orgId));
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "commercial.trial_changed", resourceType: "client_contract", resourceId: c.id, meta: { from: c.trialUntil, to: p.trialUntil } });
  const why = ` Motivo: ${p.reason.trim().slice(0, 200)}.`;
  await publishNotice({ ...c, trialUntil: p.trialUntil }, p.trialUntil
    ? { kind: "trial", title: `Prueba gratuita hasta el ${dayTxt(p.trialUntil)}`, dedupeKey: `trial:${p.trialUntil}:${now.getTime()}`, createdBy: actorId,
      body: `${c.trialUntil ? `Antes terminaba el ${dayTxt(c.trialUntil)}. ` : ""}Al terminar rigen la cantidad y el precio acordados que ves en esta sección.${why}` }
    : { kind: "trial", title: "Tu espacio ya no está en prueba gratuita", dedupeKey: `trial:none:${now.getTime()}`, createdBy: actorId,
      body: `Rigen desde hoy la cantidad y el precio acordados que ves en esta sección.${why}` });
  return { trialUntil: p.trialUntil };
}

/** Corregir datos cargados por error (D124): nombre, razón social, moneda, alcance y las fechas de aceptación y habilitación.
 *  No avisa al cliente ni cambia su estado; queda en la auditoría qué campos cambiaron. La moneda sólo cambia mientras no
 *  haya precios, cierres ni pagos cargados en la anterior; cantidad, precio y prueba siguen con su propio circuito. */
export async function updateClient(actorId: string, contractId: string, p: {
  orgName?: string; legalName?: string | null; currency?: string; scope?: "organization" | "locations"; scopeNote?: string | null;
  acceptedRef?: string; acceptedAt?: string; termsVersion?: string; enabledAt?: string;
}, now = new Date()) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  if (!o) throw NOT_FOUND();
  const today = localDate(now);
  const set: Partial<typeof clientContract.$inferInsert> = {};
  const changed: string[] = [];
  if (p.orgName !== undefined && p.orgName.trim() !== o.name) {
    if (p.orgName.trim().length < 2) throw new AccessError("invalid", "El nombre visible necesita al menos 2 caracteres.");
    changed.push("nombre");
  }
  if (p.legalName !== undefined && (p.legalName?.trim() || null) !== c.legalName) { set.legalName = p.legalName?.trim().slice(0, 160) || null; changed.push("razón social"); }
  if (p.currency !== undefined && p.currency !== c.currency) {
    if (!isCurrency(p.currency)) throw new AccessError("invalid", "Moneda inválida.");
    const [price] = await db.select({ id: contractTerm.id }).from(contractTerm).where(and(eq(contractTerm.contractId, c.id), eq(contractTerm.kind, "unit_price"))).limit(1);
    const [snap] = await db.select({ id: billingSnapshot.id }).from(billingSnapshot).where(eq(billingSnapshot.contractId, c.id)).limit(1);
    const [pay] = await db.select({ id: billingPayment.id }).from(billingPayment).where(eq(billingPayment.contractId, c.id)).limit(1);
    if (price || snap || pay) throw new AccessError("invalid_state", `La moneda no se puede cambiar: ya hay precios, cierres o pagos en ${c.currency}.`, 409);
    set.currency = p.currency as Currency; changed.push("moneda");
  }
  if (c.kind === "gym" && p.scope !== undefined && (p.scope !== c.scope || (p.scopeNote ?? null) !== c.scopeNote)) {
    set.scope = p.scope; set.scopeNote = p.scope === "locations" ? p.scopeNote?.trim().slice(0, 300) || null : null; changed.push("alcance");
  }
  const accepted = p.acceptedRef !== undefined || p.acceptedAt !== undefined || p.termsVersion !== undefined;
  if (accepted) {
    if (!c.acceptedAt) throw new AccessError("invalid_state", "Este cliente todavía no tiene una aceptación registrada.", 409);
    const ref = (p.acceptedRef ?? c.acceptedRef ?? "").trim(), ver = (p.termsVersion ?? c.termsVersion ?? "").trim();
    if (ref.length < 2 || !ver) throw new AccessError("invalid", "La aceptación necesita referencia y versión.");
    if (p.acceptedAt !== undefined && (!isDay(p.acceptedAt) || p.acceptedAt > today)) throw new AccessError("invalid", "La fecha de aceptación no puede ser futura.");
    const at = p.acceptedAt !== undefined ? new Date(`${p.acceptedAt}T12:00:00Z`) : c.acceptedAt;
    if (ref !== c.acceptedRef || ver !== c.termsVersion || at.getTime() !== c.acceptedAt.getTime()) {
      set.acceptedRef = ref.slice(0, 200); set.termsVersion = ver.slice(0, 40); set.acceptedAt = at; changed.push("aceptación");
    }
  }
  if (p.enabledAt !== undefined) {
    if (!c.enabledAt) throw new AccessError("invalid_state", "Este cliente todavía no fue habilitado.", 409);
    if (!isDay(p.enabledAt) || p.enabledAt > today) throw new AccessError("invalid", "La fecha de habilitación no puede ser futura.");
    const acc = set.acceptedAt ?? c.acceptedAt;
    if (acc && p.enabledAt < localDate(acc)) throw new AccessError("invalid", "La habilitación no puede ser anterior a la aceptación.");
    if (p.enabledAt !== localDate(c.enabledAt)) { set.enabledAt = new Date(`${p.enabledAt}T12:00:00Z`); changed.push("habilitación"); }
  }
  if (!changed.length) throw new AccessError("invalid", "No hay cambios para guardar.");
  await db.transaction(async (tx) => {
    if (changed.includes("nombre")) await tx.update(organization).set({ name: p.orgName!.trim().slice(0, 120) }).where(eq(organization.id, c.orgId));
    if (Object.keys(set).length) await tx.update(clientContract).set({ ...set, updatedAt: now }).where(eq(clientContract.id, c.id));
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.client_corrected", resourceType: "client_contract", resourceId: c.id, meta: { fields: changed } });
  });
  return { changed };
}

/** Eliminar un cliente cargado por error (D124). Sólo si nadie creó cuenta en ese espacio (equipo, socios, alumnos, pedidos
 *  de acceso o aceptaciones legales) y no hay pagos registrados sin anular: borra la organización y todo lo que cuelga de
 *  ella (sedes, contrato, condiciones, cierres simulados, invitaciones). Con personas adentro se suspende, no se borra.
 *  Pide escribir el nombre exacto. La auditoría conserva el nombre y quién lo eliminó. */
export async function deleteClient(actorId: string, contractId: string, confirmName: string) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  if (!o) throw NOT_FOUND();
  if ((confirmName ?? "").trim().toLowerCase() !== o.name.trim().toLowerCase()) throw new AccessError("invalid", `Escribí el nombre exacto del cliente («${o.name}») para eliminarlo.`);
  // QA 29/10 (DATA-11): los conteos van dentro de la transacción, con la organización bloqueada: un alta que entra
  // mientras se elimina no queda huérfana ni se borra en cascada.
  await db.transaction(async (tx) => {
    await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, c.orgId)).for("update");
    const count = async (t: typeof staffMembership | typeof gymMember | typeof membershipRequest | typeof legalAcceptance) =>
      (await tx.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(t.orgId, c.orgId)))[0]?.n ?? 0;
    const people = (await count(staffMembership)) + (await count(gymMember)) + (await count(membershipRequest)) + (await count(legalAcceptance))
      + ((await tx.select({ n: sql<number>`count(*)::int` }).from(coachClient).where(eq(coachClient.coachOrgId, c.orgId)))[0]?.n ?? 0);
    if (people) throw new AccessError("invalid_state", "No se puede eliminar: ya hay personas con cuenta en este espacio. Suspendelo para frenar nuevas altas.", 409);
    const [pay] = await tx.select({ id: billingPayment.id }).from(billingPayment).where(and(eq(billingPayment.contractId, c.id), eq(billingPayment.status, "recorded"))).limit(1);
    if (pay) throw new AccessError("invalid_state", "No se puede eliminar: tiene pagos registrados. Anulalos primero si fueron un error.", 409);
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.client_deleted", resourceType: "client_contract", resourceId: c.id, meta: { name: o.name, kind: o.kind, status: c.status } });
    await tx.delete(organization).where(eq(organization.id, c.orgId));
  });
  return { deleted: true };
}

/** Suspensión explícita (política del contrato): bloquea nuevas altas operativas; no marca a los socios como morosos del gym. */
export async function suspendClient(actorId: string, contractId: string, reason: string) {
  await requireAdmin(actorId);
  if ((reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo de la suspensión.");
  const c = await contractFor(contractId);
  await db.update(clientContract).set({ status: "suspended", updatedAt: new Date() }).where(eq(clientContract.id, c.id));
  await db.update(organization).set({ commercialStatus: "suspended" }).where(eq(organization.id, c.orgId));
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "commercial.suspended", resourceType: "client_contract", resourceId: c.id, meta: { reason: reason.trim().slice(0, 200) } });
  await publishNotice({ ...c, status: "suspended" }, { kind: "suspended", title: "Tu espacio está suspendido",
    body: `Motivo: ${reason.trim().slice(0, 200)}. Mientras dure no se pueden dar altas nuevas; quienes ya están siguen igual. Si creés que es un error, pedí la corrección.`, dedupeKey: `suspended:${Date.now()}`, createdBy: actorId });
  return { status: "suspended" };
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** Cambio de condiciones y cierre toman el mismo lock de fila del contrato: el cierre ve el cambio completo o el cambio ve el cierre. */
const lockContract = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string) => tx.select({ id: clientContract.id }).from(clientContract).where(eq(clientContract.id, id)).for("update");

/** Nueva versión de cantidad acordada o precio por unidad. Nunca cambia snapshots ya cerrados. */
export async function addTerm(actorId: string, contractId: string, p: { kind: "quantity" | "unit_price"; value: number; effectiveFrom: string; reason: string; evidence?: string | null }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  if (!["quantity", "unit_price"].includes(p.kind) || !Number.isSafeInteger(p.value) || p.value < 0 || (p.kind === "quantity" && p.value > 10_000_000) || p.value > 2_147_483_647) throw new AccessError("invalid", "Valor inválido.");
  if (!isDay(p.effectiveFrom)) throw new AccessError("invalid", "Fecha de efecto inválida.");
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo del cambio.");
  const t = await db.transaction(async (tx) => {
    await lockContract(tx, c.id);
    const closed = await tx.select({ s: billingSnapshot.periodEnd }).from(billingSnapshot).where(eq(billingSnapshot.contractId, c.id));
    if (closed.some((s) => s.s >= p.effectiveFrom)) throw new AccessError("closed_period", "Esa fecha cae en un período ya cerrado: registrá un ajuste explícito en lugar de reescribirlo.", 409);
    const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${contractTerm.version}), 0)::int` }).from(contractTerm).where(and(eq(contractTerm.contractId, c.id), eq(contractTerm.kind, p.kind)));
    const [t] = await tx.insert(contractTerm).values({ contractId: c.id, kind: p.kind, version: v + 1, value: p.value, currency: p.kind === "unit_price" ? c.currency : null, effectiveFrom: p.effectiveFrom,
      reason: p.reason.trim().slice(0, 300), evidence: p.evidence?.trim().slice(0, 300) || null, createdBy: actorId }).returning();
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.term_added", resourceType: "contract_term", resourceId: t.id, meta: { kind: p.kind, version: t.version } });
    const [prev] = await tx.select().from(contractTerm).where(and(eq(contractTerm.contractId, c.id), eq(contractTerm.kind, p.kind), eq(contractTerm.version, v))).limit(1);
    return { t, prev };
  });
  // F-BL-05: el cliente ve qué cambió, desde cuándo, la versión anterior y el motivo.
  const show = (x: { value: number; currency: string | null }) => (p.kind === "unit_price" ? fmtMoney(x.value, (x.currency ?? c.currency) as Currency) : `${x.value} ${unitWord(c.kind)}`);
  const what = p.kind === "quantity" ? `Cantidad acordada: ${show(t.t)}` : `Precio por ${unitWord(c.kind, false)}: ${show(t.t)}`;
  await publishNotice(c, { kind: "term", title: `${what} desde el ${dayTxt(p.effectiveFrom)}`, effectiveFrom: p.effectiveFrom, dedupeKey: `term:${t.t.id}`, createdBy: actorId,
    body: `Versión ${t.t.version}${t.prev ? ` (antes: ${show(t.prev)})` : ""}. Motivo: ${t.t.reason}.` });
  return { version: t.t.version };
}

/** Criterio de conteo (qué socios/alumnos cuentan como vigentes): cambia con motivo y avisa al cliente. */
export async function setQuantityDefinition(actorId: string, contractId: string, p: { definition: string; reason: string }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  const def = (p.definition ?? "").trim().slice(0, 300);
  if (def.length < 5) throw new AccessError("invalid", "Escribí qué cuenta como vigente.");
  if ((p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Escribí el motivo del cambio.");
  if (def === c.quantityDefinition) throw new AccessError("invalid", "Es el mismo criterio que ya está cargado.");
  await db.update(clientContract).set({ quantityDefinition: def, updatedAt: new Date() }).where(eq(clientContract.id, c.id));
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "commercial.definition_changed", resourceType: "client_contract", resourceId: c.id });
  await publishNotice({ ...c, quantityDefinition: def }, { kind: "definition", title: `Cambió qué ${unitWord(c.kind)} cuentan como vigentes`, dedupeKey: `definition:${Date.now()}`, createdBy: actorId,
    body: `Ahora: ${def}. ${c.quantityDefinition ? `Antes: ${c.quantityDefinition}.` : "Antes no estaba definido."} Motivo: ${p.reason.trim().slice(0, 200)}.` });
  return { ok: true };
}

/** Cierre simulado del período: guarda un snapshot inmutable. No es un cobro (política de corte y cobro pendientes). */
export async function closePeriodSimulated(actorId: string, contractId: string, period: { start: string; end: string }) {
  await requireAdmin(actorId);
  const c = await contractFor(contractId);
  if (!isDay(period.start) || !isDay(period.end) || period.start > period.end) throw new AccessError("invalid", "Período inválido: revisá las fechas de inicio y fin.");
  const s = await db.transaction(async (tx) => {
    await lockContract(tx, c.id);
    const terms = (await tx.select().from(contractTerm).where(eq(contractTerm.contractId, c.id)).orderBy(asc(contractTerm.version))).map(asTerm);
    const prev = previewPeriod(terms, period);
    if (!prev.ok) throw new AccessError("incomplete", `No se puede cerrar: ${prev.reason}`, 409);
    // QA 29/10 (DATA-4): importes en int4. Un total mayor (≈ ARS 21,4 M) se frena con un mensaje claro, sin migrar la base.
    if (prev.subtotal > 2_147_483_647 || prev.price.value > 2_147_483_647) throw new AccessError("too_large", "El total del período supera el máximo que REPI puede registrar hoy. Revisá cantidad y precio.", 409);
    const [row] = await tx.insert(billingSnapshot).values({
      contractId: c.id, periodStart: period.start, periodEnd: period.end, mode: "simulated_close", quantity: prev.quantity.value, quantityTermId: prev.quantity.id,
      unitPriceMinor: prev.price.value, priceTermId: prev.price.id, currency: prev.currency, subtotalMinor: prev.subtotal, lines: prev.lines,
      rules: { base: "cantidad acordada × precio unitario vigentes al inicio", prorrateo: "pendiente (D04)", note: prev.note, contractStatus: c.status, termsVersion: c.termsVersion },
      createdBy: actorId,
    }).onConflictDoNothing().returning();
    if (!row) throw new AccessError("exists", "Ese período ya tiene un cierre simulado.", 409);
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "billing.simulated_close", resourceType: "billing_snapshot", resourceId: row.id });
    return row;
  });
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
      email: c.responsibleEmail, invitedBy: actorId, tokenHash: sha256(token), contractId: c.id, expiresAt: addDays(new Date(), OWNER_INVITE_DAYS), delivery: "pending" }).returning();
    await audit(tx, { actorUserId: actorId, orgId: c.orgId, action: "commercial.owner_invited", resourceType: "invitation", resourceId: i.id });
    return i;
  });
  const [o] = await db.select().from(organization).where(eq(organization.id, c.orgId));
  // Entrega honesta (D88): un rechazo no se presenta como enviado. La invitación sigue pendiente y Admin la reenvía.
  let delivery: "submitted" | "local_only" | "failed";
  let providerStatus: number | undefined;
  try {
    delivery = await deliverMail({ to: c.responsibleEmail, subject: `Bienvenido a REPI · ${o.name}`, body: `Activá tu espacio en ${appUrl()}/activar/${token}\nEs personal: sólo funciona con ${c.responsibleEmail}. Vence en ${OWNER_INVITE_DAYS} días.` });
  } catch (e) {
    delivery = "failed";
    if (e instanceof MailError) providerStatus = e.status; else logError("commercial.invite_mail", e);
  }
  await db.update(invitation).set({ delivery }).where(eq(invitation.id, inv.id));
  await audit(db, { actorUserId: actorId, orgId: c.orgId, action: "commercial.owner_invitation_delivery", resourceType: "invitation", resourceId: inv.id,
    result: delivery === "failed" ? "error" : "ok", meta: { delivery, ...(providerStatus !== undefined ? { providerStatus } : {}) } });
  if (delivery === "failed") throw new AccessError("mail_failed", "El proveedor de correo no aceptó la bienvenida. No se envió: probá reenviarla en unos minutos.", 502);
  return { id: inv.id, expiresAt: inv.expiresAt, delivery };
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
  await requireOwner(actorId, orgId);
  const [c] = await db.select().from(clientContract).where(eq(clientContract.orgId, orgId));
  const [o] = await db.select().from(organization).where(eq(organization.id, orgId));
  const enabled = await enabledAccesses(orgId);
  if (!c) return { contract: null, commercialStatus: o.commercialStatus, enabledAccesses: enabled, terms: [], corrections: [], notices: [], unacked: 0 };
  const terms = await termsOf([c.id]);
  const corrections = await db.select().from(correctionRequest).where(eq(correctionRequest.contractId, c.id)).orderBy(desc(correctionRequest.createdAt));
  const notices = await noticesOf(c.id);
  const today = localDate(new Date());
  return {
    commercialStatus: o.commercialStatus, enabledAccesses: enabled,
    contract: { status: c.status, legalName: c.legalName, currency: c.currency, scope: c.scope, scopeNote: c.scopeNote, quantityDefinition: c.quantityDefinition, termsVersion: c.termsVersion, acceptedAt: c.acceptedAt, trialUntil: c.trialUntil },
    terms: terms.map((t) => ({ kind: t.kind, version: t.version, display: t.kind === "unit_price" ? fmtMoney(t.value, (t.currency ?? c.currency) as Currency) : String(t.value), effectiveFrom: t.effectiveFrom, current: t.effectiveFrom <= today })),
    corrections: corrections.map((x) => ({ text: x.text, status: x.status, answer: x.answer, at: x.createdAt })),
    notices: notices.map(({ delivery: _d, ...n }) => n), unacked: notices.filter((n) => !n.ackAt).length,
  };
}
export async function requestCorrection(actorId: string, orgId: string, text: string) {
  await requireOwner(actorId, orgId);
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
