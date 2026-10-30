import { describe, expect, it } from "vitest";
import { parseRoutineCsv } from "./routine-import";

describe("rutina propia desde planilla (D162)", () => {
  it("agrupa por día en orden, lee series, reps, peso y descanso; sin columnas reconocibles devuelve null", () => {
    const csv = "Día;Ejercicio;Series;Reps;Peso;Descanso\nDía A;Sentadilla;4;8-10;60 kg;120\n;Press banca;3;10;42,5;90\nDía B;Remo con barra;3;12;;\n";
    expect(parseRoutineCsv(csv)).toEqual([
      { name: "Día A", exercises: [
        { name: "Sentadilla", sets: 4, reps: "8-10", weightKg: 60, restSec: 120, note: null },
        { name: "Press banca", sets: 3, reps: "10", weightKg: 42.5, restSec: 90, note: null },
      ] },
      { name: "Día B", exercises: [{ name: "Remo con barra", sets: 3, reps: "12", weightKg: null, restSec: null, note: null }] },
    ]);
    expect(parseRoutineCsv("Ejercicio,Reps\nDominadas,8")).toEqual([{ name: "Mi rutina", exercises: [{ name: "Dominadas", sets: 3, reps: "8", weightKg: null, restSec: null, note: null }] }]);
    expect(parseRoutineCsv("Fecha,Notas\n12/03,algo")).toBeNull();
  });
});
