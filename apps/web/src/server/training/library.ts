// Biblioteca de ejercicios (D129): catálogo base global (dominio) y ejercicios propios de cada organización.
// Un ejercicio propio lo crea un coach o alguien del gimnasio con permiso de armar programas; sólo lo ve esa organización.
// D163: un alumno también crea los suyos (`ownerUserId`), que sólo ve él.
import { and, eq, isNull, or } from "drizzle-orm";
import { EXERCISE_CATALOG, EXERCISE_GROUPS, cleanExerciseName, exerciseKey, type ExerciseKind } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { exercise, organization } = schema;

/** D163: el catálogo de REPI (sin organización ni dueño). */
export const catalogOnly = () => and(isNull(exercise.orgId), isNull(exercise.ownerUserId));
/**
 * Biblioteca visible: catálogo, ejercicios propios de la organización y, para un alumno, los que creó él (D163). Sin
 * `userId` (coach, gimnasio, REPI armando programas) nunca aparecen los de los alumnos.
 */
export const visibleIn = (orgId: string, userId?: string | null) => or(catalogOnly(), eq(exercise.orgId, orgId), userId ? eq(exercise.ownerUserId, userId) : undefined);

let seeded: Promise<void> | null = null;
/**
 * Carga el catálogo base si falta algo (una vez por proceso). Idempotente: el índice único (org, nombre) evita duplicados;
 * nunca modifica ni borra ejercicios existentes, porque los programas y las series los referencian.
 */
export function ensureExerciseCatalog(): Promise<void> {
  seeded ??= (async () => {
    const have = await db.select({ name: exercise.name }).from(exercise).where(catalogOnly());
    const keys = new Set(have.map((r) => exerciseKey(r.name)));
    const missing = EXERCISE_CATALOG.filter(([n]) => !keys.has(exerciseKey(n)));
    for (let i = 0; i < missing.length; i += 100) {
      await db.insert(exercise).values(missing.slice(i, i + 100).map(([name, muscleGroup, kind]) => ({ name, muscleGroup, kind }))).onConflictDoNothing();
    }
  })().catch((e) => { seeded = null; throw e; });
  return seeded;
}

const KINDS: ExerciseKind[] = ["load_reps", "bodyweight", "time"];

/**
 * Ejercicio propio de la organización. Si ya existe uno con el mismo nombre (global o propio, sin importar tildes ni
 * mayúsculas) devuelve ese en lugar de duplicarlo. `authorize` lo pasa quien llama (coach o gimnasio) con su propio control.
 */
export async function createOwnExercise(actorId: string, orgId: string, p: { name: string; group: string; kind: string }) {
  const name = cleanExerciseName(p.name);
  if (!name) throw new AccessError("invalid", "Escribí el nombre del ejercicio (2 a 60 caracteres).");
  if (!(EXERCISE_GROUPS as readonly string[]).includes(p.group)) throw new AccessError("invalid", "Elegí el grupo muscular.");
  if (!KINDS.includes(p.kind as ExerciseKind)) throw new AccessError("invalid", "Elegí cómo se registra (peso, peso corporal o tiempo).");
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId));
  if (!org) throw new AccessError("not_found", "No encontramos la organización.", 404);
  await ensureExerciseCatalog();
  const visible = await db.select().from(exercise).where(visibleIn(orgId));
  const same = visible.find((e) => exerciseKey(e.name) === exerciseKey(name));
  if (same) return { id: same.id, name: same.name, group: same.muscleGroup, kind: same.kind, own: same.orgId !== null, existed: true };
  const [row] = await db.insert(exercise).values({ orgId, name, muscleGroup: p.group, kind: p.kind as ExerciseKind }).onConflictDoNothing().returning();
  const e = row ?? (await db.select().from(exercise).where(and(eq(exercise.orgId, orgId), eq(exercise.name, name))))[0];
  await audit(db, { actorUserId: actorId, orgId, action: "exercise.created", resourceType: "exercise", resourceId: e.id, meta: { group: p.group, kind: p.kind } });
  return { id: e.id, name: e.name, group: e.muscleGroup, kind: e.kind, own: true, existed: !row };
}

export const MEMBER_EXERCISES_MAX = 100;
/**
 * D163: el alumno crea un ejercicio que no está en su biblioteca (al armar o subir su rutina). Es sólo suyo: no lo ven otros
 * alumnos ni la biblioteca del coach o del gimnasio. Si ya hay uno con ese nombre a la vista, devuelve ese.
 */
export async function createMemberExercise(userId: string, orgId: string, p: { name: string; group: string; kind: string }) {
  const name = cleanExerciseName(p.name);
  if (!name) throw new AccessError("invalid", "Escribí el nombre del ejercicio (2 a 60 caracteres).");
  if (!(EXERCISE_GROUPS as readonly string[]).includes(p.group)) throw new AccessError("invalid", "Elegí el grupo muscular.");
  if (!KINDS.includes(p.kind as ExerciseKind)) throw new AccessError("invalid", "Elegí cómo se registra (con peso, peso corporal o tiempo).");
  await ensureExerciseCatalog();
  const visible = await db.select().from(exercise).where(visibleIn(orgId, userId));
  const same = visible.find((e) => exerciseKey(e.name) === exerciseKey(name));
  if (same) return { id: same.id, name: same.name, group: same.muscleGroup, kind: same.kind, mine: same.ownerUserId === userId, existed: true };
  if (visible.filter((e) => e.ownerUserId === userId).length >= MEMBER_EXERCISES_MAX) throw new AccessError("invalid", `Podés crear hasta ${MEMBER_EXERCISES_MAX} ejercicios propios.`);
  const [row] = await db.insert(exercise).values({ ownerUserId: userId, name, muscleGroup: p.group, kind: p.kind as ExerciseKind }).onConflictDoNothing().returning();
  const e = row ?? (await db.select().from(exercise).where(and(eq(exercise.ownerUserId, userId), eq(exercise.name, name))))[0];
  await audit(db, { actorUserId: userId, action: "exercise.member_created", resourceType: "exercise", resourceId: e.id, meta: { group: p.group, kind: p.kind } });
  return { id: e.id, name: e.name, group: e.muscleGroup, kind: e.kind, mine: true, existed: !row };
}
