// Historial anterior a REPI (D132): series cargadas desde un archivo (planilla, texto, foto o PDF) para ver el progreso desde
// antes de usar la app. Reglas puras: lectura de CSV, validación y resumen. La lectura con IA vive en el servidor y siempre
// pasa por `normalizeImport` antes de mostrarse o guardarse.
import { parseCsv } from "./csv";

export type ImportSet = { day: string; exercise: string; weightKg: number | null; reps: number | null; seconds: number | null };
export type NormalizedSet = ImportSet & { setIndex: number };
export type ImportSummary = { sessions: number; exercises: number; sets: number; from: string | null; to: string | null };

export const IMPORT_MAX_SETS = 5000;
export const IMPORT_MIN_DAY = "1990-01-01";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const num = (s: string | undefined | null) => {
  if (s == null) return null;
  const t = String(s).replace(/kg|kgs|lbs?|reps?|seg(undos)?|s\b|"/gi, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Fecha de una planilla o anotación: AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA, DD.MM.AA. Devuelve AAAA-MM-DD válido o null. */
export function parseDay(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  let y: number, m: number, d: number;
  let x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (x) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) { d = +x[1]; m = +x[2]; y = +x[3]; if (y < 100) y += y > 50 ? 1900 : 2000; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Planilla con columnas reconocibles (fecha, ejercicio, peso, repeticiones; opcionales series y tiempo). Una fila puede ser una
 * serie o «3 series de 10 con 60 kg» (columna series). Si no reconoce fecha y ejercicio devuelve null: se lee con IA.
 */
export function parseHistoryCsv(text: string): ImportSet[] | null {
  const { headers, rows } = parseCsv(text);
  if (!headers.length || !rows.length) return null;
  const h = headers.map(norm);
  const col = (re: RegExp) => { const i = h.findIndex((x) => re.test(x)); return i < 0 ? null : i; };
  const cDay = col(/^(fecha|date|dia|day)\b/), cEx = col(/ejercicio|exercise|movimiento/);
  if (cDay == null || cEx == null) return null;
  const cW = col(/peso|kg|weight|carga/), cR = col(/^rep|repeticion|reps/), cS = col(/^series?$|^sets?$/), cT = col(/tiempo|segundos|seconds|duracion/);
  const out: ImportSet[] = [];
  for (const r of rows) {
    const day = parseDay(r[cDay]);
    const exercise = (r[cEx] ?? "").replace(/\s+/g, " ").trim();
    if (!exercise) continue; // fila vacía
    if (!day) { out.push({ day: "", exercise, weightKg: null, reps: null, seconds: null }); continue; } // se cuenta como descartada
    const times = Math.max(1, Math.min(20, Math.round(num(cS == null ? null : r[cS]) ?? 1)));
    for (let i = 0; i < times; i++) out.push({ day, exercise, weightKg: num(cW == null ? null : r[cW]), reps: num(cR == null ? null : r[cR]), seconds: num(cT == null ? null : r[cT]) });
  }
  return out.some((x) => x.day) ? out : null;
}

/** Valida y ordena: fechas desde 1990 hasta hoy, pesos 0–1000 kg, repeticiones 0–200, tiempo 0–7200 s; numera las series. */
export function normalizeImport(sets: ImportSet[], today: string): { sets: NormalizedSet[]; summary: ImportSummary; dropped: number; capped: boolean } {
  let dropped = 0;
  const ok: ImportSet[] = [];
  for (const s of sets) {
    const day = parseDay(s.day);
    const exercise = (s.exercise ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const w = s.weightKg == null ? null : Math.round(Number(s.weightKg) * 4) / 4;
    const reps = s.reps == null ? null : Math.round(Number(s.reps));
    const sec = s.seconds == null ? null : Math.round(Number(s.seconds));
    const bad = !day || day < IMPORT_MIN_DAY || day > today || exercise.length < 2
      || (w != null && !(w >= 0 && w <= 1000)) || (reps != null && !(reps >= 0 && reps <= 200)) || (sec != null && !(sec >= 0 && sec <= 7200))
      || (w == null && reps == null && sec == null);
    if (bad) { dropped++; continue; }
    ok.push({ day: day!, exercise: exercise[0].toLocaleUpperCase("es-AR") + exercise.slice(1), weightKg: w, reps, seconds: sec });
  }
  ok.sort((a, b) => a.day.localeCompare(b.day));
  const capped = ok.length > IMPORT_MAX_SETS;
  const kept = ok.slice(0, IMPORT_MAX_SETS);
  const idx = new Map<string, number>();
  const out = kept.map((s) => { const k = `${s.day}|${s.exercise.toLowerCase()}`; const i = idx.get(k) ?? 0; idx.set(k, i + 1); return { ...s, setIndex: i }; });
  return { sets: out, summary: summarize(out), dropped, capped };
}

export function summarize(sets: { day: string; exercise: string }[]): ImportSummary {
  const days = [...new Set(sets.map((s) => s.day))].sort();
  return { sessions: days.length, exercises: new Set(sets.map((s) => s.exercise.toLowerCase())).size, sets: sets.length, from: days[0] ?? null, to: days[days.length - 1] ?? null };
}

/** Evolución por ejercicio: primera marca, mejor marca (más peso; a igual peso, más repeticiones) y última. */
export function exerciseEvolution(sets: { day: string; exercise: string; weightKg: number | null; reps: number | null; seconds: number | null }[]) {
  const by = new Map<string, typeof sets>();
  for (const s of sets) { const k = s.exercise; by.set(k, [...(by.get(k) ?? []), s]); }
  const better = (a: (typeof sets)[number], b: (typeof sets)[number]) => (a.weightKg ?? 0) > (b.weightKg ?? 0) || ((a.weightKg ?? 0) === (b.weightKg ?? 0) && ((a.reps ?? 0) > (b.reps ?? 0) || (a.seconds ?? 0) > (b.seconds ?? 0)));
  return [...by.entries()].map(([exercise, xs]) => {
    const sorted = [...xs].sort((a, b) => a.day.localeCompare(b.day));
    const firstDay = sorted[0].day, lastDay = sorted[sorted.length - 1].day;
    const top = (day: string) => sorted.filter((s) => s.day === day).reduce((m, s) => (better(s, m) ? s : m));
    const best = sorted.reduce((m, s) => (better(s, m) ? s : m));
    return { exercise, sessions: new Set(sorted.map((s) => s.day)).size, first: top(firstDay), best, last: top(lastDay) };
  }).sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise, "es"));
}
