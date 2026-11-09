import { describe, expect, it } from "vitest";
import { cleanDecimalDraft, fmtWeight, kgTo, localizeWeights, parseWeightIn, stepWeightIn, toKg, volumeIn } from "./units";

describe("unidad de peso (F-HX-23)", () => {
  it("kg queda igual; lb redondea a 0,1 y vuelve al mismo valor mostrado", () => {
    expect(kgTo(82.5, "kg")).toBe(82.5);
    expect(kgTo(20.41, "lb")).toBe(45);
    expect(toKg(45, "lb")).toBe(20.41);
    for (const lb of [2.5, 45, 135, 225, 315.5]) expect(kgTo(toKg(lb, "lb"), "lb")).toBe(lb);
  });
  it("texto es-AR", () => {
    expect(fmtWeight(82.5, "kg")).toBe("82,5 kg");
    expect(fmtWeight(100, "lb")).toBe("220,5 lb");
    expect(volumeIn(1000, "lb")).toBe(2205);
  });
  it("± en lb parte del valor mostrado", () => {
    expect(kgTo(stepWeightIn(toKg(45, "lb"), 1, 5, "lb"), "lb")).toBe(50);
    expect(kgTo(stepWeightIn(toKg(2.5, "lb"), -1, 5, "lb"), "lb")).toBe(0);
    expect(stepWeightIn(20, 1, 2.5, "kg")).toBe(22.5);
  });
  it("entrada en lb valida en kg", () => {
    expect(parseWeightIn("135", "lb")).toBe(61.23);
    expect(parseWeightIn("62,5", "kg")).toBe(62.5);
    expect(parseWeightIn("2300", "lb")).toBeNull(); // > 1000 kg
    expect(parseWeightIn("1,234", "lb")).toBeNull();
    expect(parseWeightIn("", "lb")).toBeNull();
  });
  it("FSA1 MEMBER-01: cualquier peso con hasta 2 decimales se acepta (sin falsos «inválido» por coma flotante)", () => {
    // 1,1 · 4,1 · 64,1 · 1,15 · 82,55 kg: antes `n * 100` no daba entero exacto y se rechazaban.
    for (const [txt, kg] of [["1,1", 1.1], ["4,1", 4.1], ["64,1", 64.1], ["1,15", 1.15], ["0,29", 0.29], ["8,2", 8.2], ["70,1", 70.1]] as const) expect(parseWeightIn(txt, "kg")).toBe(kg);
    for (let i = 0; i <= 100000; i++) { const v = Number((i / 100).toFixed(2)); expect(parseWeightIn(String(v).replace(".", ","), "kg")).toBe(v); }
    // En lb, el valor que la pantalla precarga al tocar el número (p. ej. 70 kg = 154,3 lb) vuelve a aceptarse.
    for (let q = 0; q <= 4000; q++) { const shown = kgTo(q / 4, "lb"); expect(parseWeightIn(String(shown).replace(".", ","), "lb")).not.toBeNull(); }
    expect(parseWeightIn("154,3", "lb")).toBe(69.99);
    expect(parseWeightIn("-1", "kg")).toBeNull();
    expect(parseWeightIn("1000,01", "kg")).toBeNull();
  });
});

describe("D182 · edición del peso sin ceros agregados", () => {
  it("borrar todo queda vacío; reemplazar escribe lo nuevo; sin ceros a la izquierda", () => {
    expect(cleanDecimalDraft("")).toBe("");
    expect(cleanDecimalDraft("070")).toBe("70");
    expect(cleanDecimalDraft("00")).toBe("0");
    expect(cleanDecimalDraft("0")).toBe("0");
    expect(cleanDecimalDraft("0,5")).toBe("0,5");
  });
  it("coma o punto, un solo separador y hasta 2 decimales; pegar texto con unidad", () => {
    expect(cleanDecimalDraft("42,5")).toBe("42,5");
    expect(cleanDecimalDraft("42.75")).toBe("42.75");
    expect(cleanDecimalDraft("42,555")).toBe("42,55");
    expect(cleanDecimalDraft("4,2,5")).toBe("4,25");
    expect(cleanDecimalDraft(" 62,5 kg")).toBe("62,5");
    expect(parseWeightIn(cleanDecimalDraft("070"), "kg")).toBe(70);
    expect(parseWeightIn(cleanDecimalDraft(""), "kg")).toBeNull();
  });
});

describe("D191 · explicaciones en la unidad elegida", () => {
  it("kg queda igual; lb convierte cada carga con decimales", () => {
    const t = "Subí a 62,5 kg. La vez pasada: 60 kg × 8. −15 % del top set (102.5 kg)";
    expect(localizeWeights(t, "kg")).toBe(t);
    expect(localizeWeights(t, "lb")).toBe("Subí a 137,8 lb. La vez pasada: 132,3 lb × 8. −15 % del top set (226 lb)");
  });
  it("no convierte dos veces ni toca porcentajes, segundos o repeticiones", () => {
    const once = localizeWeights("Mantené 20 kg y 45 s; 8 reps; −20 %", "lb");
    expect(once).toBe("Mantené 44,1 lb y 45 s; 8 reps; −20 %");
    expect(localizeWeights(once, "lb")).toBe(once);
  });
  it("cargas chicas de mancuernas con dos decimales", () => {
    expect(localizeWeights("Probá 1,25 kg más", "lb")).toBe("Probá 2,8 lb más");
  });
});
