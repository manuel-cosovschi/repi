import { describe, expect, it } from "vitest";
import { makeExerciseMatcher } from "./exercise-match";

const lib = [
  { id: "bench", name: "Press de banca" },
  { id: "dumbbells", name: "Press de banca con mancuernas" },
  { id: "incline", name: "Press inclinado con barra" },
  { id: "incline-dumbbells", name: "Press inclinado mancuernas" },
  { id: "row", name: "Remo con barra" },
  { id: "squat", name: "Sentadilla" },
];

describe("nombres de ejercicios escritos en notas", () => {
  it("resuelve directamente nombres, abreviaturas y alias frecuentes", () => {
    const match = makeExerciseMatcher(lib);
    expect(match("PRESS PLANO")?.id).toBe("bench");
    expect(match("Banco plano")?.id).toBe("bench");
    expect(match("Bench press")?.id).toBe("bench");
    expect(match("Press plano con mancuernas")?.id).toBe("dumbbells");
    expect(match("Remo c/ barra")?.id).toBe("row");
    expect(match("Press banca")?.id).toBe("bench");
    expect(match("Sentadillas")?.id).toBe("squat");
  });
  it("un nombre exacto de la biblioteca tiene prioridad sobre un alias", () => {
    const local = { id: "mine", name: "Press plano" };
    expect(makeExerciseMatcher([...lib, local])("Press plano")).toEqual(local);
  });
  it("no elige una variante o implemento que las notas no indican", () => {
    const match = makeExerciseMatcher(lib);
    expect(match("Polea")).toBeNull();
    expect(match("Press inclinado")).toBeNull();
    expect(match("Press plano en máquina")).toBeNull();
    expect(match("Remo")).toBeNull();
  });
  it("un alias necesita un destino existente y una identidad sin ambigüedad", () => {
    expect(makeExerciseMatcher(lib)("RDL")).toBeNull();
    expect(makeExerciseMatcher([...lib, { id: "other", name: "PRESS DE BANCA" }])("Press plano")).toBeNull();
    expect(makeExerciseMatcher([...lib, { id: "other", name: "PRESS DE BANCA" }])("Press de banca")).toBeNull();
  });
});
