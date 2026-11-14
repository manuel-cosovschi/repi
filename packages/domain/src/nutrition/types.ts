// REPI Nutrition Intelligence 1.0 (D221): tipos del motor determinístico de nutrientes. Todo cálculo de energía y macros sale de
// valores estructurados (base de alimentos, etiqueta, carga manual); nunca de un modelo de lenguaje.
// Regla central: un dato desconocido es `null`, nunca 0. Un total con faltantes se informa como parcial, no como completo.

export const NUTRIENT_KEYS = ["energyKcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarsG", "satFatG", "sodiumMg"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
/** Valores de un alimento para una base (100 g, 100 ml, 1 porción…). `null` = la fuente no lo informa. */
export type Nutrients = Record<NutrientKey, number | null>;
export const MAIN_KEYS = ["energyKcal", "proteinG", "carbsG", "fatG"] as const satisfies readonly NutrientKey[];

export const NUTRIENT_LABEL: Record<NutrientKey, { label: string; unit: "kcal" | "g" | "mg" }> = {
  energyKcal: { label: "Energía", unit: "kcal" },
  proteinG: { label: "Proteínas", unit: "g" },
  carbsG: { label: "Carbohidratos", unit: "g" },
  fatG: { label: "Grasas", unit: "g" },
  fiberG: { label: "Fibra", unit: "g" },
  sugarsG: { label: "Azúcares", unit: "g" },
  satFatG: { label: "Grasas saturadas", unit: "g" },
  sodiumMg: { label: "Sodio", unit: "mg" },
};

export const emptyNutrients = (): Nutrients => ({ energyKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, sugarsG: null, satFatG: null, sodiumMg: null });

/** Unidad de la base de valores y de la cantidad registrada. `unidad` y `porcion` sólo valen si la base es esa misma unidad. */
export type BasisUnit = "g" | "ml" | "unidad" | "porcion";
export type FoodState = "raw" | "cooked" | "na";
export type EnergySource = "reported" | "calculated" | "unknown";

/** Porción doméstica documentada por la fuente: «1 taza» = 158 g. Nunca se inventa una equivalencia. */
export type Portion = { label: string; grams: number };

export type FoodSourceId = "usda-sr-legacy" | "open-food-facts" | "repi-user" | "repi-recipe";
export type FoodSource = {
  id: FoodSourceId;
  /** Texto que se muestra: «USDA FoodData Central (SR Legacy)», «Open Food Facts», «Cargado por vos». */
  label: string;
  /** Versión del conjunto de datos o de la carga (p. ej. «2018-04», «off:2026-11-14», «v3»). */
  version: string;
  /** Identificador en la fuente (fdcId, código de barras, id del alimento propio o de la receta). */
  sourceId: string | null;
  url?: string | null;
  /** Coincidencia con la denominación local: exacta o aproximada (p. ej. un corte argentino con su equivalente USDA). */
  match?: "exact" | "approx";
  /** Licencia u obligación de atribución (Open Food Facts: ODbL). */
  attribution?: string | null;
};

/**
 * Lo que se guarda con cada registro: una copia de la información nutricional usada en ese momento. Si la fuente cambia
 * después, el historial no cambia en silencio (corrección explícita: `correctEntry`).
 */
export type FoodSnapshot = {
  kind: "catalog" | "custom" | "recipe" | "barcode";
  refId: string;
  name: string;
  state: FoodState;
  basis: { amount: number; unit: BasisUnit; /** gramos de la base cuando se conocen (p. ej. una receta con peso final) */ grams?: number | null };
  values: Nutrients;
  energy: EnergySource;
  portions: Portion[];
  source: FoodSource;
  note?: string | null;
};

/** Cantidad registrada: una unidad compatible con la base o una porción documentada (`portion:<índice>`). */
export type QtyUnit = BasisUnit | `portion:${number}`;
export type Quantity = { amount: number; unit: QtyUnit };

export const MEALS = ["desayuno", "almuerzo", "merienda", "cena", "colacion", "otra"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABEL: Record<Meal, string> = { desayuno: "Desayuno", almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena", colacion: "Colación", otra: "Otra comida" };
export const isMeal = (x: unknown): x is Meal => typeof x === "string" && (MEALS as readonly string[]).includes(x);

/** Cobertura de un total: cuántos ítems informan el nutriente y cuántos no. */
export type Coverage = Record<NutrientKey, { known: number; missing: number }>;
export type Totals = { values: Nutrients; coverage: Coverage; items: number };
