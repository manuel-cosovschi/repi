// Acceso del socio por QR de sede (anexo 26/10 §5–8). El QR es un identificador público, no una credencial:
// sólo permite SOLICITAR. Decide una persona: entrenador de piso con turno efectivo en esa sede, o recepción/gerencia/dueño.
// La bandeja persistida es la fuente de verdad; el push es un aviso.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  JOIN_ESCALATE_MIN, JOIN_REQUEST_TTL_HOURS, PUSH_JOIN, REJECT_REASONS, TERMS_VERSION, VALIDATION_METHODS, gymCan, isValidationMethod, orgOperational, shortCodeOf,
  type RejectReason,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { NOT_FOUND, gymContext, inScope, need, scopedLocations } from "../gym/services";
import { enqueue } from "../push/services";

const { user, organization, gymLocation, staffMembership, gymMember, gymMemberLocation, membershipRequest, locationJoinLink, shiftLog, legalAcceptance } = schema;

const slug = () => randomBytes(9).toString("base64url"); // 72 bits, no adivinable

// ── QR por sede ─────────────────────────────────────────────────────────────
export async function joinLinks(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!ctx.roles.some((r) => r === "owner" || r === "manager")) throw new AccessError("forbidden", "Sólo dueño o gerencia generan el QR de alta.", 403);
  const locs = await scopedLocations(ctx, null);
  const links = await db.select().from(locationJoinLink).where(and(eq(locationJoinLink.orgId, orgId), inArray(locationJoinLink.locationId, locs.map((l) => l.id)))).orderBy(desc(locationJoinLink.createdAt));
  return locs.map((l) => ({ location: { id: l.id, name: l.name }, active: links.find((x) => x.locationId === l.id && x.active) ?? null, history: links.filter((x) => x.locationId === l.id && !x.active).slice(0, 5).map((x) => ({ createdAt: x.createdAt, revokedAt: x.revokedAt })) }));
}

/** Genera o regenera el QR de una sede: el anterior queda revocado (no crea nuevas solicitudes). */
export async function regenerateJoinLink(actorId: string, orgId: string, locationId: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!ctx.roles.some((r) => r === "owner" || r === "manager")) throw new AccessError("forbidden", "Sólo dueño o gerencia generan el QR de alta.", 403);
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  return db.transaction(async (tx) => {
    const [loc] = await tx.select().from(gymLocation).where(and(eq(gymLocation.id, locationId), eq(gymLocation.orgId, orgId)));
    if (!loc) throw NOT_FOUND();
    await tx.update(locationJoinLink).set({ active: false, revokedAt: new Date(), revokedBy: actorId }).where(and(eq(locationJoinLink.locationId, locationId), eq(locationJoinLink.active, true)));
    const [l] = await tx.insert(locationJoinLink).values({ orgId, locationId, slug: slug(), createdBy: actorId }).returning();
    await audit(tx, { actorUserId: actorId, orgId, action: "join_link.regenerated", resourceType: "location_join_link", resourceId: l.id });
    return { slug: l.slug };
  });
}
export async function revokeJoinLink(actorId: string, orgId: string, locationId: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!ctx.roles.some((r) => r === "owner" || r === "manager") || !inScope(ctx, locationId)) throw NOT_FOUND();
  await db.update(locationJoinLink).set({ active: false, revokedAt: new Date(), revokedBy: actorId }).where(and(eq(locationJoinLink.orgId, orgId), eq(locationJoinLink.locationId, locationId), eq(locationJoinLink.active, true)));
  await audit(db, { actorUserId: actorId, orgId, action: "join_link.revoked", resourceType: "gym_location", resourceId: locationId });
  return { ok: true };
}

async function linkBySlug(s: string, tx: Tx | typeof db = db) {
  const [r] = await tx.select({ l: locationJoinLink, org: organization, loc: gymLocation }).from(locationJoinLink)
    .innerJoin(organization, eq(organization.id, locationJoinLink.orgId)).innerJoin(gymLocation, eq(gymLocation.id, locationJoinLink.locationId))
    .where(eq(locationJoinLink.slug, s.slice(0, 40)));
  return r ?? null;
}
/** Información pública del QR: sólo gym y sede. Un QR revocado no sirve para solicitar. */
export async function publicJoinInfo(s: string) {
  const r = await linkBySlug(s);
  if (!r || !r.l.active) throw new AccessError("invalid_link", "Este QR ya no está vigente. Pedí el QR actual en recepción.", 404);
  return { orgName: r.org.name, locationName: r.loc.name, operational: orgOperational(r.org.commercialStatus) };
}

// ── Solicitud del socio ─────────────────────────────────────────────────────
const expireOld = (tx: Tx | typeof db = db) =>
  tx.update(membershipRequest).set({ status: "expired" }).where(and(eq(membershipRequest.status, "pending"), lt(membershipRequest.expiresAt, new Date())));

function view(r: typeof membershipRequest.$inferSelect, orgName: string, locationName: string) {
  return {
    id: r.id, code: shortCodeOf(r.id), kind: r.kind, status: r.status, orgName, locationName, createdAt: r.createdAt, expiresAt: r.expiresAt,
    reason: r.status === "rejected" ? REJECT_REASONS[(r.publicReason as RejectReason) ?? "other"] ?? REJECT_REASONS.other : null,
    message: r.status === "pending" ? "Estamos validando tu acceso. El equipo de sala o recepción puede ayudarte."
      : r.status === "approved" ? "¡Listo! Tu acceso fue aprobado." : r.status === "expired" ? "La solicitud venció sin respuesta. Podés volver a pedirla." : null,
  };
}

/**
 * Solicitar acceso desde el QR. Requiere correo verificado. No crea membresía: crea (o devuelve) una solicitud pendiente.
 * Ya habilitado en esa sede → al espacio. Misma org sin esa sede → ampliación. Suspendido o dado de baja → reactivación (revisión humana).
 */
export async function requestAccess(userId: string, s: string, p: { name?: string; terms: boolean }) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  if (!u.emailVerified) throw new AccessError("unverified", "Verificá tu email antes de pedir el acceso.", 403);
  const name = (p.name ?? "").trim();
  if (!u.name?.trim() && name.length < 2) throw new AccessError("invalid", "Escribí tu nombre y apellido.");
  const r = await linkBySlug(s);
  if (!r || !r.l.active) throw new AccessError("invalid_link", "Este QR ya no está vigente. Pedí el QR actual en recepción.", 404);
  if (!orgOperational(r.org.commercialStatus)) throw new AccessError("org_not_enabled", "Este gimnasio todavía no habilitó el acceso a REPI.", 409);
  const staffHere = await db.select({ id: staffMembership.id }).from(staffMembership).where(and(eq(staffMembership.userId, userId), eq(staffMembership.orgId, r.org.id), eq(staffMembership.status, "active")));
  void staffHere; // ser staff no impide ser socio, pero nunca da acceso de socio sin solicitud
  // Límite de frecuencia por persona (no por IP: una red compartida no bloquea a todo el gimnasio).
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(membershipRequest).where(and(eq(membershipRequest.userId, userId), gte(membershipRequest.createdAt, new Date(Date.now() - 86_400_000))));
  return db.transaction(async (tx) => {
    await expireOld(tx);
    if (!u.name?.trim() && name) await tx.update(user).set({ name: name.slice(0, 80) }).where(eq(user.id, userId));
    const [m] = await tx.select().from(gymMember).where(and(eq(gymMember.orgId, r.org.id), eq(gymMember.userId, userId))).for("update");
    let kind: "initial" | "expansion" | "reactivation" = "initial";
    if (m) {
      if (m.status === "suspended" || m.status === "ended") kind = "reactivation";
      else {
        const extra = await tx.select().from(gymMemberLocation).where(and(eq(gymMemberLocation.gymMemberId, m.id), eq(gymMemberLocation.locationId, r.loc.id), isNull(gymMemberLocation.revokedAt)));
        if (m.locationId === r.loc.id || extra.length) return { state: "already" as const, href: "/app" };
        kind = "expansion";
      }
    }
    const [pending] = await tx.select().from(membershipRequest).where(and(eq(membershipRequest.orgId, r.org.id), eq(membershipRequest.userId, userId), eq(membershipRequest.locationId, r.loc.id), eq(membershipRequest.status, "pending")));
    if (pending) return { state: "pending" as const, request: view(pending, r.org.name, r.loc.name) };
    if (n >= 5) throw new AccessError("rate_limited", "Hiciste varias solicitudes hoy. Acercate a recepción.", 429);
    if (!p.terms) throw new AccessError("invalid", "Aceptá los términos para continuar.");
    const docs = await tx.select({ d: legalAcceptance.document }).from(legalAcceptance).where(eq(legalAcceptance.userId, userId));
    for (const d of ["terms", "privacy"] as const) if (!docs.some((x) => x.d === d)) await tx.insert(legalAcceptance).values({ userId, document: d, version: TERMS_VERSION });
    const [req] = await tx.insert(membershipRequest).values({
      orgId: r.org.id, locationId: r.loc.id, userId, source: "qr", kind, joinLinkId: r.l.id, expiresAt: new Date(Date.now() + JOIN_REQUEST_TTL_HOURS * 3_600_000),
    }).returning();
    await audit(tx, { actorUserId: userId, orgId: r.org.id, action: "join.requested", resourceType: "membership_request", resourceId: req.id, meta: { kind, source: "qr" } });
    return { state: "created" as const, request: view(req, r.org.name, r.loc.name), orgId: r.org.id, locationId: r.loc.id };
  }).then(async (out) => {
    // Después de persistir: avisar al piso en turno (push). La bandeja de recepción ya la muestra.
    if (out.state === "created") await notifyFloor(out.orgId, out.locationId, out.request.id).catch(() => {});
    return out.state === "created" ? { state: out.state, request: out.request } : out;
  });
}

export async function myJoinRequests(userId: string) {
  await expireOld();
  const rows = await db.select({ r: membershipRequest, org: organization.name, loc: gymLocation.name }).from(membershipRequest)
    .innerJoin(organization, eq(organization.id, membershipRequest.orgId)).innerJoin(gymLocation, eq(gymLocation.id, membershipRequest.locationId))
    .where(eq(membershipRequest.userId, userId)).orderBy(desc(membershipRequest.createdAt)).limit(10);
  return rows.map((x) => view(x.r, x.org, x.loc));
}
export async function cancelRequest(userId: string, id: string) {
  const r = await db.update(membershipRequest).set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(membershipRequest.id, id), eq(membershipRequest.userId, userId), eq(membershipRequest.status, "pending"))).returning();
  if (!r.length) throw new AccessError("not_pending", "Esta solicitud ya no está pendiente.", 409);
  return { ok: true };
}

// ── Destinatarios de piso: turno efectivo (shift_log abierto) en esa sede ──
export async function floorOnShift(orgId: string, locationId: string) {
  const rows = await db.select({ u: shiftLog.userId, role: staffMembership.role, loc: staffMembership.locationId }).from(shiftLog)
    .innerJoin(staffMembership, and(eq(staffMembership.userId, shiftLog.userId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")))
    .where(and(eq(shiftLog.locationId, locationId), isNull(shiftLog.endedAt)));
  const byUser = new Map<string, string[]>();
  for (const r of rows) if (!r.loc || r.loc === locationId) byUser.set(r.u, [...(byUser.get(r.u) ?? []), r.role]);
  return [...byUser.entries()].filter(([, roles]) => gymCan(roles, "members.validate")).map(([u]) => u);
}
async function backupApprovers(orgId: string, locationId: string) {
  const rows = await db.select({ u: staffMembership.userId, loc: staffMembership.locationId }).from(staffMembership)
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"), inArray(staffMembership.role, ["owner", "manager", "reception"])));
  return [...new Set(rows.filter((r) => !r.loc || r.loc === locationId).map((r) => r.u))];
}
async function notifyFloor(orgId: string, locationId: string, requestId: string) {
  const to = await floorOnShift(orgId, locationId);
  await enqueue(to, { kind: "join_request", dedupe: `join:${requestId}`, ...PUSH_JOIN, url: `/gym/${orgId}?s=joins&sel=${requestId}` });
}
/** Escalamiento propuesto: a los 5 minutos, una vez, a responsables de la sede. Idempotente. */
export async function escalatePending(now = new Date()) {
  await expireOld();
  const rows = await db.select().from(membershipRequest).where(and(eq(membershipRequest.status, "pending"), isNull(membershipRequest.escalatedAt), lt(membershipRequest.createdAt, new Date(now.getTime() - JOIN_ESCALATE_MIN * 60_000))));
  for (const r of rows) {
    const claimed = await db.update(membershipRequest).set({ escalatedAt: now }).where(and(eq(membershipRequest.id, r.id), isNull(membershipRequest.escalatedAt))).returning();
    if (!claimed.length) continue;
    await enqueue(await backupApprovers(r.orgId, r.locationId), { kind: "join_escalation", dedupe: `esc:${r.id}`, title: PUSH_JOIN.title, body: "Hay una solicitud de acceso esperando en tu sede", url: `/gym/${r.orgId}?s=joins&sel=${r.id}` });
  }
  return { escalated: rows.length };
}

// ── Bandeja compartida y decisión ───────────────────────────────────────────
type Authority = { as: "floor" | "reception" | "manager" | "owner"; shiftId: string | null };
/** Autoridad para resolver en esa sede, verificada en el momento (dentro de la transacción al decidir). */
async function authorityAt(actorId: string, orgId: string, locationId: string, tx: Tx | typeof db = db): Promise<Authority | null> {
  const rows = await tx.select({ role: staffMembership.role, loc: staffMembership.locationId }).from(staffMembership)
    .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")));
  const here = rows.filter((r) => !r.loc || r.loc === locationId).map((r) => r.role);
  if (here.includes("owner")) return { as: "owner", shiftId: null };
  if (here.includes("manager")) return { as: "manager", shiftId: null };
  if (here.includes("reception")) return { as: "reception", shiftId: null };
  if (gymCan(here, "members.validate")) {
    const [s] = await tx.select().from(shiftLog).where(and(eq(shiftLog.userId, actorId), eq(shiftLog.locationId, locationId), isNull(shiftLog.endedAt)));
    if (s) return { as: "floor", shiftId: s.id };
  }
  return null;
}

export async function joinInbox(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!gymCan(ctx.roles, "members.approve") && !gymCan(ctx.roles, "members.validate")) throw new AccessError("forbidden", "Tu rol no valida accesos.", 403);
  await expireOld();
  const locs = await scopedLocations(ctx, null);
  const can: { id: string; name: string; as: Authority["as"] }[] = [];
  for (const l of locs) { const a = await authorityAt(actorId, orgId, l.id); if (a) can.push({ id: l.id, name: l.name, as: a.as }); }
  const ids = can.map((c) => c.id);
  const rows = ids.length ? await db.select({ r: membershipRequest, name: user.name, email: user.email }).from(membershipRequest).innerJoin(user, eq(user.id, membershipRequest.userId))
    .where(and(eq(membershipRequest.orgId, orgId), inArray(membershipRequest.locationId, ids), or(eq(membershipRequest.status, "pending"), gte(membershipRequest.decidedAt, new Date(Date.now() - 7 * 86_400_000)))))
    .orderBy(asc(membershipRequest.createdAt)).limit(200) : [];
  const deciders = new Map((rows.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(rows.map((x) => x.r.decidedBy).filter(Boolean) as string[])].concat(["-"]))) : []).map((x) => [x.id, x.name]));
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  const onShift = !ctx.roles.some((r) => r === "owner" || r === "manager" || r === "reception");
  return {
    canActAt: can, floorWithoutShift: onShift && !can.length,
    methods: VALIDATION_METHODS, reasons: REJECT_REASONS,
    requests: rows.map(({ r, name, email }) => ({
      id: r.id, code: shortCodeOf(r.id), name, email, location: locName.get(r.locationId) ?? "", locationId: r.locationId, kind: r.kind, source: r.source, status: r.status,
      createdAt: r.createdAt, expiresAt: r.expiresAt, decidedBy: r.decidedBy ? deciders.get(r.decidedBy) ?? null : null, decidedAt: r.decidedAt, decidedAs: r.decidedAs, method: r.validationMethod,
      self: r.userId === actorId,
    })),
  };
}

/**
 * Decisión única y transaccional. Aprueba: crea o reactiva el vínculo (o habilita la sede) sin duplicar. Rechaza: motivo apto para el socio.
 * La primera decisión válida queda; las demás reciben "ya resuelta" con quién y cuándo.
 */
export async function decideJoin(actorId: string, orgId: string, requestId: string, p: { approve: boolean; method?: string; reason?: string; note?: string }) {
  if (p.approve && !isValidationMethod(p.method)) throw new AccessError("invalid", "Confirmá cómo identificaste a la persona y su pertenencia al gimnasio.");
  if (!p.approve && !(p.reason && p.reason in REJECT_REASONS)) throw new AccessError("invalid", "Elegí el motivo del rechazo.");
  const res = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(membershipRequest).where(and(eq(membershipRequest.id, requestId), eq(membershipRequest.orgId, orgId))).for("update");
    if (!r) throw NOT_FOUND();
    const auth = await authorityAt(actorId, orgId, r.locationId, tx);
    if (!auth) throw new AccessError("no_authority", "No podés resolver solicitudes de esta sede ahora (sin turno activo o sin permiso).", 403);
    if (r.status !== "pending") {
      const [who] = r.decidedBy ? await tx.select({ name: user.name }).from(user).where(eq(user.id, r.decidedBy)) : [];
      throw new AccessError("already_decided", r.status === "approved" || r.status === "rejected" ? `Ya la resolvió ${who?.name ?? "otra persona"}.` : "Esta solicitud ya no está pendiente.", 409, { status: r.status, by: who?.name ?? null, at: r.decidedAt });
    }
    if (r.expiresAt && r.expiresAt < new Date()) {
      await tx.update(membershipRequest).set({ status: "expired" }).where(eq(membershipRequest.id, r.id));
      throw new AccessError("expired", "La solicitud venció. La persona puede volver a pedirla.", 409);
    }
    if (r.userId === actorId) throw new AccessError("self", "No podés aprobar tu propia solicitud.", 403);
    const now = new Date();
    const base = { decidedBy: actorId, decidedAt: now, decidedAs: auth.as, decidedShiftId: auth.shiftId, reason: p.note?.trim().slice(0, 300) || null };
    if (!p.approve) {
      await tx.update(membershipRequest).set({ ...base, status: "rejected", publicReason: p.reason }).where(eq(membershipRequest.id, r.id));
      await audit(tx, { actorUserId: actorId, orgId, action: "join.rejected", resourceType: "membership_request", resourceId: r.id, meta: { as: auth.as } });
      return { status: "rejected" as const, userId: r.userId };
    }
    const [m] = await tx.select().from(gymMember).where(and(eq(gymMember.orgId, orgId), eq(gymMember.userId, r.userId))).for("update");
    if (!m) {
      await tx.insert(gymMember).values({ orgId, locationId: r.locationId, userId: r.userId, status: "pending_consent" });
    } else if (r.kind === "reactivation" || m.status === "suspended" || m.status === "ended") {
      await tx.update(gymMember).set({ status: "pending_consent" }).where(eq(gymMember.id, m.id)); // vuelve a confirmar consentimientos
    } else if (m.locationId !== r.locationId) {
      await tx.insert(gymMemberLocation).values({ gymMemberId: m.id, locationId: r.locationId, grantedBy: actorId, requestId: r.id })
        .onConflictDoUpdate({ target: [gymMemberLocation.gymMemberId, gymMemberLocation.locationId], set: { revokedAt: null, grantedBy: actorId, requestId: r.id, grantedAt: now } });
    }
    await tx.update(membershipRequest).set({ ...base, status: "approved", validationMethod: p.method }).where(eq(membershipRequest.id, r.id));
    await audit(tx, { actorUserId: actorId, orgId, action: "join.approved", resourceType: "membership_request", resourceId: r.id, meta: { as: auth.as, method: p.method, kind: r.kind } });
    return { status: "approved" as const, userId: r.userId };
  });
  await enqueue([res.userId], { kind: "join_resolved", dedupe: `res:${requestId}`, title: "REPI", body: "Tu solicitud de acceso tiene novedades", url: "/acceso?step=workspace" }).catch(() => {});
  return res;
}

// ── Gestión de accesos habilitados (anexo §8) ───────────────────────────────
export async function listAccesses(actorId: string, orgId: string, q = "") {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "members.approve");
  const ids = (await scopedLocations(ctx, null)).map((l) => l.id);
  const rows = await db.select({ m: gymMember, name: user.name, email: user.email, loc: gymLocation.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.orgId, orgId), inArray(gymMember.locationId, ids), ne(gymMember.status, "pending_consent"), q ? or(ilike(user.name, `%${q.slice(0, 60)}%`), ilike(user.email, `%${q.slice(0, 60)}%`)) : undefined))
    .orderBy(asc(user.name)).limit(200);
  const extra = rows.length ? await db.select({ gm: gymMemberLocation.gymMemberId, loc: gymLocation.name }).from(gymMemberLocation).innerJoin(gymLocation, eq(gymLocation.id, gymMemberLocation.locationId))
    .where(and(inArray(gymMemberLocation.gymMemberId, rows.map((r) => r.m.id)), isNull(gymMemberLocation.revokedAt))) : [];
  return rows.map((r) => ({ id: r.m.id, name: r.name, email: r.email, location: r.loc, extraLocations: extra.filter((x) => x.gm === r.m.id).map((x) => x.loc), status: r.m.status, since: r.m.createdAt }));
}
/** Pausar o dar de baja corta operaciones posteriores de esa relación. Reactivar es un acto explícito (no por reescanear el QR). */
export async function setAccess(actorId: string, orgId: string, gymMemberId: string, action: "suspend" | "end" | "reactivate") {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "members.approve");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  const status = action === "suspend" ? "suspended" : action === "end" ? "ended" : "active";
  if (action === "reactivate" && m.status === "active") return { status };
  await db.update(gymMember).set({ status }).where(eq(gymMember.id, m.id));
  if (action !== "reactivate") await db.update(membershipRequest).set({ status: "cancelled", cancelledAt: new Date() }).where(and(eq(membershipRequest.userId, m.userId), eq(membershipRequest.orgId, orgId), eq(membershipRequest.status, "pending")));
  await audit(db, { actorUserId: actorId, orgId, action: `member.${action}`, resourceType: "gym_member", resourceId: m.id });
  return { status };
}
/** Piso puede reportar que alguien ya no es socio: crea una tarea de revisión para recepción/gerencia, sin dar de baja. */
export async function reportNotMember(actorId: string, orgId: string, gymMemberId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  const { createTask } = await import("../gym/services");
  return createTask(actorId, orgId, m.locationId, { gymMemberId: m.id, category: "consulta", priority: "alta", summary: "Revisar si sigue siendo socio/a (reportado desde sala)." });
}

/** Cantidad de accesos habilitados (dato de adopción; nunca base de facturación). */
export async function enabledAccesses(orgId: string) {
  const [g] = await db.select({ n: sql<number>`count(*)::int` }).from(gymMember).where(and(eq(gymMember.orgId, orgId), eq(gymMember.status, "active")));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.coachClient).where(and(eq(schema.coachClient.coachOrgId, orgId), eq(schema.coachClient.status, "active")));
  return (g?.n ?? 0) + (c?.n ?? 0);
}
