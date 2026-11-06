// Historial anterior a REPI (D132): series cargadas desde un archivo (planilla, texto, foto o PDF) para ver el progreso desde
// antes de usar la app. Reglas puras: lectura de CSV, validación y resumen. La lectura con IA vive en el servidor y siempre
// pasa por `normalizeImport` antes de mostrarse o guardarse.
import { parseCsv } from "./csv";
import { exerciseKey } from "./exercise-catalog";

export type ImportSet = { day: string; exercise: string; weightKg: number | null; reps: number | null; seconds: number | null };
export type NormalizedSet = ImportSet & { setIndex: number };
export type ImportSummary = { sessions: number; exercises: number; sets: number; from: string | null; to: string | null };

export const IMPORT_MAX_SETS = 100_000;
export const IMPORT_MAX_TEXT_LENGTH = 1_000_000;
export const IMPORT_MIN_DAY = "1990-01-01";

export type HistoryTextChunk = { text: string; context: string };

/**
 * Divide notas largas sin recortar caracteres. El contexto contiene únicamente fragmentos del original:
 * sirve para interpretar una continuación (fecha, año y ejercicio), nunca para volver a transcribir esas series.
 */
export function splitHistoryText(text: string, maxChars = 6000): HistoryTextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 256) throw new RangeError("El tamaño de bloque debe ser un entero de al menos 256 caracteres.");
  if (!text) return [];
  const dateHeading = /^\s*(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|fecha)\b[\s,.:–-]*)?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)(?=$|[\s,:;])/i;
  const yearHeading = /^\s*(?:a[nñ]o\s*[:–-]?\s*)?(?:19|20)\d{2}\s*$/i;
  const lines: { start: number; end: number; value: string; date: boolean; year: boolean; blank: boolean }[] = [];
  const addLine = (start: number, end: number, contentEnd: number) => {
    const value = text.slice(start, contentEnd);
    const date = dateHeading.exec(value);
    lines.push({ start, end, value, date: !!date, year: yearHeading.test(value) || !!date && date[1].split(/[-/.]/).length === 3, blank: !value.trim() });
  };
  let lineStart = 0;
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    addLine(lineStart, match.index + match[0].length, match.index);
    lineStart = match.index + match[0].length;
  }
  if (lineStart < text.length) addLine(lineStart, text.length, text.length);
  // Un año puede estar escrito sólo al final de las notas. Estos anclajes siguen siendo referencia, no series del bloque.
  const datedYears = lines.filter((line) => line.year);
  const yearReferences = [datedYears[0]?.value, datedYears.at(-1)?.value].filter((value): value is string => !!value).map((value) => value.slice(0, 180));

  const contextBefore = (start: number) => {
    let date = "", year = "", exercise = "";
    for (const line of lines) {
      if (line.start >= start) break;
      // Un renglón excepcionalmente largo también puede empezar con la fecha; sólo tomamos lo ya leído.
      const value = text.slice(line.start, Math.min(line.start + line.value.length, start)).slice(0, 180);
      if (line.year) year = value;
      if (line.date) { date = value; exercise = ""; }
      else if (yearHeading.test(line.value)) { date = ""; exercise = ""; }
      else if (line.end <= start && /[a-záéíóúüñ]/i.test(line.value)) exercise = value;
    }
    let tailStart = Math.max(0, start - 800);
    // Preferimos un renglón completo para que el contexto no empiece a mitad de un número o ejercicio.
    const firstLine = lines.find((line) => line.start >= tailStart && line.start < start);
    if (firstLine) tailStart = firstLine.start;
    const tail = text.slice(tailStart, start);
    const refs = [...new Set([year, date, exercise].filter((value) => value && !tail.includes(value)))];
    const anchors = [...new Set(yearReferences.filter((value) => !refs.includes(value) && !tail.includes(value)))];
    return [
      anchors.length ? `Referencias de año (pueden ser posteriores; sólo para completar el año, nunca el día ni el ejercicio):\n${anchors.join("\n")}` : "",
      refs.length || tail ? `Continuación anterior al bloque (sólo contexto):\n${[...refs, tail].filter(Boolean).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
  };

  const chunks: HistoryTextChunk[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const nearEnd = start + Math.floor(maxChars * 2 / 3);
      const dates = lines.filter((line) => line.date && line.start >= nearEnd && line.start <= end);
      const blanks = lines.filter((line) => line.blank && line.end >= nearEnd && line.end <= end);
      const complete = lines.filter((line) => line.end > start && line.end <= end);
      end = dates.at(-1)?.start ?? blanks.at(-1)?.end ?? complete.at(-1)?.end ?? end;
      // No separar los dos códigos de un carácter Unicode ni un salto CRLF en un renglón gigante.
      if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end]) || text[end - 1] === "\r" && text[end] === "\n") end--;
    }
    chunks.push({ text: text.slice(start, end), context: contextBefore(start) });
    start = end;
  }
  return chunks;
}

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
  for (const s of sets) {
    const rows = by.get(s.exercise);
    if (rows) rows.push(s);
    else by.set(s.exercise, [s]);
  }
  const better = (a: (typeof sets)[number], b: (typeof sets)[number]) => (a.weightKg ?? 0) > (b.weightKg ?? 0) || ((a.weightKg ?? 0) === (b.weightKg ?? 0) && ((a.reps ?? 0) > (b.reps ?? 0) || (a.seconds ?? 0) > (b.seconds ?? 0)));
  return [...by.entries()].map(([exercise, xs]) => {
    const sorted = [...xs].sort((a, b) => a.day.localeCompare(b.day));
    const firstDay = sorted[0].day, lastDay = sorted[sorted.length - 1].day;
    const top = (day: string) => sorted.filter((s) => s.day === day).reduce((m, s) => (better(s, m) ? s : m));
    const best = sorted.reduce((m, s) => (better(s, m) ? s : m));
    return { exercise, sessions: new Set(sorted.map((s) => s.day)).size, first: top(firstDay), best, last: top(lastDay) };
  }).sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise, "es"));
}

// ── D182: reimportar no duplica ─────────────────────────────────────────────
type KeySet = { day: string; exercise: string; weightKg: number | string | null; reps: number | null; seconds: number | null };
const numKey = (x: number | string | null) => (x == null || x === "" ? "" : String(Number(x)));
/** Clave de una serie importada para comparar contenido: día, ejercicio (sin tildes ni mayúsculas) y números. */
export const importKey = (s: KeySet) => `${s.day}|${exerciseKey(s.exercise)}|${numKey(s.weightKg)}|${numKey(s.reps)}|${numKey(s.seconds)}`;
/** Texto canónico del contenido (independiente del orden de las filas): base de la huella que detecta el mismo archivo. */
export const importCanonical = (sets: KeySet[]) => sets.map(importKey).sort().join("\n");

/**
 * Cuánto de lo nuevo ya está en el historial importado antes. Se cuenta por cantidad: si ese día ya había 3 series iguales y
 * ahora vienen 4, coinciden 3 y la cuarta es nueva (dos series iguales del mismo día son legítimas). `keep`: índices de lo nuevo
 * que no coincide (para «sólo lo nuevo»). Nunca se borra ni se cambia lo que ya estaba.
 */
export function importOverlap(next: KeySet[], existing: KeySet[]) {
  const left = new Map<string, number>();
  for (const e of existing) { const k = importKey(e); left.set(k, (left.get(k) ?? 0) + 1); }
  const keep: number[] = [];
  const days = new Set<string>();
  next.forEach((s, i) => {
    const k = importKey(s);
    const n = left.get(k) ?? 0;
    if (n > 0) { left.set(k, n - 1); days.add(s.day); } else keep.push(i);
  });
  return { overlap: next.length - keep.length, keep, days: [...days].sort() };
}
