// REPI Nutrition Assistant (D221): extensión del asistente existente (no una segunda IA). Clasifica preguntas sobre el diario
// y arma respuestas determinísticas con los datos reales: sin inventar alimentos, cantidades ni conclusiones; reconoce
// cuándo faltan datos y nunca atribuye causas ni prescribe.
import { fmtNutrient, isComplete } from "./calc";
import { INSUFFICIENT_DAY, NOT_MEDICAL, sensitiveKind, SENSITIVE_REPLY, type SensitiveKind } from "./policy";
import { MIN_DAYS_FOR_AVERAGE, type NutritionTargets, type PeriodSummary, type DayStatus } from "./progress";
import { MEAL_LABEL, type Meal, type NutrientKey, type Totals } from "./types";

export type NutritionAsk =
  | { kind: "sensitive"; sensitive: SensitiveKind }
  | { kind: "log"; text: string; meal: Meal | null }
  | { kind: "today"; nutrient: NutrientKey | null }
  | { kind: "day_list"; offset: 0 | 1 }
  | { kind: "meal"; meal: Meal; offset: 0 | 1 }
  | { kind: "week" }
  | { kind: "pre_workout" }
  | { kind: "best_days" }
  | { kind: "plan_tomorrow" }
  | { kind: "why" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;]/g, " ").replace(/\s+/g, " ").trim();
const MEAL_RE: [RegExp, Meal][] = [[/\bdesayuno\b/, "desayuno"], [/\balmuerzo\b/, "almuerzo"], [/\bmerienda\b/, "merienda"], [/\bcena\b/, "cena"], [/\bcolacion\b/, "colacion"]];
const NUTRIENT_RE: [RegExp, NutrientKey][] = [[/\bproteinas?\b/, "proteinG"], [/\b(calorias|kcal|energia)\b/, "energyKcal"], [/\b(carbohidratos|carbos|hidratos)\b/, "carbsG"], [/\bgrasas?\b/, "fatG"], [/\bfibra\b/, "fiberG"]];
const FOOD_WORDS = /\b(comi|comida|comidas|desayun\w*|almorc\w*|almuerzo|merend\w*|merienda|cen[eo]|cena|colacion|proteinas?|calorias|kcal|carbohidratos|grasas|macros|aliment\w*|nutricion|diario de comidas|registr\w* (de )?comidas?)\b/;

/** ¿Es una consulta del diario de comidas? null si no tiene que ver con Nutrición. */
export function classifyNutrition(text: string): NutritionAsk | null {
  const t = norm(text);
  const s = sensitiveKind(text);
  if (s && (FOOD_WORDS.test(t) || /\b(comer|dieta|nutri|suplement|creatina|embaraz|ayun)/.test(t))) return { kind: "sensitive", sensitive: s };
  const meal = MEAL_RE.find(([re]) => re.test(t))?.[1] ?? null;
  if (/^(agrega|agregame|anota|anotame|suma|sumame|registra|registrame|carga|cargame|pone|poneme)\b/.test(t) && !/\b(serie|series|kilos? al|ejercicio|rutina)\b/.test(t))
    return { kind: "log", text, meal };
  if (/\bpor que\b.*\b(recomend|mostras|muestras|decis|sugeris)/.test(t) && /\b(comida|nutri|proteina|aliment|recomendacion)/.test(t)) return { kind: "why" };
  if (/\b(organiza|organizar|planifica|planificar|armame|ayudame a (organizar|planificar|armar))\b.*\b(comidas?|menu|alimentacion)\b/.test(t)) return { kind: "plan_tomorrow" };
  if (/\bantes de entrenar\b|\bantes del entrenamiento\b|\bpre ?entreno\b/.test(t) && /\b(comi|comidas?|registr)/.test(t)) return { kind: "pre_workout" };
  if (/\bque dias\b.*\b(objetivo|mejor)/.test(t)) return { kind: "best_days" };
  if (/\b(como vengo|como voy|resumen)\b.*\b(semana|semanal|alimentacion|comidas|nutricion)\b|\bsemana\b.*\b(comidas|alimentacion|proteina|nutricion)\b/.test(t)) return { kind: "week" };
  const offset: 0 | 1 = /\bayer\b/.test(t) ? 1 : 0;
  if (meal && /\b(cuanto tiene|cuantas? (calorias|proteinas?)|que tiene|macros)\b/.test(t)) return { kind: "meal", meal, offset };
  if (/\bque comi\b|\bque registre\b|\bmis comidas\b/.test(t)) return { kind: "day_list", offset };
  const nutrient = NUTRIENT_RE.find(([re]) => re.test(t))?.[1] ?? null;
  if (nutrient && /\b(cuant[ao]s?|llevo|consumi|comi|registre|tengo|voy)\b/.test(t)) return { kind: "today", nutrient };
  if (/\b(cuanto comi|que comi hoy|llevo hoy)\b/.test(t)) return { kind: "today", nutrient: null };
  return null;
}

export const sensitiveAnswer = (k: SensitiveKind) => SENSITIVE_REPLY[k];

const partialNote = (t: Totals, k: NutrientKey) => (isComplete(t, k) ? "" : t.coverage[k].known ? " (algún alimento no informa este dato: es un mínimo)" : "");

/** Totales del día con la salvedad de que un día parcial no es todo lo que la persona comió. */
export function answerToday(t: Totals, status: DayStatus, nutrient: NutrientKey | null, targets: NutritionTargets): string {
  if (t.items === 0) return "Hoy todavía no registraste comidas. Cuando quieras, las anotás en Nutrición.";
  const keys: NutrientKey[] = nutrient ? [nutrient] : ["proteinG", "energyKcal", "carbsG", "fatG"];
  const parts = keys.map((k) => `${k === "proteinG" ? "proteína" : k === "energyKcal" ? "energía" : k === "carbsG" ? "carbohidratos" : k === "fatG" ? "grasas" : "fibra"}: ${fmtNutrient(k, t.values[k], !isComplete(t, k))}${partialNote(t, k)}`);
  const goal = nutrient && nutrient in targets ? ` Tu objetivo: ${fmtNutrient(nutrient, (targets as Record<string, { value: number }>)[nutrient].value)}.` : "";
  const caveat = status === "complete" ? "" : ` Es lo registrado hasta ahora${status === "partial" ? ", no necesariamente todo lo que comiste" : ""}.`;
  return `Hoy registraste ${parts.join(", ")}.${goal}${caveat}`;
}

export function answerWeek(s: Pick<PeriodSummary, "days" | "loggedDays" | "completeDays" | "trends">, targets: NutritionTargets, consistency: Record<string, { met: number; of: number } | null>, workouts: number): string {
  if (!s.loggedDays) return `En los últimos ${s.days} días no registraste comidas${workouts ? ` (sí ${workouts} ${workouts === 1 ? "entrenamiento" : "entrenamientos"})` : ""}. No puedo decir nada de tu alimentación sin registros.`;
  const base = `En los últimos ${s.days} días registraste comidas en ${s.loggedDays} ${s.loggedDays === 1 ? "día" : "días"} y marcaste ${s.completeDays} como ${s.completeDays === 1 ? "completo" : "completos"}; entrenaste ${workouts} ${workouts === 1 ? "vez" : "veces"}.`;
  if (s.completeDays < MIN_DAYS_FOR_AVERAGE) return `${base} Con menos de ${MIN_DAYS_FOR_AVERAGE} días completos todavía no calculo promedios: un día parcial no muestra todo lo que comiste.`;
  const p = s.trends.proteinG, e = s.trends.energyKcal;
  const avg = [p.average != null ? `proteína ${fmtNutrient("proteinG", p.average)} por día (${p.usableDays} días)` : null, e.average != null ? `energía ${fmtNutrient("energyKcal", e.average)} (${e.usableDays} días)` : null].filter(Boolean).join(" y ");
  const cons = Object.entries(consistency).filter(([, v]) => v).map(([k, v]) => `${k === "proteinG" ? "proteína" : k === "energyKcal" ? "energía" : k === "carbsG" ? "carbohidratos" : "grasas"} en ${v!.met} de ${v!.of}`);
  return `${base} En los días completos: ${avg || "sin datos suficientes"}.${cons.length ? ` Cumpliste tu objetivo de ${cons.join(", ")} días completos.` : Object.keys(targets).length ? "" : " No tenés objetivos cargados: si querés, los definís en Nutrición → Ajustes."}`;
}

export function answerMeal(meal: Meal, t: Totals, offset: 0 | 1): string {
  const when = offset ? "ayer" : "hoy";
  if (!t.items) return `No registraste ${MEAL_LABEL[meal].toLowerCase()} ${when}.`;
  return `Tu ${MEAL_LABEL[meal].toLowerCase()} de ${when}: ${(["energyKcal", "proteinG", "carbsG", "fatG"] as const).map((k) => fmtNutrient(k, t.values[k], !isComplete(t, k))).join(" · ")} (${t.items} ${t.items === 1 ? "alimento" : "alimentos"}).`;
}

export function answerDayList(items: { meal: Meal; names: string[] }[], offset: 0 | 1): string {
  const when = offset ? "Ayer" : "Hoy";
  if (!items.length) return `${when} no registraste comidas.`;
  return `${when} registraste: ${items.map((i) => `${MEAL_LABEL[i.meal].toLowerCase()} (${i.names.slice(0, 5).join(", ")}${i.names.length > 5 ? "…" : ""})`).join("; ")}. Es lo registrado, no necesariamente todo lo que comiste.`;
}

/** Organizar mañana: herramientas generales según las preferencias declaradas. Sin dieta, sin números impuestos. */
export function answerPlanTomorrow(p: { mealsPerDay?: number | null; cooking?: string | null; nextDay: string | null; favorites: string[] }): string {
  const meals = p.mealsPerDay ? `Contaste que solés hacer ${p.mealsPerDay} comidas: podés anotarlas como base.` : "Pensá cuántas comidas solés hacer y en qué horarios.";
  const cook = p.cooking === "none" ? "Como casi no cocinás, sirve tener a mano opciones listas (yogur, frutas, sándwiches, conservas)." : p.cooking === "often" ? "Si cocinás seguido, cocinar de más hoy te resuelve parte de mañana." : "Dejar algo preparado la noche anterior suele ahorrar tiempo.";
  const train = p.nextDay ? ` Si mañana entrenás (te toca ${p.nextDay}), fijate en qué momento del día te queda cómodo comer antes y después.` : "";
  const fav = p.favorites.length ? ` Tus favoritas guardadas (${p.favorites.slice(0, 3).join(", ")}) se registran en un toque.` : "";
  return `${meals} ${cook}${train}${fav} Si necesitás un plan con cantidades, eso lo define un profesional de la nutrición.`;
}

export const WHY_TEXT = `Todo lo que te muestro sale de tus registros: sumo los valores de cada alimento (de la biblioteca de REPI, de la etiqueta o de lo que cargaste), sin estimarlos con IA. Los promedios usan sólo los días que marcaste completos, y los objetivos son los que definiste vos o tu profesional. ${NOT_MEDICAL}`;
export const INSUFFICIENT = INSUFFICIENT_DAY;
