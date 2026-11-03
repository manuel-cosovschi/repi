// D182: precarga de pesos al restaurar o abrir una sesión (lib/offline/store.ts › fromServer). Un back-off, un drop o una
// aproximación sin peso en el plan no heredan la carga del top set ni la sugerencia del ejercicio: quedan por elegir.
import { describe, expect, it } from "vitest";
import { applyMethod, emptyDetail, presetPlan, type ExerciseDetail, type Suggestion } from "@repi/domain";
import { fromServer, keepLocalOnly, rowResolved, setKey } from "@/lib/offline/store";

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
    // D183: la plantilla ya no calcula los back-off; el profe escribe la carga de cada uno.
    const d = { ...tb, setPlan: presetPlan("top_backoff", { sets: 3, reps: "5", weightKg: 100 })!.map((x, i) => (i ? { ...x, weightKg: 85 } : x)) };
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
    const ds = { ...emptyDetail(), technique: "drop_set" as const, setPlan: presetPlan("drop_set", { sets: 1, reps: "10", weightKg: 60 })!.map((x, i) => (i ? { ...x, weightKg: [0, 48, 36][i] } : x)) };
    const s = session([ex("d", 3, ds)]);
    expect([0, 1, 2].map((i) => s.sets[setKey("d", i)].w)).toEqual([60, 48, 36]);
  });
  it("series rectas (rutina manual o del profe): todas con la sugerencia, y después con lo último hecho", () => {
    expect([0, 1, 2].map((i) => session([ex("r", 3, null, { suggest: sug(62.5, 8) })]).sets[setKey("r", i)].w)).toEqual([62.5, 62.5, 62.5]);
    const s = session([ex("r", 3, null, { suggest: sug(62.5, 8), logs: [{ setIndex: 0, weightKg: 60, reps: 8 }] })]);
    expect(s.sets[setKey("r", 1)].w).toBe(60);
  });
});

describe("D183 · etapas conectadas en el teléfono (offline)", () => {
  const drop = (sets: number) => applyMethod(null, { sets, reps: "10", rir: 2 }, "drop_set", [sets - 1], { stages: 2 }).detail;
  it("restaurar una sesión con drops: las series principales con su carga, los drops por elegir", () => {
    const s = session([ex("d", 6, drop(4), { logs: [{ setIndex: 0, weightKg: 60, reps: 10 }], defaultWeight: 60 })]);
    expect([0, 1, 2, 3].map((i) => s.sets[setKey("d", i)].w)).toEqual([60, 60, 60, 60]);
    expect([4, 5].map((i) => s.sets[setKey("d", i)])).toMatchObject([{ w: 0, pend: true }, { w: 0, pend: true }]);
  });
  it("D184: las omisiones vienen del servidor (de cualquier dispositivo); una deshecha en otro no vuelve; lo registrado manda", () => {
    const skips = [{ setIndex: 5, skipped: true, changedAt: "2026-11-03T10:00:00.000Z" }, { setIndex: 4, skipped: true, changedAt: "2026-11-03T10:00:00.000Z" }];
    const fresh = session([{ ...ex("d", 6, drop(4), { logs: [{ setIndex: 4, weightKg: 45, reps: 8 }] }), skips } as ReturnType<typeof ex>]);
    expect(fresh.sets[setKey("d", 5)]).toMatchObject({ skip: true, done: false });
    expect(rowResolved(fresh.sets[setKey("d", 5)])).toBe(true);
    expect(fresh.sets[setKey("d", 4)]).toMatchObject({ done: true, w: 45 }); // registrado: no queda omitido
    expect(fresh.sets[setKey("d", 4)].skip).toBeUndefined();
    // Otro dispositivo la deshizo (skipped=false): manda el servidor aunque este teléfono la tuviera omitida.
    const undone = session([{ ...ex("d", 6, drop(4)), skips: [{ setIndex: 5, skipped: false, changedAt: "2026-11-03T10:05:00.000Z" }] } as ReturnType<typeof ex>]);
    const local = session([ex("d", 6, drop(4))]);
    local.sets[setKey("d", 5)] = { ...local.sets[setKey("d", 5)], skip: true, skipAt: "2026-11-03T10:00:00.000Z" };
    const merged = keepLocalOnly(undone, local, new Set([setKey("d", 5)]));
    expect(merged.session.sets[setKey("d", 5)].skip).toBe(false);
    expect(merged.upload).toEqual([]);
    expect(rowResolved(merged.session.sets[setKey("d", 0)])).toBe(false);
  });
  it("D184: una omisión guardada sólo en el teléfono (versión anterior) se conserva y se marca para subir", () => {
    const local = session([ex("d", 6, drop(4))]);
    local.sets[setKey("d", 5)] = { ...local.sets[setKey("d", 5)], skip: true };
    const merged = keepLocalOnly(session([ex("d", 6, drop(4))]), local, new Set());
    expect(merged.session.sets[setKey("d", 5)].skip).toBe(true);
    expect(merged.upload).toEqual([setKey("d", 5)]);
  });
  it("D184: el intervalo EMOM del servidor se traduce al reloj del teléfono", () => {
    const serverNow = new Date(Date.now() + 30_000).toISOString(); // el servidor va 30 s adelante de este teléfono
    const startedAt = new Date(Date.parse(serverNow) - 20_000).toISOString(); // empezó hace 20 s (hora del servidor)
    const s = fromServer({ id: "s1", dayName: "Día", status: "in_progress", note: "", rpe: null, sessionNote: null, startedAt: new Date().toISOString(), endedAt: null,
      activeMs: 0, lastResumedAt: null, revision: 1, exercises: [ex("d", 3, null)], serverNow,
      interval: { peId: "d", block: 1, startedAt, emomSec: 60, status: "running", at: startedAt } });
    expect(s.iv).toMatchObject({ peId: "d", block: 1, emomSec: 60, status: "running" });
    expect(Math.abs(Date.now() - 20_000 - s.iv!.start)).toBeLessThan(1500);
  });
});
