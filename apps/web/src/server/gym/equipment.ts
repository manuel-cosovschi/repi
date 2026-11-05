// D195 · Catálogo de equipamiento por sede (bloque 05/06). Lo administra quien tiene `equipment.manage` en esa sede (dueño,
// gerencia, coordinación); lo consulta también quien arma programas (`program.edit`). Otra sede o gimnasio: 404. Un socio no
// lo edita. No es un inventario financiero ni de mantenimiento: sólo qué cargas existen para que REPI recomiende cargas reales.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { equipmentLadder, gymCan, isEquipmentCategory, validateEquipment, type EquipmentCategory, type LoadLadder } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { visibleIn } from "../training/library";
import { gymContext, inScope, NOT_FOUND, scopedLocation, type GymCtx } from "./services";

const { gymEquipment, gymEquipmentExercise, gymLocation, gymMember, exercise } = schema;
const FORBIDDEN = () => new AccessError("forbidden", "Tu rol no puede cambiar el equipamiento de esta sede.", 403);

export type EquipmentInput = {
  name: string; category: string; code?: string | null; unit: "kg" | "lb"; increment: number | null; perSide: boolean;
  minLoad: number | null; maxLoad: number | null; loads: number[] | null; note?: string | null; exerciseIds: string[];
};

const at = (ctx: GymCtx, locationId: string) => ctx.memberships.filter((m) => m.locationId === null || m.locationId === locationId).map((m) => m.role);
const canManageAt = (ctx: GymCtx, locationId: string) => gymCan(at(ctx, locationId), "equipment.manage");
const canReadAt = (ctx: GymCtx, locationId: string) => canManageAt(ctx, locationId) || gymCan(at(ctx, locationId), "program.edit");

async function readable(actorId: string, orgId: string, locationId?: string | null) {
  const ctx = await gymContext(actorId, orgId);
  const { loc, allowed } = await scopedLocation(ctx, locationId);
  if (!canReadAt(ctx, loc.id)) throw FORBIDDEN();
  return { ctx, loc, allowed };
}

const view = (e: typeof gymEquipment.$inferSelect, exs: { id: string; name: string }[]) => ({
  id: e.id, locationId: e.locationId, name: e.name, category: e.category, code: e.code, unit: e.unit, increment: e.increment, perSide: e.perSide,
  minLoad: e.minLoad, maxLoad: e.maxLoad, loads: e.loads, note: e.note, archivedAt: e.archivedAt, revision: e.revision, exercises: exs,
  ladder: equipmentLadder({ category: e.category as EquipmentCategory, unit: e.unit, increment: e.increment, perSide: e.perSide, minLoad: e.minLoad, maxLoad: e.maxLoad, loads: e.loads ?? null }, e.name),
});

export async function listEquipment(actorId: string, orgId: string, locationId?: string | null, o: { archived?: boolean } = {}) {
  const { ctx, loc, allowed } = await readable(actorId, orgId, locationId);
  const rows = await db.select().from(gymEquipment).where(and(eq(gymEquipment.orgId, orgId), eq(gymEquipment.locationId, loc.id), o.archived ? undefined : isNull(gymEquipment.archivedAt)))
    .orderBy(asc(gymEquipment.category), asc(gymEquipment.name));
  const links = rows.length ? await db.select({ eq: gymEquipmentExercise.equipmentId, id: exercise.id, name: exercise.name }).from(gymEquipmentExercise)
    .innerJoin(exercise, eq(exercise.id, gymEquipmentExercise.exerciseId)).where(inArray(gymEquipmentExercise.equipmentId, rows.map((r) => r.id))).orderBy(asc(exercise.name)) : [];
  return {
    location: { id: loc.id, name: loc.name }, locations: allowed.filter((l) => canReadAt(ctx, l.id)).map((l) => ({ id: l.id, name: l.name })),
    canEdit: canManageAt(ctx, loc.id),
    items: rows.map((r) => view(r, links.filter((l) => l.eq === r.id).map((l) => ({ id: l.id, name: l.name })))),
  };
}

/** Ejercicios que se pueden asociar: catálogo base y propios del gimnasio (nunca los de otra organización ni de un alumno). */
export async function equipmentLibrary(actorId: string, orgId: string, locationId?: string | null) {
  const { ctx, loc } = await readable(actorId, orgId, locationId);
  if (!canManageAt(ctx, loc.id)) throw FORBIDDEN();
  return db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup }).from(exercise).where(and(visibleIn(orgId), isNull(exercise.ownerUserId))).orderBy(asc(exercise.name));
}

function clean(p: EquipmentInput) {
  const errors = validateEquipment(p);
  if (errors.length) throw new AccessError("invalid", errors[0].message, 400, { errors });
  if (!isEquipmentCategory(p.category)) throw new AccessError("invalid", "Elegí el tipo de equipo.");
  const ids = [...new Set(p.exerciseIds)].slice(0, 60);
  return {
    name: p.name.trim().replace(/\s+/g, " "), category: p.category, code: p.code?.trim() || null, unit: p.unit, increment: p.increment, perSide: p.perSide,
    minLoad: p.minLoad, maxLoad: p.maxLoad, loads: p.loads?.length ? [...new Set(p.loads)].sort((a, b) => a - b) : null, note: p.note?.trim().slice(0, 200) || null, ids,
  };
}
async function assertExercises(orgId: string, ids: string[]) {
  if (!ids.length) return;
  const ok = await db.select({ id: exercise.id }).from(exercise).where(and(inArray(exercise.id, ids), visibleIn(orgId), isNull(exercise.ownerUserId)));
  if (ok.length !== ids.length) throw new AccessError("invalid", "Algún ejercicio no está en la biblioteca del gimnasio.");
}
const dupName = (e: unknown): boolean => {
  const x = e as { code?: string; message?: string; cause?: unknown } | null;
  return !!x && (x.code === "23505" || /gym_equipment_name_unique/.test(String(x.message ?? "")) || (x.cause != null && dupName(x.cause)));
};

export async function createEquipment(actorId: string, orgId: string, locationId: string, p: EquipmentInput) {
  const ctx = await gymContext(actorId, orgId);
  const { loc } = await scopedLocation(ctx, locationId);
  if (!canManageAt(ctx, loc.id)) throw FORBIDDEN();
  const c = clean(p);
  await assertExercises(orgId, c.ids);
  try {
    return await db.transaction(async (tx) => {
      const { ids, ...vals } = c;
      const [row] = await tx.insert(gymEquipment).values({ orgId, locationId: loc.id, ...vals, createdBy: actorId }).returning();
      if (ids.length) await tx.insert(gymEquipmentExercise).values(ids.map((exerciseId) => ({ equipmentId: row.id, exerciseId })));
      await audit(tx, { actorUserId: actorId, orgId, action: "gym.equipment.created", resourceType: "gym_equipment", resourceId: row.id, meta: { category: row.category, exercises: ids.length } });
      return { id: row.id, revision: row.revision };
    });
  } catch (e) { if (dupName(e)) throw new AccessError("duplicate", "Ya hay un equipo con ese nombre en esta sede.", 409); throw e; }
}

async function ownEquipment(actorId: string, orgId: string, equipmentId: string) {
  const ctx = await gymContext(actorId, orgId);
  const [row] = await db.select().from(gymEquipment).where(and(eq(gymEquipment.id, equipmentId), eq(gymEquipment.orgId, orgId)));
  if (!row || !inScope(ctx, row.locationId)) throw NOT_FOUND();
  if (!canManageAt(ctx, row.locationId)) throw FORBIDDEN();
  return row;
}

/** Modificar con la revisión que se vio: si otra persona lo cambió mientras tanto, 409 y no se pisa. */
export async function updateEquipment(actorId: string, orgId: string, equipmentId: string, p: EquipmentInput & { revision: number }) {
  const cur = await ownEquipment(actorId, orgId, equipmentId);
  const c = clean(p);
  await assertExercises(orgId, c.ids);
  try {
    return await db.transaction(async (tx) => {
      const { ids, ...vals } = c;
      const [row] = await tx.update(gymEquipment).set({ ...vals, revision: sql`${gymEquipment.revision} + 1`, updatedAt: new Date() })
        .where(and(eq(gymEquipment.id, cur.id), eq(gymEquipment.revision, p.revision))).returning();
      if (!row) throw new AccessError("stale", "Otra persona cambió este equipo mientras lo editabas. Revisá los cambios antes de guardar.", 409);
      await tx.delete(gymEquipmentExercise).where(eq(gymEquipmentExercise.equipmentId, cur.id));
      if (ids.length) await tx.insert(gymEquipmentExercise).values(ids.map((exerciseId) => ({ equipmentId: cur.id, exerciseId })));
      await audit(tx, { actorUserId: actorId, orgId, action: "gym.equipment.updated", resourceType: "gym_equipment", resourceId: cur.id, meta: { exercises: ids.length } });
      return { id: row.id, revision: row.revision };
    });
  } catch (e) { if (dupName(e)) throw new AccessError("duplicate", "Ya hay un equipo con ese nombre en esta sede.", 409); throw e; }
}

/** Archivar (no borra: programas y registros no dependen de él) o volver a usar. */
export async function archiveEquipment(actorId: string, orgId: string, equipmentId: string, archived: boolean) {
  const cur = await ownEquipment(actorId, orgId, equipmentId);
  if (!!cur.archivedAt === archived) return { id: cur.id, archived };
  try {
    await db.update(gymEquipment).set({ archivedAt: archived ? new Date() : null, revision: cur.revision + 1, updatedAt: new Date() }).where(eq(gymEquipment.id, cur.id));
  } catch (e) { if (dupName(e)) throw new AccessError("duplicate", "Ya hay otro equipo activo con ese nombre.", 409); throw e; }
  await audit(db, { actorUserId: actorId, orgId, action: archived ? "gym.equipment.archived" : "gym.equipment.restored", resourceType: "gym_equipment", resourceId: cur.id });
  return { id: cur.id, archived };
}

/**
 * Saltos de carga de la sede del socio para cada ejercicio (lectura interna del motor, sin datos de la persona). Sólo equipos
 * activos de su sede y asociados expresamente a ese ejercicio. Si hay dos equipos distintos para el mismo ejercicio, no se
 * sabe cuál usa: queda desconocido (no se inventa).
 */
export async function laddersForMember(gymMemberId: string | null | undefined, exerciseIds: string[]): Promise<Map<string, LoadLadder>> {
  const out = new Map<string, LoadLadder>();
  const ids = [...new Set(exerciseIds)];
  if (!gymMemberId || !ids.length) return out;
  const [m] = await db.select({ loc: gymMember.locationId, org: gymMember.orgId }).from(gymMember).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId)).where(eq(gymMember.id, gymMemberId));
  if (!m) return out;
  const rows = await db.select({ e: gymEquipment, ex: gymEquipmentExercise.exerciseId }).from(gymEquipmentExercise).innerJoin(gymEquipment, eq(gymEquipment.id, gymEquipmentExercise.equipmentId))
    .where(and(eq(gymEquipment.orgId, m.org), eq(gymEquipment.locationId, m.loc), isNull(gymEquipment.archivedAt), inArray(gymEquipmentExercise.exerciseId, ids)));
  for (const id of ids) {
    const mine = rows.filter((r) => r.ex === id);
    const ladders = mine.map((r) => view(r.e, []).ladder).filter((l) => l.incrementKg || l.loadsKg?.length);
    const same = ladders.length > 0 && ladders.every((l) => JSON.stringify([l.incrementKg, l.loadsKg]) === JSON.stringify([ladders[0].incrementKg, ladders[0].loadsKg]));
    if (same) out.set(id, ladders.length === 1 ? ladders[0] : { ...ladders[0], name: null });
  }
  return out;
}
