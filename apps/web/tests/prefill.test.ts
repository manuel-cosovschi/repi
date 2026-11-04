// D182: precarga de pesos al restaurar o abrir una sesión (lib/offline/store.ts › fromServer). Un back-off, un drop o una
// aproximación sin peso en el plan no heredan la carga del top set ni la sugerencia del ejercicio: quedan por elegir.
import { describe, expect, it } from "vitest";
import { emptyDetail, presetPlan, type ExerciseDetail, type Suggestion } from "@repi/domain";
import { fromServer, setKey } from "@/lib/offline/store";

const sug = (weightKg: number, reps = 5): Suggestion => ({ action: "up", weightKg, reps, text: "", why: "" });
const ex = (id: string, sets: number, detail: ExerciseDetail | null, p: { suggest?: Suggestion | null; logs?: { setIndex: number; weightKg: number; reps: number }[]; defaultWeight?: number | null } = {}) => ({
  id, exerciseId: `x-${id}`, name: id, sets, reps: "5", rir: null, restSec: 90, note: null, prev: null, detail, suggest: p.suggest ?? null,
  defaultWeight: p.defaultWeight ?? null, defaultReps: 5,
  logs: (p.logs ?? []).map((l, i) => ({ id: `l${id}${i}`, exerciseId: `x-${id}`, rir: null, revision: 1, completedAt: new Date().toISOString(), ...l })),
});
const session = (exercises: ReturnType<typeof ex>[]) => fromServer({
  id: "s1", dayName: "Día", status: "in_progress", note: "", rpe: null, sessionNote: null, startedAt: new Date().toISOString(), endedAt: null,
  activeMs: 0, lastResumedAt: null, revision: 1, exercises,
});

describe("D182 · precarga de top set, back-off y drop", () => {
  const tb = { ...emptyDetail(), technique: "top_backoff" as const, setPlan: presetPlan("top_backoff", { sets: 3, reps: "5" }) };
  it("top set sin peso: el top toma la sugerencia y los back-off quedan por elegir", () => {
    const s = session([ex("a", 3, tb, { suggest: sug(100) })]);
    expect(s.sets[setKey("a", 0)]).toMatchObject({ w: 100, done: false });
    expect(s.sets[setKey("a", 1)]).toMatchObject({ w: 0, pend: true });
    expect(s.sets[setKey("a", 2)]).toMatchObject({ w: 0, pend: true });
  });
  it("sesión restaurada con el top hecho: los back-off siguen por elegir (no heredan 100 kg)", () => {
    const s = session([ex("a", 3, tb, { logs: [{ setIndex: 0, weightKg: 100, reps: 5 }], defaultWeight: 100 })]);
    expect(s.sets[setKey("a", 0)]).toMatchObject({ w: 100, done: true });
    expect(s.sets[setKey("a", 1)]).toMatchObject({ w: 0, pend: true });
  });
  it("back-off con peso explícito en el plan: se usa ese", () => {
    const d = { ...tb, setPlan: presetPlan("top_backoff", { sets: 3, reps: "5", weightKg: 100 }) };
    const s = session([ex("a", 3, d)]);
    expect(s.sets[setKey("a", 0)].w).toBe(100);
    expect(s.sets[setKey("a", 1)]).toMatchObject({ w: 85 });
    expect(s.sets[setKey("a", 1)].pend).toBeUndefined();
  });
  it("drop set sin peso: la principal con su última marca; los drops por elegir", () => {
    const ds = { ...emptyDetail(), technique: "drop_set" as const, setPlan: presetPlan("drop_set", { sets: 1, reps: "10" }) };
    const s = session([ex("d", 3, ds, { defaultWeight: 60 })]);
    expect(s.sets[setKey("d", 0)]).toMatchObject({ w: 60 });
    expect(s.sets[setKey("d", 1)]).toMatchObject({ w: 0, pend: true });
    expect(s.sets[setKey("d", 2)]).toMatchObject({ w: 0, pend: true });
  });
  it("drop set con peso definido en el plan: respeta el plan", () => {
    const ds = { ...emptyDetail(), technique: "drop_set" as const, setPlan: presetPlan("drop_set", { sets: 1, reps: "10", weightKg: 60 }) };
    const s = session([ex("d", 3, ds)]);
    expect([0, 1, 2].map((i) => s.sets[setKey("d", i)].w)).toEqual([60, 48, 36]);
  });
  it("series rectas (rutina manual o del profe): todas con la sugerencia, y después con lo último hecho", () => {
    expect([0, 1, 2].map((i) => session([ex("r", 3, null, { suggest: sug(62.5, 8) })]).sets[setKey("r", i)].w)).toEqual([62.5, 62.5, 62.5]);
    const s = session([ex("r", 3, null, { suggest: sug(62.5, 8), logs: [{ setIndex: 0, weightKg: 60, reps: 8 }] })]);
    expect(s.sets[setKey("r", 1)].w).toBe(60);
  });
});
