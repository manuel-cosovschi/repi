// Vía rápida para notas de entrenamiento con sintaxis explícita. Si una sola línea queda sin explicar,
// vuelve null para que la lectura automática procese TODO el original, nunca una importación parcial.
import { IMPORT_MIN_DAY, parseDay, type ImportSet } from "./history-import";
import { toKg } from "./units";

type Load = { weightKg: number | null; written?: string };
type DateSpec = { day: number; month: number; year: number | null };
type Session = { date: DateSpec; sets: ImportSet[] };
type Exercise = { name: string; load?: Load; used: boolean };
const MAX_EXPANDED_SETS = 200_000;
const NUMBER = "\\d+(?:[.,]\\d+)?";
const UNITS = "(?:kgs?|kilogramos?|lbs?|libras?|ladrillos?|placas?|bloques?)";
const LOAD = `${NUMBER}\\s*${UNITS}`;
const loadPattern = new RegExp(`^(${NUMBER})\\s*(${UNITS})$`, "i");
const suffixLoad = new RegExp(`^(.+?)\\s*(?:(?:con|a)\\s*)?(\\(${LOAD}\\)|${LOAD})$`, "i");
const prefixLoad = new RegExp(`^(\\(${LOAD}\\)|${LOAD})\\s*(?:[:–-]\\s*)?(.+)$`, "i");
const headerLoad = new RegExp(`^(.+?)\\s*(\\(${LOAD}\\)|${LOAD})$`, "i");
const yearPattern = /^(?:a[nñ]o\s*[:–-]?\s*)?((?:19|20)\d{2})\s*:?$/i;
const datePattern = /^(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|fecha)\b[\s,.:–-]*)?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\s*:?$/i;
const metadataName = /^(?:peso(?:\s+(?:en\s+)?(?:kgs?|lbs?))?|carga|series?|sets?|reps?|repeticiones?|notas?|observaciones?|comentarios?|fecha|dia|descanso|pausa|tiempo|duracion|total|volumen)$/;

function readLoad(raw: string): Load | null {
  const value = raw.replace(/^\((.*)\)$/, "$1").trim();
  const match = loadPattern.exec(value);
  if (!match) return null;
  const number = Number(match[1].replace(",", "."));
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(number) || number < 0) return null;
  if (/^(ladrillo|placa|bloque)/.test(unit)) return number <= 1000 ? { weightKg: null, written: value } : null;
  const weightKg = /^(lb|libra)/.test(unit) ? toKg(number, "lb") : number;
  return weightKg <= 1000 ? { weightKg } : null;
}

function readReps(raw: string): number[] | null {
  const value = raw.trim().replace(/\s+(?:reps?|repeticiones)$/i, "");
  const grouped = /^(\d{1,3})\s*[x×]\s*(\d{1,3})$/i.exec(value);
  if (grouped) {
    const count = Number(grouped[1]), reps = Number(grouped[2]);
    return count >= 1 && count <= 200 && reps <= 200 ? Array<number>(count).fill(reps) : null;
  }
  if (!/^\d{1,3}(?:\s*;\s*\d{1,3})*$/.test(value)) return null;
  const reps = value.split(";").map((part) => Number(part.trim()));
  return reps.every((number) => number <= 200) ? reps : null;
}

function readPrescription(raw: string): { reps: number[]; load?: Load } | null {
  const direct = readReps(raw);
  if (direct) return { reps: direct };
  const after = suffixLoad.exec(raw);
  if (after) {
    const reps = readReps(after[1]), load = readLoad(after[2]);
    if (reps && load) return { reps, load };
  }
  const before = prefixLoad.exec(raw);
  if (before) {
    const reps = readReps(before[2]), load = readLoad(before[1]);
    if (reps && load) return { reps, load };
  }
  return null;
}

function validName(name: string) {
  const label = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return name.length >= 2 && name.length <= 80 && /\p{L}/u.test(name) && !/[;=\n\r]/.test(name)
    && !metadataName.test(label) && !/[-+−–—\d,.:/]$/.test(name)
    // Una carga mal formada no puede quedar partida entre el nombre y los kilos (1e2kg, 60,5.0kg, −80kg).
    && !/\d\s*[eE]$/.test(name) && !new RegExp(`\\d\\s*${UNITS}\\b`, "i").test(name)
    && !/\b\d+\s*[x×]\s*\d+\b/i.test(name);
}

function readExercise(raw: string): Exercise | null {
  raw = raw.replace(/\s*:\s*$/, "");
  const loaded = headerLoad.exec(raw);
  if (loaded) {
    const name = loaded[1].trim().replace(/\s+/g, " ");
    const load = readLoad(loaded[2]);
    return validName(name) && load ? { name, load, used: false } : null;
  }
  // Un encabezado sin carga sólo se acepta si después tiene series explícitas; no se confunde un número con kilos.
  const name = raw.replace(/\s+/g, " ").trim();
  return validName(name) && /^[\p{L}\p{M}\s.'’/–-]+$/u.test(name) ? { name, used: false } : null;
}

function readNamedPrescription(line: string): { exercise: Exercise; reps: number[]; load?: Load } | null {
  const parenthesized = /^(.+?\([^()]+\))\s*(?:[:–-]\s*)?(.+)$/.exec(line);
  if (parenthesized) {
    const exercise = readExercise(parenthesized[1]), prescription = readPrescription(parenthesized[2]);
    if (exercise && prescription) return { exercise, ...prescription };
  }
  const start = /\b\d{1,3}\s*[x×]\s*\d{1,3}\b|\b\d{1,3}(?:\s*;\s*\d{1,3})+\b/i.exec(line);
  if (!start || start.index === 0) return null;
  const exercise = readExercise(line.slice(0, start.index).trim().replace(/\s*[–-]$/, ""));
  const prescription = readPrescription(line.slice(start.index));
  return exercise && prescription ? { exercise, ...prescription } : null;
}

const monthDay = (date: DateSpec) => date.month * 32 + date.day;
function dated(date: DateSpec, year: number, today: string): string | null {
  const day = parseDay(`${year}-${date.month}-${date.day}`);
  return day && day >= IMPORT_MIN_DAY && day <= today ? day : null;
}

function resolveDates(sessions: Session[], today: string): string[] | null {
  const dates = sessions.map((session) => session.date);
  const firstAnchor = dates.findIndex((date) => date.year != null);
  if (firstAnchor < 0) {
    let direction = 0;
    for (let i = 1; i < dates.length; i++) {
      const before = dates[i - 1], after = dates[i];
      // Diciembre–enero sin año admite dos historias distintas: se deja a la lectura automática.
      if (before.month === 12 && after.month === 1 || before.month === 1 && after.month === 12) return null;
      const change = Math.sign(monthDay(after) - monthDay(before));
      if (change && direction && change !== direction) return null;
      if (change) direction = change;
    }
    for (let year = Number(today.slice(0, 4)); year >= 1990; year--) {
      const candidate = dates.map((date) => dated(date, year, today));
      if (candidate.every((day): day is string => day != null)) return candidate;
    }
    return null;
  }
  if (dates.every((date) => date.year != null)) {
    const result = dates.map((date) => dated(date, date.year!, today));
    return result.every((day): day is string => day != null) ? result : null;
  }
  // Se ensayan los dos órdenes. Sólo un año inequívoco para cada fecha permite evitar la IA.
  const solve = (direction: number): string[] | null => {
    const years = new Array<number>(dates.length);
    years[firstAnchor] = dates[firstAnchor].year!;
    const step = (before: DateSpec, after: DateSpec, year: number, order: number) => {
      const change = Math.sign(monthDay(after) - monthDay(before));
      if (!change || change === order) return year;
      if (order === 1 && before.month >= 10 && after.month <= 3) return year + 1;
      if (order === -1 && before.month <= 3 && after.month >= 10) return year - 1;
      return null;
    };
    for (let i = firstAnchor - 1; i >= 0; i--) {
      const year = step(dates[i + 1], dates[i], years[i + 1], -direction);
      if (year == null) return null;
      years[i] = year;
    }
    for (let i = firstAnchor + 1; i < dates.length; i++) {
      const year = step(dates[i - 1], dates[i], years[i - 1], direction);
      if (year == null || dates[i].year != null && dates[i].year !== year) return null;
      years[i] = year;
    }
    const result = dates.map((date, i) => dated(date, years[i], today));
    return result.every((day): day is string => day != null) ? result : null;
  };
  const ascending = solve(1), descending = solve(-1);
  if (ascending && descending && ascending.some((day, i) => day !== descending[i])) return null;
  return ascending ?? descending;
}

/** Notas con fecha + ejercicio + repeticiones, completas o null. No usa IA, catálogo ni red. */
export function parseHistoryNotes(text: string, today: string): { sets: ImportSet[]; notes: string[] } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || parseDay(today) !== today) return null;
  const sessions: Session[] = [];
  const notes = new Set<string>();
  let current: Session | undefined, exercise: Exercise | null = null;
  let headingYear: number | null = null, unusedYear = false, total = 0;
  const add = (reps: number[], load?: Load) => {
    if (!current || !exercise || total + reps.length > MAX_EXPANDED_SETS) return false;
    const applied = load ?? exercise.load;
    for (const rep of reps) current.sets.push({ day: "", exercise: exercise.name, weightKg: applied?.weightKg ?? null, reps: rep, seconds: null });
    if (applied?.written) notes.add(`«${exercise.name}»: carga anotada «${applied.written}», sin equivalencia en kg.`);
    total += reps.length;
    exercise.used = true;
    return true;
  };
  for (const original of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const line = original.trim().replace(/^[•*-]\s+/, "");
    if (!line) continue;
    if (line.length > 5000) return null; // Sintaxis no acotada: se lee el original con el otro lector.
    const year = yearPattern.exec(line);
    if (year) {
      if (unusedYear || exercise && !exercise.used || current && !current.sets.length) return null;
      headingYear = Number(year[1]); unusedYear = true; exercise = null;
      continue;
    }
    const header = datePattern.exec(line);
    if (header) {
      if (exercise && !exercise.used || current && !current.sets.length) return null;
      const parts = header[1].split(/[-/.]/).map(Number);
      const iso = /^\d{4}/.test(header[1]);
      let explicitYear = parts.length === 3 ? (iso ? parts[0] : parts[2]) : null;
      if (explicitYear != null && explicitYear < 100) explicitYear += explicitYear > 50 ? 1900 : 2000;
      if (explicitYear != null && headingYear != null && headingYear !== explicitYear) return null;
      current = { date: { day: iso ? parts[2] : parts[0], month: parts[1], year: explicitYear ?? headingYear }, sets: [] };
      sessions.push(current); exercise = null; unusedYear = false;
      continue;
    }
    if (!current || unusedYear) return null;
    const prescription = readPrescription(line);
    if (prescription) {
      if (!add(prescription.reps, prescription.load)) return null;
      continue;
    }
    const named = readNamedPrescription(line);
    if (named) {
      if (exercise && !exercise.used) return null;
      exercise = named.exercise;
      if (!add(named.reps, named.load)) return null;
      continue;
    }
    if (exercise && !exercise.used) return null;
    exercise = readExercise(line);
    if (!exercise) return null;
  }
  if (!total || unusedYear || exercise && !exercise.used) return null;
  if (sessions.some((session) => !session.sets.length)) return null;
  const days = resolveDates(sessions, today);
  if (!days) return null;
  const sets = sessions.flatMap((session, i) => session.sets.map((set) => ({ ...set, day: days[i] })));
  return { sets, notes: [...notes] };
}

export type HistoryNotesBlock = {
  day: string;
  text: string;
  parsed: { sets: ImportSet[]; notes: string[] } | null;
};

/** Resuelve los años en el original completo antes de aislar las sesiones que necesitan otra lectura. */
export function partitionHistoryNotes(text: string, today: string): { blocks: HistoryNotesBlock[] } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || parseDay(today) !== today) return null;
  const sessions: { date: DateSpec; body: string[] }[] = [];
  let current: typeof sessions[number] | undefined;
  let headingYear: number | null = null, unusedYear = false;
  for (const original of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const line = original.trim().replace(/^[•*-]\s+/, "");
    if (!line) {
      if (current && !unusedYear) current.body.push(original);
      continue;
    }
    const year = yearPattern.exec(line);
    if (year) {
      if (unusedYear) return null;
      headingYear = Number(year[1]); unusedYear = true; current = undefined;
      continue;
    }
    const header = datePattern.exec(line);
    if (header) {
      const parts = header[1].split(/[-/.]/).map(Number);
      const iso = /^\d{4}/.test(header[1]);
      let explicitYear = parts.length === 3 ? (iso ? parts[0] : parts[2]) : null;
      if (explicitYear != null && explicitYear < 100) explicitYear += explicitYear > 50 ? 1900 : 2000;
      if (explicitYear != null && headingYear != null && headingYear !== explicitYear) return null;
      current = { date: { day: iso ? parts[2] : parts[0], month: parts[1], year: explicitYear ?? headingYear }, body: [] };
      sessions.push(current); unusedYear = false;
      continue;
    }
    // No se omiten títulos, comentarios ni texto anterior a una fecha interpretable.
    if (!current || unusedYear) return null;
    current.body.push(original);
  }
  if (!sessions.length || unusedYear) return null;
  const days = resolveDates(sessions.map(({ date }) => ({ date, sets: [] })), today);
  if (!days) return null;
  return {
    blocks: sessions.map((session, index) => {
      const day = days[index], canonical = `${day}\n${session.body.join("\n")}`;
      return { day, text: canonical, parsed: parseHistoryNotes(canonical, today) };
    }),
  };
}
