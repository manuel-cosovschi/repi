// Body Weight Tracking (PP1, D199). Peso corporal y objetivo de la propia persona. Privacidad (bloqueante):
// - Sólo su dueño lee y escribe. Ninguna ruta de coach, gimnasio, Club, ranking ni REPI Admin lee estas tablas; el
//   consentimiento «medidas corporales» (D117) sigue sin ofrecerse (módulo `body` apagado) y no da acceso a esto.
// - Un id ajeno responde 404, igual que uno inexistente.
// - Una medición por día: guardar otro valor ese día lo reemplaza (no hay duplicados por doble toque ni por reintentos).
// - Sólo adultos (D203): menores de 18, no en 1.0 (hace falta una política con el adulto responsable); edad desconocida
//   (sin fecha de nacimiento) tampoco: nunca se supone adulta. Se ofrece declararla una vez (declareBirthDate). API: 403.
// - Auditoría sin valores: sólo qué acción se hizo (nunca el peso).
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { ageEligibility, bodyGoalProgress, isIsoDay, localDate, rangeStart, weightSummary, bodyWeightOk, type ProgressRange } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { bodyWeightEntry, bodyGoal, user } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos esa medición.", 404);
export const BODY_MAX_ENTRIES = 3000; // ~8 años con una medición por día

/** Elegibilidad para funciones sólo de adultos: «adult», «minor» o «unknown» (sin fecha de nacimiento válida). */
export async function bodyEligibility(userId: string, now = new Date()) {
  const [u] = await db.select({ birth: user.birthDate }).from(user).where(eq(user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  return ageEligibility(u.birth, localDate(now));
}
/** Sólo adultos confirmados. Menor: 403 minor_restricted. Edad desconocida: 403 age_required (la app ofrece declararla). */
export async function requireAdult(userId: string, what: string, now = new Date()) {
  const e = await bodyEligibility(userId, now);
  if (e === "minor") throw new AccessError("minor_restricted", `${what} no está disponible para menores de 18 años.`, 403);
  if (e === "unknown") throw new AccessError("age_required", `Para usar ${what.toLowerCase()} confirmá tu fecha de nacimiento.`, 403);
}
async function requireBodyAllowed(userId: string, now: Date) {
  await requireAdult(userId, "El seguimiento corporal", now);
}
function checkDay(day: string, now: Date) {
  if (!isIsoDay(day) || day < "1990-01-01") throw new AccessError("invalid", "Elegí una fecha válida.");
  if (day > localDate(new Date(now.getTime() + 86_400_000))) throw new AccessError("invalid", "La fecha no puede ser futura.");
}
function checkWeight(g: number) {
  if (!bodyWeightOk(g)) throw new AccessError("invalid", "Ingresá un peso entre 20 y 400 kg.");
}
const view = (e: typeof bodyWeightEntry.$inferSelect) => ({ id: e.id, day: e.measuredOn, weightG: e.weightG, source: e.source, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(), edited: e.updatedAt.getTime() - e.createdAt.getTime() > 1000 });

/** Mediciones del período, el objetivo y el progreso hacia la meta (siempre contra el historial completo). */
export async function myBody(userId: string, range: ProgressRange, now = new Date()) {
  const elig = await bodyEligibility(userId, now);
  if (elig !== "adult") return { available: false as const, reason: elig === "minor" ? "minor" as const : "age_unknown" as const };
  const all = await db.select().from(bodyWeightEntry).where(eq(bodyWeightEntry.userId, userId)).orderBy(asc(bodyWeightEntry.measuredOn)).limit(BODY_MAX_ENTRIES);
  const [goal] = await db.select().from(bodyGoal).where(eq(bodyGoal.userId, userId));
  const from = rangeStart(range, localDate(now));
  const entries = (from ? all.filter((e) => e.measuredOn >= from) : all).map(view);
  const first = all[0] ?? null, last = all[all.length - 1] ?? null;
  const start = goal?.startSource === "manual" && goal.startWeightG != null && goal.startOn ? { day: goal.startOn, weightG: goal.startWeightG, source: "manual" as const }
    : first ? { day: first.measuredOn, weightG: first.weightG, source: "first_entry" as const } : null;
  return {
    available: true as const, range, from, entries,
    summary: weightSummary(entries.map((e) => ({ day: e.day, weightG: e.weightG }))),
    current: last ? { day: last.measuredOn, weightG: last.weightG } : null,
    goal: goal ? { targetG: goal.targetWeightG, targetOn: goal.targetOn, startSource: goal.startSource, revision: goal.revision, updatedAt: goal.updatedAt.toISOString() } : null,
    start,
    progress: goal ? bodyGoalProgress({ startG: start?.weightG ?? null, currentG: last?.weightG ?? null, targetG: goal.targetWeightG }) : null,
  };
}

/** Guarda la medición del día. Si ya había una ese día, la reemplaza (lo dice `replaced`). Idempotente ante reintentos. */
export async function saveWeight(userId: string, p: { day: string; weightG: number }, now = new Date()) {
  await requireBodyAllowed(userId, now);
  checkDay(p.day, now); checkWeight(p.weightG);
  return db.transaction(async (tx) => {
    const [prev] = await tx.select().from(bodyWeightEntry).where(and(eq(bodyWeightEntry.userId, userId), eq(bodyWeightEntry.measuredOn, p.day))).for("update");
    const [{ n }] = prev ? [{ n: 0 }] : await tx.select({ n: sql<number>`count(*)::int` }).from(bodyWeightEntry).where(eq(bodyWeightEntry.userId, userId));
    if (n >= BODY_MAX_ENTRIES) throw new AccessError("limit", "Llegaste al máximo de mediciones guardadas.", 409);
    const [row] = await tx.insert(bodyWeightEntry).values({ userId, measuredOn: p.day, weightG: p.weightG })
      .onConflictDoUpdate({ target: [bodyWeightEntry.userId, bodyWeightEntry.measuredOn], set: { weightG: p.weightG, updatedAt: now } }).returning();
    return { entry: view(row), replaced: !!prev && prev.weightG !== p.weightG, unchanged: !!prev && prev.weightG === p.weightG };
  });
}

export async function updateWeight(userId: string, id: string, p: { day?: string; weightG?: number }, now = new Date()) {
  await requireBodyAllowed(userId, now);
  const [e] = await db.select().from(bodyWeightEntry).where(and(eq(bodyWeightEntry.id, id), eq(bodyWeightEntry.userId, userId)));
  if (!e) throw NOT_FOUND();
  const day = p.day ?? e.measuredOn, weightG = p.weightG ?? e.weightG;
  checkDay(day, now); checkWeight(weightG);
  if (day !== e.measuredOn) {
    const [clash] = await db.select({ id: bodyWeightEntry.id }).from(bodyWeightEntry).where(and(eq(bodyWeightEntry.userId, userId), eq(bodyWeightEntry.measuredOn, day), ne(bodyWeightEntry.id, id)));
    if (clash) throw new AccessError("conflict", "Ya tenés una medición ese día. Editá esa o elegí otra fecha.", 409);
  }
  const [row] = await db.update(bodyWeightEntry).set({ measuredOn: day, weightG, updatedAt: now }).where(and(eq(bodyWeightEntry.id, id), eq(bodyWeightEntry.userId, userId))).returning();
  return { entry: view(row) };
}

export async function deleteWeight(userId: string, id: string) {
  const del = await db.delete(bodyWeightEntry).where(and(eq(bodyWeightEntry.id, id), eq(bodyWeightEntry.userId, userId))).returning({ id: bodyWeightEntry.id });
  if (!del.length) throw NOT_FOUND();
  await audit(db, { actorUserId: userId, action: "body.weight_deleted", resourceType: "body_weight_entry", resourceId: id });
  return { ok: true };
}

/** Objetivo vigente. `start` opcional: punto de partida histórico indicado por la persona (si no, la primera medición). */
export async function setGoal(userId: string, p: { targetG: number; targetOn?: string | null; start?: { day: string; weightG: number } | null }, now = new Date()) {
  await requireBodyAllowed(userId, now);
  checkWeight(p.targetG);
  if (p.targetOn != null && (!isIsoDay(p.targetOn) || p.targetOn < localDate(now))) throw new AccessError("invalid", "La fecha objetivo tiene que ser hoy o más adelante.");
  if (p.start) { checkDay(p.start.day, now); checkWeight(p.start.weightG); }
  const vals = { targetWeightG: p.targetG, targetOn: p.targetOn ?? null, startSource: p.start ? "manual" as const : "first_entry" as const, startWeightG: p.start?.weightG ?? null, startOn: p.start?.day ?? null, updatedAt: now };
  const [row] = await db.insert(bodyGoal).values({ userId, ...vals }).onConflictDoUpdate({ target: bodyGoal.userId, set: { ...vals, revision: sql`${bodyGoal.revision} + 1` } }).returning();
  await audit(db, { actorUserId: userId, action: "body.goal_set", resourceType: "body_goal", resourceId: userId, meta: { revision: row.revision, startSource: row.startSource } });
  return { goal: { targetG: row.targetWeightG, targetOn: row.targetOn, startSource: row.startSource, revision: row.revision } };
}

export async function clearGoal(userId: string) {
  await db.delete(bodyGoal).where(eq(bodyGoal.userId, userId));
  await audit(db, { actorUserId: userId, action: "body.goal_cleared", resourceType: "body_goal", resourceId: userId });
  return { ok: true };
}

/** Mediciones hasta una fecha (para calorías): sólo del dueño, ordenadas. */
export const weightsUpTo = (userId: string, day: string, sinceDay: string) =>
  db.select({ day: bodyWeightEntry.measuredOn, weightG: bodyWeightEntry.weightG }).from(bodyWeightEntry)
    .where(and(eq(bodyWeightEntry.userId, userId), gte(bodyWeightEntry.measuredOn, sinceDay))).orderBy(asc(bodyWeightEntry.measuredOn))
    .then((r) => r.filter((x) => x.day <= day));
