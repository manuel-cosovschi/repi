// D217 · Progress Intelligence 2.0 en el servidor: la vista de UN ejercicio de la persona. Junta las series válidas (REPI e
// importadas, con su procedencia y la fecha aproximada marcada), la tendencia y la propuesta de Training Intelligence (las
// MISMAS que usa el cerebro: `trendsFor` del orquestador, con el perfil), las metas (propias y acordadas con el coach) y la
// regularidad. Los cálculos son del dominio (progress-intel.ts); acá sólo se buscan los datos y se controla el acceso.
// Sólo la persona dueña: todo filtra por user_id de la sesión; un ejercicio ajeno o inexistente responde 404.
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  BEST_SET_CRITERION, ESTIMATE_LIMITS, ESTIMATE_METHOD, RECENT_DAYS, bestSet, effort, estimates, goalStatus, localDate, maxLoad, metricOfSets, nextText,
  personalUses, profileOf, progressInsights, readWishes, recordEvents, regularity, IMPORT_MAX_SETS, type ExerciseGoalKind, type PICls, type PISet, type SetKind,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { timedPeIds } from "../training/services";
import { loadContext, type ExMeta, type ServerContext } from "../brain/context";
import { trendsFor } from "../brain/orchestrator";
import { canSetSelfGoals, mySelfGoals } from "./goals";
import { myGoals } from "../training/goals";
import { EXERCISE_SET_CAP } from "./exercises";

const { workoutSession, setLog, exercise, historyEntry, historyImport, userPref } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese ejercicio en tu historial.", 404);
const DAY = 86_400_000;
const STAGES = new Set<SetKind>(["drop", "rest_pause", "cluster"]);

/** Todas las series válidas del ejercicio (las anuladas no; las corregidas con su valor vigente) más lo importado. */
export async function exerciseSets(userId: string, exerciseId: string): Promise<{ sets: PISet[]; truncated: boolean }> {
  const rows = await db.select({ l: setLog, endedAt: workoutSession.endedAt }).from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), eq(setLog.exerciseId, exerciseId), isNull(setLog.voidedAt)))
    .orderBy(desc(workoutSession.endedAt)).limit(EXERCISE_SET_CAP + 1);
  const imps = await db.select({ e: historyEntry, approx: sql<boolean>`(${historyImport.parsed} -> 'approx') is not null and jsonb_typeof(${historyImport.parsed} -> 'approx') = 'object'` })
    .from(historyEntry).innerJoin(historyImport, eq(historyImport.id, historyEntry.importId))
    .where(and(eq(historyEntry.userId, userId), eq(historyEntry.exerciseId, exerciseId))).orderBy(desc(historyEntry.day)).limit(IMPORT_MAX_SETS + 1);
  const truncated = rows.length > EXERCISE_SET_CAP || imps.length > IMPORT_MAX_SETS;
  const flags = await timedPeIds(rows.map((r) => r.l.programExerciseId));
  const out: PISet[] = [];
  for (const { l, endedAt } of rows.slice(0, EXERCISE_SET_CAP)) {
    const fl = flags.flags?.(l.programExerciseId, l.setIndex);
    const kind = (fl?.kind ?? (l.setKind as SetKind | null) ?? "work") as SetKind;
    const timed = fl ? fl.timed : flags.has(l.programExerciseId);
    const cls: PICls = timed ? "timed" : fl?.warmup || kind === "warmup" ? "warmup" : (fl?.stage ?? 0) > 0 || STAGES.has(kind) || fl?.rounds ? "stage"
      : kind === "top" ? "top" : kind === "backoff" ? "backoff" : kind === "amrap" ? "amrap" : "work";
    const at = (endedAt ?? l.completedAt).toISOString();
    out.push({ at, day: localDate(new Date(at)), sessionId: l.sessionId, source: "session", approx: false, w: l.weightKg == null ? null : Number(l.weightKg),
      r: timed ? null : l.reps, sec: timed ? l.reps : null, rir: l.rir, cls });
  }
  for (const { e, approx } of imps.slice(0, IMPORT_MAX_SETS)) {
    const timed = e.seconds != null && e.reps == null;
    out.push({ at: `${e.day}T15:00:00.000Z`, day: e.day, sessionId: null, source: "import", approx: !!approx, w: e.weightKg == null ? null : Number(e.weightKg),
      r: timed ? null : e.reps, sec: timed ? e.seconds : null, rir: null, cls: timed ? "timed" : "work" });
  }
  return { sets: out.sort((a, b) => a.at.localeCompare(b.at)), truncated };
}

/** Contexto del cerebro con el ejercicio como referencia; un ejercicio sólo importado no está en el contexto: se arma su ficha. */
async function contextFor(userId: string, ex: { id: string; name: string; group: string; kind: string }, now: Date): Promise<{ sc: ServerContext; meta: ExMeta }> {
  try {
    const sc = await loadContext(userId, { section: "progress", ref: { exerciseId: ex.id } }, now);
    if (sc.ref.exercise) return { sc, meta: sc.ref.exercise };
  } catch (e) { if (!(e instanceof AccessError) || e.status !== 404) throw e; }
  const sc = await loadContext(userId, { section: "progress" }, now);
  return { sc, meta: { ref: ex.id, exerciseId: ex.id, peId: null, name: ex.name, inSession: false, sets: null, reps: null, rir: null, restSec: null, detail: null, muscleGroup: ex.group, kind: ex.kind } };
}

export async function myExerciseInsight(userId: string, exerciseId: string, now = new Date()) {
  const [ex] = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, ownerUserId: exercise.ownerUserId, metricsProfile: exercise.metricsProfile })
    .from(exercise).where(eq(exercise.id, exerciseId));
  if (!ex || (ex.ownerUserId && ex.ownerUserId !== userId)) throw NOT_FOUND();
  const { sets, truncated } = await exerciseSets(userId, exerciseId);
  if (!sets.length) throw NOT_FOUND();
  const [{ sc, meta }, [pref], days, selfGoals, coachGoals, can] = await Promise.all([
    contextFor(userId, ex, now),
    db.select({ wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, userId)),
    db.select({ endedAt: workoutSession.endedAt }).from(workoutSession)
      .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, new Date(now.getTime() - 28 * DAY)))),
    mySelfGoals(userId, { exerciseId }, now),
    myGoals(userId, now).then((gs) => gs.filter((g) => g.exerciseId === exerciseId)).catch(() => []),
    canSetSelfGoals(userId),
  ]);
  const metric = metricOfSets(sets, ex.kind);
  const tr = (await trendsFor(sc, [meta], now).catch(() => null))?.get(meta.ref) ?? null;
  const points = tr?.points ?? [];
  const lastPt = points[points.length - 1] ?? null;
  const records = recordEvents(sets, metric);
  const lastDay = sets[sets.length - 1]?.day ?? null;
  const since = now.getTime() - RECENT_DAYS * DAY;
  const recent = sets.filter((s) => Date.parse(s.at) >= since && !s.approx);
  const best = bestSet(sets), recentBest = bestSet(recent);
  const goals = selfGoals.filter((g) => g.status === "active" && g.kind !== "frequency").map((g) => ({ ...g, status_: goalStatus({ kind: g.kind as ExerciseGoalKind, target: g.target, targetReps: g.targetReps, baseline: g.baseline }, sets) }));
  const wishes = readWishes(pref?.wishes);
  const coachOwned = sc.execOwner === "coach" || sc.execOwner === "gym";
  const bw = (xs: PISet[]) => xs.filter((s) => s.cls !== "warmup" && s.cls !== "timed" && !(s.w && s.w > 0) && s.r != null).reduce<PISet | null>((a, s) => (!a || s.r! > a.r! ? s : a), null);
  const tm = (xs: PISet[]) => xs.filter((s) => s.cls === "timed" && s.sec != null).reduce<PISet | null>((a, s) => (!a || s.sec! > a.sec! ? s : a), null);
  const approxShare = sets.filter((s) => s.approx).length / sets.length;
  return {
    exercise: { id: ex.id, name: ex.name, group: ex.group, kind: ex.kind, profile: profileOf({ metricsProfile: ex.metricsProfile, name: ex.name, kind: ex.kind, muscleGroup: ex.group }) },
    metric,
    // A. Lo realmente registrado.
    max: metric === "load" ? maxLoad(sets) : null,
    bestSet: metric === "load" && best ? { ...best, criterion: BEST_SET_CRITERION } : null,
    bestReps: metric === "reps" ? (() => { const b = bw(sets); return b ? { reps: b.r!, day: b.day, approx: b.approx, source: b.source, sessionId: b.sessionId } : null; })() : null,
    bestTime: metric === "time" ? (() => { const b = tm(sets); return b ? { sec: b.sec!, day: b.day, approx: b.approx, source: b.source, sessionId: b.sessionId } : null; })() : null,
    // Rendimiento reciente (6 semanas) separado del récord histórico.
    recent: {
      days: RECENT_DAYS,
      bestSet: metric === "load" ? recentBest : null, max: metric === "load" ? maxLoad(recent) : null,
      bestReps: metric === "reps" ? bw(recent)?.r ?? null : null, bestTime: metric === "time" ? tm(recent)?.sec ?? null : null,
      vsRecord: metric === "load" && best && recentBest ? (recentBest.e1rm >= best.e1rm ? "record" : recentBest.e1rm >= best.e1rm * 0.95 ? "near" : "below") : null,
    },
    // B. Capacidad estimada (con su metodología).
    e1rm: metric === "load" && best ? { value: best.e1rm, from: { w: best.w, r: best.r, day: best.day }, method: ESTIMATE_METHOD, limits: ESTIMATE_LIMITS } : null,
    estimates: metric === "load" ? estimates(sets, now) : null,
    records: { count: records.length, last: records.slice(-5).reverse() },
    // C. Próxima carga de trabajo: la de Training Intelligence (misma cifra que el entrenamiento y el cerebro).
    next: tr ? { trend: tr.trend, proposal: tr.proposal, text: nextText(lastPt ? { w: lastPt.w, r: lastPt.r } : null, tr.proposal), coachOwned,
      used: points.map((p) => ({ day: localDate(new Date(p.at)), w: p.w, r: p.r, rir: p.rir, sessionIds: [...new Set(sets.filter((s) => s.sessionId && s.day === localDate(new Date(p.at))).map((s) => s.sessionId!))] })) } : null,
    // D. Metas (propias y acordadas con el entrenador; nunca predicciones).
    goals: {
      self: goals.map((g) => ({ id: g.id, kind: g.kind, title: g.title, target: g.target, targetReps: g.targetReps, unit: g.unit, baseline: g.baseline, dueOn: g.dueOn, note: g.note, ...g.status_ })),
      coach: coachGoals.map((g) => ({ id: g.id, kind: g.kind, title: g.title, target: g.target, targetReps: g.targetReps, unit: g.unit, current: g.current, progress: g.progress, by: g.by, dueOn: g.dueOn, status: g.status })),
      canSet: can.allowed, supervised: can.supervised,
    },
    insights: sc.prefs.proactive === false ? [] : progressInsights({ trend: tr?.trend ?? null, records, lastSessionDay: lastDay, profile: sc.personal, profileMeta: wishes?.meta ?? null,
      goal: goals[0]?.status_ ?? null, approxShare, now }),
    personal: { status: sc.personal.status, uses: personalUses(sc.personal, { comparableSessions: points.length, coachPlan: coachOwned, effort: points.some((p) => p.rir != null) }) },
    regularity: regularity(sets, days.map((d) => localDate(d.endedAt!)), now, sc.personal.daysPerWeek),
    effort: effort(sets, now),
    data: { sets: sets.length, sessions: new Set(sets.map((s) => s.sessionId ?? `i:${s.day}`)).size, imported: sets.filter((s) => s.source === "import").length, approx: sets.filter((s) => s.approx).length, truncated, firstDay: sets[0]?.day ?? null, lastDay },
  };
}
export type ExerciseInsight = Awaited<ReturnType<typeof myExerciseInsight>>;
