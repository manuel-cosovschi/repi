"use client";
// Cola de sincronización en IndexedDB (reemplaza la de localStorage de la Etapa 2).
// Cada ítem guarda sólo QUÉ sincronizar; el cuerpo se arma al enviar con el estado local vigente, así una edición
// hecha mientras otra viajaba no se pierde ni genera un conflicto falso. Reintentos idempotentes (IDs estables).
import { idbAll, idbDel, idbPut } from "./idb";
import { getLocal, putLocal, setKey, type LocalSession } from "./store";

export type Item =
  | { seq?: number; key: string; kind: "start"; sid: string }
  | { seq?: number; key: string; kind: "set"; sid: string; peId: string; idx: number }
  | { seq?: number; key: string; kind: "action"; sid: string; action: "pause" | "resume" | "finish"; at: string }
  | { seq?: number; key: string; kind: "feedback"; sid: string };
export type SyncState = { kind: "idle" | "saving" | "saved" | "pending" | "offline" | "error" | "conflict"; pending: number; error?: string };

const listeners = new Set<(s: SyncState) => void>();
let state: SyncState = { kind: "idle", pending: 0 };
let running = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const emit = async (p: Partial<SyncState>) => {
  const pending = (await idbAll<Item>("queue").catch(() => [])).length;
  state = { ...state, ...p, pending };
  listeners.forEach((f) => f(state));
};
export function subscribe(f: (s: SyncState) => void) { listeners.add(f); f(state); void emit({}); return () => { listeners.delete(f); }; }
export const pendingFor = async (sid?: string) => (await idbAll<Item>("queue")).filter((i) => !sid || i.sid === sid).length;

/** Encola. Para series y feedback, una sola entrada por clave (se envía el valor vigente al sincronizar). */
export async function enqueue(item: Item) {
  if (item.kind === "set" || item.kind === "feedback" || item.kind === "start") {
    const existing = (await idbAll<Item>("queue")).find((i) => i.key === item.key);
    if (existing) { void flush(); return; }
  }
  await idbPut("queue", item);
  await emit({ kind: "saving" });
  void flush();
}
export async function dropSession(sid: string) {
  for (const i of await idbAll<Item>("queue")) if (i.sid === sid) await idbDel("queue", i.seq!);
  await emit({});
}

type Built = { url: string; body: unknown; sent?: unknown } | null;
async function build(it: Item, s: LocalSession): Promise<Built> {
  const base = `/api/me/sessions`;
  if (it.kind === "start") return { url: base, body: { id: s.id, dayId: s.dayId, startedAt: s.startedAt, closeOther: s.closeOther || undefined } };
  if (it.kind === "set") {
    const x = s.sets[setKey(it.peId, it.idx)];
    if (!x?.done) return null;
    const body = { id: x.id, programExerciseId: it.peId, setIndex: it.idx, weightKg: x.w, reps: x.r, rir: x.rir, feel: x.feel ?? null, baseRevision: x.revision, at: x.at ?? undefined };
    return { url: `${base}/${s.id}/sets`, body, sent: { w: x.w, r: x.r, rir: x.rir, feel: x.feel ?? null } };
  }
  if (it.kind === "action") return { url: `${base}/${s.id}/action`, body: { action: it.action, at: it.at } };
  if (s.rpe == null) return null;
  return { url: `${base}/${s.id}/feedback`, body: { rpe: s.rpe, note: s.sessionNote } };
}

/** Procesa en orden. Una sesión bloqueada por conflicto de inicio no frena a las demás. */
export async function flush(): Promise<void> {
  if (running) return;
  running = true;
  clearTimeout(retryTimer);
  let hadError: string | null = null, offline = false, conflict = false;
  try {
    const blocked = new Set<string>();
    for (;;) {
      const items = (await idbAll<Item>("queue")).sort((a, b) => a.seq! - b.seq!).filter((i) => !blocked.has(i.sid));
      if (!items.length) break;
      const it = items[0];
      const s = await getLocal(it.sid);
      if (!s) { await idbDel("queue", it.seq!); continue; } // sesión descartada en este dispositivo
      if (s.conflict) { blocked.add(it.sid); conflict = true; continue; }
      const b = await build(it, s);
      if (!b) { await idbDel("queue", it.seq!); continue; }
      await emit({ kind: "saving" });
      let res: Response;
      try {
        res = await fetch(b.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b.body), credentials: "same-origin" });
      } catch { offline = true; break; } // sin red o servidor caído: se reintenta solo
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (s.rejected) { const cur = await getLocal(it.sid); if (cur) await putLocal({ ...cur, rejected: undefined }); }
        await applyResult(it, b, data);
        continue;
      }
      if (res.status === 409 && data.code === "open_session" && it.kind === "start") {
        await putLocal({ ...(await getLocal(it.sid))!, conflict: { kind: "open_session", other: data.data.other } });
        blocked.add(it.sid); conflict = true; continue;
      }
      if (res.status >= 500 || res.status === 429) { offline = true; break; }
      // Acceso no vigente: no se descarta nada ni se reintenta en bucle; la persona decide (ver LocalSession.rejected).
      if (res.status === 403 && data.code === "relation_inactive") {
        const message: string = data.error ?? "Tu acceso no está vigente.";
        hadError = message;
        const cur = await getLocal(it.sid); // el estado vigente: pudo cambiar mientras viajaba el pedido
        if (cur) await putLocal({ ...cur, rejected: { message, at: new Date().toISOString() } });
        blocked.add(it.sid); continue;
      }
      if (res.status === 401) { hadError = "Tu sesión venció. Ingresá de nuevo para sincronizar (no se borra nada)."; break; }
      // 4xx: el servidor rechazó el dato. Se informa; no se reintenta en silencio.
      await idbDel("queue", it.seq!);
      hadError = data.error ?? "No se pudo guardar.";
    }
  } finally {
    running = false;
    const pending = (await idbAll<Item>("queue").catch(() => [])).length;
    await emit({ kind: hadError ? "error" : conflict ? "conflict" : offline ? "offline" : pending ? "pending" : "saved", error: hadError ?? undefined });
    if (offline) retryTimer = setTimeout(() => void flush(), 10_000);
  }
}

async function applyResult(it: Item, b: NonNullable<Built>, data: Record<string, unknown>) {
  const s = await getLocal(it.sid);
  if (!s) { await idbDel("queue", it.seq!); return; }
  if (it.kind === "start") { await putLocal({ ...s, synced: true, closeOther: false, conflict: undefined }); await idbDel("queue", it.seq!); return; }
  if (it.kind === "set") {
    const k = setKey(it.peId, it.idx);
    const x = s.sets[k];
    const sent = b.sent as { w: number; r: number; rir: number | null; feel: string | null };
    const changedMeanwhile = x && (x.w !== sent.w || x.r !== sent.r || x.rir !== sent.rir || (x.feel ?? null) !== sent.feel);
    if (data.status === "conflict") {
      s.sets[k] = { ...x, conflict: { id: data.conflictId as string, other: { weightKg: data.weightKg as number | null, reps: data.reps as number | null, rir: data.rir as number | null }, appliedIsMine: false } };
    } else {
      // El servidor puede conservar su id (la misma serie creada antes): se adopta para ediciones futuras.
      s.sets[k] = { ...x, id: (data.id as string) ?? x.id, revision: data.revision as number, conflict: undefined };
      // Aviso al piso (sensación por serie): la pantalla informa si llegó a alguien en turno.
      const alert = data.alert as { notified: number } | null | undefined;
      if (alert && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("repi:floor-alert", { detail: { notified: alert.notified } }));
    }
    await putLocal(s);
    if (!changedMeanwhile || data.status === "conflict") await idbDel("queue", it.seq!);
    return;
  }
  if (it.kind === "action") { await putLocal({ ...s, revision: (data.revision as number) ?? s.revision }); await idbDel("queue", it.seq!); return; }
  await idbDel("queue", it.seq!);
}

export async function clearQueueFor(sid: string) { await dropSession(sid); }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void flush(); });
}
