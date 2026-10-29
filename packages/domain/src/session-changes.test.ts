import { describe, expect, it } from "vitest";
import { canSubstitute, cleanSetNote, isChangeReason, matchProgramExercises, rankAlternatives, SUB_NOTE_MAX, cleanSubNote, withApproved } from "./session-changes";
import { sameSetValues } from "./sync";

describe("cambios en la sesión activa", () => {
  it("sólo reemplaza por otro ejercicio del mismo tipo de registro", () => {
    expect(canSubstitute({ id: "a", kind: "load_reps" }, { id: "b", kind: "load_reps" })).toBe(true);
    expect(canSubstitute({ id: "a", kind: "load_reps" }, { id: "a", kind: "load_reps" })).toBe(false);
    expect(canSubstitute({ id: "a", kind: "load_reps" }, { id: "c", kind: "time" })).toBe(false);
  });
  it("ordena alternativas: mismo grupo muscular primero", () => {
    const r = rankAlternatives({ id: "o", kind: "load_reps", muscleGroup: "Piernas" }, [
      { id: "x", name: "Remo", muscleGroup: "Espalda", kind: "load_reps" }, { id: "y", name: "Prensa", muscleGroup: "Piernas", kind: "load_reps" },
      { id: "z", name: "Plancha", muscleGroup: "Core", kind: "time" }, { id: "o", name: "Sentadilla", muscleGroup: "Piernas", kind: "load_reps" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["y", "x"]);
  });
  it("motivos y nota de serie", () => {
    expect(isChangeReason("busy")).toBe(true);
    expect(isChangeReason("x")).toBe(false);
    expect(cleanSetNote("  agarre   cerrado ")).toBe("agarre cerrado");
    expect(cleanSetNote("   ")).toBeNull();
    expect(cleanSetNote("a".repeat(300))).toHaveLength(200);
  });
  it("una nota distinta es un cambio de la serie; vacía equivale a sin nota", () => {
    const base = { weightKg: 50, reps: 8, rir: 2, feel: null };
    expect(sameSetValues({ ...base, note: "ok" }, { ...base, note: "otra" })).toBe(false);
    expect(sameSetValues({ ...base, note: "" }, { ...base, note: null })).toBe(true);
    expect(sameSetValues(base, { ...base, note: null })).toBe(true);
  });
});

describe("withApproved", () => {
  const ranked = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  it("pone primero las aprobadas en orden de aprobación y conserva el resto", () => {
    const r = withApproved(ranked, [{ id: "c", note: "Si la prensa está ocupada" }, { id: "a", note: null }]);
    expect(r.map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
    expect(r[0]).toMatchObject({ approved: true, approvedNote: "Si la prensa está ocupada" });
    expect(r[2]).toMatchObject({ approved: false, approvedNote: null });
  });
  it("ignora aprobaciones que no están entre las compatibles", () => {
    const r = withApproved(ranked, [{ id: "zz", note: null }]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.some((x) => x.approved)).toBe(false);
  });
  it("normaliza la nota", () => {
    expect(cleanSubNote("  si   no hay banco  ")).toBe("si no hay banco");
    expect(cleanSubNote("   ")).toBeNull();
    expect(cleanSubNote("x".repeat(200))).toHaveLength(SUB_NOTE_MAX);
  });
});

describe("matchProgramExercises (D145)", () => {
  it("empareja por ejercicio en orden y deja sin pareja a los quitados", () => {
    const prev = [{ id: "a1", exerciseId: "sq" }, { id: "a2", exerciseId: "bp" }, { id: "a3", exerciseId: "sq" }, { id: "a4", exerciseId: "row" }];
    const next = [{ id: "b1", exerciseId: "bp" }, { id: "b2", exerciseId: "sq" }, { id: "b3", exerciseId: "dl" }, { id: "b4", exerciseId: "sq" }];
    expect(matchProgramExercises(prev, next)).toEqual({ a1: "b2", a2: "b1", a3: "b4" });
  });
  it("sin cambios de ejercicios empareja todo", () => {
    expect(matchProgramExercises([{ id: "x", exerciseId: "e" }], [{ id: "y", exerciseId: "e" }])).toEqual({ x: "y" });
  });
});
