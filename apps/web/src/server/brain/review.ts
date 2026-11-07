// Cierre de una sesión con REPI (D209, contrato §6 «Cierre»; máster §7). Alimenta `sessionReview` del dominio con datos reales:
// lo previsto contra lo hecho, la sesión comparable anterior de cada ejercicio (antes de esta), las marcas contra toda la
// historia válida previa (detectMarks), lo omitido, los reemplazos y la propuesta prudente de Training Intelligence para la
// próxima. Sólo la persona dueña de la sesión la ve (un id ajeno responde 404, igual que uno inexistente).
//
// Excluye siempre las series anuladas, las aproximaciones y las etapas (drop, rest-pause, cluster) de las comparaciones y las
// marcas. Al leer el cierre de una sesión terminada deja el resultado en la memoria (outcome), idempotente: no duplica.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { epley1rm, exerciseRows, rowContext, type ExCtx, type ExerciseDetail, type SetKind } from "@repi/domain";
import { fmtArDate, sessionReview, type PriorMarks, type ReviewExercise, type ReviewSet, type SessionReview } from "@repi/domain/brain";
import { db, schema } from "@/db";
import { logError } from "../log";
import { AccessError } from "../access/util";
import { timedPeIds } from "../training/services";
import { historyRows, outlookFor } from "../training/intelligence";
import { getPrefs, requireAssistant } from "./prefs";
import { recordOutcome } from "./events";

const { workoutSession, setLog, programExercise, sessionExerciseChange, exercise, programVersion, program } = schema;
const ID_RE = /^[\w-]{1,64}$/;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese entrenamiento.", 404);
const MAIN: readonly string[] = ["work", "top", "failure", "amrap"];
const ids = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

export type ReviewView = {
  sessionId: string;
  status: "in_progress" | "paused" | "completed" | "abandoned";
  dayName: string;
  at: string;
  /** Lo que arma el dominio: texto, previstas/hechas, ejercicios, omitidos, adaptaciones, marcas, próxima y evidencia. */
  review: SessionReview;
};

type PrevRow = { exercise_id: string; at: Date | string; weight_kg: string | null; reps: number | null; rir: number | null; feel: string | null; set_kind: string | null; stage_index: number | null };
/** Por ejercicio y carga: las repeticiones máximas y, aparte, las máximas dentro de 1–12 (las únicas que sirven para el 1RM estimado). */
type PriorRow = { exercise_id: string; weight_kg: string | null; reps: number; reps_e1rm: number | null };

/**
 * El cierre de una sesión propia. Abierta: parcial (lo hecho hasta ahora), sin guardar nada. Terminada: completo y deja el
 * resultado en la memoria. Anulada: no se analiza (409).
 */
export async function sessionReviewFor(userId: string, sessionId: string, now = new Date()): Promise<ReviewView> {
  requireAssistant();
  if (typeof sessionId !== "string" || !ID_RE.test(sessionId)) throw NOT_FOUND();
  const [s] = await db.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  if (!s) throw NOT_FOUND();
  if (s.status === "voided") throw new AccessError("voided", "Ese entrenamiento está anulado: no lo analizo.", 409);

  const [pes, logs, changes, prefs, [pk]] = await Promise.all([
    db.select().from(programExercise).where(eq(programExercise.dayId, s.dayId)).orderBy(asc(programExercise.position)),
    db.select().from(setLog).where(eq(setLog.sessionId, s.id)).orderBy(asc(setLog.setIndex)),
    db.select({ c: sessionExerciseChange, name: exercise.name }).from(sessionExerciseChange)
      .leftJoin(exercise, eq(exercise.id, sessionExerciseChange.substituteExerciseId)).where(eq(sessionExerciseChange.sessionId, s.id)),
    getPrefs(userId),
    db.select({ kind: program.kind }).from(programVersion).innerJoin(program, eq(program.id, programVersion.programId)).where(eq(programVersion.id, s.versionId)),
  ]);
  // Ejercicios con series que quedaron de una versión anterior (la rutina cambió a mitad de sesión): también se cuentan.
  const extraIds = [...new Set(logs.map((l) => l.programExerciseId))].filter((id) => !pes.some((p) => p.id === id));
  const extra = extraIds.length ? await db.select().from(programExercise).where(inArray(programExercise.id, extraIds)) : [];
  const all = [...pes, ...extra];
  const timed = await timedPeIds(all.map((p) => p.id));

  // Lo que se hizo de cada fila del programa (el reemplazo, si lo hubo).
  const changeOf = new Map(changes.map((c) => [c.c.programExerciseId, c]));
  const doing = (pe: typeof programExercise.$inferSelect) => {
    const ch = changeOf.get(pe.id);
    return ch?.c.kind === "substitute" && ch.c.substituteExerciseId ? ch.c.substituteExerciseId : pe.exerciseId;
  };
  const exIds = [...new Set([...all.map(doing), ...logs.map((l) => l.exerciseId)])];
  const start = s.startedAt.toISOString();

  const [prevRows, priorRows, hist] = exIds.length ? await Promise.all([
    // Sesión comparable anterior de cada ejercicio: la última terminada que empezó antes que esta.
    db.execute<PrevRow>(sql`
      with prev as (
        select distinct on (sl.exercise_id) sl.exercise_id, sl.session_id, ws.ended_at
        from set_log sl join workout_session ws on ws.id = sl.session_id
        where ws.user_id = ${userId} and ws.status = 'completed' and ws.id <> ${s.id} and ws.started_at < ${start}::timestamptz
          and sl.voided_at is null and sl.exercise_id in (${ids(exIds)})
        order by sl.exercise_id, ws.ended_at desc)
      select p.exercise_id, p.ended_at as at, sl.weight_kg, sl.reps, sl.rir, sl.feel, sl.set_kind, sl.stage_index
      from prev p join set_log sl on sl.session_id = p.session_id and sl.exercise_id = p.exercise_id and sl.voided_at is null
      order by sl.set_index`).then((r) => r as unknown as PrevRow[]),
    // Mejores registros previos (toda la historia válida antes de esta sesión), por ejercicio y carga. El 1RM estimado sale de cada
    // serie válida de 1 a 12 repeticiones: una AMRAP de 14 a esa carga no tapa la serie de 10 (con más de 12, Epley no estima).
    db.execute<PriorRow>(sql`
      select sl.exercise_id, sl.weight_kg, max(sl.reps)::int as reps, (max(sl.reps) filter (where sl.reps between 1 and 12))::int as reps_e1rm
      from set_log sl join workout_session ws on ws.id = sl.session_id
      where ws.user_id = ${userId} and ws.status = 'completed' and ws.id <> ${s.id} and ws.started_at < ${start}::timestamptz
        and sl.voided_at is null and sl.reps > 0 and sl.exercise_id in (${ids(exIds)})
        and coalesce(sl.set_kind, 'work') in ('work', 'top', 'failure', 'amrap') and coalesce(sl.stage_index, 0) = 0
      group by sl.exercise_id, sl.weight_kg`).then((r) => r as unknown as PriorRow[]),
    historyRows(userId, exIds, { now }).catch((e) => { logError("brain.review.history", e); return new Map(); }),
  ]) : [[], [], new Map()];

  const coachOwned = pk?.kind !== "solo" && !!(s.coachClientId || s.gymMemberId);
  const exercises: ReviewExercise[] = [];
  for (const pe of all) {
    const mine = logs.filter((l) => l.programExerciseId === pe.id);
    const isExtra = extra.includes(pe);
    if (isExtra && !mine.length) continue;
    const ex: ExCtx & { detail: ExerciseDetail | null } = { sets: pe.sets, reps: pe.reps, rir: pe.rir, restSec: pe.restSec, detail: (pe.detail as ExerciseDetail | null) ?? null };
    const plannedMain = isExtra ? 0 : exerciseRows(ex).filter((r) => r.stage === 0 && MAIN.includes(r.kind)).length;
    const isTimed = timed.has(pe.id);
    const sets: ReviewSet[] = mine.map((l) => {
      const rc = l.setIndex < pe.sets ? rowContext(ex, l.setIndex) : null;
      return { w: l.weightKg == null ? null : Number(l.weightKg), r: l.reps, rir: l.rir, feel: l.feel, kind: (l.setKind as SetKind | null) ?? rc?.kind ?? "work",
        stage: l.stageIndex ?? rc?.stage ?? 0, timed: isTimed, voided: !!l.voidedAt };
    });
    const ch = changeOf.get(pe.id);
    const did = doing(pe);
    const prev = prevRows.filter((r) => r.exercise_id === did);
    const prior = priorRows.filter((r) => r.exercise_id === did);
    let before: PriorMarks | null = null;
    if (prior.length) {
      const pts = prior.map((p) => ({ w: p.weight_kg == null ? 0 : Number(p.weight_kg), r: p.reps, r12: p.reps_e1rm }));
      const loaded = pts.filter((p) => p.w > 0);
      before = {
        e1rm: Math.max(0, ...loaded.map((p) => (p.r12 == null ? 0 : epley1rm(p.w, p.r12) ?? 0))) || null,
        maxLoadKg: loaded.length ? Math.max(...loaded.map((p) => p.w)) : null,
        repsAtLoad: loaded.map((p) => ({ w: p.w, r: p.r })),
        bestReps: Math.max(...pts.map((p) => p.r)),
        bestSec: isTimed ? Math.max(...pts.map((p) => p.r)) : null,
      };
    }
    const outlook = (hist.get(did)?.length ?? 0) ? outlookFor(ex, hist.get(did)!, now, coachOwned) : null;
    exercises.push({
      exercise: { id: pe.id, name: pe.name, short: "" },
      measure: isTimed ? "time" : undefined,
      plannedMain,
      sets,
      skipped: ch?.c.kind === "skip",
      substitutedBy: ch?.c.kind === "substitute" && ch.c.substituteExerciseId ? { id: ch.c.substituteExerciseId, name: ch.name ?? pe.name, short: "" } : null,
      previous: prev.length ? { at: new Date(prev[0].at).toISOString(), sets: prev.map((r) => ({ w: r.weight_kg == null ? null : Number(r.weight_kg), r: r.reps, rir: r.rir, feel: r.feel, kind: (r.set_kind as SetKind | null) ?? "work", stage: r.stage_index ?? 0, timed: isTimed })) } : null,
      before,
      proposal: outlook?.proposal ?? null,
    });
  }

  const adaptations: string[] = [];
  if (changes.some((c) => c.c.kind === "skip" && c.c.reason === "no_time")) adaptations.push("acortaste la sesión por falta de tiempo");
  const at = (s.endedAt ?? now).toISOString();
  const review = sessionReview({ at, exercises, adaptations, rpe: s.rpe, tone: prefs.tone });

  if (s.status === "completed") {
    const marks = review.marks.filter((m) => !m.tie).length;
    await recordOutcome(userId, {
      key: `session_review:${s.id}`,
      value: { planned: review.planned, done: review.done, marks, skipped: review.skipped.length, fatigue: review.fatigue, next: review.next.kind },
      text: `Sesión del ${fmtArDate(at)}: completaste ${review.done} de ${review.planned} series${marks === 1 ? " y una marca" : marks > 1 ? ` y ${marks} marcas` : ""}.`,
      ref: { sessionId: s.id },
    }, now);
  }
  return { sessionId: s.id, status: s.status as ReviewView["status"], dayName: s.dayName, at, review };
}
