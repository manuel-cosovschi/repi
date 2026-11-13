// D206: preferencias obligatorias del pedido de programa. Al pedir un programa (al coach o al equipo de sala) la persona
// completa objetivo, días, minutos, experiencia y lesiones o limitaciones (más opcionales). Los pedidos ya abiertos sin esos
// datos (los de antes de D206 y los «Programa nuevo» que crea el gimnasio para socios sin programa) quedan como pendientes:
// la persona ve un aviso en Inicio y en la campanita, recibe un push una sola vez (si tiene avisos activados) y, al
// completarlos, se adjuntan al pedido existente y se avisa a quien lo tomó.
//
// 13/11/2026: los pedidos YA RESPONDIDOS sin esos datos quedaban afuera (el aviso sólo miraba pedidos abiertos). En producción
// eran 10 de las 15 personas que pidieron sin datos: tenían programa, no veían ningún aviso y REPI seguía sin su objetivo.
// Ahora ven «Contale a REPI qué buscás» (Inicio y campanita; «Ahora no» lo pausa 14 días) mientras al perfil le falte lo
// esencial; al completar, los datos van al perfil de entrenamiento, quedan en el pedido y se avisa a quien lo respondió.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ageEligibility, briefProfileGaps, briefProfilePatch, briefSummary, cleanProgramBrief, isCompleteBrief, lateBriefSnoozed, localDate, profileStatus, readWishes,
  type ProgramRequestBrief,
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

/** Clave en `user_pref.hints` con el momento del último «Ahora no» del aviso de un pedido ya respondido. */
export const LATE_HINT = "brief_later";
export type LateBrief = PendingBrief & {
  /** «Ahora no» reciente: no se muestra en Inicio ni en la campanita, pero se puede completar igual. */
  snoozed: boolean;
};
type Answered = PendingBrief & { orgId: string; handler: string | null; memberId: string | null };

/**
 * Pedidos de programa de la persona YA RESPONDIDOS a los que nunca se les cargaron las preferencias: el último de cada relación vigente,
 * sólo si ningún otro pedido de esa relación las tiene (si un pedido posterior las trae, quien arma la rutina ya las recibió)
 * y si no hay uno abierto esperándolas (ése ya tiene su propio aviso).
 */
async function answeredWithoutBrief(userId: string): Promise<Answered[]> {
  const rels = await myGymRelations(userId);
  const tasks = rels.length ? await db.select({ id: gymTask.id, ctx: gymTask.context, status: gymTask.status, createdAt: gymTask.createdAt, orgId: gymTask.orgId, memberId: gymTask.gymMemberId, by: gymTask.completedBy, assignee: gymTask.assigneeUserId, createdBy: gymTask.createdBy })
    .from(gymTask).where(and(inArray(gymTask.gymMemberId, rels.map((r) => r.m.id)), eq(gymTask.category, "programa_nuevo"), sql`${gymTask.status} <> 'cancelled'`))
    .orderBy(desc(gymTask.createdAt)) : [];
  const reqs = await db.select({ id: studentRequest.id, brief: studentRequest.brief, status: studentRequest.status, createdAt: studentRequest.createdAt, relId: studentRequest.coachClientId, orgId: coachClient.coachOrgId, coach: organization.name, by: studentRequest.resolvedBy })
    .from(studentRequest).innerJoin(coachClient, eq(coachClient.id, studentRequest.coachClientId)).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(and(eq(studentRequest.userId, userId), eq(studentRequest.kind, "programa"), eq(coachClient.status, "active"))).orderBy(desc(studentRequest.createdAt));
  const orgName = new Map(rels.map((r) => [r.org.id, r.org.name]));
  const out: Answered[] = [];
  for (const r of rels) {
    const mine = tasks.filter((t) => t.memberId === r.m.id);
    if (mine.some((t) => isCompleteBrief(t.ctx?.brief)) || mine.some((t) => (ACTIVE as readonly string[]).includes(t.status))) continue;
    // Sólo un pedido que hizo la propia persona («tu pedido»): una tarea que cargó el equipo y ya cerró no es un pedido suyo
    // (para eso queda la tarjeta general del perfil).
    const last = mine.find((t) => t.status === "done" && t.createdBy === userId);
    if (last) out.push({ id: last.id, source: "gym", to: `el equipo de ${orgName.get(last.orgId) ?? "tu gimnasio"}`, createdAt: last.createdAt.toISOString(), orgId: last.orgId, handler: last.by ?? last.assignee, memberId: last.memberId });
  }
  for (const relId of [...new Set(reqs.map((x) => x.relId))]) {
    const mine = reqs.filter((x) => x.relId === relId);
    if (mine.some((x) => isCompleteBrief(x.brief)) || mine.some((x) => x.status === "open")) continue;
    const last = mine.find((x) => x.status === "done");
    if (last) out.push({ id: last.id, source: "coach", to: last.coach, createdAt: last.createdAt.toISOString(), orgId: last.orgId, handler: last.by, memberId: null });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function profileOf(userId: string, now = new Date()) {
  const [r] = await db.select({ wishes: userPref.wishes, hints: userPref.hints, birth: user.birthDate }).from(user).leftJoin(userPref, eq(userPref.userId, user.id)).where(eq(user.id, userId));
  const age = ageEligibility(r?.birth, localDate(now));
  const wishes = readWishes(r?.wishes);
  return { wishes, age, status: profileStatus(wishes, age).status, later: ((r?.hints ?? {}) as Record<string, string>)[LATE_HINT] ?? null };
}

/**
 * El aviso «tardío»: la persona pidió su programa sin datos, ya se lo respondieron y a su perfil de entrenamiento todavía le
 * falta lo esencial. null si no corresponde (perfil completo, sin pedidos así o con uno abierto que ya tiene su aviso).
 */
export async function lateBrief(userId: string, now = new Date()): Promise<LateBrief | null> {
  const p = await profileOf(userId, now);
  if (p.status === "complete") return null;
  const [a] = await answeredWithoutBrief(userId);
  return a ? { id: a.id, source: a.source, to: a.to, createdAt: a.createdAt, snoozed: lateBriefSnoozed(p.later, now) } : null;
}

/** «Ahora no»: el aviso de un pedido ya respondido no vuelve por 14 días (sólo guarda la fecha). */
export async function snoozeLateBrief(userId: string, now = new Date()) {
  const patch = JSON.stringify({ [LATE_HINT]: now.toISOString() });
  await db.insert(userPref).values({ userId, hints: { [LATE_HINT]: now.toISOString() }, updatedAt: now })
    .onConflictDoUpdate({ target: userPref.userId, set: { hints: sql`coalesce(${userPref.hints}, '{}'::jsonb) || ${patch}::jsonb`, updatedAt: now } });
  return { ok: true };
}

/**
 * Completa huecos esenciales del perfil con lo que la propia persona ya declaró en un pedido de programa (p. ej. la
 * experiencia de los pedidos anteriores a D217, que no se copiaba al perfil). Nunca pisa un dato del perfil. Devuelve qué completó.
 */
export async function healProfileFromBrief(userId: string, now = new Date()) {
  const p = await profileOf(userId, now);
  if (p.status === "complete") return [];
  const b = await lastCompleteBrief(userId);
  if (!b) return [];
  const gaps = briefProfileGaps(b, p.wishes, p.age);
  if (!Object.keys(gaps).length) return [];
  return (await updateProfile(userId, gaps, "program_request", now)).changed;
}

/** El último pedido de programa de la persona con las preferencias completas (gimnasio o coach). */
async function lastCompleteBrief(userId: string): Promise<ProgramRequestBrief | null> {
  const rels = await myGymRelations(userId);
  const tasks = rels.length ? await db.select({ ctx: gymTask.context, at: gymTask.createdAt }).from(gymTask)
    .where(and(inArray(gymTask.gymMemberId, rels.map((r) => r.m.id)), eq(gymTask.category, "programa_nuevo"), sql`${gymTask.context} ? 'brief'`))
    .orderBy(desc(gymTask.createdAt)).limit(5) : [];
  const reqs = await db.select({ brief: studentRequest.brief, at: studentRequest.createdAt }).from(studentRequest)
    .where(and(eq(studentRequest.userId, userId), eq(studentRequest.kind, "programa"), sql`${studentRequest.brief} is not null`)).orderBy(desc(studentRequest.createdAt)).limit(5);
  // Lo más nuevo primero, por la fecha en que se completaron las preferencias (un pedido viejo completado después cuenta como nuevo).
  return [...tasks.map((t) => t.ctx?.brief), ...reqs.map((r) => r.brief)].filter((b): b is ProgramRequestBrief => isCompleteBrief(b))
    .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")))[0] ?? null;
}

/** Para precargar el formulario: el último pedido completo de la persona y lo que busca entrenando (D139). */
export async function briefPrefill(userId: string) {
  const rels = await myGymRelations(userId);
  const last = await lastCompleteBrief(userId);
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

export async function programRequestState(userId: string, now = new Date()) {
  // Primero el perfil: si un pedido anterior ya traía un dato esencial que el perfil no tiene, se completa solo.
  await healProfileFromBrief(userId, now).catch(() => []);
  const pending = await pendingBriefs(userId);
  return { pending, late: pending.length ? null : await lateBrief(userId, now), prefill: await briefPrefill(userId) };
}

/**
 * Lo que busca entrenando se actualiza con lo nuevo del pedido sobre el perfil canónico (D217: cambio parcial con procedencia
 * «pedido de programa»; el nivel del pedido es la experiencia declarada). Las lesiones NO van ahí (sólo viajan con el pedido).
 */
async function syncWishes(userId: string, b: ProgramRequestBrief) {
  // 13/11: con la política de edad aplicada ANTES de guardar. Un objetivo corporal sin edad adulta confirmada hacía fallar el
  // cambio entero (y el error se tragaba): el perfil se quedaba también sin días, minutos ni experiencia.
  const { age } = await profileOf(userId);
  await updateProfile(userId, briefProfilePatch(b, age), "program_request");
}

/** Al crear un pedido nuevo: deja el brief y actualiza lo que busca entrenando. */
export async function afterBriefSaved(userId: string, b: ProgramRequestBrief) {
  await syncWishes(userId, b).catch(() => {});
}

/**
 * Completa los pedidos de programa que no tenían preferencias. Abiertos: las adjunta, rehace el texto del pedido y avisa a
 * quien lo tomó (gym). Si no hay abiertos pero sí uno YA RESPONDIDO sin datos: las adjunta a ese pedido tal como quedó (no lo
 * reabre ni le cambia el texto) y avisa a quien lo respondió, que decide si ajusta la rutina. En los dos casos los datos van
 * al perfil de entrenamiento. Sin ninguno, no crea nada (para pedir uno nuevo está «Pedir mi programa»).
 */
export async function completeProgramBrief(userId: string, input: unknown) {
  const b = parseBrief(input);
  const pending = await pendingBriefs(userId);
  const late = pending.length ? [] : await answeredWithoutBrief(userId);
  if (!pending.length && !late.length) throw new AccessError("no_pending", "No tenés pedidos de programa esperando tus datos.", 409);
  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const gymIds = pending.filter((p) => p.source === "gym").map((p) => p.id), reqIds = pending.filter((p) => p.source === "coach").map((p) => p.id);
  const lateGym = late.filter((p) => p.source === "gym").map((p) => p.id), lateReq = late.filter((p) => p.source === "coach").map((p) => p.id);
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
    // Ya respondidos: el pedido conserva su estado y su texto; sólo se le suman las preferencias.
    if (lateGym.length) {
      const rows = await tx.select().from(gymTask).where(inArray(gymTask.id, lateGym));
      for (const t of rows) {
        await tx.update(gymTask).set({ context: { ...(t.context ?? {}), brief: b } }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { actor: userId, kind: "member_comment", note: "Completó sus preferencias después de recibir el programa (objetivo, días, experiencia y lesiones)." });
        await audit(tx, { actorUserId: userId, orgId: t.orgId, action: "task.brief_completed", resourceType: "gym_task", resourceId: t.id, meta: { hasLimitations: b.hasLimitations, late: true } });
      }
    }
    if (lateReq.length) {
      await tx.update(studentRequest).set({ brief: b }).where(inArray(studentRequest.id, lateReq));
      await audit(tx, { actorUserId: userId, action: "request.brief_completed", resourceType: "student_request", resourceId: lateReq[0], meta: { count: lateReq.length, hasLimitations: b.hasLimitations, late: true } });
    }
    return out;
  });
  // Incidente 07/11: el aviso se encola después del commit. Antes usaba otra conexión del pool con la transacción abierta
  // (con 3 conexiones podía trabar el pool) y salía aunque la transacción se deshiciera.
  for (const x of taken) {
    await enqueue([x.to], { kind: "assist_update", dedupe: `brief-done:${x.id}`, title: "Ya tenés los datos para el programa", body: `${me?.name ?? "El socio"} completó objetivo, días, experiencia y lesiones.`, url: `/gym/${x.orgId}?s=queue&sel=${x.id}` }).catch(() => {});
  }
  // Pedido ya respondido: a quien lo respondió (si sigue en la app), con la ficha a un toque. Sin datos de salud en el aviso.
  for (const x of late) {
    if (!x.handler || x.handler === userId) continue;
    await enqueue([x.handler], { kind: "assist_update", dedupe: `brief-late:${x.id}`, title: "Datos nuevos para una rutina", body: `${me?.name ?? "Un socio"} completó objetivo, días, experiencia y lesiones después de recibir su programa. Fijate si conviene ajustarlo.`,
      url: x.source === "gym" ? `/gym/${x.orgId}?s=member&sel=${x.memberId}` : `/coach/${x.orgId}?s=inbox` }).catch(() => {});
  }
  await syncWishes(userId, b).catch(() => {});
  // La respuesta del caso de siempre (pedido abierto) no cambia; `late` sólo aparece cuando el pedido ya estaba respondido.
  return { completed: pending.length + late.length, ...(late.length ? { late: true as const } : {}) };
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
