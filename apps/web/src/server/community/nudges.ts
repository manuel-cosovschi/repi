// D168: REPI invita a cada socio a rankings, desafíos y trofeos con lo que ya entrena. Todo sale de sus datos: «con lo que
// levantaste entrarías 3°», «te superaron el récord», «quedan 2 días», «te faltan 3 récords para Fuerza · Plata». Nada se
// publica por la persona: sumarse al ranking o subir un intento siempre lo decide ella con un toque. Un menor sin
// consentimiento de su adulto responsable no recibe invitaciones a rankings ni desafíos (SEC-6).
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { TIER_LABEL, TROPHIES, TROPHY_TIERS, bestByMember, fmtValue, isNewRecord, localDate, parseReps, trophyState, trophyUnit, type ChallengeUnit } from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { minorWithoutGuardian } from "../access/services";
import { myGym } from "./services";
import { clubRankingFor, liftBests, rankingMembers } from "./club";
import { levelStats } from "./levels";

const { challenge, challengeAttempt, achievement, setLog, workoutSession, programExercise, exercise } = schema;

export type NudgeAction = "challenge" | "ranking_optin" | "club" | "progress";
export type Nudge = { id: string; title: string; body: string; cta: string; action: NudgeAction; challengeId?: string; exerciseId?: string };

const kg = (n: number) => `${(Math.round(n * 2) / 2).toLocaleString("es-AR")} kg`;
const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / dayMs);

/** Puesto que tendría `mine` entre los valores de otras personas (empates comparten puesto). */
export const placeAmong = (others: number[], mine: number, lowerIsBetter = false) => 1 + others.filter((v) => (lowerIsBetter ? v < mine : v > mine)).length;

/** Mejor marca propia de los últimos 90 días en cada ejercicio: peso máximo con al menos una repetición y repeticiones máximas. */
async function myMarks(userId: string, exerciseIds: string[], now: Date) {
  if (!exerciseIds.length) return new Map<string, { kg: number; reps: number }>();
  const rows = await db.select({ ex: setLog.exerciseId, w: setLog.weightKg, r: setLog.reps, target: programExercise.reps }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).leftJoin(programExercise, eq(programExercise.id, setLog.programExerciseId))
    .where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["completed", "in_progress", "paused"]), inArray(setLog.exerciseId, exerciseIds), gte(setLog.completedAt, new Date(now.getTime() - 90 * dayMs))));
  const out = new Map<string, { kg: number; reps: number }>();
  for (const x of rows) {
    if (x.r == null || x.r < 1 || (x.target != null && parseReps(x.target).kind === "time")) continue; // series por tiempo: reps son segundos
    const cur = out.get(x.ex) ?? { kg: 0, reps: 0 };
    out.set(x.ex, { kg: Math.max(cur.kg, x.w == null ? 0 : Number(x.w)), reps: Math.max(cur.reps, x.r) });
  }
  return out;
}

async function challengeNudges(userId: string, r: Awaited<ReturnType<typeof myGym>>, now: Date) {
  const today = localDate(now);
  const out: (Nudge & { p: number })[] = [];
  const chs = await db.select().from(challenge).where(and(eq(challenge.orgId, r.org.id), eq(challenge.status, "active"), gte(challenge.endsOn, today),
    or(isNull(challenge.locationId), eq(challenge.locationId, r.loc.id))));
  if (!chs.length) return out;
  const ids = chs.map((c) => c.id);
  const attempts = await db.select({ ch: challengeAttempt.challengeId, userId: challengeAttempt.userId, v: challengeAttempt.valueX10, status: challengeAttempt.status, at: challengeAttempt.createdAt })
    .from(challengeAttempt).where(and(inArray(challengeAttempt.challengeId, ids), inArray(challengeAttempt.status, ["approved", "pending"])));
  const records = await db.select({ ch: achievement.sourceKey }).from(achievement).where(and(eq(achievement.userId, userId), eq(achievement.kind, "gym_record"), inArray(achievement.sourceKey, ids)));
  const holders = chs.some((c) => c.recordAttemptId) ? await db.select({ id: challengeAttempt.id, userId: challengeAttempt.userId }).from(challengeAttempt)
    .where(inArray(challengeAttempt.id, chs.map((c) => c.recordAttemptId).filter(Boolean) as string[])) : [];
  const linked = [...new Set(chs.map((c) => c.exerciseId).filter(Boolean) as string[])];
  const marks = await myMarks(userId, linked, now);
  const names = linked.length ? new Map((await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, linked))).map((e) => [e.id, e.name])) : new Map<string, string>();
  for (const c of chs) {
    const unit = c.unit as ChallengeUnit;
    const mine = attempts.filter((a) => a.ch === c.id && a.userId === userId);
    const approved = attempts.filter((a) => a.ch === c.id && a.status === "approved");
    const holder = holders.find((h) => h.id === c.recordAttemptId)?.userId ?? null;
    // Tuvo el récord y se lo superaron.
    if (records.some((x) => x.ch === c.id) && holder && holder !== userId) {
      out.push({ p: 100, id: `beaten:${c.id}:${c.recordAttemptId}`, title: `Te superaron en ${c.title}`, body: `El récord ahora es ${fmtValue(c.recordValue == null ? null : c.recordValue / 10, unit)}. Premio: ${c.prize}.`, cta: "Recuperarlo", action: "challenge", challengeId: c.id });
      continue;
    }
    const pending = mine.some((a) => a.status === "pending");
    const myBest = bestByMember(mine.filter((a) => a.status === "approved").map((a) => ({ memberId: userId, value: a.v, at: a.at })), c.lowerIsBetter)[0]?.value ?? null;
    // Con el ejercicio ligado: lo que ya hizo entrenando, comparado con las marcas validadas.
    const m = c.exerciseId ? marks.get(c.exerciseId) : undefined;
    const v = m ? (unit === "kg" ? m.kg : unit === "reps" ? m.reps : 0) : 0;
    if (v > 0 && !pending && (myBest == null || v * 10 > myBest)) {
      const others = bestByMember(approved.filter((a) => a.userId !== userId).map((a) => ({ memberId: a.userId, value: a.v, at: a.at })), c.lowerIsBetter).map((b) => b.value);
      const pos = placeAmong(others, Math.round(v * 10), c.lowerIsBetter);
      const record = isNewRecord(Math.round(v * 10), c.recordValue, c.lowerIsBetter);
      const val = fmtValue(v, unit);
      out.push({
        p: 90, id: `rank:${c.id}:${val}`, title: record ? `Con tus ${val} serías récord del gym` : `Con tus ${val} entrarías ${pos}°`,
        body: `${names.get(c.exerciseId!) ?? "Ya lo hiciste entrenando"} · ${c.title}. Validalo con video o frente a un profe. Premio: ${c.prize}.`,
        cta: "Subir intento", action: "challenge", challengeId: c.id,
      });
      continue;
    }
    if (mine.length) continue;
    const left = daysBetween(today, c.endsOn);
    if (left <= 3) out.push({ p: 80, id: `closing:${c.id}`, title: left === 0 ? `Último día: ${c.title}` : `Quedan ${left} día${left === 1 ? "" : "s"}: ${c.title}`, body: `Premio: ${c.prize}. ${approved.length ? `Ya participan ${new Set(approved.map((a) => a.userId)).size}.` : "Todavía nadie validó una marca."}`, cta: "Ver desafío", action: "challenge", challengeId: c.id });
    else if (c.createdAt >= new Date(now.getTime() - 10 * dayMs)) out.push({ p: 70, id: `new:${c.id}`, title: `Nuevo desafío: ${c.title}`, body: `Premio: ${c.prize}. Cierra el ${c.endsOn.slice(8, 10)}/${c.endsOn.slice(5, 7)}.`, cta: "Ver desafío", action: "challenge", challengeId: c.id });
  }
  return out;
}

async function clubNudges(userId: string, r: Awaited<ReturnType<typeof myGym>>, now: Date) {
  const out: (Nudge & { p: number })[] = [];
  const members = await rankingMembers(r.org.id, now);
  const inRanking = members.some((m) => m.userId === userId);
  const mineBest = (await liftBests([r.m.id], now));
  if (!mineBest.size) return out;
  const boards = await liftBests(members.filter((m) => m.userId !== userId).map((m) => m.gm), now);
  const exIds = [...mineBest.keys()];
  const names = new Map((await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, exIds))).map((e) => [e.id, e.name]));
  // El ejercicio donde mejor queda (y, a igual puesto, el que más gente compite).
  const places = exIds.map((ex) => {
    const mine = mineBest.get(ex)!.get(r.m.id)!.best;
    const others = [...(boards.get(ex)?.values() ?? [])].map((x) => x.best);
    const pos = placeAmong(others, mine);
    const above = others.filter((v) => v > mine).sort((a, b) => a - b)[0] ?? null;
    return { ex, name: names.get(ex) ?? "Ejercicio", mine, pos, people: others.length + 1, gap: above == null ? null : above - mine };
  }).sort((a, b) => a.pos - b.pos || b.people - a.people);
  const top = places[0];
  if (!inRanking) {
    if (top.people > 1) out.push({ p: 85, id: `optin:${top.ex}:${top.pos}`, title: `Estarías ${top.pos}° en ${top.name}`, body: `Tu mejor 1RM estimado es ${kg(top.mine)}: con eso quedás ${top.pos}° de ${top.people} en el ranking del gym. Sumate y competí.`, cta: "Sumarme al ranking", action: "ranking_optin", exerciseId: top.ex });
    else out.push({ p: 60, id: `optin1:${top.ex}`, title: `Abrí el ranking de ${top.name}`, body: `Todavía nadie del gym compite en ${top.name}. Con tu ${kg(top.mine)} empezás arriba.`, cta: "Sumarme al ranking", action: "ranking_optin", exerciseId: top.ex });
    return out;
  }
  const chase = places.find((x) => x.pos > 1 && x.gap != null);
  if (top.pos === 1 && top.people > 1) out.push({ p: 55, id: `lead:${top.ex}`, title: `Sos 1° en ${top.name}`, body: `Con ${kg(top.mine)} de 1RM estimado liderás entre ${top.people}. Cada semana se actualiza: defendé el puesto.`, cta: "Ver ranking", action: "club", exerciseId: top.ex });
  if (chase) out.push({ p: 60, id: `pos:${chase.ex}:${chase.pos}`, title: `Estás ${chase.pos}° en ${chase.name}`, body: `Con ${kg(Math.max(0.5, chase.gap!))} más de 1RM estimado pasás al ${chase.pos - 1}°.`, cta: "Ver ranking", action: "club", exerciseId: chase.ex });
  // Ranking del mes (días con entrenamiento o ingreso).
  const month = await clubRankingFor(userId, r.org.id, now).catch(() => null);
  const me = month?.rows.find((x) => x.me);
  if (month && me && me.pos > 1) {
    const ahead = month.rows.filter((x) => x.pos < me.pos).at(-1);
    if (ahead) { const d = ahead.days - me.days + 1; out.push({ p: 65, id: `month:${month.month}:${me.pos}`, title: `Vas ${me.pos}° en el ranking del mes`, body: `Con ${d} día${d === 1 ? "" : "s"} más de entrenamiento pasás al ${ahead.pos}°.`, cta: "Ver ranking", action: "club" }); }
  }
  return out;
}

async function trophyNudge(userId: string) {
  const st = trophyState(await levelStats(userId)).filter((t) => t.goal != null && t.pct >= 70).sort((a, b) => b.pct - a.pct)[0];
  if (!st) return [];
  const fam = TROPHIES.find((t) => t.key === st.key)!;
  const tier = TROPHY_TIERS[st.tier];
  return [{ p: 40, id: `trophy:${st.key}:${tier}`, title: `Te falta poco para ${fam.name} · ${TIER_LABEL[tier]}`, body: `Te ${st.goal! - st.value === 1 ? "falta" : "faltan"} ${trophyUnit(fam, st.goal! - st.value)}.`, cta: "Ver mis trofeos", action: "progress" as const }];
}

/** Invitaciones vigentes, de la más importante a la menos (máx. 5). */
export async function communityNudges(userId: string, now = new Date()): Promise<{ orgId: string | null; nudges: Nudge[] }> {
  const r = await myGym(userId).catch(() => null);
  const restricted = r ? await minorWithoutGuardian(userId) : true;
  const all = [
    ...(r && !restricted ? await challengeNudges(userId, r, now) : []),
    ...(r && !restricted && featureOn("club") ? await clubNudges(userId, r, now) : []),
    ...(await trophyNudge(userId)),
  ];
  return { orgId: r?.org.id ?? null, nudges: all.sort((a, b) => b.p - a.p).slice(0, 5).map(({ p: _p, ...n }) => n) }; // eslint-disable-line @typescript-eslint/no-unused-vars
}
