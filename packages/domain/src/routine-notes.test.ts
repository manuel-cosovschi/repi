import { describe, expect, it } from "vitest";
import { parseRoutineNotes } from "./routine-notes";

describe("rutina escrita · lectura directa", () => {
  it("estructura los días explícitos y conserva cada prescripción", () => {
    const result = parseRoutineNotes("Día A\nSentadilla 4x8 60 kg\nPress plano (105kg)\n5;5;5;4\n\nDía B:\nRemo con barra 3x12 40,5 kg");
    expect(result?.days).toEqual([
      { name: "Día A", exercises: [
        { name: "Sentadilla", sets: 4, reps: "8", weightKg: 60, restSec: null, note: null },
        { name: "Press plano", sets: 4, reps: "5-5-5-4", weightKg: 105, restSec: null, note: null },
      ] },
      { name: "Día B", exercises: [{ name: "Remo con barra", sets: 3, reps: "12", weightKg: 40.5, restSec: null, note: null }] },
    ]);
  });
  it("sin títulos usa una sola rutina y no mezcla ejercicios repetidos", () => {
    const result = parseRoutineNotes("Press plano 3x10 60kg\nRemo 3x12 40kg\nPress plano 2x8 70kg");
    expect(result?.days).toHaveLength(1);
    expect(result?.days[0].name).toBe("Mi rutina");
    expect(result?.days[0].exercises.map((exercise) => [exercise.name, exercise.sets, exercise.weightKg])).toEqual([
      ["Press plano", 3, 60], ["Remo", 3, 40], ["Press plano", 2, 70],
    ]);
  });
  it("admite días de la semana y conserva las cargas sin equivalencia en kilos", () => {
    const result = parseRoutineNotes("Lunes\nPolea (5 ladrillos)\n17;16;13\nMiércoles\nDominadas\n6;5;4");
    expect(result?.days.map((day) => day.name)).toEqual(["Lunes", "Miércoles"]);
    expect(result?.days[0].exercises[0]).toMatchObject({ name: "Polea", sets: 3, reps: "17-16-13", weightKg: null, note: expect.stringContaining("5 ladrillos") });
    expect(result?.days[1].exercises[0]).toMatchObject({ name: "Dominadas", sets: 3, reps: "6-5-4", weightKg: null });
  });
  it("las cargas con decimal punto y las libras no se confunden con fechas", () => {
    const result = parseRoutineNotes("Día A\nElevaciones laterales 3x10 2.5 kg\nPress plano\n22.5 lb 3x8");
    expect(result?.days[0].exercises[0]).toMatchObject({ name: "Elevaciones laterales", sets: 3, reps: "10", weightKg: 2.5 });
    expect(result?.days[0].exercises[1]).toMatchObject({ name: "Press plano", sets: 3, reps: "8" });
    expect(result?.days[0].exercises[1].weightKg).toBe(10.21); // conversión kg compartida, a dos decimales
  });
  it("el historial con fechas no se convierte automáticamente en rutina actual", () => {
    expect(parseRoutineNotes("12/03/2024\nPress plano (105kg)\n5;5;5;4")).toBeNull();
    expect(parseRoutineNotes("2024\nDía A\nPress plano 3x10 60kg")).toBeNull();
    expect(parseRoutineNotes("Lunes 12/03\nSentadilla 3x10 60kg")).toBeNull();
  });
  it("una indicación no comprendida deriva toda la rutina al lector completo", () => {
    for (const text of [
      "Día A\nPress plano 3x10 60kg\nDescanso 90 s",
      "Día A\nPress plano 3x10 60kg\nDescanso\n90",
      "Día A\nPress plano 3x10 60kg drop set en la última",
      "Día A\nSentadilla 3x10 60kg\nPirámide",
      "Día A\nPress plano 3x10 60kg\nDía B",
    ]) expect(parseRoutineNotes(text)).toBeNull();
  });
  it("rechaza bloques que la rutina básica no puede representar fielmente", () => {
    expect(parseRoutineNotes("Press plano\n2x10 60kg\n2x8 70kg")).toBeNull();
    expect(parseRoutineNotes("Sentadilla 11x10 60kg")).toBeNull();
    expect(parseRoutineNotes("Press plano\n10;10;10;10;10;10;10;10;10;9")).toBeNull();
    expect(parseRoutineNotes("")).toBeNull();
  });
});
