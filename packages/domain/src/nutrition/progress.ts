// Progreso nutricional (D221). La ausencia de registro NO significa que la persona no comió: un día sólo cuenta para promedios
// de ingesta si la persona lo marcó completo y todos sus registros informan el nutriente. Comparaciones descriptivas, nunca
// causales.
import { isComplete, mergeTotals, r4 } from "./calc";
import { NUTRIENT_KEYS, type NutrientKey, type Totals } from "./types";

export type DayStatus = "empty" | "partial" | "complete";
export type DayLog = { day: string; markedComplete: boolean; totals: Totals; meals: number };

/** Sin registros: vacío (aunque esté marcado). Marcado por la persona: completo. Con registros sin marcar: parcial. */
export const dayStatus = (d: Pick<DayLog, "markedComplete" | "totals">): DayStatus =>
  d.totals.items === 0 ? "empty" : d.markedComplete ? "complete" : "partial";

/** ¿El día sirve para promediar este nutriente? Completo y sin faltantes en ese nutriente. */
export const dayUsable = (d: DayLog, k: NutrientKey) => dayStatus(d) === "complete" && isComplete(d.totals, k);

/** Mínimo de días completos para mostrar un promedio. Con menos, se dice que la información es insuficiente. */
export const MIN_DAYS_FOR_AVERAGE = 3;

export type NutrientTrend = {
  key: NutrientKey;
  /** Promedio de los días completos y sin faltantes; null si hay menos de MIN_DAYS_FOR_AVERAGE. */
  average: number | null;
  usableDays: number;
  /** Días con registro de este nutriente que no cuentan para el promedio (parciales o con faltantes). */
  excludedDays: number;
  min: number | null;
  max: number | null;
};

export type PeriodSummary = {
  days: number;
  loggedDays: number;
  completeDays: number;
  partialDays: number;
  emptyDays: number;
  trends: Record<NutrientKey, NutrientTrend>;
  /** Comidas registradas por tipo de comida en el período (distribución). */
  totals: Totals;
};

export function periodSummary(days: readonly DayLog[]): PeriodSummary {
  const st = days.map(dayStatus);
  const trends = {} as Record<NutrientKey, NutrientTrend>;
  for (const k of NUTRIENT_KEYS) {
    const vals = days.filter((d) => dayUsable(d, k)).map((d) => d.totals.values[k]!);
    const excluded = days.filter((d) => d.totals.items > 0 && !dayUsable(d, k)).length;
    trends[k] = {
      key: k,
      average: vals.length >= MIN_DAYS_FOR_AVERAGE ? r4(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
      usableDays: vals.length, excludedDays: excluded,
      min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null,
    };
  }
  return {
    days: days.length,
    loggedDays: st.filter((s) => s !== "empty").length,
    completeDays: st.filter((s) => s === "complete").length,
    partialDays: st.filter((s) => s === "partial").length,
    emptyDays: st.filter((s) => s === "empty").length,
    trends,
    totals: mergeTotals(days.map((d) => d.totals)),
  };
}

// ── Objetivos propios o indicados por un profesional ──
export type GoalMode = "min" | "approx" | "max";
export type NutritionTarget = { value: number; mode: GoalMode };
export type NutritionTargets = Partial<Record<"energyKcal" | "proteinG" | "carbsG" | "fatG", NutritionTarget>>;
export const DEFAULT_MODE: Record<keyof NutritionTargets, GoalMode> = { energyKcal: "approx", proteinG: "min", carbsG: "approx", fatG: "approx" };
/** Tolerancia de «aproximado»: ±10 %. */
export const APPROX_TOLERANCE = 0.1;

export function meetsTarget(v: number, t: NutritionTarget): boolean {
  if (t.mode === "min") return v >= t.value;
  if (t.mode === "max") return v <= t.value;
  return Math.abs(v - t.value) <= t.value * APPROX_TOLERANCE;
}

/** Días completos en que se cumplió el objetivo, sobre los días completos que informan el nutriente. Sin días válidos: null. */
export function targetConsistency(days: readonly DayLog[], k: keyof NutritionTargets, t: NutritionTarget): { met: number; of: number } | null {
  const usable = days.filter((d) => dayUsable(d, k));
  if (!usable.length) return null;
  return { met: usable.filter((d) => meetsTarget(d.totals.values[k]!, t)).length, of: usable.length };
}

/** Lista de fechas AAAA-MM-DD entre dos fechas inclusive (máximo 400 días). */
export function dayRange(from: string, to: string): string[] {
  const a = Date.parse(`${from}T12:00:00Z`), b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  const out: string[] = [];
  for (let t = a; t <= b && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Frase descriptiva del período con entrenamientos, sin atribuir causas: «En estos 28 días registraste comidas en 18 días
 * (12 marcados completos) y completaste 15 entrenamientos.»
 */
export function describePeriod(s: Pick<PeriodSummary, "days" | "loggedDays" | "completeDays">, workouts: number | null): string {
  const reg = s.loggedDays === 0 ? "no registraste comidas" : `registraste comidas en ${s.loggedDays} ${s.loggedDays === 1 ? "día" : "días"}${s.completeDays ? ` (${s.completeDays} ${s.completeDays === 1 ? "marcado completo" : "marcados completos"})` : ""}`;
  const tr = workouts == null ? "" : ` y completaste ${workouts} ${workouts === 1 ? "entrenamiento" : "entrenamientos"}`;
  return `En estos ${s.days} días ${reg}${tr}.`;
}
