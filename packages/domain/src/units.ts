// Unidad de peso preferida (F-HX-23, D95). Todo se guarda en kg (con hasta 2 decimales); lb es sólo presentación y
// entrada. Cambiar la preferencia no reescribe la historia: la misma serie se ve en la unidad elegida en cada momento.
import { twoDecimals, weightOk } from "./commercial";

export type WeightUnit = "kg" | "lb";
export const WEIGHT_UNITS: readonly WeightUnit[] = ["kg", "lb"];
/** Libras por kilogramo (definición internacional: 1 lb = 0,45359237 kg). */
export const LB_PER_KG = 1 / 0.45359237;
/** Pasos del ± en libras: discos de 1,25 a 10 lb y saltos finos de mancuernas. */
export const WEIGHT_STEPS_LB = [0.5, 1, 2.5, 5] as const;

export const isWeightUnit = (u: unknown): u is WeightUnit => u === "kg" || u === "lb";

/** kg guardados → número en la unidad elegida. lb con 1 decimal (el redondeo a 0,01 kg no se nota a esa escala). */
export const kgTo = (kg: number, unit: WeightUnit) => (unit === "kg" ? kg : Math.round(kg * LB_PER_KG * 10) / 10);
/** Número en la unidad elegida → kg para guardar, con 2 decimales. */
export const toKg = (v: number, unit: WeightUnit) => (unit === "kg" ? Math.round(v * 100) / 100 : Math.round((v / LB_PER_KG) * 100) / 100);

/** Texto «82,5 kg» / «181,9 lb» en es-AR. */
export const fmtWeight = (kg: number, unit: WeightUnit, digits = unit === "kg" ? 2 : 1) =>
  `${kgTo(kg, unit).toLocaleString("es-AR", { maximumFractionDigits: digits })} ${unit}`;

/** Volumen (suma de kg × reps) en la unidad elegida, entero. */
export const volumeIn = (volKg: number, unit: WeightUnit) => Math.round(unit === "kg" ? volKg : volKg * LB_PER_KG);

/** ± en la unidad elegida, devuelto en kg. En lb parte del valor mostrado para que 45 + 5 dé 50 lb y no 49,9. */
export const stepWeightIn = (kg: number, dir: 1 | -1, step: number, unit: WeightUnit) =>
  Math.max(0, toKg(Math.max(0, Math.round((kgTo(kg, unit) + dir * step) * 100) / 100), unit));

/** Texto escrito por la persona en su unidad → kg válidos, o null (hasta 2 decimales, entre 0 y 1000 kg). */
export const parseWeightIn = (s: string, unit: WeightUnit): number | null => {
  const n = Number(s.trim().replace(",", "."));
  if (s.trim() === "" || !Number.isFinite(n) || n < 0 || !twoDecimals(n)) return null;
  const kg = toKg(n, unit);
  return weightOk(kg) ? kg : null;
};

/**
 * FSA1: el texto de un campo que se precargó con `originalKg`. Si la persona no lo cambió, vuelven los kg guardados: en lb,
 * 60 kg se muestran «132,3» y, convertidos de vuelta, serían 60,01 kg (editar sólo el nombre cambiaba la carga).
 */
export const parseWeightKeeping = (s: string, unit: WeightUnit, originalKg: number | null | undefined): number | null =>
  originalKg != null && s.trim() !== "" && Number(s.trim().replace(",", ".")) === kgTo(originalKg, unit) ? originalKg : parseWeightIn(s, unit);

/**
 * D182: texto que se está escribiendo en un campo de peso. Deja dígitos y un solo separador decimal (coma o punto), hasta
 * 2 decimales, y saca los ceros a la izquierda («070» → «70», «00» → «0», «0,5» queda). Vacío queda vacío: nunca agrega un 0.
 */
export function cleanDecimalDraft(s: string): string {
  let t = s.replace(/[^\d.,]/g, "");
  const i = t.search(/[.,]/);
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/[.,]/g, "").slice(0, 2);
  t = t.replace(/^0+(?=\d)/, "");
  return t.slice(0, 7);
}

/**
 * D191 · Textos explicativos en la unidad de la persona. El dominio redacta las explicaciones con kilos canónicos
 * («Subí a 62,5 kg») y así se guardan; al mostrarlas se pasa cada «N kg» a la unidad elegida. Es sólo presentación: no
 * toca números guardados ni puede convertir dos veces (un texto ya en lb no tiene «kg» que reemplazar).
 */
export function localizeWeights<T extends string | null | undefined>(text: T, unit: WeightUnit): T {
  if (unit === "kg" || !text) return text;
  return (text as string).replace(/(\d+(?:[.,]\d+)?)\s?kg\b/g, (_, n: string) => fmtWeight(Number(n.replace(",", ".")), unit)) as T;
}
