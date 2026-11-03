import { describe, expect, it } from "vitest";
import { acceptInterval, decideSkip, interruptInterval, intervalView, newerThan, toServerMs, type IntervalState } from "./execution";
import { detectGroupLabel, detectGroupWord, detectMethod, detectedLabel, methodDetail } from "./method-detect";
import { exerciseMetrics, sessionMetrics } from "./metrics";
import { planBlocks } from "./stages";

const T = (s: string) => new Date(s).toISOString();

describe("D184 · omisión de etapas entre dispositivos", () => {
  it("un resultado registrado gana siempre: la omisión no se aplica y la etapa no queda omitida", () => {
    expect(decideSkip(null, true, { skipped: true, changedAt: T("2026-11-03T10:00:00Z") })).toEqual({ apply: false, effective: false, reason: "logged" });
  });
  it("gana el cambio más reciente; uno viejo (cola atrasada del otro teléfono) no pisa", () => {
    const cur = { skipped: false, changedAt: T("2026-11-03T10:05:00Z") }; // B deshizo la omisión
    expect(decideSkip(cur, false, { skipped: true, changedAt: T("2026-11-03T10:01:00Z") })).toMatchObject({ apply: false, effective: false, reason: "older" });
    expect(decideSkip(cur, false, { skipped: true, changedAt: T("2026-11-03T10:06:00Z") })).toMatchObject({ apply: true, effective: true });
  });
  it("reintento idéntico: no hace nada (idempotente)", () => {
    const cur = { skipped: true, changedAt: T("2026-11-03T10:00:00Z") };
    expect(decideSkip(cur, false, { ...cur })).toMatchObject({ apply: false, effective: true, reason: "same" });
  });
});

describe("D184 · intervalo EMOM", () => {
  const st: IntervalState = { peId: "pe", block: 1, startedAt: T("2026-11-03T10:00:00Z"), emomSec: 60, status: "running", at: T("2026-11-03T10:00:00Z") };
  const at = (s: string) => Date.parse(s);
  it("en curso, próximo y vencido sin inventar tiempo", () => {
    expect(intervalView(st, at("2026-11-03T10:00:20Z"))).toEqual({ phase: "running", leftSec: 40 });
    expect(intervalView(st, at("2026-11-03T09:59:50Z"))).toEqual({ phase: "upcoming", leftSec: 10 });
    expect(intervalView(st, at("2026-11-03T10:03:00Z"))).toEqual({ phase: "expired" });
    expect(intervalView({ ...st, status: "interrupted" }, at("2026-11-03T10:00:20Z"))).toEqual({ phase: "interrupted" });
  });
  it("otro dispositivo con el reloj 30 s adelantado ve lo mismo (usa la diferencia con el servidor)", () => {
    const skew = -30_000; // servidor − local
    expect(intervalView(st, at("2026-11-03T10:00:50Z"), skew)).toEqual({ phase: "running", leftSec: 40 });
  });
  it("traduce la hora del teléfono a la del servidor aunque el pedido haya esperado en la cola", () => {
    // El teléfono atrasa 2 min; empezó a las 10:00 (su reloj 09:58) y lo envió 1 h después.
    const start = at("2026-11-03T09:58:00Z"), sent = at("2026-11-03T10:58:00Z"), server = at("2026-11-03T11:00:00Z");
    expect(new Date(toServerMs(start, sent, server)).toISOString()).toBe(T("2026-11-03T10:00:00Z"));
  });
  it("rechaza inicios viejos o muy en el futuro y duraciones fuera de rango", () => {
    const now = at("2026-11-03T10:00:00Z");
    const p = { peId: "pe", block: 0, startedAt: T("2026-11-03T10:00:00Z"), emomSec: 60, status: "running" as const, at: T("2026-11-03T10:00:00Z"), sentAt: T("2026-11-03T10:00:00Z") };
    expect(acceptInterval(p, now)).toMatchObject({ startedAt: p.startedAt, status: "running" });
    expect(acceptInterval({ ...p, startedAt: T("2026-11-03T10:10:00Z") }, now)).toBeNull();
    expect(acceptInterval({ ...p, startedAt: T("2026-11-03T02:00:00Z") }, now)).toBeNull();
    expect(acceptInterval({ ...p, emomSec: 5 }, now)).toBeNull();
  });
  it("pausar interrumpe el intervalo; el más reciente gana", () => {
    expect(interruptInterval(st, T("2026-11-03T10:00:30Z"))).toMatchObject({ status: "interrupted" });
    expect(newerThan(st, at("2026-11-03T09:59:00Z"))).toBe(false);
    expect(newerThan(st, at("2026-11-03T10:00:01Z"))).toBe(true);
  });
});

describe("D184 · métodos escritos en una rutina importada", () => {
  it("nombres claros se reconocen con a qué series y cuántas etapas", () => {
    expect(detectMethod("Drop set en la última")).toMatchObject({ technique: "drop_set", confident: true, selection: "last" });
    expect(detectMethod(null, "doble drop", "10")).toMatchObject({ technique: "drop_set", confident: false, stages: 2 });
    expect(detectMethod("rest-pause")).toMatchObject({ technique: "rest_pause", confident: true });
    expect(detectMethod("Myo reps 3 mini series")).toMatchObject({ technique: "myo_reps", stages: 3 });
    expect(detectMethod("EMOM cada 45 s")).toMatchObject({ technique: "emom", emomSec: 45, confident: true });
    expect(detectMethod("AMRAP 10 min")).toMatchObject({ technique: "amrap_time", durationSec: 600, confident: true });
    expect(detectMethod("top set + back-off")).toMatchObject({ technique: "top_backoff", confident: true });
  });
  it("lo ambiguo no se da por seguro y lo que no nombra un método no se detecta", () => {
    expect(detectMethod("pirámide")).toMatchObject({ technique: "pyramid", confident: false });
    expect(detectMethod("AMRAP")).toMatchObject({ technique: "amrap_last", confident: false });
    expect(detectMethod("agarre cerrado", "8-10")).toBeNull();
    expect(detectMethod("al fallo")).toBeNull();
    expect(detectMethod("hacelo con buena postura y dropeá la barra")).toBeNull(); // «dropeá» no es «drop»
  });
  it("arma el plan con el mismo applyMethod que el constructor: 3 series + 2 drops en la última, sin tocar cargas", () => {
    const r = methodDetail(detectMethod("drop set en la última")!, { sets: 3, reps: "10", weightKg: 40 });
    const b = planBlocks(r.detail, r.detail.setPlan!.length);
    expect(b).toHaveLength(3);
    expect(b[2].stages).toBe(2);
    expect(r.detail.setPlan!.filter((x) => x.stage === 0).map((x) => x.weightKg)).toEqual([40, 40, 40]);
    expect(r.detail.setPlan!.filter((x) => x.stage! > 0).every((x) => x.weightKg == null)).toBe(true);
    expect(detectedLabel(detectMethod("drop set en la última")!)).toBe("Drop set en la última serie");
  });
  it("A1/A2 son una superserie explícita; «superserie» suelta se pregunta", () => {
    expect(detectGroupLabel("A1. Press banca")).toEqual({ letter: "A", order: 1, matched: "A1." });
    expect(detectGroupLabel("Press banca")).toBeNull();
    expect(detectGroupWord("en superserie con remo")).toMatchObject({ kind: "superset" });
    expect(detectGroupWord("circuito x3")).toMatchObject({ kind: "circuit" });
  });
});

describe("D184 · estadísticas sin etapas omitidas", () => {
  const ex = { sets: 5, reps: "10", detail: methodDetail(detectMethod("drop set en la última")!, { sets: 3, reps: "10", weightKg: 40 }).detail };
  it("la etapa omitida se cuenta aparte y no suma reps ni tonelaje", () => {
    const logs = [0, 1, 2, 3].map((i) => ({ setIndex: i, weightKg: i < 3 ? 40 : 30, reps: 10 }));
    const m = exerciseMetrics(ex, logs, [4]);
    expect(m).toMatchObject({ mainDone: 3, stagesDone: 1, stagesSkipped: 1, reps: 40, tonnageKg: 1500 });
    expect(sessionMetrics([{ ex, logs, skipped: [4] }]).stagesSkipped).toBe(1);
  });
  it("una etapa registrada nunca cuenta como omitida aunque haya quedado una omisión vieja", () => {
    const logs = [0, 1, 2, 3, 4].map((i) => ({ setIndex: i, weightKg: 40, reps: 10 }));
    expect(exerciseMetrics(ex, logs, [4])).toMatchObject({ stagesDone: 2, stagesSkipped: 0 });
  });
});
