// Push real (anexo 26/10 §7): dispositivos registrados por acción explícita, cola persistente con reintentos y
// deduplicación, limpieza de suscripciones inválidas. "sent" = el proveedor aceptó el envío; NO es "entregado" ni "leído".
// La fuente de verdad es siempre la bandeja/alerta guardada: un push fallido no pierde nada.
import webpush from "web-push";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";

const { pushSubscription, notificationOutbox, notifyPref } = schema;
const MAX_ATTEMPTS = 5;

function configured() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY, subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) return false;
  webpush.setVapidDetails(subj, pub, priv);
  return true;
}
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

export async function subscribe(userId: string, p: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  if (!/^https:\/\//.test(p.endpoint) || p.endpoint.length > 1000 || !p.keys?.p256dh || !p.keys?.auth) throw new AccessError("invalid", "Suscripción inválida.");
  await db.insert(pushSubscription).values({ userId, endpoint: p.endpoint, p256dh: p.keys.p256dh, auth: p.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId, p256dh: p.keys.p256dh, auth: p.keys.auth, revokedAt: null, failCount: 0 } });
  return { ok: true };
}
export async function unsubscribe(userId: string, endpoint: string) {
  await db.update(pushSubscription).set({ revokedAt: new Date() }).where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
  return { ok: true };
}
export async function setPaused(userId: string, paused: boolean) {
  await db.insert(notifyPref).values({ userId, paused }).onConflictDoUpdate({ target: notifyPref.userId, set: { paused, updatedAt: new Date() } });
  return { paused };
}
export async function pushStatus(userId: string) {
  const subs = await db.select({ id: pushSubscription.id, lastOkAt: pushSubscription.lastOkAt, ua: pushSubscription.userAgent }).from(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), isNull(pushSubscription.revokedAt)));
  const [p] = await db.select().from(notifyPref).where(eq(notifyPref.userId, userId));
  return { configured: configured(), publicKey: pushPublicKey(), devices: subs.length, paused: p?.paused ?? false };
}

/** Encola avisos (idempotente por dedupeKey) y dispara el envío sin esperar: la acción del usuario nunca depende del push. */
export async function enqueue(userIds: string[], n: { kind: "join_request" | "join_escalation" | "floor_alert" | "join_resolved"; dedupe: string; title: string; body: string; url: string }) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  const rows = await db.insert(notificationOutbox).values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body, url: n.url, dedupeKey: `${n.dedupe}:${userId}` })))
    .onConflictDoNothing().returning({ id: notificationOutbox.id });
  if (rows.length) void processOutbox().catch(() => {});
  return rows.length;
}

/** Procesa la cola: envía a cada dispositivo vigente; 404/410 revoca la suscripción; otros errores reintentan con espera creciente. */
export async function processOutbox(limit = 50, now = new Date()) {
  const due = await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.status, "pending"), lte(notificationOutbox.nextAttemptAt, now)))
    .orderBy(asc(notificationOutbox.createdAt)).limit(limit);
  if (!due.length) return { processed: 0 };
  const ok = configured();
  const users = [...new Set(due.map((d) => d.userId))];
  const subs = await db.select().from(pushSubscription).where(and(inArray(pushSubscription.userId, users), isNull(pushSubscription.revokedAt)));
  const paused = new Set((await db.select().from(notifyPref).where(and(inArray(notifyPref.userId, users), eq(notifyPref.paused, true)))).map((p) => p.userId));
  let sent = 0;
  for (const n of due) {
    // Reclamar la fila (evita doble envío si dos procesos corren a la vez).
    const claim = await db.update(notificationOutbox).set({ attempts: sql`${notificationOutbox.attempts} + 1` })
      .where(and(eq(notificationOutbox.id, n.id), eq(notificationOutbox.status, "pending"), eq(notificationOutbox.attempts, n.attempts))).returning();
    if (!claim.length) continue;
    const mine = subs.filter((s) => s.userId === n.userId);
    if (!ok || paused.has(n.userId) || !mine.length) {
      await db.update(notificationOutbox).set({ status: "skipped", lastError: !ok ? "push sin configurar" : paused.has(n.userId) ? "avisos pausados" : "sin dispositivos" }).where(eq(notificationOutbox.id, n.id));
      continue;
    }
    let anyOk = false, lastErr = "";
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.kind }), { TTL: 600, urgency: "high" });
        anyOk = true;
        await db.update(pushSubscription).set({ lastOkAt: new Date(), failCount: 0 }).where(eq(pushSubscription.id, s.id));
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        lastErr = `${code ?? ""} ${(e as Error).message}`.trim().slice(0, 200);
        if (code === 404 || code === 410) await db.update(pushSubscription).set({ revokedAt: new Date() }).where(eq(pushSubscription.id, s.id));
        else await db.update(pushSubscription).set({ failCount: s.failCount + 1 }).where(eq(pushSubscription.id, s.id));
      }
    }
    if (anyOk) { sent++; await db.update(notificationOutbox).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(notificationOutbox.id, n.id)); }
    else {
      const attempts = claim[0].attempts;
      await db.update(notificationOutbox).set(attempts >= MAX_ATTEMPTS ? { status: "failed", lastError: lastErr } : { lastError: lastErr, nextAttemptAt: new Date(now.getTime() + 30_000 * 2 ** attempts) })
        .where(eq(notificationOutbox.id, n.id));
    }
  }
  return { processed: due.length, sent };
}
