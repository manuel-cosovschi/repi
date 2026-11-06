// Lectura completa del historial: bloques de texto con contexto, sin recortar el original.
import { parseHistoryCsv, parseHistoryNotes, splitHistoryText, type HistoryTextChunk, type ImportSet } from "@repi/domain";
import { aiJson, aiOn, type AiPart } from "../ai/openai";
import { AccessError } from "../access/util";
import type { ImportFile } from "./history-import";
import type { HistoryImportProgress } from "@/lib/history-import-stream";

const AI_SCHEMA = {
  type: "object", additionalProperties: false, required: ["sessions", "notes"],
  properties: {
    sessions: { type: "array", items: { type: "object", additionalProperties: false, required: ["date", "exercises"], properties: {
      date: { type: "string", description: "AAAA-MM-DD" },
      exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "sets"], properties: {
        name: { type: "string" },
        sets: { type: "array", items: { type: "object", additionalProperties: false, required: ["weight_kg", "reps", "seconds"], properties: {
          weight_kg: { type: ["number", "null"] },
          reps: { type: "array", items: { type: ["integer", "null"] } },
          seconds: { type: "array", items: { type: ["integer", "null"] } },
        } } },
      } } },
    } } },
    notes: { type: "array", items: { type: "string" } },
  },
};
type AiOut = { sessions: { date: string; exercises: { name: string; sets: { weight_kg: number | null; reps: (number | null)[]; seconds: (number | null)[] }[] }[] }[]; notes: string[] };

const SYSTEM = (today: string) => `Sos un asistente que transcribe registros de entrenamiento de fuerza (planillas, notas, cuadernos fotografiados, PDF) a datos.
Hoy es ${today}. Reglas:
- Devolvé cada día entrenado con su fecha en formato AAAA-MM-DD. Las fechas escritas DD/MM son de Argentina (día primero). Si falta el año, usá el de las fechas cercanas del mismo registro; sólo si no hay ninguna, el año más reciente que no quede en el futuro.
- Transcribí todas las series de la parte a transcribir, sin resumir ni omitir repeticiones. El contexto sólo sirve para interpretar la parte: no repitas sus series.
- Si hay varias referencias de continuación, la última es la más cercana a la parte actual. Las referencias globales sólo completan el año: nunca les tomes el día ni el ejercicio para una parte sin fecha.
- Anotaciones como «Press plano (105kg)» seguido de «5;5;5;4» son cuatro series de 105 kg con 5, 5, 5 y 4 repeticiones. «5 ladrillos» no indica kilos: conservá las repeticiones, weight_kg null y aclará la carga desconocida en notes.
- Salida compacta: agrupá series consecutivas del mismo ejercicio y peso en un elemento de sets. Cada repetición va en el array reps: «3x10 con 60» → {"weight_kg":60,"reps":[10,10,10],"seconds":[]}. «105 kg: 5;5;5;4» → {"weight_kg":105,"reps":[5,5,5,4],"seconds":[]}. Nunca resumas ni quites series iguales.
- Tiempo: array seconds, por ejemplo [60,45]; si no hay repeticiones, reps []. Si ambos arrays tienen datos, deben tener igual longitud (null donde falte el valor). Si sólo se conoce el peso, reps lleva un null por cada serie (tres series de sólo peso: reps [null,null,null], seconds []). No colapses series sin repeticiones. Libras a kilos (× 0,4536). Peso corporal o carga desconocida: weight_kg null.
- Nombres de ejercicios en español, como los escribió la persona (corregí sólo errores evidentes de tipeo).
- No inventes nada. Si algo no se lee o es ambiguo, omitilo y explicalo brevemente en notes (en español). Sin fecha legible, no se incluye.`;

async function readPart(f: ImportFile, today: string, context = "", timeoutMs = 60_000): Promise<{ sets: ImportSet[]; notes: string[] }> {
  const parts: AiPart[] = [{ type: "text", text: `Archivo: ${f.fileName.slice(0, 120)}. Transcribí el historial de entrenamiento.` }];
  if (context) parts.push({ type: "text", text: `Contexto del historial (sólo referencia para fechas, año y ejercicio; NO transcribir sus series):\n${context}` });
  if (f.kind === "text") parts.push({ type: "text", text: `Parte a transcribir completa (incluí todas sus series, hasta la última línea):\n${f.text ?? ""}` });
  else if (f.kind === "image") parts.push({ type: "image_url", image_url: { url: f.dataUrl!, detail: "high" } });
  else parts.push({ type: "file", file: { filename: f.fileName.slice(0, 120) || "historial.pdf", file_data: f.dataUrl! } });
  const out = await aiJson<AiOut>({ name: "historial_entrenamiento", system: SYSTEM(today), parts, schema: AI_SCHEMA, maxTokens: 8000, fast: f.kind === "text", requireComplete: true, timeoutMs });
  const sets: ImportSet[] = [];
  for (const s of out.sessions ?? []) for (const e of s.exercises ?? []) for (const x of e.sets ?? []) {
    if (!Array.isArray(x.reps) || !Array.isArray(x.seconds) || (x.reps.length && x.seconds.length && x.reps.length !== x.seconds.length)) {
      throw new AccessError("ai_bad_output", "La lectura quedó incompleta. Probá de nuevo.", 422);
    }
    for (let i = 0; i < Math.max(x.reps.length, x.seconds.length, 1); i++) {
      sets.push({ day: s.date, exercise: e.name, weightKg: x.weight_kg, reps: x.reps[i] ?? null, seconds: x.seconds[i] ?? null });
    }
  }
  return { sets, notes: (out.notes ?? []).map((n) => String(n).slice(0, 300)).slice(0, 10) };
}

async function readTextChunk(f: ImportFile, today: string, chunk: HistoryTextChunk, deadline: number): Promise<Awaited<ReturnType<typeof readPart>>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new AccessError("ai_incomplete", "No pudimos leer todo el historial a tiempo. No se cargó ninguna parte. Probá dividirlo en archivos más chicos.", 422);
  try {
    return await readPart({ ...f, text: chunk.text }, today, chunk.context, Math.min(60_000, remaining));
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
export async function readHistoryWithAi(f: ImportFile, today: string, onProgress?: (p: HistoryImportProgress) => void): Promise<{ sets: ImportSet[]; notes: string[] }> {
  if (f.kind !== "text") {
    onProgress?.({ stage: "reading", completed: 0, total: 1 });
    const result = await readPart(f, today);
    onProgress?.({ stage: "reading", completed: 1, total: 1 });
    return result;
  }
  const chunks = splitHistoryText(f.text ?? "", 12_000);
  onProgress?.({ stage: "reading", completed: 0, total: chunks.length });
  const results: Awaited<ReturnType<typeof readPart>>[] = new Array(chunks.length);
  const deadline = Date.now() + 120_000;
  let next = 0;
  let completed = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < chunks.length) {
      const i = next++;
      try {
        results[i] = await readTextChunk(f, today, chunks[i], deadline);
        onProgress?.({ stage: "reading", completed: ++completed, total: chunks.length });
      } catch (e) { failed = true; throw e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, () => worker()));
  return { sets: results.flatMap((r) => r.sets), notes: [...new Set(results.flatMap((r) => r.notes))] };
}

/** Formatos claros se estructuran en el servidor; sólo el texto no reconocido necesita transcripción externa. */
export async function readHistoryInput(f: ImportFile, today: string, onProgress?: (p: HistoryImportProgress) => void) {
  onProgress?.({ stage: "reading" });
  if (f.kind === "text") {
    const csv = parseHistoryCsv(f.text ?? "");
    if (csv) return { sets: csv, notes: [], source: "csv" as const };
    const notes = parseHistoryNotes(f.text ?? "", today);
    if (notes) return { ...notes, source: "notes" as const };
  }
  if (!aiOn()) throw new AccessError("ai_unavailable", "Por ahora podemos leer planillas y notas con fechas, ejercicios y series claras. Revisá el formato o probá de nuevo en un rato.", 503);
  return { ...await readHistoryWithAi(f, today, onProgress), source: "ai" as const };
}
