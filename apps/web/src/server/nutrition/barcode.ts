// Productos envasados por código de barras (D221) — Open Food Facts, base colaborativa bajo ODbL.
// Uso como «obra producida»: se consulta en tiempo real y se muestra con atribución. Los datos van a una caché aparte
// (off_product_cache), sin mezclarse con la biblioteca de REPI ni con los alimentos propios, y sin imágenes.
// Una llamada por escaneo real (nunca búsqueda mientras se escribe); tiempo máximo 6 s; corte tras fallas seguidas.
// Si el producto no está o le faltan valores, se ofrece la carga manual: nunca se inventan valores.
import { eq } from "drizzle-orm";
import { emptyNutrients, withEnergy, type FoodSnapshot, type Nutrients } from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { AccessError } from "../access/util";
import { logError } from "../log";

const { offProductCache } = schema;
export const OFF_ATTRIBUTION = "Datos de Open Food Facts (openfoodfacts.org), base colaborativa bajo licencia ODbL. Revisá siempre la etiqueta del envase.";
const UA = "REPI/1.0 (https://repiclub.com)";
const CACHE_DAYS = 30;
const TIMEOUT_MS = 6000;

export const validBarcode = (code: string) => /^\d{8}$|^\d{12,14}$/.test(code) && checkDigit(code);
/** Dígito verificador GTIN (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function checkDigit(code: string) {
  const d = code.split("").map(Number), last = d.pop()!;
  const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === last;
}

type OffProduct = { name: string; brand: string | null; basis: "g" | "ml"; values: Nutrients; quantity: string | null; complete: boolean };

/** Lee sólo los campos que usamos. Por 100 g o 100 ml según el producto; un valor ausente queda desconocido. */
export function readOff(p: Record<string, unknown>): OffProduct | null {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const name = String(p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || "").trim();
  if (!name) return null;
  // Open Food Facts guarda los valores en las claves *_100g; si la etiqueta es por 100 ml, lo indica nutrition_data_per.
  const basis: "g" | "ml" = String(p.nutrition_data_per ?? "100g") === "100ml" ? "ml" : "g";
  const num = (k: string) => { const v = n[`${k}_100g`]; const x = typeof v === "string" ? Number(v) : v; return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null; };
  const values: Nutrients = { ...emptyNutrients(),
    energyKcal: num("energy-kcal"), proteinG: num("proteins"), carbsG: num("carbohydrates"), fatG: num("fat"), fiberG: num("fiber"),
    sugarsG: num("sugars"), satFatG: num("saturated-fat"), sodiumMg: num("sodium") == null ? null : Math.round(num("sodium")! * 1000 * 100) / 100 };
  const complete = values.proteinG != null && values.carbsG != null && values.fatG != null;
  return { name: name.slice(0, 100), brand: String(p.brands ?? "").split(",")[0]?.trim().slice(0, 60) || null, basis, values, quantity: p.quantity ? String(p.quantity).slice(0, 40) : null, complete };
}

export function toSnapshot(code: string, o: OffProduct, fetchedAt: Date): FoodSnapshot {
  const { values, energy } = withEnergy(o.values);
  return {
    kind: "barcode", refId: code, name: o.brand ? `${o.name} (${o.brand})` : o.name, state: "na",
    basis: { amount: 100, unit: o.basis }, values, energy, portions: [],
    source: { id: "open-food-facts", label: "Open Food Facts", version: `off:${fetchedAt.toISOString().slice(0, 10)}`, sourceId: code, url: `https://world.openfoodfacts.org/product/${code}`, attribution: OFF_ATTRIBUTION },
    note: o.complete ? null : "La etiqueta cargada en Open Food Facts no informa todos los macronutrientes.",
  };
}

// Corte simple por instancia: 5 fallas seguidas → 5 minutos sin consultar (se ofrece carga manual).
let fails = 0, openUntil = 0;
export const breakerOpen = () => Date.now() < openUntil;
export const resetBreaker = () => { fails = 0; openUntil = 0; };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (u, i) => fetch(u, i);
/** Sólo pruebas: reemplaza la red. */
export const setOffFetcher = (f: Fetcher | null) => { fetcher = f ?? ((u, i) => fetch(u, i)); };

export async function lookupBarcode(code: string, now = new Date()): Promise<{ status: "found"; food: FoodSnapshot; complete: boolean } | { status: "not_found" } | { status: "unavailable" }> {
  if (!featureOn("nutrition_scan")) throw new AccessError("not_found", "No encontramos lo que buscás.", 404);
  if (!validBarcode(code)) throw new AccessError("invalid_barcode", "Ese código no parece válido. Revisalo o cargá el alimento a mano.", 422);
  const [c] = await db.select().from(offProductCache).where(eq(offProductCache.barcode, code));
  const fresh = c && now.getTime() - c.fetchedAt.getTime() < CACHE_DAYS * 86_400_000;
  if (fresh) return c.status === "found" && c.product ? { status: "found", food: toSnapshot(code, c.product as unknown as OffProduct, c.fetchedAt), complete: (c.product as unknown as OffProduct).complete } : { status: "not_found" };
  if (breakerOpen()) return c?.status === "found" && c.product ? { status: "found", food: toSnapshot(code, c.product as unknown as OffProduct, c.fetchedAt), complete: (c.product as unknown as OffProduct).complete } : { status: "unavailable" };
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_es,generic_name,generic_name_es,brands,quantity,nutrition_data_per,nutriments`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    clearTimeout(t);
    if (res.status === 404) { fails = 0; await save(code, "not_found", null, now); return { status: "not_found" }; }
    if (!res.ok) throw new Error(`off ${res.status}`);
    const j = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    fails = 0;
    const o = j.status === 1 && j.product ? readOff(j.product) : null;
    if (!o) { await save(code, "not_found", null, now); return { status: "not_found" }; }
    await save(code, "found", o, now);
    return { status: "found", food: toSnapshot(code, o, now), complete: o.complete };
  } catch (e) {
    if (++fails >= 5) { openUntil = Date.now() + 5 * 60_000; fails = 0; }
    logError("nutrition.off", e);
    return c?.status === "found" && c.product ? { status: "found", food: toSnapshot(code, c.product as unknown as OffProduct, c.fetchedAt), complete: (c.product as unknown as OffProduct).complete } : { status: "unavailable" };
  }
}
async function save(code: string, status: "found" | "not_found", product: OffProduct | null, now: Date) {
  await db.insert(offProductCache).values({ barcode: code, status, product: product as unknown as Record<string, unknown> | null, fetchedAt: now })
    .onConflictDoUpdate({ target: offProductCache.barcode, set: { status, product: product as unknown as Record<string, unknown> | null, fetchedAt: now } });
}

/** Copia guardada para registrar un producto ya consultado (sólo desde la caché: registrar no vuelve a llamar a la red). */
export async function offSnapshot(code: string): Promise<FoodSnapshot | null> {
  const [c] = await db.select().from(offProductCache).where(eq(offProductCache.barcode, code));
  return c?.status === "found" && c.product ? toSnapshot(code, c.product as unknown as OffProduct, c.fetchedAt) : null;
}
