// Servicios de Acceso. Toda regla se valida aquí (servidor), aunque el cliente ya la haya validado.
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  CONSENT_CATALOG, classifyAge, orgOperational, GYM_ROLE_LABEL, INVITABLE_GYM_ROLES, INVITE_TTL_DAYS, MINORS_POLICY, TERMS_VERSION,
  invitationState, isCuit, isDni, isEmail, normalizeCode, normalizeEmail, parseBirthDate, passwordOk, requiresTwoFactor,
  resolveGrants, formatCuit, type ConsentScope, type GymRole,
} from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "../auth";
import { MailError, deliverMail, sendMail } from "../mailer";
import { logError } from "../log";
import { AccessError, addDays, audit, dniHmac, dniLast3, newInviteCode, newToken, sha256, todayIso, type Tx } from "./util";

const { user, organization, gymLocation, staffMembership, coachClient, gymMember, invitation, rosterEntry,
  membershipRequest, guardianConsent, legalAcceptance, consentGrant } = schema;

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Registro ────────────────────────────────────────────────────────────────
export type SignUpInput = {
  name: string; email: string; password: string; terms: boolean;
  birth?: string; // DD/MM/AAAA (sólo flujo de invitación de alumno)
  organizationTerms?: boolean; // dueño de gym: DPA
  sendOtp?: boolean;
};

export async function signUpPerson(input: SignUpInput) {
  const name = input.name?.trim();
  if (!name || !isEmail(input.email) || !passwordOk(input.password) || !input.terms) {
    throw new AccessError("invalid", "Completá los datos y aceptá los términos.");
  }
  let birthIso: string | null = null;
  let minor = false;
  if (input.birth !== undefined) {
    birthIso = parseBirthDate(input.birth);
    const cls = classifyAge(birthIso, todayIso());
    if (cls === "invalid") throw new AccessError("invalid_birth", "Completá todos los datos (fecha como DD/MM/AAAA).");
    if (cls === "blocked") throw new AccessError("under_13", "Para menores de 13 años la cuenta la crea un adulto responsable.");
    minor = cls === "minor";
  }
  const email = normalizeEmail(input.email);
  const created = await auth.api.signUpEmail({ body: { name, email, password: input.password } });
  // Con email existente Better Auth devuelve un usuario sintético (no persistido) y avisa al titular.
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, created.user.id));
  if (!row) return { userId: null, email, minor, existing: true as const };
  const userId = row.id;
  const docs = input.organizationTerms ? (["terms", "privacy", "dpa"] as const) : (["terms", "privacy"] as const);
  await db.transaction(async (tx) => {
    if (birthIso) await tx.update(user).set({ birthDate: birthIso }).where(eq(user.id, userId));
    await tx.insert(legalAcceptance).values(docs.map((document) => ({ userId, document, version: TERMS_VERSION })));
    await audit(tx, { actorUserId: userId, action: "account.created", resourceType: "user", resourceId: userId, meta: { minor, docs: [...docs] } });
  });
  if (input.sendOtp !== false) {
    await auth.api.sendVerificationOTP({ body: { email, type: "email-verification" } });
  }
  return { userId, email, minor, existing: false as const };
}

// ── Organizaciones ──────────────────────────────────────────────────────────
// Anexo 26/10: no hay autoalta comercial ni prueba automática. Estas funciones son de uso interno (alta desde Admin,
// regularización y pruebas): ninguna ruta pública las expone. Sin prueba: trialEndsAt sólo si Admin la concede.
type OrgOpts = { commercialStatus?: "pending" | "enabled" | "legacy" };

export async function createCoachOrganization(userId: string, p: { brand?: string; specialty?: string; modality?: string; clientsRange?: string }, opts: OrgOpts = {}) {
  const u = await getVerifiedUser(userId);
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: organization.id }).from(organization)
      .innerJoin(staffMembership, eq(staffMembership.orgId, organization.id))
      .where(and(eq(staffMembership.userId, userId), eq(staffMembership.role, "coach_owner"), eq(staffMembership.status, "active")));
    if (existing.length) throw new AccessError("exists", "Ya tenés un espacio de coach.", 409);
    const [org] = await tx.insert(organization).values({
      kind: "coach", name: p.brand?.trim() || `${u.name} Coach`, specialty: p.specialty ?? null, modality: p.modality ?? null,
      clientsRange: p.clientsRange ?? null, status: "active", trialEndsAt: null, commercialStatus: opts.commercialStatus ?? "enabled", createdBy: userId,
    }).returning();
    await tx.insert(staffMembership).values({ userId, orgId: org.id, role: "coach_owner" });
    await audit(tx, { actorUserId: userId, orgId: org.id, action: "org.created", resourceType: "organization", resourceId: org.id, meta: { kind: "coach" } });
    return org;
  });
}

export async function createGymOrganization(userId: string, p: { name: string; cuit?: string; locationsRange?: string; membersRange?: string }, opts: OrgOpts = {}) {
  await getVerifiedUser(userId);
  if (!p.name?.trim()) throw new AccessError("invalid", "Escribí el nombre del gimnasio.");
  if (p.cuit && !isCuit(p.cuit)) throw new AccessError("invalid_cuit", "El CUIT no es válido. Revisá los 11 dígitos.");
  return db.transaction(async (tx) => {
    const dup = await tx.select({ id: organization.id }).from(organization)
      .where(and(eq(organization.createdBy, userId), eq(organization.kind, "gym"), eq(organization.name, p.name.trim())));
    if (dup.length) return (await tx.select().from(organization).where(eq(organization.id, dup[0].id)))[0];
    const [org] = await tx.insert(organization).values({
      kind: "gym", name: p.name.trim(), cuit: p.cuit ? formatCuit(p.cuit) : null, locationsRange: p.locationsRange ?? null,
      membersRange: p.membersRange ?? null, status: "active", trialEndsAt: null, commercialStatus: opts.commercialStatus ?? "enabled", createdBy: userId,
    }).returning();
    await tx.insert(staffMembership).values({ userId, orgId: org.id, role: "owner" });
    await tx.update(legalAcceptance).set({ orgId: org.id })
      .where(and(eq(legalAcceptance.userId, userId), eq(legalAcceptance.document, "dpa"), isNull(legalAcceptance.orgId)));
    await audit(tx, { actorUserId: userId, orgId: org.id, action: "org.created", resourceType: "organization", resourceId: org.id, meta: { kind: "gym" } });
    return org;
  });
}

async function getVerifiedUser(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  if (!u.emailVerified) throw new AccessError("unverified", "Verificá tu email para continuar.", 403);
  return u;
}

/** Anexo §8: una organización sin habilitación comercial no admite altas operativas (QR, invitaciones de alumno). */
export async function assertOperational(orgId: string, tx: Tx | typeof db = db) {
  const [o] = await tx.select({ s: organization.commercialStatus }).from(organization).where(eq(organization.id, orgId));
  if (!o || !orgOperational(o.s)) throw new AccessError("org_not_enabled", "Este espacio todavía no está habilitado comercialmente. Escribinos para completar la activación.", 409);
}

async function activeRoles(userId: string, orgId: string) {
  const rows = await db.select({ role: staffMembership.role }).from(staffMembership)
    .where(and(eq(staffMembership.userId, userId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")));
  return rows.map((r) => r.role);
}

// ── Invitaciones ────────────────────────────────────────────────────────────
export async function inviteGymStaff(actorId: string, orgId: string, p: { email: string; role: string; locationId?: string | null }) {
  const roles = await activeRoles(actorId, orgId);
  if (!roles.some((r) => r === "owner" || r === "manager")) throw new AccessError("forbidden", "No tenés permiso para invitar al equipo.", 403);
  if (!isEmail(p.email) || !INVITABLE_GYM_ROLES.includes(p.role as GymRole)) throw new AccessError("invalid", "Escribí un email válido y elegí un rol.");
  if (p.locationId) {
    const [loc] = await db.select().from(gymLocation).where(and(eq(gymLocation.id, p.locationId), eq(gymLocation.orgId, orgId)));
    if (!loc) throw new AccessError("invalid", "La sede no pertenece a este gimnasio.");
  }
  const email = normalizeEmail(p.email);
  const inv = await createInvitation({ kind: "gym_staff", orgId, locationId: p.locationId ?? null, role: p.role, email, invitedBy: actorId });
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  const delivery = await deliverInvitation(inv, actorId, {
    to: email, subject: `${org.name} te invitó a REPI`,
    body: `Te sumaron como ${GYM_ROLE_LABEL[p.role as GymRole]}. Código: ${inv.code}\nAbrí ${appUrl()}/acceso?code=${inv.code}\nVence en ${INVITE_TTL_DAYS} días.`,
  });
  return { ...inv, delivery };
}

/**
 * Entrega honesta de invitaciones de equipo y de clientes (D100, como la bienvenida comercial D88): «submitted» = el
 * proveedor la aceptó (no prueba que llegó), «local_only» = buzón DEV, «failed» = rechazo. A diferencia de la bienvenida,
 * un rechazo no anula la invitación: el código y el enlace siguen sirviendo para pasarlos a mano, y se puede reenviar.
 */
async function deliverInvitation(inv: { id: string; orgId: string }, actorId: string, mail: { to: string; subject: string; body: string }) {
  let delivery: "submitted" | "local_only" | "failed";
  let providerStatus: number | undefined;
  try { delivery = await deliverMail(mail); } catch (e) {
    delivery = "failed";
    if (e instanceof MailError) providerStatus = e.status; else logError("invitation.mail", e);
  }
  await db.update(invitation).set({ delivery }).where(eq(invitation.id, inv.id));
  await audit(db, { actorUserId: actorId, orgId: inv.orgId, action: "invitation.delivery", resourceType: "invitation", resourceId: inv.id,
    result: delivery === "failed" ? "error" : "ok", meta: { delivery, ...(providerStatus !== undefined ? { providerStatus } : {}) } });
  return delivery;
}

/**
 * Invitación individual de alumno (anexo §4): siempre con destinatario. El alumno verifica ese mismo correo y el servidor
 * valida la coincidencia al aceptar; reenviar el código a otra persona no le concede la relación.
 */
export async function inviteCoachClient(actorId: string, coachOrgId: string, p: { email?: string | null }) {
  const roles = await activeRoles(actorId, coachOrgId);
  if (!roles.includes("coach_owner")) throw new AccessError("forbidden", "No tenés permiso para invitar clientes en este espacio.", 403);
  if (!p.email || !isEmail(p.email)) throw new AccessError("invalid", "Escribí el email de tu alumno: la invitación es personal.");
  await assertOperational(coachOrgId);
  const email = normalizeEmail(p.email);
  const inv = await createInvitation({ kind: "coach_client", orgId: coachOrgId, locationId: null, role: null, email, invitedBy: actorId });
  const [org] = await db.select().from(organization).where(eq(organization.id, coachOrgId));
  const delivery = await deliverInvitation(inv, actorId, { to: email, subject: `${org.name} te invitó a REPI`, body: `Código: ${inv.code}\nAbrí ${appUrl()}/acceso?code=${inv.code}\nEs personal: sólo funciona con este email.` });
  return { ...inv, delivery };
}

/** Reenviar: invalida la invitación anterior y emite una nueva para el mismo destinatario. Otro destinatario = revocar y reemitir. */
export async function resendInvitation(actorId: string, invitationId: string) {
  const [inv] = await db.select().from(invitation).where(eq(invitation.id, invitationId));
  if (!inv || inv.kind === "org_owner") throw new AccessError("not_found", "Invitación inexistente.", 404);
  const roles = await activeRoles(actorId, inv.orgId);
  const ok = inv.kind === "coach_client" ? roles.includes("coach_owner") : roles.some((r) => r === "owner" || r === "manager");
  if (!ok) throw new AccessError("not_found", "Invitación inexistente.", 404);
  if (!inv.email) throw new AccessError("invalid", "Esta invitación no tiene destinatario: creá una nueva con el email.");
  await db.update(invitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(invitation.id, inv.id), eq(invitation.status, "pending")));
  return inv.kind === "coach_client" ? inviteCoachClient(actorId, inv.orgId, { email: inv.email }) : inviteGymStaff(actorId, inv.orgId, { email: inv.email, role: inv.role!, locationId: inv.locationId });
}

async function createInvitation(v: { kind: "coach_client" | "gym_staff"; orgId: string; locationId: string | null; role: string | null; email: string | null; invitedBy: string }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [inv] = await db.insert(invitation).values({ ...v, code: newInviteCode(), expiresAt: addDays(new Date(), INVITE_TTL_DAYS) }).returning();
      await audit(db, { actorUserId: v.invitedBy, orgId: v.orgId, action: "invitation.created", resourceType: "invitation", resourceId: inv.id, meta: { kind: v.kind, role: v.role } });
      return inv;
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // colisión de código: reintentar
    }
  }
  throw new AccessError("error", "No pudimos generar el código. Probá de nuevo.", 500);
}

export async function revokeInvitation(actorId: string, invitationId: string) {
  const [inv] = await db.select().from(invitation).where(eq(invitation.id, invitationId));
  if (!inv) throw new AccessError("not_found", "Invitación inexistente.", 404);
  const roles = await activeRoles(actorId, inv.orgId);
  if (!roles.some((r) => r === "owner" || r === "manager" || r === "coach_owner")) throw new AccessError("not_found", "Invitación inexistente.", 404);
  await db.update(invitation).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(invitation.id, inv.id), eq(invitation.status, "pending")));
  await audit(db, { actorUserId: actorId, orgId: inv.orgId, action: "invitation.revoked", resourceType: "invitation", resourceId: inv.id });
}

const INVALID_CODE = "El código no es válido, venció o ya se usó. Pedile uno nuevo a quien te invitó.";

export async function lookupInvitation(rawCode: string) {
  const code = normalizeCode(rawCode);
  const [row] = await db.select({ inv: invitation, org: organization, inviter: { name: user.name }, loc: gymLocation })
    .from(invitation).innerJoin(organization, eq(organization.id, invitation.orgId))
    .innerJoin(user, eq(user.id, invitation.invitedBy)).leftJoin(gymLocation, eq(gymLocation.id, invitation.locationId))
    .where(eq(invitation.code, code));
  if (!row || invitationState(row.inv, new Date()) !== "pending") throw new AccessError("invalid_code", INVALID_CODE, 404);
  const inviterRoles = await activeRoles(row.inv.invitedBy, row.inv.orgId);
  const inviterRole = inviterRoles.includes("owner") ? "dueño" : inviterRoles.includes("manager") ? "gerente" : null;
  return {
    code,
    kind: row.inv.kind,
    orgName: row.org.name,
    orgInitials: initials(row.org.name),
    // Alumno: especialidad y modalidad públicas del coach. Staff: rol y sede.
    detail: row.inv.kind === "coach_client"
      ? [row.org.specialty, row.org.modality].filter(Boolean).join(" · ") || "Coach independiente"
      : [GYM_ROLE_LABEL[row.inv.role as GymRole] ?? "Equipo", row.loc?.name].filter(Boolean).join(" · "),
    inviter: row.inv.kind === "gym_staff" ? `Invitado por ${row.inviter.name}${inviterRole ? `, ${inviterRole}` : ""}.` : null,
    emailBound: !!row.inv.email && row.inv.kind === "gym_staff",
  };
}

/** Anexo PWA: al abrir desde el ícono puede perderse el enlace. Con el email ya verificado se retoman las invitaciones
 *  personales vigentes de ese mismo email (nunca las de otro ni las vencidas/revocadas). No acepta nada por sí misma. */
export async function pendingInvitations(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u?.emailVerified) return [];
  const rows = await db.select({ inv: invitation, org: organization, loc: gymLocation })
    .from(invitation).innerJoin(organization, eq(organization.id, invitation.orgId)).leftJoin(gymLocation, eq(gymLocation.id, invitation.locationId))
    .where(and(eq(invitation.status, "pending"), inArray(invitation.kind, ["coach_client", "gym_staff"]), sql`lower(${invitation.email}) = ${normalizeEmail(u.email)}`));
  const now = new Date();
  return rows.filter((r) => invitationState(r.inv, now) === "pending").map((r) => ({
    code: r.inv.code, kind: r.inv.kind, orgName: r.org.name, orgInitials: initials(r.org.name),
    detail: r.inv.kind === "coach_client" ? "Te invitó como alumno/a" : [GYM_ROLE_LABEL[r.inv.role as GymRole] ?? "Equipo", r.loc?.name].filter(Boolean).join(" · "),
  }));
}

export async function minorWithoutGuardian(userId: string): Promise<boolean> {
  const [u] = await db.select({ birthDate: user.birthDate }).from(user).where(eq(user.id, userId));
  if (!u?.birthDate || classifyAge(u.birthDate, todayIso()) !== "minor") return false;
  const ok = await db.select({ id: guardianConsent.id }).from(guardianConsent)
    .where(and(eq(guardianConsent.minorUserId, userId), eq(guardianConsent.status, "approved")));
  return ok.length === 0;
}

export async function acceptInvitation(userId: string, rawCode: string, requested: string[] = []) {
  const u = await getVerifiedUser(userId);
  const code = normalizeCode(rawCode);
  const restricted = await minorWithoutGuardian(userId);
  const [pre] = await db.select().from(invitation).where(eq(invitation.code, code));
  if (pre?.kind === "org_owner") throw new AccessError("invalid_code", INVALID_CODE, 404);
  // Anexo §4: invitaciones de alumno sin destinatario (previas) ya no se pueden canjear.
  if (pre?.kind === "coach_client" && !pre.email) {
    await audit(db, { actorUserId: userId, orgId: pre.orgId, action: "invitation.accept", resourceType: "invitation", resourceId: pre.id, result: "denied", meta: { reason: "no_recipient" } });
    throw new AccessError("no_recipient", "Esta invitación no tiene destinatario. Pedile a tu entrenador que te invite con tu email.", 403);
  }
  if (pre?.kind === "coach_client" && invitationState(pre, new Date()) === "pending") await assertOperational(pre.orgId);
  if (pre?.email && normalizeEmail(pre.email) !== normalizeEmail(u.email)) {
    await audit(db, { actorUserId: userId, orgId: pre.orgId, action: "invitation.accept", resourceType: "invitation", resourceId: pre.id, result: "denied", meta: { reason: "email_mismatch" } });
    throw new AccessError("email_mismatch", "Esta invitación es para otro email. Ingresá con la cuenta a la que llegó la invitación.", 403);
  }
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitation).where(eq(invitation.code, code)).for("update");
    if (!inv || invitationState(inv, new Date()) !== "pending") throw new AccessError("invalid_code", INVALID_CODE, 404);
    let relationId: string;
    let grants: string[] = [];
    if (inv.kind === "coach_client") {
      const own = await tx.select().from(staffMembership).where(and(eq(staffMembership.userId, userId), eq(staffMembership.orgId, inv.orgId)));
      if (own.length) throw new AccessError("self_invite", "No podés aceptar una invitación de tu propio espacio.", 409);
      const [rel] = await tx.insert(coachClient).values({ coachOrgId: inv.orgId, userId, status: "active", invitationId: inv.id })
        .onConflictDoUpdate({ target: [coachClient.coachOrgId, coachClient.userId], set: { status: "active", invitationId: inv.id } })
        .returning();
      relationId = rel.id;
      grants = await writeGrants(tx, userId, "coach_client", rel.id, inv.orgId, requested, restricted);
    } else {
      const [m] = await tx.insert(staffMembership).values({ userId, orgId: inv.orgId, locationId: inv.locationId, role: inv.role as GymRole })
        .onConflictDoNothing().returning();
      relationId = m?.id ?? "existing";
    }
    await tx.update(invitation).set({ status: "accepted", acceptedBy: userId, acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
    await audit(tx, { actorUserId: userId, orgId: inv.orgId, action: "invitation.accepted", resourceType: "invitation", resourceId: inv.id, meta: { kind: inv.kind, grants } });
    return { kind: inv.kind, orgId: inv.orgId, relationId, grants };
  });
}

async function writeGrants(tx: Tx, userId: string, scope: ConsentScope, relationId: string, granteeOrgId: string, requested: string[], minorWithoutGuardian: boolean) {
  const items = resolveGrants(scope, requested, { minorWithoutGuardian });
  const current = await tx.select().from(consentGrant).where(and(eq(consentGrant.relationId, relationId), eq(consentGrant.status, "active")));
  const have = new Set(current.map((g) => g.item));
  const toRevoke = current.filter((g) => !items.includes(g.item));
  if (toRevoke.length) {
    await tx.update(consentGrant).set({ status: "revoked", revokedAt: new Date() }).where(inArray(consentGrant.id, toRevoke.map((g) => g.id)));
  }
  const toAdd = items.filter((i) => !have.has(i));
  if (toAdd.length) {
    await tx.insert(consentGrant).values(toAdd.map((item) => ({ userId, scope, relationId, granteeOrgId, item, termsVersion: TERMS_VERSION })));
  }
  // Historial visible para la persona (lo fijo del servicio no se registra: no es una elección).
  const optional = new Set(CONSENT_CATALOG[scope].filter((c) => !c.locked).map((c) => c.key));
  const changes = [...toAdd.filter((i) => optional.has(i)).map((item) => ({ item, action: "granted" as const })), ...toRevoke.map((g) => ({ item: g.item, action: "revoked" as const }))];
  if (changes.length) await tx.insert(schema.dataAccessLog).values(changes.map((c) => ({ subjectUserId: userId, actorUserId: userId, orgId: granteeOrgId, item: c.item, action: c.action })));
  await audit(tx, { actorUserId: userId, orgId: granteeOrgId, action: "consent.set", resourceType: "relation", resourceId: relationId, meta: { scope, items } });
  return items;
}

// ── Menores ─────────────────────────────────────────────────────────────────
const RELATIONS = { Madre: "mother", Padre: "father", "Tutor/a legal": "legal_guardian" } as const;

export async function requestGuardianConsent(userId: string, p: { name: string; email: string; relation: string }) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u?.birthDate || classifyAge(u.birthDate, todayIso()) !== "minor") throw new AccessError("not_minor", "Esta cuenta no requiere autorización.");
  const relation = RELATIONS[p.relation as keyof typeof RELATIONS];
  // D24: sólo email; WhatsApp requiere un proveedor que no existe.
  if (!p.name?.trim() || !isEmail(p.email) || !relation) throw new AccessError("invalid", "Completá los datos del adulto (por ahora, sólo email).");
  if (normalizeEmail(p.email) === u.email) throw new AccessError("invalid", "El email del adulto tiene que ser distinto al tuyo.");
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.update(guardianConsent).set({ status: "expired" }).where(and(eq(guardianConsent.minorUserId, userId), eq(guardianConsent.status, "pending")));
    const [g] = await tx.insert(guardianConsent).values({
      minorUserId: userId, guardianName: p.name.trim(), guardianEmail: normalizeEmail(p.email), relation,
      tokenHash: sha256(token), policyVersion: MINORS_POLICY.version, expiresAt: addDays(new Date(), 7),
    }).returning();
    await audit(tx, { actorUserId: userId, action: "guardian.requested", resourceType: "guardian_consent", resourceId: g.id });
  });
  await sendMail({
    to: normalizeEmail(p.email), subject: `${u.name.split(" ")[0]} te pide autorización para usar REPI`,
    body: `Revisá y decidí en ${appUrl()}/tutor/${token}\nVence en 7 días.`,
  });
  return { guardianName: p.name.trim() };
}

export async function guardianStatus(userId: string) {
  const rows = await db.select().from(guardianConsent).where(eq(guardianConsent.minorUserId, userId));
  if (rows.some((r) => r.status === "approved")) return "approved" as const;
  const pending = rows.find((r) => r.status === "pending" && r.expiresAt > new Date());
  return pending ? ("pending" as const) : ("none" as const);
}

export async function getGuardianRequest(token: string) {
  const [g] = await db.select({ g: guardianConsent, minorName: user.name }).from(guardianConsent)
    .innerJoin(user, eq(user.id, guardianConsent.minorUserId)).where(eq(guardianConsent.tokenHash, sha256(token)));
  if (!g || g.g.status !== "pending" || g.g.expiresAt <= new Date()) throw new AccessError("invalid_token", "El enlace no es válido o venció.", 404);
  return { minorFirstName: g.minorName.split(" ")[0], guardianName: g.g.guardianName, restricted: true };
}

export async function decideGuardian(token: string, approve: boolean) {
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(guardianConsent).where(eq(guardianConsent.tokenHash, sha256(token))).for("update");
    if (!g || g.status !== "pending" || g.expiresAt <= new Date()) throw new AccessError("invalid_token", "El enlace no es válido o venció.", 404);
    await tx.update(guardianConsent).set({ status: approve ? "approved" : "rejected", decidedAt: new Date() }).where(eq(guardianConsent.id, g.id));
    await audit(tx, { action: approve ? "guardian.approved" : "guardian.rejected", resourceType: "guardian_consent", resourceId: g.id, meta: { policy: g.policyVersion } });
    return { status: approve ? "approved" : "rejected" };
  });
}

// ── Socios de gym ───────────────────────────────────────────────────────────
export async function searchJoinableLocations(q: string) {
  const term = `%${q.trim().replace(/[%_]/g, "")}%`;
  const rows = await db.select({ id: gymLocation.id, name: gymLocation.name, address: gymLocation.address, orgName: organization.name })
    .from(gymLocation).innerJoin(organization, eq(organization.id, gymLocation.orgId))
    .where(and(eq(gymLocation.publicJoin, true), eq(organization.kind, "gym"),
      q.trim() ? or(ilike(organization.name, term), ilike(gymLocation.name, term), ilike(gymLocation.address, term)) : sql`true`))
    .orderBy(organization.name, gymLocation.name).limit(20);
  return rows.map((r) => ({ ...r, orgInitials: initials(r.orgName) }));
}

/** Anexo 26/10: el alta de socio por DNI/padrón queda retirada (el padrón no es requisito ni atajo de autoaprobación). */
export async function memberSignUp(_p: { locationId: string; dni: string; email: string; password: string; terms: boolean }): Promise<never> {
  throw new AccessError("moved", "El alta de socios ahora es con el QR de recepción de tu sede: escanealo y pedí tu acceso.", 410);
}

/** Estado del alta de socio para el usuario actual: qué paso le toca. */
export async function memberOnboardingState(userId: string) {
  const [m] = await db.select({ m: gymMember, org: organization, loc: gymLocation }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "pending_consent")));
  if (m) return { step: "consentGym" as const, orgId: m.org.id, orgName: m.org.name, locationName: m.loc.name };
  const [r] = await db.select().from(membershipRequest).where(and(eq(membershipRequest.userId, userId), eq(membershipRequest.status, "pending")));
  if (r) return { step: "memberPending" as const };
  return { step: null };
}

export async function completeGymConsent(userId: string, orgId: string, requested: string[]) {
  await getVerifiedUser(userId);
  const restricted = await minorWithoutGuardian(userId);
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.orgId, orgId))).for("update");
    if (!m || m.status === "ended") throw new AccessError("not_found", "No encontramos tu membresía.", 404);
    if (m.status !== "pending_consent") throw new AccessError("invalid_state", "Tu acceso no está pendiente de consentimiento. Consultá con recepción.", 409);
    const [org] = await tx.select().from(organization).where(eq(organization.id, orgId)).for("share");
    if (!org || org.status === "paused" || org.status === "closed" || org.commercialStatus === "suspended" || org.commercialStatus === "pending") {
      throw new AccessError("org_unavailable", "El gimnasio no tiene el acceso habilitado en este momento.", 403);
    }
    await tx.update(gymMember).set({ status: "active" }).where(eq(gymMember.id, m.id));
    const grants = await writeGrants(tx, userId, "gym_member", m.id, orgId, requested, restricted);
    return { grants };
  });
}

// ── Espacios ────────────────────────────────────────────────────────────────
export type Workspace = { key: string; ini: string; title: string; detail: string; href: string; needs2fa: boolean };

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) return [];
  const out: Workspace[] = [];
  const staff = await db.select({ m: staffMembership, org: organization, loc: gymLocation }).from(staffMembership)
    .innerJoin(organization, eq(organization.id, staffMembership.orgId)).leftJoin(gymLocation, eq(gymLocation.id, staffMembership.locationId))
    .where(and(eq(staffMembership.userId, userId), eq(staffMembership.status, "active")));
  for (const s of staff) {
    if (s.m.role === "coach_owner") {
      out.push({ key: `coach:${s.org.id}`, ini: initials(s.org.name), title: s.org.name, detail: "Coach independiente", href: `/coach/${s.org.id}`, needs2fa: false });
    } else {
      const role = s.m.role as GymRole;
      out.push({
        key: `gym:${s.org.id}:${s.m.id}`, ini: initials(s.org.name), title: [s.org.name, s.loc?.name].filter(Boolean).join(" · "),
        detail: GYM_ROLE_LABEL[role], href: `/gym/${s.org.id}`, needs2fa: requiresTwoFactor({ gymRoles: [role] }) && !u.twoFactorEnabled,
      });
    }
  }
  const rel = await db.select({ id: coachClient.id }).from(coachClient).where(and(eq(coachClient.userId, userId), eq(coachClient.status, "active")));
  const mem = await db.select({ id: gymMember.id }).from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active")));
  if (rel.length || mem.length) out.push({ key: "personal", ini: initials(u.name), title: "Mi entrenamiento", detail: "App personal", href: "/app", needs2fa: false });
  if (u.platformRole === "admin") out.push({ key: "admin", ini: "RA", title: "REPI Admin", detail: "Administración de la plataforma", href: "/admin", needs2fa: !u.twoFactorEnabled });
  return out;
}

export function initials(name: string) {
  return name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "R";
}

export const consentCatalog = CONSENT_CATALOG;
