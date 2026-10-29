import { describe, expect, it } from "vitest";
import { cleanWishes, hasWishes, sharedWishes } from "./wishes";

describe("deseos de entrenamiento (D139)", () => {
  it("normaliza textos y números", () => {
    const r = cleanWishes({ goal: "muscle", daysPerWeek: "4", minutes: 60, likes: "  peso   libre ", avoid: "" });
    expect(r).toEqual({ ok: true, wishes: { goal: "muscle", daysPerWeek: 4, minutes: 60, likes: "peso libre", avoid: null, shareWithTrainers: false } });
    expect(hasWishes(r.ok ? r.wishes : null)).toBe(true);
    expect(hasWishes(cleanWishes({}).ok ? { goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null } : null)).toBe(false);
  });
  it("D147: sólo se comparte con quien arma la rutina si la persona lo eligió y completó algo", () => {
    const base = { goal: "strength" as const, daysPerWeek: 3, minutes: 45, likes: "barra", avoid: null };
    expect(sharedWishes({ ...base })).toBeNull(); // guardado antes de D147: no se comparte
    expect(sharedWishes({ ...base, shareWithTrainers: false })).toBeNull();
    expect(sharedWishes({ ...base, shareWithTrainers: true })).toEqual({ goal: "Ganar fuerza", daysPerWeek: 3, minutes: 45, likes: "barra", avoid: null });
    expect(sharedWishes({ goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null, shareWithTrainers: true })).toBeNull();
    expect(cleanWishes({ shareWithTrainers: "true" })).toMatchObject({ ok: true, wishes: { shareWithTrainers: false } });
  });
  it("rechaza valores fuera de rango o desconocidos", () => {
    expect(cleanWishes({ goal: "x" })).toMatchObject({ ok: false });
    expect(cleanWishes({ daysPerWeek: 8 })).toMatchObject({ ok: false });
    expect(cleanWishes({ minutes: 5 })).toMatchObject({ ok: false });
    expect(cleanWishes({ likes: "a".repeat(201) })).toMatchObject({ ok: false });
  });
});
