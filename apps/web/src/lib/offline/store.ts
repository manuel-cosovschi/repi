"use client";
// Datos locales del alumno. Sólo entrenamiento (programa asignado y sesiones): nada de salud, mensajes ni fotos.
// Cada base pertenece a una cuenta: si cambia la persona, se borra todo antes de mostrar nada (master §6).
import { applySessionAction, defaultRepsFor, type ExerciseChangeReason, type ExerciseDetail, type SessionStatus, type Suggestion } from "@repi/domain";
import { idbAll, idbClear, idbDel, idbGet, idbPut } from "./idb";

export type LocalSet = { id: string; w: number; r: number; rir: number | null; feel?: string | null; note?: string | null; done: boolean; revision: number; at: string | null;
  // `other`: la versión que NO es la que se ve en pantalla. `appliedIsMine`: si la versión aplicada en el servidor es la de este dispositivo.
  conflict?: { id: string; other: { weightKg: number | null; reps: number | null; rir: number | null }; appliedIsMine: boolean } };
// F-HX-21 (D106): saltar o reemplazar el ejercicio sólo en esta sesión. `origPrev`: el «anterior» del original, para volver.
export type ExChange = { kind: "skip" | "substitute"; reason: ExerciseChangeReason; substitute: { exerciseId: string; name: string } | null };
export type LocalEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; note: string | null; prev: { weightKg: number | null; reps: number | null } | null;
  detail?: ExerciseDetail | null; // D134: plan serie por serie, técnica, combinación
  change?: ExChange | null; origPrev?: LocalEx["prev"];
  suggest?: Suggestion | null; // D154: carga y reps sugeridas por REPI para hoy (sin carga indicada por el profe)
};
export type LocalSession = {
  id: string; dayId: string; dayName: string; note: string; startedAt: string; status: SessionStatus; activeMs: number;
  lastResumedAt: string | null; endedAt: string | null; rpe: number | null; sessionNote: string | null; revision: number;
  exercises: LocalEx[]; sets: Record<string, LocalSet>; // clave `${programExerciseId}:${setIndex}`
  synced: boolean; closeOther?: boolean;
  conflict?: { kind: "open_session"; other: { id: string; dayName: string; startedAt: string; sets: number } };
  // El servidor rechazó la sesión porque el acceso (coach o gym) dejó de estar vigente: los datos quedan en el teléfono,
  // la cola no se borra y se vuelve a intentar sólo ante un evento (volver a la app, reconectar, «Reintentar»).
  rejected?: { message: string; at: string; code?: string };
  rest?: { end: number | null; total: number; left: number; paused: boolean } | null;
  updatedAt: string;
};
export const setKey = (peId: string, i: number) => `${peId}:${i}`;

export async function ensureOwner(userId: string) {
  const owner = await idbGet<string>("kv", "owner");
  if (owner && owner !== userId) await wipeLocal();
  if (owner !== userId) await idbPut("kv", userId, "owner");
}
export async function wipeLocal() {
  await Promise.all([idbClear("kv"), idbClear("sessions"), idbClear("queue")]);
  try { Object.keys(localStorage).filter((k) => k.startsWith("repi_")).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
}

export const saveTraining = (t: unknown) => idbPut("kv", { t, at: new Date().toISOString() }, "training");
export const loadTraining = <T>() => idbGet<{ t: T; at: string }>("kv", "training");

export const getLocal = (id: string) => idbGet<LocalSession>("sessions", id);
export const putLocal = (s: LocalSession) => idbPut("sessions", { ...s, updatedAt: new Date().toISOString() });
export const delLocal = (id: string) => idbDel("sessions", id);
export const allLocal = () => idbAll<LocalSession>("sessions");
export const openLocal = async () => (await allLocal()).find((s) => s.status === "in_progress" || s.status === "paused") ?? null;

/** Aplica una acción de sesión localmente con la hora del dispositivo (la misma regla que el servidor). */
export function localAction(s: LocalSession, action: "pause" | "resume" | "finish", at = new Date()): LocalSession | null {
  const hasSets = Object.values(s.sets).some((x) => x.done);
  const n = applySessionAction({ status: s.status, activeMs: s.activeMs, lastResumedAt: s.lastResumedAt ? new Date(s.lastResumedAt) : null, startedAt: new Date(s.startedAt) }, action, at, hasSets);
  if (!n) return null;
  return { ...s, status: n.status, activeMs: n.activeMs, lastResumedAt: n.lastResumedAt?.toISOString() ?? null, endedAt: n.endedAt?.toISOString() ?? null };
}

/** Sesión del servidor → modelo local (se usa cuando no hay cambios locales pendientes). */
export function fromServer(x: {
  id: string; dayName: string; status: SessionStatus; note: string; rpe: number | null; sessionNote: string | null; startedAt: string; endedAt: string | null;
  activeMs: number; lastResumedAt: string | null; revision: number; dayId?: string;
  exercises: (LocalEx & { defaultWeight: number | null; defaultReps: number | null; logs: { id: string; setIndex: number; exerciseId?: string; weightKg: number | null; reps: number | null; rir: number | null; feel?: string | null; note?: string | null; revision: number; completedAt: string }[] })[];
  conflicts?: { id: string; targetKey: string; server: unknown; client: unknown }[];
}, keepRest?: LocalSession["rest"]): LocalSession {
  const sets: Record<string, LocalSet> = {};
  for (const e of x.exercises) {
    let lastW = e.defaultWeight ?? 0, logged = false;
    // D154: sin series hechas en esta sesión, el peso y las reps de partida son los sugeridos por REPI.
    const sg = e.change ? null : e.suggest ?? null;
    const doing = e.change?.kind === "substitute" ? e.change.substitute?.exerciseId : e.exerciseId;
    for (let i = 0; i < e.sets; i++) {
      const l = e.logs.find((y) => y.setIndex === i);
      const c = x.conflicts?.find((k) => k.targetKey === setKey(e.id, i));
      // Sólo una serie del mismo ejercicio sugiere el peso de las siguientes (un reemplazo no hereda la carga del original).
      if (l) { logged = true; if (!l.exerciseId || l.exerciseId === doing) lastW = l.weightKg ?? lastW; sets[setKey(e.id, i)] = { id: l.id, w: l.weightKg ?? 0, r: l.reps ?? 0, rir: l.rir, feel: l.feel ?? null, note: l.note ?? null, done: true, revision: l.revision, at: l.completedAt, ...(c ? { conflict: { id: c.id, other: c.client as never, appliedIsMine: true } } : {}) }; }
      else {
        // D134: si el plan fija el peso o las repeticiones de esta serie, se precargan esas (drop, top set, back-off).
        const plan = e.detail?.setPlan?.[i];
        sets[setKey(e.id, i)] = { id: crypto.randomUUID(), w: plan?.weightKg ?? (!logged && sg?.weightKg != null ? sg.weightKg : lastW),
          r: (plan ? defaultRepsFor(plan.reps) : null) ?? (!logged && sg ? sg.reps : null) ?? e.defaultReps ?? 0, rir: null, done: false, revision: 0, at: null };
      }
    }
  }
  return {
    id: x.id, dayId: x.dayId ?? "", dayName: x.dayName, note: x.note, startedAt: x.startedAt, status: x.status, activeMs: x.activeMs, lastResumedAt: x.lastResumedAt,
    endedAt: x.endedAt, rpe: x.rpe, sessionNote: x.sessionNote, revision: x.revision, synced: true, rest: keepRest ?? null, updatedAt: new Date().toISOString(),
    exercises: x.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note, prev: e.prev, change: e.change ?? null, detail: e.detail ?? null, suggest: e.suggest ?? null })),
    sets,
  };
}
