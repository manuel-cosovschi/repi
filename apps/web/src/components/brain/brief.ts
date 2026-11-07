// Asistente REPI (D209) · línea de briefing antes de un ejercicio, en el entrenamiento. Usa sólo lo que el teléfono ya tiene
// (objetivos de Training Intelligence por fila, la última vez, el plan del profe y la sugerencia del día): funciona SIN conexión
// y no hace ningún pedido por ejercicio. El texto lo arma el dominio (`briefExercise`): la interfaz no calcula cargas.
import { briefExercise } from "@repi/domain/brain/session";
import type { ExerciseBriefInput } from "@repi/domain/brain/types";
import type { ExerciseDetail, ProgressionAction, RowTarget } from "@repi/domain";

/** Lo mínimo del ejercicio local (LocalEx) que hace falta; así se puede probar sin IndexedDB. */
export type BriefEx = {
  exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number;
  detail?: ExerciseDetail | null; change?: { kind: "skip" | "substitute" } | null;
  targets?: (RowTarget & { id?: string })[] | null;
  suggest?: { action: ProgressionAction; weightKg: number | null; reps: number; why: string } | null;
};

const SUGGEST_ACTION: Record<ProgressionAction, string> = { up: "increase_load", reps: "increase_reps", hold: "hold", down: "reduce_load", estimate: "estimate" };

/**
 * Briefing del ejercicio (antes de su primera serie). `null` si no hay nada útil que decir: ejercicio reemplazado u omitido
 * hoy (su objetivo era del original), sin objetivos, sin sugerencia y sin carga del profe.
 */
export function workoutBrief(ex: BriefEx, tone: "normal" | "breve" = "normal"): { text: string } | null {
  if (ex.change) return null;
  const main = (ex.targets ?? []).filter((t) => t.stage === 0 && t.kind !== "warmup").sort((a, b) => a.setIndex - b.setIndex);
  const first = main[0] ?? null;
  const planKg = ex.detail?.setPlan?.find((p) => p?.weightKg != null)?.weightKg ?? null;
  // La última sesión comparable sale de los objetivos (cada fila guarda su par anterior, con fecha). Sin objetivos (p. ej. el
  // entrenamiento empezó sin conexión) no se arma «la última vez» con una sola serie: se diría algo que no pasó.
  const prevRows = main.filter((t) => t.prev && t.prev.r != null);
  const last: ExerciseBriefInput["last"] = prevRows.length && prevRows[0].prev?.at
    ? { at: prevRows[0].prev.at, sets: prevRows.map((t) => ({ w: t.prev!.w, r: t.prev!.r, rir: t.prev!.rir })) } : null;
  const recommendation: ExerciseBriefInput["recommendation"] = first
    ? { weightKg: first.weightKg, reps: first.repsTarget ?? first.repsMin, repsMin: first.repsMin, repsMax: first.repsMax, action: first.action, why: first.why || null,
        status: first.status, guards: first.guards, review: first.review }
    : ex.suggest && planKg == null
      ? { weightKg: ex.suggest.weightKg, reps: ex.suggest.reps, repsMin: null, repsMax: null, action: SUGGEST_ACTION[ex.suggest.action] ?? "reference", why: ex.suggest.why || null, status: "ready" }
      : null;
  if (!recommendation && planKg == null && !last) return null;
  const tech = ex.detail?.technique && ex.detail.technique !== "straight" ? ex.detail.technique : null;
  const b = briefExercise({
    exercise: { id: ex.exerciseId, name: ex.name, short: "" },
    prescribed: { sets: ex.sets, reps: ex.reps, rir: ex.rir, restSec: ex.restSec, loadKg: planKg, coachLoad: planKg != null, method: tech },
    last, recommendation, restrictions: [], missing: [],
    // Sin «la última vez» ni objetivos (sólo la sugerencia del día), una línea: lo que se recomienda.
  }, last ? tone : "breve");
  return b.text ? { text: b.text } : null;
}
