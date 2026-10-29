import { describe, expect, it } from "vitest";
import { applyLoad, canApplyLoad, coachSetLoads, suggestNext } from "./progression";
import { emptyDetail, presetPlan } from "./prescription";

const sets = (w: number | null, ...reps: number[]) => reps.map((r) => ({ weightKg: w, reps: r }));

describe("D154 · progresión sugerida", () => {
  it("todas las series en el tope del rango: sube la carga y vuelve al piso", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: sets(60, 10, 10, 10) })).toMatchObject({ action: "up", weightKg: 62.5, reps: 8, text: "62,5 kg × 8" });
    expect(suggestNext({ reps: "5", sets: 3, last: sets(100, 5, 5, 5) })).toMatchObject({ action: "up", weightKg: 105, reps: 5 });
    expect(suggestNext({ reps: "10-12", sets: 3, last: sets(12, 12, 12, 12) })).toMatchObject({ action: "up", weightKg: 13 }); // mancuernas: +1 kg
  });
  it("dentro del rango: mismo peso, una repetición más", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: sets(60, 9, 8, 8) })).toMatchObject({ action: "reps", weightKg: 60, reps: 9 });
    // Tope alcanzado pero faltó una serie: no sube todavía.
    expect(suggestNext({ reps: "8-10", sets: 3, last: sets(60, 10, 10) })).toMatchObject({ action: "reps", weightKg: 60, reps: 10 });
  });
  it("debajo del piso: repite; lejos del piso: baja un 10 %", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: sets(60, 8, 7, 7) })).toMatchObject({ action: "hold", weightKg: 60, reps: 8 });
    expect(suggestNext({ reps: "8-10", sets: 3, last: sets(80, 5, 4, 4) })).toMatchObject({ action: "down", weightKg: 72.5, reps: 8 });
  });
  it("usa las series con la carga más alta (aproximaciones fuera)", () => {
    expect(suggestNext({ reps: "6-8", sets: 2, last: [{ weightKg: 40, reps: 10 }, ...sets(70, 8, 8)] })).toMatchObject({ action: "up", weightKg: 72.5 });
  });
  it("peso corporal: progresa en repeticiones", () => {
    expect(suggestNext({ reps: "8-12", sets: 3, last: sets(null, 10, 9, 9) })).toMatchObject({ action: "reps", weightKg: null, reps: 10 });
    expect(suggestNext({ reps: "8-12", sets: 3, last: sets(0, 12, 12, 12) })?.action).toBe("up");
  });
  it("sin rango de repeticiones o sin datos, no sugiere", () => {
    expect(suggestNext({ reps: "40 s", sets: 3, last: sets(20, 40) })).toBeNull();
    expect(suggestNext({ reps: "al fallo", sets: 3, last: sets(20, 10) })).toBeNull();
    expect(suggestNext({ reps: "8-10", sets: 3, last: [] })).toBeNull();
  });
  it("el profe aplica la carga en el plan serie por serie; con top set no se ofrece", () => {
    const d = applyLoad(null, 3, "8-10", 62.5);
    expect(d.setPlan).toHaveLength(3);
    expect(d.setPlan!.every((s) => s.kind === "work" && s.weightKg === 62.5 && s.reps === "8-10")).toBe(true);
    expect(coachSetLoads(d)).toBe(true);
    expect(coachSetLoads(emptyDetail())).toBe(false);
    expect(canApplyLoad({ ...emptyDetail(), technique: "top_backoff", setPlan: presetPlan("top_backoff", { sets: 3, reps: "8", weightKg: 100 }) })).toBe(false);
    expect(canApplyLoad(d)).toBe(true);
  });
});
