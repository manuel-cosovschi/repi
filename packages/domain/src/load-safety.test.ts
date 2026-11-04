import { describe, expect, it } from "vitest";
import { carriesLoad, checkLoad, floorToStep, progressionApplies, reducedLoadHint, startWeight } from "./load-safety";
import { emptyDetail, presetPlan } from "./prescription";

describe("D182 · validador común de cargas (reglas e IA)", () => {
  it("la carga del profe manda siempre", () => {
    expect(checkLoad({ proposedKg: 200, source: "ai", referenceKg: 60, coachKg: 65 })).toMatchObject({ weightKg: 65, status: "coach" });
  });
  it("IA con una suba excesiva: se recorta a la última marca + 2 pasos", () => {
    expect(checkLoad({ proposedKg: 110, source: "ai", referenceKg: 60 })).toMatchObject({ weightKg: 65, status: "capped" });
  });
  it("IA no puede superar la progresión calculada por reglas", () => {
    expect(checkLoad({ proposedKg: 65, source: "ai", referenceKg: 60, rulesKg: 62.5 })).toMatchObject({ weightKg: 62.5, status: "capped" });
  });
  it("IA con una carga menor: se acepta (es más prudente)", () => {
    expect(checkLoad({ proposedKg: 55, source: "ai", referenceKg: 60, rulesKg: 62.5 })).toMatchObject({ weightKg: 55, status: "ok" });
  });
  it("con una señal de seguridad el techo es la referencia", () => {
    expect(checkLoad({ proposedKg: 62.5, source: "ai", referenceKg: 60, blockIncrease: true })).toMatchObject({ weightKg: 60, status: "capped" });
    expect(checkLoad({ proposedKg: 62.5, source: "rules", referenceKg: 60, blockIncrease: true })).toMatchObject({ weightKg: 60, status: "capped" });
  });
  it("sin historial la IA no propone kilos; inválidos se rechazan", () => {
    expect(checkLoad({ proposedKg: 40, source: "ai", referenceKg: null })).toMatchObject({ weightKg: null, status: "rejected" });
    for (const x of [-5, 5000, Number.NaN, "abc", true]) expect(checkLoad({ proposedKg: x, source: "ai", referenceKg: 60 }).status).toBe("rejected");
    expect(checkLoad({ proposedKg: null, source: "ai", referenceKg: 60 })).toMatchObject({ weightKg: null, status: "ok" });
  });
  it("redondea a 0,25 kg y deja motivos legibles", () => {
    const r = checkLoad({ proposedKg: 300, source: "ai", referenceKg: 100 });
    expect(r.weightKg).toBe(110);
    expect(r.reasons[0]).toMatch(/no está respaldada/);
    expect(floorToStep(83.3)).toBe(82.5);
    expect(floorToStep(17.9)).toBe(17);
  });
});

describe("D182 · carga por tipo de serie", () => {
  it("un back-off, un drop o una aproximación nunca heredan la carga de otra serie", () => {
    expect(carriesLoad("top", "backoff")).toBe(false);
    expect(carriesLoad("work", "drop")).toBe(false);
    expect(carriesLoad("warmup", "work")).toBe(false);
    expect(carriesLoad("work", "work")).toBe(true);
    expect(carriesLoad("work", "rest_pause")).toBe(true); // rest-pause: misma carga
    expect(carriesLoad("work", "amrap")).toBe(true);
  });
  it("referencia para confirmar: back-off −15 % del top, drop −20 % de la anterior, redondeo hacia abajo", () => {
    const tb = presetPlan("top_backoff", { sets: 3, reps: "5" })!;
    expect(reducedLoadHint(tb, 1, [100, null, null])).toMatchObject({ weightKg: 85 });
    expect(reducedLoadHint(tb, 2, [102.5, 87.5, null])).toMatchObject({ weightKg: 85 });
    const ds = presetPlan("drop_set", { sets: 1, reps: "10" })!;
    expect(reducedLoadHint(ds, 1, [60, null, null])).toMatchObject({ weightKg: 47.5 });
    expect(reducedLoadHint(ds, 2, [60, 47.5, null])).toMatchObject({ weightKg: 37.5 });
    expect(reducedLoadHint(ds, 1, [0, null, null])).toBeNull(); // sin referencia no se inventa
    expect(reducedLoadHint(ds, 0, [60, null, null])).toBeNull(); // la principal no es reducida
  });
  it("la progresión del ejercicio vale sólo con series iguales", () => {
    expect(progressionApplies(null)).toBe(true);
    expect(progressionApplies({ ...emptyDetail(), setPlan: presetPlan("straight", { sets: 3, reps: "8", weightKg: 50 }) })).toBe(true);
    for (const t of ["top_backoff", "drop_set", "rest_pause", "pyramid", "amrap_last", "cluster"] as const)
      expect(progressionApplies({ ...emptyDetail(), technique: t, setPlan: presetPlan(t, { sets: 4, reps: "8-10" }) })).toBe(false);
  });
});

describe("D182 · peso de partida por serie", () => {
  it("plan del profe > reducida pendiente > sugerencia > anterior compatible", () => {
    expect(startWeight({ kind: "backoff", planKg: 80, suggestKg: 100, carriedKg: 100 })).toEqual({ w: 80, pending: false });
    expect(startWeight({ kind: "backoff", suggestKg: 100, carriedKg: 100 })).toEqual({ w: 0, pending: true });
    expect(startWeight({ kind: "drop", carriedKg: 60 })).toEqual({ w: 0, pending: true });
    expect(startWeight({ kind: "warmup", suggestKg: 60 })).toEqual({ w: 0, pending: true });
    expect(startWeight({ kind: "top", suggestKg: 100, carriedKg: 95 })).toEqual({ w: 100, pending: false });
    expect(startWeight({ kind: "work", carriedKg: 60 })).toEqual({ w: 60, pending: false });
    expect(startWeight({ kind: "work" })).toEqual({ w: 0, pending: false });
  });
});
