// Biblioteca de alimentos de REPI (D221): alimentos genéricos con valores de USDA FoodData Central SR Legacy (dominio público,
// CC0), con nombre rioplatense, estado crudo/cocido y porciones documentadas por la fuente. Versionada en el código: cada
// registro guarda una copia de los valores usados, así que una nueva versión no reescribe el historial.
import { r4, withEnergy } from "./calc";
import type { FoodSnapshot, FoodState, Nutrients, Portion } from "./types";

export const CATALOG_SOURCE = { id: "usda-sr-legacy", label: "USDA FoodData Central (SR Legacy)", version: "2018-04" } as const;
export const CATALOG_ATTRIBUTION = "Valores de USDA FoodData Central, SR Legacy (abril 2018), dominio público. REPI no está avalado por el USDA.";

export const FOOD_CATEGORIES = ["carnes", "aves", "pescados", "huevos", "lacteos", "cereales", "panificados", "pastas", "legumbres", "verduras", "frutas", "frutos-secos", "aceites-grasas", "bebidas", "dulces-snacks", "preparaciones", "otros"] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export type CatalogFood = {
  slug: string;
  name: string;
  aliases: string[];
  category: FoodCategory;
  state: FoodState;
  fdcId: number;
  usdaDescription: string;
  per100g: Nutrients;
  portions: (Portion & { usda?: string })[];
  note?: string | null;
  match: "exact" | "approx";
};

export const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["de", "del", "la", "el", "los", "las", "con", "en", "a", "al", "y", "un", "una"]);
const tokens = (s: string) => normalize(s).split(" ").filter((t) => t && !STOP.has(t));
/** Plural y género simples del español: «huevos» → «huev», «nueces» → «nuez», «cocida»/«cocido» → «cocid». */
const stem = (t: string) => {
  let w = t.length > 4 && t.endsWith("ces") ? `${t.slice(0, -3)}z` : t.length > 4 && /[^aeiou]es$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
  if (w.length > 4 && /[ao]$/.test(w)) w = w.slice(0, -1);
  return w;
};

export type SearchHit = { food: CatalogFood; score: number };

/**
 * Búsqueda local y determinística. Puntaje: alias exacto > nombre que empieza igual > todas las palabras presentes > prefijos.
 * Sin coincidencia razonable no devuelve nada (no «adivina» un alimento).
 */
export function searchFoods(catalog: readonly CatalogFood[], query: string, limit = 12): SearchHit[] {
  const q = normalize(query), qt = tokens(query).map(stem);
  if (!q || !qt.length) return [];
  const hits: SearchHit[] = [];
  for (const f of catalog) {
    const names = [f.name, ...f.aliases].map(normalize);
    let s = 0;
    if (names.some((n) => n === q)) s = 100;
    else if (names.some((n) => n.startsWith(q))) s = 85;
    else {
      const words = new Set(names.flatMap((n) => n.split(" ").map(stem)));
      const all = qt.every((t) => words.has(t));
      const pre = qt.filter((t) => [...words].some((w) => w.startsWith(t) && t.length >= 3)).length;
      if (all) s = 70; else if (pre === qt.length) s = 55; else if (pre > 0 && qt.length > 1) s = 30 * (pre / qt.length);
    }
    if (s > 0) hits.push({ food: f, score: s + (f.match === "exact" ? 1 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, "es")).slice(0, limit);
}

/** Copia que se guarda con el registro. Energía: la informada; si falta, calculada con Atwater; si no, desconocida. */
export function catalogSnapshot(f: CatalogFood): FoodSnapshot {
  const { values, energy } = withEnergy(f.per100g);
  return {
    kind: "catalog", refId: f.slug, name: f.name, state: f.state,
    basis: { amount: 100, unit: "g" }, values, energy,
    portions: f.portions.map((p) => ({ label: p.label, grams: r4(p.grams) })),
    source: { ...CATALOG_SOURCE, sourceId: String(f.fdcId), url: `https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients`, match: f.match, attribution: CATALOG_ATTRIBUTION },
    note: f.note ?? null,
  };
}

export const STATE_LABEL: Record<FoodState, string | null> = { raw: "crudo", cooked: "cocido", na: null };
