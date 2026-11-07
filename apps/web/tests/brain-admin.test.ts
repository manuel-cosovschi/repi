// D210 · REPI Admin «Coaching IA»: métricas agregadas del cerebro (sin ids de personas ni contenido) y límites de la IA
// (global y por organización) con validación estricta y auditoría. Sólo administradores de plataforma con 2FA.
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requiresTwoFactor } from "@repi/domain";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import { AccessError } from "@/server/access/util";
import { appendMessage, setFeedback } from "@/server/brain/conversation";
import { upsertIntervention } from "@/server/brain/store";
import { loadPolicy } from "@/server/brain/gateway";
import { brainMetrics, updateBrainPolicy } from "@/server/brain/admin";

const { brainIntervention, brainAction, aiUsage, aiBreaker, aiPolicy, auditEvent, notificationOutbox } = schema;
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const SECRET = "TEXTO-PRIVADO-DE-UN-AVISO";
const person = async (extra: Partial<typeof schema.user.$inferInsert> = {}) => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Persona Admin", email: `${id}@test.repi.local`, emailVerified: true, birthDate: "1990-01-01", ...extra });
  return id;
};
let admin = "", priorGlobal: Record<string, unknown> | null = null;
beforeAll(async () => {
  admin = await person({ platformRole: "admin", twoFactorEnabled: true });
  priorGlobal = (await db.select().from(aiPolicy).where(eq(aiPolicy.scope, "global")))[0]?.config ?? null;
});
afterAll(async () => { // la política global es compartida con otras pruebas: queda como estaba
  if (priorGlobal) await db.update(aiPolicy).set({ config: priorGlobal }).where(eq(aiPolicy.scope, "global"));
  else await db.delete(aiPolicy).where(eq(aiPolicy.scope, "global"));
});

describe("métricas agregadas", () => {
  it("cuenta avisos, acciones, preguntas, opinión, IA (p50/p95), duplicados y estado, sin ids de personas ni textos", async () => {
    const before = await brainMetrics(admin);
    const u = await person(), v = await person();
    const card = async (user: string, status: string, reason: string | null = null, kind = "pr") => {
      const r = await upsertIntervention(user, { kind, category: "achievement", dedupeKey: `${kind}:${randomUUID()}`, channel: "card", title: `T ${SECRET}`, body: `B ${SECRET}`, evidence: null,
        ...(status === "suppressed" ? { status: "suppressed" as const, reason } : {}) });
      if (status !== "pending" && status !== "suppressed") await db.update(brainIntervention).set({ status: status as "accepted" }).where(eq(brainIntervention.id, r.intervention.id));
    };
    await card(u, "pending"); await card(u, "accepted"); await card(u, "accepted"); await card(v, "dismissed"); await card(v, "never"); await card(v, "expired"); await card(u, "cancelled");
    await card(u, "suppressed", "quiet_hours"); await card(v, "suppressed", "daily_cap"); await card(v, "suppressed", "daily_cap");
    for (const [status, k] of [["executed", "save_preference"], ["executed", "apply_substitution"], ["blocked", "propose_to_coach"], ["failed", "apply_short_session"]] as const) {
      await db.insert(brainAction).values({ userId: u, kind: k, idempotencyKey: `${k}:${randomUUID().slice(0, 12)}`, status, autonomy: 1 });
    }
    const m1 = await appendMessage(u, { role: "repi", text: `Respuesta ${SECRET}`, via: "rules" });
    await appendMessage(u, { role: "repi", text: "Otra", via: "rules" });
    const m3 = await appendMessage(u, { role: "repi", text: "Con IA", via: "ai" });
    await appendMessage(u, { role: "repi", text: "Sin IA por límite", via: "fallback" });
    await appendMessage(u, { role: "user", text: `Pregunta ${SECRET}` });
    await setFeedback(u, m1.message.id, 1); await setFeedback(u, m3.message.id, -1);
    const task = `test.${randomUUID().slice(0, 8)}`;
    for (const [outcome, latencyMs, cost] of [["ok", 100, 50], ["ok", 200, 50], ["ok", 300, 50], ["error", 900, 0], ["budget", null, 0], ["cache", null, 0]] as const) {
      await db.insert(aiUsage).values({ userId: u, task, model: "gpt-6-luna", outcome, latencyMs, inputTokens: outcome === "ok" ? 400 : 0, outputTokens: outcome === "ok" ? 60 : 0, costMicros: cost });
    }
    await db.insert(auditEvent).values({ actorUserId: null, action: "brain.proactive_run", resourceType: "brain", resourceId: "prueba", meta: { duplicates: 3, evaluated: 2, emitted: 1, pushed: 0, failed: 0, ms: 12, budgetHit: false } });
    await db.insert(notificationOutbox).values({ userId: u, kind: "brain_coaching", title: "x", body: "x", url: "/app", dedupeKey: `brain:test:${randomUUID()}`, status: "skipped" });
    await db.insert(aiBreaker).values({ task: "brain.intent", failures: 5, openedUntil: new Date(Date.now() + 5 * 60_000) })
      .onConflictDoUpdate({ target: aiBreaker.task, set: { failures: 5, openedUntil: new Date(Date.now() + 5 * 60_000) } });

    const m = await brainMetrics(admin);
    const d = (a: number, b: number) => a - b;
    expect({
      emitted: d(m.recommendations.emitted, before.recommendations.emitted), accepted: d(m.recommendations.accepted, before.recommendations.accepted),
      dismissed: d(m.recommendations.dismissed, before.recommendations.dismissed), rejected: d(m.recommendations.rejected, before.recommendations.rejected),
      ignored: d(m.recommendations.ignored, before.recommendations.ignored), open: d(m.recommendations.open, before.recommendations.open),
      cancelled: d(m.recommendations.cancelled, before.recommendations.cancelled), suppressed: d(m.recommendations.suppressed, before.recommendations.suppressed),
      quiet: d(m.recommendations.suppressedByReason.quiet_hours ?? 0, before.recommendations.suppressedByReason.quiet_hours ?? 0),
      cap: d(m.recommendations.suppressedByReason.daily_cap ?? 0, before.recommendations.suppressedByReason.daily_cap ?? 0),
      dup: d(m.recommendations.duplicatesAvoided, before.recommendations.duplicatesAvoided),
    }).toEqual({ emitted: 7, accepted: 2, dismissed: 1, rejected: 1, ignored: 1, open: 1, cancelled: 1, suppressed: 3, quiet: 1, cap: 2, dup: 3 });
    expect([d(m.actions.executed, before.actions.executed), d(m.actions.blocked, before.actions.blocked), d(m.actions.failed, before.actions.failed)]).toEqual([2, 1, 1]);
    expect({ rules: d(m.questions.rules, before.questions.rules), ai: d(m.questions.ai, before.questions.ai), fallback: d(m.questions.fallback, before.questions.fallback),
      withoutAi: d(m.questions.withoutAi, before.questions.withoutAi) }).toEqual({ rules: 2, ai: 1, fallback: 1, withoutAi: 3 });
    expect([d(m.feedback.positive, before.feedback.positive), d(m.feedback.negative, before.feedback.negative)]).toEqual([1, 1]);
    const g = m.ai.byTaskModel.find((r) => r.task === task)!;
    expect(g).toMatchObject({ model: "gpt-6-luna", calls: 4, ok: 3, errors: 1, budget: 1, cache: 1, inputTokens: 1200, outputTokens: 180, costMicros: 150, p50LatencyMs: 250, p95LatencyMs: 810 });
    expect(m.engine.breakers.find((b) => b.task === "brain.intent")).toMatchObject({ open: true, failures: 5, threshold: 5 });
    expect(m.engine.proactive.last).toMatchObject({ evaluated: 2, emitted: 1, ms: 12 });
    expect((m.engine.push.skipped ?? 0) - (before.engine.push.skipped ?? 0)).toBe(1);
    expect(m.ai.configured).toBe(false); // sin clave en las pruebas
    // Agregado: ningún id de persona ni texto de avisos o mensajes.
    const json = JSON.stringify(m);
    for (const x of [u, v, SECRET]) expect(json).not.toContain(x);
    await db.delete(aiBreaker).where(eq(aiBreaker.task, "brain.intent"));
  });

  it("sólo administradores (con 2FA si la política lo exige): otra persona 404", async () => {
    expect(await err(brainMetrics(await person()))).toMatchObject({ status: 404 });
    const no2fa = await err(brainMetrics(await person({ platformRole: "admin", twoFactorEnabled: false })));
    if (requiresTwoFactor({ platformAdmin: true })) expect(no2fa).toMatchObject({ code: "twofa_required", status: 403 });
    else expect(no2fa).toBeNull();
    expect(await err(updateBrainPolicy(await person(), { scope: "global", config: { enabled: false } }))).toMatchObject({ status: 404 });
  });
});

describe("límites de la IA (ai_policy)", () => {
  it("parche validado y auditado: global y por organización; null vuelve al heredado; el gateway lo lee", async () => {
    const r = await updateBrainPolicy(admin, { scope: "global", config: { user_daily_calls: 10, models: { "brain.chat": "gpt-6-luna" } } });
    expect(r).toMatchObject({ scope: "global", config: { user_daily_calls: 10, models: { "brain.chat": "gpt-6-luna" } }, effective: { user_daily_calls: 10, enabled: true } });
    const [a] = await db.select().from(auditEvent).where(and(eq(auditEvent.action, "brain.policy_updated"), eq(auditEvent.actorUserId, admin))).orderBy(desc(auditEvent.at)).limit(1);
    expect(a).toMatchObject({ resourceType: "ai_policy", resourceId: "global", meta: { fields: ["user_daily_calls", "models"], after: { user_daily_calls: 10 } } });
    expect((await loadPolicy(null, null)).user_daily_calls).toBe(10);
    // Organización: apagar la IA del cerebro sólo para ella (el resto sigue).
    const owner = await person();
    const org = await acc.createCoachOrganization(owner, { brand: "Coach Política" });
    const o = await updateBrainPolicy(admin, { scope: `org:${org.id}`, config: { enabled: false, org_monthly_micros: 5_000_000 } });
    expect(o.effective).toMatchObject({ enabled: false, org_monthly_micros: 5_000_000, user_daily_calls: 10 });
    expect((await loadPolicy(null, org.id)).enabled).toBe(false);
    expect((await loadPolicy(null, null)).enabled).toBe(true);
    // null: vuelve al valor heredado (por defecto, 30 llamadas).
    const back = await updateBrainPolicy(admin, { scope: "global", config: { user_daily_calls: null, models: { "brain.chat": null } } });
    expect(back.config).toEqual({});
    expect(back.effective.user_daily_calls).toBe(30);
  });

  it("validación estricta: campo desconocido, fuera de rango, modelo sin precio, tope global en una organización → 400; organización inexistente → 404", async () => {
    const owner = await person();
    const org = await acc.createCoachOrganization(owner, { brand: "Coach Validación" });
    for (const bad of [
      { scope: "global", config: { admin: true } },
      { scope: "global", config: { user_daily_calls: -1 } },
      { scope: "global", config: { user_daily_calls: 5000 } },
      { scope: "global", config: { max_concurrency: 1.5 } },
      { scope: "global", config: { models: { "brain.chat": "gpt-4.1-mini" } } }, // sin precio conocido: saltearía el presupuesto
      { scope: "global", config: { models: { "brain.otra": "gpt-6-luna" } } },
      { scope: `org:${org.id}`, config: { global_daily_micros: 1 } },
      { scope: "user:alguien", config: { enabled: false } },
      { scope: "todo", config: {} },
      { scope: "global", config: "x" },
    ]) expect(await err(updateBrainPolicy(admin, bad)), JSON.stringify(bad)).toMatchObject({ code: "invalid", status: 400 });
    expect(await err(updateBrainPolicy(admin, { scope: "org:no-existe", config: { enabled: false } }))).toMatchObject({ status: 404 });
  });
});
