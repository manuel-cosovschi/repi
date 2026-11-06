import type { ImportSet } from "../../src/history-import";

const syntheticDay = (session: number) => new Date(Date.UTC(2023, 0, 1 + Math.floor(session * 1095 / 730))).toISOString().slice(0, 10);

/** Tres años calendario de datos sintéticos: no repite una fecha para simular un historial largo. */
export function createThreeYearHistory(): { text: string; sets: ImportSet[]; firstDay: string; lastDay: string } {
  const names = ["Press plano", "Sentadilla", "Remo", "Peso muerto", "Dominadas", "Polea"];
  const chunks: string[] = [];
  const sets: ImportSet[] = [];
  for (let session = 0; session < 730; session++) {
    const day = syntheticDay(session);
    chunks.push(day);
    for (let exercise = 0; exercise < names.length; exercise++) {
      const final = session === 729 && exercise === names.length - 1;
      const weightKg = final ? 99.75 : 40 + exercise * 10;
      const reps = final ? [10, 9, 8, 7, 17] : [10, 9, 8, 7, 6];
      chunks.push(`${names[exercise]} (${String(weightKg).replace(".", ",")}kg)`, reps.join(";"));
      for (const rep of reps) sets.push({ day, exercise: names[exercise], weightKg, reps: rep, seconds: null });
    }
  }
  return { text: chunks.join("\n"), sets, firstDay: sets[0].day, lastDay: sets.at(-1)!.day };
}

/** Texto visible de la foto repetido con fechas SINTÉTICAS de prueba. No reconstruye las notas reales ni el número cortado. */
export function createThreeYearPhotoHistory(): { text: string; sets: ImportSet[]; firstDay: string; lastDay: string } {
  const exercises = [
    { name: "Press plano", written: "105kg", weightKg: 105, reps: [5, 5, 5, 4] },
    { name: "Press inclinado", written: "80kg", weightKg: 80, reps: [6, 5, 5, 5] },
    { name: "Polea", written: "5 ladrillos", weightKg: null, reps: [17, 16, 1] },
  ];
  const chunks: string[] = [];
  const sets: ImportSet[] = [];
  for (let session = 0; session < 730; session++) {
    const day = syntheticDay(session);
    chunks.push(day);
    for (const exercise of exercises) {
      chunks.push(`${exercise.name} (${exercise.written})`, exercise.reps.join(";"));
      for (const reps of exercise.reps) sets.push({ day, exercise: exercise.name, weightKg: exercise.weightKg, reps, seconds: null });
    }
  }
  return { text: chunks.join("\n"), sets, firstDay: sets[0].day, lastDay: sets.at(-1)!.day };
}
