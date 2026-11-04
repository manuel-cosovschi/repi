// D154: progresión sugerida por REPI. Cuando la rutina no trae cargas nuevas del profe, REPI propone qué hacer hoy en cada
// ejercicio según lo que la persona hizo la última vez en ese ejercicio (doble progresión): si completó todas las series en
// el tope del rango, sube la carga y vuelve al piso del rango; si completó el rango, suma una repetición con el mismo peso;
// si quedó lejos del piso, baja un 10 %. El profe ve la misma sugerencia al actualizar la rutina y decide si la aplica.
// D182: antes de proponer, (1) compara sólo con un rango de repeticiones compatible: con otro rango estima de forma prudente
// (o no sugiere); (2) frena la suba ante molestias, lesión, esfuerzo máximo, poca energía o inactividad (load-safety.ts).
import { epley1rm, parseReps } from "./training";
import { emptyDetail, type ExerciseDetail, type SetKind, type SetSpec } from "./prescription";
import { COMPARABLE_KINDS, ESTIMATE_MARGIN, GUARD_TEXT, INACTIVE_HOLD_DAYS, INACTIVE_REDUCE_DAYS, floorToStep, loadStep, type GuardCode, type SafetySignals } from "./load-safety";

export { loadStep } from "./load-safety";
/** Una serie de la última vez. `kind` sale del plan de esa sesión; `feel` es la sensación que marcó la persona. */
export type LastSet = { weightKg: number | null; reps: number | null; rir?: number | null; feel?: string | null; kind?: SetKind | null };
export type ProgressionAction = "up" | "reps" | "hold" | "down" | "estimate";
export type Suggestion = { action: ProgressionAction; weightKg: number | null; reps: number; text: string; why: string; guards?: GuardCode[] };

const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
const roundTo = (x: number, step: number) => Math.round(x / step) * step;
export const lastSummary = (sets: LastSet[]) => {
  const ws = [...new Set(sets.map((s) => s.weightKg ?? 0))];
  const reps = sets.map((s) => s.reps ?? 0).join(", ");
  return ws.length === 1 ? `${ws[0] ? `${kg(ws[0])} × ` : ""}${reps}` : sets.map((s) => `${s.weightKg ? kg(s.weightKg) : "sin carga"} × ${s.reps ?? 0}`).join(" · ");
};

/** El rango de hoy y el de la última vez se superponen (son comparables para la doble progresión). */
const overlaps = (a: { min: number; max: number }, b: { min: number; max: number }) => a.max >= b.min && a.min <= b.max;
/** Sin la prescripción anterior: la última vez se ve comparable si sus repeticiones quedaron cerca del rango de hoy. */
const RANGE_GAP = 3;

/**
 * Sugerencia para hoy. `reps` y `sets` son la prescripción vigente; `last`, las series de la última vez en ese ejercicio;
 * `lastReps`, las repeticiones que tenía indicadas esa vez (si se conocen); `signals`, señales de seguridad del alumno.
 * Sin rango de repeticiones (por tiempo, «al fallo»), sin series previas comparables o sin una estimación válida, no sugiere.
 */
export function suggestNext(p: { reps: string; sets: number; last: LastSet[]; lastReps?: string | null; signals?: SafetySignals }): Suggestion | null {
  const t = parseReps(p.reps);
  const all = p.last.filter((s) => s.reps != null && s.reps > 0);
  // Las series reducidas (aproximación, back-off, drop), las mini series y los clusters no son referencia de la carga de trabajo.
  const last = all.filter((s) => !s.kind || COMPARABLE_KINDS.includes(s.kind));
  if (t.kind !== "reps" || !last.length) return null;
  const sig = p.signals ?? {};
  const top = Math.max(...last.map((s) => s.weightKg ?? 0));
  const before = `La última vez: ${lastSummary(last)}.`;
  const work = top ? last.filter((s) => (s.weightKg ?? 0) === top) : last;
  const minR = Math.min(...work.map((s) => s.reps!));
  const maxR = Math.max(...work.map((s) => s.reps!));
  const guards: GuardCode[] = [];
  const finish = (s: Omit<Suggestion, "why" | "guards"> & { why: string }): Suggestion => ({ ...s, why: [s.why, ...guards.map((g) => GUARD_TEXT[g])].join(" "), ...(guards.length ? { guards } : {}) });
  const hold = (why: string) => finish({ action: "hold", weightKg: top || null, reps: Math.max(t.min, Math.min(t.max, minR)), text: top ? `${kg(top)} × ${Math.max(t.min, Math.min(t.max, minR))}` : `${Math.max(t.min, Math.min(t.max, minR))} reps`, why });

  // ── Comparabilidad: otro rango de repeticiones no es la misma referencia. ──
  const prev = p.lastReps ? parseReps(p.lastReps) : null;
  const comparable = !top || (prev?.kind === "reps" ? overlaps(prev, t) : minR >= t.min - RANGE_GAP + 1 && maxR <= t.max + RANGE_GAP * 2);
  // Carga de referencia para hoy: la de la última vez si el rango es comparable; si no, una estimación prudente.
  let ref = top;
  if (!comparable) {
    guards.push("range_change");
    if (minR <= t.max) {
      // Menos repeticiones que hoy: estimación por 1RM (Epley, válida de 1 a 12 reps) con margen y redondeo hacia abajo.
      const e1 = Math.max(...work.map((s) => epley1rm(top, s.reps!) ?? 0));
      const w = e1 ? floorToStep((e1 / (1 + t.max / 30)) * ESTIMATE_MARGIN) : 0;
      if (!(w > 0) || w >= top) return null; // sin una referencia confiable no se inventa una carga
      ref = w;
    } // con más repeticiones que hoy, la misma carga es el punto de partida (con esa carga ya salieron más)
  }

  // ── Seguridad: molestia en el ejercicio o inactividad larga bajan la carga; otras señales frenan la suba. ──
  const days = sig.daysSinceLast ?? null;
  if (top && (sig.painExercise || last.some((s) => s.feel === "molestia"))) {
    guards.push("pain_exercise");
    const w = floorToStep(ref * 0.9);
    return finish({ action: "down", weightKg: w, reps: t.min, text: `${kg(w)} × ${t.min}`, why: before });
  }
  if (top && days != null && days >= INACTIVE_REDUCE_DAYS) {
    guards.push("inactive_reduce");
    const w = floorToStep(ref * 0.9);
    return finish({ action: "down", weightKg: w, reps: t.min, text: `${kg(w)} × ${t.min}`, why: before });
  }
  const maxEffort = work.every((s) => s.rir === 0 || s.feel === "limite");
  const block: GuardCode[] = [
    ...(sig.painOrInjury || (!top && last.some((s) => s.feel === "molestia")) ? ["pain_or_injury" as const] : []),
    ...(maxEffort ? ["max_effort" as const] : []),
    ...(sig.lowReadiness ? ["low_readiness" as const] : []),
    ...(days != null && days >= INACTIVE_HOLD_DAYS ? ["inactive_hold" as const] : []),
  ];

  if (!top) {
    // Peso corporal: se progresa en repeticiones hasta el tope del rango.
    if (block.length) { guards.push(...block); return hold(before); }
    if (minR >= t.max) return finish({ action: "up", weightKg: null, reps: t.max, text: `${t.max} reps`, why: `${before} Llegaste al tope del rango: probá con carga o una variante más difícil.` });
    const r = Math.min(t.max, Math.max(t.min, minR + 1));
    return finish({ action: "reps", weightKg: null, reps: r, text: `${r} reps`, why: `${before} Sumá una repetición.` });
  }
  if (!comparable) {
    // Una estimación nunca sube por encima de sí misma: las señales sólo pueden mantenerla.
    guards.push(...block);
    return finish({ action: "estimate", weightKg: ref, reps: t.min, text: `${kg(ref)} × ${t.min}`, why: before });
  }

  const full = work.length >= p.sets;
  if (full && minR >= t.max) {
    if (block.length) { guards.push(...block); return hold(`${before} Completaste el rango.`); }
    const w = top + loadStep(top);
    return finish({ action: "up", weightKg: w, reps: t.min, text: `${kg(w)} × ${t.min}`, why: `${before} Completaste todas las series en el tope del rango: subí la carga y volvé a ${t.min}.` });
  }
  if (minR >= t.min) {
    if (block.length) { guards.push(...block); return hold(before); }
    const r = Math.min(t.max, minR + 1);
    return finish({ action: "reps", weightKg: top, reps: r, text: `${kg(top)} × ${r}`, why: `${before} Mismo peso, buscá una repetición más${full ? "" : " y completá todas las series"}.` });
  }
  guards.push(...block);
  if (t.min - minR >= RANGE_GAP) {
    const w = Math.max(loadStep(top), roundTo(top * 0.9, loadStep(top)));
    return finish({ action: "down", weightKg: w, reps: t.min, text: `${kg(w)} × ${t.min}`, why: `${before} Quedaste lejos de ${t.min}: bajá un poco la carga y completá el rango.` });
  }
  return finish({ action: "hold", weightKg: top, reps: t.min, text: `${kg(top)} × ${t.min}`, why: `${before} Repetí la carga y buscá llegar a ${t.min} en todas.` });
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
