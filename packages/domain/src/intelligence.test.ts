import { describe, expect, it } from "vitest";
import { adjustAfterSet, compareRows, comparableHistory, decisionFor, exerciseRows, exerciseTrend, fitIncrement, nextProposal, progressToGoal, recommendExercise, rowContext, sessionPoints, topEvent, TI_VERSION, type ExCtx, type HistRow } from "./intelligence";
import { kgTo, toKg } from "./units";
import { applyMethod } from "./stages";
import { emptyDetail, loadIncrement, validateDetail, type ExerciseDetail, type SetSpec } from "./prescription";

const NOW = new Date("2026-11-04T15:00:00Z");
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const straight = (sets: number, reps: string, rir: number | null = null): ExCtx => ({ sets, reps, rir, restSec: 120, detail: null });
const withPlan = (plan: SetSpec[], extra: Partial<ExerciseDetail> = {}): ExCtx => ({ sets: plan.length, reps: plan[0].reps, rir: null, restSec: 120, detail: { ...emptyDetail(), technique: "custom", setPlan: plan, ...extra } });
let sid = 0;
/** Una sesión de hace `ago` días con filas (tipo/etapa/specId opcionales). */
function sess(ago: number, rows: Partial<HistRow>[], src: "repi" | "import" = "repi"): HistRow[] {
  const id = `s${++sid}`;
  return rows.map((r, i) => ({ sessionId: id, at: day(ago), setLogId: `${id}-${i}`, specId: `r${i}`, kind: "work", stage: 0, reps: "8-10", w: 60, r: 10, rir: 2, feel: null, source: src, ...r }));
}
const rec = (ex: ExCtx, history: HistRow[], o: Partial<Parameters<typeof recommendExercise>[0]> = {}) => recommendExercise({ ex, history, now: NOW, ...o });

describe("A · historia y comparabilidad", () => {
  it("sin historial: no inventa números y lo dice", () => {
    const [t] = rec(straight(3, "8-10"), []);
    expect(t).toMatchObject({ status: "no_data", weightKg: null, action: "none", algo: TI_VERSION });
    expect(t.why).toMatch(/Todavía no tenemos una referencia comparable/);
  });
  it("una sesión con el rango completo: sube el incremento chico; los motivos citan la última vez", () => {
    const ts = rec(straight(3, "8-10"), sess(3, [{}, {}, {}]));
    expect(ts.map((t) => t.weightKg)).toEqual([62.5, 62.5, 62.5]);
    expect(ts[0]).toMatchObject({ action: "increase_load", status: "ready", text: "62,5 kg × 8–10", prev: { w: 60, r: 10, rir: 2 } });
    expect(ts[0].refs).toHaveLength(3);
  });
  it("varias sesiones: decide con la última comparable (las anteriores no dominan)", () => {
    const h = [...sess(30, [{ w: 80, r: 10 }, { w: 80, r: 10 }, { w: 80, r: 10 }]), ...sess(2, [{ w: 60, r: 8 }, { w: 60, r: 8 }, { w: 60, r: 8 }])];
    expect(rec(straight(3, "8-10"), h)[0]).toMatchObject({ action: "increase_reps", weightKg: 60, repsTarget: 9 });
  });
  it("historial largo: la ventana limita a 6 sesiones y 180 días", () => {
    const h = Array.from({ length: 12 }, (_, i) => sess(5 + i * 20, [{}])).flat();
    const c = rowContext(straight(1, "8-10"), 0);
    const { sessions } = comparableHistory(c, h, NOW);
    expect(sessions.length).toBeLessThanOrEqual(6);
    expect(sessions.every((s) => (NOW.getTime() - Date.parse(s.at)) / 86_400_000 <= 180)).toBe(true);
  });
  it("calentamiento ≠ top set; drop ≠ principal; tiempo ≠ reps; unilateral ≠ bilateral", () => {
    const ex = withPlan([S("top", "3-5"), S("drop", "al fallo", { block: 0, stage: 1 })]);
    const [top, drop] = exerciseRows(ex);
    expect(compareRows(top, sess(1, [{ kind: "warmup" }])[0]).level).toBe("none");
    expect(compareRows(drop, sess(1, [{ kind: "work", stage: 0 }])[0]).level).toBe("none");
    expect(compareRows(drop, sess(1, [{ kind: "drop", stage: 2 }])[0]).level).toBe("none"); // Drop 1 ≠ Drop 2
    expect(compareRows(drop, sess(1, [{ kind: "drop", stage: 1, specId: "zz" }])[0]).level).toBe("equivalent");
    const timed = rowContext(straight(1, "40 s"), 0);
    expect(compareRows(timed, sess(1, [{ reps: "10" }])[0]).level).toBe("none");
    const uni: ExCtx = { ...straight(1, "10"), detail: { ...emptyDetail(), unilateral: true } };
    expect(compareRows(rowContext(uni, 0), sess(1, [{}])[0]).level).toBe("none");
  });
  it("series reordenadas o versión nueva: la identidad estable manda sobre la posición", () => {
    const plan = [S("work", "8-10", { id: "sAAA" }), S("work", "8-10", { id: "sBBB" })];
    const ex = withPlan(plan);
    // En la versión anterior sBBB era la primera fila (índice 0) e hizo 70 kg; sAAA, la segunda con 60 kg.
    const h = sess(2, [{ specId: "sBBB", w: 70, r: 9 }, { specId: "sAAA", w: 60, r: 9 }]);
    const ts = rec(ex, h);
    expect(ts[0].prev).toMatchObject({ w: 60, level: "exact" });
    expect(ts[1].prev).toMatchObject({ w: 70, level: "exact" });
  });
  it("historial importado: referencia general de calidad baja y no vale como etapa", () => {
    const imp = sess(40, [{ kind: null, stage: null, specId: null, w: 50, r: 10, rir: null }], "import");
    const [t] = rec(straight(3, "8-10"), imp);
    expect(t.quality).toBe("low");
    expect(t.prev?.source).toBe("import");
    const drop = exerciseRows(withPlan([S("work", "10"), S("drop", "al fallo", { block: 0, stage: 1 })]))[1];
    expect(compareRows(drop, imp[0]).level).toBe("none");
    expect(comparableHistory(rowContext(straight(1, "10"), 0), sess(400, [{}], "import"), NOW).sessions).toHaveLength(0);
  });
  it("registros incompletos (sin reps) no cuentan", () => {
    expect(rec(straight(1, "8-10"), sess(2, [{ r: null }]))[0].status).toBe("no_data");
  });
});

describe("B · progresión", () => {
  it("aumento de repeticiones dentro del rango sin tocar la carga", () => {
    expect(rec(straight(3, "8-10"), sess(2, [{ r: 9 }, { r: 9 }, { r: 8 }]))[0]).toMatchObject({ action: "increase_reps", weightKg: 60, repsTarget: 9 });
  });
  it("no sube kilos por hacer más reps si todavía no completó el rango", () => {
    const t = rec(straight(3, "8-10"), sess(2, [{ r: 10 }, { r: 9 }, { r: 8 }]))[0];
    expect(t.weightKg).toBe(60);
    expect(t.action).not.toBe("increase_load");
  });
  it("lejos del piso: reduce la carga", () => {
    expect(rec(straight(3, "8-10"), sess(2, [{ r: 5 }, { r: 5 }, { r: 4 }]))[0]).toMatchObject({ action: "reduce_load", weightKg: 55 });
  });
  it("saltos del equipo: con saltos de 5 kg nunca propone 52,5", () => {
    const t = rec(straight(3, "8-10"), sess(2, [{ w: 50 }, { w: 50 }, { w: 50 }]), { increment: 5 })[0];
    expect(t.weightKg).toBe(55);
    expect(fitIncrement(52.5, 5)).toBe(50);
    expect(rec(straight(3, "8-10"), sess(2, [{ w: 50, r: 5 }, { w: 50, r: 5 }, { w: 50, r: 5 }]), { increment: 5 })[0].weightKg! % 5).toBe(0);
  });
  it("D191 · equipo configurado: mancuernas de 2 en 2, barra con 1,25 por lado, máquina de 5; sin configurar es una referencia", () => {
    const full = sess(2, [{ w: 22 }, { w: 22 }, { w: 22 }]);
    const db = (load: ExerciseDetail["load"]) => ({ ...emptyDetail(), load });
    // Mancuernas: 22 → 24 (no 24,5 ni 23).
    expect(rec(straight(3, "8-10"), full, { increment: loadIncrement(db({ equipment: "dumbbell", incrementKg: 2 })) })[0]).toMatchObject({ weightKg: 24, action: "increase_load" });
    // Barra: 1,25 por lado = 2,5 total.
    expect(loadIncrement(db({ equipment: "barbell", incrementKg: 1.25, perSide: true }))).toBe(2.5);
    expect(rec(straight(3, "8-10"), sess(2, [{ w: 61.25 }, { w: 61.25 }, { w: 61.25 }]), { increment: 2.5 })[0].weightKg).toBe(63.75);
    // Máquina de placas de 5: bajar desde 47,5 queda en un múltiplo de 5.
    expect(rec(straight(3, "8-10"), sess(2, [{ w: 47.5, r: 5 }, { w: 47.5, r: 5 }, { w: 47.5, r: 4 }]), { increment: 5 })[0].weightKg! % 5).toBe(0);
    // Sin configurar: misma regla conservadora de siempre, marcada como referencia a ajustar.
    const u = rec(straight(3, "8-10"), full)[0];
    expect(u.reasons).toContain("increment_unknown");
    expect(rec(straight(3, "8-10"), full, { increment: 2 })[0].reasons).toContain("increment_fit");
    // Mantener la carga de la última vez no es una carga nueva: no hay nada que ajustar.
    expect(rec(straight(3, "8-10"), sess(2, [{ r: 9 }, { r: 9 }, { r: 9 }]))[0].reasons).not.toContain("increment_unknown");
    // Drop sin historia propia: −20 % ajustado al salto de las mancuernas.
    const drop = withPlan([S("work", "8-10"), { ...S("drop", "al fallo"), block: 0, stage: 1 }]);
    const dt = rec(drop, sess(2, [{ w: 24, specId: "x" }]), { increment: 2 });
    expect(dt[1].weightKg! % 2).toBe(0);
  });
  it("D191 · validateDetail conserva el equipo y rechaza saltos fuera de rango", () => {
    const ok = validateDetail({ ...emptyDetail(), load: { equipment: "barbell", incrementKg: 1.25, perSide: true } }, 3);
    expect(ok.ok && ok.detail?.load).toEqual({ equipment: "barbell", incrementKg: 1.25, perSide: true });
    const ds = validateDetail({ ...emptyDetail(), load: { equipment: "dumbbell", incrementKg: 2, perSide: true } }, 3);
    expect(ds.ok && ds.detail?.load).toEqual({ equipment: "dumbbell", incrementKg: 2 }); // mancuernas: no hay «por lado»
    expect(validateDetail({ ...emptyDetail(), load: { equipment: "machine", incrementKg: 40 } }, 3).ok).toBe(false);
    expect(validateDetail({ ...emptyDetail(), load: { equipment: "machine", incrementKg: null as unknown as number } }, 3).ok).toBe(false);
  });
  it("peso corporal: progresa en repeticiones", () => {
    expect(rec(straight(3, "8-12"), sess(2, [{ w: null, r: 9 }, { w: null, r: 9 }, { w: null, r: 9 }]))[0]).toMatchObject({ weightKg: null, action: "increase_reps", repsTarget: 10 });
  });
  it("RIR 4 con el rango completo puede progresar; RIR 0 no", () => {
    expect(rec(straight(3, "10"), sess(2, [{ r: 10, rir: 4 }, { r: 10, rir: 4 }, { r: 10, rir: 4 }]))[0].action).toBe("increase_load");
    expect(rec(straight(3, "10"), sess(2, [{ r: 10, rir: 0 }, { r: 10, rir: 0 }, { r: 10, rir: 0 }]))[0]).toMatchObject({ action: "hold", status: "limited", guards: ["max_effort"] });
  });
  it("carga del profe: manda el plan; una diferencia material queda como revisión, sin cambiar la carga", () => {
    const ex = withPlan([S("work", "8", { weightKg: 80 }), S("work", "8", { weightKg: 80 })]);
    const t = rec(ex, sess(2, [{ w: 70, r: 5, reps: "8" }, { w: 70, r: 5, reps: "8" }]))[0];
    expect(t).toMatchObject({ status: "coach", source: "coach", weightKg: 80, action: "follow_coach" });
    expect(t.review).toMatch(/revisar el objetivo con tu profe/);
  });
});

describe("C · seguridad (D182 se conserva)", () => {
  const full = () => sess(2, [{}, {}, {}]);
  it("molestia en el ejercicio: baja la carga y lo explica", () => {
    expect(rec(straight(3, "8-10"), full(), { signals: { painExercise: true } })[0]).toMatchObject({ action: "reduce_load", weightKg: 52.5, status: "limited", guards: ["pain_exercise"] });
  });
  it("lesión activa, energía baja: no sube", () => {
    for (const s of [{ painOrInjury: true }, { lowReadiness: true }]) expect(rec(straight(3, "8-10"), full(), { signals: s })[0]).toMatchObject({ action: "hold", weightKg: 60, status: "limited" });
  });
  it("«al límite» la última vez: no sube", () => {
    expect(rec(straight(3, "8-10"), sess(2, [{ feel: "limite" }, { feel: "limite" }, { feel: "limite" }]))[0].action).toBe("hold");
  });
  it("pausa prolongada: mantiene (14 días) o retoma con menos (28)", () => {
    expect(rec(straight(3, "8-10"), sess(20, [{}, {}, {}]))[0]).toMatchObject({ action: "hold", guards: ["inactive_hold"] });
    expect(rec(straight(3, "8-10"), sess(40, [{}, {}, {}]))[0]).toMatchObject({ action: "reduce_load", guards: ["inactive_reduce"] });
  });
  it("caso 1 · cambio de rango 100 × 5 → 10-12: estimación prudente (75), no 90", () => {
    const t = rec(straight(3, "10-12"), sess(2, [{ w: 100, r: 5, reps: "5" }, { w: 100, r: 5, reps: "5" }, { w: 100, r: 5, reps: "5" }]))[0];
    expect(t).toMatchObject({ action: "estimate", weightKg: 75, guards: ["range_change"] });
  });
  it("carga del profe con molestia: la carga no cambia pero la advertencia no se oculta", () => {
    const ex = withPlan([S("work", "8", { weightKg: 80 })]);
    const t = rec(ex, sess(2, [{ w: 80, r: 8, reps: "8" }]), { signals: { painExercise: true } })[0];
    expect(t).toMatchObject({ weightKg: 80, status: "coach", action: "reduce_effort" });
    expect(t.review).toMatch(/molestia/);
  });
});

describe("D · métodos por etapa", () => {
  it("caso 2 · drop set: no copia la carga de la principal; con historia propia usa la suya", () => {
    const ex = withPlan([S("work", "10", { weightKg: 80 }), S("drop", "al fallo", { block: 0, stage: 1 }), S("drop", "al fallo", { block: 0, stage: 2 })]);
    const none = rec(ex, []);
    expect(none[1]).toMatchObject({ pending: true, weightKg: 62.5, action: "reference" }); // −20 % de 80, para confirmar
    expect(none[1].weightKg).not.toBe(80);
    const h = sess(3, [{ w: 80, r: 10, reps: "10" }, { kind: "drop", stage: 1, specId: "x1", w: 50, r: 8 }, { kind: "drop", stage: 2, specId: "x2", w: 40, r: 10 }]);
    const ts = rec(ex, h);
    expect(ts[1]).toMatchObject({ weightKg: 50, repsTarget: 8, pending: true, action: "hold" });
    expect(ts[2]).toMatchObject({ weightKg: 40, repsTarget: 10 });
    expect(ts[1].why).toMatch(/aparte de la serie principal/);
  });
  it("top set y back-off: cada uno con su historia; el back-off nunca iguala al top", () => {
    const ex = withPlan([S("top", "3-5"), S("backoff", "8"), S("backoff", "8")]);
    const h = sess(3, [{ kind: "top", reps: "3-5", w: 100, r: 5 }, { kind: "backoff", reps: "8", w: 85, r: 8 }, { kind: "backoff", reps: "8", w: 85, r: 8 }]);
    const [top, b1] = rec(ex, h);
    expect(top).toMatchObject({ action: "increase_load", weightKg: 105 });
    expect(b1.weightKg).toBe(85);
    expect(b1.weightKg!).toBeLessThan(top.weightKg!);
    // Back-off que la última vez quedó igual al top: se acota por debajo.
    const eq = rec(withPlan([S("top", "5", { weightKg: 80 }), S("backoff", "8")]), sess(3, [{ kind: "top", reps: "5", w: 80, r: 5 }, { kind: "backoff", reps: "8", w: 80, r: 8 }]));
    expect(eq[1].weightKg).toBe(77.5);
  });
  it("rest-pause y myo-reps: misma carga que la principal, reps propias, sin subir la mini serie", () => {
    const base = withPlan([S("work", "8-10")]);
    const ex = { ...base, ...(() => { const r = applyMethod(base.detail, { sets: 1, reps: "8-10", rir: null }, "rest_pause", [0]); return { sets: r.detail.setPlan!.length, detail: r.detail }; })() };
    const h = sess(2, [{ w: 60, r: 10, reps: "8-10" }, { kind: "rest_pause", stage: 1, w: 60, r: 4 }, { kind: "rest_pause", stage: 2, w: 60, r: 3 }]);
    const ts = rec(ex, h);
    expect(ts[0].weightKg).toBe(62.5);
    expect(ts[1]).toMatchObject({ weightKg: 62.5, repsTarget: 4, action: "hold" });
    expect(ts[2].repsTarget).toBe(3);
  });
  it("cluster: respeta la distribución y la carga del bloque", () => {
    const base = withPlan([S("work", "9", { weightKg: 70 })]);
    const r = applyMethod(base.detail, { sets: 1, reps: "9", rir: null }, "cluster", [0], { stages: 3 });
    const ts = rec({ ...base, sets: r.detail.setPlan!.length, detail: r.detail }, []);
    expect(ts.map((t) => t.weightKg)).toEqual([70, 70, 70]);
  });
  it("AMRAP por repeticiones vs por tiempo: nunca kilos desde segundos ni rondas", () => {
    const amrap = rec(withPlan([S("amrap", "AMRAP")]), sess(2, [{ kind: "amrap", reps: "AMRAP", w: 50, r: 14 }]))[0];
    expect(amrap).toMatchObject({ action: "hold", weightKg: 50, repsTarget: 14 });
    const timed = rec(withPlan([S("amrap", "AMRAP 10 min", { durationSec: 600, countUnit: "rounds" })]), sess(2, [{ kind: "amrap", reps: "AMRAP 10 min", durationSec: 600, w: null, r: 7 }]))[0];
    expect(timed).toMatchObject({ action: "reference", repsTarget: 7, weightKg: null });
    const secs = rec(straight(3, "40 s"), sess(2, [{ reps: "40 s", w: 20, r: 40 }]))[0];
    expect(secs.action).toBe("reference");
    expect(secs.why).toMatch(/no se calculan kilos/);
  });
  it("EMOM: el descanso es el intervalo; ajustar en la sesión nunca propone más descanso", () => {
    const ex: ExCtx = { ...straight(3, "5"), detail: { ...emptyDetail(), technique: "emom", emomSec: 60 } };
    const ts = rec(ex, sess(2, [{ reps: "5", r: 5 }, { reps: "5", r: 5 }, { reps: "5", r: 5 }]));
    const a = adjustAfterSet({ ex, targets: ts, done: [{ index: 0, w: 62.5, r: 3, rir: 0, feel: null }], justDone: 0 });
    expect(a.event?.restPlusSec).toBeNull();
  });
  it("aproximación: sin objetivo de progresión", () => {
    expect(rec(withPlan([S("warmup", "8"), S("work", "8")]), sess(2, [{ kind: "warmup", w: 40 }, { w: 60, r: 8, reps: "8" }]))[0].status).toBe("not_applicable");
  });
});

describe("Durante la sesión", () => {
  const ex = straight(3, "8-10", 2);
  const ts = rec(ex, sess(2, [{}, {}, {}])); // 62,5 × 8–10
  it("caso 3 · RIR 0 en la primera: la siguiente no sube, mantiene; sugiere más descanso como propuesta", () => {
    const a = adjustAfterSet({ ex, targets: ts, done: [{ index: 0, w: 62.5, r: 9, rir: 0, feel: null }], justDone: 0 });
    expect(a.event).toMatchObject({ code: "harder", priority: 3, restPlusSec: 30 });
    expect(a.targets[1].weightKg).toBe(62.5);
    expect(a.targets[1].action).toBe("hold");
  });
  it("62,5 × 7 con RIR 0 (lejos del rango): baja un paso en las siguientes, nunca reescribe la hecha", () => {
    const a = adjustAfterSet({ ex, targets: ts, done: [{ index: 0, w: 62.5, r: 5, rir: 0, feel: null }], justDone: 0 });
    expect(a.event?.code).toBe("short");
    expect(a.targets[1].weightKg).toBe(60);
    expect(a.targets[0]).toBe(ts[0]);
    expect(a.changed).toEqual([1, 2]);
  });
  it("una serie fácil no sube la carga a mitad de la sesión", () => {
    const a = adjustAfterSet({ ex, targets: ts, done: [{ index: 0, w: 62.5, r: 10, rir: 5, feel: "facil" }], justDone: 0 });
    expect(a.event?.code).toBe("easier");
    expect(a.targets[1].weightKg).toBe(62.5);
    expect(a.changed).toEqual([]);
  });
  it("caso 4 · molestia: un solo aviso de seguridad y nada sube", () => {
    const a = adjustAfterSet({ ex, targets: ts, done: [{ index: 0, w: 62.5, r: 9, rir: 2, feel: "molestia" }], justDone: 0 });
    expect(a.event).toMatchObject({ code: "pain", priority: 1 });
    expect(a.event!.text).toMatch(/profesional de salud/);
    expect(a.targets.slice(1).every((t) => t.action === "hold" && t.guards.includes("pain_exercise"))).toBe(true);
  });
  it("cargas del profe no se tocan durante la sesión", () => {
    const cx = withPlan([S("work", "8", { weightKg: 80 }), S("work", "8", { weightKg: 80 })]);
    const ct = rec(cx, []);
    const a = adjustAfterSet({ ex: cx, targets: ct, done: [{ index: 0, w: 80, r: 5, rir: 0, feel: null }], justDone: 0 });
    expect(a.targets[1].weightKg).toBe(80);
    expect(a.event?.code).toBe("coach_hold");
  });
  it("sin resultado guardado no inventa nada; prioridades: seguridad primero", () => {
    expect(adjustAfterSet({ ex, targets: ts, done: [], justDone: 0 }).event).toBeNull();
    expect(topEvent([{ code: "easier", priority: 4, text: "", row: 0, restPlusSec: null }, { code: "pain", priority: 1, text: "", row: 1, restPlusSec: null }])?.code).toBe("pain");
  });
  it("aceptada vs modificada", () => {
    expect(decisionFor(ts[0], { w: 62.5, r: 9 })).toBe("accepted");
    expect(decisionFor(ts[0], { w: 60, r: 9 })).toBe("modified");
  });
  it("en lb: cargar lo que se ve (137,8 lb → 62,51 kg) cuenta como lo propuesto; el objetivo guardado sigue en kg", () => {
    const w = toKg(kgTo(ts[0].weightKg!, "lb"), "lb");
    expect(w).toBe(62.51);
    expect(decisionFor(ts[0], { w, r: 9 })).toBe("accepted");
    expect(ts[0].weightKg).toBe(62.5);
    expect(decisionFor(ts[0], { w: toKg(kgTo(ts[0].weightKg!, "lb") - 0.5, "lb"), r: 9 })).toBe("modified");
  });
});

describe("Tendencias y propuestas", () => {
  const c = rowContext(straight(3, "8-10"), 0);
  const series = (xs: [number, number, number?][]) => xs.flatMap(([w, r, rir], i) => sess((xs.length - i) * 4, [{ w, r, rir: rir ?? 2 }, { w, r, rir: rir ?? 2 }, { w, r, rir: rir ?? 2 }]));
  const trendOf = (xs: [number, number, number?][]) => { const p = sessionPoints(c, series(xs), NOW, 3); return { p, t: exerciseTrend(p) }; };
  it("una o dos sesiones: datos insuficientes (nunca un estancamiento)", () => {
    expect(trendOf([[60, 10], [60, 10]]).t).toMatchObject({ kind: "insufficient", confidence: "none" });
  });
  it("progreso consistente y propuesta del incremento más chico", () => {
    const { p, t } = trendOf([[55, 10], [57.5, 10], [60, 10], [62.5, 10]]);
    expect(t).toMatchObject({ kind: "progressing", confidence: "consistent" });
    expect(nextProposal(t, p, { repsMin: 8, repsMax: 10, coachOwned: true })).toMatchObject({ kind: "load", weightKg: 65, requiresCoach: true });
  });
  it("estancamiento sin completar el rango → revisar con el profe (no deload automático)", () => {
    const { p, t } = trendOf([[60, 8], [60, 8], [60, 8], [60, 8], [60, 8]]);
    expect(t).toMatchObject({ kind: "plateau", confidence: "consistent" });
    expect(nextProposal(t, p, { repsMin: 8, repsMax: 10, coachOwned: true })).toMatchObject({ kind: "review", requiresCoach: true });
  });
  it("descenso con esfuerzo alto → posible descarga, como propuesta para revisar", () => {
    const { p, t } = trendOf([[70, 10, 1], [67.5, 9, 0], [65, 9, 0], [62.5, 8, 0]]);
    expect(t.kind).toBe("declining");
    expect(nextProposal(t, p, { repsMin: 8, repsMax: 10, coachOwned: false })).toMatchObject({ kind: "deload", requiresCoach: true });
  });
  it("más esfuerzo con el mismo rendimiento", () => {
    expect(trendOf([[60, 9, 3], [60, 9, 2], [60, 9, 1], [60, 9, 0]]).t.kind).toBe("effort_up");
  });
});

describe("Caso 8 · porcentajes con fórmula", () => {
  it("carga, adherencia y repeticiones; sin datos, «insuficiente»", () => {
    expect(progressToGoal({ metric: "load", baseline: 60, target: 80, current: 70, unit: "kg" })).toMatchObject({ pct: 50, status: "ok", formula: "(70 − 60) ÷ (80 − 60) kg" });
    expect(progressToGoal({ metric: "adherence", baseline: null, target: 12, current: 9, unit: "sesiones", period: "4 semanas" }).pct).toBe(75);
    expect(progressToGoal({ metric: "reps", baseline: null, target: 12, current: 10, unit: "reps" }).pct).toBe(83);
    expect(progressToGoal({ metric: "load", baseline: 60, target: 80, current: null, unit: "kg" })).toMatchObject({ pct: null, status: "insufficient" });
  });
});

describe("AC3 · pirámides: cada fila compara con su par (defecto #1 de la auditoría)", () => {
  // Pirámide 12/10/8 y la última vez 50×12, 55×10, 60×8. Antes, la fila de 12 recibía 55 kg etiquetado «reduce_load»
  // (una suba de 5 kg) porque mezclaba la historia de las tres filas.
  const pyr = (ids?: string[]) => withPlan(["12", "10", "8"].map((r, i) => S("work", r, ids ? { id: ids[i] } : {})), { technique: "pyramid" });
  const pastPyr = (ago: number, ids?: string[]) => sess(ago, [{ w: 50, r: 12, reps: "12" }, { w: 55, r: 10, reps: "10" }, { w: 60, r: 8, reps: "8" }].map((x, i) => ({ ...x, ...(ids ? { specId: ids[i] } : {}) })));
  it("regresión: la fila de 12 no recibe 55 kg «bajar carga»; cada fila progresa sobre su propia marca", () => {
    const ts = rec(pyr(), pastPyr(3));
    expect(ts[0]).toMatchObject({ action: "increase_load", weightKg: 52.5, prev: { w: 50, r: 12 } });
    expect(ts[1]).toMatchObject({ action: "increase_load", weightKg: 57.5, prev: { w: 55, r: 10 } });
    expect(ts[2]).toMatchObject({ action: "increase_load", weightKg: 62.5, prev: { w: 60, r: 8 } });
    expect(ts.every((t) => !t.guards.includes("range_change"))).toBe(true);
    expect(ts[0].refs).toHaveLength(1);
  });
  it("con identidad estable de fila: la misma respuesta por coincidencia exacta", () => {
    const ids = ["sP12", "sP10", "sP08"];
    const ts = rec(pyr(ids), pastPyr(3, ids));
    expect(ts.map((t) => t.weightKg)).toEqual([52.5, 57.5, 62.5]);
    expect(ts.map((t) => t.prev?.level)).toEqual(["exact", "exact", "exact"]);
  });
  it("con el salto del equipo: la suba parte de la carga de esa fila, no de la más pesada de la sesión", () => {
    const ex = { ...pyr(), detail: { ...pyr().detail!, load: { equipment: "barbell" as const, incrementKg: 1.25, perSide: true } } };
    expect(rec(ex, pastPyr(3))[0]).toMatchObject({ action: "increase_load", weightKg: 52.5 });
  });
  it("una fila que no llegó a su rango se sostiene sin tocar las otras", () => {
    const h = sess(3, [{ w: 50, r: 12, reps: "12" }, { w: 55, r: 9, reps: "10" }, { w: 60, r: 8, reps: "8" }]);
    const ts = rec(pyr(), h);
    expect(ts[1]).toMatchObject({ action: "hold", weightKg: 55 });
    expect(ts[0].weightKg).toBe(52.5);
  });
  it("la vez pasada fue pirámide y hoy son series rectas: compara con las filas del mismo rango", () => {
    expect(rec(straight(3, "10"), pastPyr(3))[0]).toMatchObject({ weightKg: 55, prev: { w: 55, r: 10 } });
  });
  it("pirámide nueva con un rango que no estaba: estimación prudente desde la fila más parecida, nunca por encima", () => {
    const ex = withPlan(["15", "12", "10"].map((r) => S("work", r)), { technique: "pyramid" });
    const ts = rec(ex, pastPyr(3));
    expect(ts[0].guards).toContain("range_change");
    expect(ts[0].weightKg!).toBeLessThanOrEqual(50);
    expect(ts[1]).toMatchObject({ weightKg: 52.5, prev: { w: 50, r: 12 } });
    expect(ts[2]).toMatchObject({ weightKg: 57.5, prev: { w: 55, r: 10 } });
  });
  it("series rectas: el comportamiento no cambia (todas las filas, el mismo objetivo)", () => {
    const ts = rec(straight(3, "8-10"), sess(3, [{}, {}, {}]));
    expect(ts.map((t) => [t.action, t.weightKg])).toEqual([["increase_load", 62.5], ["increase_load", 62.5], ["increase_load", 62.5]]);
    expect(ts[0].refs).toHaveLength(3);
  });
});

describe("ejercicios por tiempo · una actividad nunca recibe kilos", () => {
  const cinta = (reps = "10 min"): ExCtx => ({ sets: 1, reps, rir: null, restSec: 0, detail: { ...emptyDetail(), activity: { profile: "treadmill", speedKmh: 5, incline: 3 } } });
  it("con duración: la referencia es la última vez, sin kilos aunque la historia los tenga", () => {
    const [t] = rec(cinta(), sess(3, [{ reps: "10 min", w: 60, r: 720, rir: null }]));
    expect(t).toMatchObject({ status: "ready", action: "reference", weightKg: null, repsTarget: 720, text: "12 min", repsMin: null, repsMax: null, coach: null });
    expect(t.prev).toMatchObject({ w: null, r: 720 });
    expect(t.refs.every((r) => r.w == null)).toBe(true);
    expect(t.why).toMatch(/no se calculan kilos/);
    expect(t.reasons).toContain("activity");
  });
  it("sin historia: no inventa nada", () => {
    const [t] = rec(cinta(), []);
    expect(t).toMatchObject({ status: "no_data", weightKg: null, action: "none" });
  });
  it("cardio cargado con repeticiones («10-12», como dejaba el editor de sala): no aplica, nunca propone kilos", () => {
    const ex: ExCtx = { ...straight(3, "10-12", 2), profile: "treadmill" };
    const ts = rec(ex, sess(3, [{ reps: "10-12", w: 60, r: 12 }, { reps: "10-12", w: 60, r: 12 }, { reps: "10-12", w: 60, r: 12 }]));
    expect(ts.every((t) => t.status === "not_applicable" && t.weightKg == null && t.repsMin == null && t.text === "")).toBe(true);
    expect(ts[0].why).toMatch(/no calcula kilos/);
    // Sin el perfil, el mismo programa sigue como musculación (compatibilidad): sube la carga como siempre.
    expect(rec(straight(3, "10-12", 2), sess(3, [{ reps: "10-12", w: 60, r: 12 }, { reps: "10-12", w: 60, r: 12 }, { reps: "10-12", w: 60, r: 12 }]))[0].action).toBe("increase_load");
  });
  it("remo por distancia: no aplica (se registra lo hecho)", () => {
    const ex: ExCtx = { sets: 1, reps: "500 m", rir: null, restSec: 0, detail: { ...emptyDetail(), activity: { profile: "rower", distanceM: 500 } } };
    expect(rec(ex, [])[0]).toMatchObject({ status: "not_applicable", weightKg: null });
  });
  it("la fila es «por tiempo» y no tiene carga ni RIR del plan; las tendencias no la toman como serie principal", () => {
    const c = rowContext({ ...cinta(), rir: 2 }, 0);
    expect(c).toMatchObject({ cls: "timed", activity: true, planKg: null, rir: null });
    expect(exerciseRows(cinta()).some((r) => r.cls === "main" || r.cls === "top")).toBe(false);
    expect(rowContext({ ...straight(1, "10-12"), profile: "bike" }, 0).cls).toBe("timed");
    expect(rowContext(straight(3, "8-10"), 0).activity).toBe(false);
  });
  it("compara sólo con filas por tiempo (la historia de «10-12» no es referencia de la cinta por duración)", () => {
    const c = rowContext(cinta(), 0);
    expect(compareRows(c, sess(3, [{ reps: "10-12", w: 60, r: 12 }])[0]).level).toBe("none");
    expect(compareRows(c, sess(3, [{ reps: "600 s", w: null, r: 600 }])[0]).level).not.toBe("none");
    expect(compareRows(c, sess(3, [{ reps: "500 m", w: null, r: 130, activity: true }])[0]).level).not.toBe("none");
  });
  it("una plancha (aguante) sigue como antes: la referencia conserva la carga del chaleco", () => {
    const [t] = rec(straight(3, "40 s"), sess(3, [{ reps: "40 s", w: 10, r: 45 }]));
    expect(t).toMatchObject({ status: "ready", action: "reference", weightKg: 10, repsTarget: 45 });
  });
  it("durante la sesión no ajusta nada en una actividad", () => {
    const ex: ExCtx = { ...cinta(), sets: 3 };
    const targets = rec(ex, sess(3, [{ reps: "10 min", w: null, r: 600 }]));
    const r = adjustAfterSet({ ex, targets, done: [{ index: 0, w: null, r: 300, rir: 0, feel: "limite" }], justDone: 0 });
    expect(r).toEqual({ targets, event: null, changed: [] });
  });
});
