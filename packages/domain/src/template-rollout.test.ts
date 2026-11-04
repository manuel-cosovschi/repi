import { describe, expect, it } from "vitest";
import { applyRollout, rolloutDefaults, rolloutPlan } from "./template-rollout";
import type { ExerciseDetail } from "./prescription";
import type { ProgramDoc, ProgramExerciseDoc } from "./training";

const ex = (exerciseId: string, name: string, p: Partial<ProgramExerciseDoc> = {}): ProgramExerciseDoc => ({ exerciseId, name, sets: 3, reps: "8-12", rir: 1, restSec: 90, note: null, ...p });
const W = (kg: number[]) => ({ technique: "custom" as const, setPlan: kg.map((w, i) => ({ id: `r${i}`, kind: "work" as const, reps: "10", weightKg: w, pct1rm: null, rir: 1, rpe: null, restSec: 90, note: null })) }) as unknown as ExerciseDetail;
const doc = (days: ProgramExerciseDoc[][], p: Partial<ProgramDoc> = {}): ProgramDoc => ({ name: "Piernas", weeks: 4, note: "", days: days.map((e, i) => ({ name: `Día ${i + 1}`, exercises: e })), ...p });
const HACK = "hack", PRESS = "press", RDL = "rdl", EXT = "ext";

describe("D194 · actualizar alumnos desde la plantilla", () => {
  it("sin cambios propios: las cargas nuevas de la plantilla se aplican por defecto", () => {
    const base = doc([[ex(HACK, "Sentadilla hack"), ex(PRESS, "Prensa")]]);
    const tpl = doc([[ex(HACK, "Sentadilla hack", { detail: W([80, 90, 100]) }), ex(PRESS, "Prensa")]]);
    const p = rolloutPlan(base, tpl, base);
    expect(p.ownChanges).toBe(false);
    expect(p.changes.map((c) => [c.key, c.conflict])).toEqual([[`ex:0:${HACK}#0:modify`, false]]);
    expect(p.changes[0].text).toBe("Día 1 · Sentadilla hack: 3 × 8-12 · RIR 1 · descanso 90 s → Personalizada · 3 series (80, 90, 100 kg) · descanso 90 s");
    const out = applyRollout(base, tpl, base, rolloutDefaults(p));
    expect(out.days[0].exercises[0].detail?.setPlan?.map((r) => r.weightKg)).toEqual([80, 90, 100]);
    expect(out).toEqual(tpl);
  });

  it("personalización del alumno en el mismo ejercicio: conflicto, por defecto se conservan sus cargas", () => {
    const base = doc([[ex(HACK, "Sentadilla hack"), ex(PRESS, "Prensa")]]);
    const tpl = doc([[ex(HACK, "Sentadilla hack", { detail: W([80, 90, 100]) }), ex(PRESS, "Prensa", { sets: 4 })]]);
    const stu = doc([[ex(HACK, "Sentadilla hack", { detail: W([60, 65, 70]), note: "rodilla: rango corto" }), ex(PRESS, "Prensa")]]);
    const p = rolloutPlan(base, tpl, stu);
    expect(p.ownChanges).toBe(true);
    const hack = p.changes.find((c) => c.key === `ex:0:${HACK}#0:modify`)!;
    expect([hack.conflict, hack.student]).toEqual([true, "Personalizada · 3 series (60, 65, 70 kg) · descanso 90 s · con indicación"]);
    expect(p.changes.find((c) => c.key === `ex:0:${PRESS}#0:modify`)!.conflict).toBe(false);
    // Por defecto: prensa se actualiza, la sentadilla del alumno (cargas e indicación) no se toca.
    const out = applyRollout(base, tpl, stu, rolloutDefaults(p));
    expect(out.days[0].exercises[0]).toEqual(stu.days[0].exercises[0]);
    expect(out.days[0].exercises[1].sets).toBe(4);
    // Si el profe elige la plantilla en el conflicto, se reemplaza.
    expect(applyRollout(base, tpl, stu, p.changes.map((c) => c.key)).days[0].exercises[0].detail?.setPlan?.map((r) => r.weightKg)).toEqual([80, 90, 100]);
  });

  it("agregar, quitar y ejercicios propios del alumno (que nunca se pierden)", () => {
    const base = doc([[ex(HACK, "Sentadilla hack"), ex(PRESS, "Prensa"), ex(RDL, "Peso muerto rumano")]]);
    const tpl = doc([[ex(HACK, "Sentadilla hack"), ex(EXT, "Extensión"), ex(PRESS, "Prensa")]]); // quita RDL, agrega EXT después de hack
    const stu = doc([[ex(HACK, "Sentadilla hack"), ex(PRESS, "Prensa"), ex(RDL, "Peso muerto rumano"), ex("gem", "Gemelos")]]);
    const p = rolloutPlan(base, tpl, stu);
    expect(p.changes.map((c) => [c.key, c.kind, c.conflict])).toEqual([[`ex:0:${EXT}#0:add`, "add", false], [`ex:0:${RDL}#0:remove`, "remove", false]]);
    const out = applyRollout(base, tpl, stu, rolloutDefaults(p));
    expect(out.days[0].exercises.map((e) => e.exerciseId)).toEqual([HACK, EXT, PRESS, "gem"]);
  });

  it("quitar un ejercicio que el alumno tiene modificado es conflicto", () => {
    const base = doc([[ex(HACK, "Sentadilla hack"), ex(RDL, "Peso muerto rumano")]]);
    const tpl = doc([[ex(HACK, "Sentadilla hack")]]);
    const stu = doc([[ex(HACK, "Sentadilla hack"), ex(RDL, "Peso muerto rumano", { restSec: 150 })]]);
    const p = rolloutPlan(base, tpl, stu);
    expect(p.changes).toMatchObject([{ key: `ex:0:${RDL}#0:remove`, conflict: true }]);
    expect(applyRollout(base, tpl, stu, rolloutDefaults(p)).days[0].exercises).toHaveLength(2);
  });

  it("días nuevos, quitados, renombrados y orden; datos del programa", () => {
    const base = doc([[ex(HACK, "A"), ex(PRESS, "B")], [ex(RDL, "C")]]);
    const tpl = doc([[ex(PRESS, "B"), ex(HACK, "A")], [ex(RDL, "C")], [ex(EXT, "D")]], { weeks: 6 });
    tpl.days[1].name = "Posterior";
    const p = rolloutPlan(base, tpl, base);
    expect(p.changes.map((c) => c.key).sort()).toEqual(["day:0:order", "day:1:rename", "day:2:add", "meta:weeks"]);
    expect(applyRollout(base, tpl, base, rolloutDefaults(p))).toEqual(tpl);
    // Quitar un día que el alumno no tocó.
    const tpl2 = doc([[ex(HACK, "A"), ex(PRESS, "B")]]);
    const p2 = rolloutPlan(base, tpl2, base);
    expect(p2.changes).toMatchObject([{ key: "day:1:remove", conflict: false }]);
    expect(applyRollout(base, tpl2, base, rolloutDefaults(p2)).days).toHaveLength(1);
  });

  it("al día: sin cambios; repetir el mismo ejercicio en un día se distingue por ocurrencia", () => {
    const base = doc([[ex(HACK, "A"), ex(HACK, "A", { reps: "15" })]]);
    expect(rolloutPlan(base, base, base).changes).toEqual([]);
    const tpl = doc([[ex(HACK, "A"), ex(HACK, "A", { reps: "20" })]]);
    expect(rolloutPlan(base, tpl, base).changes.map((c) => c.key)).toEqual([`ex:0:${HACK}#1:modify`]);
  });

  it("sin base conocida: toda diferencia es conflicto (no se pisa nada por defecto)", () => {
    const tpl = doc([[ex(HACK, "A", { detail: W([80]) , sets: 1 })]]);
    const stu = doc([[ex(HACK, "A")]]);
    const p = rolloutPlan(null, tpl, stu);
    expect(p.noBase).toBe(true);
    expect(p.changes.every((c) => c.conflict)).toBe(true);
    expect(applyRollout(null, tpl, stu, rolloutDefaults(p))).toEqual(stu);
  });

  it("los ids de las filas del plan no cuentan como cambio", () => {
    const base = doc([[ex(HACK, "A", { detail: W([80]), sets: 1 })]]);
    const tpl = JSON.parse(JSON.stringify(base)) as ProgramDoc;
    tpl.days[0].exercises[0].detail!.setPlan![0].id = "otro";
    expect(rolloutPlan(base, tpl, base).changes).toEqual([]);
  });
});
