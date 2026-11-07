// Señales de REPI para quien programa al alumno (D210, contrato §5 «coach.ts», máster §14–15). Entrenador privado: requireCoach
// + requireClientOf (relación vigente con permiso de entrenamientos «training»). Equipo de sala: program.edit en la sede del
// socio + consentimiento attendance_training (el mismo camino que la ficha de Training Intelligence del gimnasio). Dueño y
// gerencia nunca: no programan, y administrar el gimnasio no da acceso a datos del alumno (caso 62).
//
// Qué muestra, siempre acotado a lo entrenado DENTRO de esa relación (otra relación del mismo alumno, en otra organización o
// con otro profe, no cuenta: caso 53):
// - dificultad creciente en sesiones comparables (Training Intelligence: exerciseTrend con evidencia consistente);
// - sustituciones propuestas por REPI que el alumno rechazó, y recomendaciones descartadas (sólo cantidades);
// - propuestas pendientes (training_proposal abiertas);
// - pedidos del alumno al entrenador hechos desde REPI (propose_to_coach, sólo cantidades por tipo).
// Qué NO muestra nunca: memoria, conversación ni mensajes del alumno con REPI, textos de sus avisos, notas, datos de salud
// (molestias, lesiones, check-ins), historial importado ni sus rutinas propias o importadas (son privadas). Nada llama a un modelo
// ni escribe: es una lectura (a diferencia de la ficha de Training Intelligence, no crea propuestas).
import { and, desc, eq, sql } from "drizzle-orm";
import { exerciseTrend, rowContext, sessionPoints, type ExCtx, type ExerciseDetail, type Trend } from "@repi/domain";
import { fmtArDate } from "@repi/domain/brain/quiet";
import { numEs } from "@repi/domain/brain/util";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { requireClientOf, requireCoach, readVersion } from "../training/services";
import { historyRows } from "../training/intelligence";
import { exerciseProfiles, rowProfile } from "../training/library";
import { gymContext, inScope, need } from "../gym/services";
import { requireAssistant } from "./prefs";

const { programAssignment, program, trainingProposal, gymMember, consentGrant, exercise } = schema;
const DAY = 86_400_000;
/** Ventana de las cantidades (rechazos, pedidos). */
export const INSIGHT_WINDOW_DAYS = 30;
/** Desde cuántos rechazos de lo mismo conviene avisarle al profe (máster §14: «Rechazó tres veces…»; con dos ya es patrón). */
export const REJECTION_THRESHOLD = 2;
const MAX_EXERCISES = 40;
/** Recomendaciones de REPI (tarjetas con propuesta) cuyo descarte cuenta como «recomendación rechazada». */
const RECOMMENDATION_KINDS = ["progressing", "plateau", "declining", "low_energy"] as const;
const SUBSTITUTION_KINDS = ["propose_substitution", "apply_substitution"] as const;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

export type InsightRel = { kind: "coach" | "gym"; id: string; userId: string };
export type CoachInsight = {
  kind: "difficulty_rising" | "rejected_substitutions" | "rejected_recommendations" | "pending_proposals" | "student_requests";
  text: string;
  count: number;
  evidence: { basis: string; sessions?: { at: string }[] };
  /** Referencias para abrir la pantalla correspondiente (ejercicios del programa, propuestas). Nunca contenido del alumno. */
  refs?: { exerciseIds?: string[]; proposalIds?: string[]; items?: PendingItem[] };
};
/**
 * Una propuesta abierta, sin su texto (D210 · interfaz): ejercicio, tipo y origen. `source: "student"` = pedido del alumno desde
 * REPI (propose_to_coach), que la ficha de Training Intelligence no lista; la interfaz lo lleva al editor de siempre y deja
 * decidir con las rutas existentes. Nunca la nota del alumno.
 */
export type PendingItem = { proposalId: string; exerciseId: string; exerciseName: string | null; kind: string; source: "ti" | "student" };
export type ExerciseSignal = { exerciseId: string; name: string; trend: Trend["kind"]; confidence: Trend["confidence"]; sessions: number; dates: string[]; rising: boolean };
export type InsightsView = {
  relation: { kind: "coach" | "gym"; id: string };
  generatedAt: string;
  windowDays: number;
  insights: CoachInsight[];
  counts: { rejectedSubstitutions: number; rejectedRecommendations: number; pendingProposals: number; studentRequests: Record<string, number> };
  exercises: ExerciseSignal[];
  /** Lo que esta vista no incluye a propósito (privacidad), para decirlo en la interfaz. */
  notIncluded: string[];
};

/** Entrenador privado: relación propia, vigente y con permiso de entrenamientos (si no, 404 o 403 no_grant). */
export async function coachInsights(actorId: string, orgId: string, relId: string, now = new Date()): Promise<InsightsView> {
  requireAssistant();
  await requireCoach(actorId, orgId);
  const rel = await requireClientOf(orgId, relId);
  return relationInsights({ kind: "coach", id: relId, userId: rel.userId }, now);
}

/**
 * Equipo de sala y coordinación (program.edit) de la sede del socio, con su consentimiento attendance_training. Dueño y
 * gerencia: 403 (no programan). Otra sede u otra organización: 404.
 */
export async function memberInsights(actorId: string, orgId: string, gymMemberId: string, now = new Date()): Promise<InsightsView> {
  requireAssistant();
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "program.edit");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  const [g] = await db.select({ id: consentGrant.id }).from(consentGrant)
    .where(and(eq(consentGrant.relationId, m.id), eq(consentGrant.item, "attendance_training"), eq(consentGrant.status, "active")));
  if (!g) throw new AccessError("consent_required", "El socio no compartió su entrenamiento con la sede.", 403);
  return relationInsights({ kind: "gym", id: m.id, userId: m.userId }, now);
}

/** Sesiones de esta relación (para acotar todo lo que no tiene la relación guardada). */
const relSessionsSql = (rel: InsightRel) => rel.kind === "coach"
  ? sql`ws.user_id = ${rel.userId} and ws.coach_client_id = ${rel.id}`
  : sql`ws.user_id = ${rel.userId} and ws.gym_member_id = ${rel.id}`;

/** Dificultad por ejercicio del programa vigente de la relación (sólo lo entrenado con ella, sin historial importado). */
async function exerciseSignals(rel: InsightRel, now: Date): Promise<ExerciseSignal[]> {
  const col = rel.kind === "coach" ? programAssignment.coachClientId : programAssignment.gymMemberId;
  const [a] = await db.select().from(programAssignment).where(and(eq(col, rel.id), eq(programAssignment.status, "active")));
  if (!a) return [];
  const [p] = await db.select().from(program).where(eq(program.id, a.programId));
  if (!p?.currentVersionId) return [];
  const { doc } = await readVersion(p.currentVersionId);
  const seen = new Set<string>();
  const exs = doc.days.flatMap((d) => d.exercises).filter((e) => (seen.has(e.exerciseId) ? false : (seen.add(e.exerciseId), true))).slice(0, MAX_EXERCISES);
  if (!exs.length) return [];
  const hist = await historyRows(rel.userId, exs.map((e) => e.exerciseId), { ...(rel.kind === "coach" ? { coachClientId: rel.id } : { gymMemberId: rel.id }), now, imports: false });
  const out: ExerciseSignal[] = [];
  const profiles = await exerciseProfiles(exs.map((e) => e.exerciseId)); // ejercicios por tiempo: una actividad no tiene tendencia de kilos
  for (const e of exs) {
    const rows = hist.get(e.exerciseId) ?? [];
    if (!rows.length) continue;
    const ctx: ExCtx = { sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, detail: (e.detail as ExerciseDetail | null) ?? null, profile: rowProfile(e, e.exerciseId, profiles) };
    const plan = Array.from({ length: ctx.sets }, (_, i) => rowContext(ctx, i));
    const main = plan.find((c) => c.cls === "main" || c.cls === "top");
    if (!main) continue;
    const pts = sessionPoints(main, rows, now, plan.filter((c) => c.cls === main.cls && c.stage === 0 && c.label === main.label).length);
    const t = exerciseTrend(pts);
    // Sólo señales consistentes (máster §20): baja sostenida o mismo rendimiento con más esfuerzo, con ≥ 4 sesiones en la misma dirección.
    const rising = (t.kind === "declining" || t.kind === "effort_up") && t.confidence === "consistent";
    out.push({ exerciseId: e.exerciseId, name: e.name, trend: t.kind, confidence: t.confidence, sessions: t.sessions, dates: pts.map((x) => x.at), rising });
  }
  return out;
}

/** Núcleo compartido (relación ya autorizada por quien llama). Sólo lecturas acotadas a la relación. */
export async function relationInsights(rel: InsightRel, now = new Date()): Promise<InsightsView> {
  const since = new Date(now.getTime() - INSIGHT_WINDOW_DAYS * DAY).toISOString();
  const until = now.toISOString();
  const propCol = rel.kind === "coach" ? trainingProposal.coachClientId : trainingProposal.gymMemberId;
  const [exercises, [subs], [recs], open, requests] = await Promise.all([
    exerciseSignals(rel, now),
    // Sustituciones de REPI rechazadas durante sesiones de ESTA relación (la acción no guarda la relación: se acota por la ventana
    // de la sesión abierta, que es donde se proponen). Se cuentan ofertas, no filas: las alternativas de una misma respuesta
    // (input._bind.offer) rechazadas con un «no» son UN rechazo.
    db.execute<{ n: number }>(sql`
      select count(distinct coalesce(a.input->'_bind'->>'offer', a.id))::int as n from brain_action a
      where a.user_id = ${rel.userId} and a.kind in (${sql.join(SUBSTITUTION_KINDS.map((k) => sql`${k}`), sql`, `)}) and a.status = 'cancelled'
        and a.created_at >= ${since}::timestamptz and a.created_at <= ${until}::timestamptz
        and exists (select 1 from workout_session ws where ${relSessionsSql(rel)}
          and a.created_at >= ws.started_at and a.created_at <= coalesce(ws.ended_at, ws.started_at + interval '6 hours'))`) as unknown as Promise<{ n: number }[]>,
    // Recomendaciones descartadas («Descartar» o «No mostrar algo parecido») atadas a una sesión de ESTA relación.
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from brain_intervention bi
      join workout_session ws on ws.id = bi.payload->'data'->>'sessionId'
      where bi.user_id = ${rel.userId} and bi.kind in (${sql.join(RECOMMENDATION_KINDS.map((k) => sql`${k}`), sql`, `)}) and bi.status in ('dismissed', 'never')
        and bi.created_at >= ${since}::timestamptz and ${relSessionsSql(rel)}`) as unknown as Promise<{ n: number }[]>,
    db.select({ id: trainingProposal.id, exerciseId: trainingProposal.exerciseId, kind: trainingProposal.kind, trend: sql<string | null>`${trainingProposal.payload}->>'trend'`, name: exercise.name })
      .from(trainingProposal).leftJoin(exercise, eq(exercise.id, trainingProposal.exerciseId))
      .where(and(eq(propCol, rel.id), eq(trainingProposal.status, "open"))).orderBy(desc(trainingProposal.createdAt)).limit(50),
    // Pedidos del alumno al profe desde REPI: la acción ejecutada deja en su resultado la propuesta creada para ESTA relación.
    db.execute<{ kind: string | null; n: number }>(sql`
      select a.input->>'kind' as kind, count(*)::int as n from brain_action a
      join training_proposal tp on tp.id = a.result->>'proposalId'
      where a.user_id = ${rel.userId} and a.kind = 'propose_to_coach' and a.status = 'executed' and a.created_at >= ${since}::timestamptz
        and ${rel.kind === "coach" ? sql`tp.coach_client_id = ${rel.id}` : sql`tp.gym_member_id = ${rel.id}`}
      group by 1`) as unknown as Promise<{ kind: string | null; n: number }[]>,
  ]);

  const insights: CoachInsight[] = [];
  const rising = exercises.filter((x) => x.rising);
  if (rising.length) {
    const names = rising.slice(0, 3).map((x) => x.name);
    const dates = [...new Set(rising.flatMap((x) => x.dates))].sort().slice(-6);
    insights.push({
      kind: "difficulty_rising", count: rising.length, refs: { exerciseIds: rising.map((x) => x.exerciseId) },
      text: `Viene registrando más dificultad en las últimas sesiones comparables de ${names.join(", ")}${rising.length > 3 ? " y otros" : ""}.`,
      evidence: { basis: `Comparé sus sesiones del ${dates.map(fmtArDate).join(", ")}: rendimiento más bajo, o el mismo con más esfuerzo, en al menos cuatro sesiones comparables seguidas. Sólo lo entrenado en esta relación.`, sessions: dates.map((at) => ({ at })) },
    });
  }
  const nSubs = subs?.n ?? 0, nRecs = recs?.n ?? 0;
  if (nSubs >= REJECTION_THRESHOLD) {
    insights.push({ kind: "rejected_substitutions", count: nSubs, text: `Rechazó ${numEs(nSubs, false)} veces una sustitución propuesta por REPI; conviene revisar sus preferencias.`,
      evidence: { basis: `Sustituciones propuestas durante sus sesiones de los últimos ${INSIGHT_WINDOW_DAYS} días que no aceptó. Sólo la cantidad: no se muestra lo que habló con REPI.` } });
  }
  if (nRecs >= REJECTION_THRESHOLD) {
    insights.push({ kind: "rejected_recommendations", count: nRecs, text: `Descartó ${numEs(nRecs, false)} recomendaciones de REPI sobre su progreso en los últimos ${INSIGHT_WINDOW_DAYS} días.`,
      evidence: { basis: "Tarjetas de tendencia o de poca energía que descartó, atadas a sesiones de esta relación. Sólo la cantidad." } });
  }
  if (open.length) {
    const items: PendingItem[] = open.map((x) => ({ proposalId: x.id, exerciseId: x.exerciseId, exerciseName: x.name ?? null, kind: x.kind, source: x.trend === "student_request" ? "student" : "ti" }));
    insights.push({ kind: "pending_proposals", count: open.length, refs: { proposalIds: open.map((x) => x.id), exerciseIds: [...new Set(open.map((x) => x.exerciseId))], items },
      text: open.length === 1 ? "Hay una propuesta pendiente para revisar antes del próximo entrenamiento." : `Hay ${numEs(open.length, false)} propuestas pendientes para revisar antes del próximo entrenamiento.`,
      evidence: { basis: "Propuestas de Training Intelligence o del alumno que todavía no decidiste. Ninguna cambia el programa sola." } });
  }
  const studentRequests = Object.fromEntries(requests.map((r) => [r.kind ?? "otro", r.n]));
  const nReq = requests.reduce((s, r) => s + r.n, 0);
  if (nReq) {
    insights.push({ kind: "student_requests", count: nReq,
      text: nReq === 1 ? "Te dejó un pedido para revisar su programa desde REPI." : `Te dejó ${numEs(nReq, false)} pedidos para revisar su programa desde REPI.`,
      evidence: { basis: `Pedidos que confirmó en los últimos ${INSIGHT_WINDOW_DAYS} días; los ves como propuestas pendientes.` } });
  }
  return {
    relation: { kind: rel.kind, id: rel.id }, generatedAt: now.toISOString(), windowDays: INSIGHT_WINDOW_DAYS, insights,
    counts: { rejectedSubstitutions: nSubs, rejectedRecommendations: nRecs, pendingProposals: open.length, studentRequests },
    exercises,
    notIncluded: [
      "Memoria y conversación del alumno con REPI",
      "Datos de salud (molestias, lesiones, check-ins)",
      "Rutinas propias o importadas por el alumno e historial importado",
      "Entrenamientos con otros profes u otras organizaciones",
    ],
  };
}

// ── Panel del entrenador · «Pendientes» ─────────────────────────────────────
export type PendingSignals = {
  generatedAt: string;
  /** Sólo alumnos con algo pendiente: relación vigente (no terminada) y permiso de entrenamientos activo. */
  clients: { relId: string; pendingProposals: number; studentRequests: number }[];
  totals: { clients: number; pendingProposals: number; studentRequests: number };
};

/**
 * Cantidades para «Pendientes» del panel del coach (D210 · interfaz): por alumno, propuestas abiertas y, de ellas, cuántas son
 * pedidos del alumno desde REPI (acción propose_to_coach ejecutada que apunta a esa propuesta). Mismo alcance que la ficha:
 * requireCoach y, por alumno, relación no terminada con el permiso «training» activo (sin permiso, no cuenta). Sólo números:
 * ningún texto de la propuesta ni del alumno. Es una lectura: no crea propuestas.
 */
export async function coachPendingSignals(actorId: string, orgId: string, now = new Date()): Promise<PendingSignals> {
  requireAssistant();
  await requireCoach(actorId, orgId);
  const rows = await (db.execute<{ rel_id: string; proposals: number; requests: number }>(sql`
    select cc.id as rel_id, count(tp.id)::int as proposals,
      count(tp.id) filter (where exists (select 1 from brain_action a where a.user_id = cc.user_id and a.kind = 'propose_to_coach'
        and a.status = 'executed' and a.result->>'proposalId' = tp.id))::int as requests
    from coach_client cc
    join training_proposal tp on tp.coach_client_id = cc.id and tp.status = 'open'
    where cc.coach_org_id = ${orgId} and cc.status <> 'ended'
      and exists (select 1 from consent_grant g where g.relation_id = cc.id and g.item = 'training' and g.status = 'active')
    group by cc.id
    order by count(tp.id) desc, cc.id`) as unknown as Promise<{ rel_id: string; proposals: number; requests: number }[]>);
  const clients = rows.map((r) => ({ relId: r.rel_id, pendingProposals: r.proposals, studentRequests: r.requests }));
  return {
    generatedAt: now.toISOString(), clients,
    totals: { clients: clients.length, pendingProposals: clients.reduce((s, c) => s + c.pendingProposals, 0), studentRequests: clients.reduce((s, c) => s + c.studentRequests, 0) },
  };
}
