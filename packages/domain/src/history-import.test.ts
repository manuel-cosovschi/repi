import { describe, expect, it } from "vitest";
import { exerciseEvolution, importCanonical, importOverlap, normalizeImport, parseDay, parseHistoryCsv } from "./history-import";

describe("historial anterior · lectura", () => {
  it("fechas en formatos comunes", () => {
    expect(parseDay("17/02/2024")).toBe("2024-02-17");
    expect(parseDay("2024-02-17")).toBe("2024-02-17");
    expect(parseDay("17-2-24")).toBe("2024-02-17");
    expect(parseDay("31/02/2024")).toBeNull();
    expect(parseDay("ayer")).toBeNull();
  });
  it("planilla con series agrupadas y por fila", () => {
    const csv = "Fecha;Ejercicio;Series;Reps;Peso (kg)\n01/03/2024;Sentadilla;3;10;60\n02/03/2024;Press banca;1;8;50,5\nsin fecha;Remo;1;10;40\n";
    const r = parseHistoryCsv(csv)!;
    expect(r).toHaveLength(5); // la fila sin fecha queda para contarla como descartada
    expect(r[3]).toEqual({ day: "2024-03-02", exercise: "Press banca", weightKg: 50.5, reps: 8, seconds: null });
    expect(parseHistoryCsv("nombre,email\nAna,a@b.c")).toBeNull();
  });
});

describe("historial anterior · validación y evolución", () => {
  it("descarta lo imposible, numera series y resume", () => {
    const r = normalizeImport([
      { day: "2024-03-01", exercise: "sentadilla", weightKg: 60, reps: 10, seconds: null },
      { day: "2024-03-01", exercise: "Sentadilla", weightKg: 62.5, reps: 8, seconds: null },
      { day: "2030-01-01", exercise: "Futuro", weightKg: 10, reps: 10, seconds: null },
      { day: "2024-03-02", exercise: "Plancha", weightKg: null, reps: null, seconds: 60 },
      { day: "2024-03-02", exercise: "Nada", weightKg: null, reps: null, seconds: null },
      { day: "2024-03-02", exercise: "Imposible", weightKg: 5000, reps: 5, seconds: null },
    ], "2026-10-28");
    expect(r.dropped).toBe(3);
    expect(r.sets.map((s) => s.setIndex)).toEqual([0, 1, 0]);
    expect(r.summary).toEqual({ sessions: 2, exercises: 2, sets: 3, from: "2024-03-01", to: "2024-03-02" });
  });
  it("evolución: primera, mejor y última marca", () => {
    const ev = exerciseEvolution([
      { day: "2024-01-01", exercise: "Sentadilla", weightKg: 50, reps: 10, seconds: null },
      { day: "2024-02-01", exercise: "Sentadilla", weightKg: 70, reps: 5, seconds: null },
      { day: "2024-03-01", exercise: "Sentadilla", weightKg: 65, reps: 8, seconds: null },
    ]);
    expect(ev[0]).toMatchObject({ exercise: "Sentadilla", sessions: 3, first: { weightKg: 50 }, best: { weightKg: 70 }, last: { weightKg: 65 } });
  });
});

describe("D182 · reimportar no duplica", () => {
  const a = { day: "2024-01-05", exercise: "Sentadilla", weightKg: 60, reps: 10, seconds: null };
  it("mismo contenido en otro orden o con otra escritura del nombre: misma huella", () => {
    expect(importCanonical([a, { ...a, reps: 8 }])).toBe(importCanonical([{ ...a, reps: 8, exercise: "sentadilla" }, { ...a, weightKg: "60" as unknown as number }]));
    expect(importCanonical([a])).not.toBe(importCanonical([{ ...a, weightKg: 62.5 }]));
  });
  it("coincidencia por cantidad: series iguales legítimas del mismo día no se pierden", () => {
    const r = importOverlap([a, a, a, a], [a, a, a]);
    expect(r).toMatchObject({ overlap: 3, keep: [3], days: ["2024-01-05"] });
    expect(importOverlap([a, { ...a, day: "2024-01-06" }], [a])).toMatchObject({ overlap: 1, keep: [1] });
    expect(importOverlap([a], [])).toMatchObject({ overlap: 0, keep: [0], days: [] });
  });
});
