// Cambios de la persona durante la sesión activa (F-HX-21, D106): saltar un ejercicio, hacer otro en su lugar y anotar
// una serie. Sólo afectan a esa sesión: el programa y la prescripción del coach no cambian.

export const EXERCISE_CHANGE_REASONS = {
  busy: "Máquina o lugar ocupado",
  no_equipment: "No tengo ese equipo",
  discomfort: "Me molesta",
  no_time: "Me falta tiempo",
  other: "Otro motivo",
} as const;
export type ExerciseChangeReason = keyof typeof EXERCISE_CHANGE_REASONS;
export const isChangeReason = (x: unknown): x is ExerciseChangeReason => typeof x === "string" && x in EXERCISE_CHANGE_REASONS;

export type ExerciseKind = "load_reps" | "bodyweight" | "time";
/** Reemplazo compatible: otro ejercicio del mismo tipo de registro (cargas y reps, peso corporal o tiempo). */
export const canSubstitute = (original: { id: string; kind: ExerciseKind }, candidate: { id: string; kind: ExerciseKind }) =>
  original.id !== candidate.id && original.kind === candidate.kind;

/** Orden de alternativas: mismo grupo muscular primero, después alfabético. No implica cargas equivalentes. */
export function rankAlternatives<T extends { id: string; name: string; muscleGroup: string; kind: ExerciseKind }>(original: { id: string; kind: ExerciseKind; muscleGroup: string }, all: T[]) {
  return all.filter((c) => canSubstitute(original, c))
    .sort((a, b) => Number(b.muscleGroup === original.muscleGroup) - Number(a.muscleGroup === original.muscleGroup) || a.name.localeCompare(b.name, "es"));
}

// Reemplazos aprobados (Adaptive Coach 1b, EXT-05): el coach o el gimnasio dejan dicho «si X no se puede, hacé Y».
export const APPROVED_SUBS_MAX = 8; // por ejercicio y organización
export const SUB_NOTE_MAX = 120;
export const cleanSubNote = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, SUB_NOTE_MAX) || null;
/** Las alternativas aprobadas van primero, en el orden en que se aprobaron; el resto conserva su orden. Sólo marca las
 * que siguen siendo compatibles (ya filtradas por `rankAlternatives`): una aprobación no habilita un ejercicio incompatible. */
export function withApproved<T extends { id: string }>(ranked: T[], approved: { id: string; note: string | null }[]) {
  const pos = new Map(approved.map((a, i) => [a.id, i]));
  const note = new Map(approved.map((a) => [a.id, a.note]));
  const rank = (x: T) => pos.get(x.id) ?? approved.length;
  return ranked.map((x) => ({ ...x, approved: pos.has(x.id), approvedNote: note.get(x.id) ?? null })).sort((a, b) => rank(a) - rank(b));
}

export const SET_NOTE_MAX = 200;
/** Nota de serie normalizada: sin espacios sobrantes; vacía = sin nota. */
export const cleanSetNote = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, SET_NOTE_MAX) || null;

/**
 * D145: el coach cambió la rutina con un entrenamiento abierto. Empareja cada ejercicio del día anterior con el mismo
 * ejercicio del día nuevo (la k-ésima aparición con la k-ésima, en orden), para mover ahí las series ya hechas.
 * Los que no tienen pareja quedan como estaban: sus series siguen en el historial con la versión anterior.
 */
export function matchProgramExercises(prev: { id: string; exerciseId: string }[], next: { id: string; exerciseId: string }[]) {
  const pool = new Map<string, string[]>();
  for (const e of next) pool.set(e.exerciseId, [...(pool.get(e.exerciseId) ?? []), e.id]);
  const map: Record<string, string> = {};
  for (const e of prev) {
    const id = pool.get(e.exerciseId)?.shift();
    if (id) map[e.id] = id;
  }
  return map;
}
