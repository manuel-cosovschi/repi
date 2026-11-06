// Training Progress Analytics (PP1, D199). Evolución por ejercicio y resumen del período, calculados al leer desde las
// series válidas: lo anulado (serie o sesión) no cuenta y lo corregido cuenta con su valor vigente, así que una corrección
// del historial recalcula todo sin reescribir registros. Mismas reglas que el resto de REPI (metrics.ts / training.ts):
// - Volumen = Σ peso × reps de series con carga, sin aproximación, series por tiempo ni AMRAP en rondas (las etapas de un
//   drop sí suman: son kilos levantados). Series = series principales (las etapas no cuentan como series nuevas).
// - 1RM estimado (Epley) sólo con 1 a 12 reps y carga > 0. Peso corporal sin carga NO es 0 kg: se mide en repeticiones.
// - Récord: sólo si hay historia previa del mismo ejercicio y el mejor 1RM estimado (o la carga, o las reps sin carga, o
//   el tiempo) la supera. La primera sesión no es un récord: es la primera marca.
// - Historial importado (D162) aparece como «importado», sin sesión de origen.
// Sólo la persona dueña: todo filtra por user_id en el servidor; no hay parámetro de usuario.
import { and, asc, desc, eq, gte, ilike, inArray, isNull, sql } from "drizzle-orm";
import { bestE1rm, localDate, rangeStart, volumeKg, type ProgressRange } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { timedPeIds, toLogged } from "../training/services";

const { workoutSession, setLog, exercise, historyEntry } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese ejercicio en tu historial.", 404);
/** Tope de series leídas por ejercicio (las más recientes): ~5 años entrenando 3 veces por semana con 6 series. */
export const EXERCISE_SET_CAP = 5000;
const dayStartUtc = (day: string) => new Date(`${day}T03:00:00Z`); // AR UTC−3 sin horario de verano
const r1 = (n: number) => Math.round(n * 10) / 10;

type SetRow = typeof setLog.$inferSelect;
type Flags = Awaited<ReturnType<typeof timedPeIds>>;
type Raw = { weightKg: number | null; reps: number | null; timed: boolean; warmup: boolean; rounds: boolean; main: boolean };

export type ProgressPoint = {
  day: string; at: string; source: "session" | "import"; sessionId: string | null; dayName: string | null;
  sets: number; reps: number; volumeKg: number; topKg: number | null; repsAtTop: number | null;
  e1rm: number | null; best: { weightKg: number; reps: number } | null; maxReps: number | null; maxSec: number | null;
  record: boolean; first: boolean;
};

function rawOf(s: SetRow, f: Flags): Raw {
  const fl = f.flags?.(s.programExerciseId, s.setIndex);
  const timed = fl ? fl.timed : f.has(s.programExerciseId);
  return { weightKg: s.weightKg == null ? null : Number(s.weightKg), reps: s.reps, timed, warmup: !!fl?.warmup, rounds: !!fl?.rounds, main: !fl || (fl.stage === 0 && !fl.warmup) };
}
function pointOf(rows: Raw[]): Omit<ProgressPoint, "day" | "at" | "source" | "sessionId" | "dayName" | "record" | "first"> {
  const logged = rows.map((r) => ({ exerciseId: "", weightKg: r.weightKg, reps: r.reps, completed: true, timed: r.timed || undefined, warmup: r.warmup || undefined, rounds: r.rounds || undefined }));
  const counted = rows.filter((r) => !r.timed && !r.warmup && !r.rounds);
  const loaded = counted.filter((r) => r.weightKg != null && r.weightKg > 0 && r.reps != null);
  const topKg = loaded.length ? Math.max(...loaded.map((r) => r.weightKg!)) : null;
  const best = bestE1rm(logged);
  const unloaded = counted.filter((r) => !(r.weightKg != null && r.weightKg > 0) && r.reps != null);
  const timed = rows.filter((r) => r.timed && !r.warmup && r.reps != null);
  return {
    sets: rows.filter((r) => r.main).length, reps: counted.reduce((a, r) => a + (r.reps ?? 0), 0), volumeKg: volumeKg(logged),
    topKg, repsAtTop: topKg == null ? null : Math.max(...loaded.filter((r) => r.weightKg === topKg).map((r) => r.reps!)),
    e1rm: best?.e1rm ?? null, best: best ? { weightKg: best.weightKg, reps: best.reps } : null,
    maxReps: unloaded.length ? Math.max(...unloaded.map((r) => r.reps!)) : null, maxSec: timed.length ? Math.max(...timed.map((r) => r.reps!)) : null,
  };
}
/** Qué se mide: con carga (kg), peso corporal sin carga (reps) o tiempo (segundos). Según lo registrado, no sólo el catálogo. */
function metricOf(points: { topKg: number | null; maxReps: number | null; maxSec: number | null }[], kind: string): "load" | "reps" | "time" {
  if (points.some((p) => p.topKg != null)) return "load";
  if (points.some((p) => p.maxReps != null)) return "reps";
  if (points.some((p) => p.maxSec != null)) return "time";
  return kind === "time" ? "time" : kind === "bodyweight" ? "reps" : "load";
}
const valueOf = (p: ProgressPoint, m: "load" | "reps" | "time") => (m === "load" ? p.e1rm ?? p.topKg : m === "reps" ? p.maxReps : p.maxSec);

/** Ejercicios que la persona registró (sesiones válidas e importados), con búsqueda y paginado. */
export async function myProgressExercises(userId: string, o: { q?: string | null; limit?: number; offset?: number } = {}) {
  const lim = Math.min(Math.max(o.limit ?? 40, 1), 100), off = Math.max(o.offset ?? 0, 0);
  const q = (o.q ?? "").trim().slice(0, 60);
  const like = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const logged = db.select({ id: setLog.exerciseId, last: sql<Date>`max(${workoutSession.endedAt})`.as("last"), sessions: sql<number>`count(distinct ${setLog.sessionId})::int`.as("sessions") })
    .from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), isNull(setLog.voidedAt)))
    .groupBy(setLog.exerciseId).as("logged");
  const rows = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, last: logged.last, sessions: logged.sessions })
    .from(logged).innerJoin(exercise, eq(exercise.id, logged.id)).where(like ? ilike(exercise.name, like) : undefined)
    .orderBy(desc(logged.last), asc(exercise.name)).limit(lim + 1).offset(off);
  const imported = await db.select({ id: historyEntry.exerciseId, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, last: sql<string>`max(${historyEntry.day})`, days: sql<number>`count(distinct ${historyEntry.day})::int` })
    .from(historyEntry).innerJoin(exercise, eq(exercise.id, historyEntry.exerciseId))
    .where(and(eq(historyEntry.userId, userId), like ? ilike(exercise.name, like) : undefined)).groupBy(historyEntry.exerciseId, exercise.name, exercise.muscleGroup, exercise.kind).limit(200);
  const seen = new Set(rows.map((r) => r.id));
  const page = rows.slice(0, lim).map((r) => ({ id: r.id, name: r.name, group: r.group, kind: r.kind, sessions: r.sessions, lastDay: localDate(new Date(r.last)), imported: false }));
  // Ejercicios que sólo están en el historial importado van al final de la primera página.
  if (off === 0) for (const r of imported) if (r.id && !seen.has(r.id)) page.push({ id: r.id, name: r.name, group: r.group, kind: r.kind, sessions: r.days, lastDay: r.last, imported: true });
  return { exercises: page, next: rows.length > lim ? off + lim : null };
}

/** Evolución de un ejercicio en el período. Los récords se comparan contra TODO el historial anterior, no sólo el rango. */
export async function myExerciseProgress(userId: string, exerciseId: string, range: ProgressRange, now = new Date()) {
  const [ex] = await db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, orgId: exercise.orgId, ownerUserId: exercise.ownerUserId }).from(exercise).where(eq(exercise.id, exerciseId));
  if (!ex || (ex.ownerUserId && ex.ownerUserId !== userId)) throw NOT_FOUND();
  const sets = await db.select({ l: setLog, s: { id: workoutSession.id, endedAt: workoutSession.endedAt, dayName: workoutSession.dayName } }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), eq(setLog.exerciseId, exerciseId), isNull(setLog.voidedAt)))
    .orderBy(desc(workoutSession.endedAt)).limit(EXERCISE_SET_CAP);
  const imports = await db.select().from(historyEntry).where(and(eq(historyEntry.userId, userId), eq(historyEntry.exerciseId, exerciseId))).orderBy(asc(historyEntry.day)).limit(EXERCISE_SET_CAP);
  if (!sets.length && !imports.length) throw NOT_FOUND();
  const flags = await timedPeIds(sets.map((x) => x.l.programExerciseId));

  const bySession = new Map<string, { at: Date; dayName: string; rows: Raw[] }>();
  for (const x of sets) {
    const g = bySession.get(x.s.id) ?? { at: x.s.endedAt!, dayName: x.s.dayName, rows: [] };
    g.rows.push(rawOf(x.l, flags));
    bySession.set(x.s.id, g);
  }
  const byDay = new Map<string, Raw[]>();
  for (const e of imports) {
    const timed = e.seconds != null && e.reps == null;
    const rows = byDay.get(e.day) ?? [];
    rows.push({ weightKg: e.weightKg == null ? null : Number(e.weightKg), reps: timed ? e.seconds : e.reps, timed, warmup: false, rounds: false, main: true });
    byDay.set(e.day, rows);
  }
  const all: ProgressPoint[] = [
    ...[...bySession.entries()].map(([id, g]) => ({ ...pointOf(g.rows), day: localDate(g.at), at: g.at.toISOString(), source: "session" as const, sessionId: id, dayName: g.dayName, record: false, first: false })),
    ...[...byDay.entries()].map(([day, rows]) => ({ ...pointOf(rows), day, at: `${day}T15:00:00.000Z`, source: "import" as const, sessionId: null, dayName: null, record: false, first: false })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const metric = metricOf(all, ex.kind);
  let best: number | null = null;
  for (const p of all) {
    const v = valueOf(p, metric);
    if (v == null) continue;
    if (best == null) p.first = true;
    else if (v > best) p.record = true;
    if (best == null || v > best) best = v;
  }
  const from = rangeStart(range, localDate(now));
  const points = from ? all.filter((p) => p.day >= from) : all;
  return {
    exercise: { id: ex.id, name: ex.name, group: ex.group, kind: ex.kind }, metric, range, from,
    points, records: points.filter((p) => p.record).length, truncated: sets.length >= EXERCISE_SET_CAP,
    totals: { sessions: points.length, sets: points.reduce((a, p) => a + p.sets, 0), volumeKg: r1(points.reduce((a, p) => a + p.volumeKg, 0)), firstDay: all[0]?.day ?? null },
    best: metric === "load" ? (() => { const b = points.filter((p) => p.e1rm != null).sort((a, c) => c.e1rm! - a.e1rm!)[0]; return b ? { day: b.day, e1rm: b.e1rm, set: b.best } : null; })() : null,
  };
}

/** Resumen del período: útil desde la primera sesión (sesiones, series, reps, volumen, minutos, frecuencia y mejores marcas). */
export async function myProgressSummary(userId: string, range: ProgressRange, now = new Date()) {
  const today = localDate(now), from = rangeStart(range, today);
  const sessions = await db.select({ id: workoutSession.id, endedAt: workoutSession.endedAt, activeMs: workoutSession.activeMs, dayName: workoutSession.dayName }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), from ? gte(workoutSession.endedAt, dayStartUtc(from)) : undefined))
    .orderBy(desc(workoutSession.endedAt)).limit(1000);
  const ids = sessions.map((s) => s.id);
  const sets = ids.length ? await db.select({ l: setLog, name: exercise.name }).from(setLog).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(inArray(setLog.sessionId, ids), isNull(setLog.voidedAt))) : [];
  const flags = await timedPeIds(sets.map((x) => x.l.programExerciseId));
  const raws = sets.map((x) => ({ x, r: rawOf(x.l, flags) }));
  const logged = sets.map((x) => toLogged(x.l, flags));
  const byEx = new Map<string, { name: string; sessions: Set<string>; rows: Raw[] }>();
  for (const { x, r } of raws) {
    const e = byEx.get(x.l.exerciseId) ?? { name: x.name, sessions: new Set(), rows: [] };
    e.sessions.add(x.l.sessionId); e.rows.push(r); byEx.set(x.l.exerciseId, e);
  }
  // Frecuencia: sesiones por semana (lunes) en las últimas 12 semanas del período; una semana sin sesiones es un 0 real.
  const monday = (d: string) => { const t = new Date(`${d}T12:00:00Z`); return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10); };
  const weeks: { from: string; sessions: number }[] = [];
  const firstWeek = sessions.length ? monday(localDate(sessions[sessions.length - 1].endedAt!)) : monday(today);
  for (let w = monday(today), i = 0; i < 12 && w >= (from ? monday(from) : firstWeek); i++, w = new Date(new Date(`${w}T12:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10)) weeks.unshift({ from: w, sessions: 0 });
  for (const s of sessions) { const w = weeks.find((x) => x.from === monday(localDate(s.endedAt!))); if (w) w.sessions++; }
  const last = sessions[0];
  return {
    range, from,
    totals: {
      sessions: sessions.length, sets: raws.filter(({ r }) => r.main).length, reps: raws.filter(({ r }) => !r.timed && !r.warmup && !r.rounds).reduce((a, { r }) => a + (r.reps ?? 0), 0),
      volumeKg: volumeKg(logged), activeMinutes: Math.round(sessions.reduce((a, s) => a + s.activeMs, 0) / 60_000), exercises: byEx.size,
    },
    last: last ? { id: last.id, day: localDate(last.endedAt!), dayName: last.dayName } : null,
    weeks,
    marks: [...byEx.entries()].map(([id, e]) => ({ id, name: e.name, sessions: e.sessions.size, ...pointOf(e.rows) }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)).slice(0, 8)
      .map((m) => ({ id: m.id, name: m.name, sessions: m.sessions, topKg: m.topKg, repsAtTop: m.repsAtTop, e1rm: m.e1rm, maxReps: m.maxReps, maxSec: m.maxSec })),
  };
}
