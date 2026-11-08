import { describe, expect, it } from "vitest";
import { emptyDetail, type ExerciseDetail, type SetSpec } from "./prescription";
import { exerciseComplete, exerciseMetrics, sessionMetrics } from "./metrics";
import { applyMethod } from "./stages";
import { volumeKg, bestE1rm } from "./training";

const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const D = (setPlan: SetSpec[] | null, p: Partial<ExerciseDetail> = {}): ExerciseDetail => ({ ...emptyDetail(), setPlan, ...p });
const L = (setIndex: number, weightKg: number | null, reps: number | null) => ({ setIndex, weightKg, reps });

describe("D183 · métricas con una sola definición", () => {
  it("una serie y tres series convencionales", () => {
    expect(exerciseMetrics({ sets: 1, reps: "10" }, [L(0, 60, 10)])).toMatchObject({ mainPlanned: 1, mainDone: 1, stagesDone: 0, reps: 10, tonnageKg: 600 });
    expect(exerciseMetrics({ sets: 3, reps: "10" }, [L(0, 60, 10), L(1, 60, 10), L(2, 60, 9)])).toMatchObject({ mainPlanned: 3, mainDone: 3, reps: 29, tonnageKg: 1740 });
  });
  it("calentamiento: aparte; no suma reps, tonelaje ni récords", () => {
    const e = { sets: 3, reps: "10", detail: D([S("warmup", "12", { weightKg: 30 }), S("work", "10"), S("work", "10")]) };
    const m = exerciseMetrics(e, [L(0, 30, 12), L(1, 60, 10), L(2, 60, 10)]);
    expect(m).toMatchObject({ warmupPlanned: 1, warmupDone: 1, mainPlanned: 2, mainDone: 2, reps: 20, tonnageKg: 1200, rowsDone: 3 });
    expect(volumeKg([{ exerciseId: "x", weightKg: 30, reps: 12, completed: true, warmup: true }])).toBe(0);
    expect(bestE1rm([{ exerciseId: "x", weightKg: 30, reps: 1, completed: true, warmup: true }])).toBeNull();
  });
  it("drop set: 4 series principales + 2 etapas; el tonelaje incluye los kilos reales de las etapas; no son «6 series»", () => {
    const d = applyMethod(null, { sets: 4, reps: "10", rir: null }, "drop_set", [3]).detail;
    const logs = [L(0, 60, 10), L(1, 60, 10), L(2, 60, 10), L(3, 60, 10), L(4, 50, 8), L(5, 40, 10)];
    const m = exerciseMetrics({ sets: 6, reps: "10", detail: d }, logs);
    expect(m).toMatchObject({ mainPlanned: 4, mainDone: 4, stagesPlanned: 2, stagesDone: 2, rowsDone: 6, reps: 58, tonnageKg: 2400 + 400 + 400 });
    // drop omitido: la serie cuenta igual
    const skipped = exerciseMetrics({ sets: 6, reps: "10", detail: d }, logs.slice(0, 5));
    expect([skipped.mainDone, skipped.stagesDone]).toEqual([4, 1]);
    expect(exerciseComplete({ sets: 6, reps: "10", detail: d }, (k) => k < 4)).toBe(true);
    expect(exerciseComplete({ sets: 6, reps: "10", detail: d }, (k) => k < 3)).toBe(false);
  });
  it("rest-pause: 1 serie con mini series; registro parcial", () => {
    const d = applyMethod(null, { sets: 1, reps: "10", rir: null }, "rest_pause", [0], { stages: 3 }).detail;
    const m = exerciseMetrics({ sets: 4, reps: "10", detail: d }, [L(0, 60, 10), L(1, 60, 4)]);
    expect(m).toMatchObject({ mainPlanned: 1, mainDone: 1, stagesPlanned: 3, stagesDone: 1, reps: 14, tonnageKg: 840 });
  });
  it("superserie: cada ejercicio cuenta sus propias series", () => {
    const m = sessionMetrics([
      { ex: { sets: 3, reps: "10", detail: D(null, { group: "A", groupKind: "superset" }) }, logs: [L(0, 20, 10), L(1, 20, 10), L(2, 20, 10)] },
      { ex: { sets: 3, reps: "12", detail: D(null, { group: "A", groupKind: "superset" }) }, logs: [L(0, 15, 12), L(1, 15, 12)] },
    ]);
    expect(m).toMatchObject({ mainPlanned: 6, mainDone: 5, tonnageKg: 600 + 360 });
  });
  it("AMRAP por tiempo: duración y rondas, sin kilos × rondas", () => {
    const d = applyMethod(null, { sets: 1, reps: "10", rir: null }, "amrap_time", [0], { durationSec: 600, countUnit: "rounds" }).detail;
    expect(exerciseMetrics({ sets: 1, reps: "10", detail: d }, [L(0, 20, 7)])).toMatchObject({ mainDone: 1, timeSec: 600, rounds: 7, reps: 0, tonnageKg: 0 });
    const reps = applyMethod(null, { sets: 1, reps: "10", rir: null }, "amrap_time", [0], { durationSec: 300, countUnit: "reps" }).detail;
    expect(exerciseMetrics({ sets: 1, reps: "10", detail: reps }, [L(0, 20, 50)])).toMatchObject({ timeSec: 300, rounds: 0, reps: 50, tonnageKg: 1000 });
  });
  it("EMOM: cada intervalo es una serie principal; series por tiempo no multiplican kilos por segundos", () => {
    const emom = applyMethod(null, { sets: 5, reps: "5", rir: null }, "emom", []).detail;
    expect(exerciseMetrics({ sets: 5, reps: "5", detail: emom }, [0, 1, 2, 3, 4].map((i) => L(i, 80, 5)))).toMatchObject({ mainPlanned: 5, mainDone: 5, reps: 25, tonnageKg: 2000 });
    expect(exerciseMetrics({ sets: 2, reps: "40 s" }, [L(0, 20, 40), L(1, 20, 38)])).toMatchObject({ mainDone: 2, timeSec: 78, reps: 0, tonnageKg: 0 });
  });
  it("circuito: 4 ejercicios × 3 vueltas, 2 completas y 1 parcial", () => {
    const ex = { sets: 3, reps: "10", detail: D(null, { group: "B", groupKind: "circuit", rounds: 3 }) };
    const m = sessionMetrics([0, 1, 2, 3].map((i) => ({ ex, logs: [L(0, 10, 10), L(1, 10, 10), ...(i < 2 ? [L(2, 10, 10)] : [])] })));
    expect(m).toMatchObject({ mainPlanned: 12, mainDone: 10, reps: 100, tonnageKg: 1000 });
  });
  it("unilateral: las reps son por lado y no se duplican", () => {
    expect(exerciseMetrics({ sets: 2, reps: "10", detail: D(null, { unilateral: true }) }, [L(0, 12, 10), L(1, 12, 10)])).toMatchObject({ reps: 20, tonnageKg: 240 });
  });
  it("historial antiguo (plan plano con drops, sin bloques): mismas cuentas que el formato nuevo, sin doble conteo", () => {
    const old = D([S("work", "10", { weightKg: 60 }), S("drop", "al fallo", { weightKg: 48 }), S("drop", "al fallo", { weightKg: 36 })], { technique: "drop_set" });
    const m = exerciseMetrics({ sets: 3, reps: "10", detail: old }, [L(0, 60, 10), L(1, 48, 8), L(2, 36, 6)]);
    expect(m).toMatchObject({ mainPlanned: 1, mainDone: 1, stagesDone: 2, rowsDone: 3, tonnageKg: 600 + 384 + 216 });
    expect(m.tonnageKg).toBe(volumeKg([L(0, 60, 10), L(1, 48, 8), L(2, 36, 6)].map((l) => ({ exerciseId: "x", weightKg: l.weightKg, reps: l.reps, completed: true }))));
  });
});

describe("ejercicios por tiempo · métricas", () => {
  it("una actividad suma tiempo, nunca repeticiones ni tonelaje (aunque diga «500 m» o traiga un peso por error)", () => {
    const remo = { sets: 1, reps: "500 m", detail: D(null, { activity: { profile: "rower", distanceM: 500 } }) };
    const m = exerciseMetrics(remo, [{ setIndex: 0, weightKg: 20, reps: 130 }]);
    expect(m).toMatchObject({ timeSec: 130, reps: 0, tonnageKg: 0, mainDone: 1, mainPlanned: 1 });
    const cinta = { sets: 1, reps: "10 min", detail: D(null, { activity: { profile: "treadmill", speedKmh: 5, incline: 3 } }) };
    expect(exerciseMetrics(cinta, [{ setIndex: 0, weightKg: null, reps: 720 }])).toMatchObject({ timeSec: 720, reps: 0, tonnageKg: 0 });
    expect(exerciseComplete(cinta, (k) => k === 0)).toBe(true);
  });
  it("sin actividad, «10 min» sigue siendo por tiempo y «10-12», repeticiones (sin cambios)", () => {
    expect(exerciseMetrics({ sets: 1, reps: "10 min" }, [{ setIndex: 0, weightKg: null, reps: 600 }])).toMatchObject({ timeSec: 600, reps: 0 });
    expect(exerciseMetrics({ sets: 1, reps: "10-12" }, [{ setIndex: 0, weightKg: 50, reps: 10 }])).toMatchObject({ timeSec: 0, reps: 10, tonnageKg: 500 });
  });
});
