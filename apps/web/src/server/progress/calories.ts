// Calorías estimadas por entrenamiento (PP1, D199). Metodología en docs/PERSONAL_PROGRESS_BODY_TRACKING_1.md §Calorías y
// en `estimateCalories` (@repi/domain): MET del Compendium × peso corporal × tiempo activo, como rango. Se calcula al leer
// (no se guarda), con el peso registrado ese día o hasta 60 días antes: un peso cargado después no cambia una sesión pasada,
// así que el resultado es reproducible. Sin peso válido no se usa ninguno «por defecto»: se ofrece registrarlo.
// Sólo para su dueño (otra persona recibe 404). Nunca va a coach, gimnasio, Club, rankings ni notificaciones.
import { and, eq, isNull } from "drizzle-orm";
import { estimateCalories, localDate, weightAt } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { timedPeIds } from "../training/services";
import { isMinor, weightsUpTo } from "./body";

const { workoutSession, setLog, exercise } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese entrenamiento.", 404);
const WEIGHT_MAX_AGE_DAYS = 60;

export async function sessionCalories(userId: string, sessionId: string, now = new Date()) {
  const [s] = await db.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  if (!s) throw NOT_FOUND();
  if (s.status !== "completed" && s.status !== "voided") throw new AccessError("open", "El entrenamiento todavía no terminó.", 409);
  const day = localDate(s.endedAt ?? s.startedAt);
  const sets = await db.select({ l: setLog, group: exercise.muscleGroup }).from(setLog).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(eq(setLog.sessionId, s.id), isNull(setLog.voidedAt)));
  const flags = await timedPeIds(sets.map((x) => x.l.programExerciseId));
  // Cardio = series por tiempo de ejercicios del grupo «Cardio» (segundos registrados). El resto del tiempo activo, musculación.
  const cardioSec = sets.filter((x) => x.group === "Cardio" && (flags.flags?.(x.l.programExerciseId, x.l.setIndex).timed ?? flags.has(x.l.programExerciseId)))
    .reduce((a, x) => a + (x.l.reps ?? 0), 0);
  const [y, m, d] = day.split("-").map(Number);
  const since = new Date(Date.UTC(y, m - 1, d - WEIGHT_MAX_AGE_DAYS)).toISOString().slice(0, 10);
  const minor = await isMinor(userId, now);
  const w = minor ? null : weightAt(await weightsUpTo(userId, day, since), day, WEIGHT_MAX_AGE_DAYS);
  const est = estimateCalories({ activeSec: Math.floor(s.activeMs / 1000), cardioSec, bodyWeightG: w?.weightG ?? null, rpe: s.rpe, minor, voided: s.status === "voided" });
  return { sessionId: s.id, day, weight: w ? { day: w.day } : null, rpe: s.rpe, estimate: est };
}
