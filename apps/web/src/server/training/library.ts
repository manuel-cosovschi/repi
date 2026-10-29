// Biblioteca de ejercicios (D129): catálogo base global (dominio) y ejercicios propios de cada organización.
// Un ejercicio propio lo crea un coach o alguien del gimnasio con permiso de armar programas; sólo lo ve esa organización.
import { and, eq, isNull, or } from "drizzle-orm";
import { EXERCISE_CATALOG, EXERCISE_GROUPS, cleanExerciseName, exerciseKey, type ExerciseKind } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { exercise, organization } = schema;

let seeded: Promise<void> | null = null;
/**
 * Carga el catálogo base si falta algo (una vez por proceso). Idempotente: el índice único (org, nombre) evita duplicados;
 * nunca modifica ni borra ejercicios existentes, porque los programas y las series los referencian.
 */
export function ensureExerciseCatalog(): Promise<void> {
  seeded ??= (async () => {
    const have = await db.select({ name: exercise.name }).from(exercise).where(isNull(exercise.orgId));
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
  const visible = await db.select().from(exercise).where(or(isNull(exercise.orgId), eq(exercise.orgId, orgId)));
  const same = visible.find((e) => exerciseKey(e.name) === exerciseKey(name));
  if (same) return { id: same.id, name: same.name, group: same.muscleGroup, kind: same.kind, own: same.orgId !== null, existed: true };
  const [row] = await db.insert(exercise).values({ orgId, name, muscleGroup: p.group, kind: p.kind as ExerciseKind }).onConflictDoNothing().returning();
  const e = row ?? (await db.select().from(exercise).where(and(eq(exercise.orgId, orgId), eq(exercise.name, name))))[0];
  await audit(db, { actorUserId: actorId, orgId, action: "exercise.created", resourceType: "exercise", resourceId: e.id, meta: { group: p.group, kind: p.kind } });
  return { id: e.id, name: e.name, group: e.muscleGroup, kind: e.kind, own: true, existed: !row };
}
