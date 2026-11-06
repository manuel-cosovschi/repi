// Lectura completa del historial: bloques de texto con contexto, sin recortar el original.
import { splitHistoryText, type HistoryTextChunk, type ImportSet } from "@repi/domain";
import { aiJson, type AiPart } from "../ai/openai";
import { AccessError } from "../access/util";
import type { ImportFile } from "./history-import";

const AI_SCHEMA = {
  type: "object", additionalProperties: false, required: ["sessions", "notes"],
  properties: {
    sessions: { type: "array", items: { type: "object", additionalProperties: false, required: ["date", "exercises"], properties: {
      date: { type: "string", description: "AAAA-MM-DD" },
      exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "sets"], properties: {
        name: { type: "string" },
        sets: { type: "array", items: { type: "object", additionalProperties: false, required: ["weight_kg", "reps", "seconds"], properties: {
          weight_kg: { type: ["number", "null"] }, reps: { type: ["integer", "null"] }, seconds: { type: ["integer", "null"] },
        } } },
      } } },
    } } },
    notes: { type: "array", items: { type: "string" } },
  },
};
type AiOut = { sessions: { date: string; exercises: { name: string; sets: { weight_kg: number | null; reps: number | null; seconds: number | null }[] }[] }[]; notes: string[] };

const SYSTEM = (today: string) => `Sos un asistente que transcribe registros de entrenamiento de fuerza (planillas, notas, cuadernos fotografiados, PDF) a datos.
Hoy es ${today}. Reglas:
- Devolvé cada día entrenado con su fecha en formato AAAA-MM-DD. Las fechas escritas DD/MM son de Argentina (día primero). Si falta el año, usá el de las fechas cercanas del mismo registro; sólo si no hay ninguna, el año más reciente que no quede en el futuro.
- Transcribí todas las series de la parte a transcribir, sin resumir ni omitir repeticiones. El contexto sólo sirve para interpretar la parte: no repitas sus series.
- Si hay varias referencias de continuación, la última es la más cercana a la parte actual. Las referencias globales sólo completan el año: nunca les tomes el día ni el ejercicio para una parte sin fecha.
- Anotaciones como «Press plano (105kg)» seguido de «5;5;5;4» son cuatro series de 105 kg con 5, 5, 5 y 4 repeticiones. «5 ladrillos» no indica kilos: conservá las repeticiones, weight_kg null y aclará la carga desconocida en notes.
- Cada serie va por separado: «3x10 con 60» son 3 series de 10 repeticiones con 60 kg. Libras a kilos (× 0,4536). Peso corporal o sin peso: weight_kg null.
- Ejercicios por tiempo (plancha, cardio): seconds. Sin dato, null.
- Nombres de ejercicios en español, como los escribió la persona (corregí sólo errores evidentes de tipeo).
- No inventes nada. Si algo no se lee o es ambiguo, omitilo y explicalo brevemente en notes (en español). Sin fecha legible, no se incluye.`;

async function readPart(f: ImportFile, today: string, context = "", timeoutMs = 100_000): Promise<{ sets: ImportSet[]; notes: string[] }> {
  const parts: AiPart[] = [{ type: "text", text: `Archivo: ${f.fileName.slice(0, 120)}. Transcribí el historial de entrenamiento.` }];
  if (context) parts.push({ type: "text", text: `Contexto del historial (sólo referencia para fechas, año y ejercicio; NO transcribir sus series):\n${context}` });
  if (f.kind === "text") parts.push({ type: "text", text: `Parte a transcribir completa (incluí todas sus series, hasta la última línea):\n${f.text ?? ""}` });
  else if (f.kind === "image") parts.push({ type: "image_url", image_url: { url: f.dataUrl!, detail: "high" } });
  else parts.push({ type: "file", file: { filename: f.fileName.slice(0, 120) || "historial.pdf", file_data: f.dataUrl! } });
  const out = await aiJson<AiOut>({ name: "historial_entrenamiento", system: SYSTEM(today), parts, schema: AI_SCHEMA, maxTokens: 16_000, requireComplete: true, timeoutMs });
  const sets: ImportSet[] = [];
  for (const s of out.sessions ?? []) for (const e of s.exercises ?? []) for (const x of e.sets ?? []) {
    sets.push({ day: s.date, exercise: e.name, weightKg: x.weight_kg, reps: x.reps, seconds: x.seconds });
  }
  return { sets, notes: (out.notes ?? []).map((n) => String(n).slice(0, 300)).slice(0, 10) };
}

async function readTextChunk(f: ImportFile, today: string, chunk: HistoryTextChunk, deadline: number): Promise<Awaited<ReturnType<typeof readPart>>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new AccessError("ai_incomplete", "No pudimos leer todo el historial a tiempo. No se cargó ninguna parte. Probá dividirlo en archivos más chicos.", 422);
  try {
    return await readPart({ ...f, text: chunk.text }, today, chunk.context, Math.min(100_000, remaining));
  } catch (e) {
    // Muchas series compactas pueden agotar la salida aunque el texto de entrada sea corto.
    // Se relee TODO ese bloque en partes menores: nunca se conserva una respuesta truncada.
    if (!(e instanceof AccessError) || !["ai_incomplete", "ai_bad_output"].includes(e.code) || chunk.text.length <= 375) throw e;
    const parts = splitHistoryText(chunk.text, Math.max(256, Math.floor(chunk.text.length / 2)));
    const results = [];
    for (const part of parts) results.push(await readTextChunk(f, today, { text: part.text, context: [chunk.context, part.context].filter(Boolean).join("\n") }, deadline));
    return { sets: results.flatMap((r) => r.sets), notes: results.flatMap((r) => r.notes) };
  }
}

/** Si falla una parte no se devuelve una lectura parcial ni se crea la vista previa. */
export async function readHistoryWithAi(f: ImportFile, today: string): Promise<{ sets: ImportSet[]; notes: string[] }> {
  if (f.kind !== "text") return readPart(f, today);
  const chunks = splitHistoryText(f.text ?? "");
  const results: Awaited<ReturnType<typeof readPart>>[] = new Array(chunks.length);
  const deadline = Date.now() + 240_000;
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < chunks.length) {
      const i = next++;
      try {
        results[i] = await readTextChunk(f, today, chunks[i], deadline);
      } catch (e) { failed = true; throw e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, () => worker()));
  return { sets: results.flatMap((r) => r.sets), notes: [...new Set(results.flatMap((r) => r.notes))] };
}
