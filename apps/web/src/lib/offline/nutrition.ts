"use client";
// Nutrition Intelligence 1.0 (D221) · registro sin conexión. Una cola propia (no la de entrenamiento: otras garantías y tipos)
// guardada en el almacén `kv` del dispositivo, que se borra al cerrar sesión o al cambiar de cuenta (wipeLocal).
// - Cada alta lleva un id generado acá: reintentar nunca duplica (el servidor deduplica por id).
// - Lo pendiente se muestra marcado «pendiente de sincronizar» con valores calculados localmente desde la copia del alimento.
// - Sólo se guarda lo necesario: la cola, el último día visto y los alimentos recientes/favoritos. Nunca la base completa ni fotos.
import { gramsOf, nutrientsFor, type FoodSnapshot, type Meal, type Nutrients, type Quantity } from "@repi/domain";
import { idbGet, idbMerge, idbPut } from "./idb";

export type FoodRefLite = { kind: FoodSnapshot["kind"]; id: string };
export type NutriOp =
  | { op: "add"; id: string; day: string; meal: Meal; ref: FoodRefLite; quantity: Quantity; food: FoodSnapshot; at: string }
  | { op: "update"; id: string; revision: number; quantity?: Quantity; meal?: Meal; at: string }
  | { op: "delete"; id: string; at: string };
export type PendingEntry = { id: string; day: string; meal: Meal; food: FoodSnapshot; quantity: Quantity; grams: number | null; nutrients: Nutrients; pending: true };

const QK = "nutri:queue";
export const newEntryId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`);

export const loadQueue = async () => (await idbGet<NutriOp[]>("kv", QK).catch(() => undefined)) ?? [];

/** Encola de forma atómica. Borrar o editar algo que todavía no subió modifica el alta pendiente en vez de encolar otra cosa. */
export function enqueueNutri(op: NutriOp) {
  return idbMerge<NutriOp[]>("kv", QK, (cur) => {
    const q = [...(cur ?? [])];
    const addIdx = q.findIndex((x) => x.op === "add" && x.id === op.id);
    if (op.op === "add") { if (addIdx < 0) q.push(op); return q; }
    if (addIdx >= 0) {
      if (op.op === "delete") return q.filter((x) => x.id !== op.id); // nunca llegó al servidor: desaparece
      const a = q[addIdx] as Extract<NutriOp, { op: "add" }>;
      q[addIdx] = { ...a, quantity: op.quantity ?? a.quantity, meal: op.meal ?? a.meal };
      return q;
    }
    if (op.op === "delete") return [...q.filter((x) => x.id !== op.id), op];
    const i = q.findIndex((x) => x.op === "update" && x.id === op.id);
    if (i >= 0) q[i] = { ...(q[i] as Extract<NutriOp, { op: "update" }>), ...op }; else q.push(op);
    return q;
  });
}

/** Altas pendientes de un día (para mostrarlas) e ids con borrado pendiente (para ocultarlos). */
export async function pendingFor(day: string): Promise<{ adds: PendingEntry[]; deleted: Set<string>; updated: Map<string, Extract<NutriOp, { op: "update" }>> }> {
  const q = await loadQueue();
  const adds: PendingEntry[] = [];
  for (const x of q) if (x.op === "add" && x.day === day) {
    let nutrients: Nutrients;
    try { nutrients = nutrientsFor(x.food, x.quantity); } catch { continue; }
    adds.push({ id: x.id, day: x.day, meal: x.meal, food: x.food, quantity: x.quantity, grams: gramsOf(x.food, x.quantity), nutrients, pending: true });
  }
  return {
    adds,
    deleted: new Set(q.filter((x) => x.op === "delete").map((x) => x.id)),
    updated: new Map(q.filter((x): x is Extract<NutriOp, { op: "update" }> => x.op === "update").map((x) => [x.id, x])),
  };
}

type Send = (path: string, init: { method?: string; body?: unknown }) => Promise<unknown>;
type Fail = { id: string; message: string };
const isNetwork = (e: unknown) => !(e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number") || (e as { status: number }).status >= 500 || (e as { status: number }).status === 429;
const statusOf = (e: unknown) => (e && typeof e === "object" && "status" in e ? (e as { status: number }).status : 0);

let flushing: Promise<{ sent: number; failed: Fail[] }> | null = null;
/**
 * Sube la cola en orden. Una falla de red o del servidor corta y deja el resto para el próximo intento (sin perder nada). Un
 * rechazo definitivo (datos inválidos, 409 de edición vieja) saca esa operación y la informa; nunca reintenta para siempre.
 */
export function flushNutri(send: Send): Promise<{ sent: number; failed: Fail[] }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    const failed: Fail[] = [];
    for (;;) {
      const q = await loadQueue();
      const op = q[0];
      if (!op) break;
      try {
        if (op.op === "add") await send("/api/me/nutrition/entries", { body: { id: op.id, day: op.day, meal: op.meal, ref: op.ref, quantity: op.quantity } });
        else if (op.op === "update") await send(`/api/me/nutrition/entries/${op.id}`, { body: { revision: op.revision, ...(op.quantity ? { quantity: op.quantity } : {}), ...(op.meal ? { meal: op.meal } : {}) } });
        else await send(`/api/me/nutrition/entries/${op.id}`, { method: "DELETE" });
        sent++;
      } catch (e) {
        if (statusOf(e) === 401 || isNetwork(e)) break; // sin conexión, sesión vencida o servidor caído: se reintenta después
        if (!(op.op === "delete" && statusOf(e) === 404)) failed.push({ id: op.id, message: e instanceof Error ? e.message : "No se pudo sincronizar." });
      }
      await idbMerge<NutriOp[]>("kv", QK, (cur) => (cur ?? []).filter((x) => x !== op && !(x.op === op.op && x.id === op.id && x.at === op.at)));
    }
    return { sent, failed };
  })().finally(() => { flushing = null; });
  return flushing;
}

// ── Caché mínima para usar la sección sin conexión ──
export const cacheDay = (day: string, v: unknown) => idbPut("kv", { v, at: new Date().toISOString() }, `nutri:day:${day}`).catch(() => undefined);
export const cachedDay = <T>(day: string) => idbGet<{ v: T; at: string }>("kv", `nutri:day:${day}`).catch(() => undefined);
export const cacheQuick = (v: unknown) => idbPut("kv", v, "nutri:quick").catch(() => undefined);
export const cachedQuick = <T>() => idbGet<T>("kv", "nutri:quick").catch(() => undefined);
