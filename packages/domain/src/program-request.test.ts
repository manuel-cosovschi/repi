import { describe, expect, it } from "vitest";
import { LATE_BRIEF_SNOOZE_DAYS, briefProfileGaps, briefProfilePatch, briefRows, briefSummary, briefToAssistant, cleanProgramBrief, isCompleteBrief, lateBriefSnoozed } from "./program-request";
import { emptyWishes } from "./wishes";

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

describe("pedido ya respondido sin datos (13/11/2026)", () => {
  const brief = (over: Record<string, unknown> = {}) => { const r = cleanProgramBrief({ ...ok, ...over }); if (!r.ok) throw new Error(r.error); return r.brief; };

  it("«Ahora no» esconde el aviso 14 días y después vuelve; una fecha rota o futura no lo esconde para siempre", () => {
    const now = new Date("2026-11-13T15:00:00Z");
    expect(LATE_BRIEF_SNOOZE_DAYS).toBe(14);
    expect(lateBriefSnoozed(null, now)).toBe(false);
    expect(lateBriefSnoozed("2026-11-13T14:59:00Z", now)).toBe(true);
    expect(lateBriefSnoozed("2026-10-30T15:00:01Z", now)).toBe(true);
    expect(lateBriefSnoozed("2026-10-30T15:00:00Z", now)).toBe(false);
    expect(lateBriefSnoozed("no es una fecha", now)).toBe(false);
    expect(lateBriefSnoozed("2027-01-01T00:00:00Z", now)).toBe(false);
  });

  it("el pedido llega al perfil con la experiencia; un objetivo corporal sin edad adulta no se guarda pero el resto sí", () => {
    expect(briefProfilePatch(brief(), "adult")).toEqual({ goal: "muscle", daysPerWeek: 4, minutes: 60, experience: "intermediate", likes: "Sentadilla" });
    const fat = brief({ goal: "fat_loss", minutes: 180, likes: null });
    expect(briefProfilePatch(fat, "adult")).toMatchObject({ goal: "fat_loss", minutes: 180 });
    for (const age of ["minor", "unknown"] as const) {
      const p = briefProfilePatch(fat, age);
      expect(p).toEqual({ daysPerWeek: 4, minutes: 180, experience: "intermediate" });
      expect("goal" in p).toBe(false);
    }
    expect(JSON.stringify(briefProfilePatch(brief(), "adult"))).not.toContain("Rodilla"); // las lesiones nunca van al perfil
  });

  it("completa sólo los huecos del perfil con un pedido anterior (la experiencia de antes de D217) y no pisa nada", () => {
    const old = { ...emptyWishes(), goal: "strength" as const, daysPerWeek: 5, minutes: 45 };
    expect(briefProfileGaps(brief(), old, "adult")).toEqual({ experience: "intermediate" });
    expect(briefProfileGaps(brief(), null, "adult")).toEqual({ goal: "muscle", daysPerWeek: 4, minutes: 60, experience: "intermediate" });
    expect(briefProfileGaps(brief({ goal: "fat_loss" }), null, "unknown")).toEqual({ daysPerWeek: 4, minutes: 60, experience: "intermediate" });
    expect(briefProfileGaps(brief(), { ...old, experience: "advanced" }, "adult")).toEqual({});
  });
});
