// D158: «Mis rutinas». El alumno arma y guarda sus propias rutinas con ejercicios de la biblioteca (catálogo de REPI y los
// propios de su coach o gimnasio) y las entrena cuando quiere, tenga o no programa asignado. Al empezar se crea una sesión
// como la de D153: registra pesos, repeticiones, RIR, sensación y notas por serie, y el esfuerzo y la nota de la sesión.
// Las rutinas son sólo del alumno; lo que entrena queda en su historial como cualquier sesión.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { activityOf, alignActivities, circuitIssues, droppedActivity, mainSets, validateActivity, validateDetail, IMPORT_FILES, IMPORT_SOURCES, type ExerciseDetail, type ImportField, type ImportOrigin, type ImportOriginExercise } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { createMemberExercise, ensureExerciseCatalog, exerciseProfiles, libraryCols, visibleIn, withProfile } from "./library";
import { buildPreview, readImport, splitLongDays, type ImportInput } from "./program-import";
import { lastSetByExercise, myActive, startSoloRoutine } from "./services";
import { assertMemberAuthoring, type MemberAuthoring } from "../gym/routine-policy";

const { ownRoutine, exercise } = schema;
export const OWN_ROUTINES_MAX = 30;
export const OWN_ROUTINE_EXERCISES_MAX = 12; // el mismo tope que la sesión sin programa (D153)

// D184: `detail` (opcional) es el mismo ExerciseDetail del programa del coach: técnica, plan con etapas conectadas, superserie o
// circuito. Con plan, `sets` son las filas registrables (series + etapas, como program_exercise.sets).
export type OwnRoutineEx = { exerciseId: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null; detail?: ExerciseDetail | null };
type Input = { id?: string | null; name: string; exercises: OwnRoutineEx[] };

const NOT_FOUND = () => new AccessError("not_found", "No encontramos esa rutina.", 404);

async function relationOrg(userId: string, authoring?: MemberAuthoring) {
  const act = await myActive(userId);
  if (!act) throw new AccessError("no_relation", "Para entrenar con REPI necesitás estar con un coach o un gimnasio.", 409);
  // REPI Control (D213): en un gimnasio supervisado el socio no crea, importa ni edita rutinas propias (ni ejercicios propios).
  if (authoring) await assertMemberAuthoring(userId, act, authoring);
  return act.orgId;
}

/** D163: ejercicio propio del alumno (lo que no encuentra en la biblioteca). */
export async function createMyExercise(userId: string, p: { name: string; group: string; kind?: string | null; profile?: string | null }) {
  return createMemberExercise(userId, await relationOrg(userId, "member_exercise"), p);
}

/** Biblioteca para armar la rutina: catálogo de REPI y ejercicios propios de la organización con la que entrena. */
export async function myExerciseLibrary(userId: string) {
  const orgId = await relationOrg(userId);
  await ensureExerciseCatalog();
  const rows = await db.select({ ...libraryCols, mine: sql<boolean>`${exercise.ownerUserId} is not null` }).from(exercise)
    .where(visibleIn(orgId, userId));
  return rows.map(withProfile).sort((a, b) => a.name.localeCompare(b.name, "es")); // con el perfil resuelto (cinta, bici, remo…)
}

function clean(p: Input): Input {
  const name = p.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) throw new AccessError("invalid", "Ponele un nombre a la rutina (por ejemplo «Día A · piernas»).");
  if (!p.exercises.length) throw new AccessError("invalid", "Agregá al menos un ejercicio.");
  if (p.exercises.length > OWN_ROUTINE_EXERCISES_MAX) throw new AccessError("invalid", `Una rutina puede tener hasta ${OWN_ROUTINE_EXERCISES_MAX} ejercicios.`);
  const exercises = p.exercises.map((e) => {
    const reps = e.reps.trim();
    if (!reps || reps.length > 20) throw new AccessError("invalid", "Revisá las repeticiones (por ejemplo «10» o «8-12»).");
    if (e.weightKg != null && (!Number.isFinite(e.weightKg) || e.weightKg < 0 || e.weightKg > 500)) throw new AccessError("invalid", "El peso va de 0 a 500 kg.");
    const restSec = e.restSec != null && Number.isInteger(e.restSec) && e.restSec >= 0 && e.restSec <= 600 ? e.restSec : null;
    const { detail, sets } = ownDetail({ ...e, reps });
    // Ejercicios por tiempo: una actividad (cinta, bici…) no lleva peso.
    const weightKg = e.weightKg && !detail?.activity ? Math.round(e.weightKg * 100) / 100 : null;
    return { exerciseId: e.exerciseId, sets, reps, weightKg, restSec, note: e.note?.trim().slice(0, 120) || null, ...(detail ? { detail } : {}) };
  });
  return { id: p.id, name, exercises };
}

/**
 * D184: el mismo validador que el programa del coach (validateDetail): series principales de 1 a 10, hasta 40 filas con sus
 * etapas. Sin plan, «N series × reps» como siempre.
 */
export function ownDetail(e: { sets: number; reps?: string | null; detail?: ExerciseDetail | null }): { detail: ExerciseDetail | null; sets: number } {
  // Ejercicios por tiempo: con las repeticiones, una actividad (cinta, bici…) valida también su duración (hasta 4 horas).
  const v = validateDetail(e.detail ?? null, e.sets, e.reps ?? null);
  if (!v.ok) throw new AccessError("invalid", v.error);
  const main = mainSets(v.detail, v.sets);
  if (!Number.isInteger(v.sets) || v.sets < 1 || main < 1 || main > 10) throw new AccessError("invalid", "Cada ejercicio va con 1 a 10 series.");
  return { detail: v.detail, sets: v.sets };
}

/**
 * Ejercicios por tiempo: la actividad de cada ejercicio en el perfil de su ejercicio (respaldo de lo que arma la pantalla o la
 * importación: una cinta nunca queda como «sólo duración», ni un ejercicio de musculación con una actividad).
 */
async function alignOwn(exs: OwnRoutineEx[], names: Map<string, string>): Promise<OwnRoutineEx[]> {
  if (!exs.some((e) => activityOf(e.detail))) return exs;
  const r = alignActivities(exs.map((e) => ({ ...e, name: names.get(e.exerciseId) ?? null })), await exerciseProfiles(exs.map((e) => e.exerciseId)));
  if (!r.ok) throw new AccessError("invalid", r.error);
  return r.rows.map(({ name: _n, ...e }) => e as OwnRoutineEx);
}

/** D184: en una superserie o circuito las vueltas gobiernan: cada ejercicio con una serie por vuelta (como en el programa). */
function assertCircuits(exs: { name: string; sets: number; reps: string; detail?: ExerciseDetail | null }[]) {
  const bad = circuitIssues(exs)[0];
  if (bad) throw new AccessError("invalid", `El circuito ${bad.group} tiene ${bad.rounds} ${bad.rounds === 1 ? "vuelta" : "vueltas"}, pero ${bad.exercise} tiene ${bad.blocks} ${bad.blocks === 1 ? "serie" : "series"}. Igualalas en «Series y técnica».`);
}

/**
 * Mis rutinas en el orden en que se cargaron (como los días de un programa: Día A, Día B…), con el nombre actual de cada
 * ejercicio y la última vez que hice cada uno. D162: `next` marca la que toca hoy, la siguiente a la última que entrené.
 */
export async function listOwnRoutines(userId: string) {
  const rows = await db.select().from(ownRoutine).where(eq(ownRoutine.userId, userId)).orderBy(asc(ownRoutine.createdAt), asc(ownRoutine.name));
  const used = rows.reduce((b, r, i) => (r.lastUsedAt && (b < 0 || r.lastUsedAt > rows[b].lastUsedAt!) ? i : b), -1);
  const nextIdx = rows.length ? (used + 1) % rows.length : -1;
  const ids = [...new Set(rows.flatMap((r) => r.exercises.map((e) => e.exerciseId)))];
  const [lib, prev] = await Promise.all([
    ids.length ? db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind }).from(exercise).where(inArray(exercise.id, ids)) : [],
    lastSetByExercise(userId, ids),
  ]);
  const byId = new Map(lib.map((e) => [e.id, e]));
  return rows.map((r, i) => ({
    id: r.id, name: r.name, updatedAt: r.updatedAt, lastUsedAt: r.lastUsedAt, next: i === nextIdx, imported: r.origin?.kind === "import",
    exercises: (r.exercises as OwnRoutineEx[]).map((e) => {
      const x = byId.get(e.exerciseId);
      const pv = prev.get(e.exerciseId);
      return { ...e, name: x?.name ?? "Ejercicio que ya no está", group: x?.group ?? "", kind: x?.kind ?? "load_reps", prev: pv ? { weightKg: pv.weightKg, reps: pv.reps } : null };
    }),
  }));
}

export async function saveOwnRoutine(userId: string, p: Input) {
  const orgId = await relationOrg(userId, "own_routine");
  const c = clean(p);
  await ensureExerciseCatalog();
  const ids = [...new Set(c.exercises.map((e) => e.exerciseId))];
  const lib = await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(and(inArray(exercise.id, ids), visibleIn(orgId, userId)));
  if (lib.length !== ids.length) throw new AccessError("invalid", "Hay ejercicios que no están en tu biblioteca.");
  assertCircuits(c.exercises.map((e) => ({ ...e, name: lib.find((x) => x.id === e.exerciseId)!.name })));
  const names = new Map(lib.map((x) => [x.id, x.name]));
  c.exercises = await alignOwn(c.exercises, names);
  const now = new Date();
  if (c.id) {
    // Una app anterior en caché no borra la velocidad ni la inclinación sin aviso: pide actualizar.
    const [old] = await db.select({ exercises: ownRoutine.exercises }).from(ownRoutine).where(and(eq(ownRoutine.id, c.id), eq(ownRoutine.userId, userId)));
    const lost = old ? droppedActivity(old.exercises as OwnRoutineEx[], c.exercises) : null;
    if (lost) throw new AccessError("outdated_app", `Actualizá REPI (recargá la página) para editar «${names.get(lost.exerciseId) ?? "este ejercicio"}»: esta versión no guarda su configuración por duración.`, 409);
    const [r] = await db.update(ownRoutine).set({ name: c.name, exercises: c.exercises, updatedAt: now })
      .where(and(eq(ownRoutine.id, c.id), eq(ownRoutine.userId, userId))).returning();
    if (!r) throw NOT_FOUND();
    await audit(db, { actorUserId: userId, action: "own_routine.updated", resourceType: "own_routine", resourceId: r.id, meta: { exercises: c.exercises.length, methods: c.exercises.filter((e) => e.detail).length } });
    return { id: r.id };
  }
  // FSA1: el tope se cuenta con el mismo lock por persona que la importación: dos «Guardar» o «Duplicar» a la vez (o una
  // importación en curso) no pasan de OWN_ROUTINES_MAX.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`own-routine-import:${userId}`}))`);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(ownRoutine).where(eq(ownRoutine.userId, userId));
    if (n >= OWN_ROUTINES_MAX) throw new AccessError("invalid", `Podés guardar hasta ${OWN_ROUTINES_MAX} rutinas. Borrá alguna que ya no uses.`);
    const [r] = await tx.insert(ownRoutine).values({ userId, name: c.name, exercises: c.exercises, createdAt: now, updatedAt: now }).returning();
    await audit(tx, { actorUserId: userId, action: "own_routine.created", resourceType: "own_routine", resourceId: r.id, meta: { exercises: c.exercises.length, methods: c.exercises.filter((e) => e.detail).length } });
    return { id: r.id };
  });
}

/** D184: duplicar una rutina propia (con sus métodos y etapas, que conservan su identidad dentro de la copia). */
export async function duplicateOwnRoutine(userId: string, id: string) {
  const [r] = await db.select().from(ownRoutine).where(and(eq(ownRoutine.id, id), eq(ownRoutine.userId, userId)));
  if (!r) throw NOT_FOUND();
  return saveOwnRoutine(userId, { name: `${r.name} (copia)`.slice(0, 60), exercises: r.exercises as OwnRoutineEx[] });
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
  const s = await startSoloRoutine(userId, { id: sessionId, dayName: r.name, source: "own", exercises: r.exercises as OwnRoutineEx[] }, now);
  await db.update(ownRoutine).set({ lastUsedAt: now }).where(eq(ownRoutine.id, r.id));
  return s;
}

// ── D162 → SI2: cargar la rutina que ya tiene desde una foto, una captura, un PDF, una planilla o texto ────────────────
/**
 * Vista previa: días y ejercicios leídos, emparejados con la biblioteca de la persona. No guarda nada: la persona revisa y
 * guarda todo junto con `saveImportedRoutines`. `beforeAi` aplica los topes de uso sólo si hace falta la IA.
 */
export async function previewRoutineImport(userId: string, f: ImportInput, beforeAi: () => Promise<void> = async () => {}) {
  await relationOrg(userId, "routine_import"); // D213: antes de leer el archivo o gastar IA
  const lib = await myExerciseLibrary(userId);
  const read = await readImport(f, beforeAi);
  const p = splitLongDays(await buildPreview(read, lib), OWN_ROUTINE_EXERCISES_MAX);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(ownRoutine).where(eq(ownRoutine.userId, userId));
  await audit(db, { actorUserId: userId, action: "own_routine.import_previewed", resourceType: "own_routine", meta: { source: p.source, file: p.file, days: p.variants[0]?.days.length ?? 0, variants: p.variants.length } });
  return { ...p, limits: { exercisesPerDay: OWN_ROUTINE_EXERCISES_MAX, free: Math.max(0, OWN_ROUTINES_MAX - n), max: OWN_ROUTINES_MAX } };
}

type ImportSave = { opId: string; source: ImportOrigin["source"]; file: ImportOrigin["file"]; routines: { name: string; exercises: OwnRoutineEx[]; origin: ImportOriginExercise[] }[] };
const clipTxt = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : null);
const numOr = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const FIELDS = new Set(["name", "sets", "reps", "weight", "rest", "method", "line"]);
const fields = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is ImportField => FIELDS.has(x as string)).slice(0, 8) : []);
/** Lo que decía el documento, acotado (lo manda el teléfono: son datos de la propia persona sobre su rutina). */
function cleanOrigin(o: ImportOriginExercise, exerciseId: string): ImportOriginExercise {
  return {
    written: clipTxt(o.written, 80) ?? "", exerciseId, sets: numOr(o.sets), reps: clipTxt(o.reps, 20), weightKg: numOr(o.weightKg),
    perSet: Array.isArray(o.perSet) ? o.perSet.slice(0, 20).map((x) => ({ reps: clipTxt(x?.reps, 20), weightKg: numOr(x?.weightKg) })) : null,
    restSec: numOr(o.restSec), rir: numOr(o.rir), rpe: numOr(o.rpe), tempo: clipTxt(o.tempo, 16), technique: clipTxt(o.technique, 80),
    unknown: fields(o.unknown), completed: fields(o.completed), suggested: fields(o.suggested),
    // Ejercicios por tiempo: la actividad leída (cinta 10 min · 5 km/h · incl. 3), validada con los rangos de su perfil.
    ...(o.activity != null ? { activity: activityOrNull(o.activity) } : {}),
  };
}
const activityOrNull = (a: unknown) => { const v = validateActivity(a); return v.ok ? v.activity : null; };

/**
 * SI2: guarda todos los días de una importación juntos (una transacción): o quedan todos, o ninguno. Idempotente por `opId`:
 * un reintento después de un corte de red o un doble toque devuelve las mismas rutinas sin duplicarlas. Si no entran en «Mis
 * rutinas», no guarda nada y dice cuántas entran. Nunca reemplaza rutinas existentes.
 */
export async function saveImportedRoutines(userId: string, p: ImportSave) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(p.opId)) throw new AccessError("invalid", "Falta el identificador de la importación. Volvé a abrir la revisión.");
  if (!p.routines.length) throw new AccessError("invalid", "No hay días para guardar.");
  const orgId = await relationOrg(userId, "routine_import");
  const cleaned = p.routines.map((r, i) => {
    try { return clean({ name: r.name, exercises: r.exercises }); }
    catch (e) { if (e instanceof AccessError) throw new AccessError(e.code, `${r.name?.trim() || `Día ${i + 1}`}: ${e.message}`, e.status); throw e; }
  });
  await ensureExerciseCatalog();
  const ids = [...new Set(cleaned.flatMap((c) => c.exercises.map((e) => e.exerciseId)))];
  const lib = await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(and(inArray(exercise.id, ids), visibleIn(orgId, userId)));
  if (lib.length !== ids.length) throw new AccessError("invalid", "Hay ejercicios que no están en tu biblioteca.");
  cleaned.forEach((c) => assertCircuits(c.exercises.map((e) => ({ ...e, name: lib.find((x) => x.id === e.exerciseId)!.name }))));
  const names = new Map(lib.map((x) => [x.id, x.name]));
  for (const c of cleaned) c.exercises = await alignOwn(c.exercises, names);
  const source = (IMPORT_SOURCES as readonly string[]).includes(p.source) ? p.source : "text";
  const file = (IMPORT_FILES as readonly string[]).includes(p.file) ? p.file : "text";
  return db.transaction(async (tx) => {
    // Un guardado de importación por persona a la vez: el reintento espera al primero y lo encuentra.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`own-routine-import:${userId}`}))`);
    const prior = await tx.select({ id: ownRoutine.id }).from(ownRoutine)
      .where(and(eq(ownRoutine.userId, userId), sql`${ownRoutine.origin}->>'opId' = ${p.opId}`)).orderBy(sql`(${ownRoutine.origin}->>'day')::int`);
    if (prior.length) return { ids: prior.map((r) => r.id), replay: true };
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(ownRoutine).where(eq(ownRoutine.userId, userId));
    if (n + cleaned.length > OWN_ROUTINES_MAX) {
      const free = Math.max(0, OWN_ROUTINES_MAX - n);
      throw new AccessError("capacity", `Entran ${free} ${free === 1 ? "rutina" : "rutinas"} más en «Mis rutinas» (hasta ${OWN_ROUTINES_MAX}) y la importación trae ${cleaned.length}. Quitá días o borrá rutinas que ya no uses. No se guardó nada.`, 409);
    }
    const at = Date.now();
    const rows = await tx.insert(ownRoutine).values(cleaned.map((c, i) => {
      const origin: ImportOrigin = { kind: "import", opId: p.opId, day: i, at: new Date(at).toISOString(), source, file, dayName: c.name,
        exercises: c.exercises.map((e, j) => cleanOrigin(p.routines[i].origin?.[j] ?? ({} as ImportOriginExercise), e.exerciseId)) };
      // El orden de carga es el orden de los días (Día A, Día B…) y define cuál toca después: un milisegundo entre cada uno.
      return { userId, name: c.name, exercises: c.exercises, origin, createdAt: new Date(at + i), updatedAt: new Date(at + i) };
    })).returning({ id: ownRoutine.id });
    await audit(tx, { actorUserId: userId, action: "own_routine.imported", resourceType: "own_routine", resourceId: rows[0]?.id ?? null,
      meta: { opId: p.opId, routines: rows.length, exercises: cleaned.reduce((k, c) => k + c.exercises.length, 0), source, file,
        unknown: p.routines.reduce((k, r) => k + (r.origin ?? []).reduce((m, o) => m + fields(o?.unknown).length, 0), 0) } });
    return { ids: rows.map((r) => r.id), replay: false };
  });
}
