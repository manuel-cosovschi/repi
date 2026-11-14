// D221 · Datos ficticios de Nutrición para la demo guiada (Valentina Gómez, persona inventada). Se insertan directo porque
// el entorno todavía no está registrado como demo mientras se arma; los valores salen del mismo motor y la misma biblioteca
// que usa la app (nada escrito a mano). Una semana con días completos y uno parcial, objetivo propio de proteína y el
// resumen compartido con su coach (el diario detallado, no: así la demo muestra los dos niveles de permiso).
import { randomUUID } from "node:crypto";
import { catalogSnapshot, gramsOf, localDate, nutrientsFor, type Meal, type Quantity } from "@repi/domain";
import { FOODS } from "@repi/domain/nutrition/foods";
import { db, schema } from "@/db";

const DAY: [Meal, string, Quantity][][] = [
  [["desayuno", "avena-cruda", { amount: 50, unit: "g" }], ["desayuno", "leche-entera", { amount: 1, unit: "portion:0" }], ["desayuno", "banana", { amount: 1, unit: "portion:4" }],
    ["almuerzo", "pollo-pechuga-plancha", { amount: 180, unit: "g" }], ["almuerzo", "arroz-blanco-cocido", { amount: 1, unit: "portion:0" }],
    ["merienda", "yogur-natural-entero", { amount: 200, unit: "g" }], ["cena", "huevo-duro", { amount: 2, unit: "portion:2" }], ["cena", "papa-hervida", { amount: 200, unit: "g" }]],
  [["desayuno", "pan-lactal-integral", { amount: 60, unit: "g" }], ["desayuno", "queso-crema", { amount: 30, unit: "g" }],
    ["almuerzo", "carne-picada-magra-cocida", { amount: 150, unit: "g" }], ["almuerzo", "fideos-secos-cocidos", { amount: 200, unit: "g" }],
    ["merienda", "manzana", { amount: 180, unit: "g" }], ["cena", "merluza-cocida", { amount: 200, unit: "g" }], ["cena", "zapallo-anco-al-horno", { amount: 200, unit: "g" }]],
];
const BY = new Map(FOODS.map((f) => [f.slug, f]));

export async function seedNutritionDemo(userId: string, coach: { relationId: string; orgId: string } | null, now: Date) {
  const rows: (typeof schema.nutritionEntry.$inferInsert)[] = [];
  for (let back = 6; back >= 0; back--) {
    const day = localDate(new Date(now.getTime() - back * 86_400_000));
    const plan = DAY[back % 2].filter(([meal]) => back > 0 || meal === "desayuno"); // hoy: sólo el desayuno (día parcial)
    for (const [meal, slug, q] of plan) {
      const f = BY.get(slug);
      if (!f) continue; // la biblioteca cambió: se omite en vez de inventar
      const food = catalogSnapshot(f);
      try { rows.push({ id: randomUUID().replace(/-/g, ""), userId, day, meal, food: food as unknown as Record<string, unknown>, qtyAmount: q.amount, qtyUnit: q.unit, grams: gramsOf(food, q), nutrients: nutrientsFor(food, q) }); } catch { /* porción no documentada: se omite */ }
    }
  }
  if (rows.length) await db.insert(schema.nutritionEntry).values(rows);
  await db.insert(schema.nutritionDay).values([6, 5, 4, 3, 2].map((b) => ({ userId, day: localDate(new Date(now.getTime() - b * 86_400_000)), complete: true })));
  await db.insert(schema.nutritionProfile).values({ userId, goal: "strength", prefs: { mealsPerDay: 4, cooking: "some" }, targets: { proteinG: { value: 110, mode: "min" } }, targetSource: "self", targetsSetAt: now, onboardedAt: now });
  if (coach) await db.insert(schema.consentGrant).values({ userId, scope: "coach_client", relationId: coach.relationId, granteeOrgId: coach.orgId, item: "nutrition", termsVersion: "demo" });
}
