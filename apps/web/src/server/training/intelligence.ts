// D191 · Training Intelligence 2.0 en el servidor. Persistencia de objetivos por fila (training_target), ajuste después de
// cada serie y propuestas para el coach (training_proposal). Las reglas están en @repi/domain (intelligence.ts) y son las
// mismas que usa el teléfono sin conexión: este módulo sólo busca los datos, guarda lo emitido y controla permisos.
//
// Garantías: nunca escribe en set_log ni en el programa; un objetivo emitido no se reescribe (se reemplaza con seq + 1 y
// queda trazado); una falla acá nunca impide registrar una serie (quien llama la atrapa); no llama a ningún LLM.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  TI_VERSION, TI_WINDOW, adjustAfterSet, loadIncrement, decisionFor, exerciseKey, exerciseTrend, nextProposal, recommendExercise, rowContext, rowRef, sessionPoints, setTarget,
  type ExCtx, type ExerciseDetail, type HistRow, type IntelEvent, type Proposal, type RowTarget, type SetKind, type Trend,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireClientOf, requireCoach, readVersion, trainingSignals, type Signals } from "./services";

const { trainingTarget, trainingProposal, setLog, workoutSession, programExercise, programAssignment, program, historyEntry, sessionExerciseChange, coachClient } = schema;
type TargetRow = typeof trainingTarget.$inferSelect;

// ── Historial comparable (una consulta, acotada por ventana) ───────────────
const ids = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
type RawHist = { id: string; exercise_id: string; session_id: string; set_index: number; weight_kg: string | null; reps: number | null; rir: number | null; feel: string | null;
  spec_id: string | null; set_kind: string | null; stage_index: number | null; at: Date | string; pe_reps: string; pe_sets: number; pe_detail: ExerciseDetail | null };

/**
 * Filas registradas de las últimas `TI_WINDOW.sessions` sesiones terminadas de cada ejercicio (en `TI_WINDOW.days` días), más el
 * historial importado (hasta `importDays`, deduplicado por día y serie). Con `coachClientId`, sólo lo entrenado con ese coach.
 */
export async function historyRows(userId: string, exerciseIds: string[], o: { excludeSessionId?: string; coachClientId?: string; gymMemberId?: string; now?: Date; imports?: boolean } = {}) {
  const out = new Map<string, HistRow[]>();
  const list = [...new Set(exerciseIds)].slice(0, 80);
  if (!list.length) return out;
  const now = o.now ?? new Date();
  const since = new Date(now.getTime() - TI_WINDOW.days * 86_400_000);
  const rows = (await db.execute<RawHist>(sql`
    with ranked as (
      select sl.exercise_id, sl.session_id, max(sl.completed_at) as at,
        row_number() over (partition by sl.exercise_id order by max(sl.completed_at) desc) as rk
      from set_log sl join workout_session ws on ws.id = sl.session_id
      where ws.user_id = ${userId} and ws.status = 'completed' and sl.exercise_id in (${ids(list)}) and sl.completed_at >= ${since.toISOString()}::timestamptz
        ${o.excludeSessionId ? sql`and ws.id <> ${o.excludeSessionId}` : sql``}
        ${o.coachClientId ? sql`and ws.coach_client_id = ${o.coachClientId}` : sql``}
        ${o.gymMemberId ? sql`and ws.gym_member_id = ${o.gymMemberId}` : sql``}
      group by sl.exercise_id, sl.session_id)
    select sl.id, sl.exercise_id, sl.session_id, sl.set_index, sl.weight_kg, sl.reps, sl.rir, sl.feel, sl.spec_id, sl.set_kind, sl.stage_index, r.at,
      pe.reps as pe_reps, pe.sets as pe_sets, pe.detail as pe_detail
    from ranked r join set_log sl on sl.session_id = r.session_id and sl.exercise_id = r.exercise_id
    join program_exercise pe on pe.id = sl.program_exercise_id
    where r.rk <= ${TI_WINDOW.sessions}
    order by r.at desc, sl.set_index`)) as unknown as RawHist[];
  for (const x of rows) {
    // D183: tipo y etapa guardados al registrar; en registros anteriores, los de la versión congelada (sin inventar).
    const ref = rowRef(x.pe_detail, x.pe_sets, x.set_index);
    const t = setTarget({ sets: x.pe_sets, reps: x.pe_reps, rir: null, restSec: 0, detail: x.pe_detail }, x.set_index);
    const h: HistRow = {
      sessionId: x.session_id, at: new Date(x.at).toISOString(), setLogId: x.id, specId: x.spec_id ?? ref?.id ?? null, kind: ((x.set_kind as SetKind | null) ?? ref?.kind ?? "work"),
      stage: x.stage_index ?? ref?.stage ?? 0, reps: t.reps, durationSec: t.durationSec, w: x.weight_kg == null ? null : Number(x.weight_kg), r: x.reps, rir: x.rir, feel: x.feel,
      unilateral: !!x.pe_detail?.unilateral, source: "repi",
    };
    out.set(x.exercise_id, [...(out.get(x.exercise_id) ?? []), h]);
  }
  if (o.imports !== false && !o.coachClientId && !o.gymMemberId) {
    // D132: el historial importado es del alumno; sólo cuenta para sus propios objetivos (nunca en la vista del coach ni de la sede).
    const iSince = new Date(now.getTime() - TI_WINDOW.importDays * 86_400_000).toISOString().slice(0, 10);
    const imp = await db.select({ ex: historyEntry.exerciseId, day: historyEntry.day, i: historyEntry.setIndex, w: historyEntry.weightKg, r: historyEntry.reps, s: historyEntry.seconds })
      .from(historyEntry).where(and(eq(historyEntry.userId, userId), inArray(historyEntry.exerciseId, list), sql`${historyEntry.day} >= ${iSince}`))
      .orderBy(asc(historyEntry.day)).limit(2000);
    const seen = new Set<string>();
    for (const x of imp) {
      if (!x.ex || x.s != null) continue; // series por tiempo importadas: sin tipo de serie confiable, no se usan
      const key = `${x.ex}:${x.day}:${x.i}`;
      if (seen.has(key)) continue; // la misma serie importada dos veces no se duplica
      seen.add(key);
      out.set(x.ex, [...(out.get(x.ex) ?? []), { sessionId: `import:${x.day}`, at: new Date(`${x.day}T12:00:00-03:00`).toISOString(), setLogId: null, specId: null, kind: null, stage: null, reps: null,
        w: x.w == null ? null : Number(x.w), r: x.r, rir: null, feel: null, source: "import" }]);
    }
  }
  return out;
}

const safety = (sig: Signals | null, name: string) => (sig ? { painExercise: sig.painNames.has(exerciseKey(name)), painOrInjury: sig.painOrInjury, lowReadiness: sig.lowReadiness } : undefined);

// ── Objetivos persistidos ──────────────────────────────────────────────────
export type TargetOut = RowTarget & { id: string; seq: number; decision: string | null };
const toOut = (r: TargetRow): TargetOut => ({
  id: r.id, seq: r.seq, decision: r.decision, setIndex: r.setIndex, specId: r.specId ?? `r${r.setIndex}`, kind: r.setKind as SetKind, block: r.blockIndex, stage: r.stageIndex,
  status: r.status, action: r.action as RowTarget["action"], source: r.source, quality: r.quality, weightKg: r.weightKg == null ? null : Number(r.weightKg),
  repsMin: r.repsMin, repsMax: r.repsMax, repsTarget: r.repsTarget, rirTarget: r.rirTarget, rpeTarget: r.rpeTarget, restSec: r.restSec, restSuggestSec: r.restSuggestSec,
  pending: r.pending, guards: r.detail.guards as RowTarget["guards"], reasons: r.detail.reasons, text: r.detail.text, why: r.detail.why, review: r.detail.review,
  prev: r.detail.prev as RowTarget["prev"], refs: r.detail.refs as RowTarget["refs"], coach: r.detail.coach as RowTarget["coach"], algo: r.algoVersion,
});
function toRow(userId: string, s: { id: string; versionId: string }, peId: string, exerciseId: string, t: RowTarget, seq: number): typeof trainingTarget.$inferInsert {
  return {
    userId, sessionId: s.id, programExerciseId: peId, exerciseId, versionId: s.versionId, setIndex: t.setIndex, specId: t.specId, setKind: t.kind, blockIndex: t.block, stageIndex: t.stage,
    seq, status: t.status, action: t.action, source: t.source, quality: t.quality, weightKg: t.weightKg == null ? null : String(t.weightKg),
    repsMin: t.repsMin, repsMax: t.repsMax, repsTarget: t.repsTarget, rirTarget: t.rirTarget, rpeTarget: t.rpeTarget, restSec: t.restSec, restSuggestSec: t.restSuggestSec, pending: t.pending,
    detail: { reasons: t.reasons, guards: t.guards, text: t.text, why: t.why, review: t.review, prev: t.prev, refs: t.refs.slice(0, 12), coach: t.coach }, algoVersion: t.algo,
  };
}

export type SessionEx = { id: string; exerciseId: string; name: string; sets: number; reps: string; rir: number | null; restSec: number; detail: ExerciseDetail | null; doing: string; skipped: boolean; logged: Set<number> };
export type Outlook = { trend: Trend; proposal: Proposal | null } | null;

/**
 * Objetivos vigentes de una sesión. En una sesión abierta, calcula y guarda los que faltan (filas sin registrar y sin objetivo
 * vigente), de forma idempotente: dos pedidos a la vez no duplican (índice parcial único). Los objetivos ya emitidos se
 * conservan aunque cambie el algoritmo. Al cambiar la versión de la rutina o el ejercicio que se hace, los de filas sin
 * registrar quedan obsoletos (superseded) y se emiten otros. Una sesión terminada sólo se lee: nunca se recalcula.
 */
export async function ensureTargets(userId: string, s: { id: string; versionId: string; status: string }, exs: SessionEx[], now = new Date()) {
  const current = await db.select().from(trainingTarget).where(and(eq(trainingTarget.sessionId, s.id), isNull(trainingTarget.supersededAt)));
  const open = s.status === "in_progress" || s.status === "paused";
  const byPe = new Map<string, TargetRow[]>();
  for (const r of current) byPe.set(r.programExerciseId, [...(byPe.get(r.programExerciseId) ?? []), r]);
  let history = new Map<string, HistRow[]>();
  let sig: Signals | null = null;
  if (open) {
    const inSession = new Set(exs.map((e) => e.id));
    const stale = current.filter((r) => !r.decision && (!inSession.has(r.programExerciseId) || exs.find((e) => e.id === r.programExerciseId)?.doing !== r.exerciseId));
    const need = exs.filter((e) => !e.skipped && Array.from({ length: e.sets }, (_, i) => i).some((i) => !e.logged.has(i) && !(byPe.get(e.id) ?? []).some((r) => r.setIndex === i && !stale.includes(r))));
    if (need.length) [history, sig] = await Promise.all([historyRows(userId, need.map((e) => e.doing), { excludeSessionId: s.id, now }), trainingSignals(userId, now)]);
    await db.transaction(async (tx) => {
      if (stale.length) await tx.update(trainingTarget).set({ supersededAt: now }).where(and(inArray(trainingTarget.id, stale.map((r) => r.id)), isNull(trainingTarget.supersededAt)));
      for (const e of need) {
        const ts = recommendExercise({ ex: e, history: history.get(e.doing) ?? [], now, signals: safety(sig, e.name), ...(e.doing !== e.exerciseId ? { increment: null } : {}) }); // sustituto: otro equipo, salto desconocido
        const mine = (byPe.get(e.id) ?? []).filter((r) => !stale.includes(r));
        const missing = ts.filter((t) => !e.logged.has(t.setIndex) && !mine.some((r) => r.setIndex === t.setIndex));
        if (!missing.length) continue;
        const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${trainingTarget.seq}), 0)::int` }).from(trainingTarget).where(and(eq(trainingTarget.sessionId, s.id), eq(trainingTarget.programExerciseId, e.id)));
        await tx.insert(trainingTarget).values(missing.map((t) => toRow(userId, s, e.id, e.doing, t, m + 1))).onConflictDoNothing();
      }
    });
  }
  const rows = open ? await db.select().from(trainingTarget).where(and(eq(trainingTarget.sessionId, s.id), isNull(trainingTarget.supersededAt))) : current;
  const out = new Map<string, TargetOut[]>();
  for (const r of rows.sort((a, b) => a.setIndex - b.setIndex)) out.set(r.programExerciseId, [...(out.get(r.programExerciseId) ?? []), toOut(r)]);
  return { targets: out, history: open ? history : null };
}

/** Tendencia y propuesta del ejercicio para la persona (texto breve; nunca cambia la rutina). */
export function outlookFor(e: Pick<SessionEx, "sets" | "reps" | "rir" | "restSec" | "detail">, rows: HistRow[], now: Date, coachOwned: boolean, fatigue = false, increment: number | null = loadIncrement(e.detail)): Outlook {
  const plan = Array.from({ length: e.sets }, (_, i) => rowContext(e as ExCtx, i));
  const main = plan.find((c) => c.cls === "main" || c.cls === "top");
  if (!main) return null;
  const pts = sessionPoints(main, rows, now, plan.filter((c) => c.cls === main.cls && c.stage === 0).length);
  const trend = exerciseTrend(pts);
  const t = setTarget(e as ExCtx, main.index);
  const r = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(t.reps.trim());
  const proposal = nextProposal(trend, pts, { repsMin: r ? Number(r[1]) : null, repsMax: r ? Number(r[2] ?? r[1]) : null, coachOwned, fatigue, increment });
  return { trend, proposal };
}

/**
 * Después de registrar una serie (fuera de la transacción del registro: nunca la frena). Fija la decisión del objetivo de esa
 * fila (aceptado o modificado, con el id del registro) y ajusta los objetivos de las filas siguientes del mismo ejercicio si
 * corresponde (sólo mantener o bajar). Devuelve el mensaje para la persona y los objetivos vigentes del ejercicio.
 */
export async function afterSetLogged(userId: string, sessionId: string, peId: string, setIndex: number, now = new Date()): Promise<{ event: IntelEvent | null; targets: TargetOut[] }> {
  const [s] = await db.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  if (!s || (s.status !== "in_progress" && s.status !== "paused")) return { event: null, targets: [] };
  const [pe] = await db.select().from(programExercise).where(eq(programExercise.id, peId));
  if (!pe) return { event: null, targets: [] };
  const logs = await db.select().from(setLog).where(and(eq(setLog.sessionId, sessionId), eq(setLog.programExerciseId, peId)));
  const cur = await db.select().from(trainingTarget).where(and(eq(trainingTarget.sessionId, sessionId), eq(trainingTarget.programExerciseId, peId), isNull(trainingTarget.supersededAt)));
  const log = logs.find((l) => l.setIndex === setIndex);
  const mine = cur.find((r) => r.setIndex === setIndex);
  if (!log || !mine || mine.decision) return { event: null, targets: cur.map(toOut) }; // edición de una serie ya decidida: no se recalcula
  const ex: ExCtx = { sets: pe.sets, reps: pe.reps, rir: pe.rir, restSec: pe.restSec, detail: pe.detail as ExerciseDetail | null };
  const targets: RowTarget[] = Array.from({ length: pe.sets }, (_, i) => { const r = cur.find((x) => x.setIndex === i); return r ? toOut(r) : null; }) as RowTarget[];
  const done = logs.map((l) => ({ index: l.setIndex, w: l.weightKg == null ? null : Number(l.weightKg), r: l.reps, rir: l.rir, feel: l.feel }));
  const adj = adjustAfterSet({ ex, targets, done, justDone: setIndex, ...(mine.exerciseId !== pe.exerciseId ? { increment: null } : {}) });
  const logged = new Set(logs.map((l) => l.setIndex));
  await db.transaction(async (tx) => {
    await tx.update(trainingTarget).set({ decision: decisionFor(toOut(mine), { w: done.find((d) => d.index === setIndex)!.w, r: log.reps }), setLogId: log.id, decidedAt: now })
      .where(and(eq(trainingTarget.id, mine.id), isNull(trainingTarget.decision)));
    const change = adj.changed.filter((i) => !logged.has(i) && cur.some((r) => r.setIndex === i && !r.decision));
    if (!change.length) return;
    const old = cur.filter((r) => change.includes(r.setIndex));
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${trainingTarget.seq}), 0)::int` }).from(trainingTarget).where(and(eq(trainingTarget.sessionId, sessionId), eq(trainingTarget.programExerciseId, peId)));
    const done2 = await tx.update(trainingTarget).set({ supersededAt: now }).where(and(inArray(trainingTarget.id, old.map((r) => r.id)), isNull(trainingTarget.supersededAt), isNull(trainingTarget.decision))).returning({ id: trainingTarget.id });
    const ok = old.filter((r) => done2.some((d) => d.id === r.id)); // otro pedido ya lo reemplazó: no se duplica
    if (ok.length) await tx.insert(trainingTarget).values(ok.map((r) => toRow(userId, s, peId, r.exerciseId, { ...adj.targets[r.setIndex], algo: TI_VERSION }, m + 1))).onConflictDoNothing();
  });
  const fresh = await db.select().from(trainingTarget).where(and(eq(trainingTarget.sessionId, sessionId), eq(trainingTarget.programExerciseId, peId), isNull(trainingTarget.supersededAt))).orderBy(asc(trainingTarget.setIndex));
  return { event: adj.event, targets: fresh.map(toOut) };
}

/** Al terminar la sesión: los objetivos de filas que no se hicieron quedan «no hecho» (no se borran ni se recalculan). */
export async function closeTargets(sessionId: string, now = new Date()) {
  await db.update(trainingTarget).set({ decision: "not_done", decidedAt: now })
    .where(and(eq(trainingTarget.sessionId, sessionId), isNull(trainingTarget.supersededAt), isNull(trainingTarget.decision)));
}

// ── Vista del coach ────────────────────────────────────────────────────────
/**
 * D191: rendimiento y propuestas por ejercicio del programa vigente, sólo con lo entrenado con este coach y con el permiso de
 * entrenamientos ('training'). No usa datos de salud (molestias reportadas, lesiones, check-ins) ni el historial importado:
 * las propuestas se basan en lo que el coach ya puede ver (series, RIR y sensación registradas). Las propuestas quedan
 * abiertas para que el coach decida; nunca cambian la rutina ni crean versiones.
 */
export async function clientIntelligence(actorId: string, orgId: string, coachClientId: string, now = new Date()) {
  await requireCoach(actorId, orgId);
  const rel = await requireClientOf(orgId, coachClientId);
  return relationIntelligence({ kind: "coach", id: coachClientId, userId: rel.userId }, now);
}

/** Relación ya autorizada por quien llama: coach privado (`coach_client`) o socio de la sede (`gym_member`). */
export type IntelRel = { kind: "coach" | "gym"; id: string; userId: string };
const relCol = (k: IntelRel["kind"]) => ({
  assignment: k === "coach" ? programAssignment.coachClientId : programAssignment.gymMemberId,
  session: k === "coach" ? workoutSession.coachClientId : workoutSession.gymMemberId,
  proposal: k === "coach" ? trainingProposal.coachClientId : trainingProposal.gymMemberId,
});

/**
 * Núcleo compartido por la ficha del coach y la del equipo de sala (D191). Sólo lee lo entrenado dentro de esa relación
 * (nunca el historial importado ni datos de salud) y deja abiertas las propuestas: nunca cambia la rutina ni crea versiones.
 */
export async function relationIntelligence(rel: IntelRel, now = new Date()) {
  const col = relCol(rel.kind);
  const [a] = await db.select().from(programAssignment).where(and(eq(col.assignment, rel.id), eq(programAssignment.status, "active")));
  if (!a) return { formula: FORMULA, exercises: [], adherence: null, programId: null };
  const [p] = await db.select().from(program).where(eq(program.id, a.programId));
  const { doc } = await readVersion(p.currentVersionId!);
  const seen = new Set<string>();
  const exs = doc.days.flatMap((d) => d.exercises).filter((e) => (seen.has(e.exerciseId) ? false : (seen.add(e.exerciseId), true))).slice(0, 40);
  const hist = await historyRows(rel.userId, exs.map((e) => e.exerciseId), { ...(rel.kind === "coach" ? { coachClientId: rel.id } : { gymMemberId: rel.id }), now, imports: false });
  const since = new Date(now.getTime() - 28 * 86_400_000);
  // Prescripción vs resultado: objetivos de REPI en las sesiones de esta relación (últimos 28 días) y cómo se resolvieron.
  const decided = await db.select({ ex: trainingTarget.exerciseId, d: trainingTarget.decision, n: sql<number>`count(*)::int` }).from(trainingTarget)
    .innerJoin(workoutSession, eq(workoutSession.id, trainingTarget.sessionId))
    .where(and(eq(col.session, rel.id), isNull(trainingTarget.supersededAt), sql`${trainingTarget.createdAt} >= ${since.toISOString()}::timestamptz`))
    .groupBy(trainingTarget.exerciseId, trainingTarget.decision);
  const out = [];
  for (const e of exs) {
    const rows = hist.get(e.exerciseId) ?? [];
    const ex = { sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, detail: (e.detail as ExerciseDetail | null) ?? null };
    const fatigue = rows.slice(0, 12).filter((r) => r.feel === "limite" || r.rir === 0).length >= 4;
    const o = outlookFor(ex, rows, now, true, fatigue);
    const last = rows[0] ? rows.filter((r) => r.sessionId === rows[0].sessionId) : [];
    const counts = { accepted: 0, modified: 0, not_done: 0 };
    for (const d of decided.filter((x) => x.ex === e.exerciseId)) if (d.d && d.d in counts) counts[d.d as keyof typeof counts] += d.n;
    let proposal: { id: string; status: string } & Proposal | null = null;
    if (o?.proposal && (o.proposal.requiresCoach || o.proposal.kind === "load" || o.proposal.kind === "review" || o.proposal.kind === "deload")) {
      const pl = { text: o.proposal.text, weightKg: o.proposal.weightKg, reps: o.proposal.reps, basis: o.proposal.basis, trend: o.trend.kind, sessions: o.trend.sessions };
      const relVals = rel.kind === "coach" ? { coachClientId: rel.id } : { gymMemberId: rel.id };
      await db.insert(trainingProposal).values({ ...relVals, exerciseId: e.exerciseId, kind: o.proposal.kind, payload: pl, algoVersion: TI_VERSION })
        .onConflictDoUpdate({ target: [col.proposal, trainingProposal.exerciseId, trainingProposal.kind], targetWhere: sql.raw(`status = 'open' and ${rel.kind === "coach" ? "coach_client_id" : "gym_member_id"} is not null`), set: { payload: pl, algoVersion: TI_VERSION } });
      const [row] = await db.select().from(trainingProposal).where(and(eq(col.proposal, rel.id), eq(trainingProposal.exerciseId, e.exerciseId), eq(trainingProposal.kind, o.proposal.kind), eq(trainingProposal.status, "open")));
      if (row) proposal = { id: row.id, status: row.status, ...o.proposal };
    }
    out.push({
      exerciseId: e.exerciseId, name: e.name, prescribed: `${e.sets} × ${e.reps}`,
      last: last.length ? { at: rows[0].at, sets: last.map((r) => ({ w: r.w, r: r.r, rir: r.rir, kind: r.kind, stage: r.stage })) } : null,
      trend: o?.trend ?? null, proposal, targets: counts,
    });
  }
  const done = await db.select({ n: sql<number>`count(*)::int` }).from(workoutSession).where(and(eq(col.session, rel.id), eq(workoutSession.status, "completed"), sql`${workoutSession.endedAt} >= ${since.toISOString()}::timestamptz`));
  return { formula: FORMULA, exercises: out, adherence: { sessions28d: done[0]?.n ?? 0 }, programId: p.id };
}
const FORMULA = `Tendencia con las últimas ${TI_WINDOW.sessions} sesiones comparables (hasta ${TI_WINDOW.days} días) de la serie principal: mejor serie de cada sesión por 1RM estimado (Epley, 1–12 reps) o kilos y repeticiones. Menos de 3 sesiones: datos insuficientes. Son reglas del producto, no un diagnóstico.`;

export type ProposalDecision = { status: "accepted" | "modified" | "rejected" | "kept"; note?: string | null };
export async function decideProposal(actorId: string, orgId: string, proposalId: string, p: ProposalDecision) {
  await requireCoach(actorId, orgId);
  const [row] = await db.select({ pr: trainingProposal, org: coachClient.coachOrgId }).from(trainingProposal).innerJoin(coachClient, eq(coachClient.id, trainingProposal.coachClientId))
    .where(eq(trainingProposal.id, proposalId));
  if (!row || row.org !== orgId) throw new AccessError("not_found", "No encontramos lo que buscás.", 404);
  await requireClientOf(orgId, row.pr.coachClientId!);
  return recordDecision(actorId, orgId, row.pr, p);
}

/** Registra la decisión sobre una propuesta ya autorizada. Sólo cambia la propuesta: la rutina sigue igual. */
export async function recordDecision(actorId: string, orgId: string, pr: typeof trainingProposal.$inferSelect, p: ProposalDecision) {
  if (pr.status !== "open") return { id: pr.id, status: pr.status };
  const note = p.note?.trim().slice(0, 200) || null;
  const [u] = await db.update(trainingProposal).set({ status: p.status, decidedBy: actorId, decidedAt: new Date(), note })
    .where(and(eq(trainingProposal.id, pr.id), eq(trainingProposal.status, "open"))).returning();
  await audit(db, { actorUserId: actorId, orgId, action: `training_proposal.${p.status}`, resourceType: "training_proposal", resourceId: pr.id, meta: { kind: pr.kind } });
  return { id: pr.id, status: u?.status ?? pr.status };
}

/** Ejercicios de la sesión con el ejercicio que realmente se hace y las filas ya registradas (para `ensureTargets`). */
export async function sessionExercises(sessionId: string, exs: (typeof programExercise.$inferSelect)[], logs: { programExerciseId: string; setIndex: number }[]): Promise<SessionEx[]> {
  const changes = await db.select().from(sessionExerciseChange).where(eq(sessionExerciseChange.sessionId, sessionId));
  return exs.map((e) => {
    const ch = changes.find((c) => c.programExerciseId === e.id);
    return { id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, detail: (e.detail as ExerciseDetail | null) ?? null,
      doing: ch?.substituteExerciseId ?? e.exerciseId, skipped: ch?.kind === "skip", logged: new Set(logs.filter((l) => l.programExerciseId === e.id).map((l) => l.setIndex)) };
  });
}
