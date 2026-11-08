// Cliente mínimo de OpenAI (D132). La clave vive sólo en variables de entorno del servidor (OPENAI_API_KEY); nunca llega al
// navegador ni a los logs. Respuestas con esquema JSON estricto: lo que devuelve el modelo se valida igual antes de usarlo.
import { logError } from "../log";
import { AccessError } from "../access/util";

export const aiOn = () => !!process.env.OPENAI_API_KEY;
/** Lectura de archivos (fotos, PDF, texto largo): precisión. */
export const aiModel = () => process.env.OPENAI_MODEL || "gpt-4.1-mini";
/** Respuestas en la app (objetivo ≤3 s): modelo rápido y salida corta. */
export const aiFastModel = () => process.env.OPENAI_MODEL_FAST || "gpt-4.1-mini";
const reasoning = (m: string) => /^(gpt-5|gpt-6|o\d)/.test(m);
/** Esfuerzo de razonamiento según la familia: «minimal» existe sólo en GPT-5 original; GPT-5.4+ y GPT-6 usan «none» como
 *  mínimo y la serie o, «low» (docs oficiales de cada modelo, leídas el 07/11/2026). Sin temperatura en modelos de razonamiento. */
function effortFor(model: string, e: "minimal" | "low" | "medium" = "minimal") {
  if (e !== "minimal") return e;
  if (/^gpt-(5\.[4-9]|6)/.test(model)) return "none";
  if (/^o\d/.test(model)) return "low";
  return "minimal";
}

export type AiPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "file"; file: { filename: string; file_data: string } };

/** Lo que se supo de un intento (D210, gateway del cerebro): modelo, estado HTTP y tokens. Nunca el contenido. */
export type AiCallInfo = { model: string; status: number | null; finishReason: string | null; usage: { input: number; cached: number; output: number } | null };

/**
 * Pide un objeto JSON que cumpla `schema`. Lanza AccessError «ai_unavailable» si no hay clave o el servicio falla.
 * Opcionales (D210, para server/brain/gateway.ts; los llamadores actuales no cambian): `model` fuerza el modelo, `signal`
 * cancela junto con el timeout y `onInfo` recibe el estado y los tokens de este intento (sin contenido).
 */
export async function aiJson<T>(p: { name: string; system: string; parts: AiPart[]; schema: object; maxTokens?: number; effort?: "minimal" | "low" | "medium"; timeoutMs?: number; fast?: boolean; requireComplete?: boolean; model?: string; signal?: AbortSignal; onInfo?: (i: AiCallInfo) => void }): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AccessError("ai_unavailable", "La lectura automática no está disponible en este momento.", 503);
  const model = p.model || (p.fast ? aiFastModel() : aiModel());
  const timeout = AbortSignal.timeout(p.timeoutMs ?? 100_000);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: p.signal ? AbortSignal.any([timeout, p.signal]) : timeout,
      body: JSON.stringify({
        model,
        ...(reasoning(model) ? { reasoning_effort: effortFor(model, p.effort) } : { temperature: 0.2 }),
        max_completion_tokens: p.maxTokens ?? 16_000,
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.parts }],
        response_format: { type: "json_schema", json_schema: { name: p.name, strict: true, schema: p.schema } },
      }),
    });
  } catch (e) {
    p.onInfo?.({ model, status: null, finishReason: null, usage: null });
    if (!p.signal?.aborted) logError(`ai.request.${p.name}`, e); // cancelar a pedido del llamador no es un error del servicio
    throw new AccessError("ai_unavailable", "No pudimos conectar con el servicio de lectura. Probá de nuevo en un rato.", 503);
  }
  const j = await res.json().catch(() => null) as { choices?: { message?: { content?: string; refusal?: string } ; finish_reason?: string }[]; error?: { message?: string; code?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } } | null;
  if (p.onInfo) {
    const u = j?.usage;
    p.onInfo({ model, status: res.status, finishReason: j?.choices?.[0]?.finish_reason ?? null,
      usage: u ? { input: u.prompt_tokens ?? 0, cached: u.prompt_tokens_details?.cached_tokens ?? 0, output: u.completion_tokens ?? 0 } : null });
  }
  if (!res.ok || !j?.choices?.[0]?.message) {
    logError(`ai.response.${p.name}`, new Error(`OpenAI ${res.status} ${j?.error?.code ?? ""}`));
    throw new AccessError("ai_unavailable", "El servicio de lectura no respondió bien. Probá de nuevo en un rato.", 503);
  }
  if (p.requireComplete && j.choices[0].finish_reason !== "stop") throw new AccessError("ai_incomplete", "La lectura quedó incompleta. No se cargó ninguna parte. Probá dividir el historial en archivos más chicos.", 422);
  const msg = j.choices[0].message;
  if (msg.refusal || !msg.content) throw new AccessError("ai_refused", "No pudimos leer ese archivo. Probá con otra foto o con una planilla.", 422);
  try { return JSON.parse(msg.content) as T; }
  catch { throw new AccessError("ai_bad_output", "La lectura quedó incompleta. Probá con un archivo más corto.", 422); }
}
