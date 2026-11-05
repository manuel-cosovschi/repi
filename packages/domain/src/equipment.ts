// D195 · Catálogo de equipamiento por sede (bloque 05/06) y cargas disponibles para Training Intelligence.
// El motor de progresión no cambia (TRAINING_INTELLIGENCE_2.md §8 quater): sólo cambia QUIÉN resuelve el salto de carga y, si el
// equipo tiene una secuencia irregular (mancuernas 10 / 12,5 / 15 / 17,5…), el objetivo calculado se ajusta a una carga que existe.
// Prioridad: 1) `detail.load` del ejercicio en el programa (lo indicó quien programa); 2) equipo de la sede asociado a ese
// ejercicio; 3) desconocido (regla conservadora de siempre, marcada como carga de referencia).
// Nunca: inventar cargas, subir por redondear, tocar una carga indicada por el profe ni una serie ya hecha.
import { toKg, type WeightUnit } from "./units";
import { loadIncrement, type LoadSetup } from "./prescription";
import type { RowTarget } from "./intelligence";

export const EQUIPMENT_CATEGORY = {
  dumbbell: "Mancuernas", barbell: "Barra con discos", plate_loaded: "Máquina de discos", machine: "Máquina de placas (pin)",
  cable: "Polea", kettlebell: "Pesas rusas", bodyweight: "Peso corporal / asistida", other: "Otro",
} as const;
export type EquipmentCategory = keyof typeof EQUIPMENT_CATEGORY;
export const isEquipmentCategory = (x: unknown): x is EquipmentCategory => typeof x === "string" && x in EQUIPMENT_CATEGORY;
/** El salto se carga de cada lado (discos): el salto total es el doble. */
export const PER_SIDE_CATEGORIES: readonly EquipmentCategory[] = ["barbell", "plate_loaded"];
export const MAX_LOADS = 120;

export type EquipmentSpec = {
  category: EquipmentCategory; unit: WeightUnit; increment: number | null; perSide: boolean;
  minLoad: number | null; maxLoad: number | null; loads: number[] | null;
};
/** Saltos resueltos, en kg. `loadsKg` = cargas totales que existen (ordenadas, sin duplicados) si se conocen. */
export type LoadLadder = { source: "plan" | "gym" | "unknown"; incrementKg: number | null; loadsKg: number[] | null; name?: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export type EquipmentError = { field: "name" | "category" | "increment" | "loads" | "minLoad" | "maxLoad" | "unit" | "code" | "note"; message: string };

/** Valida un equipo como lo carga el personal. Los números van en la unidad del equipo. */
export function validateEquipment(p: { name: string; category: string; unit: string; increment: number | null; perSide: boolean; minLoad: number | null; maxLoad: number | null; loads: number[] | null; code?: string | null; note?: string | null }): EquipmentError[] {
  const e: EquipmentError[] = [];
  const name = p.name.trim();
  if (name.length < 2 || name.length > 60) e.push({ field: "name", message: "Poné un nombre de 2 a 60 caracteres." });
  if (!isEquipmentCategory(p.category)) e.push({ field: "category", message: "Elegí el tipo de equipo." });
  if (p.unit !== "kg" && p.unit !== "lb") e.push({ field: "unit", message: "La unidad es kg o lb." });
  const cap = p.unit === "lb" ? 2204 : 1000;
  const okNum = (n: number) => Number.isFinite(n) && n > 0 && n <= cap && /^\d+(\.\d{1,2})?$/.test(String(n));
  if (p.increment != null && (!okNum(p.increment) || p.increment > 100)) e.push({ field: "increment", message: "El salto mínimo va de 0,01 a 100, con hasta 2 decimales." });
  if (p.perSide && !PER_SIDE_CATEGORIES.includes(p.category as EquipmentCategory)) e.push({ field: "increment", message: "«Por lado» sólo aplica a barra y máquina de discos." });
  if (p.minLoad != null && !okNum(p.minLoad)) e.push({ field: "minLoad", message: "La carga mínima no es válida." });
  if (p.maxLoad != null && !okNum(p.maxLoad)) e.push({ field: "maxLoad", message: "La carga máxima no es válida." });
  if (p.minLoad != null && p.maxLoad != null && p.minLoad > p.maxLoad) e.push({ field: "maxLoad", message: "La carga máxima tiene que ser mayor que la mínima." });
  if (p.loads != null) {
    if (!Array.isArray(p.loads) || p.loads.length < 2 || p.loads.length > MAX_LOADS || !p.loads.every(okNum)) e.push({ field: "loads", message: `Cargá entre 2 y ${MAX_LOADS} cargas válidas (hasta 2 decimales).` });
  }
  if (p.code != null && p.code.length > 20) e.push({ field: "code", message: "El identificador tiene hasta 20 caracteres." });
  if (p.note != null && p.note.length > 200) e.push({ field: "note", message: "La nota tiene hasta 200 caracteres." });
  return e;
}

/** «10, 12,5; 15» → [10, 12.5, 15]. Acepta coma decimal (es-AR) y separadores «;», espacios o saltos de línea. Ordena y deduplica. */
export function parseLoadList(text: string): number[] | null {
  const tokens = text.replace(/\s*;\s*|\n/g, " ").trim().split(/\s+|,\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const out: number[] = [];
  for (const t of tokens) {
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    out.push(r2(n));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Saltos del equipo de la sede, en kg. Con lista explícita manda la lista; con rango y salto se arma la escalera (acotada). */
export function equipmentLadder(s: EquipmentSpec, name?: string | null): LoadLadder {
  const inc = pos(s.increment) ? toKg(s.increment * (s.perSide && PER_SIDE_CATEGORIES.includes(s.category) ? 2 : 1), s.unit) : null;
  let loads: number[] | null = null;
  if (s.loads?.length) loads = [...new Set(s.loads.filter(pos).map((x) => toKg(x, s.unit)))].sort((a, b) => a - b);
  else if (pos(s.increment) && pos(s.maxLoad)) {
    const step = s.increment * (s.perSide && PER_SIDE_CATEGORIES.includes(s.category) ? 2 : 1);
    const start = pos(s.minLoad) ? s.minLoad : step;
    const xs: number[] = [];
    for (let v = start; v <= s.maxLoad + 1e-9 && xs.length < MAX_LOADS * 4; v = r2(v + step)) xs.push(toKg(v, s.unit));
    loads = xs.length >= 2 ? xs : null;
  }
  // Con lista, el salto que ve el motor es el menor entre cargas consecutivas (sólo para «subir lo mínimo»).
  const listInc = loads && loads.length >= 2 ? Math.min(...loads.slice(1).map((x, i) => r2(x - loads![i]))) : null;
  return { source: "gym", incrementKg: inc ?? (listInc && listInc > 0 ? listInc : null), loadsKg: loads, name: name ?? null };
}

/** Prioridad de saltos: plan (detail.load) > equipo de la sede > desconocido. */
export function resolveLadder(planLoad: { load?: LoadSetup | null } | null | undefined, gym: LoadLadder | null | undefined): LoadLadder {
  const plan = loadIncrement(planLoad);
  if (plan) return { source: "plan", incrementKg: plan, loadsKg: null };
  if (gym && (gym.incrementKg || gym.loadsKg?.length)) return gym;
  return { source: "unknown", incrementKg: null, loadsKg: null };
}

/** Mayor carga disponible ≤ w (null si no hay ninguna). */
export const loadAtOrBelow = (w: number, loads: readonly number[]) => { let b: number | null = null; for (const x of loads) if (x <= w + 1e-9) b = x; return b; };
/** Menor carga disponible > w (null si no hay ninguna). */
export const loadAbove = (w: number, loads: readonly number[]) => loads.find((x) => x > w + 1e-9) ?? null;
/** Subir más del 10 % por redondear a una carga disponible no es progresivo: se mantiene. */
export const MAX_SNAP_UP_RATIO = 0.1;

/**
 * Ajusta los objetivos de REPI a las cargas que existen. Sólo objetivos de reglas con carga (nunca los del profe ni los
 * pendientes de elegir). Bajar, mantener o estimar: la mayor carga disponible por debajo. Subir: la menor carga disponible por
 * encima de la anterior, si el salto no supera el 10 %; si no, se mantiene la anterior. Sin una carga por debajo, el objetivo
 * queda como estaba y avisa que es de referencia. Devuelve objetivos nuevos (no muta).
 */
export function fitTargetsToLoads<T extends Pick<RowTarget, "source" | "weightKg" | "action" | "reasons" | "why" | "prev" | "pending" | "status">>(targets: T[], ladder: LoadLadder | null | undefined): T[] {
  const loads = ladder?.loadsKg;
  if (!loads?.length) return targets;
  return targets.map((t) => {
    if (!t || t.source !== "rules" || t.weightKg == null || !(t.weightKg > 0) || t.pending) return t;
    const w = t.weightKg;
    let next: number | null;
    if (t.action === "increase_load") {
      const prevW = t.prev?.w != null && t.prev.w > 0 ? t.prev.w : null;
      const exact = loads.some((x) => Math.abs(x - w) < 1e-6);
      if (exact) return t;
      const up = loadAbove(prevW ?? w, loads);
      next = up != null && prevW != null && (up - prevW) / prevW <= MAX_SNAP_UP_RATIO ? up : loadAtOrBelow(prevW ?? w, loads);
      if (next != null && prevW != null && next <= prevW + 1e-9) {
        return { ...t, weightKg: next, action: "hold", reasons: [...t.reasons, "equipment_fit", "increment_too_large"],
          why: `${t.why} El salto disponible en tu sede es grande: por ahora se mantiene la carga.`.trim() };
      }
    } else next = loadAtOrBelow(w, loads);
    if (next == null) return { ...t, reasons: [...t.reasons, "below_available"] };
    if (Math.abs(next - w) < 1e-6) return t.reasons.includes("equipment_fit") ? t : { ...t, reasons: [...t.reasons, "equipment_fit"] };
    return { ...t, weightKg: next, reasons: [...t.reasons.filter((r) => r !== "increment_unknown"), "equipment_fit"],
      why: `${t.why} Ajustado a las cargas disponibles en tu sede.`.trim() };
  });
}
