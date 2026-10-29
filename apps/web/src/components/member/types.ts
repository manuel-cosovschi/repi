import { fmtWeight, type ExerciseChangeReason, type ExerciseDetail, type WeightUnit } from "@repi/domain";
export type PrevSet = { weightKg: number | null; reps: number | null } | null;
export type TrainEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; prev: PrevSet; detail?: ExerciseDetail | null };
export type Training = {
  userId: string; firstName: string; coach: { name: string; org: string } | null; today: string; week: string[]; weightUnit?: WeightUnit;
  relation: { id: string; kind: "coach" | "gym"; name: string; org: string; orgId?: string } | null;
  relations: { id: string; kind: "coach" | "gym"; name: string; org: string; hasProgram: boolean }[];
  state: "no_program" | "scheduled" | "ready"; startsOn?: string; openSession: string | null; openSessionDay: string | null;
  stats: { weekDone: number; doneDates: string[]; volumeThisWeek: number; volumeLastWeek: number };
  program?: { name: string; weeks: number; note: string; version: number; nextDay: number; days: { id: string; name: string; exercises: TrainEx[] }[]; update?: ProgramUpdate };
};
/** F-CL-14: aviso de programa nuevo o actualizado. `key` cambia con cada versión. */
export type ProgramUpdate = { key: string; kind: "new" | "updated"; author: string | null; at: string; reason: string | null; hasPrevious: boolean };
export type SessionLog = { id: string; setIndex: number; exerciseId?: string; weightKg: number | null; reps: number | null; rir: number | null; note?: string | null };
export type SessionEx = TrainEx & { note: string | null; defaultWeight: number | null; defaultReps: number | null; logs: SessionLog[];
  change?: { kind: "skip" | "substitute"; reason: ExerciseChangeReason; substitute: { exerciseId: string; name: string } | null } | null };
export type Session = {
  id: string; dayName: string; status: "in_progress" | "paused" | "completed" | "abandoned"; note: string; rpe: number | null; sessionNote: string | null;
  startedAt: string; endedAt: string | null; activeMs: number; lastResumedAt: string | null; elapsedSec: number; exercises: SessionEx[];
};
export type Summary = Session & {
  exDone: number; exSkipped?: number; exTotal: number; setsDone: number; setsTotal: number; volumeKg: number;
  prs: { exercise: string; current: { weightKg: number; reps: number; e1rm: number }; previous: { weightKg: number; reps: number; e1rm: number }; previousAt: string | null }[];
};

/** Peso guardado (kg) en la unidad elegida (F-HX-23). */
export const kg = (w: number | null, unit: WeightUnit = "kg") => (w == null ? "peso corporal" : fmtWeight(w, unit));
export const prevTxt = (p: PrevSet, unit: WeightUnit = "kg") => (p ? `${kg(p.weightKg, unit)} x ${p.reps ?? "—"} reps` : "Sin registro previo");
export const metaTxt = (e: { sets: number; reps: string }) => `${e.sets} ${e.sets === 1 ? "serie" : "series"} · ${e.reps}${/^\d/.test(e.reps) && !/s$/.test(e.reps) ? " repeticiones" : ""}`;
