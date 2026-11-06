// D158: «Mis rutinas». El alumno arma y guarda sus propias rutinas con ejercicios de la biblioteca (catálogo de REPI y los
// propios de su coach o gimnasio) y las entrena cuando quiere, tenga o no programa asignado. Al empezar se crea una sesión
// como la de D153: registra pesos, repeticiones, RIR, sensación y notas por serie, y el esfuerzo y la nota de la sesión.
// Las rutinas son sólo del alumno; lo que entrena queda en su historial como cualquier sesión.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { circuitIssues, detectGroupLabel, detectGroupWord, detectMethod, detectedLabel, mainSets, parseRoutineCsv, parseRoutineNotes, validateDetail, type DetectedMethod, type ExerciseDetail, type ImportedRoutineDay } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiJson, aiOn, type AiPart } from "../ai/openai";
import { createMemberExercise, ensureExerciseCatalog, visibleIn } from "./library";
import { matchExercises, type ImportFile } from "./history-import";
import { lastSetByExercise, myActive, startSoloRoutine } from "./services";

const { ownRoutine, exercise } = schema;
export const OWN_ROUTINES_MAX = 30;
export const OWN_ROUTINE_EXERCISES_MAX = 12; // el mismo tope que la sesión sin programa (D153)

// D184: `detail` (opcional) es el mismo ExerciseDetail del programa del coach: técnica, plan con etapas conectadas, superserie o
// circuito. Con plan, `sets` son las filas registrables (series + etapas, como program_exercise.sets).
export type OwnRoutineEx = { exerciseId: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null; detail?: ExerciseDetail | null };
type Input = { id?: string | null; name: string; exercises: OwnRoutineEx[] };

const NOT_FOUND = () => new AccessError("not_found", "No encontramos esa rutina.", 404);

async function relationOrg(userId: string) {
  const act = await myActive(userId);
  if (!act) throw new AccessError("no_relation", "Para entrenar con REPI necesitás estar con un coach o un gimnasio.", 409);
  return act.orgId;
}

/** D163: ejercicio propio del alumno (lo que no encuentra en la biblioteca). */
export async function createMyExercise(userId: string, p: { name: string; group: string; kind: string }) {
  return createMemberExercise(userId, await relationOrg(userId), p);
}

/** Biblioteca para armar la rutina: catálogo de REPI y ejercicios propios de la organización con la que entrena. */
export async function myExerciseLibrary(userId: string) {
  const orgId = await relationOrg(userId);
  await ensureExerciseCatalog();
  const rows = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, mine: sql<boolean>`${exercise.ownerUserId} is not null` }).from(exercise)
    .where(visibleIn(orgId, userId));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
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
    const { detail, sets } = ownDetail(e);
    return { exerciseId: e.exerciseId, sets, reps, weightKg: e.weightKg ? Math.round(e.weightKg * 100) / 100 : null, restSec, note: e.note?.trim().slice(0, 120) || null, ...(detail ? { detail } : {}) };
  });
  return { id: p.id, name, exercises };
}

/**
 * D184: el mismo validador que el programa del coach (validateDetail): series principales de 1 a 10, hasta 40 filas con sus
 * etapas. Sin plan, «N series × reps» como siempre.
 */
export function ownDetail(e: { sets: number; detail?: ExerciseDetail | null }): { detail: ExerciseDetail | null; sets: number } {
  const v = validateDetail(e.detail ?? null, e.sets);
  if (!v.ok) throw new AccessError("invalid", v.error);
  const main = mainSets(v.detail, v.sets);
  if (!Number.isInteger(v.sets) || v.sets < 1 || main < 1 || main > 10) throw new AccessError("invalid", "Cada ejercicio va con 1 a 10 series.");
  return { detail: v.detail, sets: v.sets };
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
    id: r.id, name: r.name, updatedAt: r.updatedAt, lastUsedAt: r.lastUsedAt, next: i === nextIdx,
    exercises: (r.exercises as OwnRoutineEx[]).map((e) => {
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
  const lib = await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(and(inArray(exercise.id, ids), visibleIn(orgId, userId)));
  if (lib.length !== ids.length) throw new AccessError("invalid", "Hay ejercicios que no están en tu biblioteca.");
  assertCircuits(c.exercises.map((e) => ({ ...e, name: lib.find((x) => x.id === e.exerciseId)!.name })));
  const now = new Date();
  if (c.id) {
    const [r] = await db.update(ownRoutine).set({ name: c.name, exercises: c.exercises, updatedAt: now })
      .where(and(eq(ownRoutine.id, c.id), eq(ownRoutine.userId, userId))).returning();
    if (!r) throw NOT_FOUND();
    await audit(db, { actorUserId: userId, action: "own_routine.updated", resourceType: "own_routine", resourceId: r.id, meta: { exercises: c.exercises.length, methods: c.exercises.filter((e) => e.detail).length } });
    return { id: r.id };
  }
  const mine = await db.select({ id: ownRoutine.id }).from(ownRoutine).where(eq(ownRoutine.userId, userId));
  if (mine.length >= OWN_ROUTINES_MAX) throw new AccessError("invalid", `Podés guardar hasta ${OWN_ROUTINES_MAX} rutinas. Borrá alguna que ya no uses.`);
  const [r] = await db.insert(ownRoutine).values({ userId, name: c.name, exercises: c.exercises, createdAt: now, updatedAt: now }).returning();
  await audit(db, { actorUserId: userId, action: "own_routine.created", resourceType: "own_routine", resourceId: r.id, meta: { exercises: c.exercises.length, methods: c.exercises.filter((e) => e.detail).length } });
  return { id: r.id };
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

// ── D162: cargar la rutina que ya tiene desde una foto, una captura, un PDF, una planilla o texto ─────────────────────────
const AI_SCHEMA = {
  type: "object", additionalProperties: false, required: ["days", "notes"],
  properties: {
    days: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "exercises"], properties: {
      name: { type: "string" },
      exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "sets", "reps", "weight_kg", "rest_sec", "note", "technique", "group"], properties: {
        name: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" }, weight_kg: { type: ["number", "null"] }, rest_sec: { type: ["integer", "null"] }, note: { type: "string" },
        technique: { type: "string" }, group: { type: "string" },
      } } },
    } } },
    notes: { type: "array", items: { type: "string" } },
  },
};
type AiOut = { days: { name: string; exercises: { name: string; sets: number; reps: string; weight_kg: number | null; rest_sec: number | null; note: string; technique?: string; group?: string }[] }[]; notes: string[] };
const SYSTEM = `Transcribís a datos la rutina de gimnasio que ya tiene una persona (foto, captura, PDF o texto). NO la diseñes, no la mejores ni agregues nada: copiá lo que está escrito.
- Un elemento de days por cada día o sesión de la rutina, en el orden en que aparecen, con su nombre tal como está («Día 1», «Lunes», «Pecho y tríceps»). Si no hay días, uno solo llamado «Mi rutina».
- Por ejercicio: nombre en español como está escrito (corregí sólo errores evidentes de tipeo), series (entero; si no figura, 3), repeticiones como texto («10», «8-12», «al fallo», «30 s»), peso en kg si figura (libras × 0,4536; si no, null), descanso en segundos si figura (si no, null) y una nota corta si hay una indicación (si no, vacío).
- «3x10» son 3 series de 10. Una pirámide «12-10-8» va en reps tal cual.
- Una lista de repeticiones por serie («12;10;9», «12/10/9», «12 10 9») son tantas series como números (acá 3) y las reps van como «12-10-9».
- Un peso entre paréntesis que no está en kg («7 ladrillos», «placa 5») va en la nota y weight_kg null.
- Si títulos, fechas o líneas en blanco separan grupos de ejercicios, cada grupo es un día.
- Si la rutina cambia semana a semana, transcribí la semana que la persona marque como actual o, si no, la primera, y avisalo en notes.
- technique: si junto al ejercicio figura un método o técnica («drop set», «rest-pause», «myo reps», «cluster», «AMRAP 10 min», «EMOM», «top set + back-off», «pirámide», «superserie con…»), copiá ese texto tal cual, con a qué series se refiere si lo dice («drop set en la última»). Si no figura, vacío. No lo apliques ni cambies series o repeticiones por eso.
- group: si los ejercicios están marcados como combinados («A1», «A2», «B1»…), la marca tal cual («A1»). Si no, vacío. Sacá esa marca del nombre del ejercicio.
- Si algo no se lee o es ambiguo, omitilo y explicalo en notes (en español, breve). Nunca digas «IA».`;

/** Vista previa: días y ejercicios leídos, emparejados con la biblioteca. No guarda nada: la persona revisa y guarda. */
export async function previewRoutineImport(userId: string, f: ImportFile) {
  if (!["text", "image", "pdf"].includes(f.kind)) throw new AccessError("invalid", "Formato no admitido.");
  if (f.kind === "text" && !(f.text ?? "").trim()) throw new AccessError("invalid", "El archivo está vacío.");
  if (f.kind !== "text" && !/^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/.test(f.dataUrl ?? "")) throw new AccessError("invalid", "Subí una foto o captura (JPG o PNG), un PDF o una planilla.");
  const lib = await myExerciseLibrary(userId);
  let days: ImportedRoutineDay[] | null = f.kind === "text" ? parseRoutineCsv(f.text!) : null;
  let notes: string[] = [];
  let source: "csv" | "notes" | "ai" = days ? "csv" : "ai";
  if (!days && f.kind === "text") {
    const direct = parseRoutineNotes(f.text!);
    if (direct) { days = direct.days; notes = direct.notes; source = "notes"; }
  }
  if (!days) {
    if (!aiOn()) throw new AccessError("ai_unavailable", "Por ahora sólo podemos leer planillas con columnas Día, Ejercicio, Series, Reps y Peso. Cargala a mano con «Nueva».", 503);
    const parts: AiPart[] = [{ type: "text", text: `Archivo: ${f.fileName.slice(0, 120)}. Transcribí la rutina.` }];
    if (f.kind === "text") parts.push({ type: "text", text: (f.text ?? "").slice(0, 60_000) });
    else if (f.kind === "image") parts.push({ type: "image_url", image_url: { url: f.dataUrl!, detail: "high" } });
    else parts.push({ type: "file", file: { filename: f.fileName.slice(0, 120) || "rutina.pdf", file_data: f.dataUrl! } });
    const out = await aiJson<AiOut>({ name: "rutina_propia", system: SYSTEM, parts, schema: AI_SCHEMA, maxTokens: 8000 });
    days = (out.days ?? []).map((d) => ({ name: d.name, exercises: (d.exercises ?? []).map((e) => ({
      name: e.name, sets: e.sets, reps: e.reps, weightKg: e.weight_kg, restSec: e.rest_sec, note: e.note || null, technique: e.technique || null, group: e.group || null })) }));
    notes = (out.notes ?? []).map((n) => String(n).slice(0, 300)).slice(0, 8);
  }
  const read = days.map((d, i) => ({
    name: d.name.replace(/\s+/g, " ").trim().slice(0, 60) || `Día ${i + 1}`,
    exercises: d.exercises.filter((e) => e.name?.trim()).map((e) => {
      const sets = Math.round(Number(e.sets));
      const w = e.weightKg == null ? null : Number(e.weightKg);
      const rest = e.restSec == null ? null : Math.round(Number(e.restSec));
      // D184: «A1. Press banca» → combinado A, orden 1, y el nombre sin la marca para buscarlo en la biblioteca.
      const nameRaw = e.name.replace(/\s+/g, " ").trim();
      const label = detectGroupLabel(e.group, nameRaw);
      const written = (label && !e.group ? nameRaw.slice(label.matched.length) : nameRaw).trim().slice(0, 80) || nameRaw.slice(0, 80);
      const technique = e.technique?.trim().slice(0, 80) || null;
      const note = e.note?.trim().slice(0, 120) || null;
      const method = detectMethod(technique, note);
      return { written, sets: sets >= 1 && sets <= 10 ? sets : 3, reps: String(e.reps ?? "").trim().slice(0, 20) || "10",
        weightKg: w != null && w > 0 && w <= 500 ? Math.round(w * 100) / 100 : null, restSec: rest != null && rest >= 0 && rest <= 600 ? rest : null,
        // El texto del método nunca se pierde: si no está en la nota, se suma a la nota (la persona decide si se aplica).
        note: technique && !(note ?? "").toLowerCase().includes(technique.toLowerCase()) ? [note, technique].filter(Boolean).join(" · ").slice(0, 120) : note,
        method: method ? { ...method, label: detectedLabel(method) } : null as (DetectedMethod & { label: string }) | null,
        groupLabel: label ? { letter: label.letter, order: label.order } : null,
        groupWord: label ? null : detectGroupWord(technique, note, e.group) };
    }),
  })).filter((d) => d.exercises.length);
  // D180: un día con más ejercicios que el tope de una sesión no pierde los que sobran: se parte en «Nombre 1», «Nombre 2»…
  // (suele pasar cuando las notas no separan los días). La persona revisa, renombra o quita antes de guardar.
  const clean: typeof read = [];
  for (const d of read) {
    const parts = Math.ceil(d.exercises.length / OWN_ROUTINE_EXERCISES_MAX);
    if (parts === 1) { clean.push(d); continue; }
    for (let k = 0; k < parts; k++) clean.push({ name: `${d.name.slice(0, 56)} ${k + 1}`, exercises: d.exercises.slice(k * OWN_ROUTINE_EXERCISES_MAX, (k + 1) * OWN_ROUTINE_EXERCISES_MAX) });
    notes.push(`${d.name} tenía ${d.exercises.length} ejercicios y una rutina lleva hasta ${OWN_ROUTINE_EXERCISES_MAX}: quedó en ${parts} partes. Si eran días distintos, renombralos.`);
  }
  if (!clean.length) throw new AccessError("empty", "No encontramos ejercicios en ese archivo. Probá con otra foto o cargala a mano.", 422);
  if (clean.length > OWN_ROUTINES_MAX) { clean.length = OWN_ROUTINES_MAX; notes.push(`Se cargan los primeros ${OWN_ROUTINES_MAX} días.`); }
  const matches = await matchExercises([...new Set(clean.flatMap((d) => d.exercises.map((e) => e.written)))], lib);
  const byId = new Map(lib.map((e) => [e.id, e]));
  await audit(db, { actorUserId: userId, action: "own_routine.import_previewed", resourceType: "own_routine", meta: { source, days: clean.length } });
  return {
    source, notes,
    days: clean.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => {
      const m = matches[e.written] ? byId.get(matches[e.written]!.id) : undefined;
      return { ...e, exerciseId: m?.id ?? null, name: m?.name ?? null, group: m?.group ?? null, kind: m?.kind ?? null };
    }) })),
  };
}
