import { describe, expect, it } from "vitest";
import { parseHistoryNotes } from "./history-notes";

const today = "2026-11-06";
const read = (text: string) => parseHistoryNotes(text, today);

describe("lectura rápida y completa de notas de entrenamiento", () => {
  it("lee el formato de la captura, hasta la última repetición, sin convertir ladrillos en kg", () => {
    const parsed = read("12/03/2024\nPress plano (105kg)\n5;5;5;4\nPress inclinado80kg\n6;5;5;5\nPolea (5 ladrillos)\n17;16;13")!;
    expect(parsed.sets).toHaveLength(11);
    expect(parsed.sets.slice(0, 4).map((set) => [set.exercise, set.weightKg, set.reps])).toEqual([
      ["Press plano", 105, 5], ["Press plano", 105, 5], ["Press plano", 105, 5], ["Press plano", 105, 4],
    ]);
    expect(parsed.sets.at(-1)).toEqual({ day: "2024-03-12", exercise: "Polea", weightKg: null, reps: 13, seconds: null });
    expect(parsed.notes).toEqual([expect.stringContaining("5 ladrillos")]);
  });

  it("lee series agrupadas, cargas con coma, libras y expresiones en el mismo renglón", () => {
    const parsed = read("2024-03-12\nSentadilla 3x10 con 60,5kg\nPress (50 lb):8;7;6\nRemo 20kg 2×12\nDominadas: 8;7;6")!;
    expect(parsed.sets).toHaveLength(11);
    expect(parsed.sets.slice(0, 3).map((set) => set.weightKg)).toEqual([60.5, 60.5, 60.5]);
    expect(parsed.sets[3]).toMatchObject({ exercise: "Press", weightKg: 22.68, reps: 8 });
    expect(parsed.sets[6]).toMatchObject({ exercise: "Remo", weightKg: 20, reps: 12 });
    expect(parsed.sets.at(-1)).toMatchObject({ exercise: "Dominadas", weightKg: null, reps: 6 });
  });

  it("no toma el peso ni la cantidad de ladrillos como repeticiones", () => {
    expect(read("12/03/2024\nPress (105kg)")).toBeNull();
    expect(read("12/03/2024\nPolea (5 ladrillos)")).toBeNull();
    expect(read("12/03/2024\nPress 105\n5;5")).toBeNull();
    expect(read("12/03/2024\nPress -80kg\n5;5")).toBeNull();
    expect(read("12/03/2024\nPress 3x10 -80kg\n5;5")).toBeNull();
    expect(read("12/03/2024\nPress (0kg)\n3;2;1")!.sets.map((set) => set.weightKg)).toEqual([0, 0, 0]);
  });

  it("no confunde metadatos con nombres ni divide una carga inválida entre el nombre y los kilos", () => {
    for (const label of ["Peso", "Peso en kg", "Carga", "Series", "Sets", "Reps", "Repeticiones", "Notas", "Observaciones", "Comentarios", "Descanso", "Tiempo", "Duración"]) {
      expect(read(`12/03/2024\n${label}\n80`), label).toBeNull();
      expect(read(`12/03/2024\nPress (80kg)\n5;5\n${label}:\n20`), label).toBeNull();
    }
    for (const load of ["1e2kg", "1,5e2kg", "60,5.0kg", "60 80kg", "60kg 80kg", "−80kg", "–80kg"]) {
      expect(read(`12/03/2024\nPress ${load}\n5;5`), load).toBeNull();
    }
    expect(read("12/03/2024\nPeso muerto (80kg)\n5;5")!.sets[0].exercise).toBe("Peso muerto");
  });

  it("admite nombre en una línea y series con carga en la siguiente, o carga sin anotar", () => {
    const parsed = read("12/03/2024\nSentadilla\n3x10 60 kg\nDominadas\n8;7;6")!;
    expect(parsed.sets.map((set) => [set.exercise, set.weightKg, set.reps])).toEqual([
      ["Sentadilla", 60, 10], ["Sentadilla", 60, 10], ["Sentadilla", 60, 10],
      ["Dominadas", null, 8], ["Dominadas", null, 7], ["Dominadas", null, 6],
    ]);
  });

  it("preserva repeticiones iguales, ejercicios repetidos y orden original, sin deduplicar", () => {
    const parsed = read("15/03/2024\nPress (80kg) 5;5\n12/03/2024\nRemo (20kg) 12;11\nPress (80kg) 5;4")!;
    expect(parsed.sets.map((set) => [set.day, set.exercise, set.reps])).toEqual([
      ["2024-03-15", "Press", 5], ["2024-03-15", "Press", 5],
      ["2024-03-12", "Remo", 12], ["2024-03-12", "Remo", 11],
      ["2024-03-12", "Press", 5], ["2024-03-12", "Press", 4],
    ]);
  });

  it("tolera CRLF, BOM, bullets y fechas con día de la semana o año corto", () => {
    const parsed = read("\uFEFF\r\nAño: 2024\r\nviernes 15/03\r\n• Press (80kg)\r\n5 ; 4\r\n2024\r\nFecha: 16-03-24\r\n- Remo 2x10 20kg\r\n")!;
    expect(parsed.sets.map((set) => set.day)).toEqual(["2024-03-15", "2024-03-15", "2024-03-16", "2024-03-16"]);
  });

  it("usa un año explícito cercano y encabezados de año", () => {
    expect(read("12/03\nPress 2x5 80kg\n15/03/2024\nRemo 1x10 20kg")!.sets[0].day).toBe("2024-03-12");
    expect(read("2023\n31/12\nPress 1x5 80kg\n2024\n01/01\nRemo 1x10 20kg")!.sets.map((set) => set.day)).toEqual(["2023-12-31", "2024-01-01"]);
  });

  it("sólo completa un cambio de año cuando los anclajes lo determinan", () => {
    const parsed = read("31/12/2023\nPress 1x5 80kg\n01/01\nRemo 1x10 20kg\n02/01/2024\nPress 1x4 80kg")!;
    expect(parsed.sets.map((set) => set.day)).toEqual(["2023-12-31", "2024-01-01", "2024-01-02"]);
    expect(read("31/12\nPress 1x5 80kg\n01/01\nRemo 1x10 20kg")).toBeNull();
    expect(read("31/12/2023\nPress 1x5 80kg\n01/01\nRemo 1x10 20kg")).toBeNull();
  });

  it("sin año usa el más reciente válido que no queda en el futuro, incluido un 29 de febrero", () => {
    expect(read("12/12\nPress 1x5 80kg")!.sets[0].day).toBe("2025-12-12");
    expect(read("12/03\nPress 1x5 80kg")!.sets[0].day).toBe("2026-03-12");
    expect(read("29/02\nPress 1x5 80kg")!.sets[0].day).toBe("2024-02-29");
    expect(read("01/02\nPress 1x5 80kg\n05/03\nPress 1x4 80kg")!.sets.map((set) => set.day)).toEqual(["2026-02-01", "2026-03-05"]);
  });

  it("rechaza la vía rápida completa ante una línea o dato sin explicar", () => {
    const good = "12/03/2024\nPress (105kg)\n5;5;5;4\n";
    for (const extra of ["Me dolió el hombro", "Remo (20kg)\n12;once", "Remo (20kg)\n12;", "Remo\n", "descanso 90s", "Remo 3x10 5000kg", "Remo 3x201 20kg", "Remo 0x10 20kg", "13/03/2024\n", "2025\n"]) {
      expect(read(good + extra), extra).toBeNull();
    }
    expect(read("Press (105kg)\n5;5;5;4")).toBeNull();
    expect(read("12/03/2024\nPress (105kg)\nRemo (20kg)\n12;11")).toBeNull();
  });

  it("rechaza fechas inválidas, futuras, contradictorias y cronologías ambiguas", () => {
    for (const header of ["31/02/2024", "07/11/2026", "01/01/1989", "31/02", "2024\n12/03/2025"]) {
      expect(read(header + "\nPress 1x5 80kg"), header).toBeNull();
    }
    expect(read("03/02\nPress 1x5 80kg\n01/02\nPress 1x4 80kg\n02/02\nPress 1x3 80kg")).toBeNull();
    expect(parseHistoryNotes("12/03/2024\nPress 1x5 80kg", "inválido")).toBeNull();
  });

  it("lee más de 60.000 caracteres y todas las 4800 series sin perder el final", () => {
    const text = "12/03/2024\nPress plano con barra para pecho (105kg)\n5;5;5;4\n".repeat(1200);
    expect(text.length).toBeGreaterThan(60_000);
    const parsed = read(text)!;
    expect(parsed.sets).toHaveLength(4800);
    expect(parsed.sets.at(-1)).toMatchObject({ exercise: "Press plano con barra para pecho", weightKg: 105, reps: 4 });
  });

  it("procesa alrededor de 400.000 caracteres completos sin el límite de bloques de IA", () => {
    const record = "12/03/2024\nPress plano con barra para pecho (105kg)\n5;5;5;4\n";
    const count = Math.floor(400_000 / record.length);
    const parsed = read(record.repeat(count))!;
    expect(parsed.sets).toHaveLength(count * 4);
    expect(parsed.sets.at(-1)?.reps).toBe(4);
  });

  it("una expansión abusiva vuelve al lector completo; no devuelve un subconjunto", () => {
    expect(read("12/03/2024\nPress 200x10 80kg\n" + "200x10\n".repeat(1000))).toBeNull();
  });
});
