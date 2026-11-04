// D192 · Flujo del entrenador: edición rápida, Load Set / tipos personalizados y copiar días.
import { describe, expect, it } from "vitest";
import { copyDayContent, daySummary, docFingerprint, loadSeries, pasteDay, setMainLoads, type DayDoc } from "./coach-workflow";
import { cleanSetLabel, emptyDetail, labelAt, labelKey, setTarget, setTargetText, uniformPlan, validateDetail, SET_LABEL_PRESETS, type ExerciseDetail, type SetSpec } from "./prescription";
import { applyMethod, normalizePlan } from "./stages";
import { carriesLoad, progressionApplies, startWeight } from "./load-safety";
import { compareRows, recommendExercise, rowContext, adjustAfterSet, type ExCtx, type HistRow } from "./intelligence";
import { sessionMetrics } from "./metrics";
import { validateProgramDoc, type ProgramDoc } from "./training";
import { kgTo, toKg } from "./units";

const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const D = (setPlan: SetSpec[] | null, p: Partial<ExerciseDetail> = {}): ExerciseDetail => ({ ...emptyDetail(), technique: "custom", setPlan, ...p });
const NOW = new Date("2026-11-04T15:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("A · edición rápida: pirámides, top set y distribución de cargas", () => {
  const base = { sets: 4, reps: "8-12", rir: 2 };
  const start = D([S("work", "8-12", { weightKg: 40 }), S("work", "8-12", { weightKg: 40 }), S("work", "8-12", { weightKg: 40 }), S("work", "8-12", { weightKg: 40 })], { technique: "straight" });

  it("pirámide ascendente: cambia sólo repeticiones; los pesos anteriores se conservan", () => {
    const r = applyMethod(start, base, "pyramid", [0, 1, 2, 3]);
    expect(r.detail.setPlan!.map((x) => [x.reps, x.weightKg])).toEqual([["14", 40], ["12", 40], ["10", 40], ["8", 40]]);
  });
  it("pirámide invertida y top set + back-off conservan pesos e identidades", () => {
    const ids = normalizePlan(start.setPlan).rows.map((x) => x.id);
    const inv = applyMethod(start, base, "reverse_pyramid", [0, 1, 2, 3]).detail;
    expect(inv.setPlan!.map((x) => x.weightKg)).toEqual([40, 40, 40, 40]);
    const tb = applyMethod(start, base, "top_backoff", [0, 1, 2, 3]).detail;
    expect(tb.setPlan!.map((x) => [x.kind, x.weightKg, x.id])).toEqual([["top", 40, ids[0]], ["backoff", 40, ids[1]], ["backoff", 40, ids[2]], ["backoff", 40, ids[3]]]);
  });
  it("incremento fijo: 40 → 45 → 50 → 55 kg, sólo cuando el profe lo pide", () => {
    expect(loadSeries({ mode: "step_up", start: 40, step: 5, count: 4 })).toEqual([40, 45, 50, 55]);
    expect(loadSeries({ mode: "step_down", start: 55, step: 5, count: 4 })).toEqual([55, 50, 45, 40]);
    expect(loadSeries({ mode: "repeat", start: 42.5, count: 3 })).toEqual([42.5, 42.5, 42.5]);
    expect(loadSeries({ mode: "step_down", start: 5, step: 5, count: 3 })).toEqual([5, 0, 0]); // nunca negativo
  });
  it("porcentaje: sobre la serie anterior y redondeado al salto del equipo si se indica", () => {
    expect(loadSeries({ mode: "pct_up", start: 100, pct: 5, count: 3 })).toEqual([100, 105, 110.25]);
    expect(loadSeries({ mode: "pct_down", start: 100, pct: 10, count: 3, round: 2.5 })).toEqual([100, 90, 80]);
    expect(loadSeries({ mode: "pct_up", start: 100, pct: 0, count: 3 })).toBeNull();
    expect(loadSeries({ mode: "step_up", start: null, step: 5, count: 3 })).toBeNull();
  });
  it("aplicar cargas: sólo las series principales elegidas; las etapas y los demás campos no cambian; dice qué reemplaza", () => {
    const dd = D([S("work", "10", { weightKg: 40, rir: 2 }), S("work", "8", { rir: 1 }), S("drop", "al fallo", { weightKg: 30, restSec: 0 }), S("work", "6")]);
    const n = normalizePlan(dd.setPlan).rows;
    const r = setMainLoads({ ...dd, setPlan: n }, { sets: 4, reps: "10", rir: 2 }, [0, 1, 2], [45, 50, 55]);
    expect(r.detail.setPlan!.map((x) => [x.kind, x.weightKg, x.reps, x.rir])).toEqual([["work", 45, "10", 2], ["work", 50, "8", 1], ["drop", 30, "al fallo", null], ["work", 55, "6", null]]);
    expect(r.replaced).toBe(1);
    expect(r.changes).toEqual(["Serie 1: 40 kg → 45 kg.", "Serie 2: sin peso → 50 kg.", "Serie 3: sin peso → 55 kg."]);
    expect(r.detail.setPlan!.map((x) => x.id)).toEqual(n.map((x) => x.id));
  });
  it("lb: lo que el profe escribe en libras vuelve igual (el plan guarda kg con 2 decimales)", () => {
    const lb = [100, 135, 102.5, 225];
    const det = validateDetail(D(lb.map((v) => S("work", "5", { weightKg: toKg(v, "lb") }))), 4);
    expect(det.ok && det.detail!.setPlan!.map((x) => kgTo(x.weightKg!, "lb"))).toEqual(lb);
  });
});

describe("B · Load Set y tipos personalizados", () => {
  const plan = [S("top", "3-5", { weightKg: 100, rir: 1 }), S("work", "6-8", { label: "Load Set", weightKg: 90, rir: 2, restSec: 180 }), S("backoff", "8-10")];
  const ex: ExCtx = { sets: 3, reps: "6-8", rir: 2, restSec: 120, detail: D(plan) };

  it("Load Set viene de REPI como serie efectiva con nombre propio", () => {
    expect(SET_LABEL_PRESETS[0]).toMatchObject({ label: "Load Set", kind: "work" });
  });
  it("se guarda con su nombre, su tipo real y sus valores; el alumno lo ve con ese nombre", () => {
    const v = validateDetail(D(plan), 3);
    expect(v.ok && v.detail!.setPlan![1]).toMatchObject({ kind: "work", label: "Load Set", weightKg: 90, reps: "6-8", rir: 2, restSec: 180 });
    const t = setTarget(ex, 1);
    expect(t).toMatchObject({ kind: "work", label: "Load Set", custom: true, weightKg: 90 });
    expect(setTargetText(t)).toBe("Load Set · 6-8 · 90 kg · RIR 2");
    expect(labelAt(ex.detail, 1)).toBe("Load Set");
  });
  it("nombres inválidos: vacíos, larguísimos, con símbolos o iguales a un tipo de REPI", () => {
    expect(cleanSetLabel(" ")).toMatchObject({ ok: false });
    expect(cleanSetLabel("x".repeat(31))).toMatchObject({ ok: false });
    expect(cleanSetLabel("🔥 Fuego")).toMatchObject({ ok: false });
    expect(cleanSetLabel("top SET")).toMatchObject({ ok: false });
    expect(cleanSetLabel("Back-off")).toMatchObject({ ok: false });
    expect(cleanSetLabel("  Serie   de control ")).toEqual({ ok: true, label: "Serie de control" });
    expect(validateDetail(D([S("work", "8", { label: "Drop" })]), 1)).toMatchObject({ ok: false });
  });
  it("misma etiqueta sin importar mayúsculas, espacios ni tildes", () => {
    expect(labelKey("Load  SET")).toBe(labelKey("load set"));
    expect(labelKey("Técnica")).toBe(labelKey("tecnica"));
    expect(labelKey(null)).toBeNull();
  });
  it("métricas: un Load Set efectivo cuenta como una serie efectiva (sin duplicar ni inflar volumen)", () => {
    const m = sessionMetrics([{ ex: { sets: 3, reps: "6-8", detail: D(plan) }, logs: [0, 1, 2].map((i) => ({ setIndex: i, weightKg: [100, 90, 80][i], reps: 6, exerciseId: "e" })), skipped: [] }]);
    const plain = sessionMetrics([{ ex: { sets: 3, reps: "6-8", detail: D(plan.map(({ label: _l, ...x }) => x)) }, logs: [0, 1, 2].map((i) => ({ setIndex: i, weightKg: [100, 90, 80][i], reps: 6, exerciseId: "e" })), skipped: [] }]);
    expect(m).toEqual(plain);
  });
  it("cambia la identidad visual pero no la igualdad de series: dos filas iguales salvo la etiqueta no son «series rectas»", () => {
    expect(uniformPlan([S("work", "8", { weightKg: 50 }), S("work", "8", { weightKg: 50, label: "Load Set" })])).toBe(false);
  });
  it("precarga: no hereda la carga del top set ni la sugerencia del ejercicio; con carga del profe, ésa", () => {
    expect(carriesLoad("top", "work", null, "Load Set")).toBe(false);
    expect(carriesLoad("work", "work", "Load Set", "load set")).toBe(true);
    expect(carriesLoad("work", "work")).toBe(true);
    expect(startWeight({ kind: "work", label: "Load Set", carriedKg: 100 })).toEqual({ w: 0, pending: true });
    expect(startWeight({ kind: "work", label: "Load Set", planKg: 90, carriedKg: 100 })).toEqual({ w: 90, pending: false });
    expect(progressionApplies(D([S("work", "8"), S("work", "8", { label: "Load Set" })]))).toBe(false);
  });

  describe("Training Intelligence", () => {
    const h = (rows: Partial<HistRow>[], d = 3): HistRow[] => rows.map((r, i) => ({ sessionId: `s${d}`, at: ago(d), setLogId: `l${d}${i}`, specId: `x${i}`, kind: "work", stage: 0, reps: "6-8", w: 60, r: 8, rir: 2, feel: null, source: "repi", ...r }));
    const cur = rowContext({ ...ex, detail: D([S("top", "3-5"), S("work", "6-8", { label: "Load Set" }), S("backoff", "8-10")]) }, 1);

    it("un Load Set no se compara con un top set, un drop ni una serie efectiva sin etiqueta", () => {
      expect(cur).toMatchObject({ cls: "main", label: "load set" });
      expect(compareRows(cur, h([{ kind: "top", reps: "3-5" }])[0]).level).toBe("none");
      expect(compareRows(cur, h([{ kind: "drop", stage: 0 }])[0]).level).toBe("none");
      expect(compareRows(cur, h([{ kind: "work" }])[0])).toMatchObject({ level: "none", why: "otra etiqueta de serie" });
      expect(compareRows(cur, h([{ kind: "work", label: "Serie pesada" }])[0]).level).toBe("none");
      expect(compareRows(cur, h([{ kind: "work", label: "LOAD set" }])[0]).level).toBe("equivalent");
      expect(compareRows(cur, { ...h([{}])[0], source: "import", kind: null, specId: null }).level).toBe("none");
    });
    it("sin historia propia de Load Set no inventa una carga (aunque haya historia del top set y de efectivas)", () => {
      const ts = recommendExercise({ ex: { ...ex, detail: D([S("top", "3-5"), S("work", "6-8", { label: "Load Set" }), S("backoff", "8-10")]) }, history: h([{ kind: "top", reps: "3-5", w: 100, r: 5 }, { kind: "work", w: 90, r: 8 }, { kind: "backoff", w: 80, r: 10 }]), now: NOW });
      expect(ts[1]).toMatchObject({ status: "no_data", weightKg: null, pending: false });
    });
    it("con historia propia progresa por su cuenta, y la carga del profe manda", () => {
      const noW = D([S("top", "3-5"), S("work", "6-8", { label: "Load Set" })]);
      const ts = recommendExercise({ ex: { ...ex, sets: 2, detail: noW }, history: h([{ kind: "top", reps: "3-5", w: 100, r: 5, specId: "a" }, { kind: "work", label: "Load Set", w: 70, r: 8, specId: "b" }]), now: NOW });
      expect(ts[1]).toMatchObject({ action: "increase_load", weightKg: 72.5 });
      const withCoach = recommendExercise({ ex, history: h([{ kind: "work", label: "Load Set", w: 70, r: 8 }]), now: NOW });
      expect(withCoach[1]).toMatchObject({ source: "coach", weightKg: 90 });
    });
    it("en la sesión, una serie difícil de otra etiqueta no ajusta el Load Set", () => {
      const e2: ExCtx = { sets: 3, reps: "8", rir: 2, restSec: 90, detail: D([S("work", "8"), S("work", "8", { label: "Load Set" }), S("work", "8")]) };
      const targets = recommendExercise({ ex: e2, history: [], now: NOW }).map((t) => ({ ...t, weightKg: 60, action: "hold" as const }));
      const r = adjustAfterSet({ ex: e2, targets, done: [{ index: 0, w: 60, r: 8, rir: 0, feel: "limite" }], justDone: 0 });
      expect(r.changed).not.toContain(1);
    });
  });
});

describe("C · copiar un día", () => {
  const torso: DayDoc = {
    name: "Torso A",
    exercises: [
      { exerciseId: "bench", name: "Press banca", sets: 5, reps: "6-8", rir: 2, restSec: 150, note: "Ana: cuidá el hombro", detail: D([S("top", "3-5", { weightKg: 80, note: "pausa abajo" }), S("work", "6-8", { label: "Load Set", weightKg: 72.5 }), S("backoff", "8-10", { weightKg: 65 }), S("backoff", "8-10", { weightKg: 65 }), S("drop", "al fallo", { weightKg: 50, restSec: 0 })], { technique: "top_backoff" }) },
      { exerciseId: "row", name: "Remo con barra", sets: 3, reps: "8-10", rir: 2, restSec: 90, note: null, detail: D([S("work", "8-10"), S("work", "8-10"), S("work", "8-10")], { group: "A", groupKind: "superset" }) },
      { exerciseId: "incline", name: "Press inclinado", sets: 3, reps: "8-10", rir: 2, restSec: 90, note: null, detail: D([S("work", "8-10"), S("work", "8-10"), S("work", "8-10")], { group: "A", groupKind: "superset" }) },
      { exerciseId: "lateral", name: "Elevaciones laterales", sets: 3, reps: "12-15", rir: 1, restSec: 60, note: null, detail: D([S("work", "12-15"), S("work", "12-15"), S("work", "12-15")], { group: "B", groupKind: "circuit", rounds: 3 }) },
      { exerciseId: "triceps", name: "Extensión de tríceps", sets: 3, reps: "10-12", rir: 1, restSec: 60, note: null, detail: D([S("work", "10-12"), S("work", "10-12"), S("work", "10-12")], { group: "B", groupKind: "circuit", rounds: 3 }) },
    ],
  };
  const ids = (d: DayDoc) => d.exercises.flatMap((e) => (e.detail?.setPlan ?? []).map((r) => r.id));

  it("sin pesos (otra persona): misma estructura, métodos, etapas, Load Set, superseries y circuitos; sin cargas ni notas", () => {
    const { day, stats } = copyDayContent(torso, { weights: "strip", notes: false });
    expect(day.exercises.map((e) => [e.exerciseId, e.sets, e.reps, e.detail?.technique, e.detail?.group ?? null, e.detail?.rounds ?? null])).toEqual(torso.exercises.map((e) => [e.exerciseId, e.sets, e.reps, e.detail?.technique, e.detail?.group ?? null, e.detail?.rounds ?? null]));
    expect(day.exercises[0].detail!.setPlan!.map((r) => [r.kind, r.label ?? null, r.weightKg, r.note])).toEqual([["top", null, null, null], ["work", "Load Set", null, null], ["backoff", null, null, null], ["backoff", null, null, null], ["drop", null, null, null]]);
    expect(day.exercises[0].note).toBeNull();
    expect(stats).toMatchObject({ exercises: 5, weightsRemoved: 5, notesRemoved: 2, groups: ["A", "B"] });
    expect(validateProgramDoc({ name: "x", weeks: 4, note: "", days: [day] }).ok).toBe(true);
  });
  it("identidades nuevas en cada fila; ninguna repetida ni igual a las del origen; sin ids del programa de origen", () => {
    const a = copyDayContent({ ...torso, exercises: torso.exercises.map((e) => ({ ...e, id: "pe-origen" }) as typeof e) }, { weights: "keep", notes: true }).day;
    const src = new Set(ids(torso));
    const got = ids(a);
    expect(new Set(got).size).toBe(got.length);
    expect(got.some((x) => src.has(x))).toBe(false);
    expect(a.exercises.every((e) => !("id" in e))).toBe(true);
  });
  it("con pesos (elección explícita): copia las cargas del profe y las notas", () => {
    const { day, stats } = copyDayContent(torso, { weights: "keep", notes: true });
    expect(day.exercises[0].detail!.setPlan!.map((r) => r.weightKg)).toEqual([80, 72.5, 65, 65, 50]);
    expect(day.exercises[0].note).toBe("Ana: cuidá el hombro");
    expect(stats.weightsRemoved).toBe(0);
  });
  it("el origen no cambia (copia profunda)", () => {
    const before = JSON.stringify(torso);
    const { day } = copyDayContent(torso, { weights: "strip", notes: false });
    day.exercises[0].detail!.setPlan![0].reps = "1";
    expect(JSON.stringify(torso)).toBe(before);
  });
  it("día vacío y ejercicios no disponibles: se copia lo demás y se informa", () => {
    expect(copyDayContent({ name: "Vacío", exercises: [] }, { weights: "strip", notes: false }).day.exercises).toEqual([]);
    const r = copyDayContent(torso, { weights: "strip", notes: false, skip: new Set(["row"]) });
    expect(r.stats.skipped).toEqual(["Remo con barra"]);
    expect(r.day.exercises).toHaveLength(4);
  });
  const dest: DayDoc[] = [{ name: "Día 1", exercises: [{ exerciseId: "squat", name: "Sentadilla", sets: 3, reps: "5", rir: 2, restSec: 180, note: null, detail: D([S("work", "5"), S("work", "5"), S("work", "5")], { group: "A", groupKind: "superset" }) }] }, { name: "Día 2", exercises: [] }];
  const content = copyDayContent(torso, { weights: "strip", notes: false }).day;

  it("agregar al final: no mezcla superseries (cambia las letras que ya se usan en ese día)", () => {
    const r = pasteDay(dest, content, "append", 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.remapped).toEqual({ A: "C" });
    expect(r.days[0].exercises.map((e) => e.detail?.group ?? null)).toEqual(["A", null, "C", "C", "B", "B"]);
    expect(validateProgramDoc({ name: "x", weeks: 4, note: "", days: r.days }).ok).toBe(true);
  });
  it("reemplazar (conserva el nombre del día) y crear un día nuevo (con el nombre del origen)", () => {
    const rep = pasteDay(dest, content, "replace", 0);
    expect(rep.ok && rep.days[0]).toMatchObject({ name: "Día 1" });
    expect(rep.ok && rep.days[0].exercises.map((e) => e.exerciseId)).toEqual(["bench", "row", "incline", "lateral", "triceps"]);
    const nd = pasteDay(dest, content, "new_day", 0);
    expect(nd.ok && [nd.day, nd.days.length, nd.days[2].name]).toEqual([2, 3, "Torso A"]);
    expect(pasteDay(Array.from({ length: 14 }, (_, i) => ({ name: `D${i}`, exercises: [] })), content, "new_day", 0)).toMatchObject({ ok: false });
    expect(pasteDay(dest, content, "append", 5)).toMatchObject({ ok: false });
  });
  it("huella: cambia con cualquier edición; resumen para la vista previa", () => {
    const doc: ProgramDoc = { name: "P", weeks: 4, note: "", days: dest };
    expect(docFingerprint(doc)).toBe(docFingerprint(JSON.parse(JSON.stringify(doc))));
    expect(docFingerprint(doc)).not.toBe(docFingerprint({ ...doc, weeks: 5 }));
    expect(daySummary(torso)[0]).toEqual({ name: "Press banca", sets: 4, technique: "top_backoff", group: null, weights: 5 });
  });
});
