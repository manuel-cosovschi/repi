import { describe, expect, it } from "vitest";
import { combineWithNext, combinedWithNext, comboNext, emptyDetail, groupLabels, separateFromGroup, presetPlan, setTarget, setTargetText, straightRow, uniformPlan, validateDetail, type ExerciseDetail } from "./prescription";
import { validateProgramDoc } from "./training";

describe("prescripción avanzada", () => {
  it("las técnicas arman el plan sin reemplazar la programación (D183)", () => {
    // Top set + back-off conserva series, repeticiones y pesos: sólo marca qué serie es el top set y cuáles son back-off.
    const top = presetPlan("top_backoff", { sets: 4, reps: "8", weightKg: 100 })!;
    expect(top.map((s) => [s.kind, s.reps, s.weightKg, s.block, s.stage])).toEqual([["top", "8", 100, 0, 0], ["backoff", "8", 100, 1, 0], ["backoff", "8", 100, 2, 0], ["backoff", "8", 100, 3, 0]]);
    // Drop set: 3 series principales; los drops van conectados a la última y sin carga (la elige el alumno con referencia).
    const drop = presetPlan("drop_set", { sets: 3, reps: "10", weightKg: 50 })!;
    expect(drop.map((s) => [s.kind, s.weightKg, s.restSec, s.block, s.stage])).toEqual([["work", 50, null, 0, 0], ["work", 50, null, 1, 0], ["work", 50, null, 2, 0], ["drop", null, 0, 2, 1], ["drop", null, 0, 2, 2]]);
    expect(presetPlan("straight", { sets: 3, reps: "10" })).toBeNull();
    // D173: series rectas con peso: el peso queda guardado en todas las series y lo ve el socio.
    const sp = presetPlan("straight", { sets: 3, reps: "8-10", rir: 2, weightKg: 60 })!;
    expect(sp).toHaveLength(3);
    expect(uniformPlan(sp) && sp[0]).toMatchObject({ kind: "work", reps: "8-10", weightKg: 60, rir: 2 });
    const v = validateDetail({ ...emptyDetail(), setPlan: sp }, 3);
    expect(v.ok && v.detail?.technique).toBe("straight");
    expect(v.ok && setTarget({ sets: 3, reps: "8-10", rir: 2, restSec: 90, detail: v.detail }, 2).weightKg).toBe(60);
    // Lo que se cambia en la fila (series, reps, RIR) se copia a todas las series.
    const row = straightRow({ ...emptyDetail(), setPlan: sp }, { sets: 4, reps: "6-8" }) as { sets: number; detail?: ExerciseDetail | null };
    expect(row.sets).toBe(4);
    expect(row.detail?.setPlan).toHaveLength(4);
    expect(row.detail?.setPlan?.[3]).toMatchObject({ reps: "6-8", weightKg: 60, rir: 2 });
    expect(straightRow(null, { reps: "5" })).toEqual({ reps: "5" });
  });
  it("valida y normaliza; las series salen del plan", () => {
    const r = validateDetail({ technique: "custom", setPlan: [
      { kind: "warmup", reps: "12", weightKg: 40, pct1rm: null, rir: null, rpe: null, restSec: 60, note: null },
      { kind: "work", reps: "8", weightKg: null, pct1rm: 75, rir: 2, rpe: null, restSec: null, note: " subí 2,5 " },
    ], group: "A", tempo: "3–1–1–0" }, 5);
    expect(r.ok && r.sets).toBe(2);
    expect(r.ok && r.detail).toMatchObject({ group: "A", groupKind: "superset", tempo: "3-1-1-0", setPlan: [{ kind: "warmup" }, { pct1rm: 75, note: "subí 2,5" }] });
    expect(validateDetail({ technique: "custom", setPlan: [{ kind: "work", reps: "", weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null }] }, 1).ok).toBe(false);
    expect(validateDetail({ technique: "custom", setPlan: [{ kind: "work", reps: "8", weightKg: 5000, pct1rm: null, rir: null, rpe: null, restSec: null, note: null }] }, 1).ok).toBe(false);
    expect(validateDetail({ tempo: "lento" }, 3).ok).toBe(false);
    expect(validateDetail({ technique: "straight" }, 3)).toEqual({ ok: true, detail: null, sets: 3 });
  });
  it("objetivo por serie, texto y etiquetas de combinación", () => {
    const e = { sets: 2, reps: "10", rir: 2, restSec: 90, detail: { technique: "top_backoff" as const, setPlan: presetPlan("top_backoff", { sets: 2, reps: "8", weightKg: 100 }), group: "A", groupKind: "superset" as const, rounds: null, tempo: null, variant: null, unilateral: false, progression: null } };
    expect(setTargetText(setTarget(e, 0))).toBe("Top set · 8 · 100 kg");
    expect(setTarget({ ...e, detail: null }, 1)).toMatchObject({ reps: "10", rir: 2, restSec: 90 });
    expect(groupLabels([e, { detail: null }, e])).toEqual(["A1", null, "A2"]);
  });
  it("el documento del programa conserva el detalle y ajusta las series", () => {
    const r = validateProgramDoc({ name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: "x", name: "Sentadilla", sets: 3, reps: "8", rir: 2, restSec: 120,
      detail: { technique: "drop_set", setPlan: presetPlan("drop_set", { sets: 3, reps: "8", weightKg: 60 }), group: null, groupKind: null, rounds: null, tempo: null, variant: "con pausa", unilateral: false, progression: null } }] }] });
    // `sets` son las filas registrables: 3 series principales + 2 drops conectados a la última.
    expect(r.ok && r.doc.days[0].exercises[0]).toMatchObject({ sets: 5, detail: { technique: "drop_set", variant: "con pausa" } });
  });
  it("superserie: alterna A1 → A2 sin descanso y al cerrar la vuelta vuelve a A1 con descanso", () => {
    const g = (group: string | null) => ({ technique: "straight" as const, setPlan: null, group, groupKind: group ? "superset" as const : null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null });
    const exs = [{ sets: 3, detail: g("A") }, { sets: 3, detail: g(null) }, { sets: 3, detail: g("A") }];
    const done = new Set<string>();
    const isDone = (i: number, k: number) => done.has(`${i}:${k}`);
    done.add("0:0");
    expect(comboNext(exs, isDone, 0, 0)).toEqual({ idx: 2, endOfRound: false });
    done.add("2:0");
    expect(comboNext(exs, isDone, 2, 0)).toEqual({ idx: 0, endOfRound: true });
    expect(comboNext(exs, isDone, 1, 0)).toBeNull(); // sin grupo
    for (const k of [1, 2]) { done.add(`0:${k}`); done.add(`2:${k}`); }
    expect(comboNext(exs, isDone, 2, 2)).toBeNull(); // todo hecho
    expect(comboNext([{ sets: 3, detail: g("A") }, { sets: 3, detail: g("A"), change: { kind: "skip" } }], () => false, 0, 0)).toBeNull(); // el salteado no cuenta
  });
});

describe("combinar desde la fila del editor (pedido de sala, 07/11/2026)", () => {
  const ex = (name: string, group: string | null = null, groupKind: ExerciseDetail["groupKind"] = null, rounds: number | null = null) =>
    ({ name, detail: group ? { ...emptyDetail(), group, groupKind, rounds } : null });
  const g = (xs: { detail?: ExerciseDetail | null }[]) => xs.map((x) => (x.detail?.group ? `${x.detail.group}:${x.detail.groupKind}${x.detail.rounds ? `×${x.detail.rounds}` : ""}` : "-"));

  it("dos ejercicios sueltos forman una superserie con la primera letra libre", () => {
    const r = combineWithNext([ex("Press"), ex("Remo"), ex("Sentadilla")], 0)!;
    expect(g(r)).toEqual(["A:superset", "A:superset", "-"]);
    expect(groupLabels(r)).toEqual(["A1", "A2", null]);
    expect(combinedWithNext(r, 0)).toBe(true);
    expect(combinedWithNext(r, 1)).toBe(false);
    // Con la A ocupada por otros, usa la B.
    expect(g(combineWithNext([ex("Press", "A", "superset"), ex("Remo", "A", "superset"), ex("Prensa"), ex("Curl")], 2)!)).toEqual(["A:superset", "A:superset", "B:superset", "B:superset"]);
  });

  it("un tercero se suma al grupo (biserie → triserie) y respeta circuito y vueltas", () => {
    const tri = combineWithNext([ex("Press", "A", "superset"), ex("Remo", "A", "superset"), ex("Fondos")], 1)!;
    expect(g(tri)).toEqual(["A:superset", "A:superset", "A:superset"]);
    const circ = combineWithNext([ex("Burpees", "C", "circuit", 3), ex("Saltos")], 0)!;
    expect(g(circ)).toEqual(["C:circuit×3", "C:circuit×3"]);
    // El de abajo ya estaba en un grupo: el de arriba se suma a ese.
    expect(g(combineWithNext([ex("Press"), ex("Remo", "B", "superset"), ex("Curl", "B", "superset")], 0)!)).toEqual(["B:superset", "B:superset", "B:superset"]);
  });

  it("al mover un ejercicio de grupo, el que queda solo se separa; sin siguiente no combina", () => {
    const r = combineWithNext([ex("Press", "A", "superset"), ex("Remo", "B", "superset"), ex("Curl", "B", "superset")], 0)!;
    expect(g(r)).toEqual(["A:superset", "A:superset", "-"]);
    expect(combineWithNext([ex("Press"), ex("Remo")], 1)).toBeNull();
  });

  it("sin letras libres no combina (máximo ocho grupos por día)", () => {
    const full = ["A", "B", "C", "D", "E", "F", "G", "H"].flatMap((l) => [ex(`${l}1`, l, "superset"), ex(`${l}2`, l, "superset")]);
    expect(combineWithNext([...full, ex("X"), ex("Y")], 16)).toBeNull();
  });

  it("separar saca al ejercicio y deshace el grupo si queda uno solo", () => {
    const two = [ex("Press", "A", "superset"), ex("Remo", "A", "superset")];
    expect(g(separateFromGroup(two, 0))).toEqual(["-", "-"]);
    const three = [ex("Press", "A", "superset"), ex("Remo", "A", "superset"), ex("Fondos", "A", "superset")];
    expect(g(separateFromGroup(three, 2))).toEqual(["A:superset", "A:superset", "-"]);
    expect(separateFromGroup([ex("Press")], 0)).toEqual([ex("Press")]);
  });
});
