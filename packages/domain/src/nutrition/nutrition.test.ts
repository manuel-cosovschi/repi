// Nutrition Intelligence 1.0 (D221) — motor determinístico, progreso, políticas e interpretación de texto.
// Los números entre corchetes remiten a las pruebas obligatorias del máster (§24).
import { describe, expect, it } from "vitest";
import {
  atwater, basisFactor, catalogSnapshot, dayStatus, describePeriod, fmtNutrient, gramsOf, isComplete, mergeTotals, nutrientsFor, nutritionEligibility,
  parseFoodText, periodSummary, recipeBasis, roundForDisplay, searchFoods, sensitiveKind, sumNutrients, targetConsistency, validateTargets, withEnergy,
  BANNED_FOOD_WORDS, SENSITIVE_REPLY, NutritionCalcError, emptyNutrients, type CatalogFood, type DayLog, type FoodSnapshot, type Nutrients,
} from "../nutrition";

const n = (v: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...v });
const food = (slug: string, name: string, state: CatalogFood["state"], per100g: Partial<Nutrients>, portions: CatalogFood["portions"] = [], aliases: string[] = []): CatalogFood =>
  ({ slug, name, aliases, category: "otros", state, fdcId: 1, usdaDescription: name, per100g: n(per100g), portions, match: "exact" });

const CAT: CatalogFood[] = [
  food("pollo-crudo", "Pechuga de pollo, cruda", "raw", { energyKcal: 120, proteinG: 22.5, carbsG: 0, fatG: 2.62, sodiumMg: 45 }, [], ["pollo", "pechuga"]),
  food("pollo-cocido", "Pechuga de pollo, cocida", "cooked", { energyKcal: 165, proteinG: 31, carbsG: 0, fatG: 3.57, sodiumMg: 74 }, [], ["pollo", "pechuga"]),
  food("arroz-crudo", "Arroz blanco, crudo", "raw", { energyKcal: 365, proteinG: 7.13, carbsG: 79.95, fatG: 0.66 }, [{ label: "1 taza", grams: 185 }], ["arroz"]),
  food("arroz-cocido", "Arroz blanco, cocido", "cooked", { energyKcal: 130, proteinG: 2.69, carbsG: 28.17, fatG: 0.28, fiberG: 0.4 }, [{ label: "1 taza", grams: 158 }], ["arroz"]),
  food("huevo", "Huevo entero, crudo", "raw", { energyKcal: 143, proteinG: 12.56, carbsG: 0.72, fatG: 9.51 }, [{ label: "1 unidad grande", grams: 50 }, { label: "1 unidad mediana", grams: 44 }], ["huevo"]),
  food("banana", "Banana", "raw", { energyKcal: 89, proteinG: 1.09, carbsG: 22.84, fatG: 0.33, fiberG: 2.6 }, [{ label: "1 unidad mediana", grams: 118 }], ["banana"]),
  food("lechuga", "Lechuga", "raw", { energyKcal: 15, proteinG: 1.36, carbsG: 2.87, fatG: 0.15 }, [{ label: "1 taza", grams: 36 }], ["ensalada de lechuga", "lechuga"]),
  food("yogur", "Yogur natural entero", "na", { energyKcal: null, proteinG: 3.47, carbsG: 4.66, fatG: 3.25 }, [{ label: "1 pote", grams: 170 }], ["yogur"]),
];
const snap = (slug: string) => catalogSnapshot(CAT.find((f) => f.slug === slug)!);

describe("cálculos [21–34]", () => {
  it("[21–24] proteína, carbohidratos, grasas y energía de una cantidad en gramos", () => {
    const v = nutrientsFor(snap("pollo-cocido"), { amount: 200, unit: "g" });
    expect(v.proteinG).toBe(62); expect(v.carbsG).toBe(0); expect(v.fatG).toBe(7.14); expect(v.energyKcal).toBe(330);
  });
  it("[25] porciones fraccionadas: media taza de arroz cocido", () => {
    const v = nutrientsFor(snap("arroz-cocido"), { amount: 0.5, unit: "portion:0" });
    expect(v.carbsG).toBeCloseTo(22.25, 2); // 79 g × 28,17/100
    expect(gramsOf(snap("arroz-cocido"), { amount: 0.5, unit: "portion:0" })).toBe(79);
  });
  it("[26] unidades: 2 huevos grandes = 100 g; ml sobre una base en gramos no se convierte (sin densidad)", () => {
    expect(nutrientsFor(snap("huevo"), { amount: 2, unit: "portion:0" }).proteinG).toBe(12.56);
    expect(() => basisFactor(snap("huevo"), { amount: 100, unit: "ml" })).toThrow(NutritionCalcError);
    expect(() => basisFactor(snap("huevo"), { amount: 1, unit: "portion:9" })).toThrow(/porción no está documentada/);
  });
  it("[27] redondeo de presentación (GMC 46/03): enteros desde 10, 1 decimal debajo, 0 bajo el umbral", () => {
    expect(roundForDisplay("proteinG", 31.46)).toBe(31);
    expect(roundForDisplay("proteinG", 7.14)).toBe(7.1);
    expect(roundForDisplay("fatG", 0.3)).toBe(0);
    expect(roundForDisplay("energyKcal", 3.9)).toBe(0);
    expect(roundForDisplay("sodiumMg", 4)).toBe(0);
    expect(fmtNutrient("proteinG", 45.2, true)).toBe("≥ 45 g");
    expect(fmtNutrient("proteinG", null)).toBe("sin dato");
    // decimales sin ruido de coma flotante
    expect(sumNutrients([n({ proteinG: 0.1 }), n({ proteinG: 0.2 })]).values.proteinG).toBe(0.3);
  });
  it("[28] comidas con varios ingredientes: el total suma cada uno", () => {
    const t = sumNutrients([nutrientsFor(snap("pollo-cocido"), { amount: 150, unit: "g" }), nutrientsFor(snap("arroz-cocido"), { amount: 1, unit: "portion:0" })]);
    expect(t.values.proteinG).toBeCloseTo(46.5 + 4.2502, 3);
    expect(t.items).toBe(2);
  });
  it("[29] receta por porción y por gramo cocido, sin suponer que el peso cocido es la suma de los crudos", () => {
    const ing = [nutrientsFor(snap("pollo-crudo"), { amount: 400, unit: "g" }), nutrientsFor(snap("arroz-crudo"), { amount: 200, unit: "g" })];
    const four = recipeBasis(ing, { servings: 4, finalWeightG: null });
    expect(four.values.proteinG).toBeCloseTo((90 + 14.26) / 4, 3);
    expect(four.basis).toEqual({ amount: 1, unit: "porcion", grams: null });
    const recipe: FoodSnapshot = { ...snap("pollo-cocido"), kind: "recipe", basis: four.basis, values: four.values, portions: [] };
    expect(() => basisFactor(recipe, { amount: 150, unit: "g" })).toThrow(/peso final/); // sin peso final no hay gramos
    const weighed = recipeBasis(ing, { servings: 4, finalWeightG: 1200 });
    expect(weighed.basis.grams).toBe(300);
    const r2: FoodSnapshot = { ...recipe, basis: weighed.basis, values: weighed.values };
    expect(nutrientsFor(r2, { amount: 150, unit: "g" }).proteinG).toBeCloseTo(((90 + 14.26) / 4) / 2, 3);
  });
  it("[30] datos faltantes: un nutriente desconocido nunca se vuelve cero y el total queda parcial", () => {
    const t = sumNutrients([nutrientsFor(snap("arroz-cocido"), { amount: 100, unit: "g" }), nutrientsFor(snap("pollo-cocido"), { amount: 100, unit: "g" })]);
    expect(t.values.fiberG).toBe(0.4);
    expect(t.coverage.fiberG).toEqual({ known: 1, missing: 1 });
    expect(isComplete(t, "fiberG")).toBe(false);
    expect(isComplete(t, "proteinG")).toBe(true);
    expect(sumNutrients([n({})]).values.proteinG).toBeNull();
  });
  it("[31] crudo y cocido son alimentos distintos: no se convierten entre sí", () => {
    const raw = nutrientsFor(snap("arroz-crudo"), { amount: 100, unit: "g" }), cooked = nutrientsFor(snap("arroz-cocido"), { amount: 100, unit: "g" });
    expect(raw.energyKcal).toBe(365); expect(cooked.energyKcal).toBe(130);
    expect(snap("arroz-crudo").refId).not.toBe(snap("arroz-cocido").refId);
  });
  it("[32–34] la copia guardada conserva los valores aunque la fuente cambie de versión", () => {
    const saved = snap("banana");
    const updated = { ...CAT.find((f) => f.slug === "banana")!, per100g: n({ energyKcal: 95, proteinG: 1.2, carbsG: 23, fatG: 0.3 }) };
    expect(nutrientsFor(saved, { amount: 100, unit: "g" }).energyKcal).toBe(89);
    expect(nutrientsFor(catalogSnapshot(updated), { amount: 100, unit: "g" }).energyKcal).toBe(95);
    expect(saved.source).toMatchObject({ id: "usda-sr-legacy", version: "2018-04", sourceId: "1" });
  });
  it("energía: la informada; si falta, Atwater (calculada); si falta un macro, desconocida", () => {
    expect(withEnergy(n({ energyKcal: 50, proteinG: 1, carbsG: 1, fatG: 1 })).energy).toBe("reported");
    const y = snap("yogur");
    expect(y.energy).toBe("calculated");
    expect(y.values.energyKcal).toBeCloseTo(3.47 * 4 + 4.66 * 4 + 3.25 * 9, 3);
    expect(atwater(n({ proteinG: 1, carbsG: null, fatG: 1 }))).toBeNull();
    expect(withEnergy(n({ proteinG: 1 })).energy).toBe("unknown");
  });
  it("cantidades inválidas: cero, negativas o absurdas", () => {
    for (const amount of [0, -5, Number.NaN, 20000]) expect(() => basisFactor(snap("banana"), { amount, unit: "g" })).toThrow(/cantidad/);
  });
  it("alimento propio por unidad sin peso: se calcula por unidad, pero no por gramos", () => {
    const own: FoodSnapshot = { ...snap("banana"), kind: "custom", basis: { amount: 1, unit: "unidad", grams: null }, values: n({ proteinG: 8, energyKcal: null }), portions: [] };
    expect(nutrientsFor(own, { amount: 2, unit: "unidad" }).proteinG).toBe(16);
    expect(nutrientsFor(own, { amount: 2, unit: "unidad" }).energyKcal).toBeNull();
    expect(() => basisFactor(own, { amount: 50, unit: "g" })).toThrow(NutritionCalcError);
    expect(gramsOf(own, { amount: 2, unit: "unidad" })).toBeNull();
  });
});

const day = (d: string, markedComplete: boolean, items: Nutrients[]): DayLog => ({ day: d, markedComplete, totals: sumNutrients(items), meals: items.length });
const P = (proteinG: number, energyKcal: number | null = 500) => n({ proteinG, energyKcal, carbsG: 50, fatG: 10 });

describe("progreso [38–43]", () => {
  it("[38–40] estado del día: sin registros, parcial y completo (marcado por la persona)", () => {
    expect(dayStatus(day("2026-11-01", false, []))).toBe("empty");
    expect(dayStatus(day("2026-11-01", true, []))).toBe("empty");
    expect(dayStatus(day("2026-11-01", false, [P(30)]))).toBe("partial");
    expect(dayStatus(day("2026-11-01", true, [P(30)]))).toBe("complete");
  });
  it("[41] tendencia semanal: promedia sólo días completos sin faltantes", () => {
    const days = [day("1", true, [P(100)]), day("2", true, [P(120)]), day("3", true, [P(140)]), day("4", false, [P(20)]), day("5", false, []), day("6", true, [P(90, null)]), day("7", false, [])];
    const s = periodSummary(days);
    expect(s).toMatchObject({ days: 7, loggedDays: 5, completeDays: 4, partialDays: 1, emptyDays: 2 });
    expect(s.trends.proteinG.average).toBe(112.5); // 100, 120, 140, 90: el día 4 (parcial) no cuenta
    expect(s.trends.energyKcal.average).toBe(500); // el día 6 tiene energía desconocida: queda afuera
    expect(s.trends.energyKcal.usableDays).toBe(3);
    expect(s.trends.energyKcal.excludedDays).toBe(2);
  });
  it("[43] evidencia insuficiente: con menos de 3 días completos no hay promedio", () => {
    const s = periodSummary([day("1", true, [P(100)]), day("2", false, [P(50)]), day("3", true, [P(80)])]);
    expect(s.trends.proteinG.average).toBeNull();
    expect(s.trends.proteinG.usableDays).toBe(2);
  });
  it("consistencia con objetivos propios: sólo sobre días completos", () => {
    const days = [day("1", true, [P(130)]), day("2", true, [P(110)]), day("3", false, [P(10)])];
    expect(targetConsistency(days, "proteinG", { value: 120, mode: "min" })).toEqual({ met: 1, of: 2 });
    expect(targetConsistency(days, "energyKcal", { value: 520, mode: "approx" })).toEqual({ met: 2, of: 2 });
    expect(targetConsistency([day("1", false, [P(1)])], "proteinG", { value: 120, mode: "min" })).toBeNull();
  });
  it("[42] frase descriptiva con entrenamientos, sin causalidad", () => {
    expect(describePeriod({ days: 28, loggedDays: 18, completeDays: 12 }, 15)).toBe("En estos 28 días registraste comidas en 18 días (12 marcados completos) y completaste 15 entrenamientos.");
    expect(describePeriod({ days: 7, loggedDays: 0, completeDays: 0 }, 3)).toBe("En estos 7 días no registraste comidas y completaste 3 entrenamientos.");
    expect(describePeriod({ days: 7, loggedDays: 1, completeDays: 0 }, null)).not.toMatch(/gracias a|porque|por eso/);
  });
  it("mergeTotals suma comidas en el día conservando cobertura", () => {
    const t = mergeTotals([sumNutrients([P(10)]), sumNutrients([n({ proteinG: 5 })])]);
    expect(t.values.proteinG).toBe(15); expect(t.coverage.energyKcal).toEqual({ known: 1, missing: 1 }); expect(t.items).toBe(2);
  });
});

describe("políticas [48–50]", () => {
  it("[48–49] edad: sólo adultos con fecha registrada", () => {
    expect(nutritionEligibility("adult")).toEqual({ ok: true });
    expect(nutritionEligibility("minor")).toEqual({ ok: false, reason: "minor" });
    expect(nutritionEligibility("unknown")).toEqual({ ok: false, reason: "age_required" });
  });
  it("objetivos: nunca automáticos; rangos; energía muy baja sólo indicada por un profesional", () => {
    expect(validateTargets({ proteinG: { value: 140, mode: "min" } }, "self")).toEqual({ ok: true, targets: { proteinG: { value: 140, mode: "min" } } });
    const low = validateTargets({ energyKcal: { value: 1100, mode: "approx" } }, "self");
    expect(low.ok).toBe(false);
    expect(validateTargets({ energyKcal: { value: 1100, mode: "approx" } }, "professional").ok).toBe(true);
    expect(validateTargets({ proteinG: { value: 900, mode: "min" } }, "professional").ok).toBe(false);
    expect(validateTargets({ fatG: { value: 60, mode: "rare" as never } }, "self").ok).toBe(false);
  });
  it("[50] situaciones sensibles: se detectan y la respuesta no da números ni diagnostica", () => {
    expect(sensitiveKind("tengo bulimia hace años")).toBe("eating_disorder");
    expect(sensitiveKind("quiero dejar de comer para bajar")).toBe("extreme_restriction");
    expect(sensitiveKind("estoy embarazada, cuánto como?")).toBe("pregnancy");
    expect(sensitiveKind("soy diabético tipo 1")).toBe("condition");
    expect(sensitiveKind("¿me conviene tomar creatina?")).toBe("supplement");
    expect(sensitiveKind("soy alérgica al maní")).toBe("allergy");
    expect(sensitiveKind("¿cuánta proteína llevo hoy?")).toBeNull();
    for (const t of Object.values(SENSITIVE_REPLY)) { expect(t).not.toMatch(/\d+ ?(kcal|g\b|gramos)/); expect(t).not.toMatch(BANNED_FOOD_WORDS); }
  });
});

describe("búsqueda e interpretación de texto [1, 17, 44]", () => {
  it("[1] busca por alias, singular/plural y sin acentos; sin coincidencia no adivina", () => {
    expect(searchFoods(CAT, "huevos")[0].food.slug).toBe("huevo");
    expect(searchFoods(CAT, "pollo cocido")[0].food.slug).toBe("pollo-cocido");
    expect(searchFoods(CAT, "ARROZ")).toHaveLength(2);
    expect(searchFoods(CAT, "milanesa de soja")).toEqual([]);
    expect(searchFoods(CAT, "  ")).toEqual([]);
  });
  it("[44] «Almorcé 200 gramos de pollo, arroz y una ensalada» → propuesta con lo que falta aclarar", () => {
    const p = parseFoodText(CAT, "Almorcé 200 gramos de pollo, arroz y una ensalada");
    expect(p.meal).toBe("almuerzo");
    expect(p.items.map((i) => i.query)).toEqual(["pollo", "arroz", "ensalada"]);
    expect(p.items[0].quantity).toEqual({ amount: 200, unit: "g" });
    expect(p.items[0].issues).toContain("ambiguous_state"); // ¿crudo o cocido?
    expect(p.items[1].issues).toEqual(expect.arrayContaining(["no_quantity", "ambiguous_state"]));
    expect(p.items[2].candidates[0]?.slug).toBe("lechuga");
    expect(p.items[2].issues).toContain("unit_unavailable"); // «una ensalada» no tiene equivalencia documentada
  });
  it("[17] texto ambiguo: cantidades caseras sólo con porción documentada; ml sin densidad no se convierte", () => {
    const p = parseFoodText(CAT, "desayuné 2 huevos, media taza de arroz cocido y 200 ml de yogur");
    expect(p.meal).toBe("desayuno");
    expect(p.items[0].quantity).toEqual({ amount: 2, unit: "portion:1" }); // «2 huevos»: la unidad mediana documentada
    expect(p.items[1].quantity).toEqual({ amount: 0.5, unit: "portion:0" });
    expect(p.items[1].candidates[0].slug).toBe("arroz-cocido");
    expect(p.items[2].quantity).toBeNull();
    expect(p.items[2].issues).toContain("unit_unavailable");
  });
  it("cantidades: decimales con coma, fracciones, kilos y «una banana»", () => {
    expect(parseFoodText(CAT, "1,5 kg de pollo cocido").items[0].quantity).toEqual({ amount: 1500, unit: "g" });
    expect(parseFoodText(CAT, "1/2 banana").items[0].quantity).toEqual({ amount: 0.5, unit: "portion:0" });
    expect(parseFoodText(CAT, "una banana").items[0].quantity).toEqual({ amount: 1, unit: "portion:0" });
    expect(parseFoodText(CAT, "comí algo raro").items.every((i) => i.issues.includes("no_match") || i.issues.includes("no_quantity"))).toBe(true);
  });
});
