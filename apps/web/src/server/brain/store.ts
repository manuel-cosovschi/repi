// Persistencia del cerebro (D210): avisos (brain_intervention), acciones (brain_action) y uso de IA (ai_usage).
// Contrato: docs/adaptive/ADAPTIVE_COACHING_3.md §4–§5. Capa fina y tipada: cada función recibe el userId de la sesión y
// filtra por él (un id ajeno responde 404, igual que uno inexistente). Las reglas (qué emitir, qué ejecutar) viven en el
// dominio y en server/brain/{proactive,actions}.ts; acá sólo se garantiza idempotencia y transiciones atómicas.
import { randomUUID } from "node:crypto";
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
// «confirmed» es el estado de una acción reclamada para ejecutarse (executeActionOnce): `result` guarda sólo la marca del
// reclamo ({ claim: { token, at } }), que no se muestra.
const actionView = (r: ActionRow): ActionView => ({
  id: r.id, kind: r.kind, idempotencyKey: r.idempotencyKey, status: r.status, autonomy: r.autonomy as Autonomy, input: r.input ?? {},
  result: r.status === "confirmed" ? null : r.result ?? null, error: r.error, createdAt: r.createdAt.toISOString(), executedAt: iso(r.executedAt),
});
const NOT_FOUND_ACTION = () => new AccessError("not_found", "No encontramos esa acción.", 404);
/**
 * Cuánto dura el reclamo de una ejecución en curso. Pasado este plazo (el proceso se cayó a mitad de camino) otro pedido puede
 * retomarla. Tiene que superar la duración máxima de las rutas que ejecutan acciones (BRAIN_ROUTE_MAX_S, exportada como
 * `maxDuration` en /api/me/brain/action y /message): así nunca corren dos ejecuciones vivas de la misma acción.
 */
export const BRAIN_ROUTE_MAX_S = 60;
export const ACTION_LEASE_MS = 120_000;
/** Cuánto espera un pedido que encontró la acción ejecutándose en otro (doble toque, dos pestañas, reintento) antes de responder 409. */
export const ACTION_WAIT_MS = 8_000;
/** Reclamo vigente: estado «confirmed» con marca de hace menos de ACTION_LEASE_MS (hora real de la base, no la `now` de pruebas). */
const claimFresh = () => sql`(${brainAction.status} = 'confirmed' and coalesce((${brainAction.result}->'claim'->>'at')::timestamptz, '-infinity'::timestamptz) > now() - ${`${ACTION_LEASE_MS} milliseconds`}::interval)`;
/** Desde qué estados se llega a cada uno. `executed` se hace con executeActionOnce (reclama la acción antes de correr). */
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
 * cambian una sola vez. Repetir el mismo cambio devuelve la acción sin error (changed: false); un salto inválido, 409. Una
 * acción que se está ejecutando (reclamo vigente) no se cancela ni se bloquea por acá: la cierra quien la reclamó.
 */
export async function transitionAction(userId: string, id: string, to: Exclude<ActionStatus, "proposed">, patch: { result?: Record<string, unknown> | null; error?: string | null } = {}, now = new Date()): Promise<{ action: ActionView; changed: boolean }> {
  const from = ACTION_FROM[to];
  if (!from) throw new AccessError("invalid", "Estado de acción inválido.");
  const [row] = await db.update(brainAction).set({
    status: to,
    ...(patch.result !== undefined ? { result: patch.result == null ? null : boundedJson(patch.result, 8_000, "Resultado") } : {}),
    ...(patch.error !== undefined ? { error: patch.error?.slice(0, 120) ?? null } : {}),
    ...(to === "executed" ? { executedAt: now } : {}),
  }).where(and(eq(brainAction.id, id), eq(brainAction.userId, userId), inArray(brainAction.status, from), sql`not ${claimFresh()}`)).returning();
  if (row) return { action: actionView(row), changed: true };
  const cur = await getAction(userId, id);
  if (cur.status === to) return { action: cur, changed: false };
  if (cur.status === "confirmed") throw new AccessError("in_progress", "Esa acción se está aplicando. Probá de nuevo en unos segundos.", 409);
  throw new AccessError("invalid_state", "Esa acción ya se resolvió.", 409);
}

/**
 * Lo que `run` lanza para cerrar la acción sin ejecutarla: «blocked» (al revisarla ya no corresponde: queda bloqueada con el
 * código) o «proposed» (vuelve a quedar propuesta, p. ej. porque faltan datos para confirmarla). `text`: qué decirle a la persona.
 */
export class ActionStop extends Error {
  constructor(readonly to: "blocked" | "proposed", readonly code: string | null, readonly text: string, readonly reason?: unknown) {
    super(text);
  }
}
/** Falla pasajera (no un rechazo del servidor): la acción vuelve a quedar propuesta para reintentarla (no se consume). */
const transient = (e: unknown) => !(e instanceof AccessError) || e.status >= 500;

/** Reclama una acción propia para ejecutarla: una sola sentencia atómica (propuesta → confirmada, o un reclamo vencido). */
async function claimAction(userId: string, id: string): Promise<{ row: ActionRow; token: string } | null> {
  const token = randomUUID();
  const [row] = await db.update(brainAction).set({ status: "confirmed", error: null, executedAt: null, result: sql`jsonb_build_object('claim', jsonb_build_object('token', ${token}::text, 'at', now()))` })
    .where(and(eq(brainAction.id, id), eq(brainAction.userId, userId), or(eq(brainAction.status, "proposed"), and(eq(brainAction.status, "confirmed"), sql`not ${claimFresh()}`))))
    .returning();
  return row ? { row, token } : null;
}

/** Cierra un reclamo propio (si otro pedido lo retomó por vencido, no se pisa: se devuelve lo vigente). */
async function finishClaim(userId: string, id: string, token: string, to: "executed" | "failed" | "blocked" | "proposed", p: { result?: Record<string, unknown> | null; error?: string | null }, now: Date): Promise<ActionView> {
  const [row] = await db.update(brainAction).set({
    status: to, result: p.result ? boundedJson(p.result, 8_000, "Resultado") : null, error: p.error?.slice(0, 120) ?? null, executedAt: to === "executed" ? now : null,
  }).where(and(eq(brainAction.id, id), eq(brainAction.userId, userId), eq(brainAction.status, "confirmed"), sql`${brainAction.result}->'claim'->>'token' = ${token}`)).returning();
  return row ? actionView(row) : getAction(userId, id);
}

/** Espera (poco) a que otro pedido termine de ejecutar la acción. Devuelve el estado al que llegó, o «confirmed» si sigue en curso. */
async function awaitSettled(userId: string, id: string, waitMs: number): Promise<ActionView> {
  const until = Date.now() + waitMs;
  for (;;) {
    const [r] = await db.select({ row: brainAction, fresh: sql<boolean>`${claimFresh()}` }).from(brainAction).where(and(eq(brainAction.id, id), eq(brainAction.userId, userId)));
    if (!r) throw NOT_FOUND_ACTION();
    if (!r.fresh || Date.now() >= until) return actionView(r.row);
    await new Promise((res) => setTimeout(res, 150));
  }
}

/**
 * Ejecuta una acción propuesta UNA sola vez, sin dejar una transacción abierta mientras corre `run` (los servicios que llama
 * abren sus propias conexiones y transacciones; con un pool chico, una transacción retenida las dejaría esperando para siempre):
 * 1. la reclama con una sola sentencia atómica (proposed → confirmed con una marca);
 * 2. corre `run` (que puede revisar la acción contra el contexto de ese momento y cortar con ActionStop);
 * 3. la cierra: «executed» con el resultado; «failed» con el código si el servidor la rechazó (nunca contenido; caso 70); de
 *    vuelta a «proposed» si fue una falla pasajera ANTES de escribir nada (se puede reintentar: no se consume). `run` llama a
 *    `commit()` apenas su efecto principal quedó escrito: una falla posterior (un paso secundario) cierra la acción como
 *    ejecutada con `partial`, porque reintentarla duplicaría el efecto (otra molestia, otro reemplazo).
 * Un doble toque, otra pestaña o un reintento que llega mientras corre espera el resultado y lo devuelve sin volver a correr
 * (executed: false); si tarda demasiado, 409 «en curso». Un reclamo abandonado (proceso caído) vence a los ACTION_LEASE_MS.
 */
export async function executeActionOnce(userId: string, id: string, run: (a: ActionView, commit: () => void) => Promise<Record<string, unknown> | null | void>, now = new Date(), o: { waitMs?: number } = {}): Promise<{ action: ActionView; executed: boolean; error?: unknown; stopped?: ActionStop; partial?: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const c = await claimAction(userId, id);
    if (!c) {
      const cur = await awaitSettled(userId, id, o.waitMs ?? ACTION_WAIT_MS);
      if (cur.status === "executed" || cur.status === "blocked") return { action: cur, executed: false };
      if (cur.status === "confirmed") throw new AccessError("in_progress", "Esa acción se está aplicando. Probá de nuevo en unos segundos.", 409);
      if (cur.status === "proposed" && attempt < 2) continue; // el otro pedido la devolvió (falla pasajera o faltaban datos): se reintenta acá
      throw new AccessError("invalid_state", "Esa acción ya se resolvió.", 409);
    }
    let committed = false, result: Record<string, unknown> | null = null, failure: unknown = undefined, failed = false;
    try { result = (await run(actionView(c.row), () => { committed = true; })) ?? null; } catch (e) { failure = e; failed = true; }
    // El cierre va fuera del try: si cerrar «executed» falla, no se convierte en «proposed» (eso permitiría correrla de nuevo).
    if (!failed) return { action: await finishClaim(userId, id, c.token, "executed", { result }, now), executed: true };
    if (failure instanceof ActionStop) return { action: await finishClaim(userId, id, c.token, failure.to, { error: failure.code }, now), executed: false, stopped: failure };
    const code = failure instanceof AccessError ? failure.code : "error";
    if (committed) return { action: await finishClaim(userId, id, c.token, "executed", { result: { partial: true }, error: code }, now), executed: true, error: failure, partial: true };
    return { action: await finishClaim(userId, id, c.token, transient(failure) ? "proposed" : "failed", { error: code }, now), executed: false, error: failure };
  }
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

/**
 * D217: cancela los avisos vigentes que dependen del perfil (objetivo, días, experiencia) cuando la persona lo cambia: una
 * meta semanal o un «estable» redactado con el objetivo anterior quedaría obsoleto. Nunca toca programas ni propuestas al coach.
 */
export const PROFILE_DEPENDENT_KINDS = ["weekly_summary", "weekly_target_met", "plateau", "progressing", "declining"] as const;
export async function cancelProfileInterventions(userId: string, now = new Date()) {
  const rows = await db.update(brainIntervention).set({ status: "cancelled", reason: "profile_changed", resolvedAt: now })
    .where(and(eq(brainIntervention.userId, userId), inArray(brainIntervention.status, ["pending", "shown"]), inArray(brainIntervention.kind, [...PROFILE_DEPENDENT_KINDS])))
    .returning({ id: brainIntervention.id });
  return rows.length;
}
