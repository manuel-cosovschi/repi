// Cliente mínimo de OpenAI (D132). La clave vive sólo en variables de entorno del servidor (OPENAI_API_KEY); nunca llega al
// navegador ni a los logs. Respuestas con esquema JSON estricto: lo que devuelve el modelo se valida igual antes de usarlo.
import { logError } from "../log";
import { AccessError } from "../access/util";

export const aiOn = () => !!process.env.OPENAI_API_KEY;
/** Lectura de archivos (fotos, PDF, texto largo): precisión. */
export const aiModel = () => process.env.OPENAI_MODEL || "gpt-4.1-mini";
/** Respuestas en la app (objetivo ≤3 s): modelo rápido y salida corta. */
export const aiFastModel = () => process.env.OPENAI_MODEL_FAST || "gpt-4.1-mini";
const reasoning = (m: string) => /^(gpt-5|o\d)/.test(m);

export type AiPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "file"; file: { filename: string; file_data: string } };

/** Pide un objeto JSON que cumpla `schema`. Lanza AccessError «ai_unavailable» si no hay clave o el servicio falla. */
export async function aiJson<T>(p: { name: string; system: string; parts: AiPart[]; schema: object; maxTokens?: number; effort?: "minimal" | "low" | "medium"; timeoutMs?: number; fast?: boolean }): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AccessError("ai_unavailable", "La lectura automática no está disponible en este momento.", 503);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(p.timeoutMs ?? 100_000),
      body: JSON.stringify({
        model: p.fast ? aiFastModel() : aiModel(),
        ...(reasoning(p.fast ? aiFastModel() : aiModel()) ? { reasoning_effort: p.effort ?? "minimal" } : { temperature: 0.2 }),
        max_completion_tokens: p.maxTokens ?? 16_000,
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.parts }],
        response_format: { type: "json_schema", json_schema: { name: p.name, strict: true, schema: p.schema } },
      }),
    });
  } catch (e) {
    logError(`ai.request.${p.name}`, e);
    throw new AccessError("ai_unavailable", "No pudimos conectar con el servicio de lectura. Probá de nuevo en un rato.", 503);
  }
  const j = await res.json().catch(() => null) as { choices?: { message?: { content?: string; refusal?: string } ; finish_reason?: string }[]; error?: { message?: string; code?: string } } | null;
  if (!res.ok || !j?.choices?.[0]?.message) {
    logError(`ai.response.${p.name}`, new Error(`OpenAI ${res.status} ${j?.error?.code ?? ""}`));
    throw new AccessError("ai_unavailable", "El servicio de lectura no respondió bien. Probá de nuevo en un rato.", 503);
  }
  const msg = j.choices[0].message;
  if (msg.refusal || !msg.content) throw new AccessError("ai_refused", "No pudimos leer ese archivo. Probá con otra foto o con una planilla.", 422);
  try { return JSON.parse(msg.content) as T; }
  catch { throw new AccessError("ai_bad_output", "La lectura quedó incompleta. Probá con un archivo más corto.", 422); }
}
