// Contexto del cerebro (D209, contrato §5 «context.ts»). Arma el BrainContext autorizado de UNA persona (el userId de la
// sesión) con lo que ya existe en la base: perfil y edad, deseos, relación, programa vigente, sesión abierta, historial,
// check-in, molestias y restricciones (salud: sólo para la propia persona; a la IA no va sin consentimiento), cuerpo (sólo
// adultos y sólo números, nunca fotos), procedencia de rutinas importadas y memoria vigente.
//
// La referencia que manda el navegador (`ref`: ejercicio, sesión, rutina) sólo SUGIERE: se valida contra la base y un id ajeno
// responde 404, igual que uno inexistente. Es barato: dos tandas de consultas en paralelo (sin IA ni cálculos pesados).
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { ageEligibility, localDate, nextDayIndex, parseReps, type ExerciseDetail, type TrainingWishes } from "@repi/domain";
import {
  arDaysBetween, contextVersion, endOfArDay, fact, noFact, type AgeBand, type BrainContext, type BrainPrefs, type ExerciseRef, type MemoryItem, type Section,
} from "@repi/domain/brain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { myActive, readVersion } from "../training/services";
import { listMemory } from "./memory";
import { getPrefs } from "./prefs";

const { user, userPref, program, programDay, programExercise, workoutSession, setLog, sessionExerciseChange, exercise, checkin, painReport, injury,
  bodyGoal, ownRoutine } = schema;

export const SECTIONS: readonly Section[] = ["home", "workout", "review", "progress", "body", "history", "routines", "messages", "gym", "profile", "club"];
export const isSection = (x: unknown): x is Section => typeof x === "string" && (SECTIONS as readonly string[]).includes(x);
const ID_RE = /^[\w-]{1,64}$/;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const DAY = 86_400_000;

/** Lo que manda el navegador como referencia de la pantalla (todo opcional; se valida contra la base). */
export type BrainRef = { exerciseId?: string | null; sessionId?: string | null; programExerciseId?: string | null; setIndex?: number | null; routineId?: string | null };

/** Un ejercicio que la persona puede nombrar. `ref` es el id que ve el dominio: el del programa en la sesión abierta, el de la biblioteca fuera de ella. */
export type ExMeta = {
  ref: string; exerciseId: string; peId: string | null; name: string; inSession: boolean;
  sets: number | null; reps: string | null; rir: number | null; restSec: number | null; detail: ExerciseDetail | null;
  muscleGroup: string | null; kind: string | null;
};
export type SessionExercise = ExMeta & {
  peId: string; originalId: string; originalName: string; position: number; loggedIdx: number[]; skipped: boolean; substituted: boolean;
};
export type ServerContext = {
  ctx: BrainContext;
  userId: string;
  now: Date;
  prefs: BrainPrefs;
  /** Relación activa (para el presupuesto de IA por organización y los pedidos en sala). */
  relation: { id: string; kind: "coach" | "gym"; orgId: string } | null;
  program: { id: string; versionId: string; kind: string; days: { id: string; name: string; exercises: { peId: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; detail: ExerciseDetail | null }[] }[] } | null;
  session: { id: string; versionId: string; dayId: string; status: string; startedAt: Date; coachClientId: string | null; gymMemberId: string | null; programKind: string | null; exercises: SessionExercise[] } | null;
  /** Dueño de lo que se modificaría HOY: el programa de la sesión abierta (una rutina propia es «own») o el vigente. */
  execOwner: "coach" | "gym" | "own" | null;
  /** Ejercicios que la persona puede nombrar (sesión, programa, historial reciente), en ese orden, sin repetir. */
  exercises: ExerciseRef[];
  meta: Map<string, ExMeta>;
  /** «Consultame antes de cambiar algo» (preferencia declarada). */
  confirmFirst: boolean;
  /** Lo que la persona pidió evitar (deseos y memoria), para no proponerlo. */
  avoids: string[];
  /** Restricciones que nombran ejercicios (molestias recientes), para no proponerlos. */
  restrictedNames: string[];
  bodyRaw: { firstG: number | null; lastG: number | null; lastDay: string | null; entries: number; goal: { targetG: number; startG: number | null } | null } | null;
  /** Referencia validada de la pantalla. */
  ref: { exercise: ExMeta | null; sessionId: string | null; routineId: string | null; setIndex: number | null };
  ms: number;
};

const GOAL_TEXT: Record<string, string> = { strength: "fuerza", muscle: "ganar músculo", fat_loss: "bajar grasa", health: "salud", sport: "rendimiento deportivo", habit: "crear el hábito" };
const ownerOf = (kind: string | null | undefined, rel: "coach" | "gym" | null): "coach" | "gym" | "own" | null =>
  kind === "solo" ? "own" : kind === "member_copy" ? "gym" : kind === "client_copy" || kind === "template" ? (rel ?? "coach") : rel;

function wishesOf(w: unknown): TrainingWishes | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 200) : null);
  return { goal: (str(o.goal) as TrainingWishes["goal"]) ?? null, daysPerWeek: num(o.daysPerWeek), minutes: num(o.minutes), likes: str(o.likes), avoid: str(o.avoid) };
}

/** Valida y normaliza la referencia (sólo formato; la pertenencia se resuelve contra la base). */
export function cleanRef(r: unknown): BrainRef {
  if (r == null) return {};
  if (typeof r !== "object" || Array.isArray(r)) throw new AccessError("invalid", "Referencia inválida.");
  const o = r as Record<string, unknown>;
  const out: BrainRef = {};
  for (const k of ["exerciseId", "sessionId", "programExerciseId", "routineId"] as const) {
    const v = o[k];
    if (v == null || v === "") continue;
    if (typeof v !== "string" || !ID_RE.test(v)) throw new AccessError("invalid", "Referencia inválida.");
    out[k] = v;
  }
  if (o.setIndex != null) {
    if (!Number.isInteger(o.setIndex) || (o.setIndex as number) < 0 || (o.setIndex as number) > 39) throw new AccessError("invalid", "Referencia inválida.");
    out.setIndex = o.setIndex as number;
  }
  return out;
}

/**
 * Contexto completo para el servidor (el dominio ve `ctx`; el resto queda de este lado: ids reales, mapas y datos crudos).
 * Lanza 404 si la referencia no es de la persona.
 */
export async function loadContext(userId: string, opts: { section?: Section; ref?: BrainRef | null } = {}, now = new Date()): Promise<ServerContext> {
  const t0 = performance.now();
  const section: Section = opts.section && isSection(opts.section) ? opts.section : "home";
  const ref = opts.ref ? cleanRef(opts.ref) : {};
  const today = localDate(now);
  const d7 = new Date(now.getTime() - 7 * DAY).toISOString(), d30 = new Date(now.getTime() - 30 * DAY).toISOString();

  // ── Tanda 1 ──────────────────────────────────────────────────────────────
  const [[u], act, [open], [hist], [ci], pains, injuries, memory, prefs, imports, recent] = await Promise.all([
    db.select({ birth: user.birthDate, unit: userPref.weightUnit, wishes: userPref.wishes }).from(user).leftJoin(userPref, eq(userPref.userId, user.id)).where(eq(user.id, userId)),
    myActive(userId),
    db.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["in_progress", "paused"]))).limit(1),
    db.execute<{ s7: number; s30: number; last_at: Date | string | null; v30: number; last_rpe: number | null; last_rpe_at: Date | string | null }>(sql`
      select count(*) filter (where status = 'completed' and ended_at >= ${d7}::timestamptz)::int as s7,
        count(*) filter (where status = 'completed' and ended_at >= ${d30}::timestamptz)::int as s30,
        max(ended_at) filter (where status = 'completed') as last_at,
        count(*) filter (where status = 'voided' and coalesce(voided_at, ended_at) >= ${d30}::timestamptz)::int as v30,
        (array_agg(rpe order by ended_at desc) filter (where status = 'completed' and rpe is not null))[1] as last_rpe,
        (array_agg(ended_at order by ended_at desc) filter (where status = 'completed' and rpe is not null))[1] as last_rpe_at
      from workout_session where user_id = ${userId}`),
    db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, today))),
    db.select({ zone: painReport.zone, exerciseName: painReport.exerciseName, at: painReport.createdAt }).from(painReport)
      .where(and(eq(painReport.userId, userId), gte(painReport.createdAt, new Date(now.getTime() - 14 * DAY)))).orderBy(desc(painReport.createdAt)).limit(10),
    db.select({ zone: injury.zone, since: injury.since, at: injury.createdAt }).from(injury)
      .where(and(eq(injury.userId, userId), inArray(injury.status, ["active", "monitoring"]), isNull(injury.deletedAt))).limit(10),
    listMemory(userId, now),
    getPrefs(userId),
    db.select({ id: ownRoutine.id, origin: ownRoutine.origin }).from(ownRoutine).where(and(eq(ownRoutine.userId, userId), isNotNull(ownRoutine.origin))).limit(60),
    // Ejercicios entrenados hace poco (para nombrarlos aunque no estén en el programa vigente).
    db.selectDistinctOn([setLog.exerciseId], { exerciseId: setLog.exerciseId, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind }).from(setLog)
      .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
      .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), isNull(setLog.voidedAt), gte(setLog.completedAt, new Date(now.getTime() - 180 * DAY))))
      .orderBy(setLog.exerciseId).limit(60),
  ]);
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  const age: AgeBand = ageEligibility(u.birth, today);
  const adult = age === "adult";
  // Con un entrenamiento abierto manda la relación de esa sesión (p. ej. la sede, para pedir ayuda en sala).
  const sessRel = open && act ? act.all.find((r) => r.id === (open.gymMemberId ?? open.coachClientId)) ?? null : null;
  const picked = sessRel ?? act ?? null;
  const relation = picked ? { id: picked.id, kind: picked.kind, orgId: picked.orgId } : null;

  // ── Tanda 2 (depende de la primera) ─────────────────────────────────────
  const assignment = act?.assignment && act.assignment.startsOn <= today ? act.assignment : null;
  const [prog, sess, body, lastDone] = await Promise.all([
    assignment ? db.select().from(program).where(eq(program.id, assignment.programId)).then(async ([p]) => (p?.currentVersionId ? { p, ...(await readVersion(p.currentVersionId)) } : null)) : Promise.resolve(null),
    open ? openSessionExercises(open) : Promise.resolve(null),
    adult ? bodyNumbers(userId, now) : Promise.resolve(null),
    assignment ? db.select({ dayId: workoutSession.dayId }).from(workoutSession)
      .where(and(eq(workoutSession.userId, userId), eq(workoutSession.assignmentId, assignment.id), eq(workoutSession.status, "completed")))
      .orderBy(desc(workoutSession.endedAt)).limit(1) : Promise.resolve([]),
  ]);

  // ── Programa y día que toca (misma rotación que myTraining: por posición, salteando días vacíos) ─────
  let programCtx: ServerContext["program"] = null;
  let nextDay: { key: string; name: string } | null = null;
  if (prog) {
    const days = prog.doc.days.map((d) => ({ id: d.id!, name: d.name, exercises: d.exercises.map((e) => ({ peId: (e as { id?: string }).id!, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, detail: (e.detail as ExerciseDetail | undefined) ?? null })) }));
    programCtx = { id: prog.p.id, versionId: prog.version.id, kind: prog.p.kind, days };
    let lastIdx: string | null = null;
    if (lastDone[0]) {
      const [d] = await db.select({ position: programDay.position }).from(programDay).where(eq(programDay.id, lastDone[0].dayId));
      lastIdx = d && days[d.position] ? days[d.position].id : null;
    }
    let next = nextDayIndex(days.map((d) => d.id), lastIdx);
    for (let k = 0; k < days.length && next >= 0 && !days[next].exercises.length; k++) next = (next + 1) % days.length;
    if (next >= 0 && days[next].exercises.length) nextDay = { key: days[next].id, name: days[next].name };
  }

  // ── Ejercicios que se pueden nombrar ─────────────────────────────────────
  const meta = new Map<string, ExMeta>();
  const exercises: ExerciseRef[] = [];
  const seenEx = new Set<string>();
  const add = (m: ExMeta) => { meta.set(m.ref, m); if (!seenEx.has(m.exerciseId)) { seenEx.add(m.exerciseId); exercises.push({ id: m.ref, name: m.name, short: "" }); } };
  for (const e of sess?.exercises ?? []) add(e);
  // Las referencias de la sesión (id del programa) también responden por el id de la biblioteca: así un ejercicio en curso
  // se encuentra por cualquiera de los dos.
  for (const e of sess?.exercises ?? []) if (!meta.has(e.exerciseId)) meta.set(e.exerciseId, e);
  const progExIds = [...new Set((programCtx?.days ?? []).flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const groups = progExIds.length ? await db.select({ id: exercise.id, group: exercise.muscleGroup, kind: exercise.kind }).from(exercise).where(inArray(exercise.id, progExIds)) : [];
  for (const d of programCtx?.days ?? []) for (const e of d.exercises) {
    if (meta.has(e.exerciseId)) continue;
    const g = groups.find((x) => x.id === e.exerciseId);
    add({ ref: e.exerciseId, exerciseId: e.exerciseId, peId: null, name: e.name, inSession: false, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, detail: e.detail, muscleGroup: g?.group ?? null, kind: g?.kind ?? null });
  }
  for (const r of recent) if (!meta.has(r.exerciseId)) add({ ref: r.exerciseId, exerciseId: r.exerciseId, peId: null, name: r.name, inSession: false, sets: null, reps: null, rir: null, restSec: null, detail: null, muscleGroup: r.group, kind: r.kind });

  // ── Referencia de la pantalla (validada) ─────────────────────────────────
  let refEx: ExMeta | null = null;
  if (ref.programExerciseId) {
    refEx = meta.get(ref.programExerciseId) ?? null;
    if (!refEx || !refEx.peId) throw NOT_FOUND();
  } else if (ref.exerciseId) {
    refEx = meta.get(ref.exerciseId) ?? null;
    if (!refEx) {
      // Puede ser un ejercicio entrenado hace más tiempo o de una rutina propia: tiene que ser de la persona.
      const [x] = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind }).from(setLog)
        .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
        .where(and(eq(workoutSession.userId, userId), eq(setLog.exerciseId, ref.exerciseId))).limit(1);
      if (!x) throw NOT_FOUND();
      refEx = { ref: x.id, exerciseId: x.id, peId: null, name: x.name, inSession: false, sets: null, reps: null, rir: null, restSec: null, detail: null, muscleGroup: x.group, kind: x.kind };
      add(refEx);
    }
  }
  let refSession: string | null = null;
  if (ref.sessionId) {
    const [s] = await db.select({ id: workoutSession.id }).from(workoutSession).where(and(eq(workoutSession.id, ref.sessionId), eq(workoutSession.userId, userId)));
    if (!s) throw NOT_FOUND();
    refSession = s.id;
  }
  let refRoutine: string | null = null;
  if (ref.routineId) {
    const [r] = await db.select({ id: ownRoutine.id }).from(ownRoutine).where(and(eq(ownRoutine.id, ref.routineId), eq(ownRoutine.userId, userId)));
    if (!r) throw NOT_FOUND();
    refRoutine = r.id;
  }

  // ── Sesión abierta ───────────────────────────────────────────────────────
  const sx = sess?.exercises ?? [];
  const fullyDone = (e: SessionExercise) => e.loggedIdx.length >= e.sets!;
  const pendingEx = sx.filter((e) => !e.skipped && !fullyDone(e));
  const cur = pendingEx.find((e) => e.loggedIdx.length > 0) ?? pendingEx[0] ?? null;
  const toRef = (e: ExMeta): ExerciseRef => ({ id: e.ref, name: e.name, short: "" });

  // ── Deseos, memoria y restricciones ──────────────────────────────────────
  const wishes = wishesOf(u.wishes);
  const memAvoid = memory.filter((m) => m.kind === "preference" && m.key.startsWith("avoid_exercise:"));
  const memLike = memory.filter((m) => m.kind === "preference" && m.key.startsWith("likes_exercise:"));
  const nameOf = (m: MemoryItem) => (m.value && typeof m.value === "object" && typeof (m.value as { name?: unknown }).name === "string" ? (m.value as { name: string }).name : m.key.split(":")[1]?.replace(/_/g, " ") ?? "");
  const avoids = [...memAvoid.map(nameOf), ...(wishes?.avoid ? [wishes.avoid] : [])].filter(Boolean);
  const likes = [...memLike.map(nameOf), ...(wishes?.likes ? [wishes.likes] : [])].filter(Boolean);
  const goals = wishes?.goal && GOAL_TEXT[wishes.goal] && (adult || wishes.goal !== "fat_loss") ? [GOAL_TEXT[wishes.goal]] : [];
  const restrictions = [
    ...pains.map((p) => ({ label: `molestia (${p.zone})`, exercise: p.exerciseName ?? null, since: p.at.toISOString() })),
    ...injuries.map((i) => ({ label: `lesión en seguimiento (${i.zone})`, exercise: null, since: i.at.toISOString() })),
  ];

  // ── Procedencia de rutinas importadas (lo que quedó sin completar, lo sugerido y lo completado a mano) ─────
  let imported: BrainContext["program"]["imported"] = null;
  if (imports.length) {
    imported = { unknown: 0, suggested: 0, completed: 0 };
    for (const r of imports) for (const e of r.origin?.exercises ?? []) {
      const done = new Set([...(e.completed ?? []), ...(e.suggested ?? [])]);
      imported.unknown += (e.unknown ?? []).filter((f) => !done.has(f)).length;
      imported.suggested += (e.suggested ?? []).length;
      imported.completed += (e.completed ?? []).length;
    }
  }

  const h = hist as unknown as { s7: number; s30: number; last_at: Date | string | null; v30: number; last_rpe: number | null; last_rpe_at: Date | string | null };
  const lastAt = h?.last_at ? new Date(h.last_at).toISOString() : null;
  const eod = endOfArDay(now).toISOString();
  const execOwner = sess ? ownerOf(sess.programKind, sess.coachClientId ? "coach" : sess.gymMemberId ? "gym" : null) : ownerOf(programCtx?.kind, relation?.kind ?? null);

  const ctx: BrainContext = {
    version: "", now: now.toISOString(), section,
    person: {
      age: fact<AgeBand>(age, "profile", null, "declared", age === "unknown" ? "none" : "high"),
      unit: u.unit ?? "kg",
      experience: noFact<string | null>(null, "wishes"),
      goals: goals.length ? fact(goals, "wishes", null, "declared") : noFact<string[]>([], "wishes"),
      weeklyTarget: wishes?.daysPerWeek != null ? fact<number | null>(wishes.daysPerWeek, "wishes", null, "declared") : noFact<number | null>(null, "wishes"),
      minutesAvailable: wishes?.minutes != null ? fact<number | null>(wishes.minutes, "wishes", null, "declared") : noFact<number | null>(null, "wishes"),
      likes: fact(likes, "user_pref", null, "declared"),
      avoids: fact(avoids, "user_pref", null, "declared"),
    },
    relation: { kind: relation?.kind ?? (programCtx?.kind === "solo" ? "own" : "none"), orgName: picked?.orgName ?? null, hasCoach: relation?.kind === "coach" },
    program: {
      name: prog?.doc.name ?? null, versionId: programCtx?.versionId ?? null, owner: programCtx ? ownerOf(programCtx.kind, relation?.kind ?? null) : null,
      changedAt: prog ? (prog.version.number > 1 ? prog.version.createdAt : prog.p.updatedAt).toISOString() : null,
      days: (programCtx?.days ?? []).map((d) => ({ key: d.id, name: d.name, exercises: d.exercises.length })), nextDay, imported,
    },
    session: {
      open: !!sess, id: sess?.id ?? null, dayName: open?.dayName ?? null, startedAt: open?.startedAt.toISOString() ?? null,
      current: cur ? { exercise: toRef(cur), setIndex: Array.from({ length: cur.sets! }, (_, i) => i).find((i) => !cur.loggedIdx.includes(i)) ?? 0, setsDone: cur.loggedIdx.length, setsPlanned: cur.sets! } : null,
      pending: pendingEx.map(toRef), done: sx.filter(fullyDone).map(toRef), substitutions: sx.filter((e) => e.substituted).length,
      // El servidor no ve la cola del teléfono: lo dice el cliente si hace falta.
      offlinePending: false,
    },
    history: { sessions30d: h?.s30 ?? 0, sessions7d: h?.s7 ?? 0, lastSessionAt: lastAt, daysSinceLast: lastAt ? arDaysBetween(lastAt, now) : null, voided30d: h?.v30 ?? 0 },
    readiness: {
      energy: ci ? fact<number | null>(ci.energy, "check_in", now.toISOString(), "declared", "high", { validUntil: eod, consent: "health" }) : noFact<number | null>(null, "check_in"),
      sleep: ci ? fact<number | null>(ci.sleep, "check_in", now.toISOString(), "declared", "high", { validUntil: eod, consent: "health" }) : noFact<number | null>(null, "check_in"),
      mood: ci ? fact<number | null>(ci.mood, "check_in", now.toISOString(), "declared", "high", { validUntil: eod, consent: "health" }) : noFact<number | null>(null, "check_in"),
      lastRpe: h?.last_rpe != null ? fact<number | null>(h.last_rpe, "session", h.last_rpe_at ? new Date(h.last_rpe_at).toISOString() : null, "declared") : noFact<number | null>(null, "session"),
    },
    restrictions: fact(restrictions, "pain_report", restrictions[0]?.since ?? null, "recorded", restrictions.length ? "high" : "none", { consent: "health" }),
    body: adult && body
      ? fact({ weightKg: body.lastG != null ? body.lastG / 1000 : null, goalKg: body.goal ? body.goal.targetG / 1000 : null, trendKgPer4w: body.trendKgPer4w, entries: body.entries }, "body", body.lastDay ? `${body.lastDay}T12:00:00-03:00` : null, "recorded")
      : fact(null, "body", null, "recorded", "none"),
    memory,
    missing: [],
  };
  ctx.version = contextVersion(ctx);

  return {
    ctx, userId, now, prefs, relation, program: programCtx, execOwner,
    session: sess ? { id: sess.id, versionId: open!.versionId, dayId: open!.dayId, status: open!.status, startedAt: open!.startedAt, coachClientId: open!.coachClientId, gymMemberId: open!.gymMemberId, programKind: sess.programKind, exercises: sx } : null,
    exercises, meta,
    confirmFirst: memory.some((m) => m.kind === "preference" && m.key === "confirm_before_change" && m.value !== false),
    avoids, restrictedNames: pains.map((p) => p.exerciseName).filter((x): x is string => !!x),
    bodyRaw: adult && body ? { firstG: body.firstG, lastG: body.lastG, lastDay: body.lastDay, entries: body.entries, goal: body.goal } : null,
    ref: { exercise: refEx, sessionId: refSession, routineId: refRoutine, setIndex: ref.setIndex ?? null },
    ms: Math.round(performance.now() - t0),
  };
}

/** `buildContext` del contrato: el BrainContext de la persona (el resto de `loadContext` queda en el servidor). */
export async function buildContext(userId: string, opts: { section?: Section; ref?: BrainRef | null } = {}, now = new Date()): Promise<BrainContext> {
  return (await loadContext(userId, opts, now)).ctx;
}

/** Ejercicios de la sesión abierta: lo previsto, lo que se hace (reemplazos), lo registrado y lo omitido. Tres consultas. */
async function openSessionExercises(s: typeof workoutSession.$inferSelect) {
  const [rows, logs, changes, [pk]] = await Promise.all([
    db.select({ pe: programExercise, group: exercise.muscleGroup, kind: exercise.kind }).from(programExercise).innerJoin(exercise, eq(exercise.id, programExercise.exerciseId))
      .where(eq(programExercise.dayId, s.dayId)).orderBy(asc(programExercise.position)),
    db.select({ pe: setLog.programExerciseId, idx: setLog.setIndex }).from(setLog).where(and(eq(setLog.sessionId, s.id), isNull(setLog.voidedAt))),
    db.select({ c: sessionExerciseChange, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind }).from(sessionExerciseChange)
      .leftJoin(exercise, eq(exercise.id, sessionExerciseChange.substituteExerciseId)).where(eq(sessionExerciseChange.sessionId, s.id)),
    db.select({ kind: program.kind }).from(schema.programVersion).innerJoin(program, eq(program.id, schema.programVersion.programId)).where(eq(schema.programVersion.id, s.versionId)),
  ]);
  const exercises: SessionExercise[] = rows.map(({ pe, group, kind }) => {
    const ch = changes.find((c) => c.c.programExerciseId === pe.id);
    const sub = ch?.c.kind === "substitute" && ch.c.substituteExerciseId ? { id: ch.c.substituteExerciseId, name: ch.name ?? pe.name, group: ch.group, kind: ch.kind } : null;
    return {
      ref: pe.id, peId: pe.id, exerciseId: sub?.id ?? pe.exerciseId, name: sub?.name ?? pe.name, inSession: true, originalId: pe.exerciseId, originalName: pe.name,
      sets: pe.sets, reps: pe.reps, rir: pe.rir, restSec: pe.restSec, detail: (pe.detail as ExerciseDetail | null) ?? null, position: pe.position,
      muscleGroup: sub?.group ?? group, kind: sub?.kind ?? kind,
      loggedIdx: [...new Set(logs.filter((l) => l.pe === pe.id).map((l) => l.idx))], skipped: ch?.c.kind === "skip", substituted: !!sub,
    };
  });
  return { id: s.id, programKind: pk?.kind ?? null, exercises, coachClientId: s.coachClientId, gymMemberId: s.gymMemberId };
}

/** Sólo números del peso corporal (nunca fotos): primera y última medición, cantidad, tendencia a 4 semanas y objetivo. */
async function bodyNumbers(userId: string, now: Date) {
  const since = localDate(new Date(now.getTime() - 35 * DAY));
  const [r] = await db.execute<{ first_g: number | null; last_g: number | null; last_day: string | null; n: number; win_g: number | null; win_day: string | null }>(sql`
    select (select weight_g from body_weight_entry where user_id = ${userId} order by measured_on asc limit 1) as first_g,
      (select weight_g from body_weight_entry where user_id = ${userId} order by measured_on desc limit 1) as last_g,
      (select measured_on from body_weight_entry where user_id = ${userId} order by measured_on desc limit 1) as last_day,
      (select count(*)::int from body_weight_entry where user_id = ${userId}) as n,
      (select weight_g from body_weight_entry where user_id = ${userId} and measured_on >= ${since} order by measured_on asc limit 1) as win_g,
      (select measured_on from body_weight_entry where user_id = ${userId} and measured_on >= ${since} order by measured_on asc limit 1) as win_day`);
  const [g] = await db.select().from(bodyGoal).where(eq(bodyGoal.userId, userId));
  const x = r as unknown as { first_g: number | null; last_g: number | null; last_day: string | null; n: number; win_g: number | null; win_day: string | null };
  let trend: number | null = null;
  if (x?.win_g != null && x.last_g != null && x.win_day && x.last_day && x.win_day < x.last_day) {
    const days = (Date.parse(`${x.last_day}T12:00:00Z`) - Date.parse(`${x.win_day}T12:00:00Z`)) / DAY;
    if (days >= 7) trend = Math.round(((x.last_g - x.win_g) / 1000 / days) * 28 * 10) / 10;
  }
  return {
    firstG: x?.first_g ?? null, lastG: x?.last_g ?? null, lastDay: x?.last_day ?? null, entries: Number(x?.n ?? 0), trendKgPer4w: trend,
    goal: g ? { targetG: g.targetWeightG, startG: g.startSource === "manual" ? g.startWeightG : null } : null,
  };
}

/** Busca un ejercicio por cualquier id que la persona pueda nombrar (el del programa en la sesión o el de la biblioteca). */
export const exMeta = (sc: ServerContext, id: string | null | undefined) => (id ? sc.meta.get(id) ?? null : null);
/** Ejercicio de la sesión abierta por cualquiera de sus ids. */
export const sessionEx = (sc: ServerContext, id: string | null | undefined) =>
  id ? sc.session?.exercises.find((e) => e.peId === id || e.exerciseId === id || e.originalId === id) ?? null : null;
/** ¿La prescripción es por tiempo? (para mostrar segundos y no repeticiones). */
export const timedReps = (reps: string | null | undefined) => !!reps && parseReps(reps).kind === "time";
