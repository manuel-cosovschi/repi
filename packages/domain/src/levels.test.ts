import { describe, expect, it } from "vitest";
import { EMPTY_STATS, isFullBody, levelCost, levelFromXp, trophyState, xpBreakdown, xpOf } from "./levels";

describe("nivel REPI (D166)", () => {
  it("cada nivel cuesta 40 puntos más que el anterior", () => {
    expect([1, 2, 3].map(levelCost)).toEqual([60, 100, 140]);
    expect(levelFromXp(0)).toMatchObject({ level: 1, toNext: 60, pct: 0 });
    expect(levelFromXp(59)).toMatchObject({ level: 1, toNext: 1 });
    expect(levelFromXp(60)).toMatchObject({ level: 2, floor: 60, next: 160, pct: 0 });
    expect(levelFromXp(110)).toMatchObject({ level: 2, pct: 50 });
    expect(levelFromXp(300)).toMatchObject({ level: 4 });
  });
  it("suma días, récords, ejercicios nuevos, toneladas y lo validado por el gym", () => {
    const s = { ...EMPTY_STATS, days: 3, prs: 2, exercises: 4, tons: 2.9, validated: 1, gymRecords: 1, months: 1 };
    expect(xpOf(s)).toBe(30 + 30 + 20 + 4 + 30 + 60 + 40);
    expect(xpBreakdown({ ...EMPTY_STATS, days: 2 })).toEqual([{ label: "Días entrenados", count: 2, xp: 20 }]);
  });
  it("trofeos: escalón alcanzado y lo que falta", () => {
    const t = trophyState({ ...EMPTY_STATS, days: 12, tons: 100 });
    expect(t.find((x) => x.key === "constancia")).toMatchObject({ tier: 1, tierName: "bronce", goal: 50, next: "50 días entrenados", pct: 5 });
    expect(t.find((x) => x.key === "volumen")).toMatchObject({ tier: 2, tierName: "plata", goal: 500 });
    expect(t.find((x) => x.key === "fuerza")).toMatchObject({ tier: 0, tierName: null, pct: 0 });
    expect(trophyState({ ...EMPTY_STATS, gymRecords: 10 }).find((x) => x.key === "gym")).toMatchObject({ tier: 3, goal: null, pct: 100 });
  });
  it("cuerpo completo: las seis zonas, glúteos cuenta como piernas", () => {
    expect(isFullBody(["Pecho", "Espalda", "Glúteos", "Hombros", "Brazos", "Core"])).toBe(true);
    expect(isFullBody(["Pecho", "Espalda", "Piernas", "Hombros", "Brazos", "Cuerpo completo"])).toBe(false);
  });
});
