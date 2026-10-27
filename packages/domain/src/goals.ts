// Objetivos acordados coach ↔ alumno (F-CO-03 / F-HX-02, D97). El progreso se calcula desde lo registrado; no promete
// resultados. Indicadores medibles con datos de REPI más uno manual que carga el coach con fecha y autor.

export const GOAL_KINDS = {
  e1rm: "1RM estimado en un ejercicio",
  load: "Carga en un ejercicio (peso × repeticiones)",
  frequency: "Entrenamientos por semana",
  manual: "Otro indicador (lo cargás vos)",
} as const;
export type GoalKind = keyof typeof GOAL_KINDS;
export const isGoalKind = (k: unknown): k is GoalKind => typeof k === "string" && k in GOAL_KINDS;

/** Ventana con la que se calcula el valor actual de los indicadores automáticos. */
export const GOAL_WINDOW_DAYS = 28;

export const GOAL_SOURCES: Record<GoalKind, string> = {
  e1rm: `Mejor 1RM estimado (Epley) de las series de los últimos ${GOAL_WINDOW_DAYS} días en la relación con el coach.`,
  load: `Mayor peso levantado con al menos las repeticiones pedidas en los últimos ${GOAL_WINDOW_DAYS} días en la relación con el coach.`,
  frequency: `Entrenamientos completados en la relación con el coach en los últimos ${GOAL_WINDOW_DAYS} días ÷ 4.`,
  manual: "Valor cargado a mano por el coach, con fecha.",
};

/**
 * Avance 0–1 desde la línea base (valor al acordar) hacia la meta; sirve para metas que suben o bajan.
 * Sin línea base útil, valor actual ÷ meta. Sin valor actual → null («datos insuficientes»).
 */
export function goalProgress(p: { baseline: number | null; target: number; current: number | null }): number | null {
  if (p.current == null || !Number.isFinite(p.current)) return null;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  if (p.baseline != null && p.baseline !== p.target) return clamp((p.current - p.baseline) / (p.target - p.baseline));
  return p.target > 0 ? clamp(p.current / p.target) : null;
}

/** Título legible para los indicadores automáticos; el manual usa el que escribe el coach. */
export function goalTitle(kind: GoalKind, p: { exercise?: string | null; target: number; reps?: number | null; title?: string | null }) {
  const n = p.target.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  if (kind === "e1rm") return `${p.exercise} · 1RM estimado ${n} kg`;
  if (kind === "load") return `${p.exercise} ${n} kg × ${p.reps}`;
  if (kind === "frequency") return `${n} entrenamientos por semana`;
  return (p.title ?? "").trim();
}
