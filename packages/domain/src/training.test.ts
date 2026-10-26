import { describe, expect, it } from "vitest";
import {
  activeSeconds, detectPR, epley1rm, nextDayIndex, parseReps, parseRest, restLeft, startOptions, stepWeight,
  validateProgramDoc, volumeKg, weekOf, weeklyAdherence, defaultRepsFor, formatClock,
} from "./training";

describe("prescripción", () => {
  it("descanso m:ss o segundos", () => {
    expect(parseRest("2:00")).toBe(120);
    expect(parseRest("0:45")).toBe(45);
    expect(parseRest("90")).toBe(90);
    expect(parseRest("1:75")).toBeNull();
    expect(parseRest("")).toBeNull();
  });
  it("reps: rango, fijo, tiempo y texto libre", () => {
    expect(parseReps("8-10")).toEqual({ kind: "reps", min: 8, max: 10 });
    expect(parseReps("12")).toEqual({ kind: "reps", min: 12, max: 12 });
    expect(parseReps("40 s")).toEqual({ kind: "time", seconds: 40 });
    expect(parseReps("al fallo técnico")).toEqual({ kind: "free", text: "al fallo técnico" });
    expect(defaultRepsFor("8-10")).toBe(8);
    expect(defaultRepsFor("40 s")).toBeNull();
  });
  it("stepper de peso ±2,5 y nunca negativo", () => {
    expect(stepWeight(80, 1)).toBe(82.5);
    expect(stepWeight(1, -1)).toBe(0);
    expect(stepWeight(22.5, 1, 0.25)).toBe(22.75);
    expect(stepWeight(10, -1, 1.25)).toBe(8.75);
  });
});

describe("récords y volumen", () => {
  it("Epley sólo 1–12 reps con carga", () => {
    expect(epley1rm(100, 1)).toBe(100);
    expect(epley1rm(80, 10)).toBe(106.7);
    expect(epley1rm(80, 15)).toBeNull();
    expect(epley1rm(0, 5)).toBeNull();
  });
  it("sin historia previa no hay récord; sólo si supera lo comparable", () => {
    const cur = [{ exerciseId: "b", weightKg: 87.5, reps: 7, completed: true }];
    expect(detectPR([], cur)).toBeNull();
    expect(detectPR([{ exerciseId: "b", weightKg: 85, reps: 6, completed: true }], cur)?.previous.weightKg).toBe(85);
    expect(detectPR([{ exerciseId: "b", weightKg: 90, reps: 8, completed: true }], cur)).toBeNull();
    expect(detectPR([{ exerciseId: "b", weightKg: 85, reps: 6, completed: true }], [{ ...cur[0], completed: false }])).toBeNull();
  });
  it("volumen ignora series no completadas", () => {
    expect(volumeKg([{ exerciseId: "a", weightKg: 80, reps: 10, completed: true }, { exerciseId: "a", weightKg: 80, reps: 10, completed: false }])).toBe(800);
  });
});

describe("tiempo", () => {
  it("duración activa suma tramo en curso y no cuenta la pausa", () => {
    const now = new Date("2026-10-25T12:10:00Z");
    expect(activeSeconds(300_000, new Date("2026-10-25T12:05:00Z"), now)).toBe(600);
    expect(activeSeconds(300_000, null, now)).toBe(300);
    expect(formatClock(3725)).toBe("1:02:05");
  });
  it("descanso por timestamp", () => {
    expect(restLeft(10_500, 1_000)).toBe(10);
    expect(restLeft(500, 1_000)).toBe(0);
    expect(restLeft(null, 1_000)).toBe(0);
  });
  it("semana lunes-domingo en hora AR (domingo 23:30 AR sigue siendo domingo)", () => {
    const w = weekOf(new Date("2026-10-26T02:30:00Z")); // dom 25/10 23:30 AR
    expect(w[0]).toBe("2026-10-19");
    expect(w[6]).toBe("2026-10-25");
  });
  it("opciones de inicio: hoy, próximo lunes, 1 del mes siguiente", () => {
    const o = startOptions(new Date("2026-12-15T15:00:00Z"));
    expect(o.map((x) => x.date)).toEqual(["2026-12-15", "2026-12-21", "2027-01-01"]);
  });
});

describe("rotación y adherencia", () => {
  it("próximo día tras el último completado", () => {
    expect(nextDayIndex(["a", "b", "c"], null)).toBe(0);
    expect(nextDayIndex(["a", "b", "c"], "c")).toBe(0);
    expect(nextDayIndex(["a", "b", "c"], "a")).toBe(1);
    expect(nextDayIndex([], null)).toBe(-1);
  });
  it("adherencia con tope y sin programa nula", () => {
    expect(weeklyAdherence(2, 3)).toBe(67);
    expect(weeklyAdherence(5, 3)).toBe(100);
    expect(weeklyAdherence(1, null)).toBeNull();
  });
});

describe("documento de programa", () => {
  const ok = { name: " Hipertrofia ", weeks: 6, note: "", days: [{ name: "", exercises: [{ exerciseId: "x", name: "Press", sets: 4, reps: "8-10", rir: 2, restSec: 120 }] }] };
  it("normaliza nombres y día vacío", () => {
    const r = validateProgramDoc(ok);
    expect(r.ok && r.doc.name).toBe("Hipertrofia");
    expect(r.ok && r.doc.days[0].name).toBe("Día 1");
  });
  it("rechaza límites inválidos con mensaje", () => {
    expect(validateProgramDoc({ ...ok, days: [] })).toMatchObject({ ok: false });
    const bad = validateProgramDoc({ ...ok, days: [{ name: "A", exercises: [{ ...ok.days[0].exercises[0], rir: 7 }] }] });
    expect(bad).toEqual({ ok: false, error: "A · Press: el RIR va de 0 a 5." });
  });
});
