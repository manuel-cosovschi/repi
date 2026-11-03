// D183: métricas de entrenamiento con una sola definición (antes cada pantalla contaba distinto: calentamientos, drops y
// mini series sumaban como series; los niveles multiplicaban kilos por segundos). Funciones puras, usadas por el resumen de
// la sesión (servidor y teléfono), el historial, el rendimiento del coach, los informes y los niveles.
//
// Definiciones (ninguna es un indicador de hipertrofia ni una equivalencia fisiológica):
//  · Series principales programadas: bloques del plan que no son de aproximación (un drop set de 1 serie + 2 drops es 1).
//  · Series principales hechas: de esas, las que tienen al menos una fila registrada (omitir un drop no «pierde» la serie).
//  · Aproximación: bloques de calentamiento; se informan aparte y no suman a reps, tonelaje ni récords.
//  · Etapas: drops, mini series y bloques de cluster conectados (programadas y hechas, aparte de las series).
//  · Repeticiones: Σ reps de las filas hechas, sin aproximación, sin series por tiempo y sin AMRAP contado en rondas.
//  · Tonelaje (volumen de carga): Σ peso × reps de esas mismas filas (incluye etapas: son kilos levantados de verdad).
//    En ejercicios unilaterales las reps son por lado y no se duplican.
//  · Tiempo: segundos de las series por tiempo y la duración de los AMRAP por tiempo hechos. Nunca se multiplica por kilos.
//  · Rondas: las de los AMRAP por tiempo contados en rondas.
import type { ExerciseDetail, SetKind } from "./prescription";
import { normalizePlan, planBlocks } from "./stages";
import { parseReps } from "./training";

export type RowFlags = { kind: SetKind; block: number; stage: number; timed: boolean; warmup: boolean; rounds: boolean; durationSec: number | null };
type Ex = { sets: number; reps: string; detail?: ExerciseDetail | null };

/** Qué es la fila `i` para las métricas (según el plan de la versión con que se registró). */
export function rowFlags(e: Ex, i: number): RowFlags {
  const { rows } = normalizePlan(e.detail?.setPlan);
  const r = rows[i];
  const reps = r?.reps ?? e.reps;
  const kind: SetKind = r?.kind ?? "work";
  const durationSec = kind === "amrap" ? r?.durationSec ?? null : null;
  const timed = !durationSec && parseReps(reps).kind === "time";
  const blocks = r ? null : planBlocks(e.detail, e.sets);
  return { kind, block: r?.block ?? blocks?.[i]?.index ?? i, stage: r?.stage ?? 0, timed, warmup: kind === "warmup", rounds: !!durationSec && (r?.countUnit ?? "rounds") === "rounds", durationSec };
}

export type WorkMetrics = {
  mainPlanned: number; mainDone: number; warmupPlanned: number; warmupDone: number; stagesPlanned: number; stagesDone: number;
  rowsDone: number; reps: number; tonnageKg: number; timeSec: number; rounds: number;
};
export const EMPTY_METRICS: WorkMetrics = { mainPlanned: 0, mainDone: 0, warmupPlanned: 0, warmupDone: 0, stagesPlanned: 0, stagesDone: 0, rowsDone: 0, reps: 0, tonnageKg: 0, timeSec: 0, rounds: 0 };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Métricas de un ejercicio con las filas registradas (`setIndex`, peso y reps o segundos o rondas). */
export function exerciseMetrics(e: Ex, logs: { setIndex: number; weightKg: number | null; reps: number | null }[]): WorkMetrics {
  const m = { ...EMPTY_METRICS };
  const done = new Map(logs.map((l) => [l.setIndex, l]));
  for (const b of planBlocks(e.detail, e.sets)) {
    const warm = b.kind === "warmup";
    const any = b.rows.some((k) => done.has(k));
    if (warm) { m.warmupPlanned++; if (any) m.warmupDone++; } else { m.mainPlanned++; if (any) m.mainDone++; }
    m.stagesPlanned += b.stages;
    m.stagesDone += b.rows.slice(1).filter((k) => done.has(k)).length;
  }
  for (const l of logs) {
    const f = rowFlags(e, l.setIndex);
    m.rowsDone++;
    if (f.warmup) continue;
    if (f.durationSec) { m.timeSec += f.durationSec; if (f.rounds) { m.rounds += l.reps ?? 0; continue; } }
    if (f.timed) { m.timeSec += l.reps ?? 0; continue; }
    m.reps += l.reps ?? 0;
    if (l.weightKg && l.reps) m.tonnageKg += l.weightKg * l.reps;
  }
  m.tonnageKg = r1(m.tonnageKg);
  return m;
}

export function addMetrics(a: WorkMetrics, b: WorkMetrics): WorkMetrics {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof WorkMetrics)[]) out[k] = a[k] + b[k];
  out.tonnageKg = r1(out.tonnageKg);
  return out;
}

/** Métricas de una sesión: suma de sus ejercicios. */
export const sessionMetrics = (exs: { ex: Ex; logs: { setIndex: number; weightKg: number | null; reps: number | null }[] }[]) =>
  exs.reduce((acc, x) => addMetrics(acc, exerciseMetrics(x.ex, x.logs)), { ...EMPTY_METRICS });

/** Un ejercicio está completo cuando todas sus series principales tienen registro (las etapas omitidas no lo impiden). */
export const exerciseComplete = (e: Ex, done: (k: number) => boolean) =>
  planBlocks(e.detail, e.sets).every((b) => b.rows.some(done));
