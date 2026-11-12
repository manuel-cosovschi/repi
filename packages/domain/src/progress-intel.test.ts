import { describe, expect, it } from "vitest";
import {
  bestSet, capacityFor, distanceTo, effort, estimates, goalStatus, loadForReps, maxLoad, metricOfSets, nextText, progressInsights, recordEvents, regularity,
  type PISet,
} from "./progress-intel";
import { personalProfile, emptyWishes, mergeProfile } from "./wishes";
import { kgTo } from "./units";

const now = new Date("2026-11-12T15:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10);
const S = (d: number, w: number | null, r: number | null, o: Partial<PISet> = {}): PISet => ({
  at: `${day(d)}T20:00:00.000Z`, day: day(d), sessionId: o.source === "import" ? null : `s${d}`, source: "session", approx: false, w, r, sec: null, rir: null, cls: "work", ...o,
});

describe("D217 · Progress Intelligence: cuatro conceptos separados", () => {
  const sets: PISet[] = [
    S(60, 20, 10, { cls: "warmup" }), S(60, 60, 10), S(60, 60, 9),
    S(30, 30, 8, { cls: "warmup" }), S(30, 65, 10), S(30, 65, 10),
    S(10, 70, 10), S(10, 70, 9), S(10, 50, 12, { cls: "stage" }), // drop: etapa
    S(3, 75, 5), S(3, 72.5, 8),
  ];
  it("26 · carga máxima REAL: la serie válida más pesada (las aproximaciones no cuentan)", () => {
    expect(maxLoad(sets)).toMatchObject({ w: 75, r: 5, day: day(3), source: "session" });
    expect(maxLoad([S(1, 200, 1, { cls: "warmup" })])).toBeNull();
  });
  it("27–28 · mejor serie con criterio explícito y su 1RM estimado (no confunde aproximación ni drop)", () => {
    const b = bestSet(sets)!;
    expect(b).toMatchObject({ w: 70, r: 10, e1rm: 93.3 }); // 70 × (1 + 10/30) = 93,3 > 72,5 × 8 (91,8) > 75 × 5 (87,5)
    // Una aproximación o una etapa con números más altos nunca es la mejor serie.
    expect(bestSet([...sets, S(2, 90, 8, { cls: "warmup" }), S(2, 85, 10, { cls: "stage" })])!.w).toBe(70);
    expect(bestSet([S(2, 60, 15)])).toBeNull(); // más de 12 repeticiones: sin 1RM estimado
  });
  it("29 · estimaciones por repeticiones: cerca de la referencia, sin extrapolar desde muchas repeticiones ni desde fechas aproximadas", () => {
    const e = estimates(sets, now)!;
    expect(e.ref.r).toBeLessThanOrEqual(10);
    for (const r of e.rows) expect(Math.abs(r.reps - e.ref.r)).toBeLessThanOrEqual(4);
    expect(e.rows.find((r) => r.reps === e.ref.r)?.confidence ?? "media").toBe("media");
    expect(e.method).toContain("Epley");
    expect(e.limits).toContain("no hace falta probar un máximo real");
    expect(estimates([S(5, 40, 15), S(4, 40, 14)], now)).toBeNull(); // sólo series de muchas repeticiones
    expect(estimates([S(5, 80, 5, { approx: true, source: "import" })], now)).toBeNull(); // 35 · fecha aproximada
    expect(estimates([S(200, 80, 5)], now)).toBeNull(); // marca vieja
    expect(loadForReps(100, 10)).toBe(75);
    expect(loadForReps(100, 1)).toBe(100);
  });
  it("32 · récords: la primera marca no es récord; 1RM contra 1RM y carga contra carga", () => {
    const r = recordEvents(sets, "load");
    expect(r.map((x) => [x.day, x.kind])).toEqual([[day(30), "e1rm"], [day(30), "load"], [day(10), "e1rm"], [day(10), "load"], [day(3), "load"]]);
    expect(recordEvents([S(5, 60, 10)], "load")).toEqual([]);
  });
  it("33 · récord reciente vs histórico: el insight sólo habla de récord si fue en la última sesión", () => {
    const rec = recordEvents(sets, "load");
    const ins = progressInsights({ trend: null, records: rec, lastSessionDay: day(3), profile: null, now });
    expect(ins[0].code).toBe("record");
    expect(progressInsights({ trend: null, records: rec, lastSessionDay: day(1), profile: null, now }).some((x) => x.code === "record")).toBe(false);
  });
  it("34–35 · importado con fecha aproximada: cuenta como dato histórico marcado, no para regularidad ni estimaciones", () => {
    const imp = [S(400, 90, 5, { source: "import", approx: true }), S(5, 70, 8)];
    expect(maxLoad(imp)).toMatchObject({ w: 90, approx: true, source: "import" });
    const reg = regularity(imp, [day(5)], now, 3);
    expect(reg.lastDay).toBe(day(5));
    expect(reg.avgGapDays).toBeNull(); // la fecha aproximada no entra en los intervalos
    expect(progressInsights({ trend: null, records: [], lastSessionDay: day(5), profile: null, now, approxShare: 0.5 }).some((x) => x.code === "approx_dates")).toBe(true);
  });
  it("36–37 · serie anulada no llega; serie corregida llega con su valor vigente (el cálculo es al leer)", () => {
    // El servidor filtra voided_at y lee el valor vigente: el dominio sólo ve lo válido.
    const corrected = sets.map((s) => (s.day === day(3) && s.w === 75 ? { ...s, w: 57.5 } : s));
    expect(maxLoad(corrected)!.w).toBe(72.5);
  });
  it("38–40 · por tiempo, peso corporal y drop sets: cada uno en su escala", () => {
    expect(metricOfSets([S(1, null, null, { cls: "timed", sec: 60 })])).toBe("time");
    expect(metricOfSets([S(1, null, 12)])).toBe("reps");
    expect(maxLoad([S(1, null, 12)])).toBeNull(); // peso corporal: no es 0 kg
    expect(recordEvents([S(9, null, 10), S(2, null, 12)], "reps").map((x) => x.value)).toEqual([12]);
    expect(recordEvents([S(9, null, null, { cls: "timed", sec: 45 }), S(2, null, null, { cls: "timed", sec: 60 })], "time").map((x) => x.value)).toEqual([60]);
    expect(bestSet([S(1, 50, 12, { cls: "stage" })])).toBeNull(); // un drop no es «mejor serie»
  });
  it("41 · kg y lb: el dominio trabaja en kg; mostrar en lb convierte sin cambiar el dato", () => {
    const lb = (x: number) => `${kgTo(x, "lb")} lb`;
    expect(goalStatus({ kind: "load", target: 80, targetReps: 8, baseline: null }, [S(1, 80, 6)], lb).text).toContain("176.4 lb × 8");
    expect(kgTo(72.5, "lb")).toBe(159.8);
  });
  it("31 · meta por ejercicio: «La mejor serie registrada con ese peso fue de 6 repeticiones»", () => {
    const g = goalStatus({ kind: "load", target: 80, targetReps: 8, baseline: 70 }, [S(9, 75, 8), S(2, 80, 6)]);
    expect(g.met).toBe(false);
    expect(g.text).toBe("Tu meta es 80 kg × 8. La mejor serie registrada con ese peso fue de 6 repeticiones.");
    expect(g.current).toBe(75);
    expect(g.pct).toBe(50);
    expect(goalStatus({ kind: "load", target: 80, targetReps: 8, baseline: 70 }, [S(1, 82.5, 8)]).met).toBe(true);
    expect(goalStatus({ kind: "reps", target: 12, targetReps: null, baseline: 6 }, [S(1, null, 9)])).toMatchObject({ met: false, current: 9, pct: 50 });
    expect(goalStatus({ kind: "time", target: 90, targetReps: null, baseline: null }, [S(1, null, null, { cls: "timed", sec: 95 })]).met).toBe(true);
    expect(goalStatus({ kind: "e1rm", target: 100, targetReps: null, baseline: null }, []).text).toContain("Faltan series");
  });
  it("«¿Cuánto me falta para 100 kg?»: contra la carga real y, aparte, contra la estimación", () => {
    const d = distanceTo(100, sets);
    expect(d.real).toBe(25);
    expect(d.text).toContain("Tu mayor carga registrada es 75 kg × 5: te faltan 25 kg para 100 kg.");
    expect(d.text).toContain("estimación");
  });
  it("«¿Cuánto podría tirar para 8?»: estimación con referencia, o explica por qué no", () => {
    const c = capacityFor(8, sets, now);
    expect(c.weightKg).toBeGreaterThan(0);
    expect(c.text).toContain("Estimación aproximada");
    expect(capacityFor(20, [S(2, 100, 2)], now).weightKg).toBeNull();
    expect(capacityFor(8, [], now).text).toContain("No hay una serie reciente");
  });
  it("30 · próxima carga: redacta la propuesta de TI tal cual (sin otra cifra)", () => {
    const t = nextText({ w: 70, r: 10 }, { kind: "reps", text: "", weightKg: 70, reps: 11, requiresCoach: false, basis: "" })!;
    expect(t).toBe("La última vez completaste 70 kg × 10 en tus series principales. En una próxima sesión comparable podrías mantener 70 kg y buscar 11 repeticiones. Si la programación y el esfuerzo registrado lo permiten; no es una garantía.");
    expect(nextText({ w: 70, r: 10 }, null)).toBeNull();
    expect(nextText({ w: 70, r: 12 }, { kind: "load", text: "", weightKg: 72.5, reps: 8, requiresCoach: true, basis: "" })).toContain("queda como propuesta para tu entrenador");
  });
  it("intervenciones: mejora consistente, estable con objetivo de fuerza, pocos registros, cambio de objetivo, sin repetir lo visto", () => {
    const tr = (kind: string, confidence = "consistent", sessions = 4) => ({ kind, confidence, sessions, text: "x", basis: "b" }) as never;
    expect(progressInsights({ trend: tr("progressing"), records: [], lastSessionDay: null, profile: null, now })[0].text).toContain("En tus últimas 4 sesiones comparables");
    const strength = personalProfile({ ...emptyWishes(), goal: "strength" });
    expect(progressInsights({ trend: tr("plateau"), records: [], lastSessionDay: null, profile: strength, now })[0].text).toContain("Si tu objetivo sigue siendo ganar fuerza");
    expect(progressInsights({ trend: tr("insufficient", "none", 1), records: [], lastSessionDay: null, profile: null, now })[0].code).toBe("few_data");
    const m1 = mergeProfile(null, { goal: "muscle" }, "profile", new Date(now.getTime() - 40 * 86_400_000)).wishes;
    const m2 = mergeProfile(m1, { goal: "strength" }, "profile", new Date(now.getTime() - 86_400_000)).wishes;
    const ins = progressInsights({ trend: tr("progressing"), records: [], lastSessionDay: null, profile: personalProfile(m2), profileMeta: m2.meta, now });
    expect(ins.map((x) => x.code)).toContain("goal_changed");
    expect(ins.find((x) => x.code === "goal_changed")!.text).toContain("respetando la programación vigente");
    expect(progressInsights({ trend: tr("progressing"), records: [], lastSessionDay: null, profile: null, now, seen: ["improving"] }).some((x) => x.code === "improving")).toBe(false);
    expect(progressInsights({ trend: tr("progressing"), records: [], lastSessionDay: null, profile: personalProfile(m1), profileMeta: m1.meta, now }).some((x) => x.code === "goal_changed")).toBe(false); // primera declaración, no cambio
  });
  it("regularidad y esfuerzo: adherencia contra los días declarados; RIR promedio y series al fallo", () => {
    const days = [1, 3, 5, 8, 10, 12, 15, 17].map(day);
    const r = regularity([S(1, 60, 8), S(8, 60, 8)], days, now, 3);
    expect(r.perWeek).toBe(2);
    expect(r.adherencePct).toBe(67);
    expect(regularity([], [], now, null)).toMatchObject({ perWeek: null, adherencePct: null });
    const e = effort([S(1, 60, 8, { rir: 0 }), S(1, 60, 8, { rir: 2 }), S(1, 40, 8, { cls: "warmup", rir: 5 })], now);
    expect(e).toEqual({ sets: 2, withRir: 2, avgRir: 1, atFailure: 1 });
  });
});
