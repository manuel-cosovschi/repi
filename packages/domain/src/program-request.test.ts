import { describe, expect, it } from "vitest";
import { briefRows, briefSummary, briefToAssistant, cleanProgramBrief, isCompleteBrief } from "./program-request";

const ok = { goal: "muscle", daysPerWeek: 4, minutes: 60, level: "intermediate", hasLimitations: true, limitationsDetail: "Rodilla derecha operada (2023)", focus: ["gluteos", "piernas", "x"], place: "gym", likes: "Sentadilla", avoid: null, notes: "Corro los domingos" };

describe("preferencias del pedido de programa (D206)", () => {
  it("exige objetivo, días, minutos, experiencia y la decisión sobre lesiones", () => {
    for (const [k, v] of [["goal", "otro"], ["daysPerWeek", 0], ["minutes", 5], ["level", null], ["hasLimitations", undefined]] as const) {
      const r = cleanProgramBrief({ ...ok, [k]: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe(k);
    }
    const r = cleanProgramBrief({ ...ok, limitationsDetail: "" });
    expect(r.ok === false && r.field).toBe("limitationsDetail");
    const n = cleanProgramBrief({ ...ok, hasLimitations: false, limitationsDetail: "ignorado" });
    expect(n.ok && n.brief.limitationsDetail).toBeNull();
  });

  it("normaliza y descarta lo que no está en las listas", () => {
    const r = cleanProgramBrief({ ...ok, place: "luna" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.brief.focus).toEqual(["gluteos", "piernas"]);
    expect(r.brief.place).toBeNull();
    expect(isCompleteBrief(r.brief)).toBe(true);
    expect(isCompleteBrief({ goal: "muscle" })).toBe(false);
    expect(isCompleteBrief(null)).toBe(false);
  });

  it("arma el texto para el profe, marca las lesiones y precarga el asistente", () => {
    const r = cleanProgramBrief(ok);
    if (!r.ok) throw new Error(r.error);
    expect(briefRows(r.brief).find((x) => x.label === "Lesiones o limitaciones")).toEqual({ label: "Lesiones o limitaciones", value: "Rodilla derecha operada (2023)", alert: true });
    const s = briefSummary(r.brief);
    expect(s).toContain("Objetivo: Ganar músculo");
    expect(s).toContain("4 días por semana · 60 min");
    expect(s).toContain("Quiere priorizar: Glúteos, Piernas");
    expect(briefSummary(r.brief, 80).length).toBeLessThanOrEqual(80);
    const a = briefToAssistant({ ...r.brief, daysPerWeek: 7 });
    expect(a).toMatchObject({ goal: "muscle", daysPerWeek: 6, minutes: 60, level: "intermediate", limitations: "Rodilla derecha operada (2023)" });
    expect(a.likes).toContain("Priorizar: Glúteos, Piernas");
    expect(a.notes).toContain("En el gimnasio");
  });
});
