"use client";
// Cola de sincronización en IndexedDB (reemplaza la de localStorage de la Etapa 2).
// Cada ítem guarda sólo QUÉ sincronizar; el cuerpo se arma al enviar con el estado local vigente, así una edición
// hecha mientras otra viajaba no se pierde ni genera un conflicto falso. Reintentos idempotentes (IDs estables).
import { sameMetrics, type SetMetrics } from "@repi/domain";
import { idbAll, idbDel, idbPut } from "./idb";
import { adoptServerIntel, getLocal, putLocal, setKey, type LocalSession, type LocalSet } from "./store";

export type Item =
  | { seq?: number; key: string; kind: "start"; sid: string }
  | { seq?: number; key: string; kind: "set"; sid: string; peId: string; idx: number }
  | { seq?: number; key: string; kind: "action"; sid: string; action: "pause" | "resume" | "finish"; at: string }
  | { seq?: number; key: string; kind: "feedback"; sid: string }
  | { seq?: number; key: string; kind: "exchange"; sid: string; peId: string } // saltar/reemplazar (F-HX-21): se envía el estado vigente
  | { seq?: number; key: string; kind: "skip"; sid: string; peId: string; idx: number } // D184: etapa omitida o deshecha (estado vigente)
  | { seq?: number; key: string; kind: "interval"; sid: string }; // D184: intervalo EMOM vigente
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
  if (item.kind === "set" || item.kind === "feedback" || item.kind === "start" || item.kind === "exchange" || item.kind === "skip" || item.kind === "interval") {
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
/** Valores de una serie tal como se enviaron (para saber si cambió mientras viajaba el pedido). */
export type SentSet = { w: number; r: number; rir: number | null; feel: string | null; note: string | null; m?: SetMetrics | null };
/**
 * Cuerpo del registro de una serie y los valores enviados. Ejercicios por tiempo: `metrics` sólo si la serie las tiene definidas
 * (también `null`, que las borra). Una serie guardada por una versión anterior (sin `m`) no manda el campo: el servidor conserva lo
 * que tenga (JSON omite `undefined`).
 */
export function setRequest(peId: string, idx: number, x: LocalSet): { body: Record<string, unknown>; sent: SentSet } {
  const body = { id: x.id, programExerciseId: peId, setIndex: idx, weightKg: x.w, reps: x.r, rir: x.rir, feel: x.feel ?? null, note: x.note ?? null, metrics: x.m, baseRevision: x.revision, at: x.at ?? undefined };
  return { body, sent: { w: x.w, r: x.r, rir: x.rir, feel: x.feel ?? null, note: x.note ?? null, m: x.m } };
}
/** La serie cambió desde que se envió. Cambiar sólo la velocidad o la inclinación de una actividad también cuenta (se reenvía). */
export const setChangedSince = (x: LocalSet | undefined, sent: SentSet) => !!x && (x.w !== sent.w || x.r !== sent.r || x.rir !== sent.rir || (x.feel ?? null) !== sent.feel
  || (x.note ?? null) !== sent.note || (x.m !== sent.m && !sameMetrics(x.m, sent.m)));

async function build(it: Item, s: LocalSession): Promise<Built> {
  const base = `/api/me/sessions`;
  if (it.kind === "start") return { url: base, body: { id: s.id, dayId: s.dayId, startedAt: s.startedAt, closeOther: s.closeOther || undefined } };
  if (it.kind === "set") {
    const x = s.sets[setKey(it.peId, it.idx)];
    if (!x?.done) return null;
    return { url: `${base}/${s.id}/sets`, ...setRequest(it.peId, it.idx, x) };
  }
  if (it.kind === "exchange") {
    const e = s.exercises.find((y) => y.id === it.peId);
    if (!e) return null;
    const c = e.change ?? null;
    const body = { programExerciseId: e.id, change: c ? { kind: c.kind, reason: c.reason, exerciseId: c.substitute?.exerciseId ?? null } : null };
    return { url: `${base}/${s.id}/exercises`, body, sent: JSON.stringify(body.change) };
  }
  if (it.kind === "skip") {
    const x = s.sets[setKey(it.peId, it.idx)];
    if (!x) return null;
    const skipped = !!x.skip && !x.done;
    const at = x.skipAt ?? new Date().toISOString();
    return { url: `${base}/${s.id}/skips`, body: { programExerciseId: it.peId, setIndex: it.idx, skipped, at }, sent: `${skipped}|${x.skipAt ?? ""}` };
  }
  if (it.kind === "interval") {
    // Horas de este teléfono (inicio, cambio y envío): el servidor las traduce a la suya, aunque el pedido haya esperado.
    const iv = s.iv ?? null;
    const at = s.ivAt ?? new Date().toISOString();
    const state = iv ? { peId: iv.peId, block: iv.block, startedAt: new Date(iv.start).toISOString(), emomSec: iv.emomSec, status: iv.status } : null;
    return { url: `${base}/${s.id}/interval`, body: { state, at, sentAt: new Date().toISOString() }, sent: `${JSON.stringify(state)}|${s.ivAt ?? ""}` };
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
      // D127: también «presence_required» (venció o falta validar el ingreso al gimnasio): se conserva todo y se revalida.
      if (res.status === 403 && (data.code === "relation_inactive" || data.code === "presence_required")) {
        const message: string = data.error ?? "Tu acceso no está vigente.";
        hadError = message;
        const cur = await getLocal(it.sid); // el estado vigente: pudo cambiar mientras viajaba el pedido
        if (cur) await putLocal({ ...cur, rejected: { message, at: new Date().toISOString(), code: data.code } });
        blocked.add(it.sid); continue;
      }
      if (res.status === 401) { hadError = "Tu sesión venció. Ingresá de nuevo para sincronizar (no se borra nada)."; break; }
      // QA 29/10 (DATA-7): un inicio o una serie rechazados no se borran (eran todo el entrenamiento offline): quedan en el
      // teléfono, la sesión se frena y la persona elige reintentar o descartar. El resto (pausa, sensación) se informa y sale.
      if (it.kind === "start" || it.kind === "set") {
        const message: string = data.error ?? "El servidor no aceptó este entrenamiento.";
        hadError = message;
        const cur = await getLocal(it.sid);
        if (cur) await putLocal({ ...cur, rejected: { message, at: new Date().toISOString(), code: data.code ?? "rejected" } });
        blocked.add(it.sid); continue;
      }
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
  let s = await getLocal(it.sid);
  if (!s) { await idbDel("queue", it.seq!); return; }
  if (it.kind === "start") { await putLocal({ ...s, synced: true, closeOther: false, conflict: undefined }); await idbDel("queue", it.seq!); return; }
  if (it.kind === "set") {
    const k = setKey(it.peId, it.idx);
    const x = s.sets[k];
    const changedMeanwhile = setChangedSince(x, b.sent as SentSet);
    if (data.status === "conflict") {
      s.sets[k] = { ...x, conflict: { id: data.conflictId as string, other: { weightKg: data.weightKg as number | null, reps: data.reps as number | null, rir: data.rir as number | null, metrics: (data.metrics as SetMetrics | null | undefined) ?? null }, appliedIsMine: false } };
    } else {
      // El servidor puede conservar su id (la misma serie creada antes): se adopta para ediciones futuras.
      s.sets[k] = { ...x, id: (data.id as string) ?? x.id, revision: data.revision as number, conflict: undefined };
      // Aviso al piso (sensación por serie): la pantalla informa si llegó a alguien en turno.
      const alert = data.alert as { notified: number } | null | undefined;
      if (alert && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("repi:floor-alert", { detail: { notified: alert.notified } }));
      // D210: el mensaje por serie que calculó el servidor (mismas reglas que el teléfono) entra en ESTA escritura, si el
      // teléfono no tenía uno y sigue el descanso de esa serie (ver adoptServerIntel). Antes se avisaba a la pantalla antes de
      // escribir y esta copia, leída antes, lo borraba. La pantalla lo toma al refrescarse tras sincronizar; nunca demora la cola.
      const intel = data.intel as { event?: { code: string; text: string; restPlusSec: number | null } | null } | null | undefined;
      if (intel?.event) s = adoptServerIntel(s, { peId: it.peId, idx: it.idx, event: intel.event }) ?? s;
    }
    await putLocal(s);
    if (!changedMeanwhile || data.status === "conflict") await idbDel("queue", it.seq!);
    return;
  }
  if (it.kind === "exchange") {
    // Si la persona volvió a cambiar mientras viajaba el pedido, el ítem queda y se envía el estado nuevo.
    const c = s.exercises.find((y) => y.id === it.peId)?.change ?? null;
    const now = JSON.stringify(c ? { kind: c.kind, reason: c.reason, exerciseId: c.substitute?.exerciseId ?? null } : null);
    if (now === b.sent) await idbDel("queue", it.seq!);
    return;
  }
  if (it.kind === "skip") {
    // Si la persona volvió a cambiarla mientras viajaba, queda el ítem y se envía lo nuevo. Si no, lo que dice el servidor
    // manda: otro dispositivo pudo deshacerla después, o la etapa ya tenía un resultado (el resultado gana).
    const k = setKey(it.peId, it.idx);
    const x = s.sets[k];
    if (!x) { await idbDel("queue", it.seq!); return; }
    if (`${!!x.skip && !x.done}|${x.skipAt ?? ""}` !== b.sent) return;
    if (!x.done && (data.skipped as boolean) !== !!x.skip) { s.sets[k] = { ...x, skip: !!data.skipped, skipAt: (data.changedAt as string | null) ?? x.skipAt }; await putLocal(s); }
    await idbDel("queue", it.seq!);
    return;
  }
  if (it.kind === "interval") {
    const iv = s.iv ?? null;
    const now = `${JSON.stringify(iv ? { peId: iv.peId, block: iv.block, startedAt: new Date(iv.start).toISOString(), emomSec: iv.emomSec, status: iv.status } : null)}|${s.ivAt ?? ""}`;
    if (now !== b.sent) return;
    const skew = typeof data.serverNow === "string" ? Date.parse(data.serverNow) - Date.now() : s.skew ?? 0;
    // No se aplicó (había un cambio más reciente de otro dispositivo, o el intervalo era viejo): queda el del servidor.
    if (data.applied === false) {
      const v = data.interval as { peId: string; block: number; startedAt: string; emomSec: number; status: "running" | "interrupted"; at: string } | null;
      await putLocal({ ...s, skew, iv: v ? { peId: v.peId, block: v.block, start: Date.parse(v.startedAt) - skew, emomSec: v.emomSec, status: v.status } : null, ivAt: v ? new Date(Date.parse(v.at) - skew).toISOString() : s.ivAt });
    } else await putLocal({ ...s, skew });
    await idbDel("queue", it.seq!);
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
