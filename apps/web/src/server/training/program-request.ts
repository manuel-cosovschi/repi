// D206: preferencias obligatorias del pedido de programa. Al pedir un programa (al coach o al equipo de sala) la persona
// completa objetivo, días, minutos, experiencia y lesiones o limitaciones (más opcionales). Los pedidos ya abiertos sin esos
// datos (los de antes de D206 y los «Programa nuevo» que crea el gimnasio para socios sin programa) quedan como pendientes:
// la persona ve un aviso en Inicio y en la campanita, recibe un push una sola vez (si tiene avisos activados) y, al
// completarlos, se adjuntan al pedido existente y se avisa a quien lo tomó.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  briefSummary, cleanProgramBrief, isCompleteBrief, readWishes,
  type ProgramRequestBrief, type TrainingWishes,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { updateProfile } from "../settings/profile";
import { ACTIVE, addEvent, myGymRelations } from "../gym/services";
import { enqueue } from "../push/services";

const { gymTask, studentRequest, coachClient, organization, userPref, user } = schema;

/** Valida lo que completó la persona; el mensaje dice qué falta. */
export function parseBrief(input: unknown): ProgramRequestBrief {
  const r = cleanProgramBrief(input);
  if (!r.ok) throw new AccessError("brief_required", r.error, 400, { field: r.field });
  return r.brief;
}

export type PendingBrief = { id: string; source: "gym" | "coach"; to: string; createdAt: string };

/** Pedidos de programa abiertos de la persona a los que les faltan las preferencias. */
export async function pendingBriefs(userId: string): Promise<PendingBrief[]> {
  const rels = await myGymRelations(userId);
  const tasks = rels.length ? await db.select({ id: gymTask.id, ctx: gymTask.context, createdAt: gymTask.createdAt, orgId: gymTask.orgId }).from(gymTask)
    .where(and(inArray(gymTask.gymMemberId, rels.map((r) => r.m.id)), eq(gymTask.category, "programa_nuevo"), inArray(gymTask.status, [...ACTIVE]))) : [];
  const reqs = await db.select({ id: studentRequest.id, brief: studentRequest.brief, createdAt: studentRequest.createdAt, coach: organization.name })
    .from(studentRequest).innerJoin(coachClient, eq(coachClient.id, studentRequest.coachClientId)).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(and(eq(studentRequest.userId, userId), eq(studentRequest.kind, "programa"), eq(studentRequest.status, "open")));
  const orgName = new Map(rels.map((r) => [r.org.id, r.org.name]));
  return [
    ...tasks.filter((t) => !isCompleteBrief(t.ctx?.brief)).map((t) => ({ id: t.id, source: "gym" as const, to: `el equipo de ${orgName.get(t.orgId) ?? "tu gimnasio"}`, createdAt: t.createdAt.toISOString() })),
    ...reqs.filter((r) => !isCompleteBrief(r.brief)).map((r) => ({ id: r.id, source: "coach" as const, to: r.coach, createdAt: r.createdAt.toISOString() })),
  ];
}

/** Para precargar el formulario: el último pedido completo de la persona y lo que busca entrenando (D139). */
export async function briefPrefill(userId: string) {
  const rels = await myGymRelations(userId);
  const [lastTask] = rels.length ? await db.select({ ctx: gymTask.context, at: gymTask.createdAt }).from(gymTask)
    .where(and(inArray(gymTask.gymMemberId, rels.map((r) => r.m.id)), eq(gymTask.category, "programa_nuevo"), sql`${gymTask.context} ? 'brief'`))
    .orderBy(desc(gymTask.createdAt)).limit(1) : [];
  const [lastReq] = await db.select({ brief: studentRequest.brief, at: studentRequest.createdAt }).from(studentRequest)
    .where(and(eq(studentRequest.userId, userId), eq(studentRequest.kind, "programa"), sql`${studentRequest.brief} is not null`)).orderBy(desc(studentRequest.createdAt)).limit(1);
  const last = [lastTask && { b: lastTask.ctx?.brief, at: lastTask.at }, lastReq && { b: lastReq.brief, at: lastReq.at }]
    .filter((x): x is { b: ProgramRequestBrief; at: Date } => !!x && isCompleteBrief(x.b)).sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.b ?? null;
  const [p] = await db.select({ wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, userId));
  // D217: el perfil canónico manda (el pedido anterior lo actualizó y cualquier cambio posterior es más nuevo); el último
  // pedido completa lo que el perfil no tiene.
  const w = readWishes(p?.wishes);
  return {
    goal: w?.goal ?? last?.goal ?? null, daysPerWeek: w?.daysPerWeek ?? last?.daysPerWeek ?? null, minutes: w?.minutes ?? last?.minutes ?? null,
    level: w?.experience ?? last?.level ?? null, hasLimitations: last?.hasLimitations ?? null, limitationsDetail: last?.limitationsDetail ?? null,
    focus: last?.focus ?? [], place: last?.place ?? (rels.length ? "gym" : null), likes: last?.likes ?? w?.likes ?? null, avoid: last?.avoid ?? w?.avoid ?? null, notes: last?.notes ?? null,
  };
}

export async function programRequestState(userId: string) {
  return { pending: await pendingBriefs(userId), prefill: await briefPrefill(userId) };
}

/**
 * Lo que busca entrenando se actualiza con lo nuevo del pedido sobre el perfil canónico (D217: cambio parcial con procedencia
 * «pedido de programa»; el nivel del pedido es la experiencia declarada). Las lesiones NO van ahí (sólo viajan con el pedido).
 */
async function syncWishes(userId: string, b: ProgramRequestBrief) {
  await updateProfile(userId, { goal: b.goal, daysPerWeek: b.daysPerWeek, minutes: Math.min(240, b.minutes), experience: b.level,
    ...(b.likes ? { likes: b.likes.slice(0, 200) } : {}), ...(b.avoid ? { avoid: b.avoid.slice(0, 200) } : {}) }, "program_request");
}

/** Al crear un pedido nuevo: deja el brief y actualiza lo que busca entrenando. */
export async function afterBriefSaved(userId: string, b: ProgramRequestBrief) {
  await syncWishes(userId, b).catch(() => {});
}

/**
 * Completa los pedidos de programa abiertos que no tenían preferencias: las adjunta, rehace el texto del pedido y avisa a
 * quien lo tomó (gym). Si no hay ninguno pendiente, no crea nada (para pedir uno nuevo está «Pedir mi programa»).
 */
export async function completeProgramBrief(userId: string, input: unknown) {
  const b = parseBrief(input);
  const pending = await pendingBriefs(userId);
  if (!pending.length) throw new AccessError("no_pending", "No tenés pedidos de programa esperando tus datos.", 409);
  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const gymIds = pending.filter((p) => p.source === "gym").map((p) => p.id), reqIds = pending.filter((p) => p.source === "coach").map((p) => p.id);
  const taken = await db.transaction(async (tx) => {
    const out: { to: string; id: string; orgId: string }[] = [];
    if (gymIds.length) {
      const rows = await tx.select().from(gymTask).where(inArray(gymTask.id, gymIds));
      for (const t of rows) {
        await tx.update(gymTask).set({ context: { ...(t.context ?? {}), brief: b }, summary: briefSummary(b, 500) }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { actor: userId, kind: "member_comment", note: "Completó sus preferencias para el programa (objetivo, días, experiencia y lesiones)." });
        await audit(tx, { actorUserId: userId, orgId: t.orgId, action: "task.brief_completed", resourceType: "gym_task", resourceId: t.id, meta: { hasLimitations: b.hasLimitations } });
      }
      out.push(...rows.filter((t) => t.assigneeUserId).map((t) => ({ to: t.assigneeUserId!, id: t.id, orgId: t.orgId })));
    }
    if (reqIds.length) {
      await tx.update(studentRequest).set({ brief: b, text: briefSummary(b, 1000) }).where(inArray(studentRequest.id, reqIds));
      await audit(tx, { actorUserId: userId, action: "request.brief_completed", resourceType: "student_request", resourceId: reqIds[0], meta: { count: reqIds.length, hasLimitations: b.hasLimitations } });
    }
    return out;
  });
  // Incidente 07/11: el aviso se encola después del commit. Antes usaba otra conexión del pool con la transacción abierta
  // (con 3 conexiones podía trabar el pool) y salía aunque la transacción se deshiciera.
  for (const x of taken) {
    await enqueue([x.to], { kind: "assist_update", dedupe: `brief-done:${x.id}`, title: "Ya tenés los datos para el programa", body: `${me?.name ?? "El socio"} completó objetivo, días, experiencia y lesiones.`, url: `/gym/${x.orgId}?s=queue&sel=${x.id}` }).catch(() => {});
  }
  await syncWishes(userId, b).catch(() => {});
  return { completed: pending.length };
}

/** Ventana del aviso push: de 10 a 21 (Buenos Aires), nunca de noche. */
const AR_HOUR = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(d));

/**
 * Cron (cada minuto; trabaja cada 15 en la ventana diurna): un push por pedido de programa abierto sin preferencias, una sola
 * vez (deduplicado por pedido). Quien no tiene avisos activados lo ve igual en Inicio y en la campanita.
 */
export async function remindProgramBriefs(now = new Date()) {
  const h = AR_HOUR(now);
  if (h < 10 || h > 20 || now.getUTCMinutes() % 15 !== 0) return 0;
  const tasks = await db.select({ id: gymTask.id, ctx: gymTask.context, userId: schema.gymMember.userId, org: organization.name }).from(gymTask)
    .innerJoin(schema.gymMember, eq(schema.gymMember.id, gymTask.gymMemberId)).innerJoin(organization, eq(organization.id, gymTask.orgId))
    .where(and(eq(gymTask.category, "programa_nuevo"), inArray(gymTask.status, [...ACTIVE]), eq(schema.gymMember.status, "active"), eq(organization.isDemo, false)));
  const reqs = await db.select({ id: studentRequest.id, brief: studentRequest.brief, userId: studentRequest.userId }).from(studentRequest)
    .innerJoin(coachClient, eq(coachClient.id, studentRequest.coachClientId)).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(and(eq(studentRequest.kind, "programa"), eq(studentRequest.status, "open"), isNull(studentRequest.resolvedAt), eq(organization.isDemo, false)));
  let n = 0;
  for (const t of tasks) if (!isCompleteBrief(t.ctx?.brief)) n += await enqueue([t.userId], { kind: "program_brief", dedupe: `brief:${t.id}`, ...REMIND, url: "/app?completar=programa" }).catch(() => 0);
  for (const r of reqs) if (!isCompleteBrief(r.brief)) n += await enqueue([r.userId], { kind: "program_brief", dedupe: `brief:${r.id}`, ...REMIND, url: "/app?completar=programa" }).catch(() => 0);
  return n;
}
export const REMIND = { title: "Completá tu pedido de programa", body: "Contale a tu profe tu objetivo, cuántos días podés entrenar y si tenés alguna lesión. Sin eso no puede armarlo." };
