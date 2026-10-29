// «En sala ahora» (D131): los profesores con turno iniciado en la sede, visibles para socios, equipo y gestión. El socio elige
// con quién entrena hoy; esa elección queda en sus sesiones del día y el profesor ve quiénes lo eligieron.
// Es lo que el profesor declaró al iniciar el turno y su disponibilidad: no es ubicación ni presencia comprobada.
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { NOT_FOUND, gymContext, scopedLocations } from "./services";

const { shiftLog, user, gymLocation, gymMember, gymFloorPick, organization } = schema;
/** Un turno que quedó abierto más de esto no cuenta como «en sala» (se olvidaron de cerrarlo). */
const STALE_SHIFT_H = 14;

async function onShift(locationIds: string[], now: Date) {
  if (!locationIds.length) return [];
  return db.select({ userId: shiftLog.userId, name: user.name, locationId: shiftLog.locationId, location: gymLocation.name, availability: shiftLog.availability, since: shiftLog.startedAt })
    .from(shiftLog).innerJoin(user, eq(user.id, shiftLog.userId)).innerJoin(gymLocation, eq(gymLocation.id, shiftLog.locationId))
    .where(and(inArray(shiftLog.locationId, locationIds), isNull(shiftLog.endedAt), gte(shiftLog.startedAt, new Date(now.getTime() - STALE_SHIFT_H * 3_600_000))))
    .orderBy(asc(user.name));
}

/** Socio: profesores en turno en su sede y a quién eligió hoy, por cada gimnasio donde tiene membresía activa. */
export async function myFloor(userId: string, now = new Date()) {
  const day = localDate(now);
  const ms = await db.select({ m: gymMember, org: organization.name, loc: gymLocation.name }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active")));
  const out = [];
  for (const r of ms) {
    const staff = await onShift([r.m.locationId], now);
    const [pick] = await db.select().from(gymFloorPick).where(and(eq(gymFloorPick.gymMemberId, r.m.id), eq(gymFloorPick.day, day)));
    out.push({
      orgId: r.m.orgId, gymMemberId: r.m.id, gym: r.org, location: r.loc,
      trainers: staff.map((s) => ({ id: s.userId, name: s.name, availability: s.availability, since: s.since })),
      pick: pick && staff.some((s) => s.userId === pick.trainerUserId) ? pick.trainerUserId : null,
    });
  }
  return { gyms: out };
}

/** El socio elige (o quita) con quién entrena hoy. Sólo entre los profesores en turno en su sede. */
export async function pickFloorTrainer(userId: string, gymMemberId: string, trainerUserId: string | null, now = new Date()) {
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.userId, userId)));
  if (!m) throw NOT_FOUND();
  if (m.status !== "active") throw new AccessError("relation_inactive", "Tu membresía no está activa.", 403);
  const day = localDate(now);
  if (!trainerUserId) {
    await db.delete(gymFloorPick).where(and(eq(gymFloorPick.gymMemberId, m.id), eq(gymFloorPick.day, day)));
    return { pick: null };
  }
  const staff = await onShift([m.locationId], now);
  const t = staff.find((s) => s.userId === trainerUserId);
  if (!t) throw new AccessError("not_on_shift", "Ese profesor ya no está en turno. Elegí otro de la lista.", 409);
  await db.insert(gymFloorPick).values({ orgId: m.orgId, locationId: m.locationId, gymMemberId: m.id, trainerUserId, day })
    .onConflictDoUpdate({ target: [gymFloorPick.gymMemberId, gymFloorPick.day], set: { trainerUserId, locationId: m.locationId, createdAt: now } });
  return { pick: trainerUserId, name: t.name };
}

/** Profesor elegido hoy por este socio, si sigue en turno (para guardarlo en la sesión que inicia). */
export async function todaysPick(gymMemberId: string, now = new Date()) {
  const [p] = await db.select().from(gymFloorPick).where(and(eq(gymFloorPick.gymMemberId, gymMemberId), eq(gymFloorPick.day, localDate(now))));
  return p?.trainerUserId ?? null;
}

/**
 * Equipo y gestión: quién está en sala en sus sedes, disponible u ocupado, y cuántos socios lo eligieron hoy.
 * El propio profesor ve además los nombres de quienes entrenan con él hoy.
 */
export async function staffFloorNow(actorId: string, orgId: string, locationId: string | null, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  const locs = await scopedLocations(ctx, locationId);
  const staff = await onShift(locs.map((l) => l.id), now);
  const day = localDate(now);
  const picks = staff.length ? await db.select({ p: gymFloorPick, name: user.name }).from(gymFloorPick).innerJoin(gymMember, eq(gymMember.id, gymFloorPick.gymMemberId))
    .innerJoin(user, eq(user.id, gymMember.userId))
    .where(and(eq(gymFloorPick.orgId, orgId), eq(gymFloorPick.day, day), inArray(gymFloorPick.trainerUserId, staff.map((s) => s.userId)))) : [];
  return {
    trainers: staff.map((s) => {
      const mine = picks.filter((x) => x.p.trainerUserId === s.userId);
      return { id: s.userId, name: s.name, location: s.location, locationId: s.locationId, availability: s.availability, since: s.since, members: mine.length, ...(s.userId === actorId ? { memberNames: mine.map((x) => x.name) } : {}) };
    }),
  };
}
