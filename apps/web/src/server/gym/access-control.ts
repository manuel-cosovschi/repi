// REPI Gym Access Control (D127). Tres capas: membresía (gym_member, evaluada acá), política del gimnasio (gym_access_policy) y
// check-in presencial (gym_checkin) por QR dinámico de sede, validación del equipo o carnet en recepción. El servidor decide
// siempre: el cliente no declara membresía, sede ni hora. Un ingreso validado no prueba presencia continua (ver docs/gym-access).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  ACCESS_DEFAULTS, CHECKIN_FAILURE_LABEL, CHECKIN_MESSAGE, MEMBERSHIP_LABEL, PASS_REUSE_MIN, STRICT_OPTIONAL, actionNeedsPresence, evaluateGeo, geoDecision,
  localDate, membershipState, passCovers, validPolicy, gymCan,
  type AccessMode, type AccessPolicy, type CheckinFailure, type CheckinMethod, type GeoMode, type GeoResult, type GymAction,
} from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { requireEnv } from "../env";
import { AccessError, audit, type Tx } from "../access/util";
import { NOT_FOUND, activeShift, gymContext, inScope, needRoles, scopedLocations } from "./services";

const { gymAccessPolicy, gymAccessDisplay, gymCheckin, gymMember, gymMemberLocation, gymLocation, organization, user, workoutSession, attendance } = schema;
const FORBIDDEN = () => new AccessError("forbidden", "Tu rol no tiene acceso a esta acción.", 403);
const MANAGE = ["owner", "manager"];

// ── Política ────────────────────────────────────────────────────────────────
export async function policyOf(orgId: string, tx: Tx | typeof db = db): Promise<AccessPolicy> {
  const [p] = await tx.select().from(gymAccessPolicy).where(eq(gymAccessPolicy.orgId, orgId));
  if (!p) return { enabled: false, ...ACCESS_DEFAULTS };
  return {
    enabled: featureOn("gym_access") && p.enabled, mode: p.mode as AccessMode, strictActions: (p.strictActions as GymAction[]).filter((a) => STRICT_OPTIONAL.includes(a)),
    qrTtlSec: p.qrTtlSec, passHours: p.passHours, geoMode: p.geoMode as GeoMode,
  };
}

/** REPI Admin activa o desactiva el módulo (piloto). Al activarlo por primera vez queda en HÍBRIDO; desactivar vuelve al comportamiento anterior. */
export async function setAccessEnabled(orgId: string, on: boolean, actorId: string) {
  await db.insert(gymAccessPolicy).values({ orgId, enabled: on, updatedBy: actorId }).onConflictDoUpdate({ target: gymAccessPolicy.orgId, set: { enabled: on, updatedBy: actorId, updatedAt: new Date() } });
  if (!on) await db.update(gymCheckin).set({ revokedAt: new Date() }).where(and(eq(gymCheckin.orgId, orgId), eq(gymCheckin.result, "ok"), isNull(gymCheckin.revokedAt), gt(gymCheckin.expiresAt, new Date())));
  await audit(db, { actorUserId: actorId, orgId, action: on ? "gym_access.enabled" : "gym_access.disabled", resourceType: "organization", resourceId: orgId });
  return { enabled: on };
}

async function manageCtx(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  needRoles(ctx, MANAGE);
  return ctx;
}

export async function accessSettings(actorId: string, orgId: string) {
  const ctx = await manageCtx(actorId, orgId);
  const locs = await scopedLocations(ctx, null);
  const displays = await db.select().from(gymAccessDisplay).where(and(eq(gymAccessDisplay.orgId, orgId), isNull(gymAccessDisplay.revokedAt))).orderBy(desc(gymAccessDisplay.createdAt));
  return {
    policy: await policyOf(orgId), canEditPolicy: ctx.roles.includes("owner") || ctx.roles.includes("manager"),
    locations: locs.map((l) => ({ id: l.id, name: l.name, lat: l.lat, lng: l.lng, radiusM: l.geoRadiusM })),
    displays: displays.filter((d) => inScope(ctx, d.locationId)).map((d) => ({ id: d.id, name: d.name, locationId: d.locationId, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt })),
  };
}

/** Dueño o gerencia eligen el modo y los parámetros. El encendido del módulo lo maneja REPI Admin. */
export async function updatePolicy(actorId: string, orgId: string, p: Partial<Omit<AccessPolicy, "enabled">>) {
  const ctx = await manageCtx(actorId, orgId);
  if (ctx.locationIds !== null && !ctx.roles.includes("owner")) throw new AccessError("forbidden", "La política del gimnasio la define el dueño o una gerencia de todas las sedes.", 403);
  const v = validPolicy(p);
  if (!v.ok) throw new AccessError("invalid", v.error);
  const cur = await policyOf(orgId);
  const next = { mode: p.mode ?? cur.mode, strictActions: p.strictActions ?? cur.strictActions, qrTtlSec: p.qrTtlSec ?? cur.qrTtlSec, passHours: p.passHours ?? cur.passHours, geoMode: p.geoMode ?? cur.geoMode };
  await db.insert(gymAccessPolicy).values({ orgId, ...next, updatedBy: actorId }).onConflictDoUpdate({ target: gymAccessPolicy.orgId, set: { ...next, updatedBy: actorId, updatedAt: new Date() } });
  await audit(db, { actorUserId: actorId, orgId, action: "gym_access.policy_updated", resourceType: "organization", resourceId: orgId, meta: { from: { mode: cur.mode, geo: cur.geoMode }, to: next } });
  return policyOf(orgId);
}

export async function setLocationGeo(actorId: string, orgId: string, locationId: string, g: { lat: number; lng: number; radiusM: number } | null) {
  const ctx = await manageCtx(actorId, orgId);
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  if (g && (Math.abs(g.lat) > 90 || Math.abs(g.lng) > 180 || !Number.isInteger(g.radiusM) || g.radiusM < 50 || g.radiusM > 1000)) throw new AccessError("invalid", "Revisá latitud, longitud y radio (50 a 1000 m).");
  const r = await db.update(gymLocation).set({ lat: g?.lat ?? null, lng: g?.lng ?? null, geoRadiusM: g?.radiusM ?? null }).where(and(eq(gymLocation.id, locationId), eq(gymLocation.orgId, orgId))).returning({ id: gymLocation.id });
  if (!r.length) throw NOT_FOUND();
  await audit(db, { actorUserId: actorId, orgId, action: "gym_access.location_geo", resourceType: "gym_location", resourceId: locationId, meta: { set: !!g } });
  return { ok: true };
}

// ── QR dinámico ─────────────────────────────────────────────────────────────
const qrKey = () => createHmac("sha256", requireEnv("BETTER_AUTH_SECRET")).update("repi-gym-access-qr-v1").digest();
const sign = (body: string) => createHmac("sha256", qrKey()).update(body).digest("base64url");

/** Token de alta entropía firmado: sede, organización, vencimiento (hora del servidor) y nonce aleatorio. Sin datos de personas. */
export function issueQrToken(orgId: string, locationId: string, ttlSec: number, src: string, now = new Date()) {
  const exp = Math.floor(now.getTime() / 1000) + ttlSec;
  const nonce = randomBytes(16).toString("base64url");
  const body = [orgId, locationId, exp, nonce, src].join(".");
  const token = `RA1.${Buffer.from(body).toString("base64url")}.${sign(body)}`;
  return { token, expiresAt: new Date(exp * 1000), ttlSec };
}
export function readQrToken(token: string, now = new Date()): { ok: true; orgId: string; locationId: string; nonce: string; src: string } | { ok: false; reason: "invalid_token" | "expired_token"; orgId?: string; locationId?: string } {
  const m = /^RA1\.([A-Za-z0-9_-]{20,400})\.([A-Za-z0-9_-]{43})$/.exec((token ?? "").trim());
  if (!m) return { ok: false, reason: "invalid_token" };
  const body = Buffer.from(m[1], "base64url").toString();
  const expect = sign(body);
  if (!timingSafeEqual(Buffer.from(expect), Buffer.from(m[2]))) return { ok: false, reason: "invalid_token" };
  const [orgId, locationId, exp, nonce, src] = body.split(".");
  if (!orgId || !locationId || !nonce || !Number(exp)) return { ok: false, reason: "invalid_token" };
  if (now.getTime() >= Number(exp) * 1000) return { ok: false, reason: "expired_token", orgId, locationId };
  return { ok: true, orgId, locationId, nonce, src: src ?? "" };
}
const qrUrl = (token: string) => `https://repiclub.com/ingreso#c=${token}`; // fragmento: no viaja al servidor ni queda en logs

/** QR en la pantalla del equipo: dueño, gerencia y recepción, sólo en sus sedes y con el módulo activo. */
export async function staffQr(actorId: string, orgId: string, locationId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  if (!gymCan(ctx.roles, "members.approve") && !gymCan(ctx.roles, "reception.desk")) throw FORBIDDEN();
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  const [loc] = await db.select({ id: gymLocation.id, name: gymLocation.name }).from(gymLocation).where(and(eq(gymLocation.id, locationId), eq(gymLocation.orgId, orgId)));
  if (!loc) throw NOT_FOUND();
  const pol = await policyOf(orgId);
  if (!pol.enabled) throw new AccessError("module_off", "El control de acceso no está activo en este gimnasio.", 409);
  const t = issueQrToken(orgId, loc.id, pol.qrTtlSec, `u:${actorId.slice(0, 8)}`, now);
  return { ...t, url: qrUrl(t.token), location: loc.name };
}

/** Alta de una pantalla autorizada (tablet de recepción). El secreto se muestra una sola vez; se guarda su hash. */
export async function createDisplay(actorId: string, orgId: string, locationId: string, name: string) {
  const ctx = await manageCtx(actorId, orgId);
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  const n = (name ?? "").trim().slice(0, 60);
  if (n.length < 2) throw new AccessError("invalid", "Poné un nombre para reconocer la pantalla (por ejemplo, «Tablet recepción»).");
  const secret = randomBytes(32).toString("base64url");
  const [d] = await db.insert(gymAccessDisplay).values({ orgId, locationId, name: n, secretHash: createHash("sha256").update(secret).digest("hex"), createdBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "gym_access.display_created", resourceType: "gym_access_display", resourceId: d.id });
  return { id: d.id, link: `https://repiclub.com/ingreso/pantalla#k=${secret}` };
}
export async function revokeDisplay(actorId: string, orgId: string, displayId: string) {
  const ctx = await manageCtx(actorId, orgId);
  const [d] = await db.select().from(gymAccessDisplay).where(and(eq(gymAccessDisplay.id, displayId), eq(gymAccessDisplay.orgId, orgId)));
  if (!d || !inScope(ctx, d.locationId)) throw NOT_FOUND();
  await db.update(gymAccessDisplay).set({ revokedAt: new Date() }).where(eq(gymAccessDisplay.id, d.id));
  await audit(db, { actorUserId: actorId, orgId, action: "gym_access.display_revoked", resourceType: "gym_access_display", resourceId: d.id });
  return { ok: true };
}
/** La pantalla pide su QR con el secreto (encabezado, nunca en la URL del pedido). */
export async function displayQr(secret: string, now = new Date()) {
  if (!secret || secret.length < 30 || secret.length > 100) throw new AccessError("invalid_display", "Pantalla no autorizada.", 401);
  const [d] = await db.select({ d: gymAccessDisplay, loc: gymLocation.name, org: organization.name }).from(gymAccessDisplay)
    .innerJoin(gymLocation, eq(gymLocation.id, gymAccessDisplay.locationId)).innerJoin(organization, eq(organization.id, gymAccessDisplay.orgId))
    .where(eq(gymAccessDisplay.secretHash, createHash("sha256").update(secret).digest("hex")));
  if (!d || d.d.revokedAt) throw new AccessError("invalid_display", "Esta pantalla ya no está autorizada. Pedí una nueva en «Acceso y presencia».", 401);
  const pol = await policyOf(d.d.orgId);
  if (!pol.enabled) throw new AccessError("module_off", "El control de acceso no está activo en este gimnasio.", 409);
  if (!d.d.lastSeenAt || now.getTime() - d.d.lastSeenAt.getTime() > 60_000) await db.update(gymAccessDisplay).set({ lastSeenAt: now }).where(eq(gymAccessDisplay.id, d.d.id));
  const t = issueQrToken(d.d.orgId, d.d.locationId, pol.qrTtlSec, `d:${d.d.id.slice(0, 8)}`, now);
  return { ...t, url: qrUrl(t.token), location: d.loc, gym: d.org };
}

// ── Membresía ───────────────────────────────────────────────────────────────
async function membershipFor(userId: string, orgId: string, tx: Tx | typeof db = db) {
  const [m] = await tx.select().from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.orgId, orgId)));
  return m ?? null;
}
async function locationAllowed(m: typeof gymMember.$inferSelect, locationId: string, tx: Tx | typeof db = db) {
  if (m.locationId === locationId) return true;
  const [x] = await tx.select({ id: gymMemberLocation.locationId }).from(gymMemberLocation)
    .where(and(eq(gymMemberLocation.gymMemberId, m.id), eq(gymMemberLocation.locationId, locationId), isNull(gymMemberLocation.revokedAt)));
  return !!x;
}

/** Vigencia cargada por el gimnasio (manual o desde su sistema), con el mismo permiso que pausar o dar de baja. */
export async function setAccessUntil(actorId: string, orgId: string, gymMemberId: string, until: string | null) {
  const ctx = await gymContext(actorId, orgId);
  if (!gymCan(ctx.roles, "members.approve")) throw FORBIDDEN();
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new AccessError("invalid", "Fecha inválida.");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  await db.update(gymMember).set({ accessUntil: until }).where(eq(gymMember.id, m.id));
  if (until && until < localDate(new Date())) await revokeMemberPasses(db, m.id, actorId);
  await audit(db, { actorUserId: actorId, orgId, action: "member.access_until", resourceType: "gym_member", resourceId: m.id, meta: { until } });
  return { accessUntil: until };
}

/** Pausa, baja o vencimiento: los ingresos vigentes de esa membresía dejan de valer. */
export async function revokeMemberPasses(tx: Tx | typeof db, gymMemberId: string, actorId: string | null) {
  await tx.update(gymCheckin).set({ revokedAt: new Date(), revokedBy: actorId }).where(and(eq(gymCheckin.gymMemberId, gymMemberId), eq(gymCheckin.result, "ok"), isNull(gymCheckin.revokedAt), gt(gymCheckin.expiresAt, new Date())));
}

// ── Check-in ────────────────────────────────────────────────────────────────
type GeoRead = { lat: number; lng: number; accuracyM: number; ageSec: number } | null;

async function deny(p: { orgId: string; locationId: string; userId: string; gymMemberId?: string | null; method: CheckinMethod; reason: CheckinFailure; geo?: GeoResult | null; nonce?: string }) {
  await db.insert(gymCheckin).values({ orgId: p.orgId, locationId: p.locationId, userId: p.userId, gymMemberId: p.gymMemberId ?? null, method: p.method, result: "denied", reason: p.reason, geoResult: p.geo ?? null, nonce: p.nonce ?? null });
  return { ok: false as const, reason: p.reason, message: CHECKIN_MESSAGE[p.reason] };
}

/** Crea el pase o devuelve el vigente (escanear dos veces no crea pases contradictorios). */
async function issuePass(p: { orgId: string; locationId: string; userId: string; gymMemberId: string; method: CheckinMethod; nonce?: string | null; displayId?: string | null; geo?: GeoResult | null; verifiedBy?: string | null; note?: string | null; passHours: number }, now: Date) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`checkin:${p.userId}:${p.orgId}`}))`);
    if (p.nonce) {
      const [same] = await tx.select().from(gymCheckin).where(and(eq(gymCheckin.userId, p.userId), eq(gymCheckin.nonce, p.nonce), eq(gymCheckin.result, "ok")));
      if (same) return { pass: same, duplicate: true };
    }
    const [cur] = await tx.select().from(gymCheckin).where(and(eq(gymCheckin.userId, p.userId), eq(gymCheckin.orgId, p.orgId), eq(gymCheckin.result, "ok"), isNull(gymCheckin.revokedAt), gt(gymCheckin.expiresAt, now)))
      .orderBy(desc(gymCheckin.expiresAt)).limit(1);
    if (cur && cur.locationId === p.locationId && cur.expiresAt!.getTime() - now.getTime() > PASS_REUSE_MIN * 60_000) return { pass: cur, duplicate: true };
    const [row] = await tx.insert(gymCheckin).values({
      orgId: p.orgId, locationId: p.locationId, userId: p.userId, gymMemberId: p.gymMemberId, method: p.method, result: "ok", nonce: p.nonce ?? null, displayId: p.displayId ?? null,
      geoResult: p.geo ?? null, verifiedBy: p.verifiedBy ?? null, note: p.note ?? null, issuedAt: now, expiresAt: new Date(now.getTime() + p.passHours * 3_600_000),
    }).returning();
    // También cuenta como ingreso para el gimnasio (asistencia y sede donde entrena).
    await tx.insert(attendance).values({ orgId: p.orgId, locationId: p.locationId, gymMemberId: p.gymMemberId, source: p.method === "desk" ? "recepcion_qr" : "checkin", recordedBy: p.verifiedBy ?? null, at: now });
    await audit(tx, { actorUserId: p.verifiedBy ?? p.userId, orgId: p.orgId, action: "gym_access.checkin", resourceType: "gym_checkin", resourceId: row.id, meta: { method: p.method } });
    return { pass: row, duplicate: false };
  });
}
const passOut = (x: typeof gymCheckin.$inferSelect, location: string) => ({ id: x.id, location, method: x.method, issuedAt: x.issuedAt, expiresAt: x.expiresAt });

/** El socio (ya autenticado) escanea el QR de la sede. El QR no inicia sesión ni identifica a nadie. */
export async function memberCheckin(userId: string, p: { token: string; geo?: GeoRead }, now = new Date()) {
  const t = readQrToken(p.token, now);
  if (!t.ok) {
    if (t.reason === "expired_token" && t.orgId && t.locationId) {
      const m = await membershipFor(userId, t.orgId);
      const [loc] = await db.select({ id: gymLocation.id }).from(gymLocation).where(and(eq(gymLocation.id, t.locationId), eq(gymLocation.orgId, t.orgId)));
      if (loc && m) return deny({ orgId: t.orgId, locationId: loc.id, userId, gymMemberId: m.id, method: "qr", reason: "expired_token" });
    }
    return { ok: false as const, reason: t.reason, message: CHECKIN_MESSAGE[t.reason] };
  }
  const [loc] = await db.select().from(gymLocation).where(and(eq(gymLocation.id, t.locationId), eq(gymLocation.orgId, t.orgId)));
  if (!loc) return { ok: false as const, reason: "invalid_token" as const, message: CHECKIN_MESSAGE.invalid_token };
  const pol = await policyOf(t.orgId);
  if (!pol.enabled) return { ok: false as const, reason: "module_off" as const, message: CHECKIN_MESSAGE.module_off };
  const base = { orgId: t.orgId, locationId: loc.id, userId, method: "qr" as const, nonce: t.nonce };
  const m = await membershipFor(userId, t.orgId);
  if (!m) return deny({ ...base, reason: "no_membership" });
  if (membershipState(m.status, m.accessUntil, localDate(now)) !== "active") return deny({ ...base, gymMemberId: m.id, reason: "membership_inactive" });
  if (!(await locationAllowed(m, loc.id))) return deny({ ...base, gymMemberId: m.id, reason: "branch_not_allowed" });
  const hasGeo = loc.lat != null && loc.lng != null && !!loc.geoRadiusM;
  const geo = hasGeo && pol.geoMode !== "off" ? evaluateGeo({ lat: loc.lat!, lng: loc.lng!, radiusM: loc.geoRadiusM! }, p.geo ?? null) : null;
  const g = geoDecision(pol.geoMode, hasGeo, geo);
  if (!g.ok) return deny({ ...base, gymMemberId: m.id, reason: g.reason, geo });
  const displayId = t.src.startsWith("d:") ? t.src.slice(2) : null;
  const r = await issuePass({ ...base, gymMemberId: m.id, method: g.method, geo, displayId, passHours: pol.passHours }, now);
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, t.orgId));
  return { ok: true as const, duplicate: r.duplicate, gym: org?.name ?? "", pass: passOut(r.pass, loc.name) };
}

/** Validación por el equipo (recepción, gerencia o sala con turno en esa sede): alternativa cuando el QR o la ubicación fallan. */
export async function staffCheckin(actorId: string, orgId: string, p: { gymMemberId: string; locationId: string; note?: string | null; method?: "staff" | "desk" }, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  const desk = gymCan(ctx.roles, "members.approve") || gymCan(ctx.roles, "reception.desk");
  const floor = gymCan(ctx.roles, "members.validate");
  if (!desk && !floor) throw FORBIDDEN();
  if (!inScope(ctx, p.locationId)) throw NOT_FOUND();
  if (!desk) {
    const sh = await activeShift(actorId);
    if (!sh || sh.locationId !== p.locationId) throw new AccessError("no_shift", "Iniciá tu turno en esta sede para validar ingresos.", 409);
  }
  const pol = await policyOf(orgId);
  if (!pol.enabled) throw new AccessError("module_off", "El control de acceso no está activo en este gimnasio.", 409);
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, p.gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m) throw NOT_FOUND();
  if (membershipState(m.status, m.accessUntil, localDate(now)) !== "active") throw new AccessError("membership_inactive", "La membresía de esta persona no está activa.", 409);
  if (!(await locationAllowed(m, p.locationId))) throw new AccessError("branch_not_allowed", "La membresía de esta persona no incluye esta sede.", 409);
  const [loc] = await db.select({ name: gymLocation.name }).from(gymLocation).where(eq(gymLocation.id, p.locationId));
  const r = await issuePass({ orgId, locationId: p.locationId, userId: m.userId, gymMemberId: m.id, method: p.method ?? "staff", verifiedBy: actorId, note: (p.note ?? "").trim().slice(0, 200) || null, passHours: pol.passHours }, now);
  return { duplicate: r.duplicate, pass: passOut(r.pass, loc?.name ?? "") };
}

export async function revokePass(actorId: string, orgId: string, checkinId: string) {
  const ctx = await manageCtx(actorId, orgId);
  const [c] = await db.select().from(gymCheckin).where(and(eq(gymCheckin.id, checkinId), eq(gymCheckin.orgId, orgId), eq(gymCheckin.result, "ok")));
  if (!c || !inScope(ctx, c.locationId)) throw NOT_FOUND();
  if (!c.revokedAt) await db.update(gymCheckin).set({ revokedAt: new Date(), revokedBy: actorId }).where(eq(gymCheckin.id, c.id));
  await audit(db, { actorUserId: actorId, orgId, action: "gym_access.pass_revoked", resourceType: "gym_checkin", resourceId: c.id });
  return { ok: true };
}

// ── Autorización de acciones (motor central) ────────────────────────────────
export const PRESENCE_REQUIRED = (gym: string) =>
  new AccessError("presence_required", `Para hacer esto con el programa de ${gym}, validá tu ingreso en el gimnasio. Lo que ya registraste queda guardado.`, 403);

/**
 * canPerformGymAction: ¿esta persona puede hacer esta acción institucional ahora? Evalúa membresía, política y, si hace falta,
 * un ingreso vigente de esa organización (nunca de otra). Devuelve el ingreso que la cubre para atarlo a la sesión.
 */
export async function canPerformGymAction(p: { userId: string; orgId: string; action: GymAction; preferPassId?: string | null; clientAt?: Date | null }, now = new Date(), tx: Tx | typeof db = db):
  Promise<{ ok: true; passId: string | null } | { ok: false; code: "membership_inactive" | "presence_required"; gym: string }> {
  const [org] = await tx.select({ name: organization.name }).from(organization).where(eq(organization.id, p.orgId));
  const gym = org?.name ?? "tu gimnasio";
  const m = await membershipFor(p.userId, p.orgId, tx);
  if (!m || membershipState(m.status, m.accessUntil, localDate(now)) !== "active") return { ok: false, code: "membership_inactive", gym };
  const pol = await policyOf(p.orgId, tx);
  if (!actionNeedsPresence(pol, p.action)) return { ok: true, passId: null };
  const passes = await tx.select().from(gymCheckin).where(and(eq(gymCheckin.userId, p.userId), eq(gymCheckin.orgId, p.orgId), eq(gymCheckin.result, "ok"), isNull(gymCheckin.revokedAt),
    gte(gymCheckin.expiresAt, new Date(now.getTime() - 13 * 3_600_000)))).orderBy(desc(gymCheckin.expiresAt)).limit(10);
  const ordered = [...passes.filter((x) => x.id === p.preferPassId), ...passes.filter((x) => x.id !== p.preferPassId)];
  const hit = ordered.find((x) => x.issuedAt && x.expiresAt && passCovers({ issuedAt: x.issuedAt, expiresAt: x.expiresAt, revokedAt: x.revokedAt }, now, p.clientAt ?? null));
  return hit ? { ok: true, passId: hit.id } : { ok: false, code: "presence_required", gym };
}

/** Versión que lanza el error de la API (para servicios de entrenamiento, Connect y desafíos). */
export async function requireGymAction(p: Parameters<typeof canPerformGymAction>[0], now = new Date(), tx: Tx | typeof db = db) {
  const r = await canPerformGymAction(p, now, tx);
  if (r.ok) return r.passId;
  if (r.code === "membership_inactive") throw new AccessError("relation_inactive", `Tu membresía en ${r.gym} no está activa. Consultá en recepción.`, 403);
  throw PRESENCE_REQUIRED(r.gym);
}

// ── Socio: estado ───────────────────────────────────────────────────────────
/** Lo que ve el socio: por cada gimnasio, modo, membresía y si tiene un ingreso vigente. Sin datos de otras personas. */
export async function myPresence(userId: string, now = new Date()) {
  const rows = await db.select({ m: gymMember, org: organization.name, loc: gymLocation.name }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), inArray(gymMember.status, ["active", "suspended", "ended"])));
  const out = [];
  for (const r of rows) {
    const pol = await policyOf(r.m.orgId);
    const [pass] = await db.select({ c: gymCheckin, loc: gymLocation.name }).from(gymCheckin).innerJoin(gymLocation, eq(gymLocation.id, gymCheckin.locationId))
      .where(and(eq(gymCheckin.userId, userId), eq(gymCheckin.orgId, r.m.orgId), eq(gymCheckin.result, "ok"), isNull(gymCheckin.revokedAt), gt(gymCheckin.expiresAt, now)))
      .orderBy(desc(gymCheckin.expiresAt)).limit(1);
    const st = membershipState(r.m.status, r.m.accessUntil, localDate(now));
    out.push({
      orgId: r.m.orgId, gym: r.org, location: r.loc, membership: st, membershipLabel: MEMBERSHIP_LABEL[st], accessUntil: r.m.accessUntil,
      enabled: pol.enabled, mode: pol.mode, startNeedsCheckin: actionNeedsPresence(pol, "gym.workout.start"), geoMode: pol.geoMode,
      pass: pass ? passOut(pass.c, pass.loc) : null,
    });
  }
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  return { gyms: out, demo: /@demo-[a-f0-9]{10}\.invalid$/.test(u?.email ?? "") };
}

// ── Panel del dueño ─────────────────────────────────────────────────────────
/** «Acceso y presencia»: números agregados, ingresos vigentes y últimos intentos. No es un rastreo: sólo eventos de validación. */
export async function accessReport(actorId: string, orgId: string, locationId: string | null, days = 7, now = new Date()) {
  const ctx = await manageCtx(actorId, orgId);
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const span = [1, 7, 30].includes(days) ? days : 7;
  const since = new Date(now.getTime() - span * 86_400_000);
  const pol = await policyOf(orgId);
  if (!ids.length) return { policy: pol, days: span, totals: null, active: [], recent: [], byLocation: [], denials: [] };
  const rows = await db.select({ c: gymCheckin, name: user.name, loc: gymLocation.name }).from(gymCheckin).innerJoin(user, eq(user.id, gymCheckin.userId)).innerJoin(gymLocation, eq(gymLocation.id, gymCheckin.locationId))
    .where(and(eq(gymCheckin.orgId, orgId), inArray(gymCheckin.locationId, ids), gte(gymCheckin.createdAt, since))).orderBy(desc(gymCheckin.createdAt)).limit(5000);
  const ok = rows.filter((r) => r.c.result === "ok"), denied = rows.filter((r) => r.c.result === "denied");
  const [sess] = await db.select({ n: sql<number>`count(*)::int` }).from(workoutSession).innerJoin(gymCheckin, eq(gymCheckin.id, workoutSession.presenceCheckinId))
    .where(and(eq(gymCheckin.orgId, orgId), inArray(gymCheckin.locationId, ids), gte(workoutSession.startedAt, since), isNotNull(workoutSession.presenceCheckinId)));
  const active = await db.select({ c: gymCheckin, name: user.name, loc: gymLocation.name }).from(gymCheckin).innerJoin(user, eq(user.id, gymCheckin.userId)).innerJoin(gymLocation, eq(gymLocation.id, gymCheckin.locationId))
    .where(and(eq(gymCheckin.orgId, orgId), inArray(gymCheckin.locationId, ids), eq(gymCheckin.result, "ok"), isNull(gymCheckin.revokedAt), gt(gymCheckin.expiresAt, now))).orderBy(desc(gymCheckin.issuedAt)).limit(200);
  const reasonCount = new Map<string, number>();
  for (const d of denied) reasonCount.set(d.c.reason ?? "otro", (reasonCount.get(d.c.reason ?? "otro") ?? 0) + 1);
  // Sin membresía: no se muestra el nombre (no es socio de este gimnasio).
  const who = (r: (typeof rows)[number]) => (r.c.result === "denied" && r.c.reason === "no_membership" ? "Persona sin membresía" : r.name);
  return {
    policy: pol, days: span,
    totals: {
      ok: ok.length, denied: denied.length, members: new Set(ok.map((r) => r.c.gymMemberId)).size, sessions: sess?.n ?? 0,
      manual: ok.filter((r) => r.c.method === "staff").length, desk: ok.filter((r) => r.c.method === "desk").length, withGeo: ok.filter((r) => r.c.method === "qr_geo").length,
    },
    denials: [...reasonCount.entries()].map(([k, n]) => ({ reason: k, label: CHECKIN_FAILURE_LABEL[k as CheckinFailure] ?? k, n })).sort((a, b) => b.n - a.n),
    byLocation: locs.map((l) => ({ id: l.id, name: l.name, ok: ok.filter((r) => r.c.locationId === l.id).length, denied: denied.filter((r) => r.c.locationId === l.id).length })),
    active: active.map((r) => ({ id: r.c.id, name: r.name, location: r.loc, method: r.c.method, issuedAt: r.c.issuedAt, expiresAt: r.c.expiresAt, note: r.c.note })),
    recent: rows.slice(0, 60).map((r) => ({ id: r.c.id, at: r.c.createdAt, name: who(r), location: r.loc, method: r.c.method, result: r.c.result, reason: r.c.reason ? CHECKIN_FAILURE_LABEL[r.c.reason as CheckinFailure] ?? r.c.reason : null, geo: r.c.geoResult, revoked: !!r.c.revokedAt, note: r.c.note })),
  };
}

/** Socios para validar a mano (búsqueda por nombre en las sedes del equipo). */
export async function memberLookup(actorId: string, orgId: string, q: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!gymCan(ctx.roles, "members.approve") && !gymCan(ctx.roles, "reception.desk") && !gymCan(ctx.roles, "members.validate")) throw FORBIDDEN();
  const ids = (await scopedLocations(ctx, null)).map((l) => l.id);
  const term = (q ?? "").trim().slice(0, 60);
  if (term.length < 2 || !ids.length) return [];
  const rows = await db.select({ id: gymMember.id, name: user.name, status: gymMember.status, until: gymMember.accessUntil, loc: gymLocation.name, locationId: gymMember.locationId })
    .from(gymMember).innerJoin(user, eq(user.id, gymMember.userId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.orgId, orgId), inArray(gymMember.locationId, ids), sql`${user.name} ilike ${"%" + term + "%"}`)).limit(20);
  const today = localDate(new Date());
  return rows.map((r) => ({ id: r.id, name: r.name, location: r.loc, locationId: r.locationId, membership: MEMBERSHIP_LABEL[membershipState(r.status, r.until, today)] }));
}
