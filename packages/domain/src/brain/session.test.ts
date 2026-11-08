import { describe, expect, it } from "vitest";
import { briefExercise, compareWithPrevious, detectMarks, interpretSet, isPyramid, rankAlternatives, remainingSeconds, sessionReview, setsText, shortenSession, type ReviewExercise, type ShortenExercise } from "./session";
import { recommendExercise, type DoneRow, type ExCtx, type HistRow, type RowTarget } from "../intelligence";
import { emptyDetail, type ExerciseDetail, type SetSpec } from "../prescription";
import type { ExerciseBriefInput } from "./types";
import { EX, NOW, daysAgo } from "./fixtures";

const now = new Date(NOW);
const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const straight = (sets: number, reps: string, rir: number | null = null): ExCtx => ({ sets, reps, rir, restSec: 90, detail: null });
const withPlan = (plan: SetSpec[], extra: Partial<ExerciseDetail> = {}): ExCtx => ({ sets: plan.length, reps: plan[0].reps, rir: null, restSec: 90, detail: { ...emptyDetail(), technique: "custom", setPlan: plan, ...extra } });
let sid = 0;
const sess = (ago: number, rows: Partial<HistRow>[]): HistRow[] => { const id = `s${++sid}`; return rows.map((r, i) => ({ sessionId: id, at: daysAgo(ago), setLogId: `${id}-${i}`, specId: `r${i}`, kind: "work", stage: 0, reps: "10-12", w: 60, r: 10, rir: 2, feel: null, source: "repi", ...r })); };
const targets = (ex: ExCtx, history: HistRow[] = [], o: Partial<Parameters<typeof recommendExercise>[0]> = {}) => recommendExercise({ ex, history, now, ...o });
/** Briefing desde los objetivos reales de Training Intelligence (la primera serie principal). */
function briefFrom(ex: ExCtx, history: HistRow[], extra: Partial<ExerciseBriefInput> = {}, tone: "normal" | "breve" = "normal") {
  const t = targets(ex, history).find((x) => x.status !== "not_applicable")!;
  const last = history.length ? { at: history[0].at, sets: history.filter((h) => h.sessionId === history[0].sessionId).map((h) => ({ w: h.w, r: h.r, rir: h.rir })) } : null;
  const input: ExerciseBriefInput = {
    exercise: EX.pb, prescribed: { sets: ex.sets, reps: ex.reps, rir: ex.rir, restSec: ex.restSec, loadKg: ex.detail?.setPlan?.[0]?.weightKg ?? null, coachLoad: !!ex.detail?.setPlan?.some((s) => s.weightKg != null), method: null },
    last, recommendation: { weightKg: t.weightKg, reps: t.repsTarget, repsMin: t.repsMin, repsMax: t.repsMax, action: t.action, why: t.why, status: t.status, guards: t.guards, review: t.review },
    restrictions: [], missing: [], ...extra,
  };
  return briefExercise(input, tone);
}
const done = (index: number, w: number | null, r: number | null, rir: number | null = 2, feel: string | null = null): DoneRow => ({ index, w, r, rir, feel });

describe("session · briefing antes del ejercicio (casos 1–3, 7, 16–17, 24)", () => {
  it("el ejemplo del máster, con números de Training Intelligence", () => {
    const b = briefFrom(straight(3, "10-12"), sess(4, [{}, {}, {}]));
    expect(b.text).toBe("La última vez hiciste 3 × 10 con 60 kg. Hoy tenés indicado trabajar entre 10 y 12 repeticiones. Mantenemos la carga e intentamos acercarnos a 12.");
    expect(b.evidence).toMatchObject({ via: "rules", basis: expect.stringMatching(/^Última sesión comparable: \d\d\/\d\d \(3 × 10 con 60 kg\)\.$/) });
    expect(b.warnings).toEqual([]);
  });
  it("caso 1 · alumno nuevo sin historial: lo dice y no inventa kilos", () => {
    const b = briefFrom(straight(3, "8-10"), []);
    expect(b.text).toMatch(/Todavía no tengo registros comparables/);
    expect(b.text).not.toMatch(/kg/);
    expect(b.evidence.sessions).toEqual([]);
  });
  it("caso 2 · con una sesión: compara con esa y sube cuando completó el rango", () => {
    const b = briefFrom(straight(3, "8-10"), sess(3, [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }]));
    expect(b.text).toMatch(/hoy probamos 62,5 kg y volvemos a 8\./);
  });
  it("caso 3 · alumno avanzado con cientos de sesiones: decide con la última comparable", () => {
    const h = Array.from({ length: 300 }, (_, i) => sess(2 + i, [{ w: 80 - i * 0.1, r: 10 }, { w: 80 - i * 0.1, r: 10 }, { w: 80 - i * 0.1, r: 9 }])).flat();
    const b = briefFrom(straight(3, "10-12"), h);
    expect(b.text).toMatch(/^La última vez hiciste 80 kg × 10, 10, 9\./);
    expect(b.text).toMatch(/Repetimos 80 kg y buscamos 10 en todas las series\./);
  });
  it("caso 7 · referencia importada: lo advierte como orientación", () => {
    const b = briefFrom(straight(3, "8-10"), sess(30, [{ source: "import", kind: null, stage: null, specId: null, reps: null, w: 50 }]), { missing: ["low_quality"] });
    expect(b.warnings).toContain("La referencia viene de un registro importado: tomala como orientación.");
  });
  it("caso 16 · regreso después de varias semanas: retoma con menos carga y lo explica", () => {
    const b = briefFrom(straight(3, "10-12"), sess(40, [{}, {}, {}]));
    expect(b.text).toMatch(/Bajamos a 54 kg|Bajamos a 52,5 kg|Bajamos a \d+(,\d+)? kg/);
    expect(b.warnings.join(" ")).toMatch(/más de 4 semanas/);
  });
  it("caso 17 · carga indicada por el profe: manda el plan", () => {
    const ex = withPlan([S("work", "8-10", { weightKg: 70 }), S("work", "8-10", { weightKg: 70 })]);
    const b = briefFrom(ex, sess(3, [{ w: 60, reps: "8-10" }, { w: 60, reps: "8-10" }]));
    expect(b.text).toMatch(/Vamos con la carga que indicó tu profe: 70 kg\./);
    expect(b.warnings.join(" ")).toMatch(/revisar el objetivo con tu profe/);
  });
  it("caso 24 · carga anterior incompatible (otro rango): estimación prudente, sin repetir la protección", () => {
    const b = briefFrom(straight(3, "12-15"), sess(3, [{ w: 80, r: 5, reps: "4-6" }, { w: 80, r: 5, reps: "4-6" }]));
    expect(b.text).toMatch(/Es otro rango que la última vez: \d+(,\d+)? kg es una estimación prudente/);
    const w = Number(/: (\d+(?:,\d+)?) kg es una/.exec(b.text)![1].replace(",", "."));
    expect(w).toBeLessThan(80);
    expect(b.warnings.some((x) => /otro rango/.test(x))).toBe(false);
  });
  it("tono breve: una línea y una advertencia como mucho; restricciones y faltantes se dicen", () => {
    const b = briefFrom(straight(3, "10-12"), sess(4, [{}, {}, {}]), { restrictions: ["Molestia en el hombro"], missing: ["increment_unknown", "otra_cosa"] }, "breve");
    expect(b.text).toBe("Mantenemos la carga e intentamos acercarnos a 12.");
    expect(b.warnings).toHaveLength(1);
    const full = briefFrom(straight(3, "10-12"), sess(4, [{}, {}, {}]), { restrictions: ["Molestia en el hombro"], missing: ["increment_unknown", "otra_cosa"] });
    expect(full.warnings).toEqual(["Tenés registrado: Molestia en el hombro. Si molesta, pará y consultalo con tu profe.", "No sé el salto de carga de este equipo: tomá la carga como referencia.", "Falta un dato: otra_cosa."]);
  });
  it("resumen de series", () => {
    expect(setsText([{ w: 60, r: 10 }, { w: 60, r: 10 }])).toBe("2 × 10 con 60 kg");
    expect(setsText([{ w: 60, r: 10 }, { w: 60, r: 9 }])).toBe("60 kg × 10, 9");
    expect(setsText([{ w: 50, r: 12 }, { w: 55, r: 10 }])).toBe("50 kg × 12 · 55 kg × 10");
    expect(setsText([{ w: null, r: 12 }, { w: null, r: 12 }])).toBe("2 × 12");
    expect(setsText([{ w: 60, r: null }])).toBeNull();
  });
});

describe("session · después de cada serie (casos 17–21)", () => {
  const run = (ex: ExCtx, ts: RowTarget[], ds: DoneRow[], justDone: number, o: Partial<Parameters<typeof interpretSet>[0]> = {}) => interpretSet({ ex, targets: ts, done: ds, justDone, ...o });
  it("aproximación: se aclara una vez y no se compara", () => {
    const ex = withPlan([S("warmup", "10"), S("warmup", "6"), S("work", "8-10"), S("work", "8-10")]);
    const ts = targets(ex, sess(3, [{ kind: "work", specId: "r2", reps: "8-10" }]));
    const m = run(ex, ts, [done(0, 40, 10)], 0);
    expect(m).toMatchObject({ code: "warmup_note", speak: true, priority: 5, changed: [] });
    expect(m.text).toBe("Esta era una serie de aproximación. No la vamos a comparar con tus series principales.");
    expect(run(ex, ts, [done(0, 40, 10), done(1, 50, 6)], 1)).toMatchObject({ code: "warmup_note", speak: false });
  });
  it("caso 21 · más exigente de lo previsto: la siguiente se mantiene (nunca sube), con descanso extra opcional", () => {
    const ex = straight(3, "8-10", 2);
    const ts = targets(ex, sess(3, [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }]));
    expect(ts[1].action).toBe("increase_load");
    const m = run(ex, ts, [done(0, 62.5, 8, 0)], 0);
    expect(m).toMatchObject({ code: "harder", speak: true, priority: 3, restPlusSec: 30, changed: [1, 2] });
    expect(m.targets[1]).toMatchObject({ action: "hold", weightKg: 62.5 });
    expect(m.targets.every((t, i) => (t.weightKg ?? 0) <= (ts[i].weightKg ?? 0))).toBe(true);
  });
  it("caso 21 · con margen: no sube a mitad de sesión", () => {
    const ex = straight(3, "8-10", 2);
    const ts = targets(ex, sess(3, [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }]));
    const m = run(ex, ts, [done(0, 62.5, 10, 4, "facil")], 0);
    expect(m).toMatchObject({ code: "easier", changed: [] });
    expect(m.text).toMatch(/No subo la carga a mitad de la sesión/);
    expect(run(ex, ts, [done(0, 62.5, 10, 4, "facil")], 0, { tone: "breve" }).text).toBe("Vas con margen. A mitad de sesión no subimos la carga.");
  });
  it("objetivo cumplido en la última serie: lo dice una vez; en las anteriores calla", () => {
    const ex = straight(3, "8-12", 2);
    const ts = targets(ex, sess(3, [{ reps: "8-12", r: 9 }, { reps: "8-12", r: 9 }, { reps: "8-12", r: 9 }]));
    expect(run(ex, ts, [done(0, 60, 10)], 0)).toMatchObject({ code: "silent", speak: false });
    const last = run(ex, ts, [done(0, 60, 10), done(1, 60, 10), done(2, 60, 10)], 2);
    expect(last).toMatchObject({ code: "target_met", speak: true, priority: 5 });
    expect(last.text).toMatch(/^Completaste las repeticiones objetivo\./);
  });
  it("caso 17 · la siguiente carga es del profe: no la toca y lo dice", () => {
    const ex = withPlan([S("work", "8-10", { weightKg: 60 }), S("work", "8-10", { weightKg: 60 })]);
    const ts = targets(ex, []);
    const m = run(ex, ts, [done(0, 60, 6, 0)], 0);
    expect(m).toMatchObject({ code: "coach_hold", priority: 2, changed: [] });
    expect(m.targets[1]).toMatchObject({ source: "coach", weightKg: 60 });
  });
  it("molestia: prioridad máxima, nada sube, texto de derivación sin diagnóstico (caso 56)", () => {
    const ex = straight(3, "8-10", 2);
    const ts = targets(ex, sess(3, [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }]));
    const m = run(ex, ts, [done(0, 62.5, 8, 2, "molestia")], 0);
    expect(m).toMatchObject({ code: "pain", priority: 1, speak: true });
    expect(m.text).toMatch(/consultar a tu entrenador o profesional de salud/);
    expect(m.targets.slice(1).every((t) => t.action !== "increase_load")).toBe(true);
    expect(run(ex, ts, [done(0, 62.5, 8, 2, "molestia")], 0, { tone: "breve" }).text).toBe(m.text); // la seguridad nunca se acorta
  });
  it("caso 18 · drop set de varias etapas: las etapas no se evalúan como series sueltas (aunque vayan al fallo)", () => {
    const ex = withPlan([S("work", "8-10", { block: 0, stage: 0 }), S("drop", "al fallo", { block: 0, stage: 1 }), S("drop", "al fallo", { block: 0, stage: 2 })], { technique: "drop_set" });
    const ts = targets(ex, []);
    const d1 = run(ex, ts, [done(0, 60, 9), done(1, 48, 8, 0)], 1);
    expect(d1).toMatchObject({ code: "stage_progress", speak: false, changed: [] });
    expect(d1.text).toBe("Drop 1 de 2 hecho. Seguí con la siguiente etapa.");
    expect(d1.targets).toBe(ts);
    expect(run(ex, ts, [done(0, 60, 9), done(1, 48, 8, 0), done(2, 38, 6, 0, "limite")], 2)).toMatchObject({ code: "stage_done", speak: false });
  });
  it("rest-pause y cluster: mismas reglas de etapa", () => {
    const rp = withPlan([S("work", "8", { block: 0, stage: 0 }), S("rest_pause", "3-5", { block: 0, stage: 1 }), S("rest_pause", "3-5", { block: 0, stage: 2 })], { technique: "rest_pause" });
    expect(run(rp, targets(rp, []), [done(0, 60, 8), done(1, 60, 4, 0)], 1).text).toBe("Mini serie 1 de 2 hecho. Seguí con la siguiente etapa.");
    const cl = withPlan([S("cluster", "3", { block: 0, stage: 0 }), S("cluster", "3", { block: 0, stage: 1 }), S("cluster", "3", { block: 0, stage: 2 })], { technique: "cluster" });
    expect(run(cl, targets(cl, []), [done(0, 80, 3), done(1, 80, 3)], 1).text).toBe("Bloque 2 de 3 hecho. Seguí con la siguiente etapa.");
  });
  it("caso 19 · top set y back-off: el top set exigente no arrastra la carga del back-off", () => {
    const ex = withPlan([S("top", "3-5"), S("backoff", "8"), S("backoff", "8")], { technique: "top_backoff" });
    const ts = targets(ex, sess(3, [{ kind: "top", reps: "3-5", w: 100, r: 5 }, { kind: "backoff", specId: "r1", reps: "8", w: 85, r: 8 }, { kind: "backoff", specId: "r2", reps: "8", w: 85, r: 8 }]));
    const m = run(ex, ts, [done(0, 102.5, 3, 0)], 0);
    expect(m.code).toBe("harder");
    expect(m.targets[1]).toEqual(ts[1]);
    expect(m.targets[1].pending).toBe(true);
  });
  it("caso 20 · AMRAP: si supera la vez pasada lo celebra; si no, calla (sin reproches); con otra carga no compara", () => {
    const ex = withPlan([S("work", "8-10"), S("amrap", "AMRAP")], { technique: "amrap_last" });
    const ts = targets(ex, sess(3, [{ reps: "8-10", w: 60 }, { kind: "amrap", reps: "AMRAP", w: 60, r: 12 }]));
    expect(ts[1]).toMatchObject({ action: "hold", repsTarget: 12, weightKg: 60 });
    expect(run(ex, ts, [done(1, 60, 14, 0)], 1)).toMatchObject({ code: "amrap_beat", speak: true, priority: 4, text: "Hiciste 14 repeticiones: superaste las 12 repeticiones de la vez pasada." });
    expect(run(ex, ts, [done(1, 60, 12, 0)], 1)).toMatchObject({ code: "amrap_match", speak: false });
    expect(run(ex, ts, [done(1, 60, 9, 0)], 1)).toMatchObject({ code: "amrap_below", speak: false, text: "" });
    expect(run(ex, ts, [done(1, 50, 15, 0)], 1)).toMatchObject({ code: "silent", speak: false });
  });
  it("caso 20 · AMRAP por tiempo (rondas) y serie por tiempo", () => {
    const ex = withPlan([S("amrap", "AMRAP", { durationSec: 600, countUnit: "rounds" })], { technique: "amrap_time" });
    const ts = targets(ex, sess(3, [{ kind: "amrap", reps: "AMRAP", durationSec: 600, w: null, r: 7 }]));
    expect(run(ex, ts, [done(0, null, 8, null)], 0)).toMatchObject({ code: "time_beat", text: "Hiciste 8 rondas: superaste las 7 rondas de la vez pasada." });
    const pl = straight(3, "40 s");
    const tp = targets(pl, sess(3, [{ reps: "40 s", w: null, r: 40 }]));
    expect(run(pl, tp, [done(0, null, 50, null)], 0).text).toBe("Aguantaste 50 s: superaste los 40 s de la vez pasada.");
  });
  it("caso 20 · EMOM y circuitos: sin descanso extra (el intervalo o la vuelta mandan)", () => {
    const emom: ExCtx = { ...straight(3, "8-10", 2), detail: { ...emptyDetail(), technique: "emom", emomSec: 60 } };
    const te = targets(emom, sess(3, [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }]));
    expect(run(emom, te, [done(0, 62.5, 7, 0)], 0)).toMatchObject({ code: "harder", restPlusSec: null });
    const ex = straight(3, "8-10", 2);
    const ts = targets(ex, sess(3, [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }]));
    expect(run(ex, ts, [done(0, 62.5, 7, 0)], 0, { grouped: true })).toMatchObject({ code: "harder", restPlusSec: null });
  });
  it("posible marca en la sesión (con historia previa); sin historia no hay récord", () => {
    const ex = straight(3, "3-5", 2);
    const ts = targets(ex, sess(3, [{ reps: "3-5", w: 100, r: 5 }, { reps: "3-5", w: 100, r: 5 }, { reps: "3-5", w: 100, r: 5 }]));
    expect(run(ex, ts, [done(0, 105, 4)], 0, { bestE1rm: 116.7 })).toMatchObject({ code: "pr_possible", speak: true });
    expect(run(ex, ts, [done(0, 105, 4)], 0, { bestE1rm: null }).code).not.toBe("pr_possible");
  });
  it("pirámide: el mensaje de «más exigente» no pide mantener una carga que rompa la pirámide", () => {
    const ex = withPlan(["12", "10", "8"].map((r) => S("work", r)), { technique: "pyramid" });
    expect(isPyramid(ex)).toBe(true);
    expect(isPyramid(straight(3, "10"))).toBe(false);
    const ts = targets(ex, sess(3, [{ w: 50, r: 12, reps: "12" }, { w: 55, r: 10, reps: "10" }, { w: 60, r: 8, reps: "8" }]));
    const m = run(ex, ts, [done(0, 52.5, 12, 0)], 0);
    expect(m.text).toMatch(/pirámide/);
  });
  it("sin resultado no habla", () => {
    const ex = straight(2, "8-10");
    expect(run(ex, targets(ex, []), [done(0, 60, null)], 0)).toMatchObject({ code: "no_result", speak: false });
  });
});

describe("session · cierre (casos 10–11, 41)", () => {
  const W = (w: number | null, r: number, extra: Partial<ReviewExercise["sets"][number]> = {}) => ({ w, r, kind: "work" as const, stage: 0, ...extra });
  const before = (e1rm: number | null, maxLoadKg: number | null, repsAtLoad: { w: number; r: number }[] = []) => ({ e1rm, maxLoadKg, repsAtLoad, bestReps: null, bestSec: null });
  it("el ejemplo del máster: 18 de 20, una marca igualada, dos repeticiones más y el último sin terminar", () => {
    const exs: ReviewExercise[] = [
      { exercise: EX.pi, plannedMain: 4, sets: [W(30, 10), W(30, 10), W(30, 9), W(30, 8)], previous: { at: daysAgo(7), sets: [W(30, 10), W(30, 10), W(30, 9), W(30, 8)] }, before: before(40, 30) },
      { exercise: EX.rm, plannedMain: 4, sets: [W(50, 10), W(50, 10), W(50, 10), W(50, 9)], previous: { at: daysAgo(7), sets: [W(50, 10), W(50, 9), W(50, 9), W(50, 9)] }, before: before(70, 52.5, [{ w: 52.5, r: 10 }]) },
      { exercise: EX.sq, plannedMain: 4, sets: [W(80, 8), W(80, 8), W(80, 8), W(80, 8)], previous: { at: daysAgo(7), sets: [W(80, 8), W(80, 8), W(80, 8), W(80, 8)] }, before: before(110, 85) },
      { exercise: EX.pb, plannedMain: 4, sets: [W(60, 8), W(60, 8), W(60, 8), W(60, 8)], previous: { at: daysAgo(7), sets: [W(60, 8), W(60, 8), W(60, 8), W(60, 8)] }, before: before(80, 62.5) },
      { exercise: EX.curl, plannedMain: 4, sets: [W(40, 12), W(40, 12)], previous: { at: daysAgo(7), sets: [W(40, 12), W(40, 12), W(40, 12)] }, before: before(56, 40) },
    ];
    const r = sessionReview({ at: NOW, exercises: exs });
    expect([r.done, r.planned]).toEqual([18, 20]);
    expect(r.text).toBe("Hoy completaste 18 de las 20 series previstas. En Press inclinado con mancuernas igualaste tu mejor marca y en Remo en máquina hiciste dos repeticiones más que la sesión anterior con 50 kg. El último ejercicio quedó sin terminar. ¿Querés que lo tengamos en cuenta para tu próxima sesión?");
    expect(r.exercises.map((e) => e.status)).toEqual(["done", "done", "done", "done", "partial"]);
    expect(r.evidence.basis).toMatch(/^Comparé cada ejercicio con su sesión comparable anterior: /);
    expect(r.evidence.excluded).toMatch(/anuladas/);
  });
  it("caso 41 · marca auténtica por carga, por repeticiones con una carga y por 1RM estimado; la primera vez no es récord", () => {
    expect(detectMarks([W(105, 3)], before(116, 100), "load")[0]).toMatchObject({ type: "load", value: 105, previous: 100 });
    expect(detectMarks([W(100, 6)], before(130, 100, [{ w: 100, r: 5 }]), "load").map((m) => m.type)).toEqual(["reps_at_load"]);
    expect(detectMarks([W(95, 8)], before(110, 100, [{ w: 100, r: 5 }]), "load").map((m) => m.type)).toEqual(["e1rm", "reps_at_load"]); // 8 con 95 > lo mejor conocido con ≥ 95
    expect(detectMarks([W(90, 6)], before(110, 100, [{ w: 90, r: 8 }]), "load")).toEqual([]);
    expect(detectMarks([W(105, 3)], null, "load")).toEqual([]);
    expect(detectMarks([W(null, 15)], { ...before(null, null), bestReps: 12 }, "reps")[0]).toMatchObject({ type: "reps", value: 15 });
    expect(detectMarks([{ w: null, r: 75, timed: true }], { ...before(null, null), bestSec: 60 }, "time")[0]).toMatchObject({ type: "time", value: 75 });
  });
  it("caso 10 · series anuladas, aproximaciones y etapas no cuentan ni hacen récord", () => {
    const sets = [W(140, 5, { voided: true }), W(60, 10, { kind: "warmup" }), W(100, 5), W(80, 8, { kind: "drop", stage: 1 })];
    expect(detectMarks(sets, before(120, 110), "load")).toEqual([]);
    const r = sessionReview({ at: NOW, exercises: [{ exercise: EX.pb, plannedMain: 1, sets, before: before(120, 110) }] });
    expect(r).toMatchObject({ done: 1, planned: 1, marks: [] });
  });
  it("caso 11 · ejercicio sustituido: aparece como adaptación y se nombra el reemplazo", () => {
    const r = sessionReview({ at: NOW, exercises: [{ exercise: EX.jp, substitutedBy: EX.jpu, plannedMain: 3, sets: [W(30, 10), W(30, 10), W(30, 10)] }] });
    expect(r.adaptations).toEqual(["reemplazaste Jalón al pecho por Jalón unilateral en polea"]);
    expect(r.text).toMatch(/Hoy reemplazaste Jalón al pecho por Jalón unilateral en polea\./);
    expect(r.exercises[0]).toMatchObject({ name: "Jalón unilateral en polea", comparison: "first" });
  });
  it("no siempre propone subir: con fatiga, mantener; con propuesta de revisión, la del profe primero", () => {
    const hard = sessionReview({ at: NOW, exercises: [{ exercise: EX.pb, plannedMain: 3, sets: [W(60, 8, { rir: 0 }), W(60, 7, { rir: 0, feel: "limite" }), W(60, 6, { feel: "dificil" })] }] });
    expect(hard.fatigue).toBe(true);
    expect(hard.next).toMatchObject({ kind: "hold" });
    expect(hard.text).not.toMatch(/sub(í|i)/);
    const props = sessionReview({ at: NOW, exercises: [
      { exercise: EX.pb, plannedMain: 1, sets: [W(60, 10)], proposal: { kind: "load", text: "Probá 62,5 kg.", weightKg: 62.5, reps: 8, requiresCoach: false, basis: "" } },
      { exercise: EX.sq, plannedMain: 1, sets: [W(80, 8)], proposal: { kind: "review", text: "Revisá el rango con tu entrenador.", weightKg: null, reps: null, requiresCoach: true, basis: "" } },
    ] });
    expect(props.next).toMatchObject({ kind: "review", requiresCoach: true, text: "Para Sentadilla: revisá el rango con tu entrenador. Lo decide tu profe." });
    const calm = sessionReview({ at: NOW, exercises: [{ exercise: EX.pb, plannedMain: 1, sets: [W(60, 10)] }] });
    expect(calm.next.text).toBe("La próxima, mantené la programación y buscá repetir o mejorar lo de hoy.");
  });
  it("comparación con la anterior: misma carga por repeticiones; otra carga por 1RM estimado; sin carga y por tiempo", () => {
    expect(compareWithPrevious([W(60, 10), W(60, 10)], [W(60, 9), W(60, 9)], "load")).toEqual({ comparison: "more", delta: "hiciste dos repeticiones más que la sesión anterior con 60 kg" });
    expect(compareWithPrevious([W(62.5, 7)], [W(60, 10)], "load")).toMatchObject({ comparison: "fewer", delta: "subiste de 60 kg a 62,5 kg" });
    expect(compareWithPrevious([W(62.5, 8)], [W(60, 10)], "load").comparison).toBe("same"); // dentro del 1 % del 1RM estimado
    expect(compareWithPrevious([W(62.5, 10)], [W(60, 10)], "load").comparison).toBe("more");
    expect(compareWithPrevious([W(null, 12)], [W(null, 12)], "reps").comparison).toBe("same");
    expect(compareWithPrevious([{ w: null, r: 50, timed: true }], [{ w: null, r: 40, timed: true }], "time")).toMatchObject({ comparison: "more" });
    expect(compareWithPrevious([], [W(60, 10)], "load").comparison).toBe("not_comparable");
  });
  it("omitidos y tono breve", () => {
    const r = sessionReview({ at: NOW, tone: "breve", exercises: [{ exercise: EX.pb, plannedMain: 3, sets: [W(60, 10), W(60, 10), W(60, 10)] }, { exercise: EX.sq, plannedMain: 3, sets: [], skipped: true }, { exercise: EX.rm, plannedMain: 3, sets: [W(50, 10), W(50, 10), W(50, 10)] }] });
    expect(r.skipped).toEqual(["Sentadilla"]);
    expect(r.text).toBe("Hoy completaste 6 de las 9 series previstas. ¿Querés que lo tengamos en cuenta para tu próxima sesión?");
  });
});

describe("session · poco tiempo (caso 14)", () => {
  const E = (ex: typeof EX.pb, sets: number, setsDone = 0, extra: Partial<ShortenExercise> = {}): ShortenExercise => ({ exercise: ex, sets, reps: "8-10", restSec: 90, setsDone, ...extra });
  const plan = { exercises: [E(EX.pb, 4, 2), E(EX.sq, 4), E(EX.rm, 3), E(EX.pi, 3), E(EX.curl, 3)] };
  it("estima el tiempo por serie con trabajo y descanso", () => {
    expect(remainingSeconds(E(EX.pb, 3))).toBe(60 + 3 * (10 * 3 + 10 + 90));
    expect(remainingSeconds(E(EX.pb, 3, 3))).toBe(0);
    expect(remainingSeconds({ ...E(EX.pb, 3), detail: { ...emptyDetail(), technique: "emom", emomSec: 60 } })).toBe(60 + 3 * 60);
  });
  it("con 25 minutos conserva lo empezado y lo primero; nunca omite lo registrado; vale sólo por hoy", () => {
    const r = shortenSession(plan, 25);
    expect(r.keep.map((x) => x.id)).toEqual([EX.pb.id, EX.sq.id, EX.rm.id]);
    expect(r.skip.map((x) => x.id)).toEqual([EX.pi.id, EX.curl.id]);
    expect(r.fits).toBe(true);
    expect(r.note).toBe("Con 25 minutos conservamos Press banca, Sentadilla y Remo en máquina y dejamos Press inclinado con mancuernas y Curl femoral para otro día. Vale sólo por hoy: tu rutina no cambia.");
  });
  it("lo esencial del profe va antes que el orden; una superserie no se parte", () => {
    const r = shortenSession({ exercises: [E(EX.sq, 4), E(EX.rm, 3, 0, { detail: { ...emptyDetail(), group: "A", groupKind: "superset" } }), E(EX.pi, 3, 0, { detail: { ...emptyDetail(), group: "A", groupKind: "superset" } }), E(EX.curl, 3, 0, { essential: true })] }, 15);
    expect(r.keep.map((x) => x.id)).toContain(EX.curl.id);
    const a = r.keep.some((x) => x.id === EX.rm.id), b = r.keep.some((x) => x.id === EX.pi.id);
    expect(a).toBe(b);
  });
  it("si alcanza, no omite nada; si no alcanza ni uno, conserva el prioritario y lo avisa; minutos inválidos se piden de nuevo", () => {
    expect(shortenSession(plan, 120)).toMatchObject({ skip: [], fits: true, note: expect.stringMatching(/^Te alcanza el tiempo/) });
    const tiny = shortenSession({ exercises: [E(EX.sq, 5), E(EX.rm, 3)] }, 5);
    expect(tiny.keep.map((x) => x.id)).toEqual([EX.sq.id]);
    expect(tiny.fits).toBe(false);
    expect(shortenSession(plan, 0)).toMatchObject({ skip: [], fits: false, note: expect.stringMatching(/No entendí cuántos minutos/) });
    expect(shortenSession(plan, Number.NaN).skip).toEqual([]);
    // Revisión AC3 (hallazgo 13): el mismo rango que la acción apply_short_session (5–180), para no proponer algo inaplicable.
    expect(shortenSession(plan, 3)).toMatchObject({ skip: [], fits: false, note: expect.stringMatching(/entre 5 y 180/) });
    expect(shortenSession(plan, 200).note).toMatch(/entre 5 y 180/);
  });
  it("con uno a medias y muy poco tiempo, deja para otro día todos los que no empezaste (D210)", () => {
    const r = shortenSession(plan, 5);
    expect(r.keep.map((x) => x.id)).toEqual([EX.pb.id]);
    expect(r.skip.map((x) => x.id)).toEqual([EX.sq.id, EX.rm.id, EX.pi.id, EX.curl.id]);
    expect(r.fits).toBe(false);
  });
});

describe("session · reemplazos (casos 11–13)", () => {
  const cur = { exerciseId: EX.jp.id, name: EX.jp.name, muscleGroup: "espalda", kind: "load_reps", pattern: "tracción vertical", equipment: "polea alta" };
  const opts = [
    { exerciseId: "x-row", name: "Remo con mancuerna", muscleGroup: "espalda", kind: "load_reps", pattern: "tracción horizontal", equipment: "mancuernas" },
    { exerciseId: "x-dom", name: "Dominadas asistidas", muscleGroup: "espalda", kind: "load_reps", pattern: "tracción vertical", equipment: "máquina asistida", hasHistory: true },
    { exerciseId: EX.jpu.id, name: EX.jpu.name, muscleGroup: "espalda", kind: "load_reps", pattern: "tracción vertical", equipment: "polea alta", approvedByCoach: true, approvedNote: "si está ocupada" },
    { exerciseId: "x-curl", name: "Curl de bíceps", muscleGroup: "bíceps", kind: "load_reps", pattern: "flexión de codo", equipment: "mancuernas" },
    { exerciseId: "x-plank", name: "Plancha", muscleGroup: "espalda", kind: "time", pattern: null, equipment: null },
    { exerciseId: "x-pull", name: "Pullover en polea", muscleGroup: "espalda", kind: "load_reps", pattern: null, equipment: "polea alta" },
  ];
  it("caso 12 · máquina ocupada: primero lo aprobado por el profe; máximo dos; nunca inventa", () => {
    const r = rankAlternatives(cur, opts, { reason: "other" });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ exerciseId: EX.jpu.id, approvedByCoach: true, why: "Tu entrenador lo aprobó como alternativa: si está ocupada Mismo patrón de movimiento." });
    expect(r[1]).toMatchObject({ exerciseId: "x-dom", approvedByCoach: false });
    expect(r.every((x) => opts.some((o) => o.exerciseId === x.exerciseId))).toBe(true);
  });
  it("con la polea ocupada, descarta lo que usa el mismo equipo; sin músculo ni patrón compartido, no ofrece", () => {
    const r = rankAlternatives(cur, opts.filter((o) => !o.approvedByCoach), { reason: "busy" });
    expect(r.map((x) => x.exerciseId)).toEqual(["x-dom", "x-row"]);
    expect(r.some((x) => x.exerciseId === "x-curl" || x.exerciseId === "x-plank" || x.exerciseId === "x-pull")).toBe(false);
  });
  it("caso 13 · falta de equipamiento y preferencias: evita lo que no hay, lo que no le gusta y lo restringido", () => {
    expect(rankAlternatives(cur, opts, { unavailableEquipment: ["Máquina asistida"], reason: "other" }).map((x) => x.exerciseId)).toEqual([EX.jpu.id, "x-row"]);
    expect(rankAlternatives(cur, opts, { avoids: ["dominadas"], restrictions: [EX.jpu.id] }).map((x) => x.exerciseId)).toEqual(["x-row", "x-pull"]);
    expect(rankAlternatives(cur, opts, { exclude: ["x-dom", EX.jpu.id, "x-row", "x-pull"] })).toEqual([]); // nada compatible: no inventa
  });
  it("con molestia, no sugiere el mismo movimiento (salvo que el profe lo haya aprobado)", () => {
    expect(rankAlternatives(cur, opts, { reason: "discomfort" }).map((x) => x.exerciseId)).toEqual([EX.jpu.id, "x-row"]);
  });
});

// Revisión AC3 (07/11/2026): hallazgos 5, 6 y 11 y conocido K1.
describe("session · revisión: comparar sólo lo comparable y proponer lo prudente", () => {
  const W = (w: number | null, r: number, extra: Partial<ReviewExercise["sets"][number]> = {}) => ({ w, r, kind: "work" as const, stage: 0, ...extra });
  it("un ejercicio a medias no es «por debajo de la anterior»: queda sin terminar (K1)", () => {
    const r = sessionReview({ at: NOW, exercises: [{ exercise: EX.rm, plannedMain: 3, sets: [W(60, 10)], previous: { at: daysAgo(4), sets: [W(60, 10), W(60, 10), W(60, 10)] } }] });
    expect(r.exercises[0]).toMatchObject({ status: "partial", comparison: "not_comparable", delta: null });
    expect(r.text).not.toMatch(/menos que la sesión anterior/);
  });
  it("una sesión completa contra una anterior a medias compara las mismas series (hallazgo 5)", () => {
    expect(compareWithPrevious([W(50, 10), W(50, 10), W(50, 10)], [W(50, 8)], "load")).toEqual({ comparison: "more", delta: "hiciste dos repeticiones más que la sesión anterior con 50 kg" });
    expect(compareWithPrevious([W(60, 10)], [W(60, 10), W(60, 10), W(60, 10)], "load")).toMatchObject({ comparison: "same" });
  });
  it("la próxima: mantener o sumar repeticiones antes que subir carga, sin subir si quedó trabajo sin hacer, y con el ejercicio nombrado (hallazgo 6)", () => {
    const load = { kind: "load" as const, text: "Completaste el rango en todas las series. En la próxima podrías probar 62,5 kg.", weightKg: 62.5, reps: 8, requiresCoach: false, basis: "" };
    const hold = { kind: "hold" as const, text: "Mantené 80 kg y buscá 8 en todas las series.", weightKg: 80, reps: 8, requiresCoach: false, basis: "" };
    const both = sessionReview({ at: NOW, exercises: [
      { exercise: EX.pb, plannedMain: 1, sets: [W(60, 10)], proposal: load },
      { exercise: EX.sq, plannedMain: 1, sets: [W(80, 8)], proposal: hold },
    ] });
    expect(both.next).toMatchObject({ kind: "hold", text: "Para Sentadilla: mantené 80 kg y buscá 8 en todas las series." });
    const partial = sessionReview({ at: NOW, exercises: [
      { exercise: EX.pb, plannedMain: 1, sets: [W(60, 10)], proposal: load },
      { exercise: EX.rm, plannedMain: 3, sets: [W(50, 10)] },
    ] });
    expect(partial.next.kind).not.toBe("load");
    expect(partial.text).not.toMatch(/62,5 kg/);
    const only = sessionReview({ at: NOW, exercises: [{ exercise: EX.pb, plannedMain: 1, sets: [W(60, 10)], proposal: load }] });
    expect(only.next.text).toMatch(/^Para Press/);
  });
  it("una pirámide se describe serie por serie, no como «3 series de 12» (hallazgo 11)", () => {
    const b = briefExercise({ exercise: EX.pb, prescribed: { sets: 3, reps: "12", rir: null, restSec: 90, loadKg: null, coachLoad: false, method: "pyramid", scheme: ["12", "10", "8"] },
      last: { at: daysAgo(4), sets: [{ w: 50, r: 12, rir: null }, { w: 55, r: 10, rir: null }, { w: 60, r: 8, rir: null }] }, recommendation: null, restrictions: [], missing: [] });
    expect(b.text).toMatch(/Hoy tenés indicadas 3 series: 12, 10 y 8 repeticiones\./);
    expect(b.text).not.toMatch(/3 series de 12/);
  });
});
