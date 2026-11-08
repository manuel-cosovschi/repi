"use client";
// M06 (docs/MOTION_NAVEGACION.md §5): caché en memoria por URL exacta, stale-while-revalidate. Al volver a una sección se
// muestra lo último cargado en el primer cuadro y se revalida en segundo plano: nada se vacía ni salta.
// Privacidad: sólo vive en la memoria de la pestaña (nunca localStorage, sessionStorage ni IndexedDB; sw.js tampoco guarda
// /api). Cerrar sesión y cambiar de espacio recargan la página; cambiar de sede o de relación la vacía con invalidate().
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Entry = { data: unknown; at: number };
const MAX = 200;
const DEFAULT_AGE = 10 * 60_000;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let gen = 0; // invalidate() sube la generación: lo que estaba en vuelo no vuelve a escribir la caché

function put(url: string, data: unknown) {
  store.delete(url);
  store.set(url, { data, at: Date.now() });
  if (store.size > MAX) store.delete(store.keys().next().value!);
}

/** Lo guardado para la URL, si no venció. */
export function peek<T>(url: string | null | undefined, maxAgeMs = DEFAULT_AGE): T | undefined {
  if (!url) return undefined;
  const e = store.get(url);
  if (!e || Date.now() - e.at > maxAgeMs) return undefined;
  return e.data as T;
}

/** Pide la URL una sola vez aunque la pidan varios a la vez y guarda el resultado. */
export function fetchCached<T>(url: string): Promise<T> {
  const cur = inflight.get(url);
  if (cur) return cur as Promise<T>;
  const g = gen;
  const p = api<T>(url).then((d) => { if (g === gen) put(url, d); return d; }).finally(() => { if (inflight.get(url) === p) inflight.delete(url); });
  inflight.set(url, p);
  return p;
}

/** Lectura anticipada (p. ej. en el pointerdown de la barra): no cambia nada si falla. */
export function prefetch(url: string) {
  if (peek(url, 30_000) !== undefined) return;
  void fetchCached(url).catch(() => {});
}

/** Vacía la caché (toda o las URL que empiezan con el prefijo). */
export function invalidate(prefix?: string) {
  gen++;
  if (!prefix) { store.clear(); inflight.clear(); return; }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}

/** Escribe un valor conocido (después de una acción que devuelve el estado nuevo). */
export function setCached(url: string, data: unknown) { put(url, data); }

/**
 * `prev` si `next` trae el mismo contenido (JSON), si no `next`. Una revalidación sin cambios conserva el mismo objeto: el
 * estado no cambia, nada se vuelve a dibujar y las secciones vivas que lo leen siguen sin cambios (QA M06, ronda 2: tareas
 * largas al volver por respuestas iguales a las que ya estaban a la vista).
 */
export function keepSame<T>(prev: T, next: T): T {
  if (Object.is(prev, next) || prev == null || next == null || typeof prev !== "object" || typeof next !== "object") return next;
  try { return JSON.stringify(prev) === JSON.stringify(next) ? prev : next; } catch { return next; }
}

type St<T> = { url: string | null; dataUrl: string | null; data: T | null; err: string | null };

/**
 * Carga con caché. El estado inicial sale de la caché (sin «Cargando…» al volver); siempre se revalida. Las respuestas
 * viejas se descartan por secuencia. Con `keep`, al cambiar la URL se conserva el dato anterior (marcado `stale`) hasta
 * que llega el nuevo: búsquedas, períodos y semanas no parpadean.
 */
export function useCached<T>(url: string | null, opts: { keep?: boolean; maxAgeMs?: number } = {}) {
  const { keep = false, maxAgeMs = DEFAULT_AGE } = opts;
  const [st, setSt] = useState<St<T>>(() => { const d = peek<T>(url, maxAgeMs); return { url, dataUrl: d !== undefined ? url : null, data: d ?? null, err: null }; });
  let view = st;
  if (st.url !== url) {
    // Cambio de URL derivado en el render: nunca se pinta un cuadro con el dato de otro recurso (salvo `keep`, marcado stale).
    const d = peek<T>(url, maxAgeMs);
    view = d !== undefined ? { url, dataUrl: url, data: d, err: null } : keep ? { ...st, url, err: null } : { url, dataUrl: null, data: null, err: null };
    setSt(view);
  }
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    try {
      const d = await fetchCached<T>(url);
      // Sin cambios de contenido, el mismo estado (React no vuelve a dibujar).
      if (my === seq.current) setSt((s) => { const data = s.dataUrl === url ? keepSame(s.data as T, d) : d; return s.url === url && s.dataUrl === url && s.err == null && data === s.data ? s : { url, dataUrl: url, data, err: null }; });
    } catch (e) { if (my === seq.current) setSt((s) => (s.url === url ? { ...s, err: (e as Error).message } : s)); }
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  const setData = useCallback((v: T | null | ((p: T | null) => T | null)) => {
    setSt((s) => {
      const data = typeof v === "function" ? (v as (p: T | null) => T | null)(s.data) : v;
      if (s.url && data != null) put(s.url, data);
      return { ...s, data, dataUrl: s.url };
    });
  }, []);
  const reload = useCallback(async () => { if (url) inflight.delete(url); await load(); }, [url, load]);
  return { data: view.data, err: view.err, stale: !!view.data && view.dataUrl !== url, reload, setData };
}
