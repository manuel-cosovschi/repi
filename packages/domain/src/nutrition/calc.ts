// Motor determinístico de nutrientes (D221). Sin densidades universales, sin equivalencias inventadas, sin convertir crudo en
// cocido y sin transformar un faltante en cero.
import { emptyNutrients, NUTRIENT_KEYS, type Coverage, type FoodSnapshot, type NutrientKey, type Nutrients, type Quantity, type Totals } from "./types";

/** Factores generales de Atwater (FAO; Res. GMC 46/03 §3.3.1): 4 kcal/g proteína y carbohidratos, 9 kcal/g grasas. */
export const ATWATER = { proteinG: 4, carbsG: 4, fatG: 9 } as const;

/** Redondeo interno (no de presentación): 4 decimales, para que 0,1 + 0,2 no deje ruido de coma flotante en la base. */
export const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Energía calculada con Atwater cuando la fuente no la informa y sí informa los tres macros. Si falta alguno, queda desconocida.
 * Se rotula «calculada» en la interfaz.
 */
export function atwater(v: Pick<Nutrients, "proteinG" | "carbsG" | "fatG">): number | null {
  if (v.proteinG == null || v.carbsG == null || v.fatG == null) return null;
  return r4(v.proteinG * ATWATER.proteinG + v.carbsG * ATWATER.carbsG + v.fatG * ATWATER.fatG);
}

/** Completa la energía de un alimento: la informada si existe; si no, la calculada; si no se puede, desconocida. */
export function withEnergy(values: Nutrients): { values: Nutrients; energy: "reported" | "calculated" | "unknown" } {
  if (values.energyKcal != null) return { values, energy: "reported" };
  const e = atwater(values);
  return e == null ? { values, energy: "unknown" } : { values: { ...values, energyKcal: e }, energy: "calculated" };
}

export type QtyError = "invalid_amount" | "unit_mismatch" | "unknown_portion" | "needs_grams";
export class NutritionCalcError extends Error {
  constructor(public code: QtyError, message: string) { super(message); }
}
const QTY_TEXT: Record<QtyError, string> = {
  invalid_amount: "La cantidad tiene que ser un número mayor que cero.",
  unit_mismatch: "Esa unidad no corresponde a este alimento: elegí gramos o una porción de la lista.",
  unknown_portion: "Esa porción no está documentada para este alimento.",
  needs_grams: "Para calcular por gramos hace falta el peso final de la preparación.",
};
const fail = (c: QtyError): never => { throw new NutritionCalcError(c, QTY_TEXT[c]); };

/** Máximo razonable de una cantidad en la base (5 kg, 5 l, 50 unidades o porciones): evita errores de tipeo como 20000 g. */
export const MAX_AMOUNT: Record<string, number> = { g: 5000, ml: 5000, unidad: 50, porcion: 50, portion: 50 };

/**
 * Cuántas «bases» representa una cantidad. Reglas:
 * - misma unidad que la base: proporción directa;
 * - porción documentada: sus gramos sobre una base en gramos;
 * - gramos sobre una base por porción/unidad: sólo si la base declara sus gramos (receta con peso final, alimento propio con peso);
 * - ml sobre una base en gramos (o al revés): no, porque no asumimos densidades.
 */
export function basisFactor(food: Pick<FoodSnapshot, "basis" | "portions">, q: Quantity): number {
  if (!Number.isFinite(q.amount) || q.amount <= 0) fail("invalid_amount");
  const kind = q.unit.startsWith("portion:") ? "portion" : q.unit;
  if (q.amount > (MAX_AMOUNT[kind] ?? 50)) fail("invalid_amount");
  const b = food.basis;
  if (q.unit.startsWith("portion:")) {
    const p = food.portions[Number(q.unit.slice(8))];
    if (!p || !(p.grams > 0)) fail("unknown_portion");
    if (b.unit === "g") return (q.amount * p!.grams) / b.amount;
    if (b.grams && b.grams > 0) return (q.amount * p!.grams) / b.grams;
    return fail("unit_mismatch");
  }
  if (q.unit === b.unit) return q.amount / b.amount;
  if (q.unit === "g" && b.grams && b.grams > 0) return q.amount / b.grams;
  if (q.unit === "g") return fail(b.unit === "porcion" ? "needs_grams" : "unit_mismatch");
  return fail("unit_mismatch");
}

/** Gramos de una cantidad, si se pueden saber sin suponer nada; si no, null (p. ej. «1 unidad» de un alimento propio sin peso). */
export function gramsOf(food: Pick<FoodSnapshot, "basis" | "portions">, q: Quantity): number | null {
  if (q.unit === "g") return q.amount;
  if (q.unit.startsWith("portion:")) return r4(q.amount * (food.portions[Number(q.unit.slice(8))]?.grams ?? NaN)) || null;
  if (q.unit === food.basis.unit && food.basis.grams) return r4((q.amount / food.basis.amount) * food.basis.grams);
  return null;
}

/** Escala los valores: los desconocidos siguen desconocidos. */
export function scale(values: Nutrients, factor: number): Nutrients {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) out[k] = values[k] == null ? null : r4(values[k]! * factor);
  return out;
}

/** Nutrientes de una cantidad de un alimento. Lanza `NutritionCalcError` si la unidad no corresponde. */
export const nutrientsFor = (food: Pick<FoodSnapshot, "basis" | "portions" | "values">, q: Quantity) => scale(food.values, basisFactor(food, q));

const emptyCoverage = (): Coverage => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { known: 0, missing: 0 }])) as Coverage;

/**
 * Suma de varios ítems. Por nutriente: suma de los que lo informan y cuenta de los que no. Si ninguno lo informa, el total es
 * desconocido (null), no cero. Un total con `missing > 0` es parcial: la interfaz lo muestra como «al menos …».
 */
export function sumNutrients(list: readonly Nutrients[]): Totals {
  const values = emptyNutrients(), coverage = emptyCoverage();
  for (const n of list) for (const k of NUTRIENT_KEYS) {
    if (n[k] == null) { coverage[k].missing++; continue; }
    coverage[k].known++;
    values[k] = r4((values[k] ?? 0) + n[k]!);
  }
  return { values, coverage, items: list.length };
}

/** Un total es completo para un nutriente si hay al menos un ítem y todos lo informan. */
export const isComplete = (t: Totals, k: NutrientKey) => t.items > 0 && t.coverage[k].missing === 0;

/** Combina totales ya calculados (comidas → día). */
export function mergeTotals(list: readonly Totals[]): Totals {
  const values = emptyNutrients(), coverage = emptyCoverage();
  let items = 0;
  for (const t of list) {
    items += t.items;
    for (const k of NUTRIENT_KEYS) {
      coverage[k].known += t.coverage[k].known; coverage[k].missing += t.coverage[k].missing;
      if (t.values[k] != null) values[k] = r4((values[k] ?? 0) + t.values[k]!);
    }
  }
  return { values, coverage, items };
}

// ── Presentación (Res. GMC 46/03 §3.4.3) ──
/** Umbral bajo el cual se informa «0»: 4 kcal; 0,5 g macros y fibra/azúcares; 0,2 g saturadas; 5 mg sodio. */
const ZERO_BELOW: Record<NutrientKey, number> = { energyKcal: 4, proteinG: 0.5, carbsG: 0.5, fatG: 0.5, fiberG: 0.5, sugarsG: 0.5, satFatG: 0.2, sodiumMg: 5 };
/** Redondeo para mostrar: energía y sodio enteros; gramos con 1 decimal por debajo de 10 y enteros desde 10. */
export function roundForDisplay(k: NutrientKey, v: number | null): number | null {
  if (v == null) return null;
  if (v < ZERO_BELOW[k]) return 0;
  if (k === "energyKcal" || k === "sodiumMg") return Math.round(v);
  return v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
}
/** «32 g», «≥ 45 g» (parcial), «sin dato». */
export function fmtNutrient(k: NutrientKey, v: number | null, partial = false): string {
  const r = roundForDisplay(k, v);
  if (r == null) return "sin dato";
  const unit = k === "energyKcal" ? "kcal" : k === "sodiumMg" ? "mg" : "g";
  return `${partial ? "≥ " : ""}${r.toLocaleString("es-AR")} ${unit}`;
}

// ── Recetas ──
export type RecipeYield = { servings: number | null; finalWeightG: number | null };
/**
 * Total de una receta y valores por porción / por gramo cocido. No supone que el peso cocido sea la suma de los ingredientes
 * crudos: sin peso final, la receta sólo se consume por porciones; sin porciones ni peso, no se puede consumir una parte.
 */
export function recipeBasis(ingredients: readonly Nutrients[], y: RecipeYield): { totals: Totals; basis: FoodSnapshot["basis"]; values: Nutrients } {
  const totals = sumNutrients(ingredients);
  if (y.servings && y.servings > 0) {
    const per = scale(totals.values, 1 / y.servings);
    return { totals, basis: { amount: 1, unit: "porcion", grams: y.finalWeightG ? r4(y.finalWeightG / y.servings) : null }, values: per };
  }
  if (y.finalWeightG && y.finalWeightG > 0) return { totals, basis: { amount: 100, unit: "g" }, values: scale(totals.values, 100 / y.finalWeightG) };
  return { totals, basis: { amount: 1, unit: "porcion", grams: null }, values: totals.values }; // la receta entera = 1 porción
}
