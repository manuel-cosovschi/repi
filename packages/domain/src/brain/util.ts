// AC3 · Utilidades puras del núcleo: normalización de texto en español, hash estable (sin crypto) y formatos breves.

/** Minúsculas y sin tildes («Sentadilla Búlgara» → «sentadilla bulgara»). */
export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Texto comparable: sin tildes, sin signos, espacios simples y letras estiradas recortadas («holaaa» → «hola», «siii» → «si»).
 * Conserva dígitos y `:` (horas). No corrige ortografía: eso lo hace cada clasificador con sus variantes.
 */
export function norm(s: string): string {
  return fold(s ?? "")
    .replace(/[^a-z0-9:\s]/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** JSON con las claves ordenadas: el mismo objeto da siempre el mismo texto (para claves idempotentes y versiones). */
export function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** FNV-1a de 32 bits (no criptográfico: alcanza para idempotencia y caché, nunca para secretos). */
export function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** 16 caracteres hexadecimales (dos pasadas de FNV con semillas distintas: colisiones muy improbables en este uso). */
export const hashHex = (s: string) => fnv1a(s).toString(16).padStart(8, "0") + fnv1a(s, 0x9e3779b9).toString(16).padStart(8, "0");

/** Distancia de edición acotada (para errores de tipeo leves). Devuelve `max + 1` si se pasa. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** «60 kg», «62,5 kg». */
export const fmtKg = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
const WORDS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
/** Números chicos en palabras para la prosa («dos repeticiones más»); el resto, en cifras. `masc` para «un/uno». */
export const numEs = (n: number, masc = false) => (Number.isInteger(n) && n >= 0 && n <= 10 ? (masc && n === 1 ? "un" : WORDS[n]) : String(n));
/** «a», «a y b», «a, b y c». */
export function listEs(xs: string[]): string {
  const ys = xs.filter(Boolean);
  return ys.length <= 1 ? (ys[0] ?? "") : `${ys.slice(0, -1).join(", ")} y ${ys[ys.length - 1]}`;
}
/** Recorta un texto a `n` caracteres sin cortar palabras si se puede. */
export function clip(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Números escritos en palabras que aparecen en pedidos («me quedan veinte minutos»). */
export const NUM_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45, cincuenta: 50, sesenta: 60, noventa: 90,
};
