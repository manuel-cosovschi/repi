// Motor proactivo de REPI (D209, contrato §5 «proactive.ts», máster §4 y §19). Junta señales baratas con los servicios que ya
// existen (sesiones, Training Intelligence, procedencia de Smart Import, check-in, programa vigente), arma los candidatos con
// el dominio (buildCandidates), los pasa por el motor de relevancia (decide) y deja todo en brain_intervention: lo emitido
// como pendiente y lo callado como «suppressed» con su motivo (métricas). Nada de esto llama a un modelo.
//
// Garantías:
// - Idempotente: cada aviso tiene una clave estable (persona + clave con período o versión); el cron puede correr dos veces
//   en el mismo minuto sin duplicar nada (índice único + lock por persona mientras decide y escribe).
// - Nunca bloquea el registro de series: corre al abrir Inicio y desde el cron; no está en el camino de logSet.
// - Textos que no inventan hechos: «no registraste entrenamientos», nunca «faltaste».
// - Push sólo con push=true, persona adulta y asistencia proactiva activa, por la cola existente (enqueue), con una clave por
//   aviso; el horario de silencio lo aplica processOutbox al enviar (posterga, no descarta).
import { and, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { ageEligibility, epley1rm, localDate, rowContext, sessionPoints, type ExCtx, type ExerciseDetail, type ImportOrigin, type SetKind } from "@repi/domain";
import { buildCandidates, decide, type trendCandidate } from "@repi/domain/brain/relevance";
import { detectMarks, type Measure, type PriorMarks, type ReviewSet } from "@repi/domain/brain/session";
import { addArDays, arDay, arDaysBetween, arInstant, arParts, arWeekStart, fmtArDate } from "@repi/domain/brain/quiet";
import { numEs } from "@repi/domain/brain/util";
import {
  CATEGORY_RANK, type AgeBand, type Candidate, type InterventionCategory, type RecentIntervention, type SuppressReason,
} from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { logError } from "../log";
import { audit, type Tx } from "../access/util";
import { enqueue } from "../push/services";
import { myActive, timedPeIds } from "../training/services";
import { historyRows, outlookFor } from "../training/intelligence";
import { getPrefs } from "./prefs";
import { activeInterventions, arDayStart, cancelObsoleteInterventions, upsertIntervention, type InterventionView } from "./store";

const { user, userPref, workoutSession, setLog, exercise, program, programVersion, programExercise, ownRoutine, checkin, brainIntervention, notificationOutbox } = schema;
const DAY = 86_400_000;

// ── Parámetros ──────────────────────────────────────────────────────────────
/** Horas locales (Buenos Aires) en que el cron evalúa: una vez a la mañana y una a la tarde. */
export const PROACTIVE_SLOTS = [9, 18] as const;
/** Cada minuto de la franja evalúa 1/60 de las personas (por hash del id): cada una, una vez por franja. */
const BUCKETS = 60;
/** Personas con actividad reciente (sesiones terminadas) que entran al barrido del cron. */
export const ACTIVE_DAYS = 45;
/** Tope por minuto: el cron de cada minuto corre muchos pasos seguidos y pg_net corta a los 20 s (auditoría notify.md §241). */
const RUN_LIMIT = 100;
const RUN_BUDGET_MS = 8_000;
/** Inicio se reevalúa como mucho una vez por minuto por persona (por instancia); lo demás sale de la base. */
const HOME_THROTTLE_MS = 60_000;
/** Marcas: sólo de una sesión terminada hace menos de esto (después ya no es novedad). */
const PR_FRESH_MS = 48 * 3_600_000;
const TREND_FRESH_DAYS = 14;
const TREND_MAX_EXERCISES = 6;
const IMPORT_FRESH_DAYS = 14;
const PROGRAM_FRESH_DAYS = 14;
/** Tipos que pueden salir también como push (una vez por día como máximo, sólo adultos con push activado). */
export const PUSH_KINDS: ReadonlySet<string> = new Set(["program_updated", "weekly_target_met", "weekly_summary", "inactivity"]);
/** Vencimiento por defecto de las tarjetas que el dominio no fecha (después se ven viejas). */
const EXPIRY_DAYS: Record<string, number> = {
  pr: 3, progressing: 7, plateau: 7, declining: 7, inactivity: 7, import_unknowns: 7, program_updated: PROGRAM_FRESH_DAYS, weekly_summary: 7,
};
const MAIN_KINDS: ReadonlySet<string | null> = new Set(["work", "top", "failure", "amrap", null]);
const isCategory = (c: unknown): c is InterventionCategory => typeof c === "string" && c in CATEGORY_RANK;
const RANK_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_RANK).map(([k, v]) => [v, k])) as Record<number, InterventionCategory>;
const safe = async <T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch (e) { logError(`brain.proactive.${what}`, e); return fallback; }
};

// ── Señales ─────────────────────────────────────────────────────────────────
type SessionRow = { id: string; endedAt: Date; dayName: string; coachClientId: string | null; gymMemberId: string | null };
type Built = { candidates: Candidate[]; data: Map<string, Record<string, unknown>>; versionId: string | null | undefined; daysSinceLast: number | null };

/** Marcas de una sesión terminada contra toda la historia válida anterior (detectMarks del dominio; la primera vez no es récord). */
async function sessionMarks(userId: string, s: SessionRow) {
  const today = await db.select({ ex: setLog.exerciseId, pe: setLog.programExerciseId, i: setLog.setIndex, w: setLog.weightKg, r: setLog.reps, kind: setLog.setKind, stage: setLog.stageIndex })
    .from(setLog).where(and(eq(setLog.sessionId, s.id), sql`${setLog.voidedAt} is null`));
  if (!today.length) return { prs: [] as { exercise: { id: string; name: string }; markText: string; sessionId: string; at: string }[], mainSets: 0 };
  const exIds = [...new Set(today.map((t) => t.ex))].slice(0, 12);
  const prior = (await db.execute<{ exercise_id: string; program_exercise_id: string; set_index: number; set_kind: string | null; stage_index: number | null; weight_kg: string | null; reps: number }>(sql`
    select sl.exercise_id, sl.program_exercise_id, sl.set_index, sl.set_kind, sl.stage_index, sl.weight_kg, max(sl.reps)::int as reps
    from ${setLog} sl join ${workoutSession} ws on ws.id = sl.session_id
    where ws.user_id = ${userId} and ws.status = 'completed' and ws.id <> ${s.id} and ws.ended_at < ${s.endedAt.toISOString()}::timestamptz
      and sl.voided_at is null and sl.reps > 0 and sl.exercise_id in (${sql.join(exIds.map((x) => sql`${x}`), sql`, `)})
    group by 1, 2, 3, 4, 5, 6`)) as unknown as { exercise_id: string; program_exercise_id: string; set_index: number; set_kind: string | null; stage_index: number | null; weight_kg: string | null; reps: number }[];
  const plan = await timedPeIds([...today.map((t) => t.pe), ...prior.map((p) => p.program_exercise_id)]);
  const flags = (pe: string, i: number) => plan.flags?.(pe, i) ?? { kind: "work" as SetKind, stage: 0, timed: false };
  const toSet = (pe: string, i: number, w: string | null, r: number | null, kind: string | null, stage: number | null): ReviewSet & { timed: boolean } => {
    const f = flags(pe, i);
    return { w: w == null ? null : Number(w), r, kind: (kind ?? f.kind) as SetKind, stage: stage ?? f.stage, timed: !!f.timed };
  };
  const isMain = (x: ReviewSet) => (x.stage ?? 0) === 0 && MAIN_KINDS.has(x.kind ?? null) && (x.r ?? 0) > 0;
  const names = new Map((await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, exIds))).map((e) => [e.id, e.name]));
  const prs = [];
  let mainSets = 0;
  for (const ex of exIds) {
    const sets = today.filter((t) => t.ex === ex).map((t) => toSet(t.pe, t.i, t.w, t.r, t.kind, t.stage));
    mainSets += sets.filter(isMain).length;
    const before = prior.filter((p) => p.exercise_id === ex).map((p) => toSet(p.program_exercise_id, p.set_index, p.weight_kg, p.reps, p.set_kind, p.stage_index)).filter(isMain);
    if (!before.length) continue; // la primera vez no es una marca
    const measure: Measure = sets.some((x) => x.timed) ? "time" : sets.some((x) => (x.w ?? 0) > 0) ? "load" : "reps";
    const loaded = before.filter((x) => !x.timed && (x.w ?? 0) > 0);
    const marks: PriorMarks = {
      maxLoadKg: loaded.length ? Math.max(...loaded.map((x) => x.w!)) : null,
      e1rm: loaded.length ? Math.max(0, ...loaded.map((x) => epley1rm(x.w!, x.r!) ?? 0)) || null : null,
      repsAtLoad: loaded.map((x) => ({ w: x.w!, r: x.r! })),
      bestReps: before.some((x) => !x.timed && !(x.w ?? 0)) ? Math.max(...before.filter((x) => !x.timed && !(x.w ?? 0)).map((x) => x.r!)) : null,
      bestSec: before.some((x) => x.timed) ? Math.max(...before.filter((x) => x.timed).map((x) => x.r!)) : null,
    };
    const mark = detectMarks(sets, marks, measure).find((m) => !m.tie);
    if (mark) prs.push({ exercise: { id: ex, name: names.get(ex) ?? "este ejercicio" }, markText: mark.text, sessionId: s.id, at: s.endedAt.toISOString() });
  }
  return { prs: prs.slice(0, 2), mainSets };
}

/** Tendencias de los ejercicios de la última sesión con Training Intelligence (exerciseTrend + nextProposal, sin escribir nada). */
async function sessionTrends(userId: string, s: SessionRow, now: Date) {
  const pes = await db.selectDistinct({ pe: setLog.programExerciseId, ex: setLog.exerciseId }).from(setLog).where(and(eq(setLog.sessionId, s.id), sql`${setLog.voidedAt} is null`));
  const byEx = new Map<string, string>();
  for (const p of pes) if (!byEx.has(p.ex)) byEx.set(p.ex, p.pe);
  const exIds = [...byEx.keys()].slice(0, TREND_MAX_EXERCISES);
  if (!exIds.length) return [];
  const peRows = await db.select().from(programExercise).where(inArray(programExercise.id, exIds.map((x) => byEx.get(x)!)));
  const peById = new Map(peRows.map((p) => [p.id, p]));
  const names = new Map((await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, exIds))).map((e) => [e.id, e.name]));
  const hist = await historyRows(userId, exIds, { now });
  const coachOwned = !!(s.coachClientId || s.gymMemberId);
  const out: { input: Parameters<typeof trendCandidate>[0]; sessionId: string }[] = [];
  for (const ex of exIds) {
    const pe = peById.get(byEx.get(ex)!);
    const rows = hist.get(ex) ?? [];
    if (!pe || !rows.length) continue;
    const ctx = { sets: pe.sets, reps: pe.reps, rir: pe.rir, restSec: pe.restSec, detail: (pe.detail as ExerciseDetail | null) ?? null };
    const fatigue = rows.slice(0, 12).filter((r) => r.feel === "limite" || r.rir === 0).length >= 4;
    const o = outlookFor(ctx, rows, now, coachOwned, fatigue);
    if (!o) continue;
    // Las fechas de la evidencia son las de las sesiones que la tendencia comparó (las mismas reglas que outlookFor).
    const plan = Array.from({ length: ctx.sets }, (_, i) => rowContext(ctx as ExCtx, i));
    const main = plan.find((c) => c.cls === "main" || c.cls === "top")!;
    const pts = sessionPoints(main, rows, now, plan.filter((c) => c.cls === main.cls && c.stage === 0 && c.label === main.label).length);
    out.push({ input: { exercise: { id: ex, name: names.get(ex) ?? "este ejercicio" }, trend: o.trend, proposal: o.proposal, lastAt: rows[0].at, sessions: pts.map((p) => ({ at: p.at })) }, sessionId: rows[0].sessionId });
  }
  return out;
}

/** Programa vigente (relación activa): versión actual y, si cambió y todavía no entrenó con ella, el aviso de actualización. */
async function programSignal(userId: string, now: Date) {
  const act = await myActive(userId);
  if (!act?.assignment) return { versionId: null, program: null };
  const [p] = await db.select().from(program).where(eq(program.id, act.assignment.programId));
  if (!p?.currentVersionId) return { versionId: null, program: null };
  const [v] = await db.select().from(programVersion).where(eq(programVersion.id, p.currentVersionId));
  if (!v) return { versionId: null, program: null };
  // Mismo criterio que myTraining (F-CL-14): versión nueva o edición en el lugar después de asignar.
  const edited = p.updatedAt.getTime() > act.assignment.assignedAt.getTime() + 60_000;
  const changedAt = edited ? p.updatedAt : v.createdAt;
  if (!(v.number > 1 || edited) || now.getTime() - changedAt.getTime() > PROGRAM_FRESH_DAYS * DAY) return { versionId: v.id, program: null };
  const [trained] = await db.select({ id: workoutSession.id }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.versionId, v.id), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, changedAt))).limit(1);
  return { versionId: v.id, program: trained ? null : { versionId: v.id, byCoach: act.kind === "coach", changedAt: changedAt.toISOString() } };
}

/** Rutinas importadas hace poco y sin tocar, con indicaciones que el documento no traía (procedencia de Smart Import). */
async function importSignals(userId: string, now: Date) {
  const rows = await db.select({ id: ownRoutine.id, name: ownRoutine.name, origin: ownRoutine.origin, createdAt: ownRoutine.createdAt, updatedAt: ownRoutine.updatedAt }).from(ownRoutine)
    .where(and(eq(ownRoutine.userId, userId), isNotNull(ownRoutine.origin), gte(ownRoutine.createdAt, new Date(now.getTime() - IMPORT_FRESH_DAYS * DAY))))
    .orderBy(desc(ownRoutine.createdAt)).limit(3);
  return rows
    .filter((r) => r.updatedAt.getTime() - r.createdAt.getTime() < 60_000) // editada después: lo que decía el origen ya no alcanza
    .map((r) => {
      const o = r.origin as ImportOrigin | null;
      const unknown = (o?.exercises ?? []).reduce((n, e) => n + (e.unknown ?? []).filter((f) => !(e.completed ?? []).includes(f) && !(e.suggested ?? []).includes(f)).length, 0);
      return { routineId: r.id, name: r.name, unknown };
    });
}

/** Resumen de la semana anterior (sólo los lunes): sesiones registradas contra el objetivo, sin suponer faltas. */
function weeklySummaryCandidate(p: { now: Date; sessions: SessionRow[]; target: number | null }): Candidate | null {
  if (arParts(p.now).dow !== 1) return null;
  const thisMonday = arWeekStart(p.now), prevMonday = addArDays(thisMonday, -7);
  const from = arInstant(prevMonday).getTime(), to = arInstant(thisMonday).getTime();
  const n = p.sessions.filter((s) => s.endedAt.getTime() >= from && s.endedAt.getTime() < to).length;
  const t = p.target && p.target > 0 ? p.target : null;
  const word = (k: number) => (k === 1 ? "sesión" : "sesiones");
  const body = t == null ? `La semana pasada registraste ${numEs(n, false)} ${word(n)}.`
    : n >= t ? `La semana pasada registraste ${numEs(n, false)} ${word(n)}: cumpliste tu objetivo de ${numEs(t, false)}.`
      : `La semana pasada registraste ${numEs(n, false)} de las ${numEs(t, false)} sesiones que te propusiste. Si entrenaste sin registrar, no lo sé.`;
  return {
    kind: "weekly_summary", category: "weekly", dedupeKey: `weekly_summary:${prevMonday}`, channel: "card", enoughEvidence: n >= 1,
    title: "Tu semana", body,
    evidence: { basis: `Sesiones terminadas del lunes ${fmtArDate(arInstant(prevMonday, 12 * 60))} al domingo ${fmtArDate(arInstant(addArDays(thisMonday, -1), 12 * 60))}, sin contar las anuladas.`, via: "data" },
    actions: [{ id: "open", label: "Ver progreso" }, { id: "dismiss", label: "Listo" }],
    expiresAt: new Date(arInstant(thisMonday).getTime() + 7 * DAY).toISOString(),
  };
}

/** Todo lo que puede decir REPI hoy a esta persona (todavía sin decidir). Cada señal falla sola: las demás siguen. */
async function gather(userId: string, now: Date): Promise<Built> {
  const data = new Map<string, Record<string, unknown>>();
  const sessions = await db.select({ id: workoutSession.id, endedAt: workoutSession.endedAt, dayName: workoutSession.dayName, coachClientId: workoutSession.coachClientId, gymMemberId: workoutSession.gymMemberId })
    .from(workoutSession).where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), isNotNull(workoutSession.endedAt), lte(workoutSession.endedAt, now)))
    .orderBy(desc(workoutSession.endedAt)).limit(40) as SessionRow[];
  const last = sessions[0] ?? null;
  const [pref] = await db.select({ wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, userId));
  const target = (pref?.wishes as { daysPerWeek?: number | null } | null)?.daysPerWeek ?? null;
  const weekFrom = arInstant(arWeekStart(now)).getTime();
  const daysSinceLast = last ? arDaysBetween(last.endedAt, now) : null;

  const [marks, trends, prog, imports, [ci]] = await Promise.all([
    last && now.getTime() - last.endedAt.getTime() <= PR_FRESH_MS ? safe("marks", () => sessionMarks(userId, last), null) : Promise.resolve(null),
    last && daysSinceLast != null && daysSinceLast <= TREND_FRESH_DAYS ? safe("trends", () => sessionTrends(userId, last, now), []) : Promise.resolve([]),
    safe("program", () => programSignal(userId, now), { versionId: undefined, program: null } as { versionId: string | null | undefined; program: null | { versionId: string; byCoach: boolean; changedAt: string } }),
    safe("imports", () => importSignals(userId, now), []),
    safe("checkin", () => db.select({ energy: checkin.energy, sleep: checkin.sleep, at: checkin.createdAt }).from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, localDate(now)))), []),
  ]);

  const reviewToday = last && arDay(last.endedAt) === arDay(now);
  const reviewSets = reviewToday ? (marks?.mainSets ?? (await safe("review", () => sessionMarks(userId, last!), null))?.mainSets ?? 0) : 0;
  const candidates = buildCandidates({
    now,
    weekly: { sessionsThisWeek: sessions.filter((s) => s.endedAt.getTime() >= weekFrom).length, target },
    prs: marks?.prs ?? [],
    inactivity: { daysSinceLast, lastSessionAt: last?.endedAt.toISOString() ?? null },
    trends: trends.map((t) => t.input),
    program: prog.program,
    imports,
    review: reviewToday && last ? { sessionId: last.id, at: last.endedAt.toISOString(),
      summary: `Terminaste «${last.dayName}»: ${reviewSets === 1 ? "una serie registrada" : `${numEs(reviewSets, false)} series registradas`}. Te muestro qué mejoró y qué conviene para la próxima.` } : null,
    checkIn: ci ? { energy: ci.energy, sleep: ci.sleep, at: ci.at.toISOString() } : null,
  });
  const weekly = weeklySummaryCandidate({ now, sessions, target });
  if (weekly) candidates.push(weekly);

  // Referencias para la tarjeta y para las señales del entrenador (sólo ids, nunca contenido).
  for (const t of trends) {
    const k = candidates.find((c) => c.kind === t.input.trend.kind && c.dedupeKey.startsWith(`trend:${t.input.exercise.id}:`));
    if (k) data.set(k.dedupeKey, { exerciseId: t.input.exercise.id, sessionId: t.sessionId });
  }
  for (const p of marks?.prs ?? []) data.set(`pr:${p.sessionId}:${p.exercise.id}`, { exerciseId: p.exercise.id, sessionId: p.sessionId });
  if (last) data.set(`review:${last.id}`, { sessionId: last.id });
  for (const i of imports) data.set(`import:${i.routineId}:${i.unknown}`, { routineId: i.routineId });
  for (const c of candidates) c.expiresAt ??= EXPIRY_DAYS[c.kind] ? new Date(now.getTime() + EXPIRY_DAYS[c.kind] * DAY).toISOString() : null;
  return { candidates, data, versionId: prog.versionId, daysSinceLast };
}

// ── Decisión y persistencia ────────────────────────────────────────────────
async function recentIn(tx: Tx, userId: string, now: Date): Promise<RecentIntervention[]> {
  const rows = await tx.select({ kind: brainIntervention.kind, payload: brainIntervention.payload, priority: brainIntervention.priority, dedupeKey: brainIntervention.dedupeKey,
    status: brainIntervention.status, createdAt: brainIntervention.createdAt, channel: brainIntervention.channel }).from(brainIntervention)
    .where(and(eq(brainIntervention.userId, userId), or(gte(brainIntervention.createdAt, new Date(now.getTime() - 30 * DAY)), eq(brainIntervention.status, "never"))))
    .orderBy(desc(brainIntervention.createdAt)).limit(300);
  return rows.map((r) => ({ kind: r.kind, category: isCategory(r.payload?.category) ? r.payload.category : RANK_TO_CATEGORY[r.priority] ?? "reminder",
    dedupeKey: r.dedupeKey, status: r.status, createdAt: r.createdAt.toISOString(), channel: r.channel }));
}

export type ProactiveResult = {
  /** Avisos nuevos (o que pasaron de callados a pendientes) en esta evaluación. */
  emitted: InterventionView[];
  suppressed: Partial<Record<SuppressReason, number>>;
  /** Candidatos que ya se habían dicho (misma clave): no se repiten. */
  duplicates: number;
  /** Avisos cancelados por obsoletos (cambio de programa, sesión registrada después de una pausa). */
  cancelled: number;
  pushed: number;
};
const EMPTY = (): ProactiveResult => ({ emitted: [], suppressed: {}, duplicates: 0, cancelled: 0, pushed: 0 });

/**
 * Evalúa a una persona: señales → candidatos → decide → brain_intervention (y push si corresponde). `push: true` sólo desde el
 * cron (al abrir la app la persona ya está mirando). Todo filtrado por su userId; nada de otras personas entra en sus avisos.
 */
export async function proactiveFor(userId: string, now = new Date(), o: { push?: boolean } = {}): Promise<ProactiveResult> {
  const out = EMPTY();
  const prefs = await getPrefs(userId);
  if (!prefs.proactive) return out; // caso 46: con la asistencia proactiva apagada no se evalúa ni se avisa nada
  const [u] = await db.select({ birth: user.birthDate }).from(user).where(eq(user.id, userId));
  if (!u) return out;
  const age: AgeBand = ageEligibility(u.birth, localDate(now));
  const built = await gather(userId, now);
  // Obsoletos: otra versión del programa (caso 50) y «¿retomamos?» después de registrar una sesión nueva.
  if (built.versionId !== undefined) out.cancelled += await safe("obsolete", () => cancelObsoleteInterventions(userId, built.versionId ?? null, now), 0);
  if (built.daysSinceLast != null && built.daysSinceLast < 5) {
    out.cancelled += (await db.update(brainIntervention).set({ status: "cancelled", reason: "session_logged", resolvedAt: now })
      .where(and(eq(brainIntervention.userId, userId), eq(brainIntervention.kind, "inactivity"), inArray(brainIntervention.status, ["pending", "shown"])))
      .returning({ id: brainIntervention.id })).length;
  }
  if (!built.candidates.length) return out;

  await db.transaction(async (tx) => {
    // Un lock por persona: dos corridas del cron (o el cron y Inicio) deciden de a una y el tope diario se respeta.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`repi:brain:proactive:${userId}`}))`);
    const recent = await recentIn(tx, userId, now);
    const d = decide(built.candidates, { prefs, recent, now, age, programVersionId: built.versionId ?? null });
    for (const c of d.emit) {
      const r = await upsertIntervention(userId, { ...c, status: "pending", data: built.data.get(c.dedupeKey) }, tx);
      if (r.created || r.upgraded) out.emitted.push(r.intervention); else out.duplicates++;
    }
    for (const { candidate: c, reason } of d.suppressed) {
      if (reason === "duplicate") { out.duplicates++; continue; } // ya existe la fila con esa clave: no hay nada que registrar
      out.suppressed[reason] = (out.suppressed[reason] ?? 0) + 1;
      await upsertIntervention(userId, { ...c, status: "suppressed", reason, data: built.data.get(c.dedupeKey) }, tx);
    }
  });

  if (o.push && prefs.push && age === "adult") out.pushed = await safe("push", () => pushOne(userId, out.emitted, now), 0);
  return out;
}

/** Un push por día como máximo: el aviso nuevo más importante de los que pueden salir por push. Idempotente por aviso. */
async function pushOne(userId: string, emitted: InterventionView[], now: Date) {
  const pick = emitted.filter((i) => PUSH_KINDS.has(i.kind) && i.channel === "card").sort((a, b) => a.priority - b.priority)[0];
  if (!pick) return 0;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(notificationOutbox)
    .where(and(eq(notificationOutbox.userId, userId), eq(notificationOutbox.kind, "brain_coaching"), gte(notificationOutbox.createdAt, arDayStart(now))));
  if (n >= 1) return 0;
  // La clave lleva la categoría (para el opt-out al enviar) y el id del aviso (para no mandar lo ya visto en la app).
  return enqueue([userId], { kind: "brain_coaching", dedupe: `brain:${pick.category}:${pick.id}`, title: pick.title.slice(0, 80), body: pick.body.slice(0, 160), url: `/app?repi=${pick.id}` });
}

// ── Inicio ──────────────────────────────────────────────────────────────────
const lastHome = new Map<string, number>();
/** Sólo para pruebas: olvida cuándo se evaluó Inicio por última vez. */
export const resetProactiveThrottle = () => lastHome.clear();

/**
 * Inicio (GET /api/me/brain la llama): evalúa a la persona (como mucho una vez por minuto) y devuelve la tarjeta principal y el
 * resto de los avisos vigentes, por prioridad. Una falla del motor nunca rompe Inicio: se devuelve lo que ya había.
 * `card` es el aviso guardado (InterventionView: id, kind, category, title, body, evidence, actions, data, status…), con id
 * para aceptarlo, descartarlo o «no mostrar algo parecido» desde la tarjeta.
 */
export async function homeCandidates(userId: string, now?: Date): Promise<{ card: InterventionView | null; interventions: InterventionView[] }> {
  const at = now ?? new Date();
  const prev = lastHome.get(userId);
  if (prev == null || Math.abs(at.getTime() - prev) >= HOME_THROTTLE_MS) {
    lastHome.set(userId, at.getTime());
    if (lastHome.size > 5_000) lastHome.delete(lastHome.keys().next().value as string);
    await safe("home", () => proactiveFor(userId, at), EMPTY());
  }
  const prefs = await getPrefs(userId);
  const items = (await activeInterventions(userId, at, 10))
    .filter((i) => i.channel !== "inline" && (prefs.proactive || i.category === "safety"));
  const card = items[0] ?? null;
  return { card, interventions: items.slice(1) };
}

// ── Cron ────────────────────────────────────────────────────────────────────
export type ProactiveRun = {
  ran: boolean; reason?: string; slot?: string; bucket?: number | null; users: number; evaluated: number; emitted: number; pushed: number; cancelled: number;
  duplicates: number; suppressed: Partial<Record<SuppressReason, number>>; failed: number; ms: number; budgetHit: boolean;
};

/**
 * Paso del cron de cada minuto (/api/cron/notifications). Sólo en las franjas PROACTIVE_SLOTS (9 y 18 h de Buenos Aires); en
 * cada minuto de la franja evalúa el 1/60 de las personas con actividad reciente que le toca por hash (así cada una se evalúa
 * una vez por franja), con tope de personas y de tiempo. Correrlo dos veces en el mismo minuto no duplica nada (claves únicas
 * y lock por persona). Nunca manda avisos masivos: cada persona pasa por decide (tope diario, categorías, silencio, menores).
 * `force` y `users` son para pruebas y operaciones manuales (sin franja ni hash; `users` acota a esas personas).
 */
export async function runProactive(now = new Date(), o: { force?: boolean; users?: string[]; limit?: number; budgetMs?: number } = {}): Promise<ProactiveRun> {
  const t0 = Date.now();
  const p = arParts(now);
  const base: ProactiveRun = { ran: false, users: 0, evaluated: 0, emitted: 0, pushed: 0, cancelled: 0, duplicates: 0, suppressed: {}, failed: 0, ms: 0, budgetHit: false };
  if (!o.force && !(PROACTIVE_SLOTS as readonly number[]).includes(p.hh)) return { ...base, reason: "fuera de franja" };
  if (o.users && !o.users.length) return { ...base, reason: "sin personas" };
  const bucket = o.force ? null : p.mm % BUCKETS;
  const since = new Date(now.getTime() - ACTIVE_DAYS * DAY).toISOString();
  const limit = Math.min(Math.max(o.limit ?? RUN_LIMIT, 1), 1_000);
  const rows = (await db.execute<{ user_id: string }>(sql`
    select ws.user_id from ${workoutSession} ws
    left join brain_pref bp on bp.user_id = ws.user_id
    left join coach_client cc on cc.id = ws.coach_client_id
    left join gym_member gm on gm.id = ws.gym_member_id
    left join organization o on o.id = coalesce(cc.coach_org_id, gm.org_id)
    where ws.status = 'completed' and ws.ended_at >= ${since}::timestamptz and ws.ended_at <= ${now.toISOString()}::timestamptz
      and coalesce(bp.proactive, true) and coalesce(o.is_demo, false) = false
      ${bucket == null ? sql`` : sql`and mod(hashtext(ws.user_id)::bigint + 2147483648, ${BUCKETS}) = ${bucket}`}
      ${o.users ? sql`and ws.user_id in (${sql.join(o.users.map((x) => sql`${x}`), sql`, `)})` : sql``}
    group by ws.user_id order by max(ws.ended_at) desc limit ${limit}`)) as unknown as { user_id: string }[];
  const run: ProactiveRun = { ...base, ran: true, slot: `${p.day} ${String(p.hh).padStart(2, "0")}h`, bucket, users: rows.length };
  const budget = o.budgetMs ?? RUN_BUDGET_MS;
  for (const { user_id } of rows) {
    if (Date.now() - t0 > budget) { run.budgetHit = true; break; }
    try {
      const r = await proactiveFor(user_id, now, { push: true });
      run.evaluated++; run.emitted += r.emitted.length; run.pushed += r.pushed; run.cancelled += r.cancelled; run.duplicates += r.duplicates;
      for (const [k, v] of Object.entries(r.suppressed)) run.suppressed[k as SuppressReason] = (run.suppressed[k as SuppressReason] ?? 0) + (v ?? 0);
    } catch (e) { run.failed++; logError("brain.proactive.user", e); }
  }
  run.ms = Date.now() - t0;
  // Registro de la corrida (sin personas ni contenido): REPI Admin suma de acá los duplicados evitados y el estado del motor.
  if (run.evaluated || run.failed) {
    await audit(db, { actorUserId: null, action: "brain.proactive_run", resourceType: "brain", resourceId: run.slot ?? null, result: run.failed ? "error" : "ok",
      meta: { users: run.users, evaluated: run.evaluated, emitted: run.emitted, pushed: run.pushed, cancelled: run.cancelled, duplicates: run.duplicates, suppressed: run.suppressed, failed: run.failed, ms: run.ms, budgetHit: run.budgetHit } })
      .catch((e) => logError("brain.proactive.audit", e));
  }
  return run;
}
