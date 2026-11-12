// D217 · Metas PROPIAS del alumno por ejercicio (y de frecuencia), en la misma tabla que las acordadas con el coach
// (`client_goal`, `origin = self`). Separadas siempre de: el objetivo acordado con el entrenador (origin coach, sólo lectura para
// el alumno), la prescripción vigente y la próxima recomendación de REPI. Privadas: el coach no las ve (no hay consentimiento
// para compartirlas) y nadie más que la persona las crea, cambia o cierra.
// REPI Control (D213): con un gimnasio que supervisa la planificación, el socio no fija metas desde Progreso: puede pedírselas
// al equipo (no hay una vía indirecta para cambiar lo supervisado).
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { goalStatus, localDate, type ExerciseGoalKind, type PISet } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { myActive } from "../training/services";
import { relationSupervised } from "../gym/routine-policy";

const { clientGoal, exercise, workoutSession } = schema;
export const SELF_GOAL_KINDS = ["load", "e1rm", "reps", "time", "frequency"] as const;
export type SelfGoalKind = (typeof SELF_GOAL_KINDS)[number];
const MAX_ACTIVE = 20;
const NF = () => new AccessError("not_found", "No encontramos esa meta.", 404);
const dec = (n: number) => String(Math.round(n * 100) / 100);
const num = (s: string | null) => (s == null ? null : Number(s));

/** ¿Puede fijar metas propias? No con un gimnasio que supervisa su planificación (REPI Control). */
export async function canSetSelfGoals(userId: string) {
  const act = await myActive(userId).catch(() => null);
  const supervised = act ? await relationSupervised({ kind: act.kind, orgId: act.orgId }).catch(() => false) : false;
  return { allowed: !supervised, supervised };
}

type Row = typeof clientGoal.$inferSelect;
export type SelfGoalView = {
  id: string; origin: "self"; kind: SelfGoalKind; title: string; exerciseId: string | null; target: number; targetReps: number | null; unit: string;
  baseline: number | null; dueOn: string | null; status: "active" | "achieved" | "cancelled"; note: string | null; createdAt: Date; closedAt: Date | null;
};
const view = (g: Row): SelfGoalView => ({
  id: g.id, origin: "self", kind: g.kind as SelfGoalKind, title: g.title, exerciseId: g.exerciseId, target: Number(g.target), targetReps: g.targetReps, unit: g.unit,
  baseline: num(g.baseline), dueOn: g.dueOn, status: g.status, note: g.note, createdAt: g.createdAt, closedAt: g.closedAt,
});

/** Metas propias activas y cerradas en los últimos 90 días (de un ejercicio o todas). */
export async function mySelfGoals(userId: string, o: { exerciseId?: string | null } = {}, now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await db.select().from(clientGoal).where(and(eq(clientGoal.userId, userId), eq(clientGoal.origin, "self"),
    o.exerciseId ? eq(clientGoal.exerciseId, o.exerciseId) : undefined,
    sql`(${clientGoal.status} = 'active' or ${clientGoal.closedAt} >= ${since.toISOString()}::timestamptz)`)).orderBy(desc(clientGoal.createdAt)).limit(40);
  return rows.map(view);
}

/** Frecuencia real: entrenamientos terminados de las últimas 4 semanas ÷ 4. */
async function perWeek(userId: string, now: Date) {
  const rows = await db.select({ id: workoutSession.id }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, new Date(now.getTime() - 28 * 86_400_000))));
  return Math.round((rows.length / 4) * 100) / 100;
}

export async function createSelfGoal(userId: string, p: { kind: unknown; exerciseId?: string | null; target: unknown; targetReps?: unknown; dueOn?: string | null; note?: string | null },
  current: (exerciseId: string) => Promise<PISet[]>, now = new Date()) {
  const can = await canSetSelfGoals(userId);
  if (!can.allowed) throw new AccessError("supervised", "En tu gimnasio, las metas las define el equipo. Podés pedirles una desde «Pedir ayuda».", 403);
  if (typeof p.kind !== "string" || !(SELF_GOAL_KINDS as readonly string[]).includes(p.kind)) throw new AccessError("invalid", "Elegí un tipo de meta.");
  const kind = p.kind as SelfGoalKind;
  const target = Number(p.target);
  const max = kind === "frequency" ? 7 : kind === "time" ? 7200 : kind === "reps" ? 500 : 1000;
  if (!Number.isFinite(target) || target <= 0 || target > max) throw new AccessError("invalid", `La meta tiene que ser un número entre 0 y ${max}.`);
  const reps = p.targetReps == null || p.targetReps === "" ? null : Number(p.targetReps);
  if (kind === "load" && (!Number.isInteger(reps) || reps! < 1 || reps! > 30)) throw new AccessError("invalid", "Indicá las repeticiones (1 a 30).");
  if (p.dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn) || p.dueOn < localDate(now))) throw new AccessError("invalid", "El plazo no puede ser anterior a hoy.");
  let exName: string | null = null;
  if (kind !== "frequency") {
    if (!p.exerciseId || !/^[\w-]{1,64}$/.test(p.exerciseId)) throw new AccessError("invalid", "Elegí el ejercicio.");
    const [e] = await db.select({ name: exercise.name, owner: exercise.ownerUserId }).from(exercise).where(eq(exercise.id, p.exerciseId));
    if (!e || (e.owner && e.owner !== userId)) throw new AccessError("not_found", "No encontramos ese ejercicio.", 404);
    exName = e.name;
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(clientGoal).where(and(eq(clientGoal.userId, userId), eq(clientGoal.status, "active")));
  if (n >= MAX_ACTIVE) throw new AccessError("limit", `Hasta ${MAX_ACTIVE} metas activas. Cerrá alguna para agregar otra.`, 409);
  // Línea base: lo medido al crearla (nunca inventada). Sin datos, queda vacía y no hay porcentaje.
  const baseline = kind === "frequency" ? await perWeek(userId, now)
    : goalStatus({ kind: kind as ExerciseGoalKind, target, targetReps: reps, baseline: null }, await current(p.exerciseId!)).current;
  const fmt = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
  const title = (kind === "load" ? `${exName}: ${fmt(target)} kg × ${reps}` : kind === "e1rm" ? `${exName}: 1RM estimado ${fmt(target)} kg`
    : kind === "reps" ? `${exName}: ${target} repeticiones` : kind === "time" ? `${exName}: ${target} s` : `Entrenar ${fmt(target)} veces por semana`).slice(0, 120);
  const [g] = await db.insert(clientGoal).values({
    origin: "self", userId, coachClientId: null, kind, title, exerciseId: kind === "frequency" ? null : p.exerciseId!, target: dec(target), targetReps: kind === "load" ? reps : null,
    unit: kind === "frequency" ? "por semana" : kind === "time" ? "s" : kind === "reps" ? "reps" : "kg", baseline: baseline == null ? null : dec(baseline),
    dueOn: p.dueOn || null, note: p.note?.trim().slice(0, 300) || null, createdBy: userId, createdAt: now, updatedAt: now,
  }).returning();
  await audit(db, { actorUserId: userId, action: "self_goal.created", resourceType: "client_goal", resourceId: g.id, meta: { kind } });
  return view(g);
}

/** Cerrar (lograda o cancelada), reabrir, cambiar plazo o nota. Sólo metas propias de la persona; las del coach no. */
export async function updateSelfGoal(userId: string, id: string, p: { status?: "active" | "achieved" | "cancelled"; dueOn?: string | null; note?: string | null }, now = new Date()) {
  const [g] = await db.select().from(clientGoal).where(and(eq(clientGoal.id, id), eq(clientGoal.userId, userId), eq(clientGoal.origin, "self"), isNull(clientGoal.coachClientId)));
  if (!g) throw NF();
  if (p.dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn) || p.dueOn < localDate(now))) throw new AccessError("invalid", "El plazo no puede ser anterior a hoy.");
  const set: Partial<typeof clientGoal.$inferInsert> = { updatedAt: now };
  if (p.status) { set.status = p.status; set.closedAt = p.status === "active" ? null : now; }
  if (p.dueOn !== undefined) set.dueOn = p.dueOn || null;
  if (p.note !== undefined) set.note = p.note?.trim().slice(0, 300) || null;
  const [u] = await db.update(clientGoal).set(set).where(and(eq(clientGoal.id, id), eq(clientGoal.userId, userId))).returning();
  await audit(db, { actorUserId: userId, action: p.status && p.status !== g.status ? `self_goal.${p.status}` : "self_goal.updated", resourceType: "client_goal", resourceId: id });
  return view(u);
}

/** Para el contexto de otros módulos: ids de metas propias por ejercicio (activas). */
export async function activeSelfGoalExercises(userId: string) {
  const rows = await db.select({ ex: clientGoal.exerciseId }).from(clientGoal).where(and(eq(clientGoal.userId, userId), eq(clientGoal.status, "active"), inArray(clientGoal.kind, ["load", "e1rm", "reps", "time"])));
  return new Set(rows.map((r) => r.ex).filter((x): x is string => !!x));
}
