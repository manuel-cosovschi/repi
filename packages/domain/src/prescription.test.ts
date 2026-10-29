import { describe, expect, it } from "vitest";
import { groupLabels, presetPlan, setTarget, setTargetText, validateDetail } from "./prescription";
import { validateProgramDoc } from "./training";

describe("prescripción avanzada", () => {
  it("las técnicas arman el plan serie por serie", () => {
    const top = presetPlan("top_backoff", { sets: 4, reps: "8", weightKg: 100 })!;
    expect(top.map((s) => [s.kind, s.weightKg])).toEqual([["top", 100], ["backoff", 85], ["backoff", 85], ["backoff", 85]]);
    const drop = presetPlan("drop_set", { sets: 3, reps: "10", weightKg: 50 })!;
    expect(drop.map((s) => [s.kind, s.weightKg, s.restSec])).toEqual([["work", 50, null], ["drop", 40, 0], ["drop", 30, 0]]);
    expect(presetPlan("straight", { sets: 3, reps: "10" })).toBeNull();
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
    expect(setTargetText(setTarget(e, 0))).toBe("Top set · 3-5 · 100 kg · RPE 8");
    expect(setTarget({ ...e, detail: null }, 1)).toMatchObject({ reps: "10", rir: 2, restSec: 90 });
    expect(groupLabels([e, { detail: null }, e])).toEqual(["A1", null, "A2"]);
  });
  it("el documento del programa conserva el detalle y ajusta las series", () => {
    const r = validateProgramDoc({ name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: "x", name: "Sentadilla", sets: 3, reps: "8", rir: 2, restSec: 120,
      detail: { technique: "drop_set", setPlan: presetPlan("drop_set", { sets: 3, reps: "8", weightKg: 60 }), group: null, groupKind: null, rounds: null, tempo: null, variant: "con pausa", unilateral: false, progression: null } }] }] });
    expect(r.ok && r.doc.days[0].exercises[0]).toMatchObject({ sets: 3, detail: { technique: "drop_set", variant: "con pausa" } });
  });
});
