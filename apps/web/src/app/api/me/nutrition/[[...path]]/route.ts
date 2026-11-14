// REPI Nutrition Intelligence 1.0 (D221). Todo es de la persona con sesión: no hay parámetro de usuario y cada servicio filtra
// por su id (un id ajeno responde 404). Módulo apagado para la persona: 404. Menor o edad desconocida: 403.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import { localDate } from "@repi/domain";
import * as nu from "@/server/nutrition/services";
import { lookupBarcode } from "@/server/nutrition/barcode";
import { nutritionState, requireNutrition } from "@/server/nutrition/gate";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const meal = z.enum(["desayuno", "almuerzo", "merienda", "cena", "colacion", "otra"]);
const unit = z.union([z.enum(["g", "ml", "unidad", "porcion"]), z.string().regex(/^portion:\d{1,2}$/)]) as z.ZodType<nu.EntryView["quantity"]["unit"]>;
const quantity = z.object({ amount: z.number().positive().max(5000), unit }).strict();
const ref = z.object({ kind: z.enum(["catalog", "custom", "recipe", "barcode"]), id: z.string().min(1).max(80) }).strict();
const num = z.number().min(0).max(50_000).nullable().optional();
const values = z.object({ energyKcal: num, proteinG: num, carbsG: num, fatG: num, fiberG: num, sugarsG: num, satFatG: num, sodiumMg: num }).strict();
const customFood = z.object({ name: z.string().max(80), brand: z.string().max(60).nullable().optional(), barcode: z.string().max(20).nullable().optional(), basisAmount: z.number().positive().max(5000), basisUnit: z.enum(["g", "ml", "unidad", "porcion"]), basisGrams: z.number().positive().max(5000).nullable().optional(), values }).strict();
const recipe = z.object({ name: z.string().max(80), ingredients: z.array(z.object({ ref, quantity }).strict()).min(1).max(40), servings: z.number().positive().max(50).nullable().optional(), finalWeightG: z.number().positive().max(20_000).nullable().optional() }).strict();
const target = z.object({ value: z.number(), mode: z.enum(["min", "approx", "max"]) }).strict();
const shortList = z.array(z.string().max(40)).max(20).optional();
const prefs = z.object({ likes: shortList, avoid: shortList, choices: shortList, mealsPerDay: z.number().int().min(1).max(10).nullable().optional(), schedule: z.string().max(120).nullable().optional(), cooking: z.enum(["none", "some", "often"]).nullable().optional(), budget: z.enum(["tight", "medium", "flexible"]).nullable().optional(), culture: z.string().max(120).nullable().optional(), difficulties: shortList }).strict();
const profile = z.object({ goal: z.enum(nu.NUTRITION_GOALS).nullable().optional(), prefs: prefs.optional(), targets: z.object({ energyKcal: target.optional(), proteinG: target.optional(), carbsG: target.optional(), fatG: target.optional() }).strict().nullable().optional(), targetSource: z.enum(["self", "professional"]).nullable().optional(), reminders: z.boolean().optional(), proactive: z.boolean().optional(), onboarded: z.boolean().optional() }).strict();

export const GET = handle<Ctx>(async (req, { params }) => {
  const [a, b] = (await params).path ?? [];
  const me = await sessionUserId();
  const u = new URL(req.url);
  if (a === "state") return nutritionState(me);
  if (a === "day") return nu.myDay(me, day.parse(b ?? localDate(new Date())));
  if (a === "progress") return nu.myProgress(me, day.parse(u.searchParams.get("from")), day.parse(u.searchParams.get("to")));
  if (a === "foods" && b === "recent") return nu.recentFoods(me);
  if (a === "foods" && b === "mine") return nu.myFoods(me);
  if (a === "foods" && !b) { await limit(`nutrition-search:${me}`, 120); return nu.searchFood(me, u.searchParams.get("q") ?? ""); }
  if (a === "barcode" && b) { await requireNutrition(me); await limit(`nutrition-barcode:${me}`, 12); return lookupBarcode(z.string().max(20).parse(b)); }
  if (a === "recipes") return nu.myRecipes(me);
  if (a === "favorites") return nu.myFavorites(me);
  if (a === "profile") return nu.myProfile(me);
  throw NF();
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const [a, b, c] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`nutrition:${me}`, 120);
  if (a === "entries" && !b) return nu.addEntry(me, await body(req, z.object({ id: z.string().max(64), day, meal, ref, quantity }).strict()));
  if (a === "entries" && b && c === "refresh") return nu.refreshEntry(me, id.parse(b), (await body(req, z.object({ revision: z.number().int().positive() }).strict())).revision);
  if (a === "entries" && b && !c) return nu.updateEntry(me, id.parse(b), await body(req, z.object({ revision: z.number().int().positive(), quantity: quantity.optional(), meal: meal.optional(), day: day.optional() }).strict()));
  if (a === "copy") return nu.copyEntries(me, await body(req, z.object({ opId: z.string().max(64), fromDay: day, toDay: day, fromMeal: meal.nullable().optional(), toMeal: meal.nullable().optional() }).strict()));
  if (a === "day" && b) return nu.setDayComplete(me, day.parse(b), (await body(req, z.object({ complete: z.boolean() }).strict())).complete);
  if (a === "parse") { await limit(`nutrition-parse:${me}`, 30); return nu.parseText(me, (await body(req, z.object({ text: z.string().min(1).max(400) }).strict())).text); }
  if (a === "foods" && !b) return nu.createFood(me, await body(req, customFood));
  if (a === "foods" && b) return nu.updateFood(me, id.parse(b), await body(req, customFood));
  if (a === "recipes") return nu.saveRecipe(me, b ? id.parse(b) : null, await body(req, recipe));
  if (a === "favorites" && !b) return nu.saveFavorite(me, await body(req, z.object({ name: z.string().max(60), day, meal }).strict()));
  if (a === "favorites" && b && c === "apply") return nu.applyFavorite(me, id.parse(b), await body(req, z.object({ opId: z.string().max(64), day, meal }).strict()));
  if (a === "profile") return nu.saveProfile(me, await body(req, profile));
  throw NF();
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const [a, b] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`nutrition:${me}`, 120);
  if (a === "entries" && b) return nu.deleteEntry(me, id.parse(b));
  if (a === "foods" && b) return nu.deleteFood(me, id.parse(b));
  if (a === "recipes" && b) return nu.deleteRecipe(me, id.parse(b));
  if (a === "favorites" && b) return nu.deleteFavorite(me, id.parse(b));
  throw NF();
});
