// Push real (anexo 26/10 §7): dispositivos registrados por acción explícita, cola persistente con reintentos y
// deduplicación, limpieza de suscripciones inválidas. "sent" = el proveedor aceptó el envío; NO es "entregado" ni "leído".
// La fuente de verdad es siempre la bandeja/alerta guardada: un push fallido no pierde nada.
import webpush from "web-push";
import { after } from "next/server";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { ageEligibility, localDate } from "@repi/domain";
import { CATEGORY_PREF } from "@repi/domain/brain/relevance";
import { inQuiet, nextAllowed } from "@repi/domain/brain/quiet";
import { DEFAULT_PREFS, type BrainPrefs, type InterventionCategory } from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { assistantOn, getPrefs, updatePrefs } from "../brain/prefs";
import { bodyEligibility } from "../progress/body";
import { AFTER_DEADLINE_MS, withDeadline } from "../deadline";

const { pushSubscription, notificationOutbox, notifyPref, brainPref, brainIntervention, user } = schema;
const MAX_ATTEMPTS = 5;
/** Tiempo máximo de cada envío a un servicio de push (ms). */
const PUSH_TIMEOUT_MS = 10_000;

function configured() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY, subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) return false;
  webpush.setVapidDetails(subj, pub, priv);
  return true;
}
// SEC-7 (QA 29/10): el servidor manda los avisos a ese endpoint; sólo se aceptan los servicios de push de los navegadores.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function pushHostAllowed(endpoint: string) {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname)); } catch { return false; }
}
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

/**
 * Registra este dispositivo (cualquier persona con sesión: staff y socios). D210: con `coaching: true` el socio además activa
 * las notificaciones de REPI fuera de la app (brain_pref.push) en el mismo paso; sólo adultos confirmados (menor o edad
 * desconocida: 403 y no se registra nada). Sin `coaching` el comportamiento es el de siempre.
 */
export async function subscribe(userId: string, p: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null, o: { coaching?: boolean } = {}) {
  if (!pushHostAllowed(p.endpoint) || p.endpoint.length > 1000 || !p.keys?.p256dh || !p.keys?.auth) throw new AccessError("invalid", "Suscripción inválida.");
  if (o.coaching) {
    const age = await bodyEligibility(userId);
    if (age === "minor") throw new AccessError("minor_restricted", "Las notificaciones de REPI fuera de la app son sólo para mayores de 18 años.", 403);
    if (age !== "adult") throw new AccessError("age_required", "Para recibir notificaciones de REPI fuera de la app confirmá tu fecha de nacimiento.", 403);
  }
  await db.insert(pushSubscription).values({ userId, endpoint: p.endpoint, p256dh: p.keys.p256dh, auth: p.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId, p256dh: p.keys.p256dh, auth: p.keys.auth, revokedAt: null, failCount: 0 } });
  if (o.coaching) return { ok: true, coaching: (await updatePrefs(userId, { push: true })).push };
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
  // D210: estado del push de REPI (sólo de la propia persona): activado en sus preferencias y si su edad lo permite.
  const [prefs, age] = await Promise.all([getPrefs(userId), bodyEligibility(userId).catch(() => "unknown" as const)]);
  return { configured: configured(), publicKey: pushPublicKey(), devices: subs.length, paused: p?.paused ?? false, coaching: { enabled: prefs.push && age === "adult", eligible: age === "adult" } };
}

/** Encola avisos (idempotente por dedupeKey) y dispara el envío sin esperar: la acción del usuario nunca depende del push. */
export async function enqueue(userIds: string[], n: { kind: (typeof notificationOutbox.$inferInsert)["kind"]; dedupe: string; title: string; body: string; url: string }) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  const rows = await db.insert(notificationOutbox).values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body, url: n.url, dedupeKey: `${n.dedupe}:${userId}` })))
    .onConflictDoNothing().returning({ id: notificationOutbox.id });
  if (rows.length) runAfterResponse(() => processOutbox());
  return rows.length;
}

/** En serverless el trabajo posterior a la respuesta se registra con after(); fuera de una petición (scripts, tests) corre suelto. */
function runAfterResponse(job: () => Promise<unknown>) {
  // Incidente 07/11: con tiempo máximo, para que un envío trabado no mantenga viva la función hasta el corte. Lo que quede
  // pendiente en la cola lo retoma el cron.
  const bounded = () => withDeadline(job(), AFTER_DEADLINE_MS, "push.after").catch(() => {});
  try { after(bounded); } catch { void bounded(); }
}

// ── Push de REPI (D210) ─────────────────────────────────────────────────────
type OutboxRow = typeof notificationOutbox.$inferSelect;
/** Clave de un aviso de REPI en la cola: brain:<categoría>:<id del aviso>:<persona> (la arma proactive.ts). */
const BRAIN_KEY = /^brain:([a-z_]+):([0-9a-f-]{36}):/;
/** Un aviso de REPI que no se pudo mandar en el día ya no se manda (sigue como tarjeta en la app). */
export const BRAIN_PUSH_MAX_AGE_MS = 24 * 3_600_000;
type Gate = { skip: string } | { postponeTo: Date };

/**
 * Reglas al enviar (no sólo al encolar): las preferencias o la edad pudieron cambiar mientras el aviso esperaba. Menor o edad
 * sin confirmar → nunca (caso 59). Push de REPI o asistencia apagados, categoría apagada → no. Ya visto, resuelto o vencido en la
 * app → no (caso 51). Horario de silencio → se posterga hasta que termine, sin gastar intentos (caso 47).
 */
async function brainGates(rows: OutboxRow[], now: Date): Promise<Map<string, Gate>> {
  const out = new Map<string, Gate>();
  const brain = rows.filter((r) => r.kind === "brain_coaching");
  if (!brain.length) return out;
  const users = [...new Set(brain.map((r) => r.userId))];
  const ids = [...new Set(brain.map((r) => BRAIN_KEY.exec(r.dedupeKey)?.[2]).filter((x): x is string => !!x))];
  const [prefRows, people, ivs] = await Promise.all([
    db.select().from(brainPref).where(inArray(brainPref.userId, users)),
    db.select({ id: user.id, birth: user.birthDate }).from(user).where(inArray(user.id, users)),
    ids.length ? db.select({ id: brainIntervention.id, userId: brainIntervention.userId, status: brainIntervention.status, expiresAt: brainIntervention.expiresAt })
      .from(brainIntervention).where(inArray(brainIntervention.id, ids)) : Promise.resolve([]),
  ]);
  const prefsOf = new Map(prefRows.map((r) => [r.userId, { ...r, categories: { ...DEFAULT_PREFS.categories, ...(r.categories ?? {}) } }]));
  const birth = new Map(people.map((u) => [u.id, u.birth]));
  const iv = new Map(ivs.map((i) => [i.id, i]));
  const today = localDate(now);
  const moduleOn = assistantOn();
  for (const r of brain) {
    const m = BRAIN_KEY.exec(r.dedupeKey);
    const p: Pick<BrainPrefs, "push" | "proactive" | "categories" | "quietStart" | "quietEnd"> = prefsOf.get(r.userId) ?? DEFAULT_PREFS;
    const pref = m ? CATEGORY_PREF[m[1] as InterventionCategory] : undefined;
    const i = m ? iv.get(m[2]) : undefined;
    if (!moduleOn) out.set(r.id, { skip: "asistente apagado" }); // interruptor del módulo: lo encolado tampoco sale
    else if (!m || !i || i.userId !== r.userId) out.set(r.id, { skip: "aviso de REPI inexistente" });
    else if (ageEligibility(birth.get(r.userId), today) !== "adult") out.set(r.id, { skip: "menor o edad sin confirmar" });
    else if (!p.push || !p.proactive) out.set(r.id, { skip: "push de REPI apagado" });
    else if (pref && p.categories[pref] === false) out.set(r.id, { skip: "categoría apagada" });
    else if (i.status !== "pending") out.set(r.id, { skip: "ya visto en la app" });
    else if ((i.expiresAt && i.expiresAt.getTime() <= now.getTime()) || now.getTime() - r.createdAt.getTime() > BRAIN_PUSH_MAX_AGE_MS) out.set(r.id, { skip: "aviso vencido" });
    else if (inQuiet(now, p.quietStart, p.quietEnd)) out.set(r.id, { postponeTo: nextAllowed(now, p.quietStart, p.quietEnd) });
  }
  return out;
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
  const gates = await brainGates(due, now);
  let sent = 0, postponed = 0;
  for (const n of due) {
    // D210: avisos de REPI. Postergar no reclama la fila ni gasta un intento; descartar es definitivo (la tarjeta sigue en la app).
    const g = gates.get(n.id);
    if (g && "postponeTo" in g) {
      const r = await db.update(notificationOutbox).set({ nextAttemptAt: g.postponeTo })
        .where(and(eq(notificationOutbox.id, n.id), eq(notificationOutbox.status, "pending"), eq(notificationOutbox.attempts, n.attempts))).returning({ id: notificationOutbox.id });
      postponed += r.length;
      continue;
    }
    if (g) {
      await db.update(notificationOutbox).set({ status: "skipped", lastError: g.skip }).where(and(eq(notificationOutbox.id, n.id), eq(notificationOutbox.status, "pending")));
      continue;
    }
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
        // timeout: web-push no pone ninguno por defecto; un servicio de push que acepta la conexión y no contesta colgaba la cola.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.kind }), { TTL: 600, urgency: "high", timeout: PUSH_TIMEOUT_MS });
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
  return { processed: due.length, sent, postponed };
}
