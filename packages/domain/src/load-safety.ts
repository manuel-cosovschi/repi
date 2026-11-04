// D182: protecciones deterministas de carga. Toda carga que REPI muestra o precarga (reglas de progresión, IA de «No vino el
// profe», etapas de un método) pasa por estas reglas antes de llegar al alumno. No son diagnósticos ni verdades científicas:
// son criterios conservadores del producto, con nombre y explicación, que frenan una suba cuando hay una señal para no subir.
// El alumno siempre puede registrar lo que realmente hizo: esto sólo cambia lo que REPI sugiere o precarga.
import type { SetKind, SetSpec, ExerciseDetail } from "./prescription";
import { labelKey } from "./prescription";

/** Salto de carga: chico en cargas livianas (mancuernas, máquinas), 5 kg en las pesadas. */
export const loadStep = (w: number) => (w < 20 ? 1 : w < 100 ? 2.5 : 5);
/** Redondeo hacia abajo al paso de carga (nunca hacia arriba: una estimación no tiene que sumar kilos). */
export const floorToStep = (w: number) => { const s = loadStep(w); return Math.max(0, Math.floor(w / s + 1e-9) * s); };

// ── Señales que frenan una suba ────────────────────────────────────────────
/** Días hacia atrás en que una molestia registrada en el ejercicio (o en general) frena la suba. */
export const PAIN_LOOKBACK_DAYS = 14;
/** Molestia reportada sin ejercicio (zona general) en estos días, o una lesión activa: no se sube nada. */
export const GENERAL_PAIN_DAYS = 7;
/** Sin hacer el ejercicio desde hace este tiempo: no se sube. */
export const INACTIVE_HOLD_DAYS = 14;
/** Sin hacerlo desde hace este tiempo: se retoma con menos carga. */
export const INACTIVE_REDUCE_DAYS = 28;
/** Margen al estimar una carga para otro rango de repeticiones (se usa el 90 % de lo que da la fórmula). */
export const ESTIMATE_MARGIN = 0.9;
/** Fracciones de referencia de los métodos (las mismas que usa la plantilla del constructor). */
export const BACKOFF_FACTOR = 0.85;
export const DROP_FACTOR = 0.8;

export type SafetySignals = {
  /** Molestia registrada en este ejercicio en los últimos PAIN_LOOKBACK_DAYS (reporte con el nombre del ejercicio). */
  painExercise?: boolean;
  /** Molestia reciente en cualquier zona o lesión activa/en seguimiento: no se sube nada hoy. */
  painOrInjury?: boolean;
  /** Check-in de hoy con poca energía o mal descanso. */
  lowReadiness?: boolean;
  /** Días desde la última vez que hizo este ejercicio (null: no se sabe). */
  daysSinceLast?: number | null;
};

export type GuardCode = "pain_exercise" | "pain_or_injury" | "max_effort" | "low_readiness" | "inactive_hold" | "inactive_reduce" | "range_change" | "method";
export const GUARD_TEXT: Record<GuardCode, string> = {
  pain_exercise: "Marcaste molestia en este ejercicio: hoy no se sube la carga. Si vuelve a molestar, pará y avisale a tu profe.",
  pain_or_injury: "Tenés una molestia o lesión registrada: hoy mantené la carga.",
  max_effort: "La última vez llegaste al límite: repetí la carga hasta hacerla con margen.",
  low_readiness: "Hoy marcaste poca energía o mal descanso: mantené la carga.",
  inactive_hold: "Hace un tiempo que no hacés este ejercicio: mantené la carga.",
  inactive_reduce: "Hace más de 4 semanas que no hacés este ejercicio: retomá con menos carga.",
  range_change: "Es otro rango de repeticiones que la última vez: la carga es una estimación prudente. Ajustala en la primera serie.",
  method: "Carga calculada según el método.",
};

// ── Validador común de propuestas de carga ─────────────────────────────────
export type LoadSource = "rules" | "ai";
export type LoadCheck = { weightKg: number | null; status: "ok" | "capped" | "rejected" | "coach"; reasons: string[] };

/**
 * Contrato común (D182) para cualquier carga propuesta para hoy en un ejercicio. Prioridad: 1) carga fijada por el profe,
 * 2) seguridad (señales que frenan la suba), 3) referencia real del alumno, 4) la regla de progresión, 5) la IA dentro de esos
 * límites. Sin referencia previa la IA no propone kilos (empezar liviano lo decide la persona). Devuelve motivos legibles.
 */
export function checkLoad(p: {
  proposedKg: unknown; source: LoadSource;
  /** Mayor carga de trabajo de la última vez en ese ejercicio (null: sin historial con carga). */
  referenceKg: number | null;
  /** Carga fijada por el profe para hoy: manda siempre. */
  coachKg?: number | null;
  /** Carga de la regla de progresión para hoy, si la hay: la IA no puede superarla. */
  rulesKg?: number | null;
  /** Una señal de seguridad frena la suba: el techo es la referencia. */
  blockIncrease?: boolean;
}): LoadCheck {
  if (p.coachKg != null) return { weightKg: p.coachKg, status: "coach", reasons: ["Carga indicada por tu profe."] };
  if (p.proposedKg == null) return { weightKg: null, status: "ok", reasons: [] };
  const n = Number(p.proposedKg);
  if (typeof p.proposedKg === "boolean" || !Number.isFinite(n) || n < 0 || n > 1000) return { weightKg: null, status: "rejected", reasons: ["La carga propuesta no es válida."] };
  const w = Math.round(n * 4) / 4;
  const ref = p.referenceKg != null && p.referenceKg > 0 ? p.referenceKg : null;
  if (!ref) {
    if (p.source === "ai") return { weightKg: null, status: "rejected", reasons: ["Sin una marca previa en este ejercicio no se sugieren kilos: empezá liviano."] };
    return { weightKg: w, status: "ok", reasons: [] };
  }
  let ceil = p.blockIncrease ? ref : ref + 2 * loadStep(ref);
  if (p.source === "ai" && p.rulesKg != null) ceil = Math.min(ceil, p.rulesKg);
  if (w > ceil) {
    const reasons = [p.blockIncrease ? "Hay una señal para no subir la carga hoy." : p.source === "ai" && p.rulesKg != null && p.rulesKg <= ref + 2 * loadStep(ref) ? "No supera la progresión calculada con tu última vez." : "Una suba mayor no está respaldada por tu última vez."];
    return { weightKg: Math.floor(ceil * 4) / 4, status: "capped", reasons };
  }
  return { weightKg: w, status: "ok", reasons: [] };
}

// ── Cargas por tipo de serie (precarga) ────────────────────────────────────
/** Series que van con menos carga que la principal: nunca heredan la carga de otra serie ni la sugerencia del ejercicio. */
export const REDUCED_KINDS: readonly SetKind[] = ["warmup", "backoff", "drop"];
export const isReducedKind = (k: SetKind | null | undefined) => !!k && REDUCED_KINDS.includes(k);
/** Series que comparan con la carga de trabajo (las reducidas, mini series y clusters no son referencia de progresión). */
export const COMPARABLE_KINDS: readonly SetKind[] = ["work", "top", "amrap", "failure"];
/**
 * ¿La carga hecha en una serie `from` se copia como punto de partida a la serie `to` siguiente? D192: con etiquetas del profe
 * («Load Set»), sólo entre filas con la misma etiqueta: un Load Set no arranca con la carga del top set (ni al revés).
 */
export const carriesLoad = (from: SetKind | null | undefined, to: SetKind | null | undefined, fromLabel?: string | null, toLabel?: string | null) =>
  (from ?? "work") !== "warmup" && !isReducedKind(to) && labelKey(fromLabel) === labelKey(toLabel);

/** Tipo de la serie `i` según el plan del profe (sin plan, todas efectivas). */
export const kindAt = (detail: ExerciseDetail | null | undefined, i: number): SetKind => detail?.setPlan?.[i]?.kind ?? "work";

/**
 * La progresión del ejercicio (una carga para todo el ejercicio) sólo vale si todas las series de trabajo son iguales:
 * sin plan, o con aproximaciones y efectivas con las mismas repeticiones. Con top set, back-off, drop, rest-pause, cluster,
 * AMRAP o pirámide, una carga única para todas las series sería incorrecta: hasta el modelo de etapas (02/06) no se sugiere.
 */
export function progressionApplies(detail: ExerciseDetail | null | undefined) {
  const plan = detail?.setPlan;
  if (!plan?.length) return true;
  if (!plan.every((s) => s.kind === "work" || s.kind === "warmup")) return false;
  if (plan.some((s) => s.label)) return false; // D192: una serie con nombre propio (Load Set) lleva su propia carga
  const work = plan.filter((s) => s.kind === "work");
  return work.length > 0 && work.every((s) => s.reps === work[0].reps);
}

/**
 * Carga de referencia para una serie reducida sin peso en el plan, calculada con lo que la persona tiene cargado o hizo en esta
 * sesión: back-off = 85 % del top set; drop = 80 % de la serie anterior. Redondeo hacia abajo. Aproximación: sin referencia, null.
 * Nunca se aplica sola: la app la ofrece para confirmar.
 */
export function reducedLoadHint(plan: SetSpec[] | null | undefined, i: number, weights: (number | null | undefined)[]): { weightKg: number; why: string } | null {
  const k = plan?.[i]?.kind;
  if (k === "backoff") {
    let j = i - 1;
    while (j >= 0 && plan![j].kind !== "top") j--;
    const ref = j >= 0 ? weights[j] : null;
    return ref && ref > 0 ? { weightKg: floorToStep(ref * BACKOFF_FACTOR), why: `−15 % del top set (${String(ref).replace(".", ",")} kg)` } : null;
  }
  if (k === "drop") {
    const ref = i > 0 ? weights[i - 1] : null;
    return ref && ref > 0 ? { weightKg: floorToStep(ref * DROP_FACTOR), why: `−20 % de la serie anterior (${String(ref).replace(".", ",")} kg)` } : null;
  }
  return null;
}

/**
 * Peso de partida de una serie todavía sin registrar (precarga de la sesión, D182). Orden: carga del plan del profe; una serie
 * reducida (aproximación, back-off, drop) sin carga en el plan queda **pendiente** (la persona la elige o confirma la referencia,
 * nunca hereda la del top set); la sugerencia del día; la carga de la serie anterior compatible; si no, 0.
 */
export function startWeight(o: { kind: SetKind; planKg?: number | null; suggestKg?: number | null; carriedKg?: number | null; label?: string | null }): { w: number; pending: boolean } {
  if (o.planKg != null) return { w: o.planKg, pending: false };
  if (isReducedKind(o.kind)) return { w: 0, pending: true };
  // D192: una serie con nombre propio (Load Set) sin carga del profe ni referencia propia: la elige la persona; no hereda otra.
  if (o.label && o.suggestKg == null) return { w: 0, pending: true };
  if (o.suggestKg != null) return { w: o.suggestKg, pending: false };
  return { w: o.carriedKg ?? 0, pending: false };
}
