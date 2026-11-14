// REPI Nutrition Intelligence 1.0 (D221) — servidor contra la base descartable (repi_test). Los números entre corchetes
// remiten a las pruebas obligatorias del máster (§24); las de cálculo puro están en packages/domain/src/nutrition.
process.env.NEXT_PUBLIC_REPI_FEATURES = "nutrition";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as fu from "@/server/followup/services";
import * as nu from "@/server/nutrition/services";
import { nutritionState } from "@/server/nutrition/gate";
import { checkDigit, lookupBarcode, resetBreaker, setOffFetcher } from "@/server/nutrition/barcode";
import { handleMessage } from "@/server/brain/orchestrator";
import { confirmAction } from "@/server/brain/actions";
import { exportMyData } from "@/server/privacy/services";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function person(name = "Persona NU", birth: string | null = "01/01/1990") {
  const email = `nu${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, ...(birth === null ? {} : { birth }) });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; status: number; data?: Record<string, unknown> }; } };
const uid = () => randomUUID().replace(/-/g, "");
const today = () => localDate(new Date());
const yesterday = () => localDate(new Date(Date.now() - 86_400_000));
const cat = (id: string) => ({ kind: "catalog" as const, id });

async function coachWorld() {
  const coach = await person("Coach NU");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach NU ${n}` });
  const u = await person("Alumna NU");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, ["training"]);
  return { coach: coach.id, org: org.id, user: u.id, rel: rel.relationId };
}

beforeEach(() => { resetRateLimits(); resetBreaker(); });
afterEach(() => { setOffFetcher(null); process.env.NEXT_PUBLIC_REPI_FEATURES = "nutrition"; });

describe("registro [1–20]", () => {
  it("[1–7] buscar, elegir, cantidad, porción, agregar, editar y eliminar", async () => {
    const u = await person();
    const s = await nu.searchFood(u.id, "banana");
    expect(s.results[0]).toMatchObject({ kind: "catalog", refId: "banana", source: { id: "usda-sr-legacy" } });
    const id = uid();
    const a = await nu.addEntry(u.id, { id, day: today(), meal: "merienda", ref: cat("banana"), quantity: { amount: 1, unit: "portion:4" } });
    expect(a.entry!.grams).toBeGreaterThan(100);
    expect(a.entry!.nutrients.energyKcal).toBeGreaterThan(80);
    const e = await nu.updateEntry(u.id, id, { revision: 1, quantity: { amount: 150, unit: "g" }, meal: "desayuno" });
    expect(e.entry).toMatchObject({ revision: 2, meal: "desayuno", grams: 150 });
    expect(e.entry.nutrients.carbsG).toBeCloseTo(22.84 * 1.5, 2);
    expect((await nu.deleteEntry(u.id, id)).deleted).toBe(true);
    expect((await nu.myDay(u.id, today())).meals).toHaveLength(0);
  });
  it("[8–9] repetir una comida (copiar de ayer) sin duplicar ante reintentos", async () => {
    const u = await person();
    await nu.addEntry(u.id, { id: uid(), day: yesterday(), meal: "desayuno", ref: cat("avena-cruda"), quantity: { amount: 40, unit: "g" } });
    await nu.addEntry(u.id, { id: uid(), day: yesterday(), meal: "desayuno", ref: cat("leche-entera"), quantity: { amount: 1, unit: "portion:0" } });
    const op = uid();
    const c1 = await nu.copyEntries(u.id, { opId: op, fromDay: yesterday(), toDay: today(), fromMeal: "desayuno" });
    const c2 = await nu.copyEntries(u.id, { opId: op, fromDay: yesterday(), toDay: today(), fromMeal: "desayuno" });
    expect(c1.entries).toHaveLength(2); expect(c2.duplicate).toBe(true);
    const d = await nu.myDay(u.id, today());
    expect(d.meals[0].entries).toHaveLength(2);
    expect(await err(nu.copyEntries(u.id, { opId: uid(), fromDay: today(), toDay: today(), fromMeal: "cena" }))).toMatchObject({ code: "empty" });
  });
  it("[10, 29] receta: total por ingredientes, porción consumida y sin peso final no se consume por gramos", async () => {
    const u = await person();
    const r = await nu.saveRecipe(u.id, null, { name: "Burritos de pollo", servings: 4, finalWeightG: null, ingredients: [
      { ref: cat("pollo-pechuga-cruda"), quantity: { amount: 400, unit: "g" } }, { ref: cat("arroz-blanco-crudo"), quantity: { amount: 150, unit: "g" } }, { ref: cat("queso-crema"), quantity: { amount: 60, unit: "g" } },
    ] });
    const per = r.recipe.food.values.proteinG!;
    expect(per).toBeCloseTo(r.recipe.totals.values.proteinG! / 4, 3);
    const e = await nu.addEntry(u.id, { id: uid(), day: today(), meal: "cena", ref: { kind: "recipe", id: r.recipe.id }, quantity: { amount: 1, unit: "porcion" } });
    expect(e.entry!.nutrients.proteinG).toBeCloseTo(per, 3);
    expect(await err(nu.addEntry(u.id, { id: uid(), day: today(), meal: "cena", ref: { kind: "recipe", id: r.recipe.id }, quantity: { amount: 200, unit: "g" } }))).toMatchObject({ code: "needs_grams", status: 422 });
    // Con peso final, sí por gramos.
    const r2 = await nu.saveRecipe(u.id, r.recipe.id, { name: "Burritos de pollo", servings: 4, finalWeightG: 1000, ingredients: r.recipe.ingredients.map((i) => ({ ref: i.ref, quantity: i.quantity })) });
    expect(r2.recipe.revision).toBe(2);
    const g = await nu.addEntry(u.id, { id: uid(), day: today(), meal: "cena", ref: { kind: "recipe", id: r.recipe.id }, quantity: { amount: 250, unit: "g" } });
    expect(g.entry!.nutrients.proteinG).toBeCloseTo(per, 2);
    // Editar la receta no cambia lo ya registrado.
    expect((await nu.myDay(u.id, today())).meals[0].entries[0].nutrients.proteinG).toBeCloseTo(per, 3);
  });
  it("[11–13] alimento propio: valores desconocidos ≠ 0, producto sin datos rechazado, datos incompletos aceptados", async () => {
    const u = await person();
    expect(await err(nu.createFood(u.id, { name: "Barrita", basisAmount: 1, basisUnit: "unidad", values: {} }))).toMatchObject({ code: "invalid" });
    const f = await nu.createFood(u.id, { name: "Barrita", brand: "Marca X", basisAmount: 1, basisUnit: "unidad", values: { proteinG: 10, energyKcal: null } });
    expect(f.food.values).toMatchObject({ proteinG: 10, energyKcal: null, carbsG: null });
    expect(f.food.energy).toBe("unknown");
    const e = await nu.addEntry(u.id, { id: uid(), day: today(), meal: "colacion", ref: { kind: "custom", id: f.food.refId }, quantity: { amount: 2, unit: "unidad" } });
    expect(e.entry!.nutrients).toMatchObject({ proteinG: 20, energyKcal: null });
    const d = await nu.myDay(u.id, today());
    expect(d.totals.coverage.energyKcal).toEqual({ known: 0, missing: 1 });
    expect(d.totals.values.energyKcal).toBeNull();
    expect(await err(nu.addEntry(u.id, { id: uid(), day: today(), meal: "colacion", ref: { kind: "custom", id: f.food.refId }, quantity: { amount: 50, unit: "g" } }))).toMatchObject({ code: "unit_mismatch" });
  });
  it("[14, 18, 19] mismo id dos veces (doble toque o reintento de red): un solo registro", async () => {
    const u = await person();
    const id = uid();
    const p = { id, day: today(), meal: "almuerzo", ref: cat("arroz-blanco-cocido"), quantity: { amount: 150, unit: "g" as const } };
    const [a, b] = await Promise.all([nu.addEntry(u.id, p), nu.addEntry(u.id, p)]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect((await nu.myDay(u.id, today())).meals[0].entries).toHaveLength(1);
    // Borrado: un reintento atrasado del alta no lo resucita.
    await nu.deleteEntry(u.id, id);
    expect(await nu.addEntry(u.id, p)).toMatchObject({ entry: null, deleted: true });
    expect((await nu.myDay(u.id, today())).meals).toHaveLength(0);
  });
  it("día lleno: un reintento de un id ya guardado se confirma; uno nuevo, no; tampoco días futuros", async () => {
    const u = await person();
    const id = uid();
    await nu.addEntry(u.id, { id, day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 100, unit: "g" } });
    await db.insert(schema.nutritionEntry).values([...Array(nu.MAX_ENTRIES_PER_DAY - 1).keys()].map((k) => ({ id: `fill${k}${uid().slice(0, 8)}`, userId: u.id, day: today(), meal: "cena", food: {}, qtyAmount: 1, qtyUnit: "g", nutrients: {} })));
    expect(await nu.addEntry(u.id, { id, day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 100, unit: "g" } })).toMatchObject({ duplicate: true });
    expect(await err(nu.addEntry(u.id, { id: uid(), day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 100, unit: "g" } }))).toMatchObject({ code: "limit" });
    const tomorrow = localDate(new Date(Date.now() + 86_400_000));
    expect(await err(nu.addEntry(u.id, { id: uid(), day: tomorrow, meal: "cena", ref: cat("banana"), quantity: { amount: 1, unit: "g" } }))).toMatchObject({ code: "invalid" });
  });
  it("[20, 78] edición sobre una copia vieja (otro dispositivo o recarga): 409 con la copia vigente, no pisa", async () => {
    const u = await person();
    const id = uid();
    await nu.addEntry(u.id, { id, day: today(), meal: "cena", ref: cat("huevo-duro"), quantity: { amount: 2, unit: "portion:2" } });
    await nu.updateEntry(u.id, id, { revision: 1, quantity: { amount: 3, unit: "portion:2" } });
    const e = await err(nu.updateEntry(u.id, id, { revision: 1, quantity: { amount: 1, unit: "portion:2" } }));
    expect(e).toMatchObject({ code: "stale", status: 409 });
    expect((e!.data!.entry as { quantity: { amount: number } }).quantity.amount).toBe(3);
  });
  it("[15] código de barras: inválido (dígito verificador), no encontrado y encontrado (copia con fuente y atribución ODbL)", async () => {
    const u = await person();
    expect(await err(lookupBarcode("7790000000001"))).toMatchObject({ code: "invalid_barcode" });
    const base = "779123456789";
    const digit = [...Array(10).keys()].find((d) => checkDigit(`${base}${d}`))!;
    const ean = `${base}${digit}`;
    let calls = 0;
    setOffFetcher(async () => { calls++; return new Response(JSON.stringify({ status: 1, product: { product_name: "Yogur bebible frutilla", brands: "Marca Y", nutrition_data_per: "100ml", nutriments: { "energy-kcal_100g": 78, proteins_100g: 2.6, carbohydrates_100g: 13, fat_100g: 1.6, sodium_100g: 0.05 } } }), { status: 200 }); });
    const r = await lookupBarcode(ean);
    expect(r).toMatchObject({ status: "found", complete: true, food: { kind: "barcode", basis: { amount: 100, unit: "ml" }, source: { id: "open-food-facts" }, values: { sodiumMg: 50, fiberG: null } } });
    expect((r as { food: { source: { attribution: string } } }).food.source.attribution).toMatch(/ODbL/);
    await lookupBarcode(ean);
    expect(calls).toBe(1); // segunda vez, de la caché
    const e = await nu.addEntry(u.id, { id: uid(), day: today(), meal: "merienda", ref: { kind: "barcode", id: ean }, quantity: { amount: 200, unit: "ml" } });
    expect(e.entry!.nutrients.energyKcal).toBe(156);
    const other = `${"779000000001"}${[...Array(10).keys()].find((d) => checkDigit(`779000000001${d}`))}`;
    setOffFetcher(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    expect(await lookupBarcode(other)).toEqual({ status: "not_found" });
  });
  it("[75] proveedor caído: responde «no disponible» (carga manual) y se corta tras fallas seguidas", async () => {
    const base = "779555555555";
    const ean = `${base}${[...Array(10).keys()].find((d) => checkDigit(`${base}${d}`))}`;
    let calls = 0;
    setOffFetcher(async () => { calls++; throw new Error("network down"); });
    for (let i = 0; i < 6; i++) expect(await lookupBarcode(ean)).toEqual({ status: "unavailable" });
    expect(calls).toBe(5); // la sexta ya no sale a la red
  });
  it("[17] texto ambiguo: propuesta con aclaraciones, nunca se guarda sola", async () => {
    const u = await person();
    const p = await nu.parseText(u.id, "Almorcé 200 gramos de pollo, arroz y una ensalada");
    expect(p.meal).toBe("almuerzo");
    expect(p.items[0].issues.map((i) => i.code)).toContain("ambiguous_state");
    expect(p.items[1].issues.map((i) => i.code)).toContain("no_quantity");
    expect((await nu.myDay(u.id, today())).meals).toHaveLength(0);
  });
  it("[32–34] corrección histórica explícita: la copia guardada no cambia sola; refrescar usa la versión vigente", async () => {
    const u = await person();
    const id = uid();
    await nu.addEntry(u.id, { id, day: today(), meal: "desayuno", ref: cat("banana"), quantity: { amount: 100, unit: "g" } });
    // Simulamos que la copia guardada vino de una versión anterior de la fuente.
    await db.execute(sql`update nutrition_entry set food = jsonb_set(food, '{values,energyKcal}', '70'::jsonb), nutrients = jsonb_set(nutrients, '{energyKcal}', '70'::jsonb) where id = ${id}`);
    expect((await nu.myDay(u.id, today())).totals.values.energyKcal).toBe(70);
    const r = await nu.refreshEntry(u.id, id, 1);
    expect(r).toMatchObject({ changed: true, entry: { revision: 2 } });
    expect(r.entry.nutrients.energyKcal).toBe(89);
  });
  it("valida fechas, comidas y cantidades", async () => {
    const u = await person();
    const p = { id: uid(), day: today(), meal: "almuerzo", ref: cat("banana"), quantity: { amount: 1, unit: "g" as const } };
    expect(await err(nu.addEntry(u.id, { ...p, day: "2099-01-01" }))).toMatchObject({ code: "invalid" });
    expect(await err(nu.addEntry(u.id, { ...p, meal: "brunch" }))).toMatchObject({ code: "invalid" });
    expect(await err(nu.addEntry(u.id, { ...p, quantity: { amount: 9000, unit: "g" } }))).toMatchObject({ code: "invalid_amount" });
    expect(await err(nu.addEntry(u.id, { ...p, ref: cat("no-existe") }))).toMatchObject({ status: 404 });
    expect(await err(nu.addEntry(u.id, { ...p, id: "x" }))).toMatchObject({ code: "invalid" });
  });
});

describe("progreso e inteligencia [35–47]", () => {
  it("[39–41] día parcial vs completo, promedios sólo de días completos y entrenamientos del período", async () => {
    const u = await person();
    const days = [0, 1, 2, 3].map((k) => localDate(new Date(Date.now() - k * 86_400_000)));
    for (const [i, d] of days.entries()) {
      await nu.addEntry(u.id, { id: uid(), day: d, meal: "almuerzo", ref: cat("pollo-pechuga-plancha"), quantity: { amount: 100 + i * 50, unit: "g" } });
      if (i < 3) await nu.setDayComplete(u.id, d, true);
    }
    const p = await nu.myProgress(u.id, days[3], days[0]);
    expect(p.summary).toMatchObject({ days: 4, loggedDays: 4, completeDays: 3, partialDays: 1 });
    expect(p.summary.trends.proteinG.usableDays).toBe(3);
    expect(p.summary.trends.proteinG.excludedDays).toBe(1);
    expect(p.sentence).toMatch(/^En estos 4 días registraste comidas en 4 días \(3 marcados completos\) y completaste 0 entrenamientos\.$/);
    const d = await nu.myDay(u.id, days[3]);
    expect(d.status).toBe("partial");
    expect(d.note).toMatch(/todavía no podemos evaluar/);
  });
  it("[35–37] perfil: objetivo voluntario, objetivos propios validados, profesional para energía baja", async () => {
    const u = await person();
    expect((await nu.myProfile(u.id))).toMatchObject({ goal: null, targets: {}, onboarded: false, proactive: false, reminders: false });
    const p = await nu.saveProfile(u.id, { goal: "protein", prefs: { mealsPerDay: 4, cooking: "some" }, targets: { proteinG: { value: 130, mode: "min" } }, onboarded: true });
    expect(p).toMatchObject({ goal: "protein", targets: { proteinG: { value: 130, mode: "min" } }, targetSource: "self", onboarded: true });
    expect(await err(nu.saveProfile(u.id, { targets: { energyKcal: { value: 1100, mode: "approx" } } }))).toMatchObject({ code: "invalid_targets", status: 422 });
    expect((await nu.saveProfile(u.id, { targets: { energyKcal: { value: 1100, mode: "approx" } }, targetSource: "professional" })).targetSource).toBe("professional");
    expect((await nu.saveProfile(u.id, { targets: null })).targets).toEqual({});
  });
  it("[44–45] asistente: pregunta en lenguaje natural y registro con confirmación (sin duplicar)", async () => {
    const u = await person();
    await nu.addEntry(u.id, { id: uid(), day: today(), meal: "almuerzo", ref: cat("pollo-pechuga-plancha"), quantity: { amount: 200, unit: "g" } });
    const q = await handleMessage(u.id, { text: "¿Cuánta proteína llevo hoy?", section: "home" });
    expect(q.reply.via).toBe("rules");
    expect(q.reply.text).toMatch(/^Hoy registraste proteína: \d+ g\. Es lo registrado hasta ahora, no necesariamente todo lo que comiste\.$/);
    const r = await handleMessage(u.id, { text: "Agregá una banana a mi merienda", section: "home" });
    const a = r.reply.actions[0] as unknown as { key: string; kind: string; mode: string; preview: string };
    expect(a).toMatchObject({ kind: "log_food", mode: "confirm" });
    expect(a.preview).toMatch(/Banana · 1 × 1 unidad mediana .* merienda de hoy/);
    expect((await nu.myDay(u.id, today())).meals.map((m) => m.meal)).toEqual(["almuerzo"]); // todavía no se guardó
    const c1 = await confirmAction(u.id, a.key), c2 = await confirmAction(u.id, a.key);
    expect(c1).toMatchObject({ ok: true, executed: true });
    expect(c2.executed).toBe(false);
    const d = await nu.myDay(u.id, today());
    expect(d.meals.find((m) => m.meal === "merienda")!.entries).toHaveLength(1);
  });
  it("[43, 17] el asistente pide aclaraciones en vez de inventar cantidades o estado", async () => {
    const u = await person();
    expect((await handleMessage(u.id, { text: "Agregá arroz al almuerzo", section: "home" })).reply.text).toMatch(/crudo o cocido/);
    const r = await handleMessage(u.id, { text: "Agregá banana a la merienda", section: "home" });
    expect(r.reply.text).toMatch(/¿Cuánto\?/);
    expect(r.reply.actions).toHaveLength(0);
    expect((await handleMessage(u.id, { text: "¿Cómo vengo esta semana con las comidas?", section: "home" })).reply.text).toMatch(/no registraste comidas/);
  });
  it("[48–50] menor y edad desconocida: sin Nutrición ni charla de comida; caso sensible con adulto: límite y sin números", async () => {
    const minor = await person("Menor NU", "01/01/2012"), unknown = await person("Sin fecha NU", null), adult = await person();
    expect(await nutritionState(minor.id)).toMatchObject({ enabled: true, eligible: false, reason: "minor" });
    expect(await nutritionState(unknown.id)).toMatchObject({ eligible: false, reason: "age_required" });
    expect(await err(nu.myDay(minor.id, today()))).toMatchObject({ code: "minor_restricted", status: 403 });
    expect(await err(nu.addEntry(unknown.id, { id: uid(), day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 1, unit: "g" } }))).toMatchObject({ code: "age_required" });
    expect((await handleMessage(minor.id, { text: "¿Cuánta proteína llevo hoy?", section: "home" })).reply.text).not.toMatch(/registraste/);
    const s = await handleMessage(adult.id, { text: "Tengo bulimia, ¿cuántas calorías debería comer?", section: "home" });
    expect(s.reply.via).toBe("safety");
    expect(s.reply.text).not.toMatch(/\d+ ?(kcal|calor)/);
  });
  it("[42, 16] el registro de comidas no cambia lo que recomienda Training Intelligence (sin conexión entre motores)", async () => {
    const src = await readFile(path.join(__dirname, "../src/server/training/intelligence.ts"), "utf8");
    expect(src).not.toMatch(/nutrition/i);
  });
});

describe("privacidad [51–63]", () => {
  it("[51] alumno A no ve ni toca registros de B (404 igual que inexistente)", async () => {
    const a = await person(), b = await person();
    const id = uid();
    await nu.addEntry(b.id, { id, day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 100, unit: "g" } });
    expect(await err(nu.updateEntry(a.id, id, { revision: 1, quantity: { amount: 1, unit: "g" } }))).toMatchObject({ status: 404 });
    expect(await err(nu.deleteEntry(a.id, id))).toMatchObject({ status: 404 });
    expect(await err(nu.addEntry(a.id, { id, day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 100, unit: "g" } }))).toMatchObject({ code: "conflict" });
    expect((await nu.myDay(a.id, today())).meals).toHaveLength(0);
    const f = await nu.createFood(b.id, { name: "Privado", basisAmount: 100, basisUnit: "g", values: { proteinG: 5 } });
    expect(await err(nu.addEntry(a.id, { id: uid(), day: today(), meal: "cena", ref: { kind: "custom", id: f.food.refId }, quantity: { amount: 1, unit: "g" } }))).toMatchObject({ status: 404 });
    expect((await nu.searchFood(a.id, "Privado")).results.some((r) => r.kind === "custom")).toBe(false);
  });
  it("[52–55] coach: sin permiso nada; resumen sin comidas; diario sólo con su permiso; revocar corta al instante", async () => {
    const w = await coachWorld();
    await nu.addEntry(w.user, { id: uid(), day: today(), meal: "almuerzo", ref: cat("pollo-pechuga-plancha"), quantity: { amount: 150, unit: "g" } });
    const none = await fu.clientNutrition(w.coach, w.org, w.rel);
    expect(none).toMatchObject({ granted: false });
    expect(JSON.stringify(none)).not.toMatch(/pechuga|pollo/i);
    const req = await fu.requestAccess(w.coach, w.org, w.rel, "nutrition");
    await fu.decideAccess(w.user, req.id, true);
    const sum = await fu.clientNutrition(w.coach, w.org, w.rel);
    expect(sum).toMatchObject({ granted: true, summary: true, journal: false, journalView: null });
    expect(JSON.stringify(sum.summaryView)).not.toMatch(/pechuga|pollo/i);
    expect(sum.summaryView!.week.loggedDays).toBe(1);
    await fu.setShare(w.user, "nutrition_journal", true);
    const full = await fu.clientNutrition(w.coach, w.org, w.rel);
    expect(full.journalView!.days[0].meals[0].entries[0].name).toMatch(/Pechuga de pollo/);
    await fu.setShare(w.user, "nutrition_journal", false);
    await fu.setShare(w.user, "nutrition", false);
    expect(await fu.clientNutrition(w.coach, w.org, w.rel)).toMatchObject({ granted: false });
    // Trazabilidad sin valores: lectura registrada para el alumno; la auditoría no lleva alimentos.
    const logs = await db.select().from(schema.dataAccessLog).where(eq(schema.dataAccessLog.subjectUserId, w.user));
    expect(logs.filter((l) => l.action === "read").map((l) => l.item).sort()).toEqual(["nutrition", "nutrition_journal"]);
    const audits = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.actorUserId, w.user));
    expect(JSON.stringify(audits)).not.toMatch(/pechuga|pollo|kcal/i);
  });
  it("[56] coach de otra organización: 404", async () => {
    const w = await coachWorld(), other = await coachWorld();
    expect(await err(fu.clientNutrition(other.coach, other.org, w.rel))).toMatchObject({ status: 404 });
    expect(await err(fu.clientNutrition(other.coach, w.org, w.rel))).toMatchObject({ status: 404 });
  });
  it("[57, 62] gimnasio (dueño, sala, REPI Control): el catálogo de permisos del gimnasio no tiene nutrición y su código no la lee", async () => {
    const { CONSENT_CATALOG } = await import("@repi/domain");
    expect(CONSENT_CATALOG.gym_member.map((c) => c.key)).not.toContain("nutrition");
    const { GYM_NEVER_SEES } = await import("@/server/gym/services");
    expect(GYM_NEVER_SEES.join(" ")).toMatch(/nutrición/);
    for (const f of ["src/server/gym/services.ts", "src/server/gym/kiosk.ts", "src/server/gym/kiosk-training.ts", "src/server/gym/connect.ts", "src/components/kiosk/KioskApp.tsx", "src/components/kiosk/KioskTraining.tsx"])
      expect(await readFile(path.join(__dirname, "..", f), "utf8")).not.toMatch(/nutrition|nutri\/|server\/nutrition/);
  });
  it("[58] REPI Admin: ninguna ruta de administración lee Nutrición", async () => {
    const route = await readFile(path.join(__dirname, "../src/app/api/admin/[[...path]]/route.ts"), "utf8");
    expect(route).not.toMatch(/nutrition/);
  });
  it("[63] kiosco compartido: sin diario de comidas en la pantalla del gimnasio", async () => {
    const src = await readFile(path.join(__dirname, "../src/server/gym/kiosk-training.ts"), "utf8");
    expect(src).not.toMatch(/nutrition_entry|nutritionEntry|server\/nutrition/);
  });
  it("[59–61] exportación completa y borrado en cascada sin restos", async () => {
    const u = await person();
    await nu.addEntry(u.id, { id: uid(), day: today(), meal: "cena", ref: cat("banana"), quantity: { amount: 100, unit: "g" } });
    await nu.createFood(u.id, { name: "Propio", basisAmount: 100, basisUnit: "g", values: { proteinG: 5 } });
    await nu.saveProfile(u.id, { goal: "track" });
    const x = await exportMyData(u.id);
    expect(x.nutrition.entries).toHaveLength(1);
    expect(x.nutrition.foods).toHaveLength(1);
    expect(x.nutrition.profile).toMatchObject({ goal: "track" });
    expect(JSON.stringify(x.nutrition)).not.toContain(u.id);
    await db.delete(schema.user).where(eq(schema.user.id, u.id));
    for (const t of [schema.nutritionEntry, schema.nutritionFood, schema.nutritionProfile]) expect(await db.select().from(t).where(eq(t.userId, u.id))).toHaveLength(0);
  });
  it("módulo apagado: 404 para personas reales; las cuentas de la demo guiada lo tienen como piloto", async () => {
    process.env.NEXT_PUBLIC_REPI_FEATURES = "-nutrition";
    const u = await person(), demo = await person("Demo NU");
    expect(await nutritionState(u.id)).toEqual({ enabled: false });
    expect(await err(nu.myDay(u.id, today()))).toMatchObject({ status: 404 });
    await db.insert(schema.demoSandbox).values({ tag: `nu${uid().slice(0, 8)}`, role: "member", userIds: [demo.id], orgIds: [], expiresAt: new Date(Date.now() + 3_600_000) });
    expect(await nutritionState(demo.id)).toMatchObject({ enabled: true, eligible: true });
    // El permiso de nutrición no se puede pedir ni conceder con el módulo apagado.
    const w = await coachWorld();
    expect(await err(fu.requestAccess(w.coach, w.org, w.rel, "nutrition"))).toMatchObject({ code: "invalid" });
    expect(await err(fu.setShare(w.user, "nutrition", true))).toMatchObject({ code: "invalid" });
    // Y con el módulo apagado, el asistente sigue como antes (no habla del diario).
    expect((await handleMessage(u.id, { text: "¿Cuánta proteína llevo hoy?", section: "home" })).reply.text).not.toMatch(/registraste/);
  });
});

describe("rendimiento [73]", () => {
  it("historial largo: un año de registros se resume rápido", async () => {
    const u = await person();
    const rows = [...Array(365).keys()].flatMap((k) => [0, 1, 2].map((j) => ({
      id: `long${k}x${j}${uid().slice(0, 6)}`, userId: u.id, day: localDate(new Date(Date.now() - k * 86_400_000)), meal: ["desayuno", "almuerzo", "cena"][j],
      food: { kind: "catalog", refId: "banana", name: "Banana" }, qtyAmount: 100, qtyUnit: "g", grams: 100, nutrients: { energyKcal: 89, proteinG: 1.09, carbsG: 22.84, fatG: 0.33, fiberG: 2.6, sugarsG: 12.23, satFatG: 0.112, sodiumMg: 1 },
    })));
    await db.insert(schema.nutritionEntry).values(rows);
    const t = Date.now();
    const p = await nu.myProgress(u.id, localDate(new Date(Date.now() - 364 * 86_400_000)), today());
    expect(Date.now() - t).toBeLessThan(3000);
    expect(p.summary.loggedDays).toBe(365);
  });
});

describe("demo guiada (piloto)", () => {
  it("la socia ficticia tiene una semana de registros y su coach ve sólo el resumen", async () => {
    process.env.NEXT_PUBLIC_REPI_FEATURES = "-nutrition";
    const { startDemo } = await import("@/server/sandbox/services");
    await startDemo("member");
    const [box] = await db.select().from(schema.demoSandbox).orderBy(desc(schema.demoSandbox.createdAt)).limit(1);
    const ids = box.userIds as string[];
    const [vale] = await db.select().from(schema.user).where(and(inArray(schema.user.id, ids), eq(schema.user.name, "Valentina Gómez")));
    expect(await nutritionState(vale.id)).toMatchObject({ enabled: true, eligible: true });
    const p = await nu.myProgress(vale.id, localDate(new Date(Date.now() - 6 * 86_400_000)), today());
    expect(p.summary).toMatchObject({ loggedDays: 7, completeDays: 5, partialDays: 2 }); // ayer y hoy (sólo desayuno) sin marcar
    expect(p.summary.trends.proteinG.average).not.toBeNull();
    const [rel] = await db.select().from(schema.coachClient).where(eq(schema.coachClient.userId, vale.id));
    const [coach] = await db.select().from(schema.staffMembership).where(eq(schema.staffMembership.orgId, rel.coachOrgId));
    const v = await fu.clientNutrition(coach.userId, rel.coachOrgId, rel.id);
    expect(v).toMatchObject({ granted: true, summary: true, journal: false, journalView: null });
  });
});
