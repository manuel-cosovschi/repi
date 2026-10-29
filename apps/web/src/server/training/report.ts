// Informe mensual (F-CO-16, D96). Se arma sólo con datos persistidos: sesiones completadas y sus series. Mes en hora de
// Argentina (UTC−3, sin horario de verano). El alumno ve todas sus sesiones y su check-in promedio; el coach ve sólo las
// sesiones de su relación con el permiso de entrenamientos vigente y nunca check-ins, molestias ni salud.
// Con menos datos de los necesarios se dice «datos insuficientes»; no se estima nada que no se haya registrado.
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { bestE1rm, localDate, volumeKg } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { requireClientOf, requireCoach, timedPeIds, toLogged } from "./services";

const { workoutSession, setLog, exercise, checkin, user } = schema;

export const REPORT_FORMULAS = {
  volume: "Volumen = Σ peso × repeticiones de las series completadas con carga.",
  e1rm: "1RM estimado (Epley) = peso × (1 + repeticiones / 30), con series de 1 a 12 repeticiones. Es una estimación, no un máximo medido.",
  rpe: "RPE de sesión: esfuerzo percibido de 1 a 10 que registró la persona al terminar.",
};

/** «AAAA-MM» válido y no futuro → límites en UTC del mes en hora argentina. */
export function monthBounds(month: string, now = new Date()) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new AccessError("invalid", "Elegí un mes válido.");
  if (month > localDate(now).slice(0, 7)) throw new AccessError("invalid", "Ese mes todavía no empezó.");
  const y = Number(m[1]), mo = Number(m[2]);
  const start = new Date(Date.UTC(y, mo - 1, 1, 3)), end = new Date(Date.UTC(y, mo, 1, 3)), prevStart = new Date(Date.UTC(y, mo - 2, 1, 3));
  return { start, end, prevStart, label: new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 15))) };
}

type Scope = { userId: string } | { coachClientId: string };

async function build(scope: Scope, month: string, now: Date) {
  const b = monthBounds(month, now);
  const who = "userId" in scope ? eq(workoutSession.userId, scope.userId) : eq(workoutSession.coachClientId, scope.coachClientId);
  const sessions = await db.select().from(workoutSession)
    .where(and(who, eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, b.prevStart), lt(workoutSession.endedAt, b.end))).orderBy(asc(workoutSession.endedAt));
  const cur = sessions.filter((s) => s.endedAt! >= b.start), prev = sessions.filter((s) => s.endedAt! < b.start);
  const sets = sessions.length ? await db.select({ l: setLog, name: exercise.name, group: exercise.muscleGroup }).from(setLog)
    .innerJoin(exercise, eq(exercise.id, setLog.exerciseId)).where(inArray(setLog.sessionId, sessions.map((s) => s.id))) : [];
  const curIds = new Set(cur.map((s) => s.id));
  const curSets = sets.filter((x) => curIds.has(x.l.sessionId)), prevSets = sets.filter((x) => !curIds.has(x.l.sessionId));
  const rpes = cur.map((s) => s.rpe).filter((r): r is number => r != null);
  const timed = await timedPeIds(sets.map((x) => x.l.programExerciseId)); // QA DATA-6: series por tiempo fuera de volumen y 1RM

  // Semanas que empiezan el lunes (fecha local); la primera puede empezar en el mes anterior.
  const weeks = new Map<string, { sessions: number; volumeKg: number }>();
  for (const s of cur) {
    const d = new Date(`${localDate(s.endedAt!)}T12:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    const w = weeks.get(monday) ?? { sessions: 0, volumeKg: 0 };
    w.sessions++; w.volumeKg += volumeKg(curSets.filter((x) => x.l.sessionId === s.id).map((x) => toLogged(x.l, timed)));
    weeks.set(monday, w);
  }
  const byEx = new Map<string, { name: string; group: string; cur: typeof sets; prev: typeof sets }>();
  for (const x of sets) {
    const e = byEx.get(x.l.exerciseId) ?? { name: x.name, group: x.group, cur: [], prev: [] };
    (curIds.has(x.l.sessionId) ? e.cur : e.prev).push(x);
    byEx.set(x.l.exerciseId, e);
  }
  const exercises = [...byEx.values()].filter((e) => e.cur.length).map((e) => {
    const best = bestE1rm(e.cur.map((x) => toLogged(x.l, timed))), before = bestE1rm(e.prev.map((x) => toLogged(x.l, timed)));
    const loads = e.cur.map((x) => (x.l.weightKg == null ? null : Number(x.l.weightKg))).filter((w): w is number => w != null);
    return { name: e.name, group: e.group, sets: e.cur.length, topKg: loads.length ? Math.max(...loads) : null, best, previous: before };
  }).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name)).slice(0, 15);
  const groups = new Map<string, number>();
  for (const x of curSets) groups.set(x.group, (groups.get(x.group) ?? 0) + volumeKg([toLogged(x.l, timed)]));

  return {
    month, label: b.label, generatedAt: now.toISOString(),
    totals: {
      sessions: cur.length, activeMinutes: Math.round(cur.reduce((a, s) => a + s.activeMs, 0) / 60_000), sets: curSets.length,
      volumeKg: volumeKg(curSets.map((x) => toLogged(x.l, timed))), avgRpe: rpes.length ? Math.round((rpes.reduce((a, r) => a + r, 0) / rpes.length) * 10) / 10 : null, rpeCount: rpes.length,
    },
    previous: { sessions: prev.length, volumeKg: volumeKg(prevSets.map((x) => toLogged(x.l, timed))) },
    weeks: [...weeks.entries()].map(([from, w]) => ({ from, sessions: w.sessions, volumeKg: Math.round(w.volumeKg * 10) / 10 })),
    exercises,
    groups: [...groups.entries()].map(([group, v]) => ({ group, volumeKg: Math.round(v * 10) / 10 })).sort((a, b) => b.volumeKg - a.volumeKg),
    formulas: REPORT_FORMULAS,
  };
}

/** Informe propio: todas las sesiones de la persona (coach y gym) y su check-in promedio. */
export async function myMonthlyReport(userId: string, month: string, now = new Date()): Promise<MonthlyReport> {
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  const r = await build({ userId }, month, now);
  const b = monthBounds(month, now);
  const days = await db.select({ energy: checkin.energy, sleep: checkin.sleep, mood: checkin.mood }).from(checkin)
    .where(and(eq(checkin.userId, userId), gte(checkin.date, localDate(b.start)), lt(checkin.date, localDate(b.end))));
  const avg = (k: "energy" | "sleep" | "mood") => days.length ? Math.round((days.reduce((a, d) => a + d[k], 0) / days.length) * 10) / 10 : null;
  return { ...r, person: u.name, context: null as MonthlyReport["context"], checkins: { count: days.length, energy: avg("energy"), sleep: avg("sleep"), mood: avg("mood") } };
}

/** Informe del coach: sólo sesiones de esta relación y con el permiso de entrenamientos activo. Sin check-ins ni salud. */
export async function clientMonthlyReport(actorId: string, orgId: string, coachClientId: string, month: string, now = new Date()): Promise<MonthlyReport> {
  const org = await requireCoach(actorId, orgId);
  const rel = await requireClientOf(orgId, coachClientId);
  const r = await build({ coachClientId }, month, now);
  const [c] = await db.select({ name: user.name }).from(user).where(eq(user.id, actorId));
  return { ...r, person: rel.name, context: { coach: c?.name ?? null, org: org.name }, checkins: null };
}

export type MonthlyReport = Awaited<ReturnType<typeof build>> & {
  person: string; context: { coach: string | null; org: string } | null;
  checkins: { count: number; energy: number | null; sleep: number | null; mood: number | null } | null;
};
