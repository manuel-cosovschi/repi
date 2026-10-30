// D158: «Mis rutinas». El alumno arma y guarda sus propias rutinas con ejercicios de la biblioteca (catálogo de REPI y los
// propios de su coach o gimnasio) y las entrena cuando quiere, tenga o no programa asignado. Al empezar se crea una sesión
// como la de D153: registra pesos, repeticiones, RIR, sensación y notas por serie, y el esfuerzo y la nota de la sesión.
// Las rutinas son sólo del alumno; lo que entrena queda en su historial como cualquier sesión.
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { ensureExerciseCatalog } from "./library";
import { lastSetByExercise, myActive, startSoloRoutine } from "./services";

const { ownRoutine, exercise } = schema;
export const OWN_ROUTINES_MAX = 30;
export const OWN_ROUTINE_EXERCISES_MAX = 12; // el mismo tope que la sesión sin programa (D153)

export type OwnRoutineEx = { exerciseId: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null };
type Input = { id?: string | null; name: string; exercises: OwnRoutineEx[] };

const NOT_FOUND = () => new AccessError("not_found", "No encontramos esa rutina.", 404);

async function relationOrg(userId: string) {
  const act = await myActive(userId);
  if (!act) throw new AccessError("no_relation", "Para entrenar con REPI necesitás estar con un coach o un gimnasio.", 409);
  return act.orgId;
}

/** Biblioteca para armar la rutina: catálogo de REPI y ejercicios propios de la organización con la que entrena. */
export async function myExerciseLibrary(userId: string) {
  const orgId = await relationOrg(userId);
  await ensureExerciseCatalog();
  const rows = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind }).from(exercise)
    .where(or(isNull(exercise.orgId), eq(exercise.orgId, orgId)));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function clean(p: Input): Input {
  const name = p.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) throw new AccessError("invalid", "Ponele un nombre a la rutina (por ejemplo «Día A · piernas»).");
  if (!p.exercises.length) throw new AccessError("invalid", "Agregá al menos un ejercicio.");
  if (p.exercises.length > OWN_ROUTINE_EXERCISES_MAX) throw new AccessError("invalid", `Una rutina puede tener hasta ${OWN_ROUTINE_EXERCISES_MAX} ejercicios.`);
  const exercises = p.exercises.map((e) => {
    if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 10) throw new AccessError("invalid", "Cada ejercicio va con 1 a 10 series.");
    const reps = e.reps.trim();
    if (!reps || reps.length > 20) throw new AccessError("invalid", "Revisá las repeticiones (por ejemplo «10» o «8-12»).");
    if (e.weightKg != null && (!Number.isFinite(e.weightKg) || e.weightKg < 0 || e.weightKg > 500)) throw new AccessError("invalid", "El peso va de 0 a 500 kg.");
    const restSec = e.restSec != null && Number.isInteger(e.restSec) && e.restSec >= 0 && e.restSec <= 600 ? e.restSec : null;
    return { exerciseId: e.exerciseId, sets: e.sets, reps, weightKg: e.weightKg ? Math.round(e.weightKg * 100) / 100 : null, restSec, note: e.note?.trim().slice(0, 120) || null };
  });
  return { id: p.id, name, exercises };
}

/** Mis rutinas, con el nombre actual de cada ejercicio y la última vez que hice cada uno. */
export async function listOwnRoutines(userId: string) {
  const rows = await db.select().from(ownRoutine).where(eq(ownRoutine.userId, userId)).orderBy(desc(ownRoutine.lastUsedAt), desc(ownRoutine.updatedAt));
  const ids = [...new Set(rows.flatMap((r) => r.exercises.map((e) => e.exerciseId)))];
  const [lib, prev] = await Promise.all([
    ids.length ? db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind }).from(exercise).where(inArray(exercise.id, ids)) : [],
    lastSetByExercise(userId, ids),
  ]);
  const byId = new Map(lib.map((e) => [e.id, e]));
  return rows.map((r) => ({
    id: r.id, name: r.name, updatedAt: r.updatedAt, lastUsedAt: r.lastUsedAt,
    exercises: r.exercises.map((e) => {
      const x = byId.get(e.exerciseId);
      const pv = prev.get(e.exerciseId);
      return { ...e, name: x?.name ?? "Ejercicio que ya no está", group: x?.group ?? "", kind: x?.kind ?? "load_reps", prev: pv ? { weightKg: pv.weightKg, reps: pv.reps } : null };
    }),
  }));
}

export async function saveOwnRoutine(userId: string, p: Input) {
  const orgId = await relationOrg(userId);
  const c = clean(p);
  await ensureExerciseCatalog();
  const ids = [...new Set(c.exercises.map((e) => e.exerciseId))];
  const lib = await db.select({ id: exercise.id }).from(exercise).where(and(inArray(exercise.id, ids), or(isNull(exercise.orgId), eq(exercise.orgId, orgId))));
  if (lib.length !== ids.length) throw new AccessError("invalid", "Hay ejercicios que no están en tu biblioteca.");
  const now = new Date();
  if (c.id) {
    const [r] = await db.update(ownRoutine).set({ name: c.name, exercises: c.exercises, updatedAt: now })
      .where(and(eq(ownRoutine.id, c.id), eq(ownRoutine.userId, userId))).returning();
    if (!r) throw NOT_FOUND();
    await audit(db, { actorUserId: userId, action: "own_routine.updated", resourceType: "own_routine", resourceId: r.id, meta: { exercises: c.exercises.length } });
    return { id: r.id };
  }
  const mine = await db.select({ id: ownRoutine.id }).from(ownRoutine).where(eq(ownRoutine.userId, userId));
  if (mine.length >= OWN_ROUTINES_MAX) throw new AccessError("invalid", `Podés guardar hasta ${OWN_ROUTINES_MAX} rutinas. Borrá alguna que ya no uses.`);
  const [r] = await db.insert(ownRoutine).values({ userId, name: c.name, exercises: c.exercises, createdAt: now, updatedAt: now }).returning();
  await audit(db, { actorUserId: userId, action: "own_routine.created", resourceType: "own_routine", resourceId: r.id, meta: { exercises: c.exercises.length } });
  return { id: r.id };
}

export async function deleteOwnRoutine(userId: string, id: string) {
  const r = await db.delete(ownRoutine).where(and(eq(ownRoutine.id, id), eq(ownRoutine.userId, userId))).returning({ id: ownRoutine.id });
  if (!r.length) throw NOT_FOUND();
  await audit(db, { actorUserId: userId, action: "own_routine.deleted", resourceType: "own_routine", resourceId: id });
  return { ok: true };
}

/** Empieza una rutina propia: crea la sesión (idempotente por `sessionId`) y la marca como usada. */
export async function startOwnRoutine(userId: string, routineId: string, sessionId: string, now = new Date()) {
  const [r] = await db.select().from(ownRoutine).where(and(eq(ownRoutine.id, routineId), eq(ownRoutine.userId, userId)));
  if (!r) throw NOT_FOUND();
  const s = await startSoloRoutine(userId, { id: sessionId, dayName: r.name, source: "own", exercises: r.exercises }, now);
  await db.update(ownRoutine).set({ lastUsedAt: now }).where(eq(ownRoutine.id, r.id));
  return s;
}
