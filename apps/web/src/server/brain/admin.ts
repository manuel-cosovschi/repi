// REPI Admin · Coaching IA (D209, contrato §5 «admin.ts», máster §24). Métricas agregadas del cerebro y límites de la IA.
// Detrás de requireAdmin (rol de plataforma + 2FA). Todo es agregado: ningún id de persona, ningún texto de avisos, mensajes,
// memoria ni prompts; sólo cantidades por tipo, estado, motivo, tarea y modelo. Las cifras salen de las tablas reales
// (brain_intervention, brain_action, brain_message, ai_usage, ai_breaker, ai_policy, notification_outbox, audit_event): no hay
// métricas inventadas.
import { and, desc, eq, gte, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiOn } from "../ai/openai";
import { requireAdmin } from "../commercial/services";
import { BREAKER_FAILURES, DEFAULT_POLICY, PRICES, clearAiCache, mergePolicy, modelFor, type AiTask } from "./gateway";

const { brainIntervention, brainAction, brainMessage, aiUsage, aiBreaker, aiPolicy, notificationOutbox, auditEvent, organization } = schema;
const DAY = 86_400_000;
const TASKS: readonly AiTask[] = ["brain.chat", "brain.intent", "brain.explain"];
/** Resultados que significan «se llamó al proveedor» (mismo criterio que la cuota del gateway). */
const CALLED = ["ok", "error", "timeout", "cancelled", "refused", "bad_output"] as const;
const ERRORS = ["error", "timeout", "cancelled", "refused", "bad_output"] as const;
const inList = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const n = (v: unknown) => Number(v ?? 0) || 0;

export type BrainMetrics = Awaited<ReturnType<typeof brainMetrics>>;

/**
 * Métricas de los últimos `days` días (1–400; por defecto 7), terminando en `now`. Recomendaciones: emitidas (todo lo que no
 * se calló), aceptadas, descartadas («Descartar»: la persona la vio y eligió otra cosa), rechazadas («No mostrar algo
 * parecido»), ignoradas (vencieron sin respuesta), abiertas y canceladas por obsoletas; calladas por motivo y duplicados
 * evitados por el cron. Acciones por estado. Preguntas resueltas por reglas, con IA, sin IA por límite o falla (fallback) y
 * respuestas fijas de seguridad; opinión explícita. IA por tarea y modelo: llamadas, tokens, costo, latencia p50/p95, errores,
 * rechazos por cuota/presupuesto/breaker/concurrencia y aciertos de caché. Estado de los motores: breakers, política vigente,
 * última corrida del cron proactivo y la cola de push de REPI.
 */
export async function brainMetrics(actorId: string, o: { days?: number; now?: Date } = {}) {
  await requireAdmin(actorId);
  const now = o.now ?? new Date();
  const days = Math.min(Math.max(Math.floor(o.days ?? 7), 1), 400);
  const since = new Date(now.getTime() - days * DAY);
  const inWindow = (col: typeof brainIntervention.createdAt) => and(gte(col, since), lt(col, now));

  const [ivStatus, ivKind, ivReason, actRows, msgRows, fbRows, aiRows, breakers, policies, runs, lastRun, outbox] = await Promise.all([
    db.select({ status: brainIntervention.status, n: sql<number>`count(*)::int` }).from(brainIntervention).where(inWindow(brainIntervention.createdAt)).groupBy(brainIntervention.status),
    db.select({ kind: brainIntervention.kind, status: brainIntervention.status, n: sql<number>`count(*)::int` }).from(brainIntervention)
      .where(inWindow(brainIntervention.createdAt)).groupBy(brainIntervention.kind, brainIntervention.status),
    db.select({ reason: brainIntervention.reason, n: sql<number>`count(*)::int` }).from(brainIntervention)
      .where(and(inWindow(brainIntervention.createdAt), eq(brainIntervention.status, "suppressed"))).groupBy(brainIntervention.reason),
    db.select({ kind: brainAction.kind, status: brainAction.status, n: sql<number>`count(*)::int` }).from(brainAction)
      .where(and(gte(brainAction.createdAt, since), lt(brainAction.createdAt, now))).groupBy(brainAction.kind, brainAction.status),
    db.select({ via: brainMessage.via, n: sql<number>`count(*)::int` }).from(brainMessage)
      .where(and(eq(brainMessage.role, "repi"), gte(brainMessage.createdAt, since), lt(brainMessage.createdAt, now))).groupBy(brainMessage.via),
    db.select({ v: brainMessage.feedback, n: sql<number>`count(*)::int` }).from(brainMessage)
      .where(and(eq(brainMessage.role, "repi"), sql`${brainMessage.feedback} is not null`, gte(brainMessage.createdAt, since), lt(brainMessage.createdAt, now))).groupBy(brainMessage.feedback),
    db.select({
      task: aiUsage.task, model: aiUsage.model,
      calls: sql<number>`count(*) filter (where ${aiUsage.outcome} in (${inList(CALLED)}))::int`,
      ok: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'ok')::int`,
      errors: sql<number>`count(*) filter (where ${aiUsage.outcome} in (${inList(ERRORS)}))::int`,
      timeouts: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'timeout')::int`,
      badOutput: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'bad_output')::int`,
      quota: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'quota')::int`,
      budget: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'budget')::int`,
      breaker: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'breaker')::int`,
      concurrency: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'concurrency')::int`,
      cache: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'cache')::int`,
      inFlight: sql<number>`count(*) filter (where ${aiUsage.outcome} is null)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::float8`, cachedTokens: sql<number>`coalesce(sum(${aiUsage.cachedTokens}), 0)::float8`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::float8`, costMicros: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)::float8`,
      p50: sql<number | null>`percentile_cont(0.5) within group (order by ${aiUsage.latencyMs}) filter (where ${aiUsage.outcome} in (${inList(CALLED)}))::float8`,
      p95: sql<number | null>`percentile_cont(0.95) within group (order by ${aiUsage.latencyMs}) filter (where ${aiUsage.outcome} in (${inList(CALLED)}))::float8`,
    }).from(aiUsage).where(and(gte(aiUsage.createdAt, since), lt(aiUsage.createdAt, now))).groupBy(aiUsage.task, aiUsage.model).orderBy(aiUsage.task, aiUsage.model),
    db.select().from(aiBreaker).orderBy(aiBreaker.task),
    db.select({ scope: aiPolicy.scope, config: aiPolicy.config, updatedAt: aiPolicy.updatedAt }).from(aiPolicy)
      .where(or(eq(aiPolicy.scope, "global"), like(aiPolicy.scope, "org:%"))).orderBy(aiPolicy.scope),
    db.select({ duplicates: sql<number>`coalesce(sum((${auditEvent.meta}->>'duplicates')::int), 0)::int`, runs: sql<number>`count(*)::int`,
      failed: sql<number>`coalesce(sum((${auditEvent.meta}->>'failed')::int), 0)::int`, pushed: sql<number>`coalesce(sum((${auditEvent.meta}->>'pushed')::int), 0)::int`,
      budgetHits: sql<number>`count(*) filter (where (${auditEvent.meta}->>'budgetHit')::boolean)::int` })
      .from(auditEvent).where(and(eq(auditEvent.action, "brain.proactive_run"), gte(auditEvent.at, since), lt(auditEvent.at, now))),
    db.select({ at: auditEvent.at, result: auditEvent.result, meta: auditEvent.meta }).from(auditEvent).where(eq(auditEvent.action, "brain.proactive_run")).orderBy(desc(auditEvent.at)).limit(1),
    db.select({ status: notificationOutbox.status, n: sql<number>`count(*)::int` }).from(notificationOutbox)
      .where(and(eq(notificationOutbox.kind, "brain_coaching"), gte(notificationOutbox.createdAt, since), lt(notificationOutbox.createdAt, now))).groupBy(notificationOutbox.status),
  ]);

  const st = Object.fromEntries(ivStatus.map((r) => [r.status, r.n])) as Partial<Record<string, number>>;
  const total = ivStatus.reduce((s, r) => s + r.n, 0);
  const byKind: Record<string, { emitted: number; accepted: number; dismissed: number; never: number; ignored: number; suppressed: number }> = {};
  for (const r of ivKind) {
    const k = (byKind[r.kind] ??= { emitted: 0, accepted: 0, dismissed: 0, never: 0, ignored: 0, suppressed: 0 });
    if (r.status === "suppressed") k.suppressed += r.n; else k.emitted += r.n;
    if (r.status === "accepted") k.accepted += r.n;
    if (r.status === "dismissed") k.dismissed += r.n;
    if (r.status === "never") k.never += r.n;
    if (r.status === "expired") k.ignored += r.n;
  }
  const actions = { executed: 0, blocked: 0, failed: 0, cancelled: 0, proposed: 0, confirmed: 0, byKind: {} as Record<string, Record<string, number>> };
  for (const r of actRows) {
    actions[r.status] += r.n;
    (actions.byKind[r.kind] ??= {})[r.status] = (actions.byKind[r.kind][r.status] ?? 0) + r.n;
  }
  const via = Object.fromEntries(msgRows.map((r) => [r.via ?? "unknown", r.n])) as Partial<Record<string, number>>;
  const fb = Object.fromEntries(fbRows.map((r) => [String(r.v), r.n])) as Partial<Record<string, number>>;
  const openUntil = (d: Date | null) => !!d && d.getTime() > now.getTime();
  const global = policies.find((p) => p.scope === "global")?.config ?? null;
  const effective = mergePolicy(global);
  const run = runs[0];
  const last = lastRun[0] ? { ...lastRun[0], meta: (lastRun[0].meta ?? {}) as Record<string, unknown> } : null;
  const ai = aiRows.map((r) => ({ ...r, costUsd: Math.round(r.costMicros) / 1e6, p50LatencyMs: r.p50 == null ? null : Math.round(r.p50), p95LatencyMs: r.p95 == null ? null : Math.round(r.p95) }))
    .map(({ p50: _a, p95: _b, ...rest }) => rest);
  const sum = (k: keyof (typeof ai)[number]) => ai.reduce((s, r) => s + n(r[k]), 0);
  return {
    window: { since: since.toISOString(), until: now.toISOString(), days },
    recommendations: {
      emitted: total - (st.suppressed ?? 0), accepted: st.accepted ?? 0, dismissed: st.dismissed ?? 0, rejected: st.never ?? 0, ignored: st.expired ?? 0,
      open: (st.pending ?? 0) + (st.shown ?? 0), cancelled: st.cancelled ?? 0, suppressed: st.suppressed ?? 0,
      suppressedByReason: Object.fromEntries(ivReason.map((r) => [r.reason ?? "unknown", r.n])),
      duplicatesAvoided: run?.duplicates ?? 0,
      byKind,
    },
    actions,
    questions: { rules: via.rules ?? 0, ai: via.ai ?? 0, fallback: via.fallback ?? 0, safety: via.safety ?? 0, withoutAi: (via.rules ?? 0) + (via.fallback ?? 0) + (via.safety ?? 0) },
    feedback: { positive: fb["1"] ?? 0, negative: fb["-1"] ?? 0 },
    ai: {
      configured: aiOn(),
      totals: { calls: sum("calls"), errors: sum("errors"), costUsd: Math.round(sum("costMicros")) / 1e6, inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"),
        budget: sum("budget"), quota: sum("quota"), breaker: sum("breaker"), cache: sum("cache") },
      byTaskModel: ai,
    },
    engine: {
      breakers: TASKS.map((task) => {
        const b = breakers.find((x) => x.task === task);
        return { task, model: modelFor(task, effective), failures: b?.failures ?? 0, open: openUntil(b?.openedUntil ?? null), openedUntil: b?.openedUntil?.toISOString() ?? null, threshold: BREAKER_FAILURES };
      }),
      policy: { global: global ?? {}, effective, defaults: DEFAULT_POLICY, orgs: policies.filter((p) => p.scope.startsWith("org:")).map((p) => ({ scope: p.scope, config: p.config, updatedAt: p.updatedAt.toISOString() })) },
      models: Object.entries(PRICES).map(([model, price]) => ({ model, price, selectable: !!price })),
      proactive: {
        runs: run?.runs ?? 0, failedUsers: run?.failed ?? 0, pushed: run?.pushed ?? 0, budgetHits: run?.budgetHits ?? 0,
        last: last ? { at: last.at.toISOString(), result: last.result, evaluated: n(last.meta?.evaluated), emitted: n(last.meta?.emitted), ms: n(last.meta?.ms) } : null,
      },
      push: Object.fromEntries(outbox.map((r) => [r.status, r.n])),
    },
  };
}

// ── Límites (ai_policy) ─────────────────────────────────────────────────────
const SELECTABLE = Object.entries(PRICES).filter(([, p]) => !!p).map(([m]) => m);
const model = z.string().refine((m) => SELECTABLE.includes(m), "Modelo sin precio conocido");
const Models = z.object({ "brain.chat": model.nullable(), "brain.intent": model.nullable(), "brain.explain": model.nullable() }).strict().partial();
const Common = {
  enabled: z.boolean().nullable(),
  user_daily_calls: z.number().int().min(0).max(1_000).nullable(),
  org_monthly_micros: z.number().int().min(0).max(1_000_000_000).nullable(), // hasta US$1.000 por mes por organización
  models: Models.nullable(),
};
const GlobalPatch = z.object({ ...Common,
  global_daily_micros: z.number().int().min(0).max(100_000_000).nullable(), // hasta US$100 por día
  max_concurrency: z.number().int().min(0).max(50).nullable(),
}).strict().partial();
const OrgPatch = z.object(Common).strict().partial(); // los topes globales sólo se leen del alcance global
const Scope = z.union([z.literal("global"), z.string().regex(/^org:[\w-]{1,64}$/)]);

/**
 * Cambia los límites de un alcance (global u organización) por parche: lo enviado se guarda, `null` vuelve al valor heredado y
 * lo no enviado queda igual. Validación estricta (campo desconocido, fuera de rango o modelo sin precio → 400; topes globales
 * en una organización → 400; organización inexistente → 404). Queda auditado con el antes y el después (son números de
 * configuración, no datos de personas). Con 0 llamadas o presupuesto, la IA del cerebro queda apagada y todo sigue por reglas.
 */
export async function updateBrainPolicy(actorId: string, input: unknown, now = new Date()) {
  await requireAdmin(actorId);
  const raw = (input ?? {}) as { scope?: unknown; config?: unknown };
  const scope = Scope.safeParse(raw.scope);
  if (!scope.success) throw new AccessError("invalid", "Alcance inválido: usá «global» u «org:<id>».");
  const isGlobal = scope.data === "global";
  const patch = (isGlobal ? GlobalPatch : OrgPatch).safeParse(raw.config);
  if (!patch.success) throw new AccessError("invalid", "Revisá los límites: hay un valor que no corresponde.");
  if (!isGlobal) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, scope.data.slice(4)));
    if (!org) throw new AccessError("not_found", "No encontramos esa organización.", 404);
  }
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(aiPolicy).where(eq(aiPolicy.scope, scope.data)).for("update");
    const before = (cur?.config ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...before };
    for (const [k, v] of Object.entries(patch.data)) {
      if (v === null) { delete next[k]; continue; }
      if (k === "models") {
        const m = { ...((before.models as Record<string, unknown> | undefined) ?? {}) };
        for (const [t, x] of Object.entries(v as Record<string, string | null>)) { if (x === null) delete m[t]; else m[t] = x; }
        if (Object.keys(m).length) next.models = m; else delete next.models;
        continue;
      }
      next[k] = v;
    }
    await tx.insert(aiPolicy).values({ scope: scope.data, config: next, updatedAt: now, updatedBy: actorId })
      .onConflictDoUpdate({ target: aiPolicy.scope, set: { config: next, updatedAt: now, updatedBy: actorId } });
    await audit(tx, { actorUserId: actorId, orgId: isGlobal ? null : scope.data.slice(4), action: "brain.policy_updated", resourceType: "ai_policy", resourceId: scope.data,
      meta: { fields: Object.keys(patch.data), before, after: next } });
    clearAiCache(); // un cambio de modelo no debe responder con lo cacheado del anterior
    const [g] = isGlobal ? [{ config: next }] : await tx.select({ config: aiPolicy.config }).from(aiPolicy).where(eq(aiPolicy.scope, "global"));
    return { scope: scope.data, config: next, effective: isGlobal ? mergePolicy(next) : mergePolicy(g?.config ?? null, next) };
  });
}
