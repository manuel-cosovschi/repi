// Privacidad de REPI Intelligence Core (D210, contrato §4 «Privacidad»): exportación de todo lo del cerebro de la persona y
// retención diaria. El borrado de la cuenta lo hace la cascada de las FK a `user` (y a `organization` en ai_usage); la purga
// de demos también la aprovecha (server/sandbox/services.ts).
import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { expireInterventions } from "../brain/store";
import { purgeExpiredMemory } from "../brain/memory";

const { brainPref, brainMemory, brainThread, brainMessage, brainIntervention, brainAction, aiUsage } = schema;
const DAY = 86_400_000;

/** Retención (días): mensajes 180; avisos resueltos, suprimidos o vencidos 90; uso de IA 400. */
export const BRAIN_RETENTION = { messagesDays: 180, interventionsDays: 90, aiUsageDays: 400 } as const;
/** Una fila «en curso» de ai_usage que sigue así después de esto quedó de una instancia que murió: se cierra como error. */
const STALE_INFLIGHT_MS = 60 * 60_000;

/** Todo lo del cerebro de la persona, sin ids internos de otras personas. ai_usage no tiene contenido (sólo tokens y costo). */
export async function exportBrainData(userId: string) {
  const [pref] = await db.select().from(brainPref).where(eq(brainPref.userId, userId));
  const threads = await db.select().from(brainThread).where(eq(brainThread.userId, userId)).orderBy(asc(brainThread.createdAt));
  const messages = await db.select({ threadId: brainMessage.threadId, role: brainMessage.role, text: brainMessage.text, cards: brainMessage.cards,
    actions: brainMessage.actions, section: brainMessage.section, ref: brainMessage.ref, via: brainMessage.via, feedback: brainMessage.feedback, createdAt: brainMessage.createdAt })
    .from(brainMessage).where(eq(brainMessage.userId, userId)).orderBy(asc(brainMessage.createdAt));
  const interventions = await db.select().from(brainIntervention).where(eq(brainIntervention.userId, userId)).orderBy(asc(brainIntervention.createdAt));
  return {
    notice: "Lo que REPI guarda para acompañarte: tus preferencias, lo que le pediste que recuerde, tus conversaciones, los avisos que te mostró o calló y las acciones que propuso. El uso de IA va sin contenido.",
    prefs: pref ? { proactive: pref.proactive, push: pref.push, categories: pref.categories, quietStart: pref.quietStart, quietEnd: pref.quietEnd,
      maxPerDay: pref.maxPerDay, autonomy: pref.autonomy, tone: pref.tone, updatedAt: pref.updatedAt } : null,
    memory: await db.select({ kind: brainMemory.kind, key: brainMemory.key, value: brainMemory.value, text: brainMemory.text, source: brainMemory.source,
      ref: brainMemory.ref, createdAt: brainMemory.createdAt, expiresAt: brainMemory.expiresAt, revokedAt: brainMemory.revokedAt })
      .from(brainMemory).where(eq(brainMemory.userId, userId)).orderBy(asc(brainMemory.createdAt)),
    conversations: threads.map((t) => ({
      startedAt: t.createdAt, closedAt: t.closedAt,
      messages: messages.filter((m) => m.threadId === t.id).map(({ threadId: _t, ...m }) => m),
    })),
    interventions: interventions.map((i) => ({
      kind: i.kind, status: i.status, channel: i.channel, reason: i.reason, title: i.payload?.title ?? null, body: i.payload?.body ?? null,
      category: i.payload?.category ?? null, evidence: i.evidence, createdAt: i.createdAt, shownAt: i.shownAt, resolvedAt: i.resolvedAt, expiresAt: i.expiresAt,
    })),
    actions: await db.select({ kind: brainAction.kind, status: brainAction.status, autonomy: brainAction.autonomy, input: brainAction.input, result: brainAction.result,
      error: brainAction.error, createdAt: brainAction.createdAt, executedAt: brainAction.executedAt })
      .from(brainAction).where(eq(brainAction.userId, userId)).orderBy(asc(brainAction.createdAt)),
    aiUsage: await db.select({ task: aiUsage.task, model: aiUsage.model, inputTokens: aiUsage.inputTokens, cachedTokens: aiUsage.cachedTokens,
      outputTokens: aiUsage.outputTokens, costMicros: aiUsage.costMicros, latencyMs: aiUsage.latencyMs, outcome: aiUsage.outcome, createdAt: aiUsage.createdAt })
      .from(aiUsage).where(eq(aiUsage.userId, userId)).orderBy(asc(aiUsage.createdAt)),
  };
}

/**
 * Purga diaria (job purge-media). Borra: mensajes de más de 180 días (y las conversaciones cerradas que quedan vacías);
 * avisos resueltos, suprimidos o vencidos hace más de 90 días (los «no mostrar más» se conservan: son la preferencia de la
 * persona y se borran con la cuenta); ai_usage de más de 400 días; memoria vencida o revocada. Antes vence los avisos que
 * pasaron su fecha y cierra filas de IA «en curso» huérfanas.
 */
export async function purgeBrainRetention(now = new Date()) {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  const expired = await expireInterventions(now);
  const messages = (await db.delete(brainMessage).where(lt(brainMessage.createdAt, before(BRAIN_RETENTION.messagesDays))).returning({ id: brainMessage.id })).length;
  const threads = (await db.delete(brainThread).where(and(isNotNull(brainThread.closedAt), lt(brainThread.updatedAt, before(BRAIN_RETENTION.messagesDays)),
    sql`not exists (select 1 from ${brainMessage} where ${brainMessage.threadId} = ${brainThread.id})`)).returning({ id: brainThread.id })).length;
  const cutoff = before(BRAIN_RETENTION.interventionsDays);
  const interventions = (await db.delete(brainIntervention).where(or(
    and(notInArray(brainIntervention.status, ["pending", "shown", "never"]), sql`coalesce(${brainIntervention.resolvedAt}, ${brainIntervention.createdAt}) < ${cutoff.toISOString()}::timestamptz`),
    // Pendientes sin fecha de vencimiento que nadie resolvió en 90 días: ya no son vigentes.
    and(inArray(brainIntervention.status, ["pending", "shown"]), lt(brainIntervention.createdAt, cutoff)),
  )).returning({ id: brainIntervention.id })).length;
  const usage = (await db.delete(aiUsage).where(lt(aiUsage.createdAt, before(BRAIN_RETENTION.aiUsageDays))).returning({ id: aiUsage.id })).length;
  const staleInflight = (await db.update(aiUsage).set({ outcome: "error" })
    .where(and(isNull(aiUsage.outcome), lt(aiUsage.createdAt, new Date(now.getTime() - STALE_INFLIGHT_MS)))).returning({ id: aiUsage.id })).length;
  const memory = await purgeExpiredMemory(now);
  return { messages, threads, interventions, expiredInterventions: expired, aiUsage: usage, staleInflight, memory };
}
