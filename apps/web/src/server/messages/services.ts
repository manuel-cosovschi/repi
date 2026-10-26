// Mensajería (D40, F-MS-01/02, F-HX-27). Sólo entre participantes de una relación válida:
// coach ↔ alumno (coach_client) y equipo de sala de la sede ↔ socio (gym_member). Gerencia y dueño no leen contenido.
// Estados: enviado (guardado), entregado (la app del destinatario lo recibió), leído (abrió la conversación).
// Retención: pendiente (D40). Al terminar la relación la conversación queda en sólo lectura; no se borra automáticamente.
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { DELIVERY_LABEL, MESSAGE_MAX, deliveryState, gymCan } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { user, organization, gymLocation, staffMembership, coachClient, gymMember, conversation, message, conversationMarker } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos esta conversación.", 404);

type Conv = typeof conversation.$inferSelect;
type Side = "member" | "staff";

async function ensureConversation(kind: "coach_client" | "gym_member", relationId: string) {
  const [found] = await db.select().from(conversation).where(and(eq(conversation.kind, kind), eq(conversation.relationId, relationId)));
  if (found) return found;
  if (kind === "coach_client") {
    const [r] = await db.select().from(coachClient).where(eq(coachClient.id, relationId));
    if (!r) throw NOT_FOUND();
    const [c] = await db.insert(conversation).values({ kind, relationId, orgId: r.coachOrgId, memberUserId: r.userId }).onConflictDoNothing().returning();
    return c ?? (await db.select().from(conversation).where(and(eq(conversation.kind, kind), eq(conversation.relationId, relationId))))[0];
  }
  const [m] = await db.select().from(gymMember).where(eq(gymMember.id, relationId));
  if (!m) throw NOT_FOUND();
  const [c] = await db.insert(conversation).values({ kind, relationId, orgId: m.orgId, locationId: m.locationId, memberUserId: m.userId }).onConflictDoNothing().returning();
  return c ?? (await db.select().from(conversation).where(and(eq(conversation.kind, kind), eq(conversation.relationId, relationId))))[0];
}

/** ¿Quién puede participar? Socio/alumno dueño de la relación, o staff autorizado de esa relación. */
async function access(userId: string, c: Conv): Promise<{ side: Side; active: boolean } | null> {
  const active = await relationActive(c);
  if (c.memberUserId === userId) return { side: "member", active };
  const roles = (await db.select({ role: staffMembership.role, loc: staffMembership.locationId }).from(staffMembership)
    .where(and(eq(staffMembership.userId, userId), eq(staffMembership.orgId, c.orgId), eq(staffMembership.status, "active"))));
  if (c.kind === "coach_client") return roles.some((r) => r.role === "coach_owner") ? { side: "staff", active } : null;
  const ok = roles.filter((r) => !r.loc || r.loc === c.locationId).map((r) => r.role);
  return gymCan(ok, "messages.floor") ? { side: "staff", active } : null;
}
async function relationActive(c: Conv) {
  if (c.kind === "coach_client") { const [r] = await db.select({ s: coachClient.status }).from(coachClient).where(eq(coachClient.id, c.relationId)); return r?.s === "active"; }
  const [m] = await db.select({ s: gymMember.status }).from(gymMember).where(eq(gymMember.id, c.relationId));
  return m?.s === "active";
}

async function mark(convIds: string[], userId: string, side: Side, what: "delivered" | "read", at = new Date()) {
  for (const id of convIds) {
    const set = what === "read" ? { deliveredAt: at, readAt: at } : { deliveredAt: at };
    await db.insert(conversationMarker).values({ conversationId: id, userId, side, ...set }).onConflictDoUpdate({ target: [conversationMarker.conversationId, conversationMarker.userId], set });
  }
}

async function unreadFor(convIds: string[], userId: string, side: Side) {
  if (!convIds.length) return new Map<string, number>();
  const rows = await db.select({ id: message.conversationId, n: sql<number>`count(*)::int` }).from(message)
    .leftJoin(conversationMarker, and(eq(conversationMarker.conversationId, message.conversationId), eq(conversationMarker.userId, userId)))
    .where(and(inArray(message.conversationId, convIds), sql`${message.senderSide} <> ${side}`, or(isNull(conversationMarker.readAt), gt(message.createdAt, conversationMarker.readAt))))
    .groupBy(message.conversationId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function lastMessages(convIds: string[]) {
  if (!convIds.length) return new Map<string, typeof message.$inferSelect>();
  const rows = await db.selectDistinctOn([message.conversationId]).from(message).where(inArray(message.conversationId, convIds)).orderBy(message.conversationId, desc(message.createdAt));
  return new Map(rows.map((r) => [r.conversationId, r]));
}

// ── Listas de conversaciones ────────────────────────────────────────────────
/** Socio/alumno: una conversación por relación activa (coach y equipo de sala). Marca como entregados los mensajes recibidos. */
export async function myThreads(userId: string) {
  const coachRels = await db.select({ rel: coachClient, org: organization }).from(coachClient).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(and(eq(coachClient.userId, userId), eq(coachClient.status, "active")));
  const gymRels = await db.select({ m: gymMember, org: organization, loc: gymLocation }).from(gymMember).innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active")));
  const out: { id: string; kind: "coach_client" | "gym_member"; title: string; subtitle: string }[] = [];
  for (const r of coachRels) {
    const c = await ensureConversation("coach_client", r.rel.id);
    const [coach] = await db.select({ name: user.name }).from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
      .where(and(eq(staffMembership.orgId, r.org.id), eq(staffMembership.role, "coach_owner"), eq(staffMembership.status, "active")));
    out.push({ id: c.id, kind: "coach_client", title: coach?.name ?? r.org.name, subtitle: "Tu coach" });
  }
  for (const r of gymRels) {
    const c = await ensureConversation("gym_member", r.m.id);
    out.push({ id: c.id, kind: "gym_member", title: `Equipo de sala · ${r.org.name}`, subtitle: r.loc.name });
  }
  const ids = out.map((o) => o.id);
  await mark(ids, userId, "member", "delivered");
  const unread = await unreadFor(ids, userId, "member");
  const last = await lastMessages(ids);
  return out.map((o) => ({ ...o, unread: unread.get(o.id) ?? 0, last: last.get(o.id) ? { body: last.get(o.id)!.body.slice(0, 120), at: last.get(o.id)!.createdAt, mine: last.get(o.id)!.senderSide === "member" } : null }));
}

/** Coach: hilos con sus clientes activos y pausados (pausados en sólo lectura). */
export async function coachThreads(actorId: string, orgId: string) {
  const [own] = await db.select().from(staffMembership).where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.role, "coach_owner"), eq(staffMembership.status, "active")));
  if (!own) throw NOT_FOUND();
  const rels = await db.select({ rel: coachClient, name: user.name }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(coachClient.coachOrgId, orgId), inArray(coachClient.status, ["active", "paused"]))).orderBy(asc(user.name));
  const convs = [];
  for (const r of rels) convs.push({ c: await ensureConversation("coach_client", r.rel.id), name: r.name, relId: r.rel.id, active: r.rel.status === "active" });
  return staffList(actorId, convs);
}

/** Equipo de sala: hilos de socios de su sede que escribieron o a quienes se les escribió. */
export async function floorThreads(actorId: string, orgId: string, locationId: string) {
  const roles = await db.select({ role: staffMembership.role, loc: staffMembership.locationId }).from(staffMembership)
    .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")));
  if (!gymCan(roles.filter((r) => !r.loc || r.loc === locationId).map((r) => r.role), "messages.floor")) throw NOT_FOUND();
  const rows = await db.select({ c: conversation, name: user.name, st: gymMember.status }).from(conversation).innerJoin(gymMember, eq(gymMember.id, conversation.relationId)).innerJoin(user, eq(user.id, gymMember.userId))
    .where(and(eq(conversation.kind, "gym_member"), eq(conversation.orgId, orgId), eq(conversation.locationId, locationId), sql`${conversation.lastMessageAt} is not null`))
    .orderBy(desc(conversation.lastMessageAt)).limit(100);
  return staffList(actorId, rows.map((r) => ({ c: r.c, name: r.name, relId: r.c.relationId, active: r.st === "active" })));
}

async function staffList(actorId: string, convs: { c: Conv; name: string; relId: string; active: boolean }[]) {
  const ids = convs.map((x) => x.c.id);
  await mark(ids, actorId, "staff", "delivered");
  const unread = await unreadFor(ids, actorId, "staff");
  const last = await lastMessages(ids);
  return convs.map((x) => {
    const l = last.get(x.c.id);
    return { id: x.c.id, relId: x.relId, name: x.name, active: x.active, unread: unread.get(x.c.id) ?? 0, last: l ? { body: l.body.slice(0, 120), at: l.createdAt, mine: l.senderSide === "staff" } : null };
  }).sort((a, b) => (b.last?.at?.getTime() ?? 0) - (a.last?.at?.getTime() ?? 0) || a.name.localeCompare(b.name));
}

/** Socio de la sede para el que el equipo abre conversación (desde la ficha). */
export async function floorConversationFor(actorId: string, orgId: string, gymMemberId: string) {
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m) throw NOT_FOUND();
  const c = await ensureConversation("gym_member", m.id);
  if (!(await access(actorId, c))) throw NOT_FOUND();
  return { id: c.id };
}

// ── Conversación ────────────────────────────────────────────────────────────
export async function getThread(userId: string, conversationId: string, opts: { before?: string | null } = {}) {
  const [c] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  if (!c) throw NOT_FOUND();
  const a = await access(userId, c);
  if (!a) throw NOT_FOUND(); // no revela que existe
  await mark([c.id], userId, a.side, "read");
  const before = opts.before ? new Date(opts.before) : null;
  const rows = await db.select({ m: message, name: user.name }).from(message).innerJoin(user, eq(user.id, message.senderUserId))
    .where(and(eq(message.conversationId, c.id), before && !Number.isNaN(before.getTime()) ? lt(message.createdAt, before) : undefined))
    .orderBy(desc(message.createdAt)).limit(60);
  const others = await db.select().from(conversationMarker).where(and(eq(conversationMarker.conversationId, c.id), sql`${conversationMarker.side} <> ${a.side}`));
  return {
    id: c.id, kind: c.kind, side: a.side, readOnly: !a.active,
    messages: rows.reverse().map(({ m, name }) => {
      const mine = m.senderSide === a.side;
      const st = mine ? deliveryState(m.createdAt, others) : null;
      // En el hilo del equipo de sala importa quién respondió; en el 1:1 con el coach no hace falta.
      return { id: m.id, body: m.body, at: m.createdAt, mine, sender: c.kind === "gym_member" && m.senderSide === "staff" && m.senderUserId !== userId ? name : null, state: st, stateLabel: st ? DELIVERY_LABEL[st] : null };
    }),
  };
}

/** Enviar: id del cliente para idempotencia (reintentos no duplican). La relación debe seguir activa. */
export async function sendMessage(userId: string, conversationId: string, p: { id: string; body: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(p.id ?? "")) throw new AccessError("invalid", "Identificador de mensaje inválido.");
  const body = (p.body ?? "").trim();
  if (!body) throw new AccessError("invalid", "Escribí un mensaje.");
  if (body.length > MESSAGE_MAX) throw new AccessError("invalid", `El mensaje puede tener hasta ${MESSAGE_MAX} caracteres.`);
  const [c] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  if (!c) throw NOT_FOUND();
  const a = await access(userId, c);
  if (!a) throw NOT_FOUND();
  if (!a.active) throw new AccessError("read_only", "Esta relación terminó: la conversación quedó en sólo lectura.", 409);
  const [existing] = await db.select().from(message).where(eq(message.id, p.id));
  if (existing) {
    if (existing.conversationId !== c.id || existing.senderUserId !== userId) throw new AccessError("invalid", "Identificador de mensaje inválido.");
    return { id: existing.id, at: existing.createdAt, duplicate: true };
  }
  const now = new Date();
  const [m] = await db.insert(message).values({ id: p.id, conversationId: c.id, senderUserId: userId, senderSide: a.side, body, createdAt: now }).onConflictDoNothing().returning();
  if (!m) return { id: p.id, at: now, duplicate: true };
  await db.update(conversation).set({ lastMessageAt: now }).where(eq(conversation.id, c.id));
  await mark([c.id], userId, a.side, "read", now);
  await audit(db, { actorUserId: userId, orgId: c.orgId, action: "message.sent", resourceType: "conversation", resourceId: c.id }); // sin contenido
  return { id: m.id, at: m.createdAt, duplicate: false };
}

/** Cantidad de conversaciones con mensajes sin leer (badge). */
export async function unreadCount(userId: string, side: Side, convIds: string[]) {
  const m = await unreadFor(convIds, userId, side);
  return [...m.values()].filter((n) => n > 0).length;
}
