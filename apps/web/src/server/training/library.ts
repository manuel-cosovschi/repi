// Biblioteca de ejercicios (D129): catálogo base global (dominio) y ejercicios propios de cada organización.
// Un ejercicio propio lo crea un coach o alguien del gimnasio con permiso de armar programas; sólo lo ve esa organización.
// D163: un alumno también crea los suyos (`ownerUserId`), que sólo ve él.
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  EXERCISE_CATALOG, EXERCISE_GROUPS, activityOf, cleanExerciseName, exerciseKey, isActivityProfile, isMetricsProfile, kindOfProfile, profileOf, type ActivityProfile, type ExerciseKind, type MetricsProfile,
} from "@repi/domain";
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
 * nunca modifica ni borra ejercicios existentes, porque los programas y las series los referencian. Las filas nuevas llevan su
 * perfil de métricas (cuarto valor del catálogo); las existentes lo recibieron por nombre en la migración 0052.
 */
export function ensureExerciseCatalog(): Promise<void> {
  seeded ??= (async () => {
    const have = await db.select({ name: exercise.name }).from(exercise).where(catalogOnly());
    const keys = new Set(have.map((r) => exerciseKey(r.name)));
    const missing = EXERCISE_CATALOG.filter(([n]) => !keys.has(exerciseKey(n)));
    for (let i = 0; i < missing.length; i += 100) {
      await db.insert(exercise).values(missing.slice(i, i + 100).map(([name, muscleGroup, kind, metricsProfile]) => ({ name, muscleGroup, kind, metricsProfile }))).onConflictDoNothing();
    }
  })().catch((e) => { seeded = null; throw e; });
  return seeded;
}

const KINDS: ExerciseKind[] = ["load_reps", "bodyweight", "time"];

/** Columnas de la biblioteca: el perfil sale resuelto (guardado → catálogo → nombre → tipo), nunca null. */
export const libraryCols = { id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, metricsProfile: exercise.metricsProfile };
type LibRow = { id: string; name: string; group: string; kind: ExerciseKind; metricsProfile: string | null };
/** Fila de la biblioteca para las pantallas: `profile` es el perfil resuelto (qué se configura y qué se registra). */
export const withProfile = <T extends LibRow>({ metricsProfile, ...r }: T) => ({ ...r, profile: profileOf({ metricsProfile, name: r.name, kind: r.kind, muscleGroup: r.group }) });

/**
 * Ejercicios por tiempo (07/11/2026): tipo de registro y perfil de un ejercicio nuevo. Con `profile` (cinta, bici, remo,
 * elíptico, escaladora, sólo duración, aguante, peso corporal o peso y repeticiones), el tipo de registro sale del perfil; sin
 * él (una app anterior), como siempre: el tipo elegido y el perfil queda sin guardar (se deduce del nombre y del tipo).
 */
function kindAndProfile(p: { kind?: string | null; profile?: string | null }, msg: string): { kind: ExerciseKind; metricsProfile: MetricsProfile | null } {
  if (p.profile != null && p.profile !== "") {
    if (!isMetricsProfile(p.profile)) throw new AccessError("invalid", "Elegí qué se configura (peso y repeticiones, peso corporal, segundos, cinta, bici, remo, elíptico, escaladora o sólo duración).");
    return { kind: kindOfProfile(p.profile), metricsProfile: p.profile };
  }
  if (!KINDS.includes(p.kind as ExerciseKind)) throw new AccessError("invalid", msg);
  return { kind: p.kind as ExerciseKind, metricsProfile: null };
}
type NewExercise = { name: string; group: string; kind?: string | null; profile?: string | null };

/**
 * Ejercicio propio de la organización. Si ya existe uno con el mismo nombre (global o propio, sin importar tildes ni
 * mayúsculas) devuelve ese en lugar de duplicarlo. `authorize` lo pasa quien llama (coach o gimnasio) con su propio control.
 */
export async function createOwnExercise(actorId: string, orgId: string, p: NewExercise) {
  const name = cleanExerciseName(p.name);
  if (!name) throw new AccessError("invalid", "Escribí el nombre del ejercicio (2 a 60 caracteres).");
  if (!(EXERCISE_GROUPS as readonly string[]).includes(p.group)) throw new AccessError("invalid", "Elegí el grupo muscular.");
  const { kind, metricsProfile } = kindAndProfile(p, "Elegí cómo se registra (peso, peso corporal o tiempo).");
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId));
  if (!org) throw new AccessError("not_found", "No encontramos la organización.", 404);
  await ensureExerciseCatalog();
  const visible = await db.select().from(exercise).where(visibleIn(orgId));
  const same = visible.find((e) => exerciseKey(e.name) === exerciseKey(name));
  if (same) return { ...withProfile({ id: same.id, name: same.name, group: same.muscleGroup, kind: same.kind, metricsProfile: same.metricsProfile }), own: same.orgId !== null, existed: true };
  const [row] = await db.insert(exercise).values({ orgId, name, muscleGroup: p.group, kind, metricsProfile }).onConflictDoNothing().returning();
  const e = row ?? (await db.select().from(exercise).where(and(eq(exercise.orgId, orgId), eq(exercise.name, name))))[0];
  await audit(db, { actorUserId: actorId, orgId, action: "exercise.created", resourceType: "exercise", resourceId: e.id, meta: { group: p.group, kind, profile: metricsProfile } });
  return { ...withProfile({ id: e.id, name: e.name, group: e.muscleGroup, kind: e.kind, metricsProfile: e.metricsProfile }), own: true, existed: !row };
}

export const MEMBER_EXERCISES_MAX = 100;
/**
 * D163: el alumno crea un ejercicio que no está en su biblioteca (al armar o subir su rutina). Es sólo suyo: no lo ven otros
 * alumnos ni la biblioteca del coach o del gimnasio. Si ya hay uno con ese nombre a la vista, devuelve ese.
 */
export async function createMemberExercise(userId: string, orgId: string, p: NewExercise) {
  const name = cleanExerciseName(p.name);
  if (!name) throw new AccessError("invalid", "Escribí el nombre del ejercicio (2 a 60 caracteres).");
  if (!(EXERCISE_GROUPS as readonly string[]).includes(p.group)) throw new AccessError("invalid", "Elegí el grupo muscular.");
  const { kind, metricsProfile } = kindAndProfile(p, "Elegí cómo se registra (con peso, peso corporal o tiempo).");
  await ensureExerciseCatalog();
  const visible = await db.select().from(exercise).where(visibleIn(orgId, userId));
  const same = visible.find((e) => exerciseKey(e.name) === exerciseKey(name));
  if (same) return { ...withProfile({ id: same.id, name: same.name, group: same.muscleGroup, kind: same.kind, metricsProfile: same.metricsProfile }), mine: same.ownerUserId === userId, existed: true };
  if (visible.filter((e) => e.ownerUserId === userId).length >= MEMBER_EXERCISES_MAX) throw new AccessError("invalid", `Podés crear hasta ${MEMBER_EXERCISES_MAX} ejercicios propios.`);
  const [row] = await db.insert(exercise).values({ ownerUserId: userId, name, muscleGroup: p.group, kind, metricsProfile }).onConflictDoNothing().returning();
  const e = row ?? (await db.select().from(exercise).where(and(eq(exercise.ownerUserId, userId), eq(exercise.name, name))))[0];
  await audit(db, { actorUserId: userId, action: "exercise.member_created", resourceType: "exercise", resourceId: e.id, meta: { group: p.group, kind, profile: metricsProfile } });
  return { ...withProfile({ id: e.id, name: e.name, group: e.muscleGroup, kind: e.kind, metricsProfile: e.metricsProfile }), mine: true, existed: !row };
}

/**
 * Ejercicios por tiempo: perfil resuelto de varios ejercicios (guardado → catálogo → nombre → tipo), para la sesión, el registro
 * y Training Intelligence. Ids que no existen no aparecen.
 */
export async function exerciseProfiles(ids: Iterable<string>, q: Pick<typeof db, "select"> = db): Promise<Map<string, MetricsProfile>> {
  const list = [...new Set(ids)];
  if (!list.length) return new Map();
  const rows = await q.select(libraryCols).from(exercise).where(inArray(exercise.id, list));
  return new Map(rows.map((r) => [r.id, withProfile(r).profile]));
}

/**
 * Perfil con que se configura y registra una fila de la sesión. Sin reemplazo, manda la actividad indicada por el profe
 * (`detail.activity`); si no la hay, el perfil del ejercicio (una cinta indicada como «20 min» antes de esta versión también
 * registra velocidad e inclinación). Con reemplazo, el del ejercicio que realmente se hace (una bici en lugar de la cinta).
 */
export function rowProfile(pe: { exerciseId: string; detail?: unknown }, doing: string, profiles: Map<string, MetricsProfile>): MetricsProfile {
  if (doing === pe.exerciseId) { const a = activityOf(pe.detail as { activity?: unknown } | null); if (a) return a.profile; }
  return profiles.get(doing) ?? profiles.get(pe.exerciseId) ?? "strength";
}
/** Perfil de métricas de una fila sólo si es una actividad (cinta, bici, remo…); si no, no se guardan métricas. */
export const metricsProfileOf = (p: MetricsProfile): ActivityProfile | null => (isActivityProfile(p) ? p : null);
