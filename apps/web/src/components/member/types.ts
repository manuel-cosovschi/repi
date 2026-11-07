import {
  activityOf, activityValuesText, fmtSeconds, fmtWeight, isActivityProfile, isTimedRow, mainSets, parseDistance, parseReps, prescriptionText, repsDistance, repsText,
  type ActivityDetail, type ActivityProfile, type MetricsProfile, type SetMetrics, type WorkMetrics, type ExerciseChangeReason, type ExerciseDetail, type Suggestion, type WeightUnit,
} from "@repi/domain";
// `metrics` (ejercicios por tiempo): velocidad, inclinación, nivel… de la última vez en una actividad.
export type PrevSet = { weightKg: number | null; reps: number | null; metrics?: SetMetrics | null } | null;
// Ejercicios por tiempo: `profile` (cinta, bici, remo… o fuerza) y la actividad indicada (velocidad, inclinación, nivel…). Sin
// ellos (servidor anterior), se muestra como siempre.
export type TrainEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; prev: PrevSet; detail?: ExerciseDetail | null; suggest?: Suggestion | null;
  profile?: MetricsProfile | null; activity?: ActivityDetail | null };
export type Training = {
  userId: string; firstName: string; coach: { name: string; org: string } | null; today: string; week: string[]; weightUnit?: WeightUnit;
  ai?: boolean; // D184: la sugerencia de REPI está disponible en el servidor
  relation: { id: string; kind: "coach" | "gym"; name: string; org: string; orgId?: string } | null;
  relations: { id: string; kind: "coach" | "gym"; name: string; org: string; hasProgram: boolean }[];
  state: "no_program" | "scheduled" | "ready"; startsOn?: string; openSession: string | null; openSessionDay: string | null;
  stats: { weekDone: number; doneDates: string[]; volumeThisWeek: number; volumeLastWeek: number };
  program?: { name: string; weeks: number; note: string; version: number; nextDay: number; days: { id: string; name: string; exercises: TrainEx[] }[]; update?: ProgramUpdate };
};
/** F-CL-14: aviso de programa nuevo o actualizado. `key` cambia con cada versión. */
export type ProgramUpdate = { key: string; kind: "new" | "updated"; author: string | null; at: string; reason: string | null; hasPrevious: boolean };
export type SessionLog = { id: string; setIndex: number; exerciseId?: string; weightKg: number | null; reps: number | null; rir: number | null; note?: string | null; metrics?: SetMetrics | null };
export type SessionEx = TrainEx & { note: string | null; defaultWeight: number | null; defaultReps: number | null; logs: SessionLog[];
  change?: { kind: "skip" | "substitute"; reason: ExerciseChangeReason; substitute: { exerciseId: string; name: string; profile?: MetricsProfile | null } | null } | null };
export type Session = {
  id: string; dayName: string; status: "in_progress" | "paused" | "completed" | "abandoned"; note: string; rpe: number | null; sessionNote: string | null;
  startedAt: string; endedAt: string | null; activeMs: number; lastResumedAt: string | null; elapsedSec: number; exercises: SessionEx[];
};
export type Summary = Session & {
  exDone: number; exSkipped?: number; exTotal: number; setsDone: number; setsTotal: number; volumeKg: number;
  metrics?: WorkMetrics; // D183: series principales, etapas, aproximación, tonelaje y tiempo (metrics.ts)
  prs: { exercise: string; current: { weightKg: number; reps: number; e1rm: number }; previous: { weightKg: number; reps: number; e1rm: number }; previousAt: string | null }[];
};

/** Peso guardado (kg) en la unidad elegida (F-HX-23). */
export const kg = (w: number | null, unit: WeightUnit = "kg") => (w == null ? "peso corporal" : fmtWeight(w, unit));
/** La vez anterior. Una serie por tiempo (`timed`) dice su duración («40 s», «12 min») y, en una actividad, sus valores. */
export const prevTxt = (p: PrevSet, unit: WeightUnit = "kg", timed = false) => {
  if (!p) return "Sin registro previo";
  if (timed) return `${p.weightKg != null && p.weightKg > 0 ? `${kg(p.weightKg, unit)} × ` : ""}${p.reps != null ? activityLogTxt(p.reps, p.metrics) : activityValuesText(p.metrics) || "—"}`;
  return `${kg(p.weightKg, unit)} x ${p.reps ?? "—"} reps`;
};
/**
 * D183: «4 series» son las series principales (un drop set de 4 series con 2 drops no son 6). Una actividad (cinta, bici…) se lee
 * como la indicó el profe: «10 min · 5 km/h · incl. 3», sin series ni repeticiones. Un tiempo, en minutos y segundos.
 */
export const metaTxt = (e: { sets: number; reps: string; detail?: ExerciseDetail | null }) => {
  if (activityOf(e.detail)) return prescriptionText(e);
  const n = mainSets(e.detail, e.sets);
  const r = parseReps(e.reps);
  // Una distancia escrita como texto («500 m») no es un tiempo: se muestra tal cual.
  return `${n} ${n === 1 ? "serie" : "series"} · ${r.kind === "time" && parseDistance(e.reps) == null ? repsText(e.reps) : r.kind === "reps" ? `${e.reps} repeticiones` : e.reps}`;
};

// ── Ejercicios por tiempo ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Actividad con que se registra un ejercicio de la sesión (cinta, bici, remo…), o null si se registra como siempre (peso,
 * repeticiones o segundos). Con reemplazo, el perfil del ejercicio que se hace; sin él, el de la fila o el de la actividad del
 * profe. Sólo si la fila es por tiempo: una cinta vieja indicada como «3 × 10-12» se sigue registrando como antes.
 */
export function activityProfileOf(e: { reps: string; profile?: MetricsProfile | null; detail?: ExerciseDetail | null; change?: { kind: string; substitute?: { profile?: MetricsProfile | null } | null } | null }): ActivityProfile | null {
  const p = e.change?.kind === "substitute" ? e.change.substitute?.profile ?? null : e.profile ?? activityOf(e.detail)?.profile ?? null;
  return isActivityProfile(p) && isTimedRow(e) ? p : null;
}
/** Duración objetivo de una actividad en segundos (null si se indicó por distancia, como un remo de «500 m», o no es un tiempo). */
export function activityTargetSec(e: { reps: string; detail?: ExerciseDetail | null }, profile: ActivityProfile): number | null {
  if (repsDistance(profile, e.reps) != null) return null;
  const t = parseReps(e.reps);
  return t.kind === "time" ? t.seconds : null;
}
/** Lo registrado en una actividad: «12 min · 5,5 km/h · incl. 4». */
export const activityLogTxt = (sec: number | null | undefined, m?: SetMetrics | null) =>
  [sec != null && sec > 0 ? fmtSeconds(sec) : null, activityValuesText(m) || null].filter(Boolean).join(" · ") || "—";
/** Resumen de las series hechas de una actividad: «12 min · 5,5 km/h · incl. 4» o «3 × 5 min · nivel 8». */
export function activityDoneTxt(xs: { r: number | null; m?: SetMetrics | null }[]): string {
  if (!xs.length) return "";
  const durs = [...new Set(xs.map((x) => (x.r != null && x.r > 0 ? fmtSeconds(x.r) : null)).filter(Boolean))];
  const vals = [...new Set(xs.map((x) => activityValuesText(x.m)).filter(Boolean))];
  const head = durs.length ? `${xs.length > 1 ? `${xs.length} × ` : ""}${durs.join(" / ")}` : `${xs.length} ${xs.length === 1 ? "serie" : "series"}`;
  return [head, vals.length === 1 ? vals[0] : null].filter(Boolean).join(" · ");
}
