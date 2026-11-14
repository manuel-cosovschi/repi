// Interpretación de texto natural (D221), determinística y sin IA: «Almorcé 200 gramos de pollo, arroz y una ensalada».
// Devuelve una PROPUESTA editable: alimentos candidatos, cantidades leídas y lo que falta aclarar. Nunca guarda nada ni
// convierte una descripción ambigua en un dato preciso.
import { normalize, searchFoods, type CatalogFood } from "./catalog";
import type { Meal, Quantity } from "./types";

export type ParseIssue = "no_match" | "no_quantity" | "ambiguous_state" | "unit_unavailable";
export type ParsedItem = {
  text: string;
  query: string;
  /** Mejores coincidencias (máximo 3). La primera es la sugerida; la persona confirma o elige otra. */
  candidates: CatalogFood[];
  quantity: Quantity | null;
  /** Lo que la persona escribió como cantidad, para mostrarlo tal cual («una taza», «200 g»). */
  quantityText: string | null;
  issues: ParseIssue[];
};
export type ParsedText = { meal: Meal | null; items: ParsedItem[] };

const MEAL_WORDS: [RegExp, Meal][] = [
  [/\b(desayun\w*)\b/, "desayuno"], [/\b(almorz\w*|almorc\w*|almuerzo)\b/, "almuerzo"], [/\b(merend\w*|merienda)\b/, "merienda"],
  [/\b(cen[eéoa]\w*|cena)\b/, "cena"], [/\b(colaci\w*|snack|picote\w*)\b/, "colacion"],
];
const NUM_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, media: 0.5, medio: 0.5, cuarto: 0.25 };
const UNIT_WORDS: [RegExp, "g" | "kg" | "ml" | "l" | "household"][] = [
  [/^(g|gr|grs|gramos?)$/, "g"], [/^(kg|kilos?|kilogramos?)$/, "kg"], [/^(ml|cc|mililitros?)$/, "ml"], [/^(l|litros?)$/, "l"],
  [/^(tazas?|vasos?|cucharadas?|cucharaditas?|rebanadas?|fetas?|porci[oó]n(es)?|platos?|unidades?|filetes?|pechugas?|latas?|potes?|rodajas?)$/, "household"],
];
const HOUSE: Record<string, string[]> = {
  taza: ["taza", "cup"], vaso: ["vaso", "taza", "cup"], cucharada: ["cucharada", "tbsp"], cucharadita: ["cucharadita", "tsp"], rebanada: ["rebanada", "feta", "slice"],
  feta: ["feta", "rebanada", "slice"], porcion: ["porcion", "porción"], plato: ["plato"], unidad: ["unidad", "mediana", "mediano", "grande", "chica"],
  filete: ["filete"], pechuga: ["pechuga", "unidad"], lata: ["lata"], pote: ["pote", "envase"], rodaja: ["rodaja", "rebanada"],
};
const singular = (w: string) => w.replace(/es$/, "").replace(/s$/, "").replace("porcion", "porcion");

/** Divide la frase en ítems: comas, «y», «con», «+», «más». */
export function splitItems(text: string): string[] {
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/(\d),(\d)/g, "$1.$2");
  return plain.replace(/\b(desayun\w*|almorz\w*|almorc\w*|merend\w*|cene\w*|comi|tome|me (comi|tome))\b/gi, ",")
    .split(/,|;|\+|\by\b|\bcon\b|\bm[aá]s\b|\be\b/i).map((s) => s.trim()).filter((s) => s.length > 1);
}

function readQuantity(chunk: string): { amount: number | null; unit: "g" | "ml" | "count" | "household" | null; house: string | null; rest: string; text: string | null } {
  const words = chunk.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/(\d),(\d)/g, "$1.$2").replace(/[^a-z0-9ñ./ ]+/g, " ").replace(/\s+/g, " ").trim().replace(/(\d)\s*(g|gr|grs|kg|ml|cc)\b/g, "$1 $2").split(" ");
  let i = 0, amount: number | null = null;
  const w0 = words[0] ?? "";
  if (/^\d+(\.\d+)?$/.test(w0)) { amount = Number(w0); i = 1; }
  else if (/^\d+\/\d+$/.test(w0)) { const [a, b] = w0.split("/").map(Number); amount = b ? a / b : null; i = 1; }
  else if (w0 in NUM_WORDS) { amount = NUM_WORDS[w0]; i = 1; if (words[1] === "y" && words[2] === "medio") { amount += 0.5; i = 3; } }
  let unit: "g" | "ml" | "count" | "household" | null = null, house: string | null = null;
  const u = words[i] ?? "";
  for (const [re, kind] of UNIT_WORDS) if (re.test(u)) {
    i++;
    if (kind === "kg") { unit = "g"; amount = amount == null ? null : amount * 1000; }
    else if (kind === "l") { unit = "ml"; amount = amount == null ? null : amount * 1000; }
    else if (kind === "household") { unit = "household"; house = singular(u); }
    else unit = kind;
    break;
  }
  if (amount != null && unit == null) unit = "count";
  if (words[i] === "de") i++;
  const text = i > 0 ? words.slice(0, i).filter((w) => w !== "de").join(" ") : null;
  return { amount, unit, house, rest: words.slice(i).join(" "), text };
}

/** Busca una porción de la fuente cuya etiqueta corresponda a la medida casera escrita. Si no hay, no inventa gramos. */
function portionIndex(food: CatalogFood, house: string): number {
  const keys = HOUSE[house] ?? [house];
  return food.portions.findIndex((p) => keys.some((k) => normalize(p.label).includes(normalize(k))));
}

export function parseFoodText(catalog: readonly CatalogFood[], text: string): ParsedText {
  const n = normalize(text);
  const meal = MEAL_WORDS.find(([re]) => re.test(n))?.[1] ?? null;
  const items: ParsedItem[] = [];
  for (const chunk of splitItems(text).slice(0, 12)) {
    const q = readQuantity(chunk);
    const query = q.rest.trim();
    if (!query) continue;
    const hits = searchFoods(catalog, query, 6);
    const issues: ParseIssue[] = [];
    if (!hits.length) issues.push("no_match");
    const top = hits.filter((h) => h.score >= hits[0]?.score - 0.5);
    if (top.length > 1 && new Set(top.map((h) => h.food.state)).size > 1) issues.push("ambiguous_state");
    const best = hits[0]?.food ?? null;
    let quantity: Quantity | null = null;
    if (q.amount == null) issues.push("no_quantity");
    else if (q.unit === "g" || q.unit === "ml") {
      if (q.unit === "ml") issues.push("unit_unavailable"); // la base es por 100 g: sin densidad documentada no se convierte
      else quantity = { amount: q.amount, unit: "g" };
    } else if (best) {
      const idx = portionIndex(best, q.unit === "household" ? q.house! : "unidad");
      if (idx >= 0) quantity = { amount: q.amount, unit: `portion:${idx}` };
      else issues.push("unit_unavailable");
    }
    items.push({ text: chunk, query, candidates: hits.slice(0, 3).map((h) => h.food), quantity, quantityText: q.text, issues });
  }
  return { meal, items };
}

export const PARSE_ISSUE_TEXT: Record<ParseIssue, string> = {
  no_match: "No lo encontramos en la biblioteca: buscalo con otro nombre o cargalo a mano.",
  no_quantity: "¿Cuánto comiste? Indicá gramos o una porción.",
  ambiguous_state: "¿Crudo o cocido? El peso y los valores cambian mucho.",
  unit_unavailable: "Esa medida no tiene una equivalencia documentada para este alimento: indicá los gramos.",
};
