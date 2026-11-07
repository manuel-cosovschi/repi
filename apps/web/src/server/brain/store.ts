// Persistencia del cerebro (D209): avisos (brain_intervention), acciones (brain_action) y uso de IA (ai_usage).
// Contrato: docs/adaptive/ADAPTIVE_COACHING_3.md §4–§5. Capa fina y tipada: cada función recibe el userId de la sesión y
// filtra por él (un id ajeno responde 404, igual que uno inexistente). Las reglas (qué emitir, qué ejecutar) viven en el
// dominio y en server/brain/{proactive,actions}.ts; acá sólo se garantiza idempotencia y transiciones atómicas.
import { and, desc, eq, gte, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { localDate } from "@repi/domain";
import {
  CATEGORY_RANK, type ActionKind, type Autonomy, type CardAction, type Channel, type Evidence, type InterventionCategory,
  type InterventionStatus, type RecentIntervention,
} from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { AccessError, type Tx } from "../access/util";

const { brainIntervention, brainAction, aiUsage } = schema;
type Q = Tx | typeof db;

// ── Utilidades ──────────────────────────────────────────────────────────────
/** Inicio del día en hora argentina (UTC−3 fijo, sin horario de verano desde 2009; mismo criterio que localDate/TZ). */
export const arDayStart = (now: Date) => new Date(`${localDate(now)}T00:00:00-03:00`);
/** Inicio del mes en hora argentina. */
export const arMonthStart = (now: Date) => new Date(`${localDate(now).slice(0, 7)}-01T00:00:00-03:00`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const toDate = (v: string | Date | null | undefined) => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new AccessError("invalid", "Fecha inválida.");
  return d;
};
/** Objeto JSON acotado: lo que no es objeto o pasa del tope no se guarda (evita filas gigantes desde un cliente). */
function boundedJson(v: unknown, max: number, what: string): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new AccessError("invalid", `${what}: formato inválido.`);
  if (JSON.stringify(v).length > max) throw new AccessError("invalid", `${what}: demasiado largo.`);
  return v as Record<string, unknown>;
}
/** Clave idempotente de acciones (llega del cliente): corta y con caracteres seguros. */
const KEY_RE = /^[\w:.\-]{1,120}$/;
/** Clave de deduplicación de avisos (la arma el dominio; puede incluir nombres): sin caracteres de control, hasta 200. */
const DEDUPE_RE = /^[^\p{Cc}]{1,200}$/u;

// ── Avisos (brain_intervention) ─────────────────────────────────────────────
const CHANNELS: readonly Channel[] = ["card", "inline", "push"];
const isCategory = (c: unknown): c is InterventionCategory => typeof c === "string" && c in CATEGORY_RANK;

export type InterventionInput = {
  kind: string;
  category: InterventionCategory;
  /** Clave estable (incluye período o versión); única por persona. */
  dedupeKey: string;
  title: string;
  body: string;
  evidence: Evidence | null;
  channel: Channel;
  actions?: CardAction[];
  expiresAt?: string | Date | null;
  programVersionId?: string | null;
  /** "suppressed" registra lo que el motor de relevancia calló (métricas), con su motivo. */
  status?: "pending" | "suppressed";
  reason?: string | null;
  /** Datos extra para la tarjeta (refs a ejercicio/sesión). Sin contenido de terceros. */
  data?: Record<string, unknown>;
};
export type InterventionView = {
  id: string; kind: string; category: InterventionCategory; title: string; body: string; evidence: Evidence | null;
  actions: CardAction[]; data: Record<string, unknown>; channel: Channel; status: InterventionStatus; reason: string | null;
  priority: number; programVersionId: string | null; createdAt: string; shownAt: string | null; resolvedAt: string | null; expiresAt: string | null;
};
type InterventionRow = typeof brainIntervention.$inferSelect;
const RANK_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_RANK).map(([k, v]) => [v, k])) as Record<number, InterventionCategory>;
const categoryOf = (r: InterventionRow): InterventionCategory =>
  isCategory(r.payload?.category) ? r.payload.category : RANK_TO_CATEGORY[r.priority] ?? "reminder";
const interventionView = (r: InterventionRow): InterventionView => ({
  id: r.id, kind: r.kind, category: categoryOf(r), title: String(r.payload?.title ?? ""), body: String(r.payload?.body ?? ""),
  evidence: r.evidence ?? null, actions: Array.isArray(r.payload?.actions) ? (r.payload.actions as CardAction[]) : [],
  data: (r.payload?.data && typeof r.payload.data === "object" ? r.payload.data : {}) as Record<string, unknown>,
  channel: r.channel, status: r.status, reason: r.reason, priority: r.priority, programVersionId: r.programVersionId,
  createdAt: r.createdAt.toISOString(), shownAt: iso(r.shownAt), resolvedAt: iso(r.resolvedAt), expiresAt: iso(r.expiresAt),
});
const NOT_FOUND_INTERVENTION = () => new AccessError("not_found", "No encontramos ese aviso.", 404);

/**
 * Registra un aviso una sola vez por (persona, dedupe_key): el cron y sus reintentos no duplican (caso 49). Si ya existía
 * suprimido (p. ej. por horario de silencio) y ahora corresponde emitirlo, pasa a pendiente; cualquier otro estado queda
 * como estaba (lo ya mostrado, aceptado o descartado no reaparece). `created`: fila nueva; `upgraded`: de suprimido a pendiente.
 */
export async function upsertIntervention(userId: string, c: InterventionInput, q: Q = db): Promise<{ intervention: InterventionView; created: boolean; upgraded: boolean }> {
  if (!DEDUPE_RE.test(c.dedupeKey ?? "") || !c.dedupeKey.trim()) throw new AccessError("invalid", "Clave de aviso inválida.");
  if (!c.kind || c.kind.length > 60) throw new AccessError("invalid", "Tipo de aviso inválido.");
  if (!isCategory(c.category)) throw new AccessError("invalid", "Categoría de aviso inválida.");
  if (!CHANNELS.includes(c.channel)) throw new AccessError("invalid", "Canal de aviso inválido.");
  const status = c.status ?? "pending";
  const payload = boundedJson({
    category: c.category, title: (c.title ?? "").slice(0, 160), body: (c.body ?? "").slice(0, 1000),
    actions: (c.actions ?? []).slice(0, 6), data: c.data ?? {},
  }, 8_000, "Aviso");
  const values = {
    userId, kind: c.kind, dedupeKey: c.dedupeKey, priority: CATEGORY_RANK[c.category], channel: c.channel, status,
    reason: c.reason?.slice(0, 120) ?? null, payload, evidence: c.evidence ?? null, programVersionId: c.programVersionId ?? null,
    expiresAt: toDate(c.expiresAt),
  };
  const [row] = await q.insert(brainIntervention).values(values).onConflictDoUpdate({
    target: [brainIntervention.userId, brainIntervention.dedupeKey],
    set: { status: sql`excluded.status`, reason: sql`excluded.reason`, payload: sql`excluded.payload`, evidence: sql`excluded.evidence`,
      channel: sql`excluded.channel`, priority: sql`excluded.priority`, expiresAt: sql`excluded.expires_at`, programVersionId: sql`excluded.program_version_id`,
      createdAt: sql`excluded.created_at` }, // emitido ahora: cuenta para el tope de hoy, no para el día en que se calló
    setWhere: sql`${brainIntervention.status} = 'suppressed' and excluded.status = 'pending'`,
  }).returning({ id: brainIntervention.id, inserted: sql<boolean>`(xmax = 0)` });
  const [cur] = await q.select().from(brainIntervention).where(and(eq(brainIntervention.userId, userId), eq(brainIntervention.dedupeKey, c.dedupeKey)));
  return { intervention: interventionView(cur), created: !!row?.inserted, upgraded: !!row && !row.inserted };
}

/** Historial reciente para el motor de relevancia (dedupe, cooldown, tope diario, «no mostrar algo parecido»). */
export async function recentInterventions(userId: string, opts: { since?: Date; limit?: number } = {}, now = new Date()): Promise<RecentIntervention[]> {
  const since = opts.since ?? new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db.select().from(brainIntervention)
    .where(and(eq(brainIntervention.userId, userId), or(gte(brainIntervention.createdAt, since), eq(brainIntervention.status, "never"))))
    .orderBy(desc(brainIntervention.createdAt)).limit(Math.min(opts.limit ?? 200, 500));
  return rows.map((r) => ({ kind: r.kind, category: categoryOf(r), dedupeKey: r.dedupeKey, status: r.status, createdAt: r.createdAt.toISOString(), channel: r.channel }));
}

/** Avisos vigentes (pendientes o mostrados, sin vencer), por prioridad: la tarjeta de Inicio y la campanita de REPI. */
export async function activeInterventions(userId: string, now = new Date(), limit = 10): Promise<InterventionView[]> {
  const rows = await db.select().from(brainIntervention)
    .where(and(eq(brainIntervention.userId, userId), inArray(brainIntervention.status, ["pending", "shown"]),
      or(sql`${brainIntervention.expiresAt} is null`, sql`${brainIntervention.expiresAt} > ${now.toISOString()}::timestamptz`)))
    .orderBy(brainIntervention.priority, desc(brainIntervention.createdAt)).limit(limit);
  return rows.map(interventionView);
}

export type InterventionMark = "shown" | "accepted" | "dismissed" | "never" | "expired" | "cancelled";
const MARK_FROM: Record<InterventionMark, InterventionStatus[]> = {
  shown: ["pending"],
  accepted: ["pending", "shown"], dismissed: ["pending", "shown"], never: ["pending", "shown", "dismissed"],
  expired: ["pending", "shown"], cancelled: ["pending", "shown"],
};
/**
 * Cambia el estado de un aviso propio de forma atómica. Repetir el mismo cambio no falla (idempotente); un cambio que no
 * corresponde (aceptar algo descartado) responde 409.
 */
export async function markIntervention(userId: string, id: string, to: InterventionMark, now = new Date(), reason?: string | null): Promise<{ intervention: InterventionView; changed: boolean }> {
  if (!(to in MARK_FROM)) throw new AccessError("invalid", "Estado de aviso inválido.");
  const terminal = to !== "shown";
  const [row] = await db.update(brainIntervention).set({
    status: to, reason: reason?.slice(0, 120) ?? sql`${brainIntervention.reason}`,
    shownAt: sql`coalesce(${brainIntervention.shownAt}, ${to === "shown" || to === "accepted" || to === "dismissed" || to === "never" ? now.toISOString() : null}::timestamptz)`,
    ...(terminal ? { resolvedAt: now } : {}),
  }).where(and(eq(brainIntervention.id, id), eq(brainIntervention.userId, userId), inArray(brainIntervention.status, MARK_FROM[to]))).returning();
  if (row) return { intervention: interventionView(row), changed: true };
  const [cur] = await db.select().from(brainIntervention).where(and(eq(brainIntervention.id, id), eq(brainIntervention.userId, userId)));
  if (!cur) throw NOT_FOUND_INTERVENTION();
  if (cur.status === to) return { intervention: interventionView(cur), changed: false };
  throw new AccessError("invalid_state", "Ese aviso ya se resolvió.", 409);
}

/** Cancela los avisos vigentes atados a otra versión del programa (caso 50: el cambio de rutina los vuelve obsoletos). */
export async function cancelObsoleteInterventions(userId: string, currentProgramVersionId: string | null, now = new Date()) {
  const rows = await db.update(brainIntervention).set({ status: "cancelled", reason: "program_changed", resolvedAt: now })
    .where(and(eq(brainIntervention.userId, userId), inArray(brainIntervention.status, ["pending", "shown"]), isNotNull(brainIntervention.programVersionId),
      currentProgramVersionId ? ne(brainIntervention.programVersionId, currentProgramVersionId) : sql`true`))
    .returning({ id: brainIntervention.id });
  return rows.length;
}

/** Barrido (todas las personas): lo pendiente o mostrado que ya venció pasa a «expired». */
export async function expireInterventions(now = new Date()) {
  const rows = await db.update(brainIntervention).set({ status: "expired", resolvedAt: now })
    .where(and(inArray(brainIntervention.status, ["pending", "shown"]), lt(brainIntervention.expiresAt, now))).returning({ id: brainIntervention.id });
  return rows.length;
}

// ── Acciones (brain_action) ─────────────────────────────────────────────────
export type ActionStatus = "proposed" | "confirmed" | "executed" | "failed" | "blocked" | "cancelled";
export type ActionView = {
  id: string; kind: string; idempotencyKey: string; status: ActionStatus; autonomy: Autonomy; input: Record<string, unknown>;
  result: Record<string, unknown> | null; error: string | null; createdAt: string; executedAt: string | null;
};
type ActionRow = typeof brainAction.$inferSelect;
const actionView = (r: ActionRow): ActionView => ({
  id: r.id, kind: r.kind, idempotencyKey: r.idempotencyKey, status: r.status, autonomy: r.autonomy as Autonomy, input: r.input ?? {},
  result: r.result ?? null, error: r.error, createdAt: r.createdAt.toISOString(), executedAt: iso(r.executedAt),
});
const NOT_FOUND_ACTION = () => new AccessError("not_found", "No encontramos esa acción.", 404);
/** Desde qué estados se llega a cada uno. `executed` conviene hacerlo con executeActionOnce (bloquea la fila). */
export const ACTION_FROM: Record<Exclude<ActionStatus, "proposed">, ActionStatus[]> = {
  confirmed: ["proposed"],
  executed: ["proposed", "confirmed"],
  failed: ["proposed", "confirmed"],
  blocked: ["proposed", "confirmed"],
  cancelled: ["proposed", "confirmed"],
};

/**
 * Registra una acción propuesta con su clave idempotente. Un reintento con la misma clave devuelve la acción existente
 * (created: false) y no crea otra (caso 23). La misma clave con otro tipo de acción es un conflicto (409).
 */
export async function proposeAction(userId: string, p: { kind: ActionKind; idempotencyKey: string; autonomy: Autonomy; input?: Record<string, unknown>; status?: "proposed" | "blocked"; error?: string | null }): Promise<{ action: ActionView; created: boolean }> {
  if (!KEY_RE.test(p.idempotencyKey ?? "")) throw new AccessError("invalid", "Clave de acción inválida.");
  if (!p.kind || p.kind.length > 60) throw new AccessError("invalid", "Acción inválida.");
  if (![0, 1, 2].includes(p.autonomy)) throw new AccessError("invalid", "Autonomía inválida.");
  const input = boundedJson(p.input ?? {}, 8_000, "Acción");
  const [ins] = await db.insert(brainAction).values({ userId, kind: p.kind, idempotencyKey: p.idempotencyKey, autonomy: p.autonomy, input,
    status: p.status ?? "proposed", error: p.error?.slice(0, 120) ?? null }).onConflictDoNothing().returning();
  if (ins) return { action: actionView(ins), created: true };
  const [cur] = await db.select().from(brainAction).where(and(eq(brainAction.userId, userId), eq(brainAction.idempotencyKey, p.idempotencyKey)));
  if (!cur) throw new AccessError("conflict", "No pudimos registrar la acción. Probá de nuevo.", 409);
  if (cur.kind !== p.kind) throw new AccessError("conflict", "Esa clave ya se usó para otra acción.", 409);
  return { action: actionView(cur), created: false };
}

export async function getAction(userId: string, id: string): Promise<ActionView> {
  const [r] = await db.select().from(brainAction).where(and(eq(brainAction.id, id), eq(brainAction.userId, userId)));
  if (!r) throw NOT_FOUND_ACTION();
  return actionView(r);
}
export async function actionByKey(userId: string, idempotencyKey: string): Promise<ActionView | null> {
  const [r] = await db.select().from(brainAction).where(and(eq(brainAction.userId, userId), eq(brainAction.idempotencyKey, idempotencyKey)));
  return r ? actionView(r) : null;
}
export async function listActions(userId: string, limit = 50): Promise<ActionView[]> {
  const rows = await db.select().from(brainAction).where(eq(brainAction.userId, userId)).orderBy(desc(brainAction.createdAt)).limit(Math.min(limit, 200));
  return rows.map(actionView);
}

/**
 * Cambia el estado de una acción propia de forma atómica (UPDATE … WHERE status IN (…)): dos confirmaciones simultáneas
 * cambian una sola vez. Repetir el mismo cambio devuelve la acción sin error (changed: false); un salto inválido, 409.
 */
export async function transitionAction(userId: string, id: string, to: Exclude<ActionStatus, "proposed">, patch: { result?: Record<string, unknown> | null; error?: string | null } = {}, now = new Date()): Promise<{ action: ActionView; changed: boolean }> {
  const from = ACTION_FROM[to];
  if (!from) throw new AccessError("invalid", "Estado de acción inválido.");
  const [row] = await db.update(brainAction).set({
    status: to,
    ...(patch.result !== undefined ? { result: patch.result == null ? null : boundedJson(patch.result, 8_000, "Resultado") } : {}),
    ...(patch.error !== undefined ? { error: patch.error?.slice(0, 120) ?? null } : {}),
    ...(to === "executed" ? { executedAt: now } : {}),
  }).where(and(eq(brainAction.id, id), eq(brainAction.userId, userId), inArray(brainAction.status, from))).returning();
  if (row) return { action: actionView(row), changed: true };
  const cur = await getAction(userId, id);
  if (cur.status === to) return { action: cur, changed: false };
  throw new AccessError("invalid_state", "Esa acción ya se resolvió.", 409);
}

/**
 * Ejecuta una acción propuesta o confirmada UNA sola vez: bloquea la fila (FOR UPDATE) mientras corre `run`, así un
 * reintento o un doble toque espera y encuentra la acción ya ejecutada (executed: false, sin volver a correr). Si `run`
 * falla, la acción queda «failed» con el código del error (nunca contenido) y se devuelve el error para el llamador
 * (caso 70: la confirmación muestra el resultado real del servidor). `run` usa sus propios servicios (no esta transacción).
 */
export async function executeActionOnce(userId: string, id: string, run: (a: ActionView) => Promise<Record<string, unknown> | null | void>, now = new Date()): Promise<{ action: ActionView; executed: boolean; error?: unknown }> {
  let error: unknown;
  const out = await db.transaction(async (tx) => {
    const [a] = await tx.select().from(brainAction).where(and(eq(brainAction.id, id), eq(brainAction.userId, userId))).for("update");
    if (!a) throw NOT_FOUND_ACTION();
    if (a.status === "executed") return { action: actionView(a), executed: false };
    if (!ACTION_FROM.executed.includes(a.status)) throw new AccessError("invalid_state", "Esa acción ya se resolvió.", 409);
    try {
      const result = (await run(actionView(a))) ?? null;
      const [u] = await tx.update(brainAction).set({ status: "executed", result: result ? boundedJson(result, 8_000, "Resultado") : null, error: null, executedAt: now })
        .where(eq(brainAction.id, a.id)).returning();
      return { action: actionView(u), executed: true };
    } catch (e) {
      error = e;
      const code = e instanceof AccessError ? e.code : "error";
      const [u] = await tx.update(brainAction).set({ status: "failed", error: code.slice(0, 120) }).where(eq(brainAction.id, a.id)).returning();
      return { action: actionView(u), executed: false };
    }
  });
  return error === undefined ? out : { ...out, error };
}

// ── Uso de IA (ai_usage) ────────────────────────────────────────────────────
export type AiOutcome = NonNullable<typeof aiUsage.$inferSelect["outcome"]>;
export type UsageRow = {
  userId: string | null; orgId: string | null; task: string; model: string; outcome: AiOutcome | null;
  inputTokens?: number; cachedTokens?: number; outputTokens?: number; costMicros?: number; latencyMs?: number | null;
};
/** Resultados que significan «se llamó al proveedor» (cuentan para la cuota). Caché y rechazos propios no cuentan. */
export const CALL_OUTCOMES: AiOutcome[] = ["ok", "error", "timeout", "cancelled", "refused", "bad_output"];

export async function insertUsage(r: UsageRow, q: Q = db): Promise<string> {
  const [row] = await q.insert(aiUsage).values({
    userId: r.userId, orgId: r.orgId, task: r.task.slice(0, 60), model: r.model.slice(0, 80), outcome: r.outcome,
    inputTokens: r.inputTokens ?? 0, cachedTokens: r.cachedTokens ?? 0, outputTokens: r.outputTokens ?? 0, costMicros: r.costMicros ?? 0,
    latencyMs: r.latencyMs ?? null,
  }).returning({ id: aiUsage.id });
  return row.id;
}
/** Completa la fila nacida «en curso» al admitir la llamada. */
export async function finishUsage(id: string, r: { outcome: AiOutcome; model?: string; inputTokens?: number; cachedTokens?: number; outputTokens?: number; costMicros?: number; latencyMs?: number }) {
  await db.update(aiUsage).set({
    outcome: r.outcome, ...(r.model ? { model: r.model.slice(0, 80) } : {}), inputTokens: r.inputTokens ?? 0, cachedTokens: r.cachedTokens ?? 0,
    outputTokens: r.outputTokens ?? 0, costMicros: r.costMicros ?? 0, latencyMs: r.latencyMs ?? null,
  }).where(eq(aiUsage.id, id));
}

/** Agregados para REPI Admin, sin ids de personas: llamadas, tokens, costo y latencia por tarea, modelo y resultado. */
export async function usageAggregate(p: { since: Date; until?: Date }) {
  const until = p.until ?? new Date();
  const rows = await db.select({
    task: aiUsage.task, model: aiUsage.model, outcome: aiUsage.outcome,
    calls: sql<number>`count(*)::int`, inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::float8`,
    cachedTokens: sql<number>`coalesce(sum(${aiUsage.cachedTokens}), 0)::float8`, outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::float8`,
    costMicros: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)::float8`, avgLatencyMs: sql<number | null>`avg(${aiUsage.latencyMs})::float8`,
    p95LatencyMs: sql<number | null>`percentile_cont(0.95) within group (order by ${aiUsage.latencyMs})::float8`,
  }).from(aiUsage).where(and(gte(aiUsage.createdAt, p.since), lt(aiUsage.createdAt, until)))
    .groupBy(aiUsage.task, aiUsage.model, aiUsage.outcome).orderBy(aiUsage.task, aiUsage.model, aiUsage.outcome);
  return rows.map((r) => ({ ...r, outcome: r.outcome ?? "in_flight" }));
}
