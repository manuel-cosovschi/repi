// Gateway de IA del cerebro (D210, contrato §5). Envuelve aiJson (server/ai/openai.ts) sin cambiar su contrato y agrega, en
// orden: política (ai_policy global → org → usuario), caché, cuota diaria por usuario, presupuesto en micro-dólares (global
// diario y org mensual), circuit breaker por tarea, concurrencia (1 por usuario y un máximo global), timeout + cancelación con
// AbortSignal + un solo reintento en 429/5xx, y el registro en ai_usage (tokens y costo, NUNCA contenido).
//
// Nunca lanza: devuelve { ok: false, reason } y el llamador responde por reglas (fallback). Sin OPENAI_API_KEY → "disabled".
//
// Por qué así en serverless (Vercel, muchas instancias): un semáforo en memoria no limita entre instancias. La admisión es
// una transacción corta con pg_advisory_xact_lock global: cuenta en ai_usage las llamadas del día, el gasto y las filas «en
// curso» (outcome null, creadas hace menos de INFLIGHT_TTL_MS) e inserta la propia fila en curso. Es atómica entre
// instancias, funciona con el pooler en modo transacción y una instancia que muere no bloquea: su fila deja de contar al
// vencer el TTL (y la purga diaria la cierra como error). Cuesta dos escrituras por llamada, que son pocas (30/día/usuario).
// La caché es en memoria por instancia (LRU con TTL): sin tabla nueva; acierta en reintentos y preguntas repetidas cercanas.
import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logError } from "../log";
import { AccessError } from "../access/util";
import { aiJson, type AiCallInfo, type AiPart } from "../ai/openai";
import { arDayStart, arMonthStart, CALL_OUTCOMES, finishUsage, insertUsage, type AiOutcome } from "./store";

const { aiPolicy, aiBreaker, aiUsage } = schema;

export type AiTask = "brain.chat" | "brain.intent" | "brain.explain";
export type AiFailReason = "disabled" | "quota" | "budget" | "breaker" | "concurrency" | "timeout" | "cancelled" | "error" | "refused" | "bad_output";
export type AiUsageInfo = { model: string; inputTokens: number; cachedTokens: number; outputTokens: number; costMicros: number; latencyMs: number; cached: boolean };
export type AiResult<T> = { ok: true; data: T; usage: AiUsageInfo } | { ok: false; reason: AiFailReason };

// ── Política ────────────────────────────────────────────────────────────────
export type AiPolicy = {
  enabled: boolean;
  user_daily_calls: number;
  global_daily_micros: number;
  org_monthly_micros: number;
  max_concurrency: number;
  /** Modelo por tarea (sólo modelos con precio conocido en PRICES; otro se ignora para no saltear el presupuesto). */
  models: Partial<Record<AiTask, string>>;
};
/** Topes por defecto del contrato: IA habilitada, 30 llamadas/usuario/día, US$2/día global, US$20/mes por organización. */
export const DEFAULT_POLICY: AiPolicy = { enabled: true, user_daily_calls: 30, global_daily_micros: 2_000_000, org_monthly_micros: 20_000_000, max_concurrency: 4, models: {} };
const TASKS: readonly AiTask[] = ["brain.chat", "brain.intent", "brain.explain"];

type Cfg = Record<string, unknown>;
const validNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const firstNum = (k: string, d: number, ...cfgs: Cfg[]) => { for (const c of cfgs) if (validNum(c[k])) return Math.floor(c[k] as number); return d; };
const modelsOf = (c: Cfg) => {
  const m = c.models && typeof c.models === "object" ? (c.models as Cfg) : {};
  return Object.fromEntries(TASKS.filter((t) => typeof m[t] === "string" && PRICES[m[t] as string]).map((t) => [t, m[t] as string])) as AiPolicy["models"];
};
/**
 * Mezcla de alcances: `enabled` es Y lógico (un «apagado» global, de la organización o de la persona gana); los números los
 * define el alcance más específico que los tenga (usuario > org > global > defecto), salvo los topes globales
 * (global_daily_micros, max_concurrency), que sólo se leen del alcance global. Un valor inválido se ignora.
 */
export function mergePolicy(global?: Cfg | null, org?: Cfg | null, user?: Cfg | null): AiPolicy {
  const g = global ?? {}, o = org ?? {}, u = user ?? {};
  return {
    enabled: [g, o, u].every((c) => c.enabled !== false),
    user_daily_calls: firstNum("user_daily_calls", DEFAULT_POLICY.user_daily_calls, u, o, g),
    org_monthly_micros: firstNum("org_monthly_micros", DEFAULT_POLICY.org_monthly_micros, o, g),
    global_daily_micros: firstNum("global_daily_micros", DEFAULT_POLICY.global_daily_micros, g),
    max_concurrency: firstNum("max_concurrency", DEFAULT_POLICY.max_concurrency, g),
    models: { ...modelsOf(g), ...modelsOf(o), ...modelsOf(u) },
  };
}
export async function loadPolicy(userId: string | null, orgId: string | null): Promise<AiPolicy> {
  const scopes = ["global", ...(orgId ? [`org:${orgId}`] : []), ...(userId ? [`user:${userId}`] : [])];
  const rows = await db.select({ scope: aiPolicy.scope, config: aiPolicy.config }).from(aiPolicy).where(inArray(aiPolicy.scope, scopes));
  const by = new Map(rows.map((r) => [r.scope, r.config]));
  return mergePolicy(by.get("global"), orgId ? by.get(`org:${orgId}`) : null, userId ? by.get(`user:${userId}`) : null);
}
/** «Con 0, la IA del cerebro queda apagada y todo sigue andando por reglas» (contrato §5). */
const policyOn = (p: AiPolicy, orgId: string | null) =>
  p.enabled && p.user_daily_calls > 0 && p.global_daily_micros > 0 && p.max_concurrency > 0 && (!orgId || p.org_monthly_micros > 0);

// ── Modelos y precios ───────────────────────────────────────────────────────
/**
 * Precios Standard en US$ por millón de tokens = micro-dólares por token. Fuente: docs/adaptive/ac3-auditoria/modelos-openai.md
 * (documentación oficial leída el 07/11/2026). null = precio desconocido: el costo se registra en 0.
 */
export const PRICES: Record<string, { input: number; cached: number; output: number } | null> = {
  "gpt-6-luna": { input: 0.10, cached: 0.01, output: 0.50 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  // TODO(D210): gpt-4.1-mini (lo usan hoy las otras funciones de IA) no figura en modelos-openai.md; no inventamos su precio.
  "gpt-4.1-mini": null,
};
export function costMicros(model: string, u: { input: number; cached: number; output: number }) {
  const p = PRICES[model];
  if (!p) return 0;
  const cached = Math.min(u.cached, u.input);
  return Math.ceil((u.input - cached) * p.input + cached * p.cached + u.output * p.output); // hacia arriba: el presupuesto nunca subestima
}
/** brain.chat / brain.intent → OPENAI_MODEL_BRAIN (gpt-6-luna); brain.explain → OPENAI_MODEL_BRAIN_DEEP (por defecto, el mismo). */
export function modelFor(task: AiTask, policy: AiPolicy = DEFAULT_POLICY) {
  const base = process.env.OPENAI_MODEL_BRAIN || "gpt-6-luna";
  return policy.models[task] ?? (task === "brain.explain" ? process.env.OPENAI_MODEL_BRAIN_DEEP || base : base);
}

// ── Caché en memoria (por instancia) ────────────────────────────────────────
const CACHE_MAX = 200, CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
function cacheGet(k: string) {
  const e = cache.get(k);
  if (!e) return undefined;
  cache.delete(k);
  if (Date.now() - e.at > CACHE_TTL_MS) return undefined;
  cache.set(k, e); // LRU: lo usado pasa al final
  return structuredClone(e.data);
}
function cacheSet(k: string, data: unknown) {
  cache.set(k, { at: Date.now(), data: structuredClone(data) });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}
/** Sólo para pruebas y para invalidar todo (p. ej. al cambiar la política). */
export const clearAiCache = () => cache.clear();

// ── Validación mínima de la salida contra el esquema JSON (subconjunto de Structured Outputs) ───────────────────────────
type JsonSchema = { type?: string | string[]; enum?: unknown[]; const?: unknown; properties?: Record<string, JsonSchema>; required?: string[];
  additionalProperties?: boolean | JsonSchema; items?: JsonSchema; anyOf?: JsonSchema[]; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; minItems?: number; maxItems?: number };
const typeOk = (t: string, v: unknown) =>
  t === "null" ? v === null : t === "array" ? Array.isArray(v) : t === "object" ? typeof v === "object" && v !== null && !Array.isArray(v)
    : t === "integer" ? Number.isInteger(v) : t === "number" ? typeof v === "number" && Number.isFinite(v) : typeof v === t;
/** ¿`v` cumple `s`? Palabras clave no soportadas se ignoran (permisivo); lo soportado se exige. */
export function matchesSchema(s: JsonSchema | undefined, v: unknown): boolean {
  if (!s || typeof s !== "object") return true;
  if (s.anyOf) return s.anyOf.some((x) => matchesSchema(x, v));
  if (s.type !== undefined && !(Array.isArray(s.type) ? s.type : [s.type]).some((t) => typeOk(t, v))) return false;
  if (s.enum && !s.enum.some((e) => e === v)) return false;
  if ("const" in s && s.const !== v) return false;
  if (typeof v === "number" && ((s.minimum !== undefined && v < s.minimum) || (s.maximum !== undefined && v > s.maximum))) return false;
  if (typeof v === "string" && ((s.minLength !== undefined && v.length < s.minLength) || (s.maxLength !== undefined && v.length > s.maxLength))) return false;
  if (Array.isArray(v)) {
    if ((s.minItems !== undefined && v.length < s.minItems) || (s.maxItems !== undefined && v.length > s.maxItems)) return false;
    return !s.items || v.every((x) => matchesSchema(s.items, x));
  }
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (s.required?.some((k) => !(k in o))) return false;
    for (const [k, x] of Object.entries(o)) {
      const ps = s.properties?.[k];
      if (ps) { if (!matchesSchema(ps, x)) return false; }
      else if (s.additionalProperties === false) return false;
      else if (typeof s.additionalProperties === "object" && !matchesSchema(s.additionalProperties, x)) return false;
    }
  }
  return true;
}

// ── Llamada ─────────────────────────────────────────────────────────────────
export const BREAKER_FAILURES = 5;
export const BREAKER_OPEN_MS = 10 * 60_000;
export const MAX_TIMEOUT_MS = 30_000;
/** Una fila «en curso» deja de contar para la concurrencia pasado este tiempo (cubre el timeout más largo y el reintento). */
export const INFLIGHT_TTL_MS = MAX_TIMEOUT_MS + 15_000;
const RETRY_MIN_MS = 1_500; // sólo se reintenta si queda tiempo útil antes del vencimiento
const LOCK = "repi:ai-gateway";

export type CallAiParams = {
  task: AiTask;
  /** userId de la sesión (null = tarea del sistema: sin cuota ni concurrencia por persona). */
  userId: string | null;
  orgId: string | null;
  system: string;
  parts: AiPart[];
  /** Esquema JSON estricto (Structured Outputs). La salida se valida igual contra él. */
  schema: object;
  maxTokens?: number;
  /** Vencimiento total (incluye el reintento). Por defecto 12 s; máximo MAX_TIMEOUT_MS. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Habilita la caché. Debe incluir la versión del contexto (BrainContext.version): si cambia, no acierta. */
  cacheKey?: string | null;
  /** Validación semántica extra de la salida (además del esquema). false → "bad_output". */
  validate?: (data: unknown) => boolean;
};

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res) => {
  const t = setTimeout(res, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
});

type Admission = { ok: true; usageId: string } | { ok: false; reason: "quota" | "budget" | "breaker" | "concurrency" };
/** Admisión atómica entre instancias: cuota → presupuesto → breaker → concurrencia; si pasa, inserta la fila «en curso». */
async function admit(p: CallAiParams, policy: AiPolicy, model: string, now: Date): Promise<Admission> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${LOCK}))`);
    const day = arDayStart(now).toISOString(), month = arMonthStart(now).toISOString(), inflightSince = new Date(now.getTime() - INFLIGHT_TTL_MS).toISOString();
    const calls = sql.join(CALL_OUTCOMES.map((o) => sql`${o}`), sql`, `);
    const [c] = await tx.execute<{ user_calls: number; global_micros: number; org_micros: number; inflight: number; user_inflight: number }>(sql`select
      (select count(*) from ${aiUsage} where ${aiUsage.userId} = ${p.userId} and ${aiUsage.createdAt} >= ${day}::timestamptz
        and (${aiUsage.outcome} is null or ${aiUsage.outcome} in (${calls})))::int as user_calls,
      (select coalesce(sum(${aiUsage.costMicros}), 0) from ${aiUsage} where ${aiUsage.createdAt} >= ${day}::timestamptz)::float8 as global_micros,
      (select coalesce(sum(${aiUsage.costMicros}), 0) from ${aiUsage} where ${aiUsage.orgId} = ${p.orgId} and ${aiUsage.createdAt} >= ${month}::timestamptz)::float8 as org_micros,
      (select count(*) from ${aiUsage} where ${aiUsage.outcome} is null and ${aiUsage.createdAt} > ${inflightSince}::timestamptz)::int as inflight,
      (select count(*) from ${aiUsage} where ${aiUsage.outcome} is null and ${aiUsage.createdAt} > ${inflightSince}::timestamptz and ${aiUsage.userId} = ${p.userId})::int as user_inflight`);
    const [b] = await tx.select({ openedUntil: aiBreaker.openedUntil }).from(aiBreaker).where(eq(aiBreaker.task, p.task));
    const reason: "quota" | "budget" | "breaker" | "concurrency" | null =
      p.userId && Number(c.user_calls) >= policy.user_daily_calls ? "quota"
        : Number(c.global_micros) >= policy.global_daily_micros || (p.orgId && Number(c.org_micros) >= policy.org_monthly_micros) ? "budget"
          : b?.openedUntil && b.openedUntil > now ? "breaker"
            : Number(c.inflight) >= policy.max_concurrency || (p.userId && Number(c.user_inflight) >= 1) ? "concurrency"
              : null;
    if (reason) {
      await insertUsage({ userId: p.userId, orgId: p.orgId, task: p.task, model, outcome: reason, latencyMs: 0 }, tx);
      return { ok: false, reason };
    }
    return { ok: true, usageId: await insertUsage({ userId: p.userId, orgId: p.orgId, task: p.task, model, outcome: null }, tx) };
  });
}

async function breakerFailure(task: AiTask, now: Date) {
  const until = new Date(now.getTime() + BREAKER_OPEN_MS).toISOString();
  await db.insert(aiBreaker).values({ task, failures: 1, updatedAt: now }).onConflictDoUpdate({
    target: aiBreaker.task,
    set: { failures: sql`${aiBreaker.failures} + 1`, updatedAt: now,
      // 5 fallas seguidas → abierto 10 min. Semiabierto (ya vencido, failures ≥ 5): la próxima falla lo reabre enseguida.
      openedUntil: sql`case when ${aiBreaker.failures} + 1 >= ${BREAKER_FAILURES} then ${until}::timestamptz else ${aiBreaker.openedUntil} end` },
  });
}
async function breakerSuccess(task: AiTask, now: Date) {
  await db.update(aiBreaker).set({ failures: 0, openedUntil: null, updatedAt: now })
    .where(sql`${aiBreaker.task} = ${task} and (${aiBreaker.failures} > 0 or ${aiBreaker.openedUntil} is not null)`);
}

/**
 * Llama al modelo para una tarea del cerebro con todos los controles. Nunca lanza ni registra contenido (ni el prompt ni la
 * respuesta): ante cualquier problema devuelve { ok: false, reason } y el llamador usa la respuesta determinística.
 */
export async function callAi<T = unknown>(p: CallAiParams): Promise<AiResult<T>> {
  const t0 = Date.now(), now = new Date(t0);
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "disabled" };
  if (p.signal?.aborted) return { ok: false, reason: "cancelled" };
  let usageId: string | null = null;
  try {
    const policy = await loadPolicy(p.userId, p.orgId);
    if (!policyOn(policy, p.orgId)) return { ok: false, reason: "disabled" };
    const model = modelFor(p.task, policy);
    const maxTokens = Math.min(Math.max(Math.floor(p.maxTokens ?? 800), 16), 4_000);
    const timeoutMs = Math.min(Math.max(Math.floor(p.timeoutMs ?? 12_000), 100), MAX_TIMEOUT_MS);

    // Caché: la clave incluye persona, organización, tarea, modelo, la versión del contexto (cacheKey) y el hash de la entrada.
    const ck = p.cacheKey ? createHash("sha256").update(JSON.stringify([p.task, model, p.userId, p.orgId, p.cacheKey, p.system, p.parts, p.schema, maxTokens])).digest("hex") : null;
    const hit = ck ? cacheGet(ck) : undefined;
    if (hit !== undefined) {
      const latencyMs = Date.now() - t0;
      await insertUsage({ userId: p.userId, orgId: p.orgId, task: p.task, model, outcome: "cache", latencyMs }).catch((e) => logError("brain.gateway.usage", e));
      return { ok: true, data: hit as T, usage: { model, inputTokens: 0, cachedTokens: 0, outputTokens: 0, costMicros: 0, latencyMs, cached: true } };
    }

    const adm = await admit(p, policy, model, now);
    if (!adm.ok) return { ok: false, reason: adm.reason };
    usageId = adm.usageId;

    // Vencimiento total propio (cubre el reintento) + cancelación del llamador.
    const deadline = Date.now() + timeoutMs;
    const timer = new AbortController();
    const tm = setTimeout(() => timer.abort(), timeoutMs);
    const signal = p.signal ? AbortSignal.any([timer.signal, p.signal]) : timer.signal;
    const tokens = { input: 0, cached: 0, output: 0 };
    let outcome: AiOutcome = "error", data: unknown = null, served = model;
    try {
      for (let attempt = 0; ; attempt++) {
        const seen: { info: AiCallInfo | null } = { info: null };
        let retry = false;
        try {
          data = await aiJson<unknown>({
            name: p.task.replace(/\W/g, "_"), system: p.system, parts: p.parts, schema: p.schema, maxTokens, model, requireComplete: true,
            timeoutMs: deadline - Date.now() + 1_000, signal, onInfo: (i) => { seen.info = i; }, // el vencimiento lo decide `timer`
          });
          outcome = matchesSchema(p.schema as JsonSchema, data) && (p.validate?.(data) ?? true) ? "ok" : "bad_output";
        } catch (e) {
          const code = e instanceof AccessError ? e.code : "error", st = seen.info?.status ?? null;
          outcome = p.signal?.aborted ? "cancelled" : timer.signal.aborted ? "timeout"
            : code === "ai_refused" ? "refused" : code === "ai_bad_output" || code === "ai_incomplete" ? "bad_output" : "error";
          // Un solo reintento, sólo por 429/5xx y si queda tiempo útil. Red caída, timeout, 4xx o salida inválida: no.
          retry = outcome === "error" && attempt === 0 && (st === 429 || (st != null && st >= 500)) && deadline - Date.now() > RETRY_MIN_MS;
        }
        if (seen.info) {
          served = seen.info.model;
          if (seen.info.usage) { tokens.input += seen.info.usage.input; tokens.cached += seen.info.usage.cached; tokens.output += seen.info.usage.output; }
        }
        if (!retry) break;
        await sleep(250 + Math.floor(Math.random() * 250), signal);
      }
    } finally { clearTimeout(tm); }

    const latencyMs = Date.now() - t0, cost = costMicros(served, tokens);
    await finishUsage(usageId, { outcome, model: served, inputTokens: tokens.input, cachedTokens: tokens.cached, outputTokens: tokens.output, costMicros: cost, latencyMs });
    usageId = null; // ya registrada: un error del breaker no la reescribe
    // Sólo las caídas del servicio (error de red/HTTP, timeout) cuentan para el breaker; cancelar o una salida inválida, no.
    if (outcome === "ok") await breakerSuccess(p.task, new Date()).catch((e) => logError("brain.gateway.breaker", e));
    else if (outcome === "error" || outcome === "timeout") await breakerFailure(p.task, new Date()).catch((e) => logError("brain.gateway.breaker", e));
    if (outcome !== "ok") return { ok: false, reason: outcome as AiFailReason };
    if (ck) cacheSet(ck, data);
    return { ok: true, data: data as T, usage: { model: served, inputTokens: tokens.input, cachedTokens: tokens.cached, outputTokens: tokens.output, costMicros: cost, latencyMs, cached: false } };
  } catch (e) {
    // Falla propia (base, etc.): se registra sin contenido y el llamador sigue por reglas. La fila en curso, si quedó, se cierra.
    logError("brain.gateway", e);
    if (usageId) await finishUsage(usageId, { outcome: "error", latencyMs: Date.now() - t0 }).catch(() => {});
    return { ok: false, reason: "error" };
  }
}
