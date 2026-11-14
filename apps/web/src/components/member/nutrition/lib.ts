"use client";
// REPI Nutrition Intelligence 1.0 (D221) · tipos de la API y utilidades de presentación de la sección Nutrición del alumno.
// Todo cálculo sale del motor determinístico de @repi/domain (los mismos que usa el servidor): acá sólo se presenta.
import { useEffect, useState } from "react";
import {
  fmtNutrient, gramsOf, isComplete, localDate, MEAL_LABEL, nutrientsFor, STATE_LABEL,
  type FoodSnapshot, type Meal, type NutrientKey, type Nutrients, type Quantity, type Totals,
} from "@repi/domain";
import { ApiError } from "@/lib/api";
import { idbGet, idbPut } from "@/lib/offline/idb";

// ── Tipos de las respuestas de /api/me/nutrition ──
export type NutriState = { enabled: false } | { enabled: true; eligible: boolean; reason: "minor" | "age_required" | null; scan: boolean };
export type Entry = { id: string; day: string; meal: Meal; food: FoodSnapshot; quantity: Quantity; grams: number | null; nutrients: Nutrients; revision: number; pending?: boolean };
export type TargetKey = "energyKcal" | "proteinG" | "carbsG" | "fatG";
export type Mode = "min" | "approx" | "max";
export type Targets = Partial<Record<TargetKey, { value: number; mode: Mode }>>;
export type DayView = {
  day: string; status: "empty" | "partial" | "complete"; complete: boolean;
  meals: { meal: Meal; entries: Entry[]; totals: Totals }[]; totals: Totals; targets: Targets; targetSource: "self" | "professional" | null; note: string | null;
};
export type Recent = { food: FoodSnapshot; quantity: Quantity; meal: Meal; uses: number };
export type Favorite = { id: string; name: string; meal: Meal; items: { food: FoodSnapshot; quantity: Quantity }[]; uses: number; totals: Totals };
export type Quick = { recent: Recent[]; favorites: Favorite[]; last?: FoodSnapshot[] };
export type Goal = "habits" | "organize" | "track" | "protein" | "strength" | "sport" | "professional";
export type Prefs = {
  likes?: string[]; avoid?: string[]; choices?: string[]; mealsPerDay?: number | null; schedule?: string | null;
  cooking?: "none" | "some" | "often" | null; budget?: "tight" | "medium" | "flexible" | null; culture?: string | null; difficulties?: string[];
};
export type Profile = { goal: Goal | null; prefs: Prefs; targets: Targets; targetSource: "self" | "professional" | null; reminders: boolean; proactive: boolean; onboarded: boolean; revision: number };
export type Recipe = {
  id: string; name: string; servings: number | null; finalWeightG: number | null; revision: number;
  ingredients: { ref: { kind: FoodSnapshot["kind"]; id: string }; quantity: Quantity; food: FoodSnapshot; nutrients: Nutrients; grams: number | null }[];
  totals: Totals; food: FoodSnapshot;
};

export const BASE = "/api/me/nutrition";
export const MAIN: TargetKey[] = ["energyKcal", "proteinG", "carbsG", "fatG"];
export const SHORT: Record<TargetKey, string> = { energyKcal: "Energía", proteinG: "Proteína", carbsG: "Carbohidratos", fatG: "Grasas" };
export const MODE_LABEL: Record<Mode, string> = { min: "mínimo", approx: "aproximado", max: "máximo" };
export const GOALS: [Goal, string][] = [
  ["habits", "Mejorar mis hábitos"], ["organize", "Ordenar mis comidas"], ["track", "Sólo registrar"], ["protein", "Llegar a mi proteína"],
  ["strength", "Acompañar mi entrenamiento de fuerza"], ["sport", "Rendir en mi deporte"], ["professional", "Seguir lo que me indicó un profesional"],
];

// ── Fechas ──
export const today = () => localDate(new Date());
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const fmtDay = (o: Intl.DateTimeFormatOptions) => (d: string) => new Intl.DateTimeFormat("es-AR", { ...o, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
export const dayShort = fmtDay({ day: "numeric", month: "short" });
export const dayLong = fmtDay({ weekday: "long", day: "numeric", month: "long" });
export function dayTitle(d: string) {
  const t = today();
  if (d === t) return "Hoy";
  if (d === addDays(t, -1)) return "Ayer";
  const s = dayLong(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Comida sugerida por la hora (Buenos Aires): <11 desayuno, <15 almuerzo, <19 merienda, <23 cena, si no colación. */
export function mealByHour(now = new Date()): Meal {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false }).format(now)) % 24;
  return h < 11 ? "desayuno" : h < 15 ? "almuerzo" : h < 19 ? "merienda" : h < 23 ? "cena" : "colacion";
}
export const mealName = (m: Meal) => MEAL_LABEL[m];

// ── Números ──
const nf = (n: number, max = 1) => n.toLocaleString("es-AR", { maximumFractionDigits: max });
export const num = nf;
/** Valor de un total: «≥ 45 g» si algún ítem no lo informa, «sin dato» si ninguno. */
export function fmtTotal(t: Totals, k: NutrientKey) {
  if (t.items === 0) return "—";
  return fmtNutrient(k, t.values[k], !isComplete(t, k) && t.coverage[k].known > 0);
}
/** «245 kcal · 12 g proteína» de un ítem (sin dato si falta). */
export function kcalProt(n: Nutrients) {
  return `${fmtNutrient("energyKcal", n.energyKcal)} · ${fmtNutrient("proteinG", n.proteinG)} proteína`;
}

// ── Unidades y cantidades ──
export type UnitOpt = { unit: Quantity["unit"]; label: string; step: string };
/**
 * Unidades válidas para un alimento: la de su base, gramos si la base es en gramos o declara sus gramos, y cada porción
 * documentada (sólo si se puede pasar a gramos). Nunca ml para un alimento en gramos: no suponemos densidades.
 */
export function unitOptions(f: FoodSnapshot): UnitOpt[] {
  const b = f.basis, out: UnitOpt[] = [];
  const grams = b.unit === "g" || (b.grams != null && b.grams > 0);
  if (grams) out.push({ unit: "g", label: "gramos", step: "1" });
  if (b.unit === "ml") out.push({ unit: "ml", label: "ml", step: "1" });
  if (b.unit === "unidad") out.push({ unit: "unidad", label: "unidades", step: "0.5" });
  if (b.unit === "porcion") out.push({ unit: "porcion", label: "porciones", step: "0.5" });
  if (grams) f.portions.forEach((p, i) => { if (p.grams > 0) out.push({ unit: `portion:${i}`, label: `${p.label} (${nf(p.grams)} g)`, step: "0.5" }); });
  return out;
}
export function defaultQty(f: FoodSnapshot): Quantity {
  const opts = unitOptions(f);
  const ps = opts.filter((o) => o.unit.startsWith("portion:"));
  // La porción más «típica» si la fuente la nombra (unidad mediana, una porción); si no, la primera documentada.
  const portion = ps.find((o) => /median/i.test(o.label)) ?? ps.find((o) => /^1 (unidad|porci)/i.test(o.label) && !/extra|chic|grand/i.test(o.label)) ?? ps[0];
  if (portion) return { amount: 1, unit: portion.unit };
  if (f.basis.unit === "g") return { amount: 100, unit: "g" };
  if (f.basis.unit === "ml") return { amount: f.basis.amount || 100, unit: "ml" };
  return { amount: 1, unit: f.basis.unit };
}
/** «150 g», «2 unidades», «1 × 1 unidad mediana (118 g)». */
export function qtyText(f: FoodSnapshot, q: Quantity, grams?: number | null) {
  const a = nf(q.amount, 2);
  if (q.unit === "g") return `${a} g`;
  if (q.unit === "ml") return `${a} ml`;
  const g = grams ?? safeGrams(f, q);
  const gTxt = g ? ` (${nf(g, 0)} g)` : "";
  if (q.unit === "unidad") return `${a} ${q.amount === 1 ? "unidad" : "unidades"}${gTxt}`;
  if (q.unit === "porcion") return `${a} ${q.amount === 1 ? "porción" : "porciones"}${gTxt}`;
  const p = f.portions[Number(q.unit.slice(8))];
  return p ? `${a} × ${p.label}${gTxt}` : `${a} porción`;
}
const safeGrams = (f: FoodSnapshot, q: Quantity) => { try { return gramsOf(f, q); } catch { return null; } };
/** Nutrientes de una cantidad o el mensaje de por qué no se puede calcular. */
export function tryNutrients(f: FoodSnapshot, q: Quantity): { ok: true; n: Nutrients } | { ok: false; message: string } {
  try { return { ok: true, n: nutrientsFor(f, q) }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Revisá la cantidad." }; }
}
export const parseAmount = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
export const basisText = (f: FoodSnapshot) => {
  const b = f.basis;
  if (b.unit === "g" || b.unit === "ml") return `${nf(b.amount)} ${b.unit}`;
  return `${nf(b.amount)} ${b.unit === "unidad" ? (b.amount === 1 ? "unidad" : "unidades") : b.amount === 1 ? "porción" : "porciones"}${b.grams ? ` (${nf(b.grams, 0)} g)` : ""}`;
};
export const stateLabel = (f: FoodSnapshot) => STATE_LABEL[f.state];
/** Línea de la fuente: «Valores por 100 g según USDA FoodData Central (SR Legacy), versión 2018-04». */
export function sourceLine(f: FoodSnapshot) {
  const src = f.source.id === "repi-user" ? "cargados por vos" : f.source.id === "repi-recipe" ? "calculados con los ingredientes de tu receta" : `según ${f.source.label}`;
  const ver = f.source.id === "usda-sr-legacy" || f.source.id === "open-food-facts" ? ` (versión ${f.source.version.replace(/^off:/, "consultada el ")})` : "";
  const energy = f.energy === "calculated" ? " Energía calculada con los factores de Atwater (la fuente no la informa)." : f.energy === "unknown" ? " Energía sin dato." : "";
  return `Valores por ${basisText(f)} ${src}${ver}.${energy}`;
}

// ── Errores ──
export const isNetwork = (e: unknown) => !(e instanceof ApiError) || e.status >= 500 || e.status === 429;
export const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Sin conexión: probá de nuevo cuando vuelva la red.");

// ── Conexión ──
/** Conexión del navegador (eventos online/offline) combinada con lo que sabe la app. */
export function useOnline(appOffline?: boolean) {
  const [on, setOn] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on && !appOffline;
}

// ── Estado del módulo (para mostrar la sección) ──
const STATE_KEY = "nutri:state";
/**
 * GET /state. Un 404 u otra respuesta del servidor: oculto (y se olvida lo guardado). Sin conexión: el último estado que
 * respondió el servidor en este dispositivo (se borra al cerrar sesión con el resto del almacén local), para poder
 * registrar sin red después de recargar.
 */
export async function loadNutritionState(fetcher: (p: string) => Promise<unknown>): Promise<NutriState> {
  try {
    const s = (await fetcher(`${BASE}/state`)) as NutriState;
    await idbPut("kv", s, STATE_KEY).catch(() => undefined);
    return s;
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) { await idbPut("kv", { enabled: false }, STATE_KEY).catch(() => undefined); return { enabled: false }; }
    return (await idbGet<NutriState>("kv", STATE_KEY).catch(() => undefined)) ?? { enabled: false };
  }
}
