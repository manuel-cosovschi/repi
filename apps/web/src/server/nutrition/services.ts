// REPI Nutrition Intelligence 1.0 (D221) — diario, biblioteca, alimentos propios, recetas, favoritos, días y perfil.
// Privacidad: todo filtra por el id de la sesión; un id ajeno responde 404. No hay org_id: el gimnasio, el personal de sala y
// REPI Admin no leen estas tablas. Auditoría sin contenido (nunca alimentos ni valores).
// Cálculo: el servidor resuelve la copia de valores desde la fuente (nunca confía en valores enviados por el cliente) y
// calcula con el motor determinístico de @repi/domain. Sin IA.
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  basisFactor, catalogSnapshot, dayRange, dayStatus, describePeriod, emptyNutrients, gramsOf, isIsoDay, isMeal, localDate, mergeTotals, nutrientsFor,
  NutritionCalcError, parseFoodText, periodSummary, recipeBasis, searchFoods, sumNutrients, targetConsistency, validateTargets, withEnergy,
  INSUFFICIENT_DAY, MEALS, NUTRIENT_KEYS, PARTIAL_DAY_NOTE, PARSE_ISSUE_TEXT,
  type DayLog, type FoodSnapshot, type Meal, type Nutrients, type NutritionTargets, type Quantity, type TargetSource, type Totals,
} from "@repi/domain";
import { FOODS, FOODS_VERSION } from "@repi/domain/nutrition/foods";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireNutrition } from "./gate";
import { offSnapshot } from "./barcode";

const { nutritionEntry, nutritionDay, nutritionFood, nutritionRecipe, nutritionFavorite, nutritionProfile, workoutSession } = schema;
const NF = (what = "lo que buscás") => new AccessError("not_found", `No encontramos ${what}.`, 404);
export const MAX_ENTRIES_PER_DAY = 120;
export const MAX_CUSTOM_FOODS = 500;
export const MAX_RECIPES = 200;
export const MAX_FAVORITES = 100;
const BY_SLUG = new Map(FOODS.map((f) => [f.slug, f]));

// ── Validación de fechas y cantidades ──
function checkDay(day: string, now: Date) {
  if (!isIsoDay(day) || day < "2020-01-01") throw new AccessError("invalid", "Elegí una fecha válida.");
  if (day > localDate(now)) throw new AccessError("invalid", "La fecha no puede ser futura.");
}
const calc = <T>(f: () => T): T => {
  try { return f(); } catch (e) { if (e instanceof NutritionCalcError) throw new AccessError(e.code, e.message, 422); throw e; }
};
const cleanValues = (v: Partial<Record<string, unknown>>): Nutrients => {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) {
    const x = v[k];
    if (x == null || x === "") continue;
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0 || n > (k === "energyKcal" ? 10_000 : k === "sodiumMg" ? 50_000 : 1000)) throw new AccessError("invalid", "Revisá los valores nutricionales: tienen que ser números positivos.");
    out[k] = n;
  }
  return out;
};

// ── Referencias a alimentos: la copia de valores siempre la arma el servidor ──
export type FoodRef = { kind: "catalog" | "custom" | "recipe" | "barcode"; id: string };

function customSnapshot(f: typeof nutritionFood.$inferSelect): FoodSnapshot {
  const { values, energy } = withEnergy(cleanValues(f.values));
  return {
    kind: "custom", refId: f.id, name: f.brand ? `${f.name} (${f.brand})` : f.name, state: "na",
    basis: { amount: f.basisAmount, unit: f.basisUnit as FoodSnapshot["basis"]["unit"], grams: f.basisGrams },
    values, energy, portions: [],
    source: { id: "repi-user", label: "Cargado por vos", version: `v${f.revision}`, sourceId: f.id },
  };
}

type Ingredient = { ref: FoodRef; quantity: Quantity; food: FoodSnapshot; nutrients: Nutrients; grams: number | null };
function recipeSnapshot(r: typeof nutritionRecipe.$inferSelect): FoodSnapshot {
  const ing = r.ingredients as Ingredient[];
  const b = recipeBasis(ing.map((i) => i.nutrients), { servings: r.servings, finalWeightG: r.finalWeightG });
  const missing = NUTRIENT_KEYS.filter((k) => b.totals.coverage[k].missing > 0 && b.totals.coverage[k].known > 0);
  return {
    kind: "recipe", refId: r.id, name: r.name, state: "cooked", basis: b.basis, values: b.values,
    energy: b.totals.coverage.energyKcal.missing ? "unknown" : "reported", portions: [],
    source: { id: "repi-recipe", label: "Tu receta", version: `v${r.revision}`, sourceId: r.id },
    note: missing.length ? "Algún ingrediente no informa todos los nutrientes: el total de la receta es parcial." : null,
  };
}

export async function resolveFood(userId: string, ref: FoodRef): Promise<FoodSnapshot> {
  if (ref.kind === "catalog") { const f = BY_SLUG.get(ref.id); if (!f) throw NF("ese alimento"); return catalogSnapshot(f); }
  if (ref.kind === "custom") {
    const [f] = await db.select().from(nutritionFood).where(and(eq(nutritionFood.id, ref.id), eq(nutritionFood.userId, userId)));
    if (!f) throw NF("ese alimento"); return customSnapshot(f);
  }
  if (ref.kind === "recipe") {
    const [r] = await db.select().from(nutritionRecipe).where(and(eq(nutritionRecipe.id, ref.id), eq(nutritionRecipe.userId, userId)));
    if (!r) throw NF("esa receta"); return recipeSnapshot(r);
  }
  const s = await offSnapshot(ref.id);
  if (!s) throw NF("ese producto");
  return s;
}

// ── Búsqueda ──
export async function searchFood(userId: string, q: string) {
  await requireNutrition(userId);
  const query = q.trim().slice(0, 60);
  const catalog = searchFoods(FOODS, query, 15).map((h) => catalogSnapshot(h.food));
  const like = `%${query.replace(/[%_\\]/g, "")}%`;
  const own = query ? (await db.select().from(nutritionFood).where(and(eq(nutritionFood.userId, userId), sql`${nutritionFood.name} ilike ${like}`)).limit(10)).map(customSnapshot) : [];
  const recipes = query ? (await db.select().from(nutritionRecipe).where(and(eq(nutritionRecipe.userId, userId), sql`${nutritionRecipe.name} ilike ${like}`)).limit(10)).map(recipeSnapshot) : [];
  return { results: [...own, ...recipes, ...catalog], version: FOODS_VERSION };
}

/** Alimentos usados en los últimos 30 días, con la última cantidad: para registrar lo frecuente en un toque. */
export async function recentFoods(userId: string, now = new Date()) {
  await requireNutrition(userId);
  const since = localDate(new Date(now.getTime() - 30 * 86_400_000));
  const rows = await db.select().from(nutritionEntry).where(and(eq(nutritionEntry.userId, userId), isNull(nutritionEntry.deletedAt), gte(nutritionEntry.day, since)))
    .orderBy(desc(nutritionEntry.updatedAt)).limit(300);
  const seen = new Map<string, { food: FoodSnapshot; quantity: Quantity; meal: string; uses: number }>();
  for (const r of rows) {
    const f = r.food as unknown as FoodSnapshot, key = `${f.kind}:${f.refId}`;
    const s = seen.get(key);
    if (s) s.uses++; else seen.set(key, { food: f, quantity: { amount: r.qtyAmount, unit: r.qtyUnit as Quantity["unit"] }, meal: r.meal, uses: 1 });
  }
  return { recent: [...seen.values()].sort((a, b) => b.uses - a.uses).slice(0, 20) };
}

/** Texto natural → propuesta editable (nunca se guarda sola). Determinístico, sin IA. */
export async function parseText(userId: string, text: string) {
  await requireNutrition(userId);
  const p = parseFoodText(FOODS, text.slice(0, 400));
  return {
    meal: p.meal,
    items: p.items.map((i) => ({
      text: i.text, query: i.query, quantity: i.quantity, quantityText: i.quantityText,
      candidates: i.candidates.map(catalogSnapshot),
      issues: i.issues.map((code) => ({ code, message: PARSE_ISSUE_TEXT[code] })),
    })),
  };
}

// ── Diario ──
const entryView = (e: typeof nutritionEntry.$inferSelect) => ({
  id: e.id, day: e.day, meal: e.meal as Meal, food: e.food as unknown as FoodSnapshot, quantity: { amount: e.qtyAmount, unit: e.qtyUnit as Quantity["unit"] },
  grams: e.grams, nutrients: e.nutrients as Nutrients, revision: e.revision, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(),
});
export type EntryView = ReturnType<typeof entryView>;

const ENTRY_ID = /^[A-Za-z0-9_-]{8,64}$/;
/**
 * Alta idempotente: el id lo genera el teléfono. Reintentar el mismo id con los mismos datos no duplica; un id que ya existe
 * se trata como edición con control de revisión. Un id borrado no se resucita.
 */
export async function addEntry(userId: string, p: { id: string; day: string; meal: string; ref: FoodRef; quantity: Quantity }, now = new Date()) {
  await requireNutrition(userId, now);
  if (!ENTRY_ID.test(p.id)) throw new AccessError("invalid", "Identificador inválido.");
  if (!isMeal(p.meal)) throw new AccessError("invalid", "Elegí la comida del día.");
  checkDay(p.day, now);
  const food = await resolveFood(userId, p.ref);
  const nutrients = calc(() => nutrientsFor(food, p.quantity));
  const grams = gramsOf(food, p.quantity);
  const existing = async () => {
    const [prev] = await db.select().from(nutritionEntry).where(eq(nutritionEntry.id, p.id));
    if (!prev || prev.userId !== userId) throw new AccessError("conflict", "Ese registro ya existe.", 409);
    return prev.deletedAt ? { entry: null, deleted: true, duplicate: true } : { entry: entryView(prev), duplicate: true };
  };
  // Un reintento de un id ya guardado se confirma aunque el día esté lleno (la respuesta original pudo perderse).
  const [seen] = await db.select({ id: nutritionEntry.id }).from(nutritionEntry).where(eq(nutritionEntry.id, p.id));
  if (seen) return existing();
  await checkDayLimit(userId, p.day, 1);
  // Alta atómica: con dos pedidos simultáneos con el mismo id (doble toque, reintento), uno inserta y el otro ve el existente.
  const [row] = await db.insert(nutritionEntry).values({
    id: p.id, userId, day: p.day, meal: p.meal, food: food as unknown as Record<string, unknown>, qtyAmount: p.quantity.amount, qtyUnit: p.quantity.unit, grams, nutrients,
  }).onConflictDoNothing().returning();
  if (!row) return existing();
  await audit(db, { actorUserId: userId, action: "nutrition.entry.added", resourceType: "nutrition_entry", resourceId: row.id });
  return { entry: entryView(row), duplicate: false };
}

/**
 * Edición con control de revisión: si el teléfono editó sobre una copia vieja (otra pestaña u otro dispositivo), responde
 * 409 con la copia vigente en vez de pisarla. La cantidad se recalcula con la MISMA copia de valores del registro.
 */
export async function updateEntry(userId: string, id: string, p: { revision: number; quantity?: Quantity; meal?: string; day?: string }, now = new Date()) {
  await requireNutrition(userId, now);
  if (p.meal != null && !isMeal(p.meal)) throw new AccessError("invalid", "Elegí la comida del día.");
  if (p.day != null) checkDay(p.day, now);
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(nutritionEntry).where(and(eq(nutritionEntry.id, id), eq(nutritionEntry.userId, userId))).for("update");
    if (!e || e.deletedAt) throw NF("ese registro");
    if (p.revision !== e.revision) throw new AccessError("stale", "Este registro cambió en otro dispositivo. Revisalo antes de editar.", 409, { entry: entryView(e) });
    const food = e.food as unknown as FoodSnapshot;
    const q = p.quantity ?? { amount: e.qtyAmount, unit: e.qtyUnit as Quantity["unit"] };
    const nutrients = calc(() => nutrientsFor(food, q));
    const [row] = await tx.update(nutritionEntry).set({
      qtyAmount: q.amount, qtyUnit: q.unit, grams: gramsOf(food, q), nutrients, meal: p.meal ?? e.meal, day: p.day ?? e.day, revision: e.revision + 1, updatedAt: now,
    }).where(eq(nutritionEntry.id, id)).returning();
    await audit(tx, { actorUserId: userId, action: "nutrition.entry.updated", resourceType: "nutrition_entry", resourceId: id });
    return { entry: entryView(row) };
  });
}

/** Corrección explícita: reemplaza la copia de valores por la versión vigente de la fuente (queda en la revisión). */
export async function refreshEntry(userId: string, id: string, revision: number, now = new Date()) {
  await requireNutrition(userId, now);
  const [e] = await db.select().from(nutritionEntry).where(and(eq(nutritionEntry.id, id), eq(nutritionEntry.userId, userId)));
  if (!e || e.deletedAt) throw NF("ese registro");
  const old = e.food as unknown as FoodSnapshot;
  const food = await resolveFood(userId, { kind: old.kind, id: old.refId });
  const q = { amount: e.qtyAmount, unit: e.qtyUnit as Quantity["unit"] };
  const nutrients = calc(() => nutrientsFor(food, q));
  return db.transaction(async (tx) => {
    const [row] = await tx.update(nutritionEntry).set({ food: food as unknown as Record<string, unknown>, nutrients, grams: gramsOf(food, q), revision: revision + 1, updatedAt: now })
      .where(and(eq(nutritionEntry.id, id), eq(nutritionEntry.userId, userId), eq(nutritionEntry.revision, revision))).returning();
    if (!row) throw new AccessError("stale", "Este registro cambió en otro dispositivo.", 409);
    await audit(tx, { actorUserId: userId, action: "nutrition.entry.corrected", resourceType: "nutrition_entry", resourceId: id });
    return { entry: entryView(row), changed: JSON.stringify(old.values) !== JSON.stringify(food.values) };
  });
}

/** Borrado idempotente con marca (para que una sincronización atrasada no lo resucite). */
export async function deleteEntry(userId: string, id: string, now = new Date()) {
  await requireNutrition(userId, now);
  const [e] = await db.select().from(nutritionEntry).where(and(eq(nutritionEntry.id, id), eq(nutritionEntry.userId, userId)));
  if (!e) throw NF("ese registro");
  if (e.deletedAt) return { deleted: true, duplicate: true };
  await db.update(nutritionEntry).set({ deletedAt: now, updatedAt: now, revision: e.revision + 1 }).where(eq(nutritionEntry.id, id));
  await audit(db, { actorUserId: userId, action: "nutrition.entry.deleted", resourceType: "nutrition_entry", resourceId: id });
  return { deleted: true, duplicate: false };
}

async function checkDayLimit(userId: string, day: string, adding: number) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(nutritionEntry).where(and(eq(nutritionEntry.userId, userId), eq(nutritionEntry.day, day), isNull(nutritionEntry.deletedAt)));
  if (n + adding > MAX_ENTRIES_PER_DAY) throw new AccessError("limit", "Llegaste al máximo de registros de un día.", 409);
}

/** Id derivado (idempotente): repetir la misma copia no duplica aunque el teléfono reintente. */
const derivedId = (opId: string, src: string) => `c${createHash("sha256").update(`${opId}:${src}`).digest("base64url").slice(0, 31)}`;

/** Copia registros de un día/comida a otro («Copiar de ayer», «Repetir comida»). Mantiene la copia de valores original. */
export async function copyEntries(userId: string, p: { opId: string; fromDay: string; toDay: string; fromMeal?: string | null; toMeal?: string | null }, now = new Date()) {
  await requireNutrition(userId, now);
  checkDay(p.fromDay, now); checkDay(p.toDay, now);
  if (!ENTRY_ID.test(p.opId)) throw new AccessError("invalid", "Identificador inválido.");
  if ((p.fromMeal && !isMeal(p.fromMeal)) || (p.toMeal && !isMeal(p.toMeal))) throw new AccessError("invalid", "Elegí la comida del día.");
  const src = await db.select().from(nutritionEntry).where(and(eq(nutritionEntry.userId, userId), eq(nutritionEntry.day, p.fromDay), isNull(nutritionEntry.deletedAt),
    ...(p.fromMeal ? [eq(nutritionEntry.meal, p.fromMeal)] : []))).orderBy(asc(nutritionEntry.createdAt));
  if (!src.length) throw new AccessError("empty", "No hay comidas registradas para copiar.", 409);
  const [already] = await db.select({ id: nutritionEntry.id }).from(nutritionEntry).where(eq(nutritionEntry.id, derivedId(p.opId, src[0].id)));
  if (!already) await checkDayLimit(userId, p.toDay, src.length);
  const rows = src.map((e) => ({ id: derivedId(p.opId, e.id), userId, day: p.toDay, meal: p.toMeal ?? e.meal, food: e.food, qtyAmount: e.qtyAmount, qtyUnit: e.qtyUnit, grams: e.grams, nutrients: e.nutrients }));
  const ins = await db.insert(nutritionEntry).values(rows).onConflictDoNothing().returning();
  await audit(db, { actorUserId: userId, action: "nutrition.entry.copied", resourceType: "nutrition_day", meta: { n: ins.length } });
  return { entries: ins.map(entryView), duplicate: ins.length === 0 };
}

/** Día completo o no: sólo la persona lo marca. */
export async function setDayComplete(userId: string, day: string, complete: boolean, now = new Date()) {
  await requireNutrition(userId, now);
  checkDay(day, now);
  await db.insert(nutritionDay).values({ userId, day, complete, updatedAt: now }).onConflictDoUpdate({ target: [nutritionDay.userId, nutritionDay.day], set: { complete, updatedAt: now } });
  return { day, complete };
}

// ── Vista del día ──
async function entriesBetween(userId: string, from: string, to: string) {
  return db.select().from(nutritionEntry).where(and(eq(nutritionEntry.userId, userId), isNull(nutritionEntry.deletedAt), gte(nutritionEntry.day, from), lte(nutritionEntry.day, to)))
    .orderBy(asc(nutritionEntry.day), asc(nutritionEntry.createdAt)).limit(20_000);
}
async function daysBetween(userId: string, from: string, to: string) {
  const rows = await db.select().from(nutritionDay).where(and(eq(nutritionDay.userId, userId), gte(nutritionDay.day, from), lte(nutritionDay.day, to)));
  return new Map(rows.map((r) => [r.day, r.complete]));
}

export function buildDays(days: string[], entries: (typeof nutritionEntry.$inferSelect)[], complete: Map<string, boolean>): DayLog[] {
  const byDay = new Map<string, Nutrients[]>();
  const meals = new Map<string, Set<string>>();
  for (const e of entries) {
    (byDay.get(e.day) ?? byDay.set(e.day, []).get(e.day)!).push(e.nutrients as Nutrients);
    (meals.get(e.day) ?? meals.set(e.day, new Set()).get(e.day)!).add(e.meal);
  }
  return days.map((d) => ({ day: d, markedComplete: complete.get(d) ?? false, totals: sumNutrients(byDay.get(d) ?? []), meals: meals.get(d)?.size ?? 0 }));
}

export async function myDay(userId: string, day: string, now = new Date()) {
  await requireNutrition(userId, now);
  checkDay(day, now);
  const entries = await entriesBetween(userId, day, day);
  const complete = (await daysBetween(userId, day, day)).get(day) ?? false;
  const meals = MEALS.map((m) => {
    const es = entries.filter((e) => e.meal === m);
    return { meal: m, entries: es.map(entryView), totals: sumNutrients(es.map((e) => e.nutrients as Nutrients)) };
  }).filter((m) => m.entries.length);
  const totals: Totals = mergeTotals(meals.map((m) => m.totals));
  const status = dayStatus({ markedComplete: complete, totals });
  const profile = await getProfile(userId);
  return {
    day, status, complete, meals, totals, targets: profile.targets, targetSource: profile.targetSource,
    note: status === "empty" ? null : status === "partial" ? (meals.length <= 1 ? INSUFFICIENT_DAY : PARTIAL_DAY_NOTE) : null,
  };
}

// ── Progreso (con entrenamientos del período, descriptivo) ──
export async function myProgress(userId: string, from: string, to: string, now = new Date()) {
  await requireNutrition(userId, now);
  checkDay(from, now); checkDay(to, now);
  const range = dayRange(from, to);
  if (!range.length) throw new AccessError("invalid", "Elegí un período válido.");
  const [entries, complete] = await Promise.all([entriesBetween(userId, from, to), daysBetween(userId, from, to)]);
  const days = buildDays(range, entries, complete);
  const summary = periodSummary(days);
  // Entrenamientos completados por día local (Buenos Aires). Sólo se muestran juntos; ninguno modifica al otro.
  const ws = await db.select({ startedAt: workoutSession.startedAt }).from(workoutSession).where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"),
    gte(workoutSession.startedAt, new Date(`${from}T00:00:00-03:00`)), lte(workoutSession.startedAt, new Date(`${to}T23:59:59-03:00`))));
  const trainedDays = new Map<string, number>();
  for (const w of ws) { const d = localDate(w.startedAt); trainedDays.set(d, (trainedDays.get(d) ?? 0) + 1); }
  const profile = await getProfile(userId);
  const t = profile.targets as NutritionTargets;
  const consistency = Object.fromEntries((Object.keys(t) as (keyof NutritionTargets)[]).map((k) => [k, targetConsistency(days, k, t[k]!)]));
  const mealsDist = Object.fromEntries(MEALS.map((m) => [m, new Set(entries.filter((e) => e.meal === m).map((e) => e.day)).size]));
  return {
    from, to,
    days: days.map((d) => ({ day: d.day, status: dayStatus(d), totals: d.totals, meals: d.meals, workouts: trainedDays.get(d.day) ?? 0 })),
    summary: { ...summary, totals: undefined },
    workouts: ws.length,
    sentence: describePeriod(summary, ws.length),
    targets: t, consistency, mealsDist,
  };
}

// ── Perfil nutricional ──
export const NUTRITION_GOALS = ["habits", "organize", "track", "protein", "strength", "sport", "professional"] as const;
export async function getProfile(userId: string) {
  const [p] = await db.select().from(nutritionProfile).where(eq(nutritionProfile.userId, userId));
  return {
    goal: p?.goal ?? null, prefs: (p?.prefs ?? {}) as Record<string, unknown>, targets: (p?.targets ?? {}) as NutritionTargets, targetSource: (p?.targetSource ?? null) as TargetSource | null,
    reminders: p?.reminders ?? false, proactive: p?.proactive ?? false, onboarded: !!p?.onboardedAt, revision: p?.revision ?? 0,
  };
}
export async function myProfile(userId: string) { await requireNutrition(userId); return getProfile(userId); }

const PREF_KEYS = ["likes", "avoid", "choices", "mealsPerDay", "schedule", "cooking", "budget", "culture", "difficulties"] as const;
export async function saveProfile(userId: string, p: { goal?: string | null; prefs?: Record<string, unknown>; targets?: NutritionTargets | null; targetSource?: TargetSource | null; reminders?: boolean; proactive?: boolean; onboarded?: boolean }, now = new Date()) {
  await requireNutrition(userId, now);
  if (p.goal != null && !(NUTRITION_GOALS as readonly string[]).includes(p.goal)) throw new AccessError("invalid", "Elegí un objetivo de la lista.");
  const prev = await getProfile(userId);
  let targets = prev.targets, targetSource = prev.targetSource, targetsSetAt: Date | undefined;
  if (p.targets !== undefined) {
    if (p.targets === null || !Object.keys(p.targets).length) { targets = {}; targetSource = null; }
    else {
      const src = p.targetSource ?? "self";
      const v = validateTargets(p.targets, src);
      if (!v.ok) throw new AccessError("invalid_targets", v.issues[0].message, 422, { issues: v.issues });
      targets = v.targets; targetSource = src;
    }
    targetsSetAt = now;
  }
  const prefs = p.prefs ? Object.fromEntries(PREF_KEYS.filter((k) => p.prefs![k] !== undefined).map((k) => [k, p.prefs![k]])) : prev.prefs;
  if (JSON.stringify(prefs).length > 4000) throw new AccessError("invalid", "Las preferencias son demasiado largas.");
  const values = {
    goal: p.goal === undefined ? prev.goal : p.goal, prefs, targets: targets as Record<string, unknown>, targetSource,
    reminders: p.reminders ?? prev.reminders, proactive: p.proactive ?? prev.proactive, updatedAt: now,
    ...(targetsSetAt ? { targetsSetAt } : {}), ...(p.onboarded ? { onboardedAt: now } : {}),
  };
  await db.insert(nutritionProfile).values({ userId, ...values }).onConflictDoUpdate({ target: nutritionProfile.userId, set: { ...values, revision: sql`${nutritionProfile.revision} + 1` } });
  await audit(db, { actorUserId: userId, action: "nutrition.profile.saved", resourceType: "nutrition_profile", meta: { fields: Object.keys(p) } });
  return getProfile(userId);
}

// ── Alimentos propios ──
export async function myFoods(userId: string) {
  await requireNutrition(userId);
  return { foods: (await db.select().from(nutritionFood).where(eq(nutritionFood.userId, userId)).orderBy(asc(nutritionFood.name))).map(customSnapshot) };
}
type CustomInput = { name: string; brand?: string | null; barcode?: string | null; basisAmount: number; basisUnit: "g" | "ml" | "unidad" | "porcion"; basisGrams?: number | null; values: Partial<Record<string, unknown>> };
function checkCustom(p: CustomInput) {
  const name = p.name.trim();
  if (name.length < 2 || name.length > 80) throw new AccessError("invalid", "Escribí un nombre de 2 a 80 letras.");
  if (!(p.basisAmount > 0 && p.basisAmount <= 5000)) throw new AccessError("invalid", "Indicá la cantidad a la que corresponden los valores.");
  if (p.basisGrams != null && !(p.basisGrams > 0 && p.basisGrams <= 5000)) throw new AccessError("invalid", "El peso tiene que estar entre 1 y 5000 g.");
  const values = cleanValues(p.values);
  if (NUTRIENT_KEYS.every((k) => values[k] == null)) throw new AccessError("invalid", "Cargá al menos un valor (por ejemplo, proteínas). Lo que no sepas, dejalo vacío.");
  return { name, brand: p.brand?.trim().slice(0, 60) || null, barcode: p.barcode?.replace(/\D/g, "").slice(0, 14) || null, basisAmount: p.basisAmount, basisUnit: p.basisUnit, basisGrams: p.basisUnit === "g" ? null : p.basisGrams ?? null, values };
}
export async function createFood(userId: string, p: CustomInput) {
  await requireNutrition(userId);
  const v = checkCustom(p);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(nutritionFood).where(eq(nutritionFood.userId, userId));
  if (n >= MAX_CUSTOM_FOODS) throw new AccessError("limit", "Llegaste al máximo de alimentos propios.", 409);
  const [f] = await db.insert(nutritionFood).values({ userId, ...v }).returning();
  await audit(db, { actorUserId: userId, action: "nutrition.food.created", resourceType: "nutrition_food", resourceId: f.id });
  return { food: customSnapshot(f) };
}
/** Editar un alimento propio no cambia los registros ya hechos (guardan su copia). */
export async function updateFood(userId: string, id: string, p: CustomInput) {
  await requireNutrition(userId);
  const v = checkCustom(p);
  const [f] = await db.update(nutritionFood).set({ ...v, revision: sql`${nutritionFood.revision} + 1`, updatedAt: new Date() }).where(and(eq(nutritionFood.id, id), eq(nutritionFood.userId, userId))).returning();
  if (!f) throw NF("ese alimento");
  return { food: customSnapshot(f) };
}
export async function deleteFood(userId: string, id: string) {
  await requireNutrition(userId);
  const r = await db.delete(nutritionFood).where(and(eq(nutritionFood.id, id), eq(nutritionFood.userId, userId))).returning({ id: nutritionFood.id });
  if (!r.length) throw NF("ese alimento");
  return { deleted: true };
}

// ── Recetas ──
type RecipeInput = { name: string; ingredients: { ref: FoodRef; quantity: Quantity }[]; servings?: number | null; finalWeightG?: number | null };
async function buildIngredients(userId: string, list: RecipeInput["ingredients"]): Promise<Ingredient[]> {
  if (!list.length || list.length > 40) throw new AccessError("invalid", "Una receta lleva entre 1 y 40 ingredientes.");
  const out: Ingredient[] = [];
  for (const i of list) {
    if (i.ref.kind === "recipe") throw new AccessError("invalid", "Una receta no puede tener otra receta como ingrediente.");
    const food = await resolveFood(userId, i.ref);
    out.push({ ref: i.ref, quantity: i.quantity, food, nutrients: calc(() => nutrientsFor(food, i.quantity)), grams: gramsOf(food, i.quantity) });
  }
  return out;
}
const recipeView = (r: typeof nutritionRecipe.$inferSelect) => {
  const ing = r.ingredients as Ingredient[];
  return { id: r.id, name: r.name, servings: r.servings, finalWeightG: r.finalWeightG, revision: r.revision, ingredients: ing, totals: sumNutrients(ing.map((i) => i.nutrients)), food: recipeSnapshot(r) };
};
function checkRecipe(p: RecipeInput) {
  const name = p.name.trim();
  if (name.length < 2 || name.length > 80) throw new AccessError("invalid", "Escribí un nombre de 2 a 80 letras.");
  if (p.servings != null && !(p.servings > 0 && p.servings <= 50)) throw new AccessError("invalid", "Las porciones tienen que estar entre 1 y 50.");
  if (p.finalWeightG != null && !(p.finalWeightG > 0 && p.finalWeightG <= 20_000)) throw new AccessError("invalid", "El peso final tiene que estar entre 1 g y 20 kg.");
  return name;
}
export async function myRecipes(userId: string) {
  await requireNutrition(userId);
  return { recipes: (await db.select().from(nutritionRecipe).where(eq(nutritionRecipe.userId, userId)).orderBy(asc(nutritionRecipe.name))).map(recipeView) };
}
export async function saveRecipe(userId: string, id: string | null, p: RecipeInput) {
  await requireNutrition(userId);
  const name = checkRecipe(p);
  const ingredients = await buildIngredients(userId, p.ingredients);
  const values = { name, ingredients: ingredients as unknown[], servings: p.servings ?? null, finalWeightG: p.finalWeightG ?? null, updatedAt: new Date() };
  if (!id) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(nutritionRecipe).where(eq(nutritionRecipe.userId, userId));
    if (n >= MAX_RECIPES) throw new AccessError("limit", "Llegaste al máximo de recetas.", 409);
    const [r] = await db.insert(nutritionRecipe).values({ userId, ...values }).returning();
    await audit(db, { actorUserId: userId, action: "nutrition.recipe.created", resourceType: "nutrition_recipe", resourceId: r.id });
    return { recipe: recipeView(r) };
  }
  const [r] = await db.update(nutritionRecipe).set({ ...values, revision: sql`${nutritionRecipe.revision} + 1` }).where(and(eq(nutritionRecipe.id, id), eq(nutritionRecipe.userId, userId))).returning();
  if (!r) throw NF("esa receta");
  return { recipe: recipeView(r) };
}
export async function deleteRecipe(userId: string, id: string) {
  await requireNutrition(userId);
  const r = await db.delete(nutritionRecipe).where(and(eq(nutritionRecipe.id, id), eq(nutritionRecipe.userId, userId))).returning({ id: nutritionRecipe.id });
  if (!r.length) throw NF("esa receta");
  return { deleted: true };
}

// ── Favoritos ──
type FavItem = { food: FoodSnapshot; quantity: Quantity };
export async function myFavorites(userId: string) {
  await requireNutrition(userId);
  const rows = await db.select().from(nutritionFavorite).where(eq(nutritionFavorite.userId, userId)).orderBy(desc(nutritionFavorite.uses), asc(nutritionFavorite.name));
  return { favorites: rows.map((f) => ({ id: f.id, name: f.name, meal: f.meal, items: f.items as FavItem[], uses: f.uses, totals: sumNutrients((f.items as FavItem[]).map((i) => calc(() => nutrientsFor(i.food, i.quantity)))) })) };
}
/** Guarda como favorita una comida ya registrada (mismos alimentos y cantidades). */
export async function saveFavorite(userId: string, p: { name: string; day: string; meal: string }, now = new Date()) {
  await requireNutrition(userId, now);
  if (!isMeal(p.meal)) throw new AccessError("invalid", "Elegí la comida del día.");
  const name = p.name.trim();
  if (name.length < 2 || name.length > 60) throw new AccessError("invalid", "Escribí un nombre de 2 a 60 letras.");
  const es = await db.select().from(nutritionEntry).where(and(eq(nutritionEntry.userId, userId), eq(nutritionEntry.day, p.day), eq(nutritionEntry.meal, p.meal), isNull(nutritionEntry.deletedAt)));
  if (!es.length) throw new AccessError("empty", "Esa comida no tiene registros.", 409);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(nutritionFavorite).where(eq(nutritionFavorite.userId, userId));
  if (n >= MAX_FAVORITES) throw new AccessError("limit", "Llegaste al máximo de favoritas.", 409);
  const items: FavItem[] = es.map((e) => ({ food: e.food as unknown as FoodSnapshot, quantity: { amount: e.qtyAmount, unit: e.qtyUnit as Quantity["unit"] } }));
  const [f] = await db.insert(nutritionFavorite).values({ userId, name, meal: p.meal, items }).returning();
  return { favorite: { id: f.id, name: f.name, meal: f.meal, items } };
}
/** Registra una favorita en un día y comida. Idempotente por opId. */
export async function applyFavorite(userId: string, id: string, p: { opId: string; day: string; meal: string }, now = new Date()) {
  await requireNutrition(userId, now);
  checkDay(p.day, now);
  if (!isMeal(p.meal)) throw new AccessError("invalid", "Elegí la comida del día.");
  if (!ENTRY_ID.test(p.opId)) throw new AccessError("invalid", "Identificador inválido.");
  const [f] = await db.select().from(nutritionFavorite).where(and(eq(nutritionFavorite.id, id), eq(nutritionFavorite.userId, userId)));
  if (!f) throw NF("esa favorita");
  const [already] = await db.select({ id: nutritionEntry.id }).from(nutritionEntry).where(eq(nutritionEntry.id, derivedId(p.opId, `${f.id}:0`)));
  if (!already) await checkDayLimit(userId, p.day, (f.items as FavItem[]).length);
  const rows = (f.items as FavItem[]).map((i, k) => ({ id: derivedId(p.opId, `${f.id}:${k}`), userId, day: p.day, meal: p.meal, food: i.food as unknown as Record<string, unknown>, qtyAmount: i.quantity.amount, qtyUnit: i.quantity.unit, grams: gramsOf(i.food, i.quantity), nutrients: calc(() => nutrientsFor(i.food, i.quantity)) }));
  const ins = await db.insert(nutritionEntry).values(rows).onConflictDoNothing().returning();
  if (ins.length) await db.update(nutritionFavorite).set({ uses: sql`${nutritionFavorite.uses} + 1`, lastUsedAt: now }).where(eq(nutritionFavorite.id, id));
  return { entries: ins.map(entryView), duplicate: ins.length === 0 };
}
export async function deleteFavorite(userId: string, id: string) {
  await requireNutrition(userId);
  const r = await db.delete(nutritionFavorite).where(and(eq(nutritionFavorite.id, id), eq(nutritionFavorite.userId, userId))).returning({ id: nutritionFavorite.id });
  if (!r.length) throw NF("esa favorita");
  return { deleted: true };
}

// ── Exportación (todo lo de la persona, sin datos de terceros) ──
export async function exportNutrition(userId: string) {
  const [entries, days, foods, recipes, favorites, profile] = await Promise.all([
    db.select().from(nutritionEntry).where(eq(nutritionEntry.userId, userId)).orderBy(asc(nutritionEntry.day)),
    db.select().from(nutritionDay).where(eq(nutritionDay.userId, userId)),
    db.select().from(nutritionFood).where(eq(nutritionFood.userId, userId)),
    db.select().from(nutritionRecipe).where(eq(nutritionRecipe.userId, userId)),
    db.select().from(nutritionFavorite).where(eq(nutritionFavorite.userId, userId)),
    db.select().from(nutritionProfile).where(eq(nutritionProfile.userId, userId)),
  ]);
  const strip = <T extends { userId?: string }>(r: T) => { const { userId: _u, ...rest } = r; return rest; };
  return { profile: profile.map(strip)[0] ?? null, entries: entries.map(strip), days: days.map(strip), foods: foods.map(strip), recipes: recipes.map(strip), favorites: favorites.map(strip) };
}

/** Totales de hoy para el asistente y la tarjeta de Inicio (sin listar alimentos). */
export async function todayTotals(userId: string, now = new Date()) {
  const day = localDate(now);
  const es = await entriesBetween(userId, day, day);
  const complete = (await daysBetween(userId, day, day)).get(day) ?? false;
  const totals = sumNutrients(es.map((e) => e.nutrients as Nutrients));
  return { day, totals, status: dayStatus({ markedComplete: complete, totals }), meals: new Set(es.map((e) => e.meal)).size, entries: es.map(entryView) };
}
export { basisFactor, inArray };

/** Vista del coach (D221): el resumen sin comidas; el diario sólo con su permiso. Sin perfil ni preferencias. */
export async function coachNutritionView(userId: string, can: { summary: boolean; journal: boolean }, now = new Date()) {
  const to = localDate(now);
  const from28 = localDate(new Date(now.getTime() - 27 * 86_400_000)), from7 = localDate(new Date(now.getTime() - 6 * 86_400_000));
  const [entries, complete] = await Promise.all([entriesBetween(userId, from28, to), daysBetween(userId, from28, to)]);
  const days28 = buildDays(dayRange(from28, to), entries, complete);
  const profile = await getProfile(userId);
  const t = profile.targets;
  const pack = (days: DayLog[]) => {
    const s = periodSummary(days);
    return {
      days: s.days, loggedDays: s.loggedDays, completeDays: s.completeDays, partialDays: s.partialDays,
      averages: Object.fromEntries((["energyKcal", "proteinG", "carbsG", "fatG"] as const).map((k) => [k, { average: s.trends[k].average, usableDays: s.trends[k].usableDays }])),
      consistency: Object.fromEntries((Object.keys(t) as (keyof NutritionTargets)[]).map((k) => [k, targetConsistency(days, k, t[k]!)])),
    };
  };
  return {
    summaryView: can.summary ? {
      week: pack(days28.filter((d) => d.day >= from7)), month: pack(days28),
      targets: t, targetSource: profile.targetSource,
      series: days28.map((d) => ({ day: d.day, status: dayStatus(d), proteinG: d.totals.values.proteinG, energyKcal: d.totals.values.energyKcal, complete: dayStatus(d) === "complete" })),
    } : null,
    journalView: can.journal ? {
      days: buildDays(dayRange(localDate(new Date(now.getTime() - 13 * 86_400_000)), to), entries, complete).filter((d) => d.totals.items > 0).reverse().map((d) => ({
        day: d.day, status: dayStatus(d), totals: d.totals,
        meals: MEALS.map((m) => ({ meal: m, entries: entries.filter((e) => e.day === d.day && e.meal === m).map((e) => ({ name: (e.food as { name: string }).name, quantity: { amount: e.qtyAmount, unit: e.qtyUnit }, grams: e.grams, nutrients: e.nutrients as Nutrients })) })).filter((m) => m.entries.length),
      })),
    } : null,
  };
}
