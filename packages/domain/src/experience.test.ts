// D195 · Bloque 05/06: reglas puras de correcciones del historial y de cargas disponibles por sede.
import { describe, expect, it } from "vitest";
import {
  correctionSummary, correctionWarnings, diffValues, equipmentLadder, fitTargetsToLoads, historyActions, parseLoadList, resolveLadder, validateCorrection, validateEquipment,
  type CorrectableValues, type RowTarget,
} from "./index";

const base: CorrectableValues = { weightKg: 80, reps: 8, rir: 2, feel: "bien", note: null };
const kg = (n: number) => `${String(n).replace(".", ",")} kg`;

describe("correcciones del historial", () => {
  it("80 kg × 8 → 85 kg × 8: sólo cambia el peso, con el valor anterior", () => {
    expect(diffValues(base, { weightKg: 85, reps: 8 })).toEqual({ before: { weightKg: 80 }, after: { weightKg: 85 } });
    expect(correctionSummary(diffValues(base, { weightKg: 85 })!, kg)).toBe("Peso: 80 kg → 85 kg");
  });
  it("sin cambios no hay corrección (un reintento no duplica)", () => {
    expect(diffValues(base, { weightKg: 80, reps: 8, rir: 2 })).toBeNull();
  });
  it("RIR, sensación y nota se corrigen; la nota no se repite en el resumen", () => {
    const d = diffValues(base, { rir: 0, feel: "limite", note: "agarre cerrado" })!;
    expect(d.after).toEqual({ rir: 0, feel: "limite", note: "agarre cerrado" });
    expect(correctionSummary(d, kg)).toBe("RIR: RIR 2 → RIR 0 · Sensación: Bien → Al límite · Nota editada");
  });
  it("usa el mismo validador que el registro en vivo", () => {
    expect(validateCorrection({ ...base, weightKg: 80.555 }, { timed: false })[0].field).toBe("weightKg");
    expect(validateCorrection({ ...base, weightKg: 1200 }, { timed: false })[0].field).toBe("weightKg");
    expect(validateCorrection({ ...base, reps: 250 }, { timed: false })[0].field).toBe("reps");
    expect(validateCorrection({ ...base, reps: 250 }, { timed: true })).toEqual([]); // segundos
    expect(validateCorrection({ ...base, rir: 6 }, { timed: false })[0].field).toBe("rir");
    expect(validateCorrection({ ...base, feel: "genial" }, { timed: false })[0].field).toBe("feel");
    expect(validateCorrection({ ...base, reps: 0 }, { timed: false })[0].message).toMatch(/anulala/);
    expect(validateCorrection(base, { timed: false, reason: "x".repeat(201) })[0].field).toBe("reason");
    expect(validateCorrection({ ...base, weightKg: null }, { timed: false })).toEqual([]); // peso corporal
  });
  it("200 kg en vez de 100 kg pide confirmar", () => {
    expect(correctionWarnings({ ...base, weightKg: 200 }, { weightKg: 100 })).toEqual(["large_load_change"]);
    expect(correctionWarnings(base, { weightKg: 82.5 })).toEqual([]);
    expect(correctionWarnings(base, { reps: 20 })).toEqual(["large_reps_change"]);
  });
  it("acciones por estado: sólo completadas se corrigen; anuladas se restauran; abiertas no", () => {
    expect(historyActions("completed")).toEqual({ edit: true, voidSession: true, restoreSession: false });
    expect(historyActions("voided")).toEqual({ edit: false, voidSession: false, restoreSession: true });
    expect(historyActions("in_progress").edit).toBe(false);
  });
});

const target = (p: Partial<RowTarget>): RowTarget => ({
  setIndex: 0, specId: "r0", kind: "work", block: 0, stage: 0, status: "ready", action: "hold", source: "rules", quality: "high", weightKg: 15,
  repsMin: 8, repsMax: 12, repsTarget: 10, rirTarget: null, rpeTarget: null, restSec: 90, restSuggestSec: null, pending: false,
  guards: [], reasons: [], text: "", why: "Base.", review: null, prev: { w: 15, r: 12, rir: 2, at: "", level: "exact", source: "repi" }, refs: [], coach: null, algo: "ti2.1", ...p,
} as RowTarget);

describe("equipamiento por sede", () => {
  const dumbbells = equipmentLadder({ category: "dumbbell", unit: "kg", increment: null, perSide: false, minLoad: null, maxLoad: null, loads: [10, 12.5, 15, 17.5, 20] }, "Mancuernas");

  it("lista explícita: el salto que ve el motor es el menor entre cargas", () => {
    expect(dumbbells).toMatchObject({ source: "gym", incrementKg: 2.5, loadsKg: [10, 12.5, 15, 17.5, 20] });
  });
  it("no recomienda una mancuerna inexistente de 16,25 kg", () => {
    const [t] = fitTargetsToLoads([target({ action: "reduce_load", weightKg: 16.25 })], dumbbells);
    expect(t.weightKg).toBe(15);
    expect(t.reasons).toContain("equipment_fit");
  });
  it("subir: la siguiente carga que existe si no supera el 10 %; si no, mantiene", () => {
    const ok = fitTargetsToLoads([target({ action: "increase_load", weightKg: 16, prev: { w: 15, r: 12, rir: 2, at: "", level: "exact", source: "repi" } })],
      equipmentLadder({ category: "dumbbell", unit: "kg", increment: null, perSide: false, minLoad: null, maxLoad: null, loads: [15, 16, 18] }))[0];
    expect(ok.weightKg).toBe(16);
    const big = fitTargetsToLoads([target({ action: "increase_load", weightKg: 16.25 })], dumbbells)[0];
    expect(big).toMatchObject({ weightKg: 15, action: "hold" });
    expect(big.reasons).toContain("increment_too_large");
  });
  it("nunca toca la carga del profe ni una pendiente", () => {
    const coach = target({ source: "coach", weightKg: 16.25 });
    const pend = target({ pending: true, weightKg: 16.25 });
    expect(fitTargetsToLoads([coach, pend], dumbbells)).toEqual([coach, pend]);
  });
  it("sin una carga por debajo, queda como referencia (no sube)", () => {
    const [t] = fitTargetsToLoads([target({ action: "reduce_load", weightKg: 6 })], dumbbells);
    expect(t.weightKg).toBe(6);
    expect(t.reasons).toContain("below_available");
  });
  it("barra por lado: el salto total es el doble; lb se convierte una sola vez", () => {
    expect(equipmentLadder({ category: "barbell", unit: "kg", increment: 1.25, perSide: true, minLoad: null, maxLoad: null, loads: null }).incrementKg).toBe(2.5);
    expect(equipmentLadder({ category: "dumbbell", unit: "lb", increment: 5, perSide: false, minLoad: null, maxLoad: null, loads: null }).incrementKg).toBe(2.27);
    const lb = equipmentLadder({ category: "dumbbell", unit: "lb", increment: null, perSide: false, minLoad: null, maxLoad: null, loads: [20, 25, 30] });
    expect(lb.loadsKg).toEqual([9.07, 11.34, 13.61]);
  });
  it("rango con salto arma la escalera; máquina de placas 5 a 50 de a 5", () => {
    const m = equipmentLadder({ category: "machine", unit: "kg", increment: 5, perSide: false, minLoad: 5, maxLoad: 50, loads: null });
    expect(m.loadsKg?.length).toBe(10);
    expect(m.loadsKg?.[9]).toBe(50);
  });
  it("prioridad: plan > sede > desconocido", () => {
    expect(resolveLadder({ load: { equipment: "dumbbell", incrementKg: 2 } }, dumbbells)).toMatchObject({ source: "plan", incrementKg: 2, loadsKg: null });
    expect(resolveLadder(null, dumbbells).source).toBe("gym");
    expect(resolveLadder(null, null)).toEqual({ source: "unknown", incrementKg: null, loadsKg: null });
  });
  it("valida lo que carga el personal", () => {
    const ok = { name: "Mancuernas", category: "dumbbell", unit: "kg", increment: null, perSide: false, minLoad: null, maxLoad: null, loads: [10, 12.5] };
    expect(validateEquipment(ok)).toEqual([]);
    expect(validateEquipment({ ...ok, perSide: true })[0].field).toBe("increment");
    expect(validateEquipment({ ...ok, loads: [10] })[0].field).toBe("loads");
    expect(validateEquipment({ ...ok, category: "nave" })[0].field).toBe("category");
    expect(validateEquipment({ ...ok, minLoad: 30, maxLoad: 20 })[0].field).toBe("maxLoad");
  });
  it("lee la lista con coma decimal", () => {
    expect(parseLoadList("10; 12,5; 15 17,5\n20")).toEqual([10, 12.5, 15, 17.5, 20]);
    expect(parseLoadList("10; x")).toBeNull();
  });
});
