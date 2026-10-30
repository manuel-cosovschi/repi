// D162: rutina propia del alumno desde una planilla (Excel, CSV u OpenDocument convertidos a CSV en el teléfono). Con columnas
// reconocibles se lee sin IA; fotos, capturas, PDF y texto libre los transcribe REPI. Siempre se revisa antes de guardar.
import { parseCsv } from "./csv";

export type ImportedRoutineEx = { name: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null };
export type ImportedRoutineDay = { name: string; exercises: ImportedRoutineEx[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const num = (s: string | undefined | null) => {
  const t = String(s ?? "").replace(/kg|kgs|lbs?|seg(undos)?|s\b|"/gi, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Planilla con columnas Ejercicio y Series o Reps (Día, Peso, Descanso y Notas opcionales). Las filas se agrupan por día en el
 * orden en que aparecen; sin columna Día, todo es una rutina. Devuelve null si no reconoce las columnas.
 */
export function parseRoutineCsv(text: string): ImportedRoutineDay[] | null {
  const { headers, rows } = parseCsv(text);
  if (!headers.length || !rows.length) return null;
  const h = headers.map(norm);
  const col = (re: RegExp) => { const i = h.findIndex((x) => re.test(x)); return i < 0 ? null : i; };
  const cEx = col(/ejercicio|exercise|movimiento/), cS = col(/^series?$|^sets?$/), cR = col(/^rep|repeticion/);
  if (cEx == null || (cS == null && cR == null)) return null;
  const cDay = col(/^(dia|day|rutina|sesion)\b/), cW = col(/peso|kg|weight|carga/), cRest = col(/descanso|rest|pausa/), cN = col(/^nota|observ|comentario/);
  const days: ImportedRoutineDay[] = [];
  for (const r of rows) {
    const name = (r[cEx] ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const dayName = (cDay == null ? "" : (r[cDay] ?? "").trim()) || days.at(-1)?.name || "Mi rutina";
    let d = days.find((x) => x.name === dayName);
    if (!d) { d = { name: dayName, exercises: [] }; days.push(d); }
    const sets = Math.round(num(cS == null ? null : r[cS]) ?? 3);
    const w = num(cW == null ? null : r[cW]);
    const rest = num(cRest == null ? null : r[cRest]);
    d.exercises.push({
      name: name.slice(0, 80), sets: sets >= 1 && sets <= 10 ? sets : 3, reps: (cR == null ? "" : (r[cR] ?? "").trim()).slice(0, 20) || "10",
      weightKg: w != null && w > 0 && w <= 500 ? w : null, restSec: rest != null && rest >= 0 && rest <= 600 ? Math.round(rest) : null,
      note: (cN == null ? "" : (r[cN] ?? "").trim()).slice(0, 120) || null,
    });
  }
  return days.length ? days : null;
}
