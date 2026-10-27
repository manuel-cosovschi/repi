// Calculadora de discos y entrada en calor sugerida (F-HX-21, D105). Herramientas de la sesión activa: no se registran,
// no cambian la prescripción del coach ni el historial. Trabajan en la unidad que ve la persona (kg o lb) y en centésimas
// enteras para no arrastrar errores de coma flotante. Suponen discos suficientes de cada medida; lo dicen en la interfaz.
import type { WeightUnit } from "./units";

export const PLATES: Record<WeightUnit, readonly number[]> = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
export const BARS: Record<WeightUnit, readonly number[]> = { kg: [20, 15, 10], lb: [45, 35, 25] };

const c = (n: number) => Math.round(n * 100);
const u = (n: number) => n / 100;

export type PlateLoad = { perSide: { plate: number; count: number }[]; total: number; exact: boolean; missing: number };

/** Discos por lado para llegar al peso (o al más cercano por debajo). null si el peso no llega a la barra. */
export function platesFor(target: number, bar: number, unit: WeightUnit): PlateLoad | null {
  if (!Number.isFinite(target) || !Number.isFinite(bar) || bar <= 0 || target < bar) return null;
  let side = Math.floor((c(target) - c(bar)) / 2);
  const perSide: PlateLoad["perSide"] = [];
  for (const p of PLATES[unit]) {
    const n = Math.floor(side / c(p));
    if (n > 0) { perSide.push({ plate: p, count: n }); side -= n * c(p); }
  }
  const total = u(c(bar) + 2 * perSide.reduce((a, x) => a + c(x.plate) * x.count, 0));
  return { perSide, total, exact: c(total) === c(target), missing: u(c(target) - c(total)) };
}

/** Peso armable más cercano por debajo (barra + pares del disco más chico). */
const loadable = (w: number, bar: number, unit: WeightUnit) => {
  const pair = 2 * c(PLATES[unit].at(-1)!);
  return u(c(bar) + Math.floor((c(w) - c(bar)) / pair) * pair);
};

export type WarmupSet = { weight: number; reps: number; label: string };

/**
 * Entrada en calor progresiva hacia la serie de trabajo: barra sola ×10, ~40 % ×5, ~60 % ×3, ~80 % ×2, redondeado a lo que
 * se arma con discos. Omite escalones repetidos o que no quedan por debajo del peso de trabajo. Es una sugerencia genérica.
 */
export function warmupFor(work: number, bar: number, unit: WeightUnit): WarmupSet[] {
  if (!Number.isFinite(work) || work <= bar) return [];
  const steps: [number, number, string][] = [[0, 10, "Barra sola"], [0.4, 5, "40 %"], [0.6, 3, "60 %"], [0.8, 2, "80 %"]];
  const out: WarmupSet[] = [];
  for (const [pct, reps, label] of steps) {
    const w = pct === 0 ? bar : loadable(work * pct, bar, unit);
    if (w < bar || w >= work || out.some((x) => x.weight >= w)) continue;
    out.push({ weight: w, reps, label });
  }
  return out;
}
