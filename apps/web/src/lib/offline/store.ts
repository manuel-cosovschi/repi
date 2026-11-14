"use client";
// Datos locales del alumno. Sólo entrenamiento (programa asignado y sesiones): nada de salud, mensajes ni fotos.
// Cada base pertenece a una cuenta: si cambia la persona, se borra todo antes de mostrar nada (master §6).
import {
  ACTIVITY_FIELDS, activityOf, applySessionAction, repsDistance, carriesLoad, defaultRepsFor, kindAt, labelAt, parseReps, startWeight,
  type ActivityDetail, type ExerciseChangeReason, type ExerciseDetail, type MetricsProfile, type Proposal, type RowTarget, type SessionStatus, type SetKind, type SetMetrics, type Suggestion, type Trend, type LoadLadder,
} from "@repi/domain";
import { idbAll, idbClear, idbDel, idbGet, idbMerge, idbPut } from "./idb";
import type { MotionRef } from "@/lib/exercise-motion/ref";

// `pend` (D182): serie reducida (aproximación, back-off, drop) sin carga en el plan: el peso está por elegir (no se precarga el del top set).
// `skip` (D183): etapa conectada (drop, mini serie) que la persona decidió no hacer: queda resuelta y no es un resultado.
// D184: se sincroniza (`skipAt`, hora del cambio en este teléfono): la ven los otros dispositivos y se puede deshacer.
// `m` (ejercicios por tiempo): valores reales de una actividad (velocidad, inclinación, nivel…); en una actividad `r` son los
// segundos. Sin `m` (sesiones guardadas por una versión anterior de la app) se lee como «sin métricas» y no se envía el campo:
// el servidor conserva lo que tenga. `null` = sin métricas (se envía y las borra).
export type LocalSet = { id: string; w: number; r: number; rir: number | null; feel?: string | null; note?: string | null; m?: SetMetrics | null; done: boolean; revision: number; at: string | null; pend?: boolean; skip?: boolean; skipAt?: string | null;
  // `other`: la versión que NO es la que se ve en pantalla. `appliedIsMine`: si la versión aplicada en el servidor es la de este dispositivo.
  conflict?: { id: string; other: { weightKg: number | null; reps: number | null; rir: number | null; metrics?: SetMetrics | null }; appliedIsMine: boolean } };
// F-HX-21 (D106): saltar o reemplazar el ejercicio sólo en esta sesión. `origPrev`: el «anterior» del original, para volver.
// `substitute.profile` (ejercicios por tiempo): qué se registra con el reemplazo (otra máquina de cardio, fuerza…). Lo trae el
// servidor y la lista de alternativas; sin él (versión anterior), el reemplazo se registra como siempre (sin métricas).
export type ExChange = { kind: "skip" | "substitute"; reason: ExerciseChangeReason; substitute: { exerciseId: string; name: string; profile?: MetricsProfile | null } | null };
export type LocalEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; note: string | null; prev: { weightKg: number | null; reps: number | null; metrics?: SetMetrics | null } | null;
  detail?: ExerciseDetail | null; // D134: plan serie por serie, técnica, combinación
  change?: ExChange | null; origPrev?: LocalEx["prev"];
  suggest?: Suggestion | null; // D154: carga y reps sugeridas por REPI para hoy (sin carga indicada por el profe)
  media?: { kind: "video" | "link"; url: string } | null; // D164: cómo se hace (video o enlace del gimnasio o del coach)
  // D220: demostración oficial de REPI del ejercicio indicado y la del reemplazo que conocía el servidor (ver `motionOf`).
  motion?: MotionRef | null;
  motionSub?: { exerciseId: string; ref: MotionRef | null } | null;
  // D191: objetivo de REPI por fila (del servidor; durante la sesión se ajusta acá con las mismas reglas, también sin conexión).
  // Nunca es un resultado: lo registrado está en `sets`.
  targets?: (RowTarget & { id?: string })[] | null;
  outlook?: { trend: Trend; proposal: Proposal | null } | null;
  // D195: saltos y cargas disponibles con que se calcularon los objetivos (plan del ejercicio, equipo de la sede o desconocido).
  ladder?: LoadLadder | null;
  // Ejercicios por tiempo: perfil con que se registra (cinta, bici, remo… o fuerza) y la actividad indicada por el profe. Sin
  // `profile` (sesión guardada por una versión anterior), se deduce de la actividad del detalle (`localProfile`).
  profile?: MetricsProfile | null;
  activity?: ActivityDetail | null;
};
/** Demostración que corresponde a lo que se hace hoy: la del reemplazo si hay uno (y el servidor la conoce), si no la del indicado. */
export function motionOf(e: Pick<LocalEx, "change" | "motion" | "motionSub">): MotionRef | null {
  const sub = e.change?.kind === "substitute" ? e.change.substitute : null;
  if (sub) return e.motionSub?.exerciseId === sub.exerciseId ? e.motionSub.ref : null;
  return e.motion ?? null;
}
export type LocalSession = {
  id: string; dayId: string; dayName: string; note: string; startedAt: string; status: SessionStatus; activeMs: number;
  lastResumedAt: string | null; endedAt: string | null; rpe: number | null; sessionNote: string | null; revision: number;
  exercises: LocalEx[]; sets: Record<string, LocalSet>; // clave `${programExerciseId}:${setIndex}`
  synced: boolean; closeOther?: boolean;
  conflict?: { kind: "open_session"; other: { id: string; dayName: string; startedAt: string; sets: number } };
  // El servidor rechazó la sesión porque el acceso (coach o gym) dejó de estar vigente: los datos quedan en el teléfono,
  // la cola no se borra y se vuelve a intentar sólo ante un evento (volver a la app, reconectar, «Reintentar»).
  rejected?: { message: string; at: string; code?: string };
  // `of`: la serie que abrió este descanso (el mensaje del servidor sobre esa serie es el único que puede aparecer en él).
  rest?: { end: number | null; total: number; left: number; paused: boolean; of?: { peId: string; idx: number } | null } | null;
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

/**
 * Ejercicios por tiempo: perfil con que se registra un ejercicio de la sesión local. Con reemplazo, el del ejercicio que se hace
 * (`change.substitute.profile`; sin él, null: como siempre). Sin reemplazo, el de la fila que mandó el servidor; en una sesión
 * guardada antes de esta versión, el de la actividad del detalle (si la hay); si no, null (se registra como siempre).
 */
export const localProfile = (e: Pick<LocalEx, "profile" | "detail" | "change">): MetricsProfile | null =>
  e.change?.kind === "substitute" ? e.change.substitute?.profile ?? null : e.profile ?? activityOf(e.detail)?.profile ?? null;
/** Valores de partida de una actividad: los que indicó el profe (velocidad, inclinación, nivel…), sin el perfil. null si no hay. */
export function activityDraft(a: ActivityDetail | null | undefined): SetMetrics | null {
  if (!a) return null;
  const m: SetMetrics = {};
  for (const f of ACTIVITY_FIELDS) if (a[f] != null) m[f] = a[f];
  return Object.keys(m).length ? m : null;
}

/** D210: mensaje por serie que calculó el servidor (las mismas reglas que el teléfono), tal como lo devuelve al registrar la serie. */
export type ServerSetIntel = { peId: string; idx: number; event: { code: string; text: string; restPlusSec: number | null } };
/**
 * D210 (revisión AC3 #10/#23/#32): adopta el mensaje del servidor sobre una serie si el teléfono no tenía uno (p. ej. sin
 * objetivos porque el entrenamiento empezó sin conexión). Sólo durante el descanso que abrió ESA serie: un mensaje que llega
 * tarde (la cola se vació al reconectar) no aparece en el descanso de otro ejercicio. Nunca pisa el mensaje de las reglas
 * locales ni repite uno ya mostrado en el ejercicio. Devuelve la sesión con el mensaje, o `null` si no corresponde.
 * La cola lo aplica sobre la copia que escribe (una sola escritura): así la sincronización no lo borra.
 */
export function adoptServerIntel(s: LocalSession, d: ServerSetIntel, now = Date.now()): LocalSession | null {
  const r = s.rest;
  if (!d.event?.text || s.intel || !r || r.paused || (r.end != null && r.end <= now)) return null;
  if (!r.of || r.of.peId !== d.peId || r.of.idx !== d.idx) return null;
  const key = `${d.peId}:${d.event.code}`;
  if ((s.intelSeen ?? []).includes(key)) return null;
  return { ...s, intel: { key, text: d.event.text, restPlusSec: d.event.restPlusSec ?? null, at: new Date(now).toISOString() }, intelSeen: [...(s.intelSeen ?? []), key] };
}

/**
 * D191/D195 (regresión del hotfix #26): al traer los objetivos de REPI para una sesión recién iniciada se completan sólo
 * los ejercicios sin objetivos, con objetivos, tendencia y escalera de cargas del equipo. Nunca toca series, borradores,
 * descanso ni intervalo; si el servidor no trae escalera se conserva la que ya había.
 */
export type IntelEx = { id: string; targets?: LocalEx["targets"]; outlook?: LocalEx["outlook"]; ladder?: LocalEx["ladder"]; media?: LocalEx["media"]; motion?: LocalEx["motion"]; motionSub?: LocalEx["motionSub"] };
export function mergeIntel(c: LocalSession, srv: { exercises: IntelEx[] }): LocalSession {
  const by = new Map(srv.exercises.map((e) => [e.id, e]));
  return { ...c, exercises: c.exercises.map((e) => {
    const x = by.get(e.id);
    let out = e.targets != null ? e : { ...e, targets: x?.targets ?? [], outlook: x?.outlook ?? null, ladder: x?.ladder ?? e.ladder ?? null };
    // D164/D220: la sesión creada en el teléfono no trae el video del gimnasio ni la demostración del reemplazo: se completan acá.
    // Sólo si el servidor trae esos campos: un ejercicio que el servidor no completa queda tal cual.
    if (out.media === undefined && x && "media" in x) out = { ...out, media: x.media ?? null };
    if (out.motionSub === undefined && x && "motionSub" in x) out = { ...out, motion: out.motion ?? x.motion ?? null, motionSub: x.motionSub ?? null };
    return out;
  }) };
}


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
/**
 * FSA1 (MEMBER-03): una copia vieja de la sesión (otra pestaña, una respuesta del servidor aplicada sobre una lectura anterior)
 * nunca «deshace» en el teléfono una serie ya registrada: si lo guardado la tiene hecha y la copia no, queda la guardada. En el
 * teléfono una serie hecha no vuelve a pendiente; sólo el servidor puede cambiar eso (`putServerCopy`).
 */
export function keepDone(incoming: LocalSession, stored: LocalSession | undefined): LocalSession {
  if (!stored) return incoming;
  let sets: Record<string, LocalSet> | null = null;
  for (const [k, v] of Object.entries(incoming.sets)) {
    const o = stored.sets[k];
    if (o?.done && !v?.done) (sets ??= { ...incoming.sets })[k] = o;
  }
  return sets ? { ...incoming, sets } : incoming;
}
/** Guarda un cambio hecho en el teléfono (lectura y escritura en una sola transacción, sin deshacer series hechas). */
export const putLocal = (s: LocalSession) => idbMerge<LocalSession>("sessions", s.id, (cur) => ({ ...keepDone(s, cur), updatedAt: new Date().toISOString() }));
/** Reemplaza la copia local por la del servidor (sin nada pendiente en la cola): manda el servidor. */
export const putServerCopy = (s: LocalSession) => idbPut("sessions", { ...s, updatedAt: new Date().toISOString() });
/** Cambia la sesión guardada a partir de lo que hay guardado AHORA (en la misma transacción). Sin sesión, no hace nada. */
export const updateLocal = (id: string, fn: (s: LocalSession) => LocalSession) =>
  idbMerge<LocalSession>("sessions", id, (cur) => (cur ? { ...keepDone(fn(cur), cur), updatedAt: new Date().toISOString() } : undefined));
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
  exercises: (LocalEx & { defaultWeight: number | null; defaultReps: number | null; logs: { id: string; setIndex: number; exerciseId?: string; weightKg: number | null; reps: number | null; rir: number | null; feel?: string | null; note?: string | null; metrics?: SetMetrics | null; revision: number; completedAt: string }[] })[];
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
    // Ejercicios por tiempo: una actividad indicada arranca con su duración (segundos) y sus valores (velocidad, inclinación…).
    const act = e.change ? null : e.activity ?? activityOf(e.detail);
    const draftM = activityDraft(act);
    // Remo por distancia («500 m»): no hay duración que precargar (leerlo como minutos daría 500 min).
    const dur = act && repsDistance(act.profile, e.reps) == null ? parseReps(e.reps) : null;
    const draftSec = dur?.kind === "time" ? dur.seconds : null;
    for (let i = 0; i < e.sets; i++) {
      const l = e.logs.find((y) => y.setIndex === i);
      const sk = skips.find((y) => y.setIndex === i);
      const c = x.conflicts?.find((k) => k.targetKey === setKey(e.id, i));
      const kind = kindAt(e.detail, i);
      // Sólo una serie del mismo ejercicio sugiere el peso de las siguientes (un reemplazo no hereda la carga del original).
      if (l) { logged = true; if (!l.exerciseId || l.exerciseId === doing) { carry = l.weightKg ?? carry; carryKind = kind; carryLabel = labelAt(e.detail, i); } sets[setKey(e.id, i)] = { id: l.id, w: l.weightKg ?? 0, r: l.reps ?? 0, rir: l.rir, feel: l.feel ?? null, note: l.note ?? null, m: l.metrics ?? null, done: true, revision: l.revision, at: l.completedAt, ...(c ? { conflict: { id: c.id, other: c.client as never, appliedIsMine: true } } : {}) }; }
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
          r: (plan ? defaultRepsFor(plan.reps) : null) ?? (!logged && t ? t.repsTarget ?? t.repsMin : null) ?? (!logged && sg ? sg.reps : null) ?? e.defaultReps ?? draftSec ?? 0, rir: null, done: false, revision: 0, at: null,
          // Ejercicios por tiempo: la actividad arranca con los valores que indicó el profe (sin reemplazo); la persona los ajusta.
          ...(draftM ? { m: draftM } : {}),
          ...(sk ? { skip: sk.skipped, skipAt: sk.changedAt } : {}) }; // D184: omitida (o deshecha) en cualquier dispositivo
      }
    }
  }
  return {
    id: x.id, dayId: x.dayId ?? "", dayName: x.dayName, note: x.note, startedAt: x.startedAt, status: x.status, activeMs: x.activeMs, lastResumedAt: x.lastResumedAt,
    endedAt: x.endedAt, rpe: x.rpe, sessionNote: x.sessionNote, revision: x.revision, synced: true, rest: keepRest ?? null, updatedAt: new Date().toISOString(),
    skew, ivAt: x.interval?.at ? new Date(Date.parse(x.interval.at) - skew).toISOString() : null,
    iv: x.interval ? { peId: x.interval.peId, block: x.interval.block, start: Date.parse(x.interval.startedAt) - skew, emomSec: x.interval.emomSec, status: x.interval.status } : null,
    exercises: x.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note, prev: e.prev, change: e.change ?? null, detail: e.detail ?? null, suggest: e.suggest ?? null, media: e.media ?? null, motion: e.motion ?? null, motionSub: e.motionSub ?? null, targets: e.targets ?? null, outlook: e.outlook ?? null, ladder: (e as { ladder?: LoadLadder | null }).ladder ?? null,
      profile: e.profile ?? null, activity: e.activity ?? activityOf(e.detail) })),
    sets,
  };
}
