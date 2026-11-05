"use client";
// Datos locales del alumno. Sólo entrenamiento (programa asignado y sesiones): nada de salud, mensajes ni fotos.
// Cada base pertenece a una cuenta: si cambia la persona, se borra todo antes de mostrar nada (master §6).
import { applySessionAction, carriesLoad, defaultRepsFor, kindAt, labelAt, startWeight, type ExerciseChangeReason, type ExerciseDetail, type Proposal, type RowTarget, type SessionStatus, type SetKind, type Suggestion, type Trend, type LoadLadder } from "@repi/domain";
import { idbAll, idbClear, idbDel, idbGet, idbPut } from "./idb";

// `pend` (D182): serie reducida (aproximación, back-off, drop) sin carga en el plan: el peso está por elegir (no se precarga el del top set).
// `skip` (D183): etapa conectada (drop, mini serie) que la persona decidió no hacer: queda resuelta y no es un resultado.
// D184: se sincroniza (`skipAt`, hora del cambio en este teléfono): la ven los otros dispositivos y se puede deshacer.
export type LocalSet = { id: string; w: number; r: number; rir: number | null; feel?: string | null; note?: string | null; done: boolean; revision: number; at: string | null; pend?: boolean; skip?: boolean; skipAt?: string | null;
  // `other`: la versión que NO es la que se ve en pantalla. `appliedIsMine`: si la versión aplicada en el servidor es la de este dispositivo.
  conflict?: { id: string; other: { weightKg: number | null; reps: number | null; rir: number | null }; appliedIsMine: boolean } };
// F-HX-21 (D106): saltar o reemplazar el ejercicio sólo en esta sesión. `origPrev`: el «anterior» del original, para volver.
export type ExChange = { kind: "skip" | "substitute"; reason: ExerciseChangeReason; substitute: { exerciseId: string; name: string } | null };
export type LocalEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; note: string | null; prev: { weightKg: number | null; reps: number | null } | null;
  detail?: ExerciseDetail | null; // D134: plan serie por serie, técnica, combinación
  change?: ExChange | null; origPrev?: LocalEx["prev"];
  suggest?: Suggestion | null; // D154: carga y reps sugeridas por REPI para hoy (sin carga indicada por el profe)
  media?: { kind: "video" | "link"; url: string } | null; // D164: cómo se hace (video o enlace del gimnasio o del coach)
  // D191: objetivo de REPI por fila (del servidor; durante la sesión se ajusta acá con las mismas reglas, también sin conexión).
  // Nunca es un resultado: lo registrado está en `sets`.
  targets?: (RowTarget & { id?: string })[] | null;
  outlook?: { trend: Trend; proposal: Proposal | null } | null;
  // D195: saltos y cargas disponibles con que se calcularon los objetivos (plan del ejercicio, equipo de la sede o desconocido).
  ladder?: LoadLadder | null;
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
  // D183 + D184: EMOM. Intervalo en curso (`start` en el reloj de este teléfono), qué serie es y si se interrumpió. Se
  // sincroniza: `ivAt` es cuándo cambió acá; `skew` = hora del servidor − hora del teléfono (la última que se observó).
  iv?: LocalInterval | null; ivAt?: string | null; skew?: number;
  // D191: último mensaje de Training Intelligence (uno solo) y los ya mostrados (`ejercicio:código`), para no repetirlos.
  intel?: { key: string; text: string; restPlusSec: number | null; at: string } | null; intelSeen?: string[];
  updatedAt: string;
};
export type LocalInterval = { peId: string; block: number; start: number; emomSec: number; status: "running" | "interrupted" };
/** D183: una fila está resuelta si se registró o si era una etapa que se decidió no hacer. */
export const rowResolved = (x: LocalSet | undefined) => !!x && (x.done || !!x.skip);
/**
 * D184: al volver a leer la sesión del servidor (sin nada pendiente en la cola), manda el servidor. Excepción: omisiones que
 * este teléfono guardó antes de que se sincronizaran (versión anterior de la app): se conservan y se devuelven para subirlas.
 */
export function keepLocalOnly(fresh: LocalSession, local: LocalSession | undefined, serverSkips?: Set<string>): { session: LocalSession; upload: string[] } {
  if (!local) return { session: fresh, upload: [] };
  const sets = { ...fresh.sets };
  const upload: string[] = [];
  for (const [k, v] of Object.entries(local.sets)) {
    if (!v.skip || !sets[k] || sets[k].done || serverSkips?.has(k)) continue;
    sets[k] = { ...sets[k], skip: true, skipAt: v.skipAt ?? local.updatedAt };
    upload.push(k);
  }
  return { session: { ...fresh, sets }, upload };
}
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
  interval?: { peId: string; block: number; startedAt: string; emomSec: number; status: "running" | "interrupted"; at: string } | null; serverNow?: string;
}, keepRest?: LocalSession["rest"]): LocalSession {
  const skew = x.serverNow ? Date.parse(x.serverNow) - Date.now() : 0;
  const sets: Record<string, LocalSet> = {};
  for (const e of x.exercises) {
    let carry: number | null = e.defaultWeight ?? null, carryKind: SetKind = "work", carryLabel: string | null = null, logged = false;
    // D154: sin series hechas en esta sesión, el peso y las reps de partida son los sugeridos por REPI.
    const sg = e.change ? null : e.suggest ?? null;
    const doing = e.change?.kind === "substitute" ? e.change.substitute?.exerciseId : e.exerciseId;
    const skips = (e as { skips?: { setIndex: number; skipped: boolean; changedAt: string }[] }).skips ?? [];
    for (let i = 0; i < e.sets; i++) {
      const l = e.logs.find((y) => y.setIndex === i);
      const sk = skips.find((y) => y.setIndex === i);
      const c = x.conflicts?.find((k) => k.targetKey === setKey(e.id, i));
      const kind = kindAt(e.detail, i);
      // Sólo una serie del mismo ejercicio sugiere el peso de las siguientes (un reemplazo no hereda la carga del original).
      if (l) { logged = true; if (!l.exerciseId || l.exerciseId === doing) { carry = l.weightKg ?? carry; carryKind = kind; carryLabel = labelAt(e.detail, i); } sets[setKey(e.id, i)] = { id: l.id, w: l.weightKg ?? 0, r: l.reps ?? 0, rir: l.rir, feel: l.feel ?? null, note: l.note ?? null, done: true, revision: l.revision, at: l.completedAt, ...(c ? { conflict: { id: c.id, other: c.client as never, appliedIsMine: true } } : {}) }; }
      else {
        // D134: si el plan fija el peso o las repeticiones de esta serie, se precargan esas (drop, top set, back-off).
        // D182: una serie reducida sin peso en el plan no hereda la carga de otra serie ni la sugerencia: queda por elegir.
        const plan = e.detail?.setPlan?.[i];
        // D191: el objetivo de la fila (si REPI lo calculó y no es una serie reducida) precarga el borrador, sólo antes de la
        // primera serie registrada: después manda la carga que la persona eligió (no se pisa una elección manual).
        const t = e.change ? null : (e.targets ?? []).find((y) => y.setIndex === i && y.source === "rules" && !y.pending && y.weightKg != null) ?? null;
        // D192: una serie con nombre propio (Load Set) sólo arranca con su propio objetivo o la carga del profe: nunca con la
        // sugerencia del ejercicio ni con la carga de otra fila (el top set).
        const lb = labelAt(e.detail, i);
        const st = startWeight({ kind, label: lb, planKg: plan?.weightKg, suggestKg: !logged ? t?.weightKg ?? (lb ? null : sg?.weightKg) : null, carriedKg: carriesLoad(carryKind, kind, carryLabel, lb) ? carry : null });
        sets[setKey(e.id, i)] = { id: crypto.randomUUID(), w: st.w, ...(st.pending ? { pend: true } : {}),
          r: (plan ? defaultRepsFor(plan.reps) : null) ?? (!logged && t ? t.repsTarget ?? t.repsMin : null) ?? (!logged && sg ? sg.reps : null) ?? e.defaultReps ?? 0, rir: null, done: false, revision: 0, at: null,
          ...(sk ? { skip: sk.skipped, skipAt: sk.changedAt } : {}) }; // D184: omitida (o deshecha) en cualquier dispositivo
      }
    }
  }
  return {
    id: x.id, dayId: x.dayId ?? "", dayName: x.dayName, note: x.note, startedAt: x.startedAt, status: x.status, activeMs: x.activeMs, lastResumedAt: x.lastResumedAt,
    endedAt: x.endedAt, rpe: x.rpe, sessionNote: x.sessionNote, revision: x.revision, synced: true, rest: keepRest ?? null, updatedAt: new Date().toISOString(),
    skew, ivAt: x.interval?.at ? new Date(Date.parse(x.interval.at) - skew).toISOString() : null,
    iv: x.interval ? { peId: x.interval.peId, block: x.interval.block, start: Date.parse(x.interval.startedAt) - skew, emomSec: x.interval.emomSec, status: x.interval.status } : null,
    exercises: x.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note, prev: e.prev, change: e.change ?? null, detail: e.detail ?? null, suggest: e.suggest ?? null, media: e.media ?? null, targets: e.targets ?? null, outlook: e.outlook ?? null, ladder: (e as { ladder?: LoadLadder | null }).ladder ?? null })),
    sets,
  };
}
