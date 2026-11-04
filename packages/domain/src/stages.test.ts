import { describe, expect, it } from "vitest";
import { comboNext, emptyDetail, setTarget, validateDetail, type ExerciseDetail, type SetSpec } from "./prescription";
import { applyMethod, circuitIssues, comboStep, legacySpecId, mainSets, normalizePlan, planBlocks, resizeBlocks, rowRef, structureText } from "./stages";
import { startWeight, reducedLoadHint, isReducedKind } from "./load-safety";
import { validateProgramDoc } from "./training";

const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const base = { sets: 4, reps: "8-10", rir: 2 };
const D = (setPlan: SetSpec[] | null, p: Partial<ExerciseDetail> = {}): ExerciseDetail => ({ ...emptyDetail(), setPlan, ...p });
const shape = (d: ExerciseDetail | null | undefined) => normalizePlan(d?.setPlan).rows.map((r) => `${r.block}.${r.stage}:${r.kind}`);

describe("D183 · bloques y etapas", () => {
  it("bloque tradicional: sin plan, N series son N bloques con identidad por posición", () => {
    expect(planBlocks(null, 3).map((b) => b.rows)).toEqual([[0], [1], [2]]);
    expect(rowRef(null, 3, 2)).toEqual({ id: "r2", block: 2, stage: 0, kind: "work", review: false });
    expect(rowRef(null, 3, 3)).toBeNull();
  });

  it("lectura de datos antiguos: los drops y rest-pause continúan la serie de arriba; nada cambia de peso ni reps", () => {
    const old = [S("work", "10", { weightKg: 60 }), S("drop", "al fallo", { weightKg: 48, restSec: 0 }), S("drop", "al fallo", { weightKg: 36 }), S("work", "10", { weightKg: 60 })];
    const n = normalizePlan(old);
    expect(n.derived).toBe(true);
    expect(n.rows.map((r) => [r.id, r.block, r.stage, r.weightKg, r.reps])).toEqual([["r0", 0, 0, 60, "10"], ["r1", 0, 1, 48, "al fallo"], ["r2", 0, 2, 36, "al fallo"], ["r3", 1, 0, 60, "10"]]);
    expect(mainSets(D(old), 4)).toBe(2);
  });

  it("clusters anteriores: ambiguos, quedan como estaban y marcados para que el profe los revise", () => {
    const n = normalizePlan([S("cluster", "2-3", { restSec: 20 }), S("cluster", "2-3", { restSec: 20 })]);
    expect(n.review).toBe(true);
    expect(n.rows.map((r) => [r.block, r.stage, r.review])).toEqual([[0, 0, true], [1, 0, true]]);
  });

  it("identidad estable: agregar una etapa antes de otra no cambia la identidad de las filas existentes", () => {
    const v = validateDetail(D([S("work", "10"), S("work", "10"), S("work", "10")]), 3);
    const plan = v.ok ? v.detail!.setPlan! : [];
    const ids = plan.map((r) => r.id);
    const withDrop = applyMethod(v.ok ? v.detail : null, base, "drop_set", [0], { stages: 1 }).detail.setPlan!;
    expect(withDrop.map((r) => r.id)).toEqual([ids[0], withDrop[1].id, ids[1], ids[2]]);
    expect(new Set(withDrop.map((r) => r.id)).size).toBe(4); // sin colisiones
    expect(rowRef(D(withDrop), 4, 2)).toMatchObject({ id: ids[1], block: 1, stage: 0 });
  });

  it("validación: ids duplicados se reparan, bloques incoherentes se deducen de nuevo, demasiadas etapas se rechazan", () => {
    const dup = validateDetail(D([S("work", "8", { id: "a" }), S("work", "8", { id: "a" })]), 2);
    expect(dup.ok && new Set(dup.detail!.setPlan!.map((r) => r.id)).size).toBe(2);
    const bad = validateDetail(D([S("work", "8", { block: 3, stage: 0 }), S("drop", "6", { block: 0, stage: 5 })]), 2);
    expect(bad.ok && shape(bad.detail)).toEqual(["0.0:work", "0.1:drop"]);
    const many = validateDetail(D([S("work", "8"), ...Array.from({ length: 9 }, () => S("drop", "6"))]), 10);
    expect(many.ok).toBe(false);
    const v = validateDetail(D([S("work", "8"), S("drop", "6")]), 2);
    expect(v.ok && [v.sets, v.blocks]).toEqual([2, 1]);
  });

  it("versionado: el documento normalizado es estable (guardar dos veces no cambia nada)", () => {
    const doc = { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: "x", name: "Press", sets: 4, reps: "10", rir: 2, restSec: 90,
      detail: D([S("work", "10"), S("work", "10"), S("work", "10"), S("work", "10"), S("drop", "8"), S("drop", "10")], { technique: "drop_set" }) }] }] };
    const a = validateProgramDoc(doc);
    const b = a.ok ? validateProgramDoc(a.doc) : a;
    expect(a.ok && b.ok && JSON.stringify(a.doc) === JSON.stringify(b.doc)).toBe(true);
  });
});

describe("D183 · drop set", () => {
  it("cuatro series y drop sólo en la cuarta: 4 series principales, la última con 2 drops conectados", () => {
    const r = applyMethod(null, base, "drop_set", [3]);
    expect(shape(r.detail)).toEqual(["0.0:work", "1.0:work", "2.0:work", "3.0:work", "3.1:drop", "3.2:drop"]);
    expect(mainSets(r.detail, 6)).toBe(4);
    expect(r.detail.setPlan!.slice(0, 4).every((s) => s.reps === "8-10" && s.rir === 2)).toBe(true); // la programación queda
    expect(r.changes.join(" ")).toMatch(/Serie 4: 2 drops conectados/);
    expect(structureText(r.detail, 6)).toBe("4 series · 4.ª con drops (2)");
  });
  it("drop en todas o en varias elegidas; etapas configurables", () => {
    expect(shape(applyMethod(null, base, "drop_set", [0, 1, 2, 3], { stages: 1 }).detail).filter((x) => x.includes("drop"))).toHaveLength(4);
    expect(shape(applyMethod(null, base, "drop_set", [1, 3], { stages: 3 }).detail)).toEqual(["0.0:work", "1.0:work", "1.1:drop", "1.2:drop", "1.3:drop", "2.0:work", "3.0:work", "3.1:drop", "3.2:drop", "3.3:drop"]);
  });
  it("modificar: cambiar la cantidad conserva los drops que ya estaban (con sus valores)", () => {
    const a = applyMethod(null, base, "drop_set", [3]).detail;
    a.setPlan![4] = { ...a.setPlan![4], weightKg: 50, reps: "8" };
    const b = applyMethod(a, base, "drop_set", [3], { stages: 1 }).detail;
    expect(b.setPlan![4]).toMatchObject({ id: a.setPlan![4].id, weightKg: 50, reps: "8" });
    expect(b.setPlan).toHaveLength(5);
    const back = applyMethod(b, base, "straight", [3]);
    expect(shape(back.detail)).toEqual(["0.0:work", "1.0:work", "2.0:work", "3.0:work"]);
    expect(back.changes.join(" ")).toMatch(/se quitan 1 etapa/);
  });
  it("carga del drop: pendiente sin carga del plan (no hereda la del principal); explícita si el profe la indica", () => {
    const d = applyMethod(null, base, "drop_set", [3]).detail;
    const t = setTarget({ ...base, restSec: 90, detail: d }, 4);
    expect([t.label, t.stage, t.block, t.restSec]).toEqual(["Drop 1", 1, 3, 0]);
    expect(startWeight({ kind: t.kind, planKg: t.weightKg, suggestKg: 60, carriedKg: 60 })).toEqual({ w: 0, pending: true });
    expect(startWeight({ kind: "drop", planKg: 50 })).toEqual({ w: 50, pending: false });
    expect(reducedLoadHint(d.setPlan, 4, [60, 60, 60, 60, null, null])).toMatchObject({ weightKg: 47.5 });
  });
});

describe("D183 · top set y back-off", () => {
  it("top set sin back-off: una sola serie elegida, sin series inventadas", () => {
    const r = applyMethod(null, { sets: 1, reps: "5", rir: null }, "top_backoff", [0]);
    expect(shape(r.detail)).toEqual(["0.0:top"]);
  });
  it("con back-off: rangos y pesos originales preservados, cada serie con su registro", () => {
    const start = D([0, 1, 2, 3].map(() => S("work", "8-10", { weightKg: 60, rir: 2 })));
    const r = applyMethod(start, base, "top_backoff", [0, 1, 2, 3]);
    expect(r.detail.setPlan!.map((s) => [s.kind, s.reps, s.weightKg])).toEqual([["top", "8-10", 60], ["backoff", "8-10", 60], ["backoff", "8-10", 60], ["backoff", "8-10", 60]]);
    expect(r.changes.join(" ")).toMatch(/igual o más que el top set: revisá la carga/); // no se cambia solo: se avisa
    expect(planBlocks(r.detail, 4).every((b) => b.stages === 0)).toBe(true); // back-off: series propias, no etapas
  });
  it("back-off sin carga: pendiente, con referencia del top hecho", () => {
    const d = applyMethod(null, { sets: 3, reps: "5", rir: null }, "top_backoff", [0, 1, 2]).detail;
    expect(isReducedKind(d.setPlan![1].kind)).toBe(true);
    expect(reducedLoadHint(d.setPlan, 1, [100, null, null])).toMatchObject({ weightKg: 85 });
  });
});

describe("D183 · rest-pause y myo-reps", () => {
  it("una o varias mini series, cantidad variable, misma carga y pausa corta", () => {
    const one = applyMethod(null, base, "rest_pause", [3], { stages: 1 }).detail;
    expect(shape(one)).toEqual(["0.0:work", "1.0:work", "2.0:work", "3.0:work", "3.1:rest_pause"]);
    const three = applyMethod(null, base, "rest_pause", [3], { stages: 3 }).detail;
    expect(three.setPlan!.filter((s) => s.stage! > 0).map((s) => s.restSec)).toEqual([20, 20, 20]);
    expect(setTarget({ ...base, restSec: 90, detail: three }, 5).label).toBe("Mini serie 2");
  });
  it("myo-reps: activación + mini series configurables (ya no 5 filas fijas)", () => {
    for (const k of [2, 4]) {
      const d = applyMethod(null, { sets: 1, reps: "12-15", rir: 1 }, "myo_reps", [0], { stages: k }).detail;
      expect(d.setPlan).toHaveLength(1 + k);
      expect(d.setPlan!.slice(1).every((s) => s.restSec === 5)).toBe(true);
    }
  });
  it("cluster: una serie partida en bloques conectados, con aviso del cambio de reps", () => {
    const r = applyMethod(null, { sets: 2, reps: "6", rir: null }, "cluster", [0, 1], { stages: 3 });
    expect(shape(r.detail)).toEqual(["0.0:cluster", "0.1:cluster", "0.2:cluster", "1.0:cluster", "1.1:cluster", "1.2:cluster"]);
    expect(r.detail.setPlan!.every((s) => s.reps === "2" && !s.review)).toBe(true);
    expect(r.changes.join(" ")).toMatch(/repeticiones 6 → 2/);
    expect(mainSets(r.detail, 6)).toBe(2);
  });
});

describe("D183 · AMRAP, pirámides y EMOM", () => {
  it("AMRAP por repeticiones: sólo la serie elegida, sin series extra; el rango anterior queda como nota", () => {
    const r = applyMethod(null, base, "amrap_last", [3]).detail;
    expect(r.setPlan!.map((s) => s.kind)).toEqual(["work", "work", "work", "amrap"]);
    expect(r.setPlan![3]).toMatchObject({ reps: "AMRAP", note: "Mínimo 8-10", durationSec: null });
  });
  it("AMRAP por tiempo: duración y qué se cuenta; se valida", () => {
    const r = applyMethod(null, { sets: 1, reps: "10", rir: null }, "amrap_time", [0], { durationSec: 600, countUnit: "rounds" }).detail;
    expect(r.setPlan![0]).toMatchObject({ kind: "amrap", reps: "AMRAP 10 min", durationSec: 600, countUnit: "rounds" });
    const v = validateDetail(r, 1);
    expect(v.ok && v.detail!.setPlan![0].durationSec).toBe(600);
    expect(setTarget({ sets: 1, reps: "10", rir: null, restSec: 90, detail: r }, 0).label).toBe("AMRAP por tiempo");
    expect(validateDetail(D([S("amrap", "AMRAP", { durationSec: 5 })]), 1).ok).toBe(false);
  });
  it("pirámides: cada serie con su identidad y sus reps; no cambia cargas", () => {
    const up = applyMethod(null, base, "pyramid", [0, 1, 2, 3]).detail;
    expect(up.setPlan!.map((s) => s.reps)).toEqual(["12", "10", "8", "6"]);
    const down = applyMethod(null, base, "reverse_pyramid", [0, 1, 2, 3]).detail;
    expect(down.setPlan!.map((s) => s.reps)).toEqual(["6", "8", "10", "12"]);
    expect(planBlocks(up, 4).every((b) => b.stages === 0)).toBe(true);
  });
  it("EMOM: intervalo configurable; cada serie es un intervalo", () => {
    const r = applyMethod(null, { sets: 10, reps: "5", rir: null }, "emom", [], { emomSec: 60 });
    expect(r.detail.emomSec).toBe(60);
    expect(r.changes.join(" ")).toMatch(/10 intervalos/);
    const v = validateDetail(r.detail, 10);
    expect(v.ok && v.detail!.emomSec).toBe(60);
    expect(validateDetail({ ...r.detail, emomSec: 2 }, 10).ok).toBe(false);
  });
});

describe("D183 · superseries y circuitos por vueltas", () => {
  const g = (group: string, p: Partial<ExerciseDetail> = {}) => D(null, { group, groupKind: "superset", ...p });
  it("superserie con drop en A1: las etapas se hacen seguidas y recién después se pasa a A2", () => {
    const a1 = { sets: 4, detail: { ...applyMethod(null, { sets: 3, reps: "10", rir: null }, "drop_set", [0, 1, 2], { stages: 1 }).detail, group: "A", groupKind: "superset" as const } };
    const a2 = { sets: 3, detail: g("A") };
    const exs = [{ ...a1, sets: 6 }, a2];
    const done = new Set<string>();
    const isDone = (i: number, k: number) => done.has(`${i}:${k}`);
    done.add("0:0");
    expect(comboStep(exs, isDone, 0, 0)).toBeNull(); // falta el drop de esa serie
    done.add("0:1");
    expect(comboStep(exs, isDone, 0, 1)).toEqual({ idx: 1, endOfRound: false, round: 0, rounds: 3 });
    done.add("1:0");
    expect(comboNext(exs, isDone, 1, 0)).toEqual({ idx: 0, endOfRound: true });
  });
  it("circuito de 4 ejercicios × 3 vueltas: vuelta incompleta, ejercicio omitido, orden", () => {
    const c = (name: string) => ({ name, sets: 3, detail: D(null, { group: "B", groupKind: "circuit", rounds: 3 }) });
    const exs = [c("A"), c("B"), c("C"), c("D")];
    expect(circuitIssues(exs)).toEqual([]);
    const done = new Set<string>();
    const isDone = (i: number, k: number) => done.has(`${i}:${k}`);
    // vueltas 1 y 2 completas
    for (const r of [0, 1]) for (let i = 0; i < 4; i++) {
      done.add(`${i}:${r}`);
      const st = comboStep(exs, isDone, i, r);
      expect(st).toMatchObject(i < 3 ? { idx: i + 1, endOfRound: false, round: r } : { idx: 0, endOfRound: true, round: r + 1, rounds: 3 });
    }
    // vuelta 3 parcial: A hecho, B omitido (se saltea en el orden)
    done.add("0:2");
    const skip = exs.map((e, i) => (i === 1 ? { ...e, change: { kind: "skip" } } : e));
    expect(comboStep(skip, isDone, 0, 2)).toMatchObject({ idx: 2, round: 2 });
  });
  it("las vueltas gobiernan: se detecta la diferencia y se igualan las series de cada ejercicio", () => {
    const exs = [{ name: "A", sets: 4, reps: "10", rir: null, detail: D(null, { group: "C", groupKind: "circuit", rounds: 3 }) }, { name: "B", sets: 3, reps: "10", rir: null, detail: D(null, { group: "C", groupKind: "circuit" }) }];
    expect(circuitIssues(exs)).toEqual([{ group: "C", rounds: 3, exercise: "A", blocks: 4 }]);
    const fixed = resizeBlocks(exs[0], 3);
    expect([fixed.sets, fixed.removed]).toEqual([3, 1]);
    const doc = { name: "P", weeks: 4, note: "", days: [{ name: "Día", exercises: exs.map((e) => ({ exerciseId: e.name, name: e.name, sets: e.sets, reps: "10", rir: null, restSec: 60, detail: e.detail })) }] };
    const v = validateProgramDoc(doc);
    expect(v.ok ? "" : v.error).toMatch(/circuito C tiene 3 vueltas, pero A tiene 4 series/);
    // con etapas: agregar una vuelta repite la última serie con sus etapas, con identidades nuevas
    const withDrop = { sets: 3, reps: "10", rir: null, detail: applyMethod(null, { sets: 2, reps: "10", rir: null }, "drop_set", [1], { stages: 1 }).detail };
    const grown = resizeBlocks(withDrop, 3);
    expect(shape(grown.detail)).toEqual(["0.0:work", "1.0:work", "1.1:drop", "2.0:work", "2.1:drop"]);
    expect(new Set(grown.detail!.setPlan!.map((r) => r.id)).size).toBe(5);
    expect(legacySpecId(0)).toBe("r0");
  });
});
