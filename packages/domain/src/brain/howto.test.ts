// D220 · Exercise Motion en el asistente: «¿cómo se hace…?» responde con la técnica oficial y la demostración, sin inventar.
import { describe, expect, it } from "vitest";
import { classify } from "./intents";
import { compose } from "./answers";
import { ALL_EX, EX, makeCtx } from "./fixtures";

describe("cómo se hace un ejercicio", () => {
  it("reconoce la pregunta y el ejercicio", () => {
    for (const q of ["¿cómo se hace la sentadilla?", "técnica de la sentadilla", "qué músculos trabaja la sentadilla", "mostrame cómo es la sentadilla"]) {
      const i = classify(q, { exercises: ALL_EX });
      expect(i.name, q).toBe("how_to");
      expect(i.slots.exerciseId, q).toBe(EX.sq.id);
    }
  });
  it("un método sigue siendo un método («cómo se hace un drop set»)", () => {
    expect(classify("¿cómo se hace un drop set?", { exercises: ALL_EX }).name).toBe("explain_method");
  });
  it("«cómo se hace este» durante el entrenamiento usa el ejercicio en curso", () => {
    const i = classify("¿cómo se hace este?", { exercises: ALL_EX, current: EX.pb });
    expect(i.name).toBe("how_to");
    expect(i.slots.exerciseId).toBe(EX.pb.id);
  });
  it("con técnica oficial: claves, músculos y la tarjeta de la demostración; sin ella, lo dice y deriva al profe", () => {
    const motion = { id: "sentadilla-barra", v: 1, match: "exact" as const };
    const r = compose({ name: "how_to", slots: {}, confidence: 0.9 }, makeCtx(), { exercise: EX.sq, howTo: { cues: ["Pecho arriba", "Todo el pie apoyado"], primary: ["Cuádriceps", "Glúteo mayor"], motion } });
    expect(r.text).toMatch(/pecho arriba y todo el pie apoyado/);
    expect(r.text).toMatch(/cuádriceps y glúteo mayor/);
    expect(r.cards.find((c) => c.type === "motion")).toMatchObject({ type: "motion", exerciseId: EX.sq.id, motion });
    const none = compose({ name: "how_to", slots: {}, confidence: 0.9 }, makeCtx(), { exercise: EX.sq, howTo: null });
    expect(none.text).toMatch(/Todavía no tengo una demostración/);
    expect(none.cards).toEqual([]);
  });
  it("una variante compatible se avisa como variante", () => {
    const r = compose({ name: "how_to", slots: {}, confidence: 0.9 }, makeCtx(), { exercise: EX.sq, howTo: { cues: ["Pecho arriba"], primary: ["Cuádriceps"], motion: { id: "sentadilla-barra", v: 1, match: "compatible", difference: "En el multipower la barra va guiada." } } });
    expect(r.text).toMatch(/variante parecida\. En el multipower/);
  });
});
