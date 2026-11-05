// D195 · Historial corregible (bloque 05/06). La persona abre una sesión terminada, corrige peso, repeticiones, RIR, sensación
// o nota de una serie, anula una serie o la sesión entera (reversible), las restaura y agrega una serie prescripta que olvidó
// registrar. Garantías:
// - Nunca hay DELETE: anular marca `voided_at` (serie) o el estado «voided» (sesión); restaurar lo deshace.
// - Cada cambio deja una fila append-only en training_correction (antes/después de lo que cambió, quién, cuándo, motivo) y un
//   audit_event sin valores. Un `requestId` repetido devuelve el mismo resultado (reintentos sin duplicar).
// - Concurrencia: la corrección trae la revisión que vio; si la serie cambió en otro dispositivo, 409 con los valores vigentes
//   (no se pisa nada). Un registro atrasado de otro teléfono contra una serie corregida queda como conflicto (logSet).
// - Derivados: récords, 1RM, volumen, niveles, rankings, metas, informes y Training Intelligence se calculan al leer desde las
//   series válidas (todos los lectores excluyen anuladas), así que una corrección los recalcula sola. Los objetivos de REPI ya
//   emitidos no se reescriben (son la evidencia de lo que se sugirió); los nuevos usan los datos corregidos.
// - Sólo la persona dueña corrige su historial. Coach y sala ven los resultados válidos y la marca «corregida»; no editan.
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import {
  cleanReason, correctionWarnings, diffValues, historyActions, rowFlags, rowRef, sessionMetrics, setTarget, validateCorrection, volumeKg, cleanSetNote,
  type CorrectableValues, type ExerciseDetail,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { sessionSummary, timedPeIds, toLogged } from "./services";

const { workoutSession, setLog, setSkip, trainingCorrection, programExercise, exercise, sessionExerciseChange } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese entrenamiento.", 404);
const REQ_RE = /^[0-9a-f-]{8,64}$/i;

type SetRow = typeof setLog.$inferSelect;
const valuesOf = (r: SetRow): CorrectableValues => ({ weightKg: r.weightKg == null ? null : Number(r.weightKg), reps: r.reps, rir: r.rir, feel: r.feel, note: r.note });
const setView = (r: SetRow) => ({ id: r.id, setIndex: r.setIndex, ...valuesOf(r), completedAt: r.completedAt, revision: r.revision, voidedAt: r.voidedAt, voidReason: r.voidReason });

async function ownSession(tx: Tx | typeof db, userId: string, sessionId: string, lock = false) {
  const q = tx.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  const [s] = lock ? await q.for("update") : await q;
  // Otra persona (aunque sea su coach o el gimnasio) recibe 404: no se revela si existe.
  if (!s) throw NOT_FOUND();
  return s;
}
function assertRequest(requestId: string) {
  if (!REQ_RE.test(requestId)) throw new AccessError("invalid", "Falta el identificador del pedido.");
}
/** Reintento del mismo pedido: devuelve lo que ya se aplicó. */
async function priorCorrection(tx: Tx, userId: string, requestId: string) {
  const [c] = await tx.select().from(trainingCorrection).where(and(eq(trainingCorrection.userId, userId), eq(trainingCorrection.requestId, requestId)));
  return c ?? null;
}
const editable = (s: typeof workoutSession.$inferSelect) => {
  if (s.status === "voided") throw new AccessError("voided", "Este entrenamiento está anulado. Restauralo para corregirlo.", 409);
  if (s.status !== "completed") throw new AccessError("open", "Este entrenamiento sigue abierto: corregilo desde la pantalla de entrenamiento.", 409);
};

// ── Lectura ─────────────────────────────────────────────────────────────────
/** Sesiones terminadas (activas) y anuladas, más recientes primero. `before` = cursor (fecha de fin) para paginar. */
export async function historyList(userId: string, o: { before?: string | null; limit?: number } = {}) {
  const lim = Math.min(Math.max(o.limit ?? 30, 1), 60);
  const before = o.before && !Number.isNaN(Date.parse(o.before)) ? new Date(o.before) : null;
  const sessions = await db.select().from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["completed", "voided"]), isNotNull(workoutSession.endedAt), before ? lt(workoutSession.endedAt, before) : undefined))
    .orderBy(desc(workoutSession.endedAt)).limit(lim + 1);
  const page = sessions.slice(0, lim);
  const ids = page.map((s) => s.id);
  const sets = ids.length ? await db.select().from(setLog).where(inArray(setLog.sessionId, ids)) : [];
  const timed = await timedPeIds(sets.map((x) => x.programExerciseId));
  const corrected = ids.length ? new Set((await db.selectDistinct({ s: trainingCorrection.sessionId }).from(trainingCorrection)
    .where(and(inArray(trainingCorrection.sessionId, ids), inArray(trainingCorrection.action, ["set_edit", "set_void", "set_add"])))).map((r) => r.s)) : new Set<string>();
  return {
    sessions: page.map((s) => {
      const valid = sets.filter((x) => x.sessionId === s.id && !x.voidedAt);
      const main = valid.filter((x) => { const f = timed.flags?.(x.programExerciseId, x.setIndex); return !f || (f.stage === 0 && !f.warmup); });
      return {
        id: s.id, dayName: s.dayName, startedAt: s.startedAt, endedAt: s.endedAt, durationSec: Math.floor(s.activeMs / 1000), status: s.status as "completed" | "voided",
        exercises: new Set(valid.map((x) => x.programExerciseId)).size, sets: main.length, volumeKg: volumeKg(valid.map((x) => toLogged(x, timed))), rpe: s.rpe,
        voidedAt: s.voidedAt, corrected: corrected.has(s.id), voidedSets: sets.filter((x) => x.sessionId === s.id && x.voidedAt).length,
      };
    }),
    next: sessions.length > lim ? page[page.length - 1].endedAt!.toISOString() : null,
  };
}

/**
 * Detalle de una sesión del historial: ejercicios con todas sus series registradas (también las anuladas, marcadas), etapas
 * omitidas, cambios de ejercicio, correcciones hechas, métricas y récords desde lo válido, y la comparación con la sesión
 * anterior del mismo día cuando existe.
 */
export async function historySession(userId: string, sessionId: string) {
  const s = await ownSession(db, userId, sessionId);
  if (s.status !== "completed" && s.status !== "voided") throw new AccessError("open", "Este entrenamiento sigue abierto.", 409);
  const all = await db.select().from(setLog).where(eq(setLog.sessionId, s.id)).orderBy(asc(setLog.setIndex));
  const peIds = [...new Set(all.map((l) => l.programExerciseId))];
  const dayExs = await db.select().from(programExercise).where(eq(programExercise.dayId, s.dayId)).orderBy(asc(programExercise.position));
  const extra = peIds.filter((id) => !dayExs.some((e) => e.id === id));
  const exs = [...dayExs, ...(extra.length ? await db.select().from(programExercise).where(inArray(programExercise.id, extra)) : [])];
  const names = new Map((all.length ? await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, [...new Set(all.map((l) => l.exerciseId))])) : []).map((r) => [r.id, r.name]));
  const changes = await db.select({ c: sessionExerciseChange, sub: exercise.name }).from(sessionExerciseChange).leftJoin(exercise, eq(exercise.id, sessionExerciseChange.substituteExerciseId))
    .where(eq(sessionExerciseChange.sessionId, s.id));
  const skips = await db.select().from(setSkip).where(and(eq(setSkip.sessionId, s.id), eq(setSkip.skipped, true)));
  const corrections = await db.select().from(trainingCorrection).where(eq(trainingCorrection.sessionId, s.id)).orderBy(desc(trainingCorrection.createdAt)).limit(100);
  const summary = s.status === "completed" ? await sessionSummary(userId, s.id).catch(() => null) : null;
  // Sesión anterior comparable: la última terminada del mismo día del programa, antes de esta.
  const [prevS] = await db.select({ id: workoutSession.id, endedAt: workoutSession.endedAt }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.dayId, s.dayId), eq(workoutSession.status, "completed"), ne(workoutSession.id, s.id), lt(workoutSession.startedAt, s.startedAt)))
    .orderBy(desc(workoutSession.startedAt)).limit(1);
  const prevSets = prevS ? await db.select().from(setLog).where(and(eq(setLog.sessionId, prevS.id), isNull(setLog.voidedAt))) : [];
  const prevPlan = await timedPeIds(prevSets.map((x) => x.programExerciseId));
  const best = (rows: SetRow[], plan: Awaited<ReturnType<typeof timedPeIds>>) => {
    const ok = rows.filter((r) => { const f = plan.flags?.(r.programExerciseId, r.setIndex); return !f || (!f.warmup && !f.timed && f.stage === 0); });
    return ok.reduce<SetRow | null>((b, r) => (!b || Number(r.weightKg ?? 0) > Number(b.weightKg ?? 0) || (Number(r.weightKg ?? 0) === Number(b.weightKg ?? 0) && (r.reps ?? 0) > (b.reps ?? 0)) ? r : b), null);
  };
  const plan = await timedPeIds(all.map((x) => x.programExerciseId));
  const outExs = exs.map((e) => {
    const detail = (e.detail as ExerciseDetail | null) ?? null;
    const mine = all.filter((l) => l.programExerciseId === e.id);
    const ch = changes.find((c) => c.c.programExerciseId === e.id);
    const doneEx = mine[0]?.exerciseId ?? ch?.c.substituteExerciseId ?? e.exerciseId;
    const prevBest = best(prevSets.filter((p) => p.exerciseId === doneEx), prevPlan);
    const curBest = best(mine.filter((m) => !m.voidedAt), plan);
    const rows = Array.from({ length: e.sets }, (_, i) => {
      const t = setTarget({ sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, detail }, i);
      const f = rowFlags({ sets: e.sets, reps: e.reps, detail }, i);
      const log = mine.find((l) => l.setIndex === i) ?? null;
      return {
        setIndex: i, label: t.label, kind: f.kind, block: f.block, stage: f.stage, timed: f.timed, warmup: f.warmup,
        planned: { reps: t.reps, weightKg: t.weightKg },
        log: log ? { ...setView(log), corrected: corrections.some((c) => c.setLogId === log.id && c.action === "set_edit"), added: corrections.some((c) => c.setLogId === log.id && c.action === "set_add") } : null,
        skipped: !log && skips.some((k) => k.programExerciseId === e.id && k.setIndex === i),
      };
    });
    return {
      id: e.id, exerciseId: e.exerciseId, name: e.name, doneName: names.get(doneEx) ?? e.name, sets: e.sets, reps: e.reps, detail,
      change: ch ? { kind: ch.c.kind, reason: ch.c.reason, substitute: ch.sub } : null,
      rows, compare: prevBest && curBest ? {
        previous: { weightKg: prevBest.weightKg == null ? null : Number(prevBest.weightKg), reps: prevBest.reps },
        current: { weightKg: curBest.weightKg == null ? null : Number(curBest.weightKg), reps: curBest.reps },
      } : null,
    };
  }).filter((e) => e.rows.some((r) => r.log || r.skipped) || e.change);
  const valid = all.filter((l) => !l.voidedAt);
  const metrics = sessionMetrics(exs.map((e) => ({ ex: { sets: e.sets, reps: e.reps, detail: (e.detail as ExerciseDetail | null) ?? null }, logs: valid.filter((l) => l.programExerciseId === e.id).map((l) => ({ setIndex: l.setIndex, weightKg: l.weightKg == null ? null : Number(l.weightKg), reps: l.reps })) })));
  return {
    id: s.id, dayName: s.dayName, status: s.status as "completed" | "voided", startedAt: s.startedAt, endedAt: s.endedAt, durationSec: Math.floor(s.activeMs / 1000), rpe: s.rpe, note: s.note,
    revision: s.revision, voidedAt: s.voidedAt, voidReason: s.voidReason, actions: historyActions(s.status),
    metrics: { sets: metrics.mainDone + metrics.warmupDone, stages: metrics.stagesDone, reps: metrics.reps, volumeKg: metrics.tonnageKg },
    prs: summary?.prs ?? [],
    exercises: outExs,
    previous: prevS ? { id: prevS.id, endedAt: prevS.endedAt } : null,
    corrections: corrections.map((c) => ({ id: c.id, action: c.action, setLogId: c.setLogId, before: c.before, after: c.after, reason: c.reason, at: c.createdAt, byOwner: c.actorUserId === userId })),
  };
}

// ── Escritura ───────────────────────────────────────────────────────────────
type CorrectInput = { requestId: string; baseRevision: number; values: Partial<CorrectableValues>; reason?: string | null; confirm?: boolean };

/** Corrige los valores de una serie registrada (peso, repeticiones, RIR, sensación, nota). */
export async function correctSet(userId: string, sessionId: string, setLogId: string, p: CorrectInput, now = new Date()) {
  assertRequest(p.requestId);
  return db.transaction(async (tx) => {
    const done = await priorCorrection(tx, userId, p.requestId);
    const s = await ownSession(tx, userId, sessionId, true);
    const [row] = await tx.select().from(setLog).where(and(eq(setLog.id, setLogId), eq(setLog.sessionId, s.id))).for("update");
    if (!row) throw NOT_FOUND();
    if (done) return { status: "ok" as const, set: setView(row), repeated: true };
    editable(s);
    if (row.voidedAt) throw new AccessError("set_voided", "Esta serie está anulada. Restaurala para corregirla.", 409);
    if (row.revision !== p.baseRevision) {
      throw new AccessError("correction_conflict", "Esta serie cambió en otro dispositivo mientras la corregías. Revisá los valores actuales antes de guardar.", 409, { current: setView(row) });
    }
    const [pe] = await tx.select().from(programExercise).where(eq(programExercise.id, row.programExerciseId));
    const f = pe ? rowFlags({ sets: pe.sets, reps: pe.reps, detail: pe.detail as ExerciseDetail | null }, row.setIndex) : null;
    const values = { ...p.values, ...("note" in p.values ? { note: cleanSetNote(p.values.note) } : {}) };
    const before = valuesOf(row);
    const next = { ...before, ...values };
    const reason = cleanReason(p.reason);
    const errors = validateCorrection(next, { timed: !!f && (f.timed || !!f.durationSec), reason });
    if (errors.length) throw new AccessError("invalid", errors[0].message, 400, { errors });
    const diff = diffValues(before, values);
    if (!diff) return { status: "ok" as const, set: setView(row), repeated: false, unchanged: true };
    const warnings = correctionWarnings(before, values);
    if (warnings.length && !p.confirm) throw new AccessError("confirm_required", "Es un cambio grande respecto de lo registrado. Confirmalo para guardarlo.", 409, { warnings });
    const [u] = await tx.update(setLog).set({
      weightKg: next.weightKg == null ? null : String(next.weightKg), reps: next.reps, rir: next.rir, feel: next.feel, note: next.note, revision: row.revision + 1, updatedAt: now,
    }).where(eq(setLog.id, row.id)).returning();
    await tx.insert(trainingCorrection).values({ userId, sessionId: s.id, setLogId: row.id, actorUserId: userId, action: "set_edit", before: diff.before, after: diff.after, reason, requestId: p.requestId, baseRevision: row.revision, createdAt: now });
    await tx.update(workoutSession).set({ updatedAt: now }).where(eq(workoutSession.id, s.id));
    await audit(tx, { actorUserId: userId, action: "history.set_corrected", resourceType: "set_log", resourceId: row.id, meta: { fields: Object.keys(diff.after) } });
    return { status: "ok" as const, set: setView(u), repeated: false };
  }).then(async (r) => { await afterHistoryChange(userId); return r; });
}

/** Anula (o restaura) una serie registrada por error. La fila se conserva: deja de contar en todo. */
export async function setVoided(userId: string, sessionId: string, setLogId: string, p: { requestId: string; voided: boolean; reason?: string | null }, now = new Date()) {
  assertRequest(p.requestId);
  return db.transaction(async (tx) => {
    const done = await priorCorrection(tx, userId, p.requestId);
    const s = await ownSession(tx, userId, sessionId, true);
    const [row] = await tx.select().from(setLog).where(and(eq(setLog.id, setLogId), eq(setLog.sessionId, s.id))).for("update");
    if (!row) throw NOT_FOUND();
    if (done) return { status: "ok" as const, set: setView(row), repeated: true };
    editable(s);
    if (!!row.voidedAt === p.voided) return { status: "ok" as const, set: setView(row), repeated: false, unchanged: true };
    const reason = cleanReason(p.reason);
    const [u] = await tx.update(setLog).set(p.voided ? { voidedAt: now, voidedBy: userId, voidReason: reason, revision: row.revision + 1, updatedAt: now } : { voidedAt: null, voidedBy: null, voidReason: null, revision: row.revision + 1, updatedAt: now })
      .where(eq(setLog.id, row.id)).returning();
    await tx.insert(trainingCorrection).values({ userId, sessionId: s.id, setLogId: row.id, actorUserId: userId, action: p.voided ? "set_void" : "set_restore",
      before: { voided: !!row.voidedAt }, after: { voided: p.voided }, reason, requestId: p.requestId, baseRevision: row.revision, createdAt: now });
    await tx.update(workoutSession).set({ updatedAt: now }).where(eq(workoutSession.id, s.id));
    await audit(tx, { actorUserId: userId, action: p.voided ? "history.set_voided" : "history.set_restored", resourceType: "set_log", resourceId: row.id });
    return { status: "ok" as const, set: setView(u), repeated: false };
  }).then(async (r) => { await afterHistoryChange(userId); return r; });
}

/**
 * Agrega una serie que se hizo pero no se registró. Sólo una fila que existe en la versión congelada de ESA sesión (ejercicio
 * del día y número de serie prescriptos) y que no tiene registro: no se pueden inventar ejercicios ni series fuera del plan.
 * La hora es la del cierre de la sesión (no hay una hora real) y la serie queda marcada como agregada después.
 */
export async function addMissingSet(userId: string, sessionId: string, p: { requestId: string; programExerciseId: string; setIndex: number; values: Partial<CorrectableValues>; reason?: string | null; confirm?: boolean }, now = new Date()) {
  assertRequest(p.requestId);
  return db.transaction(async (tx) => {
    const done = await priorCorrection(tx, userId, p.requestId);
    const s = await ownSession(tx, userId, sessionId, true);
    if (done) {
      const [row] = done.setLogId ? await tx.select().from(setLog).where(eq(setLog.id, done.setLogId)) : [];
      return { status: "ok" as const, set: row ? setView(row) : null, repeated: true };
    }
    editable(s);
    const [pe] = await tx.select().from(programExercise).where(and(eq(programExercise.id, p.programExerciseId), eq(programExercise.dayId, s.dayId)));
    if (!pe) throw new AccessError("invalid", "Ese ejercicio no es parte de la rutina de ese día.");
    if (!Number.isInteger(p.setIndex) || p.setIndex < 0 || p.setIndex >= pe.sets) throw new AccessError("invalid", "Esa serie no estaba prescripta.");
    const [exists] = await tx.select({ id: setLog.id }).from(setLog).where(and(eq(setLog.sessionId, s.id), eq(setLog.programExerciseId, pe.id), eq(setLog.setIndex, p.setIndex)));
    if (exists) throw new AccessError("exists", "Esa serie ya está registrada: corregila en lugar de agregarla.", 409);
    const detail = pe.detail as ExerciseDetail | null;
    const f = rowFlags({ sets: pe.sets, reps: pe.reps, detail }, p.setIndex);
    const v: CorrectableValues = { weightKg: p.values.weightKg ?? null, reps: p.values.reps ?? null, rir: p.values.rir ?? null, feel: p.values.feel ?? null, note: cleanSetNote(p.values.note) };
    const reason = cleanReason(p.reason);
    if (v.reps == null) throw new AccessError("invalid", f.timed ? "Indicá los segundos que hiciste." : "Indicá las repeticiones que hiciste.");
    const errors = validateCorrection(v, { timed: f.timed || !!f.durationSec, reason });
    if (errors.length) throw new AccessError("invalid", errors[0].message, 400, { errors });
    const [chg] = await tx.select({ sub: sessionExerciseChange.substituteExerciseId, kind: sessionExerciseChange.kind }).from(sessionExerciseChange)
      .where(and(eq(sessionExerciseChange.sessionId, s.id), eq(sessionExerciseChange.programExerciseId, pe.id)));
    const { randomUUID } = await import("node:crypto");
    const t = setTarget({ sets: pe.sets, reps: pe.reps, rir: pe.rir, restSec: pe.restSec, detail }, p.setIndex);
    const ref = rowRef(detail, pe.sets, p.setIndex);
    const [row] = await tx.insert(setLog).values({
      id: randomUUID(), sessionId: s.id, programExerciseId: pe.id, exerciseId: chg?.kind === "substitute" && chg.sub ? chg.sub : pe.exerciseId, setIndex: p.setIndex,
      weightKg: v.weightKg == null ? null : String(v.weightKg), reps: v.reps, rir: v.rir, feel: v.feel, note: v.note, completedAt: s.endedAt ?? now,
      specId: ref?.id ?? null, setKind: ref?.kind ?? t.kind, blockIndex: ref?.block ?? f.block, stageIndex: ref?.stage ?? f.stage,
    }).returning();
    // Si esa etapa figuraba omitida, el registro manda (D184): la omisión queda deshecha.
    await tx.update(setSkip).set({ skipped: false, changedAt: now, updatedAt: now }).where(and(eq(setSkip.sessionId, s.id), eq(setSkip.programExerciseId, pe.id), eq(setSkip.setIndex, p.setIndex)));
    await tx.insert(trainingCorrection).values({ userId, sessionId: s.id, setLogId: row.id, actorUserId: userId, action: "set_add", before: {}, after: { ...v, note: v.note ? true : null }, reason, requestId: p.requestId, createdAt: now });
    await tx.update(workoutSession).set({ updatedAt: now }).where(eq(workoutSession.id, s.id));
    await audit(tx, { actorUserId: userId, action: "history.set_added", resourceType: "set_log", resourceId: row.id });
    return { status: "ok" as const, set: setView(row), repeated: false };
  }).then(async (r) => { await afterHistoryChange(userId); return r; });
}

/**
 * Anula (o restaura) una sesión terminada entera. No borra series ni sesiones: la sesión pasa a «voided» y sale del historial
 * activo, del progreso, de los récords y de Training Intelligence; restaurar la devuelve a «completed» tal como estaba.
 */
export async function sessionVoided(userId: string, sessionId: string, p: { requestId: string; voided: boolean; reason?: string | null; baseRevision?: number }, now = new Date()) {
  assertRequest(p.requestId);
  return db.transaction(async (tx) => {
    const done = await priorCorrection(tx, userId, p.requestId);
    const s = await ownSession(tx, userId, sessionId, true);
    if (done) return { status: s.status, revision: s.revision, repeated: true };
    if (p.voided ? s.status === "voided" : s.status === "completed") return { status: s.status, revision: s.revision, repeated: false, unchanged: true };
    if (p.voided && s.status !== "completed") throw new AccessError("open", "Sólo se puede anular un entrenamiento terminado.", 409);
    if (!p.voided && s.status !== "voided") throw new AccessError("invalid", "Este entrenamiento no está anulado.", 409);
    if (p.baseRevision != null && p.baseRevision !== s.revision) throw new AccessError("correction_conflict", "El entrenamiento cambió en otro dispositivo. Volvé a abrirlo antes de seguir.", 409);
    const reason = cleanReason(p.reason);
    const status = p.voided ? "voided" as const : "completed" as const;
    await tx.update(workoutSession).set(p.voided ? { status, voidedAt: now, voidedBy: userId, voidReason: reason, revision: s.revision + 1, updatedAt: now } : { status, voidedAt: null, voidedBy: null, voidReason: null, revision: s.revision + 1, updatedAt: now })
      .where(eq(workoutSession.id, s.id));
    await tx.insert(trainingCorrection).values({ userId, sessionId: s.id, actorUserId: userId, action: p.voided ? "session_void" : "session_restore",
      before: { status: s.status }, after: { status }, reason, requestId: p.requestId, baseRevision: s.revision, createdAt: now });
    await audit(tx, { actorUserId: userId, action: p.voided ? "history.session_voided" : "history.session_restored", resourceType: "workout_session", resourceId: s.id });
    return { status, revision: s.revision + 1, repeated: false };
  }).then(async (r) => { await afterHistoryChange(userId); return r; });
}

/**
 * Después de una corrección. Lo derivado se calcula al leer, así que no hay nada que recalcular en bloque (ni un recálculo
 * ilimitado). Sólo se revisan los trofeos: si con los datos corregidos se alcanza uno nuevo, se otorga. Un trofeo ya otorgado
 * no se revoca (política D195: reconocimiento histórico; un dato anulado no genera trofeos ni récords nuevos).
 */
async function afterHistoryChange(userId: string) {
  try {
    const lv = await import("../community/levels");
    await lv.syncTrophies(userId, await lv.levelStats(userId));
  } catch { /* los trofeos nunca frenan una corrección */ }
}

/** Marca «corregida» para quien ve las sesiones de otra persona con permiso (coach, sala): ids de series con correcciones. */
export async function correctedSetIds(sessionIds: string[]) {
  if (!sessionIds.length) return new Set<string>();
  const rows = await db.selectDistinct({ id: trainingCorrection.setLogId }).from(trainingCorrection)
    .where(and(inArray(trainingCorrection.sessionId, sessionIds), inArray(trainingCorrection.action, ["set_edit", "set_add"]), sql`${trainingCorrection.setLogId} is not null`));
  return new Set(rows.map((r) => r.id!));
}
