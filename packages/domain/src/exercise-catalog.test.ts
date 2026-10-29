import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG, EXERCISE_GROUPS, cleanExerciseName, exerciseKey } from "./exercise-catalog";

describe("catálogo de ejercicios", () => {
  it("es amplio, sin duplicados y con grupos válidos", () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(180);
    const keys = EXERCISE_CATALOG.map(([n]) => exerciseKey(n));
    expect(new Set(keys).size).toBe(keys.length);
    expect(EXERCISE_CATALOG.every(([, g]) => (EXERCISE_GROUPS as readonly string[]).includes(g))).toBe(true);
  });
  it("conserva los nombres que ya existen en la base (no duplica)", () => {
    for (const n of ["Press de banca", "Jalón al pecho", "Sentadilla goblet", "Curl femoral", "Plancha", "Gemelos de pie", "Flexiones", "Curl con barra"])
      expect(EXERCISE_CATALOG.some(([x]) => x === n)).toBe(true);
  });
  it("limpia y valida el nombre de un ejercicio propio", () => {
    expect(cleanExerciseName("  remo   gorila ")).toBe("Remo gorila");
    expect(cleanExerciseName("x")).toBeNull();
    expect(cleanExerciseName("123")).toBeNull();
    expect(cleanExerciseName("a".repeat(61))).toBeNull();
    expect(exerciseKey("Jalón al Pecho")).toBe(exerciseKey("jalon al pecho"));
  });
});
