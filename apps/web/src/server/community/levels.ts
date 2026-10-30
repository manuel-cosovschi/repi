// D166: nivel REPI y trofeos de cada persona, calculados con su entrenamiento en REPI (sesiones terminadas y sus series) y
// con lo que le validó el gym. El historial importado (D132) no suma: el nivel premia lo que entrena acá. Los trofeos se
// guardan como logro (`achievement`, tipo «trophy») para no otorgarlos dos veces y para mostrar el desbloqueo una sola vez.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  EMPTY_STATS, TIER_LABEL, TROPHIES, TROPHY_TIERS, isFullBody, levelFromXp, localDate, trophySource, trophyState, trophyUnit, weekOf, xpBreakdown, xpOf,
  type LevelStats,
} from "@repi/domain";
import { db, schema } from "@/db";
import { grant } from "./services";

const { achievement, workoutSession, setLog, exercise } = schema;

/** Estadísticas que alimentan el nivel y los trofeos. */
export async function levelStats(userId: string): Promise<LevelStats> {
  const rows = await db.select({
    session: workoutSession.id, at: workoutSession.startedAt, ex: setLog.exerciseId, group: exercise.muscleGroup,
    top: sql<string | null>`max(nullif(${setLog.weightKg}, '')::numeric)::text`,
    vol: sql<string>`coalesce(sum(nullif(${setLog.weightKg}, '')::numeric * coalesce(${setLog.reps}, 0)), 0)::text`,
  }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed")))
    .groupBy(workoutSession.id, workoutSession.startedAt, setLog.exerciseId, exercise.muscleGroup)
    .orderBy(workoutSession.startedAt);
  const s: LevelStats = { ...EMPTY_STATS };
  const days = new Set<string>(), seen = new Set<string>(), best = new Map<string, number>(), weeks = new Map<string, Set<string>>();
  let kg = 0;
  for (const r of rows) {
    days.add(localDate(r.at));
    seen.add(r.ex);
    kg += Number(r.vol);
    const top = r.top == null ? 0 : Number(r.top);
    if (top > 0) {
      const prev = best.get(r.ex);
      if (prev != null && top > prev) s.prs++; // la primera vez marca la referencia, no es récord
      if (prev == null || top > prev) best.set(r.ex, top);
    }
    const wk = weekOf(r.at)[0];
    if (!weeks.has(wk)) weeks.set(wk, new Set());
    weeks.get(wk)!.add(r.group);
  }
  s.days = days.size;
  s.exercises = seen.size;
  s.tons = kg / 1000;
  s.fullBodyWeeks = [...weeks.values()].filter(isFullBody).length;
  const ach = await db.select({ kind: achievement.kind, n: sql<number>`count(*)::int` }).from(achievement)
    .where(and(eq(achievement.userId, userId), inArray(achievement.kind, ["challenge_validated", "gym_record", "month_12"]))).groupBy(achievement.kind);
  for (const a of ach) {
    if (a.kind === "challenge_validated") s.validated = a.n;
    if (a.kind === "gym_record") s.gymRecords = a.n;
    if (a.kind === "month_12") s.months = a.n;
  }
  return s;
}

/** Otorga los escalones alcanzados que todavía no tenía. Idempotente (índice único por persona, tipo y clave). */
export async function syncTrophies(userId: string, stats: LevelStats) {
  const out: string[] = [];
  for (const t of trophyState(stats)) {
    const fam = TROPHIES.find((x) => x.key === t.key)!;
    for (let i = 0; i < t.tier; i++) {
      const tier = TROPHY_TIERS[i];
      const r = await grant(db, userId, null, "trophy", trophySource(fam.key, tier), `${fam.name} · ${TIER_LABEL[tier]}`, trophyUnit(fam, fam.tiers[i]));
      if (r) out.push(r.id);
    }
  }
  return out;
}

/** Nivel, desglose, vitrina de trofeos y los desbloqueos que la persona todavía no vio (para la animación). */
export async function myLevel(userId: string) {
  const stats = await levelStats(userId);
  await syncTrophies(userId, stats);
  const lv = levelFromXp(xpOf(stats));
  const got = await db.select().from(achievement).where(and(eq(achievement.userId, userId), eq(achievement.kind, "trophy")));
  const at = new Map(got.map((g) => [g.sourceKey, g.createdAt]));
  const unseen = got.filter((g) => !g.seenAt).map((g) => {
    const [key, tier] = g.sourceKey.split(":") as [string, (typeof TROPHY_TIERS)[number]];
    return { id: g.id, key, tier, title: g.title, detail: g.detail };
  });
  // Del más bajo al más alto: si se desbloquean varios a la vez, el oro queda para el final.
  unseen.sort((a, b) => TROPHY_TIERS.indexOf(a.tier) - TROPHY_TIERS.indexOf(b.tier));
  return {
    level: lv.level, xp: lv.xp, toNext: lv.toNext, pct: lv.pct, breakdown: xpBreakdown(stats),
    trophies: trophyState(stats).map((t) => ({ ...t, since: t.tierName ? at.get(trophySource(t.key, t.tierName)) ?? null : null })),
    unseen,
  };
}

export async function markTrophiesSeen(userId: string) {
  await db.update(achievement).set({ seenAt: new Date() }).where(and(eq(achievement.userId, userId), eq(achievement.kind, "trophy"), isNull(achievement.seenAt)));
  return { ok: true };
}

/** Sólo el número de nivel (para el equipo del gym y el perfil del Club). */
export async function levelOfUser(userId: string) {
  return levelFromXp(xpOf(await levelStats(userId))).level;
}
