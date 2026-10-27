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

export const SET_NOTE_MAX = 200;
/** Nota de serie normalizada: sin espacios sobrantes; vacía = sin nota. */
export const cleanSetNote = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, SET_NOTE_MAX) || null;
