// Adaptive Coach · fase 1 (D108). «Quiero entrenar por mi cuenta» / «No vino el profe» resuelto sólo con datos existentes
// y reglas del dominio (`planSolo`): no llama a ningún modelo ni genera rutinas. Cada consulta queda en auditoría con el
// modo resuelto, base de las métricas «porcentaje resuelto sin IA» del pedido (§23).
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { localDate, planSolo, type SoloContext, type SoloVariant } from "@repi/domain";
import { db, schema } from "@/db";
import { audit } from "../access/util";
import { myTraining } from "./services";

const { workoutSession, setLog, checkin } = schema;

export async function soloPlan(userId: string, variant: SoloVariant, now = new Date()) {
  const t = await myTraining(userId, now);
  const today = localDate(now);
  let open: SoloContext["open"] = null;
  if (t.openSession) {
    const [s] = await db.select().from(workoutSession).where(eq(workoutSession.id, t.openSession));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(setLog).where(eq(setLog.sessionId, s.id));
    const total = t.state === "ready" ? (t.program?.days.find((d) => d.id === s.dayId)?.exercises.reduce((a, e) => a + e.sets, 0) ?? 0) : 0;
    open = { id: s.id, dayName: s.dayName, startedAt: s.startedAt, setsDone: n, setsTotal: Math.max(total, n) };
  }
  // «Hoy» en hora AR: desde 24 h atrás y filtrado por fecha local, para no depender del huso del servidor.
  const recent = await db.select({ dayName: workoutSession.dayName, endedAt: workoutSession.endedAt }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["completed"]), gte(workoutSession.endedAt, new Date(now.getTime() - 86_400_000))));
  const [ci] = await db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, today)));
  const next = t.state === "ready" && t.program ? t.program.days[t.program.nextDay] ?? null : null;
  const plan = planSolo({
    now, today, relation: t.relation ? { kind: t.relation.kind, name: t.relation.name } : null,
    state: t.state, startsOn: t.state === "scheduled" ? t.startsOn : undefined, open,
    next: next ? { id: next.id, name: next.name, exercises: next.exercises.length } : null,
    doneToday: recent.filter((r) => r.endedAt && localDate(r.endedAt) === today).map((r) => ({ dayName: r.dayName })),
    checkin: ci ? { energy: ci.energy, sleep: ci.sleep, mood: ci.mood } : null,
  }, variant);
  await audit(db, { actorUserId: userId, action: "adaptive.solo_plan", resourceType: "workout_session", resourceId: open?.id ?? null,
    meta: { variant, mode: plan.mode, adp: plan.adp, usesAI: false } });
  return plan;
}
