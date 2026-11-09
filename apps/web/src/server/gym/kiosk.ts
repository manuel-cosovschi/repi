// REPI Control (D213): pantalla de consulta de rutinas (kiosco). Una tablet o monitor del gimnasio, autorizada por el personal,
// donde el socio se identifica con su código de socio y su PIN y ve el programa vigente, sólo para consultar.
//
// Seguridad (docs/repi-control/SEGURIDAD.md):
// - Dos factores de la pantalla: el secreto del equipo (32 bytes, sólo su hash en la base, encabezado propio, distinto del QR de
//   ingreso y del ranking) y la credencial de la persona (código de 6 dígitos al azar + PIN propio con scrypt y clave del servidor).
// - Intentos: 5 fallidos seguidos bloquean el código 15 min; 10 seguidos lo anulan hasta que el personal emita otro. Cada pantalla
//   se pausa 5 min con 15 fallos en 10 min (y la ruta limita por IP). La respuesta de error no dice si el código existe.
// - La consulta es una por vez y corta (5 min como máximo; la pantalla cierra sola a los 60 s sin uso). El token vive sólo en la
//   memoria de la pantalla. Revocar la pantalla o la credencial, deshabilitar el kiosco o dar de baja al socio corta en el pedido
//   siguiente. Las respuestas son no-store y no llevan datos de salud, historial ni contacto.
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { prescriptionText } from "@repi/domain";
import { db, schema } from "@/db";
import { requireEnv } from "../env";
import { AccessError, audit, type Tx } from "../access/util";
import { NOT_FOUND, gymContext, inScope, need, needRoles } from "./services";
import { readVersion } from "../training/services";
import { mediaFor } from "../training/exercise-media";

const { gymKiosk, kioskCredential, kioskSession, gymMember, gymLocation, organization, programAssignment, program, user, appRateLimit } = schema;

export const KIOSK_SESSION_MS = 5 * 60_000;
export const KIOSK_IDLE_SEC = 60;
export const CODE_LOCK_AFTER = 5;
export const CODE_LOCK_MS = 15 * 60_000;
export const CODE_REVOKE_AFTER = 10;
export const DEVICE_MAX_FAILS = 15;
export const DEVICE_WINDOW_MS = 10 * 60_000;
const PIN_RE = /^[0-9]{4,6}$/;
const CODE_RE = /^[0-9]{6}$/;
const GENERIC = "Código o PIN incorrectos. Si no los recordás, pedí ayuda en recepción.";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const site = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://repiclub.com").replace(/\/$/, "");
const pepper = () => createHmac("sha256", requireEnv("BETTER_AUTH_SECRET")).update("repi-kiosk-pin-v1").digest();
/** scrypt(PIN, sal) con una clave del servidor: la base sola no alcanza para probar los PIN fuera de línea. */
export function hashPin(pin: string, salt = randomBytes(16)) {
  const key = scryptSync(Buffer.concat([pepper(), Buffer.from(pin)]), salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export function checkPin(pin: string, stored: string) {
  const [v, s, k] = stored.split("$");
  if (v !== "s1" || !s || !k) return false;
  const want = Buffer.from(k, "base64url");
  const got = scryptSync(Buffer.concat([pepper(), Buffer.from(pin)]), Buffer.from(s, "base64url"), want.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(want, got);
}
const DUMMY = () => hashPin("000000", Buffer.alloc(16));

// ── Personal: pantallas ─────────────────────────────────────────────────────
async function deviceCtx(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  needRoles(ctx, ["owner", "manager"]);
  return ctx;
}
async function orgKiosk(orgId: string) {
  const [o] = await db.select({ kioskEnabled: organization.kioskEnabled, routinePolicy: organization.routinePolicy, name: organization.name }).from(organization).where(eq(organization.id, orgId));
  return o;
}
const NEEDS_ENABLE = () => new AccessError("kiosk_off", "La pantalla de rutinas no está habilitada para este gimnasio. Pedíselo a REPI.", 409);

/** Resumen para el panel: si está habilitada, la política y las pantallas vigentes de las sedes del actor. */
export async function kioskSettings(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reception.desk");
  const o = await orgKiosk(orgId);
  const rows = await db.select({ k: gymKiosk, loc: gymLocation.name }).from(gymKiosk).innerJoin(gymLocation, eq(gymLocation.id, gymKiosk.locationId))
    .where(and(eq(gymKiosk.orgId, orgId), isNull(gymKiosk.revokedAt))).orderBy(asc(gymKiosk.createdAt));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(kioskCredential).where(and(eq(kioskCredential.orgId, orgId), isNull(kioskCredential.revokedAt)));
  return {
    enabled: o?.kioskEnabled ?? false, supervised: o?.routinePolicy === "supervised", credentials: n,
    canManageDevices: ctx.roles.some((r) => r === "owner" || r === "manager"),
    devices: rows.filter((r) => inScope(ctx, r.k.locationId)).map((r) => ({ id: r.k.id, name: r.k.name, location: r.loc, locationId: r.k.locationId, createdAt: r.k.createdAt, lastSeenAt: r.k.lastSeenAt })),
  };
}

export async function createKiosk(actorId: string, orgId: string, locationId: string, name: string) {
  const ctx = await deviceCtx(actorId, orgId);
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  const [l] = await db.select({ id: gymLocation.id }).from(gymLocation).where(and(eq(gymLocation.id, locationId), eq(gymLocation.orgId, orgId)));
  if (!l) throw NOT_FOUND();
  if (!(await orgKiosk(orgId))?.kioskEnabled) throw NEEDS_ENABLE();
  const n = (name ?? "").trim().slice(0, 60);
  if (n.length < 2) throw new AccessError("invalid", "Poné un nombre para reconocer la pantalla (por ejemplo, «Tablet sala de musculación»).");
  const secret = randomBytes(32).toString("base64url");
  const [k] = await db.insert(gymKiosk).values({ orgId, locationId, name: n, secretHash: sha(secret), createdBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "kiosk.device_created", resourceType: "gym_kiosk", resourceId: k.id });
  // El enlace se muestra una sola vez; el secreto viaja en el fragmento (no llega a los registros del servidor).
  return { id: k.id, link: `${site()}/rutinas#k=${secret}` };
}

export async function revokeKiosk(actorId: string, orgId: string, kioskId: string) {
  const ctx = await deviceCtx(actorId, orgId);
  const [k] = await db.select().from(gymKiosk).where(and(eq(gymKiosk.id, kioskId), eq(gymKiosk.orgId, orgId)));
  if (!k || !inScope(ctx, k.locationId)) throw NOT_FOUND();
  if (k.revokedAt) return { ok: true };
  await db.transaction(async (tx) => {
    await tx.update(gymKiosk).set({ revokedAt: new Date(), revokedBy: actorId }).where(eq(gymKiosk.id, k.id));
    await tx.update(kioskSession).set({ endedAt: new Date(), endReason: "device_revoked" }).where(and(eq(kioskSession.kioskId, k.id), isNull(kioskSession.endedAt)));
    await audit(tx, { actorUserId: actorId, orgId, action: "kiosk.device_revoked", resourceType: "gym_kiosk", resourceId: k.id });
  });
  return { ok: true };
}

// ── Personal: credenciales de socios ────────────────────────────────────────
async function memberInScope(actorId: string, orgId: string, gymMemberId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reception.desk");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  return m;
}

/** Estado de la credencial (el PIN nunca se puede volver a ver). */
export async function credentialStatus(actorId: string, orgId: string, gymMemberId: string) {
  await memberInScope(actorId, orgId, gymMemberId);
  const [c] = await db.select().from(kioskCredential).where(and(eq(kioskCredential.gymMemberId, gymMemberId), isNull(kioskCredential.revokedAt)));
  const o = await orgKiosk(orgId);
  return {
    enabled: o?.kioskEnabled ?? false,
    credential: c ? { code: c.memberCode, issuedAt: c.issuedAt, lastUsedAt: c.lastUsedAt, locked: !!c.lockedUntil && c.lockedUntil > new Date(), failedCount: c.failedCount } : null,
  };
}

async function newCode(tx: Tx, orgId: string) {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(100000, 1000000));
    const [taken] = await tx.select({ id: kioskCredential.id }).from(kioskCredential).where(and(eq(kioskCredential.orgId, orgId), eq(kioskCredential.memberCode, code), isNull(kioskCredential.revokedAt)));
    if (!taken) return code;
  }
  throw new AccessError("busy", "No pudimos generar un código. Probá de nuevo.", 503);
}

/**
 * Emite (o vuelve a emitir) el código y un PIN de 4 dígitos al azar. Se muestran una sola vez para entregarlos al socio. Volver a
 * emitir anula el anterior. Sólo para socios activos del gimnasio.
 */
export async function issueCredential(actorId: string, orgId: string, gymMemberId: string) {
  const m = await memberInScope(actorId, orgId, gymMemberId);
  if (m.status !== "active") throw new AccessError("invalid", "El socio tiene que estar activo para usar la pantalla.");
  if (!(await orgKiosk(orgId))?.kioskEnabled) throw NEEDS_ENABLE();
  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kiosk-cred:${orgId}`}))`);
    const prev = await tx.update(kioskCredential).set({ revokedAt: new Date(), revokedReason: "reissued" })
      .where(and(eq(kioskCredential.gymMemberId, gymMemberId), isNull(kioskCredential.revokedAt))).returning({ id: kioskCredential.id });
    if (prev.length) await tx.update(kioskSession).set({ endedAt: new Date(), endReason: "credential_revoked" }).where(and(inArray(kioskSession.credentialId, prev.map((p) => p.id)), isNull(kioskSession.endedAt)));
    const code = await newCode(tx, orgId);
    const [c] = await tx.insert(kioskCredential).values({ orgId, gymMemberId, memberCode: code, pinHash: hashPin(pin), issuedBy: actorId }).returning({ id: kioskCredential.id });
    await audit(tx, { actorUserId: actorId, orgId, action: prev.length ? "kiosk.credential_reissued" : "kiosk.credential_issued", resourceType: "kiosk_credential", resourceId: c.id, meta: { gymMemberId } });
    return { code, pin };
  });
}

export async function revokeCredential(actorId: string, orgId: string, gymMemberId: string) {
  await memberInScope(actorId, orgId, gymMemberId);
  return db.transaction(async (tx) => {
    const prev = await tx.update(kioskCredential).set({ revokedAt: new Date(), revokedReason: "revoked" })
      .where(and(eq(kioskCredential.gymMemberId, gymMemberId), isNull(kioskCredential.revokedAt))).returning({ id: kioskCredential.id });
    if (prev.length) {
      await tx.update(kioskSession).set({ endedAt: new Date(), endReason: "credential_revoked" }).where(and(inArray(kioskSession.credentialId, prev.map((p) => p.id)), isNull(kioskSession.endedAt)));
      await audit(tx, { actorUserId: actorId, orgId, action: "kiosk.credential_revoked", resourceType: "kiosk_credential", resourceId: prev[0].id, meta: { gymMemberId } });
    }
    return { revoked: prev.length > 0 };
  });
}

// ── Socio desde su app: ver su código y cambiar su PIN ──────────────────────
export async function myKioskAccess(userId: string) {
  const rows = await db.select({ c: kioskCredential, org: organization.name }).from(kioskCredential)
    .innerJoin(gymMember, eq(gymMember.id, kioskCredential.gymMemberId)).innerJoin(organization, eq(organization.id, kioskCredential.orgId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active"), isNull(kioskCredential.revokedAt), eq(organization.kioskEnabled, true)));
  return { items: rows.map((r) => ({ id: r.c.id, gym: r.org, code: r.c.memberCode, locked: !!r.c.lockedUntil && r.c.lockedUntil > new Date() })) };
}
export async function setMyPin(userId: string, credentialId: string, pin: string) {
  if (!PIN_RE.test(pin)) throw new AccessError("invalid", "El PIN tiene que tener de 4 a 6 números.");
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) throw new AccessError("invalid", "Elegí un PIN menos obvio (sin números repetidos ni seguidos).");
  const [r] = await db.select({ c: kioskCredential }).from(kioskCredential).innerJoin(gymMember, eq(gymMember.id, kioskCredential.gymMemberId))
    .where(and(eq(kioskCredential.id, credentialId), eq(gymMember.userId, userId), eq(gymMember.status, "active"), isNull(kioskCredential.revokedAt)));
  if (!r) throw new AccessError("not_found", "No encontramos tu código de pantalla.", 404);
  await db.update(kioskCredential).set({ pinHash: hashPin(pin), failedCount: 0, lockedUntil: null }).where(eq(kioskCredential.id, r.c.id));
  await audit(db, { actorUserId: userId, orgId: r.c.orgId, action: "kiosk.pin_changed", resourceType: "kiosk_credential", resourceId: r.c.id });
  return { ok: true };
}

// ── Pantalla ────────────────────────────────────────────────────────────────
async function device(secret: string, now = new Date()) {
  if (!secret || secret.length < 30 || secret.length > 100) throw new AccessError("invalid_kiosk", "Pantalla no autorizada.", 401);
  const [d] = await db.select({ k: gymKiosk, loc: gymLocation.name, org: organization }).from(gymKiosk)
    .innerJoin(gymLocation, eq(gymLocation.id, gymKiosk.locationId)).innerJoin(organization, eq(organization.id, gymKiosk.orgId))
    .where(eq(gymKiosk.secretHash, sha(secret)));
  if (!d || d.k.revokedAt) throw new AccessError("invalid_kiosk", "Esta pantalla ya no está autorizada. El gimnasio puede registrarla de nuevo desde REPI.", 401);
  if (!d.org.kioskEnabled || d.org.status === "paused" || d.org.status === "closed") throw new AccessError("kiosk_off", "La pantalla de rutinas no está disponible en este momento. Pedí ayuda en recepción.", 409);
  if (!d.k.lastSeenAt || now.getTime() - d.k.lastSeenAt.getTime() > 60_000) await db.update(gymKiosk).set({ lastSeenAt: now }).where(eq(gymKiosk.id, d.k.id));
  return d;
}

/** Lo que la pantalla muestra en la bienvenida (nombre del gimnasio y sede). */
export async function kioskHello(secret: string) {
  const d = await device(secret);
  return { gym: d.org.name, location: d.loc, screen: d.k.name, idleSec: KIOSK_IDLE_SEC, demo: d.org.isDemo };
}

async function deviceFailures(kioskId: string, now: Date) {
  const [r] = await db.select().from(appRateLimit).where(eq(appRateLimit.key, `kiosk-fail:${kioskId}`));
  if (!r || now.getTime() - r.windowStart.getTime() > DEVICE_WINDOW_MS) return 0;
  return r.count;
}
async function addDeviceFailure(kioskId: string, now: Date) {
  const key = `kiosk-fail:${kioskId}`;
  const cutoff = new Date(now.getTime() - DEVICE_WINDOW_MS).toISOString();
  await db.insert(appRateLimit).values({ key, windowStart: now, count: 1 }).onConflictDoUpdate({
    target: appRateLimit.key,
    set: {
      count: sql`case when ${appRateLimit.windowStart} < ${cutoff}::timestamptz then 1 else ${appRateLimit.count} + 1 end`,
      windowStart: sql`case when ${appRateLimit.windowStart} < ${cutoff}::timestamptz then ${now.toISOString()}::timestamptz else ${appRateLimit.windowStart} end`,
    },
  });
}

/** Identificación con código + PIN. Devuelve un token de consulta que la pantalla guarda sólo en memoria. */
export async function kioskIdentify(secret: string, p: { code: string; pin: string }, now = new Date()) {
  const d = await device(secret, now);
  if ((await deviceFailures(d.k.id, now)) >= DEVICE_MAX_FAILS)
    throw new AccessError("kiosk_paused", "Por seguridad, la pantalla se pausó unos minutos. Pedí ayuda en recepción.", 429);
  const code = (p.code ?? "").replace(/\D/g, "");
  const pin = (p.pin ?? "").replace(/\D/g, "");
  const fail = async (credentialId: string | null) => {
    await addDeviceFailure(d.k.id, now);
    await audit(db, { orgId: d.k.orgId, action: "kiosk.identify_failed", resourceType: "gym_kiosk", resourceId: d.k.id, result: "denied", meta: { credentialId } });
    return new AccessError("bad_credentials", GENERIC, 401);
  };
  if (!CODE_RE.test(code) || !PIN_RE.test(pin)) { checkPin(pin || "0000", DUMMY()); throw await fail(null); }
  const [c] = await db.select({ c: kioskCredential, m: gymMember }).from(kioskCredential).innerJoin(gymMember, eq(gymMember.id, kioskCredential.gymMemberId))
    .where(and(eq(kioskCredential.orgId, d.k.orgId), eq(kioskCredential.memberCode, code), isNull(kioskCredential.revokedAt)));
  if (!c || c.m.status !== "active") { checkPin(pin, DUMMY()); throw await fail(null); }
  if (c.c.lockedUntil && c.c.lockedUntil > now) { await addDeviceFailure(d.k.id, now); throw new AccessError("code_locked", "Por seguridad, ese código está en pausa por unos minutos. Pedí ayuda en recepción.", 423); }
  if (!checkPin(pin, c.c.pinHash)) {
    const n = c.c.failedCount + 1;
    const revoke = n >= CODE_REVOKE_AFTER;
    await db.update(kioskCredential).set({
      failedCount: n, lockedUntil: n % CODE_LOCK_AFTER === 0 ? new Date(now.getTime() + CODE_LOCK_MS) : c.c.lockedUntil,
      ...(revoke ? { revokedAt: now, revokedReason: "too_many_attempts" } : {}),
    }).where(eq(kioskCredential.id, c.c.id));
    throw await fail(c.c.id);
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + KIOSK_SESSION_MS);
  await db.transaction(async (tx) => {
    // Una persona por vez: cualquier consulta abierta en esta pantalla se cierra.
    await tx.update(kioskSession).set({ endedAt: now, endReason: "replaced" }).where(and(eq(kioskSession.kioskId, d.k.id), isNull(kioskSession.endedAt)));
    await tx.insert(kioskSession).values({ kioskId: d.k.id, credentialId: c.c.id, tokenHash: sha(token), createdAt: now, expiresAt });
    await tx.update(kioskCredential).set({ failedCount: 0, lockedUntil: null, lastUsedAt: now }).where(eq(kioskCredential.id, c.c.id));
    await audit(tx, { orgId: d.k.orgId, action: "kiosk.identified", resourceType: "gym_kiosk", resourceId: d.k.id, meta: { credentialId: c.c.id } });
  });
  return { token, expiresAt, idleSec: KIOSK_IDLE_SEC };
}

async function liveSession(secret: string, token: string, now = new Date()) {
  const d = await device(secret, now);
  if (!token || token.length < 30 || token.length > 100) throw new AccessError("session_over", "La consulta terminó.", 401);
  const [s] = await db.select({ s: kioskSession, c: kioskCredential, m: gymMember }).from(kioskSession)
    .innerJoin(kioskCredential, eq(kioskCredential.id, kioskSession.credentialId)).innerJoin(gymMember, eq(gymMember.id, kioskCredential.gymMemberId))
    .where(and(eq(kioskSession.tokenHash, sha(token)), eq(kioskSession.kioskId, d.k.id), isNull(kioskSession.endedAt), gt(kioskSession.expiresAt, now)));
  if (!s || s.c.revokedAt || s.m.status !== "active" || s.m.orgId !== d.k.orgId) throw new AccessError("session_over", "La consulta terminó.", 401);
  return { d, s };
}

/**
 * Programa vigente del socio identificado, sólo lectura: días, ejercicios, series, repeticiones, descansos, notas del equipo y
 * demostraciones del gimnasio. Sin historial, cargas anteriores, salud, contacto ni apellido.
 */
export async function kioskProgram(secret: string, token: string, now = new Date()) {
  const { d, s } = await liveSession(secret, token, now);
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, s.m.userId));
  const parts = (u?.name ?? "").trim().split(/\s+/);
  const person = { firstName: parts[0] || "Socio", initial: parts[1]?.[0] ? `${parts[1][0].toUpperCase()}.` : "" };
  const base = { person, gym: d.org.name, expiresAt: s.s.expiresAt, idleSec: KIOSK_IDLE_SEC };
  const [a] = await db.select({ a: programAssignment, p: program }).from(programAssignment).innerJoin(program, eq(program.id, programAssignment.programId))
    .where(and(eq(programAssignment.gymMemberId, s.m.id), eq(programAssignment.status, "active")));
  if (!a?.p.currentVersionId) return { ...base, program: null };
  const { version, doc } = await readVersion(a.p.currentVersionId);
  const ids = [...new Set(doc.days.flatMap((x) => x.exercises.map((e) => e.exerciseId)))];
  const media = await mediaFor(d.k.orgId, ids);
  return {
    ...base,
    program: {
      name: doc.name, note: doc.note ?? null, weeks: doc.weeks ?? null, version: version.number, updatedAt: version.createdAt, startsOn: a.a.startsOn,
      days: doc.days.map((day) => ({
        name: day.name,
        exercises: day.exercises.map((e) => {
          const m = media.get(e.exerciseId);
          return {
            name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec ?? null, note: e.note ?? null,
            prescription: prescriptionText({ sets: e.sets, reps: e.reps, rir: e.rir, detail: e.detail ?? null }, { rir: true }),
            demo: m ? (m.kind === "video" ? { kind: "video" as const, url: signMedia(s.s.id, m.url.split("/").pop()!, s.s.expiresAt) } : { kind: "link" as const, url: m.url }) : null,
          };
        }),
      })),
    },
  };
}

export async function kioskEnd(secret: string, token: string, reason: "done" | "idle" = "done") {
  const d = await device(secret);
  if (token) await db.update(kioskSession).set({ endedAt: new Date(), endReason: reason }).where(and(eq(kioskSession.tokenHash, sha(token)), eq(kioskSession.kioskId, d.k.id), isNull(kioskSession.endedAt)));
  return { ok: true };
}

// ── Demostraciones subidas por el gimnasio: URL firmada atada a la consulta ─
const mediaKey = () => createHmac("sha256", requireEnv("BETTER_AUTH_SECRET")).update("repi-kiosk-media-v1").digest();
function signMedia(sessionId: string, mediaId: string, exp: Date) {
  const body = Buffer.from(`${sessionId}.${mediaId}.${exp.getTime()}`).toString("base64url");
  const mac = createHmac("sha256", mediaKey()).update(body).digest("base64url").slice(0, 32);
  return `/api/kiosk/media/${mediaId}?t=${body}.${mac}`;
}
/** Verifica la firma, que la consulta siga abierta y que el video sea un ejercicio del gimnasio de esa pantalla. */
export async function kioskMedia(mediaId: string, t: string, now = new Date()) {
  const [body, mac] = (t ?? "").split(".");
  const ok = body && mac && mac.length === 32 && timingSafeEqual(Buffer.from(mac), Buffer.from(createHmac("sha256", mediaKey()).update(body).digest("base64url").slice(0, 32)));
  if (!ok) throw NOT_FOUND();
  const [sessionId, mid, exp] = Buffer.from(body, "base64url").toString().split(".");
  if (mid !== mediaId || !(Number(exp) > now.getTime())) throw NOT_FOUND();
  const [r] = await db.select({ s: kioskSession, k: gymKiosk, mo: schema.mediaObject }).from(kioskSession).innerJoin(gymKiosk, eq(gymKiosk.id, kioskSession.kioskId))
    .innerJoin(schema.mediaObject, eq(schema.mediaObject.id, mediaId))
    .where(and(eq(kioskSession.id, sessionId), isNull(kioskSession.endedAt), gt(kioskSession.expiresAt, now), isNull(gymKiosk.revokedAt), isNull(schema.mediaObject.deletedAt)));
  if (!r || r.mo.purpose !== "exercise_video" || r.mo.orgId !== r.k.orgId) throw NOT_FOUND();
  return r.mo;
}
