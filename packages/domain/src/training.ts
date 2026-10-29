import { validateDetail, type ExerciseDetail } from "./prescription";
// Reglas de programación y ejecución de entrenamientos (Etapa 2).
// Fuentes: REPI Desktop Coach.dc.html (constructor: series, reps, RIR, descanso) y
// REPI App Alumno v4.dc.html (sesión activa, descanso, resumen). Fórmulas documentadas en docs/DECISIONS.md.

export const TZ = "America/Argentina/Buenos_Aires";

/** "2:00" | "90" | "1:30" → segundos. Inválido → null. */
export function parseRest(input: string | number | null | undefined): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  const s = (input ?? "").trim();
  if (!s) return null;
  let m = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,4})\s*s?$/.exec(s);
  return m ? Number(m[1]) : null;
}
export const formatRest = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export const formatClock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export type RepsTarget = { kind: "reps"; min: number; max: number } | { kind: "time"; seconds: number } | { kind: "free"; text: string };
/** Prescripción textual del constructor: "8-10", "10", "40 s", "al fallo técnico". */
export function parseReps(input: string): RepsTarget {
  const s = input.trim();
  let m = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(s);
  if (m) { const a = Number(m[1]), b = Number(m[2]); return { kind: "reps", min: Math.min(a, b), max: Math.max(a, b) }; }
  m = /^(\d{1,3})$/.exec(s);
  if (m) return { kind: "reps", min: Number(m[1]), max: Number(m[1]) };
  m = /^(\d{1,4})\s*(s|seg|segundos)$/i.exec(s);
  if (m) return { kind: "time", seconds: Number(m[1]) };
  return { kind: "free", text: s };
}
export const repsLabel = (t: RepsTarget) =>
  t.kind === "reps" ? (t.min === t.max ? `${t.min}` : `${t.min}-${t.max}`) : t.kind === "time" ? `${t.seconds} s` : t.text;

// Steppers de la sesión activa (22_DEVELOPER_ACCEPTANCE_CRITERIA F-CL-03: ±2,5 kg / ±1 rep).
export const WEIGHT_STEP = 2.5;
/** Suma o resta un paso (por defecto 2,5 kg; el socio puede elegir pasos finos para discos y mancuernas chicas). */
export const stepWeight = (w: number, dir: 1 | -1, step: number = WEIGHT_STEP) => Math.max(0, Math.round((w + dir * step) * 100) / 100);
export const stepReps = (r: number, dir: 1 | -1) => Math.max(0, r + dir);

/**
 * D148: control propio de la serie en curso. Series por tiempo («40 s»): cronómetro con el objetivo; AMRAP o al fallo:
 * contador de repeticiones con un toque. El resultado se guarda igual que siempre (segundos o repeticiones en `reps`).
 */
export function setControl(t: { kind?: string | null; reps: string }): { mode: "time"; seconds: number } | { mode: "amrap" } | null {
  const r = parseReps(t.reps);
  if (r.kind === "time") return { mode: "time", seconds: r.seconds };
  if (t.kind === "amrap" || t.kind === "failure" || /amrap|fallo|m[aá]x/i.test(t.reps)) return { mode: "amrap" };
  return null;
}

/**
 * 1RM estimado por Epley: w × (1 + r/30). Sólo para 1–12 reps con carga > 0;
 * fuera de ese rango devuelve null (la fórmula pierde validez). Es una estimación, no una carga medida.
 */
export function epley1rm(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export type LoggedSet = { exerciseId: string; weightKg: number | null; reps: number | null; completed: boolean; at?: string };

/** Mejor 1RM estimado de un conjunto de series completadas para un ejercicio. */
export function bestE1rm(sets: LoggedSet[]): { e1rm: number; weightKg: number; reps: number } | null {
  let best: { e1rm: number; weightKg: number; reps: number } | null = null;
  for (const s of sets) {
    if (!s.completed || s.weightKg == null || s.reps == null) continue;
    const e = epley1rm(s.weightKg, s.reps);
    if (e != null && (!best || e > best.e1rm)) best = { e1rm: e, weightKg: s.weightKg, reps: s.reps };
  }
  return best;
}

/**
 * Récord personal: sólo si existe historia comparable previa del MISMO ejercicio y el mejor 1RM estimado
 * de la sesión la supera. Sin historia previa no hay récord (no se fabrica).
 */
export function detectPR(previous: LoggedSet[], current: LoggedSet[]) {
  const prev = bestE1rm(previous);
  const cur = bestE1rm(current);
  if (!prev || !cur || cur.e1rm <= prev.e1rm) return null;
  return { current: cur, previous: prev };
}

/** Volumen = Σ peso × reps de series completadas con carga (documentado en F-CL-06). */
export const volumeKg = (sets: LoggedSet[]) =>
  Math.round(sets.reduce((a, s) => a + (s.completed && s.weightKg && s.reps ? s.weightKg * s.reps : 0), 0) * 10) / 10;

/** Duración activa: tiempo acumulado + tramo en curso si no está en pausa. */
export function activeSeconds(activeMs: number, lastResumedAt: Date | string | null, now: Date) {
  const run = lastResumedAt ? Math.max(0, now.getTime() - new Date(lastResumedAt).getTime()) : 0;
  return Math.floor((activeMs + run) / 1000);
}

/** Descanso por timestamp de fin (F-CL-04): no depende de frames ni de la pantalla visible. */
export function restLeft(restEndsAt: number | null, now: number) {
  return restEndsAt == null ? 0 : Math.max(0, Math.ceil((restEndsAt - now) / 1000));
}

/** Próximo día por rotación: el siguiente al último día completado; sin historia, el primero. (D30) */
export function nextDayIndex(dayIds: string[], lastCompletedDayId: string | null): number {
  if (!dayIds.length) return -1;
  const i = lastCompletedDayId ? dayIds.indexOf(lastCompletedDayId) : -1;
  return i < 0 ? 0 : (i + 1) % dayIds.length;
}

/** Fecha local AR (AAAA-MM-DD) de un instante. */
export function localDate(d: Date, tz = TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const addDaysIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** Semana lunes–domingo (fechas locales) que contiene `d`. */
export function weekOf(d: Date, tz = TZ): string[] {
  const today = localDate(d, tz);
  const [y, m, dd] = today.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; // 0 = lunes
  const monday = addDaysIso(today, -dow);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
}
export const WEEK_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

/** Opciones de inicio del modal Asignar: hoy, próximo lunes, 1 del mes siguiente (fechas locales). */
export function startOptions(now: Date, tz = TZ) {
  const today = localDate(now, tz);
  const week = weekOf(now, tz);
  const nextMonday = addDaysIso(week[0], 7);
  const [y, m] = today.split("-").map(Number);
  const firstNext = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
  return [{ key: "hoy", date: today }, { key: "lun", date: nextMonday }, { key: "mes", date: firstNext }];
}
export function formatDayEs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Adherencia semanal = sesiones completadas ÷ días del programa, tope 100 %. Sin programa: null. */
export function weeklyAdherence(completed: number, daysPerWeek: number | null): number | null {
  if (!daysPerWeek) return null;
  return Math.min(100, Math.round((completed / daysPerWeek) * 100));
}

// ── Documento de programa (lo que edita el constructor) ─────────────────────
export type ProgramExerciseDoc = { exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; note?: string | null; detail?: ExerciseDetail | null };
export type ProgramDayDoc = { name: string; exercises: ProgramExerciseDoc[] };
export type ProgramDoc = { name: string; weeks: number; note: string; days: ProgramDayDoc[] };

export const PROGRAM_LIMITS = { days: 14, exercisesPerDay: 30, sets: 20, weeks: 52, rir: 5, restSec: 900 } as const;

/** Valida y normaliza un documento. Devuelve errores en español; nunca lanza. */
export function validateProgramDoc(doc: ProgramDoc): { ok: true; doc: ProgramDoc } | { ok: false; error: string } {
  const name = doc.name?.trim();
  if (!name) return { ok: false, error: "El programa necesita un nombre." };
  if (!Number.isInteger(doc.weeks) || doc.weeks < 1 || doc.weeks > PROGRAM_LIMITS.weeks) return { ok: false, error: "Las semanas van de 1 a 52." };
  if (!doc.days?.length) return { ok: false, error: "El programa necesita al menos un día." };
  if (doc.days.length > PROGRAM_LIMITS.days) return { ok: false, error: "Máximo 14 días." };
  const days: ProgramDayDoc[] = [];
  for (const [i, d] of doc.days.entries()) {
    const dn = d.name?.trim() || `Día ${i + 1}`;
    if (d.exercises.length > PROGRAM_LIMITS.exercisesPerDay) return { ok: false, error: `${dn}: máximo 30 ejercicios.` };
    const exercises: ProgramExerciseDoc[] = [];
    for (const e of d.exercises) {
      if (!e.exerciseId) return { ok: false, error: `${dn}: ejercicio sin referencia a la biblioteca.` };
      const det = validateDetail(e.detail, e.sets); // con plan serie por serie, las series salen del plan
      if (!det.ok) return { ok: false, error: `${dn} · ${e.name}: ${det.error}` };
      if (!Number.isInteger(det.sets) || det.sets < 1 || det.sets > PROGRAM_LIMITS.sets) return { ok: false, error: `${dn} · ${e.name}: las series van de 1 a 20.` };
      if (!e.reps?.trim()) return { ok: false, error: `${dn} · ${e.name}: indicá las repeticiones.` };
      if (e.rir != null && (!Number.isInteger(e.rir) || e.rir < 0 || e.rir > PROGRAM_LIMITS.rir)) return { ok: false, error: `${dn} · ${e.name}: el RIR va de 0 a 5.` };
      if (!Number.isInteger(e.restSec) || e.restSec < 0 || e.restSec > PROGRAM_LIMITS.restSec) return { ok: false, error: `${dn} · ${e.name}: el descanso va de 0:00 a 15:00.` };
      exercises.push({ exerciseId: e.exerciseId, name: e.name.trim(), sets: det.sets, reps: e.reps.trim(), rir: e.rir ?? null, restSec: e.restSec, note: e.note?.trim() || null, ...(det.detail ? { detail: det.detail } : {}) });
    }
    days.push({ name: dn, exercises });
  }
  return { ok: true, doc: { name, weeks: doc.weeks, note: (doc.note ?? "").trim(), days } };
}

/** Igualdad estructural (para no crear versiones vacías). */
export const sameDoc = (a: ProgramDoc, b: ProgramDoc) => JSON.stringify(a) === JSON.stringify(b);

/** Valor inicial de reps de una serie: el mínimo del rango prescripto. */
export const defaultRepsFor = (reps: string) => { const t = parseReps(reps); return t.kind === "reps" ? t.min : null; };
