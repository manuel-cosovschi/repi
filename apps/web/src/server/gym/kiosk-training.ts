// REPI Control (D216): la pantalla de rutinas también registra lo que el socio hizo. No es un segundo sistema de entrenamiento:
// - Objetivos: Training Intelligence 2.0 (`recommendExercise` vía `previewTargets` al consultar; `ensureTargets` dentro de la
//   sesión, los mismos que ve la app). La pantalla nunca calcula cargas por su cuenta.
// - Registro: `startSession`, `logSet`, `setStageSkip` y `sessionAction` de `server/training/services.ts`, con la marca de la
//   pantalla (`KioskVia`). Mismas tablas (workout_session, set_log, set_skip, training_target), misma idempotencia por id de
//   serie, mismos conflictos entre dispositivos y las mismas reglas de versiones y sesiones terminadas.
// - Prescripción: nada de acá escribe en el programa ni en sus versiones. El socio registra resultados; no cambia ejercicios,
//   series, descansos ni cargas indicadas, ni acepta propuestas.
// Privacidad: sólo el nombre y la inicial, el programa, los objetivos y los resultados del día. Ninguna nota personal, sensación,
// molestia, salud, chat, foto ni contacto. Las explicaciones de REPI que mencionan una molestia o el descanso se reemplazan por
// un texto neutro (el número ya viene ajustado por el motor).
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  ACTIVITY_FIELD_SPEC, PROFILE_FIELDS, TECHNIQUES, activityOf, groupLabels, isActivityProfile, localDate, parseReps, prescriptionText, rowFlags, rowRef, setTarget,
  type ActivityField, type ExerciseDetail, type MetricsProfile, type RowTarget, type SetKind,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { getSession, logSet, nextDayOf, readVersion, sessionAction, setStageSkip, startSession, type KioskVia } from "../training/services";
import { previewTargets, type SessionEx } from "../training/intelligence";
import { exerciseProfiles, rowProfile } from "../training/library";
import { mediaFor } from "../training/exercise-media";
import { motionFor } from "../training/exercise-motion";
import type { MotionRef } from "@/lib/exercise-motion/ref";
import { KIOSK_IDLE_SEC, liveSession, personOf, signMedia } from "./kiosk";

const { workoutSession, programAssignment, program, programExercise, setLog } = schema;
type Live = Awaited<ReturnType<typeof liveSession>>;
type Media = Awaited<ReturnType<typeof mediaFor>> extends Map<string, infer V> ? V : never;

// ── Objetivo de REPI, sin datos de salud ────────────────────────────────────
const SENSITIVE_GUARDS = new Set(["pain_exercise", "pain_or_injury", "low_readiness"]);
const SENSITIVE_TEXT = /molest|lesi[oó]n|dolor|salud|energ[ií]a|mal descanso|sue[ñn]o/i;
const NEUTRAL_WHY = "REPI mantiene una referencia prudente para hoy. Si tenés dudas, consultá con el equipo de sala.";
export type KioskTarget = {
  status: RowTarget["status"]; action: RowTarget["action"]; source: RowTarget["source"]; quality: RowTarget["quality"];
  weightKg: number | null; repsTarget: number | null; repsMin: number | null; repsMax: number | null; rirTarget: number | null; rpeTarget: number | null;
  restSuggestSec: number | null; pending: boolean; text: string; why: string; review: string | null;
};
/** Lo que la pantalla muestra del objetivo: números y una explicación breve. Nunca guardas de salud ni referencias internas. */
export function kioskTarget(t: RowTarget | null | undefined): KioskTarget | null {
  if (!t) return null;
  const sensitive = t.guards.some((g) => SENSITIVE_GUARDS.has(g)) || SENSITIVE_TEXT.test(t.why) || SENSITIVE_TEXT.test(t.review ?? "");
  return {
    status: t.status, action: t.action, source: t.source, quality: t.quality, weightKg: t.weightKg, repsTarget: t.repsTarget, repsMin: t.repsMin, repsMax: t.repsMax,
    rirTarget: t.rirTarget, rpeTarget: t.rpeTarget, restSuggestSec: t.restSuggestSec, pending: t.pending, text: t.text,
    why: sensitive ? NEUTRAL_WHY : t.why, review: sensitive ? null : t.review,
  };
}

// ── Vista de un ejercicio (consulta y registro) ─────────────────────────────
type PlanEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; note: string | null; detail: ExerciseDetail | null };
export type KioskRow = {
  setIndex: number; label: string; kind: SetKind; block: number; stage: number;
  /** En una fila por tiempo, las repeticiones son segundos. */
  timed: boolean;
  /** Lo que indicó el profesor en la fila (la prescripción; nunca cambia desde la pantalla). */
  coach: { reps: string; weightKg: number | null; pct1rm: number | null; rir: number | null; rpe: number | null; restSec: number | null; note: string | null };
  /** Lo que recomienda Training Intelligence (null = sin objetivo para esta fila). */
  repi: KioskTarget | null;
  /** La última vez comparable (mismo tipo de serie y etapa). Null = sin referencia suficiente. */
  last: { weightKg: number | null; reps: number | null; at: string } | null;
  /** Diferencia entre lo indicado y lo recomendado, si la hay (el profe decide). */
  diff: string | null;
  /** Borrador para registrar: lo recomendado o lo indicado. Nunca cuenta como hecho hasta que la persona confirma. */
  draft: { weightKg: number | null; reps: number | null };
  /** Ya registrado en este entrenamiento (desde la app o desde una pantalla). */
  logged: { id: string; weightKg: number | null; reps: number | null; rir: number | null; metrics: Record<string, number> | null; revision: number; atKiosk: boolean } | null;
  /** Etapa conectada que se dejó sin hacer. */
  skipped: boolean;
};
export type KioskExercise = {
  id: string; name: string; sets: number; reps: string; rir: number | null; group: string | null; groupKind: string | null; rounds: number | null; method: string | null; tempo: string | null; variant: string | null;
  unilateral: boolean; emomSec: number | null; restSec: number | null; note: string | null; prescription: string; progression: string | null;
  /** Actividad por tiempo (cinta, bici…): campos a registrar además de la duración y lo indicado. */
  activity: { profile: MetricsProfile; fields: { key: ActivityField; label: string; unit: string | null; min: number; max: number; step: number; plan: number | null }[] } | null;
  /** Reemplazo de hoy (hecho en la app; la pantalla no reemplaza). */
  doing: string | null;
  demo: { kind: "video" | "link"; url: string } | null;
  /** D220: demostración oficial de REPI (animación propia; no guarda nada del socio). */
  motion: MotionRef | null;
  rows: KioskRow[];
  done: number; total: number;
};

const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
function diffOf(coachKg: number | null, t: KioskTarget | null): string | null {
  if (!t) return null;
  if (t.source === "coach") return coachKg != null ? "Carga indicada por tu profesor: REPI la respeta." : null;
  if (t.review) return t.review;
  if (coachKg != null && t.weightKg != null && Math.abs(coachKg - t.weightKg) >= 0.5) return `Tu profesor indicó ${kg(coachKg)}; con tu historial, REPI sugiere ${kg(t.weightKg)}. Manda lo indicado por tu profesor si tenés dudas.`;
  return null;
}
function draftOf(c: KioskRow["coach"], t: KioskTarget | null, timed: boolean, durationSec: number | null): KioskRow["draft"] {
  // Nunca se inventa una carga: la de REPI (si no la tiene que elegir la persona), si no la del profesor, si no vacía.
  const w = t && !t.pending && t.weightKg != null && t.weightKg > 0 ? t.weightKg : c.weightKg;
  const p = parseReps(c.reps);
  const reps = timed ? (p.kind === "time" ? p.seconds : null) : durationSec ? null : t?.repsTarget ?? t?.repsMin ?? (p.kind === "reps" ? p.min : null);
  return { weightKg: w ?? null, reps: reps ?? null };
}
const signedDemo = (live: Live, m: Media | null | undefined) =>
  m ? (m.kind === "video" ? { kind: "video" as const, url: signMedia(live.s.s.id, m.url.split("/").pop()!, live.s.s.expiresAt) } : { kind: "link" as const, url: m.url }) : null;

type LogRow = { id: string; setIndex: number; weightKg: number | null; reps: number | null; rir: number | null; metrics: unknown; revision: number };
function exerciseView(live: Live, e: PlanEx, o: {
  group: string | null; targets: RowTarget[]; profile: MetricsProfile; media: Media | null | undefined; motion: MotionRef | null | undefined; doing?: string | null;
  logs?: LogRow[]; kioskLogged?: Set<string>; skips?: number[];
}): KioskExercise {
  const d = e.detail;
  const act = activityOf(d);
  const profile = act?.profile ?? (isActivityProfile(o.profile) ? o.profile : null);
  const rows: KioskRow[] = Array.from({ length: e.sets }, (_, i) => {
    const st = setTarget({ sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, detail: d }, i);
    const fl = rowFlags({ sets: e.sets, reps: e.reps, detail: d }, i);
    const coach = { reps: st.reps, weightKg: st.weightKg, pct1rm: st.pct1rm, rir: st.rir, rpe: st.rpe, restSec: st.restSec ?? null, note: st.note };
    const t = kioskTarget(o.targets.find((x) => x.setIndex === i));
    const prev = o.targets.find((x) => x.setIndex === i)?.prev ?? null;
    const lg = o.logs?.find((l) => l.setIndex === i) ?? null;
    return {
      setIndex: i, label: st.label ?? (st.stage > 0 ? `Etapa ${st.stage}` : `Serie ${st.block + 1}`), kind: st.kind, block: st.block, stage: st.stage, timed: fl.timed,
      coach, repi: t, last: prev ? { weightKg: prev.w, reps: prev.r, at: prev.at } : null, diff: diffOf(st.weightKg, t), draft: draftOf(coach, t, fl.timed, fl.durationSec),
      logged: lg ? { id: lg.id, weightKg: lg.weightKg, reps: lg.reps, rir: lg.rir, metrics: (lg.metrics as Record<string, number> | null) ?? null, revision: lg.revision, atKiosk: !!o.kioskLogged?.has(lg.id) } : null,
      skipped: !lg && !!o.skips?.includes(i),
    };
  });
  const done = rows.filter((r) => r.logged || r.skipped).length;
  return {
    id: e.id, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, group: o.group, groupKind: d?.group ? d.groupKind ?? "superset" : null, rounds: d?.rounds ?? null,
    method: d?.technique && d.technique !== "straight" ? TECHNIQUES[d.technique]?.label ?? null : null, tempo: d?.tempo ?? null, variant: d?.variant ?? null,
    unilateral: !!d?.unilateral, emomSec: d?.emomSec ?? null, restSec: e.restSec || null, note: e.note, progression: d?.progression ?? null,
    prescription: prescriptionText({ sets: e.sets, reps: e.reps, rir: e.rir, detail: d }, { rir: true }),
    activity: profile ? { profile, fields: PROFILE_FIELDS[profile].map((k) => ({ key: k, ...ACTIVITY_FIELD_SPEC[k], plan: (act?.[k as keyof typeof act] as number | null | undefined) ?? null })) } : null,
    doing: o.doing ?? null, demo: signedDemo(live, o.media), motion: o.motion ?? null, rows, done, total: rows.length,
  };
}

// ── Consulta ────────────────────────────────────────────────────────────────
/** Entrenamiento abierto del socio en este gimnasio (o la señal de que tiene otro abierto fuera de él, sin detalles). */
async function openWorkout(userId: string, gymMemberId: string) {
  const [o] = await db.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["in_progress", "paused"])));
  if (!o) return { mine: null, elsewhere: false };
  if (o.gymMemberId !== gymMemberId) return { mine: null, elsewhere: true };
  const sets = await db.select({ id: setLog.id }).from(setLog).where(eq(setLog.sessionId, o.id));
  return { mine: { id: o.id, dayName: o.dayName, startedAt: o.startedAt.toISOString(), sets: sets.length }, elsewhere: false };
}

export async function programView(d: Live["d"], s: Live["s"], now: Date) {
  const live = { d, s };
  const userId = s.m.userId;
  const ow = await openWorkout(userId, s.m.id);
  const base = { person: await personOf(userId), gym: d.org.name, expiresAt: s.s.expiresAt, idleSec: KIOSK_IDLE_SEC, workout: ow.mine, otherOpen: ow.elsewhere };
  const [a] = await db.select({ a: programAssignment, p: program }).from(programAssignment).innerJoin(program, eq(program.id, programAssignment.programId))
    .where(and(eq(programAssignment.gymMemberId, s.m.id), eq(programAssignment.status, "active")));
  if (!a?.p.currentVersionId) return { ...base, program: null };
  const { version, doc } = await readVersion(a.p.currentVersionId);
  const all = doc.days.flatMap((x) => x.exercises) as (PlanEx & { id?: string })[];
  const ids = [...new Set(all.map((e) => e.exerciseId))];
  const [media, profiles, gym, motions] = await Promise.all([mediaFor(d.k.orgId, ids), exerciseProfiles(ids),
    import("./equipment").then((m) => m.laddersForMember(s.m.id, ids)).catch(() => null),
    motionFor(ids).catch(() => new Map<string, MotionRef>())]);
  const sx: SessionEx[] = all.map((e) => ({ id: e.id!, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, detail: e.detail ?? null,
    doing: e.exerciseId, skipped: false, logged: new Set<number>(), profile: rowProfile(e, e.exerciseId, profiles) }));
  // D216: la misma recomendación que la sesión emitiría (sin guardarla). Si el motor falla, la pantalla igual muestra lo indicado.
  const targets = await previewTargets(userId, sx, now, gym).catch(() => new Map<string, RowTarget[]>());
  const startsOk = a.a.startsOn <= localDate(now);
  return {
    ...base,
    program: {
      name: doc.name, note: doc.note || null, weeks: doc.weeks ?? null, version: version.number, updatedAt: version.createdAt, startsOn: a.a.startsOn,
      canLog: startsOk, nextDay: startsOk ? await nextDayOf(userId, a.a.id, doc) : 0,
      days: doc.days.map((day) => {
        const g = groupLabels(day.exercises);
        return {
          name: day.name,
          exercises: day.exercises.map((e, j) => exerciseView(live, { ...e, id: e.id!, rir: e.rir ?? null, note: e.note ?? null, detail: e.detail ?? null }, {
            group: g[j], targets: targets.get(e.id!) ?? [], profile: rowProfile(e, e.exerciseId, profiles), media: media.get(e.exerciseId), motion: motions.get(e.exerciseId),
          })),
        };
      }),
    },
  };
}

// ── Registro ────────────────────────────────────────────────────────────────
const via = (live: Live): KioskVia => ({ kioskId: live.d.k.id, gymMemberId: live.s.m.id });
const NOT_OPEN = () => new AccessError("workout_closed", "Este entrenamiento ya no está abierto. Volvé a empezar desde «Registrar mi entrenamiento».", 409);

/** Entrenamiento abierto en este gimnasio con sus ejercicios, objetivos y lo ya registrado (lo mismo que ve la app). */
async function workoutView(live: Live, sessionId: string, now: Date) {
  const userId = live.s.m.userId;
  const g = await getSession(userId, sessionId, now);
  if (g.status !== "in_progress" && g.status !== "paused") throw NOT_OPEN();
  // Series guardadas desde una pantalla (la última escritura): la pantalla lo indica junto a cada una.
  const atKiosk = new Set((await db.select({ id: setLog.id }).from(setLog).where(and(eq(setLog.sessionId, sessionId), isNotNull(setLog.kioskId)))).map((r) => r.id));
  const labels = groupLabels(g.exercises.filter((e) => !e.kept));
  let gi = 0;
  const exercises = g.exercises.map((e) => {
    const group = e.kept ? null : labels[gi++] ?? null;
    const sub = e.change?.kind === "substitute" && e.change.substitute ? e.change.substitute : null;
    return exerciseView(live, { id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note, detail: e.detail }, {
      group, targets: e.targets, profile: sub?.profile ?? e.profile, media: e.media, motion: sub ? e.motionSub?.ref ?? null : e.motion, doing: sub?.name ?? null,
      logs: e.logs.map((l) => ({ ...l, revision: l.revision })), kioskLogged: atKiosk, skips: e.skips.filter((k) => k.skipped).map((k) => k.setIndex),
    });
  });
  const skippedExercise = new Set(g.exercises.filter((e) => e.change?.kind === "skip").map((e) => e.id));
  return {
    id: g.id, dayName: g.dayName, status: g.status, startedAt: g.startedAt, outdated: g.outdated,
    exercises: exercises.map((x) => ({ ...x, skippedToday: skippedExercise.has(x.id) })),
    done: exercises.reduce((n, x) => n + x.done, 0), total: exercises.reduce((n, x) => n + x.total, 0),
  };
}

async function myOpen(live: Live, sessionId: string) {
  const [w] = await db.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, live.s.m.userId)));
  if (!w || w.gymMemberId !== live.s.m.id) throw new AccessError("not_found", "No encontramos ese entrenamiento.", 404);
  if (w.status !== "in_progress" && w.status !== "paused") throw NOT_OPEN();
  return w;
}

/** El entrenamiento abierto del socio en este gimnasio, si hay uno. */
export async function kioskWorkout(secret: string, token: string, now = new Date()) {
  const live = await liveSession(secret, token, now);
  const ow = await openWorkout(live.s.m.userId, live.s.m.id);
  return { workout: ow.mine ? await workoutView(live, ow.mine.id, now) : null, otherOpen: ow.elsewhere };
}

/**
 * «Registrar mi entrenamiento»: sigue el entrenamiento abierto en este gimnasio (empezado en la app o en otra visita a la
 * pantalla) o empieza el día elegido con `startSession`. `opId` lo genera la pantalla: un reintento devuelve el mismo
 * entrenamiento. Si la persona tiene otro abierto fuera de este gimnasio (un coach personal), la pantalla no lo toca.
 */
export async function kioskStartWorkout(secret: string, token: string, p: { opId: string; dayIndex: number }, now = new Date()) {
  const live = await liveSession(secret, token, now);
  const userId = live.s.m.userId;
  const ow = await openWorkout(userId, live.s.m.id);
  if (ow.elsewhere) throw new AccessError("other_open", "Tenés otro entrenamiento abierto en la app. Terminalo ahí para registrar en esta pantalla.", 409);
  if (ow.mine) return { workout: await workoutView(live, ow.mine.id, now), resumed: true };
  const [a] = await db.select({ a: programAssignment, p: program }).from(programAssignment).innerJoin(program, eq(program.id, programAssignment.programId))
    .where(and(eq(programAssignment.gymMemberId, live.s.m.id), eq(programAssignment.status, "active")));
  if (!a?.p.currentVersionId) throw new AccessError("no_program", "Todavía no tenés un programa asignado.", 409);
  const { doc } = await readVersion(a.p.currentVersionId);
  const day = Number.isInteger(p.dayIndex) ? doc.days[p.dayIndex] : undefined;
  if (!day?.id) throw new AccessError("invalid", "Elegí un día de tu programa.");
  const w = await startSession(userId, { id: p.opId, dayId: day.id }, now, via(live));
  return { workout: await workoutView(live, w.id, now), resumed: false };
}

export type KioskSetInput = { id: string; setIndex: number; skipped?: boolean; weightKg: number | null; reps: number | null; rir: number | null; metrics?: Record<string, number> | null; baseRevision?: number };

/**
 * «Registrar ejercicio»: guarda lo que la persona confirmó, serie por serie, con `logSet` (o `setStageSkip` para una etapa que
 * no hizo). Cada serie lleva un id que genera la pantalla: un reintento por un corte de red no duplica nada. Corregir una serie
 * ya registrada usa su id y su revisión; si cambió en otro dispositivo, queda el conflicto como en la app y no se pisa nada.
 * Una serie principal sin hacer simplemente no se registra (al terminar queda «no hecha», como en la app).
 */
export async function kioskLogExercise(secret: string, token: string, p: { sessionId: string; programExerciseId: string; sets: KioskSetInput[] }, now = new Date()) {
  const live = await liveSession(secret, token, now);
  const w = await myOpen(live, p.sessionId);
  const [pe] = await db.select().from(programExercise).where(eq(programExercise.id, p.programExerciseId));
  // Del día de la sesión (o uno de la versión anterior que ya tiene series en ella, como en `logSet`).
  const inSession = pe && (pe.dayId === w.dayId || (await db.select({ id: setLog.id }).from(setLog).where(and(eq(setLog.sessionId, w.id), eq(setLog.programExerciseId, pe.id))).limit(1)).length > 0);
  if (!pe || !inSession) throw new AccessError("invalid", "Ese ejercicio no es parte de este entrenamiento.");
  const seen = new Set<number>();
  for (const r of p.sets) {
    if (!Number.isInteger(r.setIndex) || r.setIndex < 0 || r.setIndex >= pe.sets || seen.has(r.setIndex)) throw new AccessError("invalid", "Revisá las series.");
    seen.add(r.setIndex);
    if (!r.skipped && r.reps == null && r.weightKg == null) throw new AccessError("invalid", "Completá lo que hiciste en cada serie o marcala como no realizada.");
  }
  const userId = live.s.m.userId;
  const results: { setIndex: number; status: "ok" | "conflict" | "skipped" | "not_done"; id?: string; revision?: number }[] = [];
  for (const r of [...p.sets].sort((a, b) => a.setIndex - b.setIndex)) {
    const ref = rowRef(pe.detail as ExerciseDetail | null, pe.sets, r.setIndex);
    if (r.skipped) {
      if (ref && ref.stage > 0) { await setStageSkip(userId, p.sessionId, { programExerciseId: pe.id, setIndex: r.setIndex, skipped: true }, now, via(live)); results.push({ setIndex: r.setIndex, status: "skipped" }); }
      else results.push({ setIndex: r.setIndex, status: "not_done" });
      continue;
    }
    const out = await logSet(userId, p.sessionId, { id: r.id, programExerciseId: pe.id, setIndex: r.setIndex, weightKg: r.weightKg, reps: r.reps, rir: r.rir,
      ...(r.metrics !== undefined ? { metrics: r.metrics } : {}), ...(r.baseRevision != null ? { baseRevision: r.baseRevision } : {}) }, now, via(live));
    results.push({ setIndex: r.setIndex, status: out.status, id: out.id, revision: out.revision });
  }
  await audit(db, { actorUserId: userId, orgId: live.d.k.orgId, action: "kiosk.sets_logged", resourceType: "workout_session", resourceId: p.sessionId,
    meta: { kioskId: live.d.k.id, credentialId: live.s.c.id, programExerciseId: pe.id, saved: results.filter((x) => x.status === "ok").length,
      skipped: results.filter((x) => x.status === "skipped" || x.status === "not_done").length, conflicts: results.filter((x) => x.status === "conflict").length } });
  const v = await workoutView(live, p.sessionId, now);
  return { results, exercise: v.exercises.find((x) => x.id === pe.id) ?? null, done: v.done, total: v.total };
}

/** «Terminar entrenamiento»: lo mismo que «Finalizar» en la app (sin series, se descarta). */
export async function kioskFinishWorkout(secret: string, token: string, sessionId: string, now = new Date()) {
  const live = await liveSession(secret, token, now);
  await myOpen(live, sessionId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(setLog).where(and(eq(setLog.sessionId, sessionId), isNull(setLog.voidedAt)));
  const r = await sessionAction(live.s.m.userId, sessionId, "finish", now, undefined, via(live));
  await audit(db, { actorUserId: live.s.m.userId, orgId: live.d.k.orgId, action: "kiosk.workout_finished", resourceType: "workout_session", resourceId: sessionId,
    meta: { kioskId: live.d.k.id, credentialId: live.s.c.id, status: r.status } });
  return { status: r.status, hadSets: n > 0 };
}
