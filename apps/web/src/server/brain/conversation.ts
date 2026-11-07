// Conversación con REPI (D209, contrato §5): una conversación abierta por persona, mensajes con procedencia (`via`) y
// opinión. Es privada: sólo la lee su dueño (userId de la sesión); ni el entrenador ni la gerencia ni REPI Admin. Retención:
// 180 días (purga diaria). Al modelo se le manda un resumen y los últimos turnos (lastTurns), no todo el historial.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { ActionProposal, ReplyCard, Section } from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";

const { brainThread, brainMessage } = schema;
const NOT_FOUND_THREAD = () => new AccessError("not_found", "No encontramos esa conversación.", 404);
const NOT_FOUND_MESSAGE = () => new AccessError("not_found", "No encontramos ese mensaje.", 404);
export const MESSAGE_MAX = { user: 1_000, repi: 4_000 } as const;
const ID_RE = /^[\w-]{8,64}$/;

export type ThreadView = { id: string; createdAt: string; updatedAt: string; closedAt: string | null };
export type MessageView = {
  id: string; threadId: string; role: "user" | "repi"; text: string; cards: ReplyCard[]; actions: ActionProposal[]; section: string | null;
  ref: Record<string, string | number | null> | null; via: "rules" | "ai" | "fallback" | "safety" | null; feedback: -1 | 1 | null; createdAt: string;
};
const threadView = (t: typeof brainThread.$inferSelect): ThreadView => ({
  id: t.id, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), closedAt: t.closedAt ? t.closedAt.toISOString() : null,
});
const messageView = (m: typeof brainMessage.$inferSelect): MessageView => ({
  id: m.id, threadId: m.threadId, role: m.role, text: m.text, cards: m.cards ?? [], actions: m.actions ?? [], section: m.section,
  ref: m.ref ?? null, via: m.via, feedback: (m.feedback as -1 | 1 | null) ?? null, createdAt: m.createdAt.toISOString(),
});

async function openThread(userId: string) {
  const [t] = await db.select().from(brainThread).where(and(eq(brainThread.userId, userId), isNull(brainThread.closedAt)));
  return t ?? null;
}
async function ownThread(userId: string, threadId: string) {
  const [t] = await db.select().from(brainThread).where(and(eq(brainThread.id, threadId), eq(brainThread.userId, userId)));
  if (!t) throw NOT_FOUND_THREAD();
  return t;
}

/** La conversación abierta, o una nueva. Dos pedidos simultáneos terminan en la misma (índice único parcial). */
export async function currentThread(userId: string, now = new Date()): Promise<ThreadView> {
  const cur = await openThread(userId);
  if (cur) return threadView(cur);
  await db.insert(brainThread).values({ userId, createdAt: now, updatedAt: now }).onConflictDoNothing();
  const t = await openThread(userId);
  if (!t) throw new AccessError("conflict", "No pudimos abrir la conversación. Probá de nuevo.", 409);
  return threadView(t);
}

/**
 * Agrega un mensaje a una conversación abierta propia (sin `threadId`, a la vigente). Con `id` del cliente, un reintento
 * devuelve el mismo mensaje sin duplicarlo. Responder en una conversación cerrada no se permite (409).
 */
export async function appendMessage(userId: string, m: {
  id?: string; threadId?: string; role: "user" | "repi"; text: string; cards?: ReplyCard[]; actions?: ActionProposal[];
  section?: Section | null; ref?: Record<string, string | number | null> | null; via?: "rules" | "ai" | "fallback" | "safety" | null;
}, now?: Date): Promise<{ message: MessageView; created: boolean }> {
  if (m.role !== "user" && m.role !== "repi") throw new AccessError("invalid", "Mensaje inválido.");
  const text = (m.text ?? "").trim();
  if (!text) throw new AccessError("invalid", "Escribí un mensaje.");
  if (text.length > MESSAGE_MAX[m.role]) throw new AccessError("invalid", "El mensaje es demasiado largo.");
  if (m.id !== undefined && !ID_RE.test(m.id)) throw new AccessError("invalid", "Identificador de mensaje inválido.");
  const extra = JSON.stringify({ c: m.cards ?? null, a: m.actions ?? null, r: m.ref ?? null });
  if (extra.length > 16_000) throw new AccessError("invalid", "La respuesta es demasiado larga.");
  const thread = await ownThread(userId, m.threadId ?? (await currentThread(userId, now)).id);
  if (m.id) {
    const [dup] = await db.select().from(brainMessage).where(eq(brainMessage.id, m.id));
    if (dup) {
      if (dup.userId !== userId) throw new AccessError("conflict", "No pudimos guardar el mensaje. Probá de nuevo.", 409);
      return { message: messageView(dup), created: false };
    }
  }
  if (thread.closedAt) throw new AccessError("thread_closed", "Esa conversación está cerrada. Empezá una nueva.", 409);
  const [row] = await db.insert(brainMessage).values({
    ...(m.id ? { id: m.id } : {}), threadId: thread.id, userId, role: m.role, text, cards: m.cards ?? null, actions: m.actions ?? null,
    section: m.section ?? null, ref: m.ref ?? null, via: m.role === "repi" ? (m.via ?? "rules") : null,
    ...(now ? { createdAt: now } : {}), // sin `now`, la hora de la base (microsegundos): el orden de dos mensajes seguidos no empata
  }).onConflictDoNothing().returning();
  if (!row) {
    // Carrera con un reintento del mismo id: devolvemos el que quedó (si es de esta persona).
    const [dup] = await db.select().from(brainMessage).where(and(eq(brainMessage.id, m.id ?? ""), eq(brainMessage.userId, userId)));
    if (!dup) throw new AccessError("conflict", "No pudimos guardar el mensaje. Probá de nuevo.", 409);
    return { message: messageView(dup), created: false };
  }
  await db.update(brainThread).set({ updatedAt: row.createdAt }).where(eq(brainThread.id, thread.id));
  return { message: messageView(row), created: true };
}

/**
 * Últimos `limit` mensajes en orden cronológico, de una conversación propia o de la abierta (sin crearla). `upTo`: sólo hasta ese
 * mensaje inclusive (mismo orden que la lista: hora de la base y, si empatan, id), para releer lo que había antes de un reintento.
 */
export async function listMessages(userId: string, opts: { threadId?: string; limit?: number; upTo?: string } = {}): Promise<MessageView[]> {
  const thread = opts.threadId ? await ownThread(userId, opts.threadId) : await openThread(userId);
  if (!thread) return [];
  const upTo = opts.upTo ? sql`(${brainMessage.createdAt}, ${brainMessage.id}) <= (select m.created_at, m.id from brain_message m where m.id = ${opts.upTo} and m.user_id = ${userId})` : undefined;
  const rows = await db.select().from(brainMessage).where(and(eq(brainMessage.threadId, thread.id), eq(brainMessage.userId, userId), upTo))
    .orderBy(desc(brainMessage.createdAt), desc(brainMessage.id)).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  return rows.reverse().map(messageView);
}

/** Para el modelo: los últimos n turnos (por defecto 6) de la conversación abierta, sólo rol y texto. */
export async function lastTurns(userId: string, n = 6) {
  return (await listMessages(userId, { limit: n })).map((m) => ({ role: m.role, text: m.text }));
}

/** La conversación vigente con sus mensajes (GET /api/me/brain/thread). No crea una nueva. */
export async function threadWithMessages(userId: string, limit = 50) {
  const t = await openThread(userId);
  return { thread: t ? threadView(t) : null, messages: t ? await listMessages(userId, { threadId: t.id, limit }) : [] };
}

/** Cierra la conversación abierta (o la indicada, si es propia). Idempotente: cerrar lo cerrado no falla. */
export async function closeThread(userId: string, threadId?: string, now = new Date()): Promise<{ closed: boolean }> {
  if (threadId) await ownThread(userId, threadId);
  const rows = await db.update(brainThread).set({ closedAt: now, updatedAt: now })
    .where(and(eq(brainThread.userId, userId), isNull(brainThread.closedAt), threadId ? eq(brainThread.id, threadId) : sql`true`)).returning({ id: brainThread.id });
  return { closed: rows.length > 0 };
}

/** Opinión sobre una respuesta de REPI (−1, 1 o null para quitarla). Sólo mensajes propios de REPI. */
export async function setFeedback(userId: string, messageId: string, value: -1 | 1 | null): Promise<MessageView> {
  if (value !== -1 && value !== 1 && value !== null) throw new AccessError("invalid", "Opinión inválida.");
  const [r] = await db.update(brainMessage).set({ feedback: value })
    .where(and(eq(brainMessage.id, messageId), eq(brainMessage.userId, userId), eq(brainMessage.role, "repi"))).returning();
  if (!r) throw NOT_FOUND_MESSAGE();
  return messageView(r);
}
