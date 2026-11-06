import { describe, expect, it } from "vitest";
import { exerciseEvolution, importCanonical, importOverlap, normalizeImport, parseDay, parseHistoryCsv, splitHistoryText } from "./history-import";
import { parseHistoryNotes } from "./history-notes";
import { createThreeYearHistory, createThreeYearPhotoHistory } from "../tests/fixtures/three-year-history";

describe("historial pegado · bloques completos", () => {
  const exactChunks = (text: string) => {
    const chunks = splitHistoryText(text);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeLessThanOrEqual(6000);
      expect(chunk.context.length).toBeLessThanOrEqual(2000);
    }
    return chunks;
  };

  it("conserva el último número de notas de más de 60.000 caracteres y cada serie con punto y coma", () => {
    const text = "2024\n12/03\nPress plano (105kg)\n" + "5;5;5;4\n".repeat(8000) + "Polea (5 ladrillos)\n17;16;13";
    expect(text.length).toBeGreaterThan(60_000);
    const chunks = exactChunks(text);
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.at(-1)!.text.endsWith("Polea (5 ladrillos)\n17;16;13")).toBe(true);
    expect(chunks.at(-1)!.context).toContain("Press plano (105kg)");
    expect(chunks.at(-1)!.context).toContain("12/03");
    expect(chunks.at(-1)!.context).toContain("2024");
  });

  it("prefiere empezar el siguiente bloque en la fecha sin duplicar la sesión", () => {
    const introduction = "Notas previas: " + "a".repeat(4200) + "\n\n";
    const text = introduction + "12/03/2024\nSentadilla (60kg)\n" + "10;9;8\n".repeat(1200);
    const chunks = exactChunks(text);
    expect(chunks[0].text).toBe(introduction);
    expect(chunks[1].text.startsWith("12/03/2024\n")).toBe(true);
    expect(chunks.slice(1).map((chunk) => chunk.text).join("").match(/12\/03\/2024/g)).toHaveLength(1);
  });

  it("continúa un ejercicio largo con su fecha, año y nombre aunque estén fuera de la cola reciente", () => {
    const text = "Año: 2023\r\nviernes 15/12\r\nPress inclinado (80kg)\r\n" + "6;5;5;5\r\n".repeat(1800);
    const chunks = exactChunks(text);
    for (const chunk of chunks.slice(1)) {
      expect(chunk.context).toContain("Año: 2023");
      expect(chunk.context).toContain("viernes 15/12");
      expect(chunk.context).toContain("Press inclinado (80kg)");
    }
    for (const chunk of chunks.slice(0, -1)) expect(chunk.text.endsWith("\r\n")).toBe(true);
  });

  it("conserva una referencia al año escrito después de las primeras fechas sin año", () => {
    const text = "12/03\nSentadilla (60kg)\n" + "10;9;8\n".repeat(1000) + "\n2024\n";
    const chunks = exactChunks(text);
    expect(chunks[0].context).toContain("2024");
    expect(chunks[0].context).not.toContain("2026");
  });

  it("conserva las fechas ISO y el ejercicio activo al pasar de año", () => {
    const text = "2023\n2023-12-15\nPress (60kg)\n" + "10;9;8\n".repeat(1000)
      + "2024\n02/01\nRemo (30kg)\n" + "12;11;10\n".repeat(1500);
    const chunks = exactChunks(text);
    expect(chunks[1].context).toContain("2023-12-15");
    expect(chunks.at(-1)!.context).toContain("2024");
    expect(chunks.at(-1)!.context).toContain("02/01");
    expect(chunks.at(-1)!.context).toContain("Remo (30kg)");
  });

  it("divide un renglón gigante sin perder texto ni partir un carácter Unicode", () => {
    const chunks = exactChunks("x".repeat(5999) + "🙂" + "y".repeat(12_000) + ";17;16;13");
    expect(chunks[0].text).toHaveLength(5999);
    expect(chunks[1].text.startsWith("🙂")).toBe(true);
    expect(chunks.at(-1)!.text.endsWith(";17;16;13")).toBe(true);
  });

  it("no crea bloques para un texto vacío y conserva un texto corto", () => {
    expect(splitHistoryText("")).toEqual([]);
    expect(exactChunks("12/03\nPress plano (105kg)\n5;5;5;4")).toHaveLength(1);
  });

  it("permite reintentar una lectura incompleta con bloques menores sin perder las series", () => {
    const text = "2024\n12/03\nPress plano (105kg)\n" + "5;5;5;4\n".repeat(1200) + "17;16;13";
    for (const size of [3000, 1500, 750, 375]) {
      const chunks = splitHistoryText(text, size);
      expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
      for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(size);
      expect(chunks.at(-1)!.text.endsWith("17;16;13")).toBe(true);
      expect(chunks.at(-1)!.context).toContain("Press plano (105kg)");
    }
    for (const invalid of [0, -1, 255, 375.5, Infinity, NaN]) expect(() => splitHistoryText(text, invalid)).toThrow(RangeError);
  });
});

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
  it("conserva tres años sintéticos con el texto visible de la foto, sin completar el último 1", () => {
    const fixture = createThreeYearPhotoHistory();
    const parsed = parseHistoryNotes(fixture.text, "2026-11-06")!;
    expect(parsed.sets).toEqual(fixture.sets);
    expect(parsed.notes).toEqual([expect.stringContaining("5 ladrillos")]);
    const normalized = normalizeImport(parsed.sets, "2026-11-06");
    expect(normalized).toMatchObject({ capped: false, dropped: 0, summary: { sessions: 730, exercises: 3, sets: 8030, from: "2023-01-01", to: "2025-12-29" } });
    expect(normalized.sets.at(-1)).toMatchObject({ day: "2025-12-29", exercise: "Polea", weightKg: null, reps: 1, setIndex: 2 });
    expect(normalized.sets.slice(-3).map((set) => set.reps)).toEqual([17, 16, 1]);
  });

  it("conserva tres años calendario sintéticos y las 21.900 series, incluida la última marca", () => {
    const fixture = createThreeYearHistory();
    const parsed = parseHistoryNotes(fixture.text, "2026-11-06")!;
    expect(parsed.sets).toEqual(fixture.sets);
    const normalized = normalizeImport(parsed.sets, "2026-11-06");
    expect(normalized).toMatchObject({ capped: false, dropped: 0, summary: { sessions: 730, exercises: 6, sets: 21_900, from: "2023-01-01", to: "2025-12-29" } });
    expect(normalized.sets).toHaveLength(21_900);
    expect(normalized.sets[0].day).toBe("2023-01-01");
    expect(normalized.sets.at(-1)).toMatchObject({ day: "2025-12-29", exercise: "Polea", weightKg: 99.75, reps: 17, setIndex: 4 });
    const evolution = exerciseEvolution(normalized.sets);
    expect(evolution).toHaveLength(6);
    expect(evolution.find((exercise) => exercise.exercise === "Polea")).toMatchObject({ sessions: 730, first: { day: "2023-01-01" }, last: { day: "2025-12-29", weightKg: 99.75, reps: 17 } });
  });
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
