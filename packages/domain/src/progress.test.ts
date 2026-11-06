import { describe, expect, it } from "vitest";
import { announcementFor, announcementIssues, estimateCalories, bodyGoalProgress, bodyGoalText, isIsoDay, parseBodyWeight, bodyWeightIn, rangeStart, weightAt, weightSummary, fmtWeightDelta } from "./progress";

describe("rangos", () => {
  it("30 días incluye hoy; todo = sin límite", () => {
    expect(rangeStart("30d", "2026-11-05")).toBe("2026-10-07");
    expect(rangeStart("all", "2026-11-05")).toBeNull();
    expect(rangeStart("1y", "2026-03-01")).toBe("2025-03-02");
  });
  it("fechas calendario válidas", () => {
    expect(isIsoDay("2026-02-28")).toBe(true);
    expect(isIsoDay("2026-02-31")).toBe(false);
    expect(isIsoDay("26-02-01")).toBe(false);
  });
});

describe("peso corporal", () => {
  it("kg y lb a gramos exactos; rechaza valores absurdos", () => {
    expect(parseBodyWeight("80,4", "kg")).toBe(80400);
    expect(parseBodyWeight("176.4", "lb")).toBe(80014);
    expect(bodyWeightIn(80014, "lb")).toBe(176.4);
    expect(parseBodyWeight("8", "kg")).toBeNull();
    expect(parseBodyWeight("500", "kg")).toBeNull();
    expect(parseBodyWeight("80.45", "kg")).toBeNull();
    expect(parseBodyWeight("-80", "kg")).toBeNull();
    expect(parseBodyWeight("abc", "kg")).toBeNull();
  });
  it("objetivo de bajada: 84 → 80 con meta 76 es 50 %", () => {
    const g = bodyGoalProgress({ startG: 84000, currentG: 80000, targetG: 76000 });
    expect(g).toMatchObject({ state: "toward", direction: "down", wantedG: -8000, changeG: -4000, alongG: 4000, remainingG: 4000, pct: 50 });
    expect(bodyGoalText(g, "kg")).toBe("8 kg de cambio buscado · 4 kg recorridos · 50 % del recorrido hacia la meta.");
  });
  it("objetivo de subida", () => {
    expect(bodyGoalProgress({ startG: 60000, currentG: 63000, targetG: 66000 })).toMatchObject({ state: "toward", direction: "up", pct: 50 });
  });
  it("retroceso: nunca un porcentaje negativo, se explica", () => {
    const g = bodyGoalProgress({ startG: 84000, currentG: 86000, targetG: 76000 });
    expect(g).toMatchObject({ state: "away", pct: 0, alongG: -2000 });
    expect(bodyGoalText(g, "kg")).toContain("en sentido contrario");
  });
  it("meta superada queda en 100 % con lo que la pasó", () => {
    const g = bodyGoalProgress({ startG: 84000, currentG: 75000, targetG: 76000 });
    expect(g).toMatchObject({ state: "reached", pct: 100, remainingG: -1000 });
    expect(bodyGoalText(g, "kg")).toBe("Llegaste a tu objetivo y lo pasaste por 1 kg.");
  });
  it("99 % mientras falte algo; 100 % recién al llegar", () => {
    expect(bodyGoalProgress({ startG: 84000, currentG: 76100, targetG: 76000 })).toMatchObject({ state: "toward", pct: 98 });
    expect(bodyGoalProgress({ startG: 84000, currentG: 76010, targetG: 76000 })).toMatchObject({ state: "toward", pct: 99 });
    expect(bodyGoalProgress({ startG: 84000, currentG: 76000, targetG: 76000 })).toMatchObject({ state: "reached", pct: 100 });
  });
  it("objetivo igual al inicial = mantener, con banda y sin porcentaje", () => {
    const g = bodyGoalProgress({ startG: 70000, currentG: 70800, targetG: 70000 });
    expect(g).toMatchObject({ state: "maintain", inBand: true, bandG: 1050 });
    expect(bodyGoalProgress({ startG: 70000, currentG: 72000, targetG: 70200 })).toMatchObject({ state: "maintain", inBand: false });
    expect(bodyGoalText(bodyGoalProgress({ startG: 70000, currentG: 72000, targetG: 70200 }), "kg")).toContain("por encima");
  });
  it("datos insuficientes", () => {
    expect(bodyGoalProgress({ startG: null, currentG: null, targetG: 70000 })).toMatchObject({ state: "insufficient", missing: "start" });
    expect(bodyGoalProgress({ startG: 80000, currentG: 80000, targetG: null })).toMatchObject({ state: "insufficient", missing: "target" });
  });
  it("cambio de meta: se recalcula con la meta nueva sin tocar las mediciones", () => {
    const pts = { startG: 84000, currentG: 80000 };
    expect(bodyGoalProgress({ ...pts, targetG: 76000 }).state).toBe("toward");
    expect(bodyGoalProgress({ ...pts, targetG: 80000 }).state).toBe("reached");
  });
  it("en lb", () => {
    expect(bodyGoalText(bodyGoalProgress({ startG: 84000, currentG: 80000, targetG: 76000 }), "lb")).toBe("17,6 lb de cambio buscado · 8,8 lb recorridos · 50 % del recorrido hacia la meta.");
    expect(fmtWeightDelta(-4000, "kg")).toBe("−4 kg");
    expect(fmtWeightDelta(1500, "kg")).toBe("+1,5 kg");
  });
  it("resumen y peso para una fecha", () => {
    const pts = [{ day: "2026-10-01", weightG: 84000 }, { day: "2026-10-20", weightG: 82000 }, { day: "2026-11-01", weightG: 80000 }];
    expect(weightSummary(pts)).toMatchObject({ first: pts[0], last: pts[2], netG: -4000, count: 3 });
    expect(weightSummary([])).toBeNull();
    expect(weightAt(pts, "2026-10-25")).toEqual(pts[1]);
    expect(weightAt(pts, "2026-09-30")).toBeNull();
    expect(weightAt(pts, "2027-03-01")).toBeNull(); // más de 60 días: no se usa un peso viejo oculto
  });
});

describe("calorías estimadas", () => {
  const base = { activeSec: 3600, cardioSec: 0, bodyWeightG: 80000, rpe: null, minor: false };
  it("musculación 60 min, 80 kg, sin RPE: 3,5–6 MET → 280–480 kcal (rango, redondeado a 10)", () => {
    expect(estimateCalories(base)).toMatchObject({ ok: true, low: 280, high: 480, kind: "strength", minutes: 60 });
  });
  it("el RPE achica el rango; no se presenta como exacto", () => {
    const r = estimateCalories({ ...base, rpe: 9 });
    expect(r).toMatchObject({ ok: true, low: 400, high: 480 });
    if (r.ok) { expect(r.low % 10).toBe(0); expect(r.high % 10).toBe(0); }
  });
  it("cardio y sesión mixta suman cada parte con su MET", () => {
    expect(estimateCalories({ ...base, cardioSec: 3600 })).toMatchObject({ ok: true, kind: "cardio", low: 280, high: 800 });
    expect(estimateCalories({ ...base, cardioSec: 1200 })).toMatchObject({ ok: true, kind: "mixed", low: 280, high: 590 });
  });
  it("sin peso, menores, anuladas y duraciones inválidas no se estiman", () => {
    expect(estimateCalories({ ...base, bodyWeightG: null })).toEqual({ ok: false, reason: "no_weight" });
    expect(estimateCalories({ ...base, minor: true })).toEqual({ ok: false, reason: "minor" });
    expect(estimateCalories({ ...base, voided: true })).toEqual({ ok: false, reason: "voided" });
    expect(estimateCalories({ ...base, activeSec: 120 })).toEqual({ ok: false, reason: "too_short" });
    expect(estimateCalories({ ...base, activeSec: 5 * 3600 })).toEqual({ ok: false, reason: "too_long" });
    expect(estimateCalories({ ...base, activeSec: Number.NaN })).toEqual({ ok: false, reason: "too_short" });
    expect(estimateCalories({ ...base, bodyWeightG: 5000 })).toEqual({ ok: false, reason: "no_weight" });
  });
  it("valores extremos válidos siguen siendo finitos y ordenados", () => {
    const r = estimateCalories({ ...base, activeSec: 4 * 3600, bodyWeightG: 400000, cardioSec: 4 * 3600, rpe: 10 });
    expect(r.ok && r.low < r.high && Number.isFinite(r.high)).toBe(true);
  });
});

describe("novedades", () => {
  const ok = { title: "¡Ahora podés seguir tu progreso!", summary: "Registrá tu peso y revisá tus gráficos desde Progreso.", ctaLabel: "Ver mi progreso", destination: "member.progress", audience: ["member"] };
  it("válido", () => expect(announcementIssues(ok)).toEqual([]));
  it("sin HTML ni enlaces", () => {
    expect(announcementIssues({ ...ok, summary: "<b>hola</b> mundo y más texto" })).toContain("Sin HTML: escribí texto plano.");
    expect(announcementIssues({ ...ok, summary: "Entrá a https://phishing.example ya mismo" })).toContain("Sin enlaces: elegí un destino dentro de REPI.");
  });
  it("destino coherente con la audiencia", () => {
    expect(announcementIssues({ ...ok, audience: ["coach"] })[0]).toMatch(/destino no corresponde/);
    expect(announcementIssues({ ...ok, destination: "https://x" })).toContain("Elegí un destino de la lista.");
    expect(announcementIssues({ ...ok, audience: [] })).toContain("Elegí al menos una audiencia válida.");
  });
  it("roles: «all» llega a todos; varios roles reciben una sola vez", () => {
    expect(announcementFor(["all"], new Set())).toBe(true);
    expect(announcementFor(["coach"], new Set(["member"]))).toBe(false);
    expect(announcementFor(["coach", "member"], new Set(["member", "coach"]))).toBe(true);
    expect(announcementFor(["gym_admin"], new Set(["member"]))).toBe(false);
  });
});

describe("elegibilidad por edad (D203)", () => {
  it("sin fecha o con fecha inválida es «unknown», nunca adulta; menos de 13 es menor", async () => {
    const { ageEligibility } = await import("./access");
    expect(ageEligibility(null, "2026-11-06")).toBe("unknown");
    expect(ageEligibility(undefined, "2026-11-06")).toBe("unknown");
    expect(ageEligibility("", "2026-11-06")).toBe("unknown");
    expect(ageEligibility("2030-01-01", "2026-11-06")).toBe("unknown"); // futura
    expect(ageEligibility("1800-01-01", "2026-11-06")).toBe("unknown"); // más de 120 años
    expect(ageEligibility("1990-01-01", "2026-11-06")).toBe("adult");
    expect(ageEligibility("2008-11-06", "2026-11-06")).toBe("adult"); // cumple 18 hoy
    expect(ageEligibility("2008-11-07", "2026-11-06")).toBe("minor"); // le falta un día
    expect(ageEligibility("2016-01-01", "2026-11-06")).toBe("minor"); // menos de 13
  });
});
