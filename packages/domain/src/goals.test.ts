import { describe, expect, it } from "vitest";
import { goalProgress, goalTitle } from "./goals";

describe("objetivos (F-CO-03)", () => {
  it("avance desde la línea base, en ambas direcciones, acotado 0–1", () => {
    expect(goalProgress({ baseline: 80, target: 90, current: 85 })).toBe(0.5);
    expect(goalProgress({ baseline: 80, target: 90, current: 95 })).toBe(1);
    expect(goalProgress({ baseline: 80, target: 90, current: 70 })).toBe(0);
    expect(goalProgress({ baseline: 90, target: 86, current: 89 })).toBe(0.25); // meta que baja (p. ej. cintura)
  });
  it("sin línea base usa actual ÷ meta; sin dato actual, null", () => {
    expect(goalProgress({ baseline: null, target: 4, current: 3 })).toBe(0.75);
    expect(goalProgress({ baseline: 4, target: 4, current: 2 })).toBe(0.5);
    expect(goalProgress({ baseline: 80, target: 90, current: null })).toBeNull();
  });
  it("títulos", () => {
    expect(goalTitle("load", { exercise: "Press de banca", target: 90, reps: 5 })).toBe("Press de banca 90 kg × 5");
    expect(goalTitle("e1rm", { exercise: "Sentadilla", target: 132.5 })).toBe("Sentadilla · 1RM estimado 132,5 kg");
    expect(goalTitle("frequency", { target: 4 })).toBe("4 entrenamientos por semana");
    expect(goalTitle("manual", { target: 37, title: "  Perímetro de brazo " })).toBe("Perímetro de brazo");
  });
});
