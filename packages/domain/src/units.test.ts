import { describe, expect, it } from "vitest";
import { fmtWeight, kgTo, parseWeightIn, stepWeightIn, toKg, volumeIn } from "./units";

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
});
