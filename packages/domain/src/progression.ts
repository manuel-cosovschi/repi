// D154: progresión sugerida por REPI. Cuando la rutina no trae cargas nuevas del profe, REPI propone qué hacer hoy en cada
// ejercicio según lo que la persona hizo la última vez en ese ejercicio (doble progresión): si completó todas las series en
// el tope del rango, sube la carga y vuelve al piso del rango; si completó el rango, suma una repetición con el mismo peso;
// si quedó lejos del piso, baja un 10 %. El profe ve la misma sugerencia al actualizar la rutina y decide si la aplica.
import { parseReps } from "./training";
import { emptyDetail, type ExerciseDetail, type SetSpec } from "./prescription";

export type LastSet = { weightKg: number | null; reps: number | null; rir?: number | null };
export type ProgressionAction = "up" | "reps" | "hold" | "down";
export type Suggestion = { action: ProgressionAction; weightKg: number | null; reps: number; text: string; why: string };

const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
const roundTo = (x: number, step: number) => Math.round(x / step) * step;
/** Salto de carga: chico en cargas livianas (mancuernas, máquinas), 5 kg en las pesadas. */
export const loadStep = (w: number) => (w < 20 ? 1 : w < 100 ? 2.5 : 5);
export const lastSummary = (sets: LastSet[]) => {
  const ws = [...new Set(sets.map((s) => s.weightKg ?? 0))];
  const reps = sets.map((s) => s.reps ?? 0).join(", ");
  return ws.length === 1 ? `${ws[0] ? `${kg(ws[0])} × ` : ""}${reps}` : sets.map((s) => `${s.weightKg ? kg(s.weightKg) : "sin carga"} × ${s.reps ?? 0}`).join(" · ");
};

/**
 * Sugerencia para hoy. `reps` y `sets` son la prescripción vigente; `last`, las series de la última vez en ese ejercicio.
 * Sin rango de repeticiones (por tiempo, «al fallo») o sin series previas, no sugiere nada.
 */
export function suggestNext(p: { reps: string; sets: number; last: LastSet[] }): Suggestion | null {
  const t = parseReps(p.reps);
  const last = p.last.filter((s) => s.reps != null && s.reps > 0);
  if (t.kind !== "reps" || !last.length) return null;
  const top = Math.max(...last.map((s) => s.weightKg ?? 0));
  const before = `La última vez: ${lastSummary(last)}.`;

  if (!top) {
    // Peso corporal: se progresa en repeticiones hasta el tope del rango.
    const minR = Math.min(...last.map((s) => s.reps!));
    if (minR >= t.max) return { action: "up", weightKg: null, reps: t.max, text: `${t.max} reps`, why: `${before} Llegaste al tope del rango: probá con carga o una variante más difícil.` };
    const r = Math.min(t.max, Math.max(t.min, minR + 1));
    return { action: "reps", weightKg: null, reps: r, text: `${r} reps`, why: `${before} Sumá una repetición.` };
  }
  const work = last.filter((s) => (s.weightKg ?? 0) === top);
  const minR = Math.min(...work.map((s) => s.reps!));
  const full = work.length >= p.sets;
  if (full && minR >= t.max) {
    const w = top + loadStep(top);
    return { action: "up", weightKg: w, reps: t.min, text: `${kg(w)} × ${t.min}`, why: `${before} Completaste todas las series en el tope del rango: subí la carga y volvé a ${t.min}.` };
  }
  if (minR >= t.min) {
    const r = Math.min(t.max, minR + 1);
    return { action: "reps", weightKg: top, reps: r, text: `${kg(top)} × ${r}`, why: `${before} Mismo peso, buscá una repetición más${full ? "" : " y completá todas las series"}.` };
  }
  if (t.min - minR >= 3) {
    const w = Math.max(loadStep(top), roundTo(top * 0.9, loadStep(top)));
    return { action: "down", weightKg: w, reps: t.min, text: `${kg(w)} × ${t.min}`, why: `${before} Quedaste lejos de ${t.min}: bajá un poco la carga y completá el rango.` };
  }
  return { action: "hold", weightKg: top, reps: t.min, text: `${kg(top)} × ${t.min}`, why: `${before} Repetí la carga y buscá llegar a ${t.min} en todas.` };
}

/**
 * El profe aplica la carga sugerida: queda en el plan serie por serie (series efectivas con ese peso y el mismo rango).
 * Sólo con series rectas o un plan de series efectivas; con top set, drop o pirámide la carga la decide el profe.
 */
export function canApplyLoad(detail: ExerciseDetail | null | undefined) {
  return !detail?.setPlan || detail.setPlan.every((s) => s.kind === "work");
}
export function applyLoad(detail: ExerciseDetail | null | undefined, sets: number, reps: string, weightKg: number): ExerciseDetail {
  const d = detail ?? emptyDetail();
  const n = d.setPlan?.length ?? sets;
  const plan: SetSpec[] = Array.from({ length: n }, (_, i) => ({
    kind: "work", reps: d.setPlan?.[i]?.reps ?? reps, weightKg, pct1rm: null, rir: d.setPlan?.[i]?.rir ?? null, rpe: d.setPlan?.[i]?.rpe ?? null,
    restSec: d.setPlan?.[i]?.restSec ?? null, note: d.setPlan?.[i]?.note ?? null,
  }));
  return { ...d, setPlan: plan };
}
/** Hay carga indicada por el profe para hoy (en ese caso manda el plan, no la sugerencia). */
export const coachSetLoads = (detail: ExerciseDetail | null | undefined) => !!detail?.setPlan?.some((s) => s.weightKg != null);
