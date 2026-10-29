// Objetivos acordados (F-CO-03 / F-HX-02, D97). El coach los crea y cierra para su relación; el alumno los ve con el
// mismo cálculo. Valor actual de los automáticos: series y sesiones de esa relación en los últimos 28 días (ventana
// documentada en el dominio). El manual lo carga el coach con fecha; no se infiere de otros datos ni de salud.
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { GOAL_KINDS, GOAL_SOURCES, GOAL_WINDOW_DAYS, bestE1rm, goalProgress, goalTitle, isGoalKind, localDate, type GoalKind } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireClientOf, requireCoach, timedPeIds, toLogged } from "./services";

const { clientGoal, workoutSession, setLog, exercise, coachClient, organization, user } = schema;
const NF = () => new AccessError("not_found", "No encontramos ese objetivo.", 404);
const num = (s: string | null) => (s == null ? null : Number(s));
const dec = (n: number) => String(Math.round(n * 100) / 100);

/** Valor actual del indicador para una relación. null = datos insuficientes. */
async function currentValue(g: { kind: GoalKind; exerciseId: string | null; targetReps: number | null; manualValue: string | null }, coachClientId: string, now: Date) {
  if (g.kind === "manual") return num(g.manualValue);
  const since = new Date(now.getTime() - GOAL_WINDOW_DAYS * 86_400_000);
  if (g.kind === "frequency") {
    const rows = await db.select({ id: workoutSession.id }).from(workoutSession)
      .where(and(eq(workoutSession.coachClientId, coachClientId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, since)));
    return Math.round((rows.length / (GOAL_WINDOW_DAYS / 7)) * 100) / 100;
  }
  const rows = await db.select({ l: setLog }).from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .where(and(eq(workoutSession.coachClientId, coachClientId), eq(setLog.exerciseId, g.exerciseId!), gte(setLog.completedAt, since),
      inArray(workoutSession.status, ["completed", "in_progress", "paused"])));
  const timed = await timedPeIds(rows.map((r) => r.l.programExerciseId));
  if (g.kind === "e1rm") return bestE1rm(rows.map((r) => toLogged(r.l, timed)))?.e1rm ?? null;
  const ok = rows.map((r) => r.l).filter((l) => !timed.has(l.programExerciseId) && l.weightKg != null && (l.reps ?? 0) >= (g.targetReps ?? 1)).map((l) => Number(l.weightKg));
  return ok.length ? Math.max(...ok) : null;
}

async function view(g: typeof clientGoal.$inferSelect, now: Date) {
  const current = await currentValue({ kind: g.kind, exerciseId: g.exerciseId, targetReps: g.targetReps, manualValue: g.manualValue }, g.coachClientId, now);
  const target = Number(g.target), baseline = num(g.baseline);
  return {
    id: g.id, kind: g.kind, title: g.title, unit: g.unit, target, targetReps: g.targetReps, baseline, current,
    progress: goalProgress({ baseline, target, current }), source: GOAL_SOURCES[g.kind], manualAt: g.manualAt,
    dueOn: g.dueOn, status: g.status, note: g.note, createdAt: g.createdAt, closedAt: g.closedAt,
  };
}
export type GoalView = Awaited<ReturnType<typeof view>>;

export async function listGoals(actorId: string, orgId: string, coachClientId: string, now = new Date()) {
  await requireCoach(actorId, orgId);
  await requireClientOf(orgId, coachClientId);
  const rows = await db.select().from(clientGoal).where(eq(clientGoal.coachClientId, coachClientId)).orderBy(desc(clientGoal.createdAt)).limit(50);
  return { kinds: GOAL_KINDS, goals: await Promise.all(rows.map((g) => view(g, now))) };
}

export async function createGoal(actorId: string, orgId: string, coachClientId: string, p: {
  kind: unknown; exerciseId?: string | null; target: number; targetReps?: number | null; title?: string | null; unit?: string | null;
  baseline?: number | null; dueOn?: string | null; note?: string | null;
}, now = new Date()) {
  await requireCoach(actorId, orgId);
  await requireClientOf(orgId, coachClientId);
  if (!isGoalKind(p.kind)) throw new AccessError("invalid", "Elegí un tipo de objetivo.");
  const kind = p.kind;
  if (!Number.isFinite(p.target) || p.target <= 0 || p.target > 100_000) throw new AccessError("invalid", "La meta tiene que ser un número mayor que cero.");
  if (p.dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn) || p.dueOn < localDate(now))) throw new AccessError("invalid", "El plazo no puede ser anterior a hoy.");
  let exName: string | null = null;
  if (kind === "e1rm" || kind === "load") {
    if (!p.exerciseId) throw new AccessError("invalid", "Elegí el ejercicio.");
    const [e] = await db.select({ name: exercise.name }).from(exercise).where(and(eq(exercise.id, p.exerciseId), or(isNull(exercise.orgId), eq(exercise.orgId, orgId))));
    if (!e) throw new AccessError("invalid", "Ese ejercicio no está en tu biblioteca.");
    exName = e.name;
  }
  if (kind === "load" && (!Number.isInteger(p.targetReps) || p.targetReps! < 1 || p.targetReps! > 30)) throw new AccessError("invalid", "Indicá las repeticiones (1 a 30).");
  if (kind === "frequency" && p.target > 14) throw new AccessError("invalid", "Hasta 14 entrenamientos por semana.");
  if (kind === "manual" && ((p.title ?? "").trim().length < 3 || !(p.unit ?? "").trim())) throw new AccessError("invalid", "Escribí qué se mide y en qué unidad.");
  const unit = kind === "frequency" ? "por semana" : kind === "manual" ? p.unit!.trim().slice(0, 12) : "kg";
  const title = goalTitle(kind, { exercise: exName, target: p.target, reps: p.targetReps ?? null, title: p.title }).slice(0, 120);
  const g0 = { kind, exerciseId: kind === "e1rm" || kind === "load" ? p.exerciseId! : null, targetReps: kind === "load" ? p.targetReps! : null, manualValue: null };
  // Línea base: lo medido al acordar (automáticos) o lo que indique el coach (manual). Si no hay dato, queda vacía.
  const base = kind === "manual" ? (p.baseline != null && Number.isFinite(p.baseline) ? p.baseline : null) : await currentValue(g0, coachClientId, now);
  const [g] = await db.insert(clientGoal).values({
    coachClientId, kind, title, exerciseId: g0.exerciseId, target: dec(p.target), targetReps: g0.targetReps, unit,
    baseline: base == null ? null : dec(base), manualValue: kind === "manual" && base != null ? dec(base) : null, manualAt: kind === "manual" && base != null ? now : null,
    dueOn: p.dueOn || null, note: p.note?.trim().slice(0, 300) || null, createdBy: actorId, createdAt: now, updatedAt: now,
  }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "goal.created", resourceType: "client_goal", resourceId: g.id, meta: { kind } });
  return view(g, now);
}

/** Registrar valor (sólo manual), cambiar plazo/nota o cerrar (logrado/cancelado) y reabrir. */
export async function updateGoal(actorId: string, orgId: string, goalId: string, p: {
  status?: "active" | "achieved" | "cancelled"; manualValue?: number | null; dueOn?: string | null; note?: string | null;
}, now = new Date()) {
  await requireCoach(actorId, orgId);
  const [row] = await db.select({ g: clientGoal }).from(clientGoal).innerJoin(coachClient, eq(coachClient.id, clientGoal.coachClientId))
    .where(and(eq(clientGoal.id, goalId), eq(coachClient.coachOrgId, orgId)));
  if (!row) throw NF();
  await requireClientOf(orgId, row.g.coachClientId);
  const g = row.g;
  if (p.manualValue !== undefined && g.kind !== "manual") throw new AccessError("invalid", "Este objetivo se calcula solo con los entrenamientos.");
  if (p.manualValue != null && (!Number.isFinite(p.manualValue) || Math.abs(p.manualValue) > 100_000)) throw new AccessError("invalid", "Valor inválido.");
  if (p.dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn) || p.dueOn < localDate(now))) throw new AccessError("invalid", "El plazo no puede ser anterior a hoy.");
  const set: Partial<typeof clientGoal.$inferInsert> = { updatedAt: now };
  if (p.status) { set.status = p.status; set.closedAt = p.status === "active" ? null : now; }
  if (p.manualValue != null) { set.manualValue = dec(p.manualValue); set.manualAt = now; }
  if (p.dueOn !== undefined) set.dueOn = p.dueOn || null;
  if (p.note !== undefined) set.note = p.note?.trim().slice(0, 300) || null;
  const [u] = await db.update(clientGoal).set(set).where(eq(clientGoal.id, goalId)).returning();
  await audit(db, { actorUserId: actorId, orgId, action: p.status && p.status !== g.status ? `goal.${p.status}` : "goal.updated", resourceType: "client_goal", resourceId: goalId });
  return view(u, now);
}

/** Objetivos del alumno con sus coaches vigentes: activos y cerrados en los últimos 90 días. Sólo lectura. */
export async function myGoals(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await db.select({ g: clientGoal, coach: user.name, org: organization.name }).from(clientGoal)
    .innerJoin(coachClient, eq(coachClient.id, clientGoal.coachClientId)).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .innerJoin(user, eq(user.id, clientGoal.createdBy))
    .where(and(eq(coachClient.userId, userId), inArray(coachClient.status, ["active", "paused"]), or(eq(clientGoal.status, "active"), gte(clientGoal.closedAt, since))))
    .orderBy(desc(clientGoal.createdAt)).limit(30);
  return Promise.all(rows.map(async (r) => ({ ...(await view(r.g, now)), by: r.coach, org: r.org })));
}
