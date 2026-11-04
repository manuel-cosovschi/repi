import { describe, expect, it } from "vitest";
import { applyLoad, canApplyLoad, coachSetLoads, suggestNext, type LastSet } from "./progression";
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
    // Con la misma prescripción la última vez (8-10), quedar lejos del piso es no haber podido: baja un 10 %.
    expect(suggestNext({ reps: "8-10", sets: 3, lastReps: "8-10", last: sets(80, 5, 4, 4) })).toMatchObject({ action: "down", weightKg: 72.5, reps: 8 });
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

const L = (w: number | null, r: number, x: Partial<LastSet> = {}): LastSet => ({ weightKg: w, reps: r, ...x });

describe("D182 · comparables al cambiar el rango de repeticiones", () => {
  it("100 kg × 5 → hoy 10-12: estimación prudente por debajo de lo que daría la fórmula, nunca 90 kg", () => {
    const s = suggestNext({ reps: "10-12", sets: 3, last: [L(100, 5), L(100, 5), L(100, 5)] })!;
    expect(s).toMatchObject({ action: "estimate", reps: 10, guards: ["range_change"] });
    // Epley 100×5 ≈ 116,7 kg → 12 reps ≈ 83,3 kg; con margen del 90 % y redondeo hacia abajo: 75 kg.
    expect(s.weightKg).toBe(75);
    expect(s.weightKg!).toBeLessThan(83.3);
    expect(s.why).toMatch(/estimación prudente/);
  });
  it("con la prescripción anterior conocida, otro rango también es estimación aunque las reps queden cerca", () => {
    expect(suggestNext({ reps: "10-12", sets: 3, lastReps: "6", last: [L(80, 7), L(80, 7), L(80, 7)] })).toMatchObject({ action: "estimate" });
    expect(suggestNext({ reps: "8-10", sets: 3, lastReps: "8-12", last: [L(60, 10), L(60, 10), L(60, 10)] })).toMatchObject({ action: "up", weightKg: 62.5 });
  });
  it("60 × 10 → hoy 8-10 sube; 60 × 12 → hoy 12-15 suma una repetición", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: [L(60, 10), L(60, 10), L(60, 10)] })).toMatchObject({ action: "up", weightKg: 62.5, reps: 8 });
    expect(suggestNext({ reps: "12-15", sets: 3, last: [L(60, 12), L(60, 12), L(60, 12)] })).toMatchObject({ action: "reps", weightKg: 60, reps: 13 });
  });
  it("muchas más repeticiones que hoy: la misma carga como punto de partida, sin subir", () => {
    expect(suggestNext({ reps: "4-6", sets: 3, last: [L(60, 15), L(60, 15)] })).toMatchObject({ action: "estimate", weightKg: 60, reps: 4 });
  });
  it("fuera del rango de la fórmula o sin carga: no inventa kilos", () => {
    expect(suggestNext({ reps: "20-25", sets: 3, last: [L(60, 2)] })?.weightKg ?? null).not.toBeGreaterThan(60);
    expect(suggestNext({ reps: "10-12", sets: 3, last: [L(null, 5)] })).toMatchObject({ weightKg: null }); // peso corporal: en reps
    expect(suggestNext({ reps: "10-12", sets: 3, last: [L(100, 0)] })).toBeNull();
  });
  it("historial incompleto (una serie) no sube: pide completar", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: [L(60, 10)] })).toMatchObject({ action: "reps", weightKg: 60, reps: 10 });
  });
  it("las series reducidas y las mini series no son referencia (top set + back-off de la última vez)", () => {
    const last = [L(100, 5, { kind: "top" }), L(85, 8, { kind: "backoff" }), L(85, 8, { kind: "backoff" }), L(40, 10, { kind: "warmup" })];
    const s = suggestNext({ reps: "3-5", sets: 1, last })!;
    expect(s).toMatchObject({ action: "up", weightKg: 105 });
    expect(suggestNext({ reps: "8-10", sets: 3, last: [L(60, 10, { kind: "drop" })] })).toBeNull();
  });
});

describe("D182 · seguridad: señales que frenan la suba", () => {
  const top = [L(60, 10), L(60, 10), L(60, 10)];
  it("molestia la última vez en el ejercicio: baja un 10 % y lo explica", () => {
    const s = suggestNext({ reps: "8-10", sets: 3, last: [L(60, 10), L(60, 10, { feel: "molestia" }), L(60, 10)] })!;
    expect(s).toMatchObject({ action: "down", weightKg: 52.5, guards: ["pain_exercise"] });
    expect(s.why).toMatch(/no se sube/);
    expect(suggestNext({ reps: "8-10", sets: 3, last: top, signals: { painExercise: true } })).toMatchObject({ action: "down" });
  });
  it("molestia con otro rango: baja desde la estimación, no desde la carga pesada", () => {
    expect(suggestNext({ reps: "10-12", sets: 3, last: [L(100, 5, { feel: "molestia" })] })).toMatchObject({ action: "down", weightKg: 67.5 });
  });
  it("RIR 0 o «al límite» en todas: no sube, repite la carga", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: top.map((x) => ({ ...x, rir: 0 })) })).toMatchObject({ action: "hold", weightKg: 60, guards: ["max_effort"] });
    expect(suggestNext({ reps: "8-10", sets: 3, last: top.map((x) => ({ ...x, feel: "limite" })) })).toMatchObject({ action: "hold" });
    // Con margen (RIR 2) sí sube.
    expect(suggestNext({ reps: "8-10", sets: 3, last: top.map((x) => ({ ...x, rir: 2 })) })).toMatchObject({ action: "up" });
    // Dentro del rango con RIR 0: no suma la repetición.
    expect(suggestNext({ reps: "8-10", sets: 3, last: [L(60, 9, { rir: 0 }), L(60, 8, { rir: 0 }), L(60, 8, { rir: 0 })] })).toMatchObject({ action: "hold", reps: 8 });
  });
  it("lesión o molestia reciente en general, o poca energía hoy: mantiene", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: top, signals: { painOrInjury: true } })).toMatchObject({ action: "hold", guards: ["pain_or_injury"] });
    expect(suggestNext({ reps: "8-10", sets: 3, last: top, signals: { lowReadiness: true } })).toMatchObject({ action: "hold", guards: ["low_readiness"] });
  });
  it("inactividad: 2 semanas mantiene, más de 4 semanas baja", () => {
    expect(suggestNext({ reps: "8-10", sets: 3, last: top, signals: { daysSinceLast: 15 } })).toMatchObject({ action: "hold", guards: ["inactive_hold"] });
    expect(suggestNext({ reps: "8-10", sets: 3, last: top, signals: { daysSinceLast: 40 } })).toMatchObject({ action: "down", weightKg: 52.5, guards: ["inactive_reduce"] });
    expect(suggestNext({ reps: "8-10", sets: 3, last: top, signals: { daysSinceLast: 6 } })).toMatchObject({ action: "up" });
  });
  it("peso corporal con molestia: no suma repeticiones", () => {
    expect(suggestNext({ reps: "8-12", sets: 3, last: [L(null, 10, { feel: "molestia" })] })).toMatchObject({ action: "hold", weightKg: null });
  });
});
