import { describe, expect, it } from "vitest";
import { cleanWishes, hasWishes } from "./wishes";

describe("deseos de entrenamiento (D139)", () => {
  it("normaliza textos y números", () => {
    const r = cleanWishes({ goal: "muscle", daysPerWeek: "4", minutes: 60, likes: "  peso   libre ", avoid: "" });
    expect(r).toEqual({ ok: true, wishes: { goal: "muscle", daysPerWeek: 4, minutes: 60, likes: "peso libre", avoid: null } });
    expect(hasWishes(r.ok ? r.wishes : null)).toBe(true);
    expect(hasWishes(cleanWishes({}).ok ? { goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null } : null)).toBe(false);
  });
  it("rechaza valores fuera de rango o desconocidos", () => {
    expect(cleanWishes({ goal: "x" })).toMatchObject({ ok: false });
    expect(cleanWishes({ daysPerWeek: 8 })).toMatchObject({ ok: false });
    expect(cleanWishes({ minutes: 5 })).toMatchObject({ ok: false });
    expect(cleanWishes({ likes: "a".repeat(201) })).toMatchObject({ ok: false });
  });
});
