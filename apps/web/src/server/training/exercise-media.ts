// D164: videos de cómo se hace cada ejercicio, cargados por el gimnasio (dueño, gerencia y profes que arman programas) o por
// el coach. Uno por ejercicio y organización: un video subido al almacenamiento privado o un enlace a YouTube, TikTok o
// Instagram. Sus socios o alumnos lo ven en el entrenamiento («Ver cómo se hace»).
import { and, asc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { gymCan } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { deleteObject } from "../storage";
import { ensureExerciseCatalog, visibleIn } from "./library";

const { exerciseMedia, exercise, mediaObject, staffMembership, organization, gymMember, coachClient } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

/** Quién carga videos: el coach de esa organización, o en un gimnasio dueño, gerencia y quien arma programas. */
export async function requireMediaManager(actorId: string, orgId: string) {
  const [o] = await db.select({ kind: organization.kind }).from(organization).where(eq(organization.id, orgId));
  if (!o) throw NOT_FOUND();
  const roles = (await db.select({ role: staffMembership.role }).from(staffMembership)
    .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")))).map((r) => r.role);
  const ok = o.kind === "coach" ? roles.includes("coach_owner") : roles.includes("owner") || roles.includes("manager") || gymCan(roles, "program.edit");
  if (!ok) throw NOT_FOUND();
}

/** ¿Puede ver los videos de ejercicios de la organización? Su equipo, sus socios activos y sus alumnos. */
export async function canSeeOrgMedia(userId: string, orgId: string) {
  const [s] = await db.select({ id: staffMembership.id }).from(staffMembership)
    .where(and(eq(staffMembership.userId, userId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"))).limit(1);
  if (s) return true;
  const [m] = await db.select({ id: gymMember.id }).from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.orgId, orgId), eq(gymMember.status, "active"))).limit(1);
  if (m) return true;
  const [c] = await db.select({ id: coachClient.id }).from(coachClient).where(and(eq(coachClient.userId, userId), eq(coachClient.coachOrgId, orgId), inArray(coachClient.status, ["active", "paused"]))).limit(1);
  return !!c;
}

const LINK_HOSTS = /^(www\.|m\.|vm\.)?(youtube\.com|youtu\.be|tiktok\.com|instagram\.com)$/i;
/** Enlace aceptado: https a YouTube, TikTok o Instagram. Devuelve la URL normalizada o null. */
export function cleanVideoLink(raw: string) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || !LINK_HOSTS.test(u.hostname)) return null;
    return u.toString().slice(0, 500);
  } catch { return null; }
}

const view = (r: { mediaId: string | null; url: string | null } | undefined) =>
  !r ? null : r.mediaId ? { kind: "video" as const, url: `/api/media/${r.mediaId}` } : r.url ? { kind: "link" as const, url: r.url } : null;

/** Biblioteca del panel con el estado de cada ejercicio (con video o no). `q` filtra por nombre; `only` muestra sólo los que tienen. */
export async function listExerciseMedia(actorId: string, orgId: string, p: { q?: string; only?: boolean } = {}) {
  await requireMediaManager(actorId, orgId);
  await ensureExerciseCatalog();
  const media = await db.select().from(exerciseMedia).where(eq(exerciseMedia.orgId, orgId));
  const byEx = new Map(media.map((m) => [m.exerciseId, m]));
  const q = p.q?.trim().slice(0, 60);
  const rows = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup }).from(exercise)
    .where(and(visibleIn(orgId), q ? ilike(exercise.name, `%${q}%`) : undefined, p.only ? inArray(exercise.id, media.length ? [...byEx.keys()] : [""]) : undefined))
    .orderBy(asc(exercise.name)).limit(80);
  return { total: media.length, exercises: rows.map((r) => ({ ...r, media: view(byEx.get(r.id)) })) };
}

async function upsert(actorId: string, orgId: string, exerciseId: string, v: { mediaId: string | null; url: string | null }) {
  const [ex] = await db.select({ id: exercise.id }).from(exercise).where(and(eq(exercise.id, exerciseId), visibleIn(orgId)));
  if (!ex) throw new AccessError("invalid", "Ese ejercicio no está en tu biblioteca.");
  const [old] = await db.select().from(exerciseMedia).where(and(eq(exerciseMedia.orgId, orgId), eq(exerciseMedia.exerciseId, exerciseId)));
  const now = new Date();
  await db.insert(exerciseMedia).values({ orgId, exerciseId, ...v, createdBy: actorId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [exerciseMedia.orgId, exerciseMedia.exerciseId], set: { ...v, createdBy: actorId, updatedAt: now } });
  if (old?.mediaId && old.mediaId !== v.mediaId) await dropMedia(old.mediaId);
  await audit(db, { actorUserId: actorId, orgId, action: "exercise_media.set", resourceType: "exercise", resourceId: exerciseId, meta: { kind: v.mediaId ? "video" : "link" } });
}
async function dropMedia(mediaId: string) {
  const [m] = await db.update(mediaObject).set({ deletedAt: new Date() }).where(and(eq(mediaObject.id, mediaId), isNull(mediaObject.deletedAt))).returning();
  if (m) await deleteObject(m.storageKey).catch(() => {}); // si falla, el registro queda marcado y el archivo sin referencia
}

export async function setExerciseLink(actorId: string, orgId: string, exerciseId: string, raw: string) {
  await requireMediaManager(actorId, orgId);
  const url = cleanVideoLink(raw);
  if (!url) throw new AccessError("invalid", "Pegá un enlace de YouTube, TikTok o Instagram (que empiece con https://).");
  await upsert(actorId, orgId, exerciseId, { mediaId: null, url });
  return { media: view({ mediaId: null, url }) };
}

export async function setExerciseUpload(actorId: string, orgId: string, exerciseId: string, mediaId: string) {
  await requireMediaManager(actorId, orgId);
  const [m] = await db.select().from(mediaObject).where(and(eq(mediaObject.id, mediaId), isNull(mediaObject.deletedAt)));
  if (!m || m.purpose !== "exercise_video" || m.orgId !== orgId) throw NOT_FOUND();
  await upsert(actorId, orgId, exerciseId, { mediaId, url: null });
  return { media: view({ mediaId, url: null }) };
}

export async function removeExerciseMedia(actorId: string, orgId: string, exerciseId: string) {
  await requireMediaManager(actorId, orgId);
  const [old] = await db.delete(exerciseMedia).where(and(eq(exerciseMedia.orgId, orgId), eq(exerciseMedia.exerciseId, exerciseId))).returning();
  if (!old) throw NOT_FOUND();
  if (old.mediaId) await dropMedia(old.mediaId);
  await audit(db, { actorUserId: actorId, orgId, action: "exercise_media.removed", resourceType: "exercise", resourceId: exerciseId });
  return { ok: true };
}

/** Para el entrenamiento: video o enlace de cada ejercicio en la organización de la sesión. */
export async function mediaFor(orgId: string, exerciseIds: string[]) {
  if (!exerciseIds.length) return new Map<string, NonNullable<ReturnType<typeof view>>>();
  const rows = await db.select().from(exerciseMedia).where(and(eq(exerciseMedia.orgId, orgId), inArray(exerciseMedia.exerciseId, exerciseIds)));
  return new Map(rows.map((r) => [r.exerciseId, view(r)!]));
}
