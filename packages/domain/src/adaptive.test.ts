import { describe, expect, it } from "vitest";
import { autonomyAllows, planSolo, validateProposal, type SoloContext } from "./adaptive";

const now = new Date("2026-10-28T15:00:00Z");
const base: SoloContext = {
  now, today: "2026-10-28", relation: { kind: "coach", name: "Agustín" }, state: "ready",
  open: null, next: { id: "d2", name: "Piernas", exercises: 4 }, doneToday: [], checkin: null,
};

describe("Adaptive Coach · entrenar por mi cuenta (determinístico)", () => {
  it("TEST A/J: con rutina asignada muestra la existente, sin IA ni rutina nueva", () => {
    const p = planSolo(base, "coach_absent");
    expect(p).toMatchObject({ mode: "original", adp: "ADP-01", usesAI: false });
    expect(p.options).toEqual([{ action: "start", label: "Empezar Piernas", dayId: "d2" }]);
  });
  it("TEST B: si ya entrenó hoy, propone descansar y no suma otra sesión intensa por defecto", () => {
    const p = planSolo({ ...base, doneToday: [{ dayName: "Torso A" }] }, "solo");
    expect(p.mode).toBe("extra_day");
    expect(p.options[0].action).toBe("rest");
    expect(p.options.find((o) => o.action === "start")).toMatchObject({ caution: true });
  });
  it("caso C: sesión abierta reciente se continúa; vieja avisa que puede cerrarse", () => {
    const open = { id: "s1", dayName: "Piernas", startedAt: new Date(now.getTime() - 3_600_000), setsDone: 5, setsTotal: 13 };
    expect(planSolo({ ...base, open }, "solo")).toMatchObject({ mode: "continue", adp: "ADP-08", warnings: [] });
    const old = planSolo({ ...base, open: { ...open, startedAt: new Date(now.getTime() - 20 * 3_600_000) } }, "solo");
    expect(old.warnings.join()).toContain("hace 20 h");
  });
  it("gym con «no vino el profe»: ofrece pedir ayuda a otro entrenador; poca energía agrega aviso conservador", () => {
    const p = planSolo({ ...base, relation: { kind: "gym", name: "Equipo de sala" }, checkin: { energy: 2, sleep: 4, mood: 3 } }, "coach_absent");
    expect(p.options.some((o) => o.action === "ask_help")).toBe(true);
    expect(p.warnings[0]).toContain("poca energía");
    expect(planSolo({ ...base, relation: { kind: "gym", name: "x" } }, "solo").options.some((o) => o.action === "ask_help")).toBe(false);
  });
  it("sin programa no inventa una rutina", () => {
    const p = planSolo({ ...base, state: "no_program", next: null }, "solo");
    expect(p).toMatchObject({ mode: "no_program", adp: null });
    expect(p.options.some((o) => o.action === "start")).toBe(false);
  });
});

describe("niveles de autonomía", () => {
  it("nivel 0 sólo muestra lo asignado; proponer exige 2; aplicar sin coach exige 3", () => {
    expect(autonomyAllows(0, "show_assigned")).toBe(true);
    expect(autonomyAllows(0, "explain")).toBe(false);
    expect(autonomyAllows(1, "session_change")).toBe(true);
    expect(autonomyAllows(1, "propose")).toBe(false);
    expect(autonomyAllows(2, "apply_without_coach")).toBe(false);
    expect(autonomyAllows(3, "apply_without_coach")).toBe(true);
    expect(autonomyAllows(3, "generate_contingency")).toBe(false);
  });
});

describe("validador de propuestas (TEST O)", () => {
  const lib = new Set(["e1", "e2"]);
  const good = { version: 1, intent: "short_time", sourceDayId: "d1", exercises: [{ exerciseId: "e1", sets: 3, reps: "8-10", restSec: 90 }], changes: ["Menos series"], warnings: [], requiresCoachApproval: false, requiresUserConfirmation: true };
  it("acepta una propuesta completa y consistente", () => { expect(validateProposal(good, lib).ok).toBe(true); });
  it("rechaza ejercicios inexistentes, rangos y cargas inventadas", () => {
    const r = validateProposal({ ...good, exercises: [{ exerciseId: "inventado", sets: 40, reps: "muchas", restSec: -1, weightKg: 200 }] }, lib);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.length).toBeGreaterThanOrEqual(5);
    expect(validateProposal("texto libre del modelo", lib).ok).toBe(false);
    expect(validateProposal({ ...good, version: 2 }, lib).ok).toBe(false);
  });
});
