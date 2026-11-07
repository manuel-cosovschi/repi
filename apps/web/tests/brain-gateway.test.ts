import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  BREAKER_FAILURES, callAi, clearAiCache, costMicros, matchesSchema, mergePolicy, modelFor, DEFAULT_POLICY, type CallAiParams,
} from "@/server/brain/gateway";

// D210 · gateway de IA del cerebro (contrato §5; casos 65–68 del máster). Nunca llama a OpenAI: fetch siempre es un doble.
const SCHEMA = { type: "object", additionalProperties: false, required: ["reply"], properties: { reply: { type: "string", maxLength: 200 } } };
const PROMPT = "PROMPT-PRIVADO-NO-LOGUEAR";
const USAGE = { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 } };
const reply = (content: unknown, init: { status?: number; usage?: object | null; refusal?: string } = {}) => new Response(JSON.stringify({
  choices: [{ message: init.refusal ? { refusal: init.refusal } : { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }],
  ...(init.usage === null ? {} : { usage: init.usage ?? USAGE }),
}), { status: init.status ?? 200 });
const failure = (status: number) => new Response(JSON.stringify({ error: { code: "x" } }), { status });
const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) => { const f = vi.fn(impl); vi.stubGlobal("fetch", f); return f; };
const person = async (extra: Partial<typeof schema.user.$inferInsert> = {}) => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Persona Gateway", email: `${id}@test.repi.local`, emailVerified: true, ...extra });
  return id;
};
const org = async () => (await db.insert(schema.organization).values({ kind: "gym", name: `Gym gateway ${randomUUID().slice(0, 6)}` }).returning())[0].id;
const call = (userId: string | null, extra: Partial<CallAiParams> = {}) => callAi<{ reply: string }>({
  task: "brain.chat", userId, orgId: null, system: PROMPT, parts: [{ type: "text", text: "mensaje de la persona" }], schema: SCHEMA, timeoutMs: 5_000, ...extra,
});
const usageOf = (userId: string) => db.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId));
const bodyOf = (f: ReturnType<typeof vi.fn>, i = 0) => JSON.parse((f.mock.calls[i][1] as RequestInit).body as string);

beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  // Estas tablas sólo las usan las pruebas del cerebro (archivos en serie): cada prueba arranca sin uso, política ni breaker.
  await db.delete(schema.aiUsage); await db.delete(schema.aiPolicy); await db.delete(schema.aiBreaker);
  clearAiCache();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("gateway: apagado y política", () => {
  it("sin OPENAI_API_KEY devuelve disabled, no llama ni escribe nada", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const f = stubFetch(async () => reply({ reply: "x" }));
    const u = await person();
    expect(await call(u)).toEqual({ ok: false, reason: "disabled" });
    expect(f).not.toHaveBeenCalled();
    expect(await usageOf(u)).toHaveLength(0);
  });
  it("un «apagado» en cualquier alcance gana; un tope en 0 también apaga (todo sigue por reglas)", async () => {
    const f = stubFetch(async () => reply({ reply: "x" }));
    const u = await person(), o = await org();
    await db.insert(schema.aiPolicy).values({ scope: `org:${o}`, config: { enabled: false } });
    expect(await call(u, { orgId: o })).toEqual({ ok: false, reason: "disabled" });
    await db.insert(schema.aiPolicy).values({ scope: `user:${u}`, config: { user_daily_calls: 0 } });
    expect(await call(u)).toEqual({ ok: false, reason: "disabled" });
    expect(f).not.toHaveBeenCalled();
  });
  it("mergePolicy: más específico gana en números; topes globales sólo del alcance global; valores inválidos se ignoran", () => {
    const p = mergePolicy({ user_daily_calls: 10, global_daily_micros: 5, max_concurrency: 2 }, { user_daily_calls: 20, global_daily_micros: 999, org_monthly_micros: 7 }, { user_daily_calls: -1, max_concurrency: 50 });
    expect(p).toMatchObject({ enabled: true, user_daily_calls: 20, global_daily_micros: 5, max_concurrency: 2, org_monthly_micros: 7 });
    expect(mergePolicy(null, null, null)).toEqual(DEFAULT_POLICY);
    expect(mergePolicy({ enabled: true }, null, { enabled: false }).enabled).toBe(false);
    expect(mergePolicy({ models: { "brain.chat": "gpt-5.6-terra", "brain.intent": "modelo-sin-precio" } }).models).toEqual({ "brain.chat": "gpt-5.6-terra" });
  });
  it("ruteo por tarea: OPENAI_MODEL_BRAIN para chat/intent, OPENAI_MODEL_BRAIN_DEEP para explicar (por defecto el mismo)", () => {
    expect(modelFor("brain.chat")).toBe("gpt-6-luna");
    expect(modelFor("brain.explain")).toBe("gpt-6-luna");
    vi.stubEnv("OPENAI_MODEL_BRAIN", "gpt-5.6-terra");
    expect(modelFor("brain.intent")).toBe("gpt-5.6-terra");
    expect(modelFor("brain.explain")).toBe("gpt-5.6-terra");
    vi.stubEnv("OPENAI_MODEL_BRAIN_DEEP", "gpt-6-luna");
    expect(modelFor("brain.explain")).toBe("gpt-6-luna");
  });
});

describe("gateway: llamada, uso y costo", () => {
  it("responde con los datos, registra tokens y costo en ai_usage y no registra el contenido en los logs", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = stubFetch(async () => reply({ reply: "Hoy toca pierna." }));
    const u = await person();
    const r = await call(u, { maxTokens: 300 });
    expect(r).toMatchObject({ ok: true, data: { reply: "Hoy toca pierna." }, usage: { model: "gpt-6-luna", inputTokens: 1000, cachedTokens: 400, outputTokens: 200, costMicros: 164, cached: false } });
    // 600 sin caché × 0,10 + 400 cacheados × 0,01 + 200 de salida × 0,50 = 164 micro-dólares.
    expect(costMicros("gpt-6-luna", { input: 1000, cached: 400, output: 200 })).toBe(164);
    expect(costMicros("gpt-4.1-mini", { input: 1000, cached: 0, output: 1000 })).toBe(0); // precio desconocido: no se inventa
    const body = bodyOf(f);
    expect(body).toMatchObject({ model: "gpt-6-luna", max_completion_tokens: 300, response_format: { type: "json_schema", json_schema: { name: "brain_chat", strict: true } } });
    // GPT-6 es de razonamiento: sin temperatura y con el esfuerzo mínimo que acepta («none», no «minimal»).
    expect(body.reasoning_effort).toBe("none");
    expect(body).not.toHaveProperty("temperature");
    const [row] = await usageOf(u);
    expect(row).toMatchObject({ task: "brain.chat", model: "gpt-6-luna", outcome: "ok", inputTokens: 1000, cachedTokens: 400, outputTokens: 200, costMicros: 164, orgId: null });
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(row)).not.toContain("PROMPT");
    // Una falla posterior se registra sin el prompt ni el mensaje.
    stubFetch(async () => failure(400));
    expect(await call(u)).toEqual({ ok: false, reason: "error" });
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/PROMPT-PRIVADO|mensaje de la persona/);
  });
  it("un solo reintento y sólo en 429/5xx; un 4xx no se reintenta", async () => {
    const u = await person();
    let n = 0;
    let f = stubFetch(async () => (n++ === 0 ? failure(429) : reply({ reply: "ok" })));
    expect(await call(u)).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
    f = stubFetch(async () => failure(503));
    expect(await call(u)).toEqual({ ok: false, reason: "error" });
    expect(f).toHaveBeenCalledTimes(2);
    f = stubFetch(async () => failure(400));
    expect(await call(u)).toEqual({ ok: false, reason: "error" });
    expect(f).toHaveBeenCalledTimes(1);
    const rows = await usageOf(u);
    expect(rows.map((r) => r.outcome).sort()).toEqual(["error", "error", "ok"]); // una fila por llamada, no por intento
  });
  it("caso 65: salida inválida del modelo → bad_output (JSON roto, fuera del esquema o rechazada por la validación)", async () => {
    const u = await person();
    stubFetch(async () => reply("{no es json"));
    expect(await call(u)).toEqual({ ok: false, reason: "bad_output" });
    stubFetch(async () => reply({ respuesta: "campo equivocado" }));
    expect(await call(u)).toEqual({ ok: false, reason: "bad_output" });
    stubFetch(async () => reply({ reply: "x".repeat(201) }));
    expect(await call(u)).toEqual({ ok: false, reason: "bad_output" });
    stubFetch(async () => reply({ reply: "subí 40 kg" }));
    expect(await call(u, { validate: (d) => !/\d+ kg/.test((d as { reply: string }).reply) })).toEqual({ ok: false, reason: "bad_output" });
    stubFetch(async () => reply(null, { refusal: "no" }));
    expect(await call(u)).toEqual({ ok: false, reason: "refused" });
    const rows = await usageOf(u);
    expect(rows.filter((r) => r.outcome === "bad_output")).toHaveLength(4);
    expect(rows.find((r) => r.outcome === "bad_output")!.costMicros).toBe(164); // lo consumido se cuenta igual
    // La salida inválida no es una caída del servicio: no abre el breaker.
    expect(await db.select().from(schema.aiBreaker)).toHaveLength(0);
  });
  it("matchesSchema cubre el subconjunto de Structured Outputs", () => {
    const s = { type: "object", additionalProperties: false, required: ["a", "b"], properties: { a: { type: "integer", minimum: 0 }, b: { anyOf: [{ type: "string", enum: ["x", "y"] }, { type: "null" }] }, c: { type: "array", items: { type: "number" } } } };
    expect(matchesSchema(s, { a: 1, b: "x", c: [1.5] })).toBe(true);
    expect(matchesSchema(s, { a: 1, b: null })).toBe(true);
    expect(matchesSchema(s, { a: 1.5, b: "x" })).toBe(false);
    expect(matchesSchema(s, { a: -1, b: "x" })).toBe(false);
    expect(matchesSchema(s, { a: 1, b: "z" })).toBe(false);
    expect(matchesSchema(s, { a: 1 })).toBe(false);
    expect(matchesSchema(s, { a: 1, b: "x", d: 1 })).toBe(false);
    expect(matchesSchema(s, { a: 1, b: "x", c: ["1"] })).toBe(false);
  });
});

describe("gateway: cuotas, presupuesto y breaker", () => {
  it("cuota diaria por persona (no por IP): se agota para una y la otra sigue", async () => {
    await db.insert(schema.aiPolicy).values({ scope: "global", config: { user_daily_calls: 2 } });
    const f = stubFetch(async () => reply({ reply: "ok" }));
    const a = await person(), b = await person();
    expect(await call(a)).toMatchObject({ ok: true });
    expect(await call(a)).toMatchObject({ ok: true });
    expect(await call(a)).toEqual({ ok: false, reason: "quota" });
    expect(await call(b)).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
    expect((await usageOf(a)).map((r) => r.outcome).sort()).toEqual(["ok", "ok", "quota"]);
    // Una política por persona puede ampliarla.
    await db.insert(schema.aiPolicy).values({ scope: `user:${a}`, config: { user_daily_calls: 3 } });
    expect(await call(a)).toMatchObject({ ok: true });
  });
  it("caso 67: presupuesto agotado (global diario y mensual de la organización) → budget, sin llamar", async () => {
    const f = stubFetch(async () => reply({ reply: "ok" }));
    const u = await person(), otro = await person(), o1 = await org(), o2 = await org();
    await db.insert(schema.aiPolicy).values([{ scope: "global", config: { global_daily_micros: 10_000 } }, { scope: `org:${o1}`, config: { org_monthly_micros: 500 } }]);
    await db.insert(schema.aiUsage).values({ userId: otro, orgId: o1, task: "brain.chat", model: "gpt-6-luna", outcome: "ok", costMicros: 500 });
    expect(await call(u, { orgId: o1 })).toEqual({ ok: false, reason: "budget" });
    expect(await call(u, { orgId: o2 })).toMatchObject({ ok: true });
    await db.insert(schema.aiUsage).values({ userId: otro, task: "brain.chat", model: "gpt-6-luna", outcome: "ok", costMicros: 9_400 });
    expect(await call(u)).toEqual({ ok: false, reason: "budget" });
    expect(f).toHaveBeenCalledTimes(1);
    expect((await usageOf(u)).filter((r) => r.outcome === "budget")).toHaveLength(2);
  });
  it("caso 66: modelo no disponible → 5 fallas seguidas abren el breaker 10 min; semiabierto, un éxito lo cierra y una falla lo reabre", async () => {
    const u = await person();
    let f = stubFetch(async () => { throw new TypeError("fetch failed"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < BREAKER_FAILURES; i++) expect(await call(u)).toEqual({ ok: false, reason: "error" });
    const [b] = await db.select().from(schema.aiBreaker).where(eq(schema.aiBreaker.task, "brain.chat"));
    expect(b.failures).toBe(5);
    expect(b.openedUntil!.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(await call(u)).toEqual({ ok: false, reason: "breaker" });
    expect(f).toHaveBeenCalledTimes(5);
    expect(await call(u, { task: "brain.intent" })).toEqual({ ok: false, reason: "error" }); // es por tarea: otra sigue probando
    // Pasaron los 10 minutos: semiabierto. Un éxito lo cierra.
    await db.update(schema.aiBreaker).set({ openedUntil: new Date(Date.now() - 1000) }).where(eq(schema.aiBreaker.task, "brain.chat"));
    f = stubFetch(async () => reply({ reply: "volvió" }));
    expect(await call(u)).toMatchObject({ ok: true });
    expect((await db.select().from(schema.aiBreaker).where(eq(schema.aiBreaker.task, "brain.chat")))[0]).toMatchObject({ failures: 0, openedUntil: null });
    // Semiabierto otra vez y falla: se reabre enseguida.
    await db.update(schema.aiBreaker).set({ failures: 5, openedUntil: new Date(Date.now() - 1000) }).where(eq(schema.aiBreaker.task, "brain.chat"));
    stubFetch(async () => failure(400));
    expect(await call(u)).toEqual({ ok: false, reason: "error" });
    expect((await db.select().from(schema.aiBreaker).where(eq(schema.aiBreaker.task, "brain.chat")))[0].openedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("gateway: latencia, cancelación, concurrencia y caché", () => {
  const hang = (_url: string, init: RequestInit) => new Promise<Response>((_, rej) => {
    init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true });
  });
  it("caso 68: latencia excesiva → timeout a tiempo, sin reintento, y cuenta como falla para el breaker", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = stubFetch(hang);
    const u = await person();
    const t0 = Date.now();
    expect(await call(u, { timeoutMs: 300 })).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(f).toHaveBeenCalledTimes(1);
    const [row] = await usageOf(u);
    expect(row.outcome).toBe("timeout");
    expect(row.latencyMs).toBeGreaterThanOrEqual(290);
    expect((await db.select().from(schema.aiBreaker))[0].failures).toBe(1);
  });
  it("la cancelación del llamador corta el pedido (AbortSignal) y no cuenta para el breaker", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(hang);
    const u = await person();
    const c = new AbortController();
    setTimeout(() => c.abort(), 50);
    expect(await call(u, { signal: c.signal })).toEqual({ ok: false, reason: "cancelled" });
    expect((await usageOf(u))[0].outcome).toBe("cancelled");
    expect(await db.select().from(schema.aiBreaker)).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled(); // cancelar no es un error del servicio
    const done = new AbortController(); done.abort();
    expect(await call(u, { signal: done.signal })).toEqual({ ok: false, reason: "cancelled" });
  });
  it("concurrencia: una llamada a la vez por persona y un máximo global; una fila en curso vieja no bloquea", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubFetch(async () => { await gate; return reply({ reply: "ok" }); });
    const a = await person(), b = await person(), c = await person();
    await db.insert(schema.aiPolicy).values({ scope: "global", config: { max_concurrency: 2 } });
    const first = call(a);
    await vi.waitFor(async () => expect((await usageOf(a)).some((r) => r.outcome === null)).toBe(true));
    expect(await call(a)).toEqual({ ok: false, reason: "concurrency" }); // la misma persona: espera a la anterior
    const second = call(b);
    await vi.waitFor(async () => expect((await usageOf(b)).some((r) => r.outcome === null)).toBe(true));
    expect(await call(c)).toEqual({ ok: false, reason: "concurrency" }); // tope global (2) alcanzado
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({ ok: true });
    // Una fila «en curso» de una instancia que murió hace rato no cuenta.
    await db.insert(schema.aiUsage).values({ userId: c, task: "brain.chat", model: "gpt-6-luna", outcome: null, createdAt: new Date(Date.now() - 5 * 60_000) });
    expect(await call(c)).toMatchObject({ ok: true });
  });
  it("caché por persona y versión de contexto: acierta sin llamar ni gastar; otra versión u otra persona no", async () => {
    const f = stubFetch(async () => reply({ reply: "Tu última marca fue 80 kg × 6." }));
    const a = await person(), b = await person();
    expect(await call(a, { cacheKey: "ctx-v1" })).toMatchObject({ ok: true, usage: { cached: false } });
    const hit = await call(a, { cacheKey: "ctx-v1" });
    expect(hit).toMatchObject({ ok: true, data: { reply: "Tu última marca fue 80 kg × 6." }, usage: { cached: true, costMicros: 0 } });
    expect(f).toHaveBeenCalledTimes(1);
    await call(a, { cacheKey: "ctx-v2" }); // cambió el contexto: no acierta
    await call(b, { cacheKey: "ctx-v1" }); // otra persona: nunca comparte respuesta
    await call(a); // sin cacheKey: no usa caché
    expect(f).toHaveBeenCalledTimes(4);
    const rows = await usageOf(a);
    expect(rows.filter((r) => r.outcome === "cache")).toMatchObject([{ costMicros: 0, inputTokens: 0 }]);
    // Los aciertos de caché no cuentan para la cuota diaria.
    await db.insert(schema.aiPolicy).values({ scope: `user:${a}`, config: { user_daily_calls: 3 } });
    expect(await call(a, { cacheKey: "ctx-v1" })).toMatchObject({ ok: true, usage: { cached: true } });
    expect(await call(a, { cacheKey: "ctx-v3" })).toEqual({ ok: false, reason: "quota" });
    expect((await db.select().from(schema.aiUsage).where(and(eq(schema.aiUsage.userId, a), eq(schema.aiUsage.outcome, "cache"))))).toHaveLength(2);
  });
});
