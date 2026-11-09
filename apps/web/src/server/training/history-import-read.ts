// Lectura completa del historial: bloques de texto con contexto, sin recortar el original.
import { parseHistoryCsv, parseHistoryNotes, partitionHistoryNotes, splitHistoryText, type HistoryTextChunk, type ImportSet } from "@repi/domain";
import { aiJson, aiOn, type AiPart } from "../ai/openai";
import { AccessError } from "../access/util";
import { logError } from "../log";
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

// Una fecha con números de entrenamiento no puede desaparecer de una respuesta JSON aparentemente completa.
function numericDatedDays(text: string): string[] {
  const headers = [...text.matchAll(/^(\d{4}-\d{2}-\d{2})[ \t]*$/gm)];
  return [...new Set(headers.filter((header, index) => /\d/.test(text.slice(header.index! + header[0].length, headers[index + 1]?.index ?? text.length))).map((header) => header[1]))];
}

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

/** Tiempo máximo de un pedido a la IA. Si un bloque denso no termina, se divide y se relee por partes (ver readTextChunk). */
export const AI_ATTEMPT_MS = 90_000;
/** Bloques de texto que se leen de una vez: más chicos responden antes y en paralelo (antes 12 000; un historial denso no
 *  terminaba en el plazo). */
export const AI_CHUNK_CHARS = 4_000;

async function readPart(f: ImportFile, today: string, context = "", timeoutMs = AI_ATTEMPT_MS): Promise<{ sets: ImportSet[]; notes: string[] }> {
  const parts: AiPart[] = [{ type: "text", text: `Archivo: ${f.fileName.slice(0, 120)}. Transcribí el historial de entrenamiento.` }];
  if (context) parts.push({ type: "text", text: `Contexto del historial (sólo referencia para fechas, año y ejercicio; NO transcribir sus series):\n${context}` });
  if (f.kind === "text") parts.push({ type: "text", text: `Parte a transcribir completa (incluí todas sus series, hasta la última línea):\n${f.text ?? ""}` });
  else if (f.kind === "image") parts.push({ type: "image_url", image_url: { url: f.dataUrl!, detail: "high" } });
  else parts.push({ type: "file", file: { filename: f.fileName.slice(0, 120) || "historial.pdf", file_data: f.dataUrl! } });
  const out = await aiJson<AiOut>({ name: "historial_entrenamiento", system: SYSTEM(today), parts, schema: AI_SCHEMA, maxTokens: 8000, fast: f.kind === "text", requireComplete: true, timeoutMs, splitOnTimeout: f.kind === "text" });
  const sets: ImportSet[] = [];
  for (const s of out.sessions ?? []) for (const e of s.exercises ?? []) for (const x of e.sets ?? []) {
    if (!Array.isArray(x.reps) || !Array.isArray(x.seconds) || (x.reps.length && x.seconds.length && x.reps.length !== x.seconds.length)) {
      throw new AccessError("ai_bad_output", "La lectura quedó incompleta. Probá de nuevo.", 422);
    }
    for (let i = 0; i < Math.max(x.reps.length, x.seconds.length, 1); i++) {
      sets.push({ day: s.date, exercise: e.name, weightKg: x.weight_kg, reps: x.reps[i] ?? null, seconds: x.seconds[i] ?? null });
    }
  }
  if (f.kind === "text") {
    const expectedDays = numericDatedDays(f.text ?? "");
    const covered = new Set(sets.map((set) => set.day));
    if (expectedDays.some((day) => !covered.has(day))) throw new AccessError("ai_bad_output", "La lectura omitió una fecha del historial. Reintentá esa parte para completarla.", 422);
  }
  return { sets, notes: (out.notes ?? []).map((n) => String(n).slice(0, 300)).slice(0, 10) };
}

async function readTextChunk(f: ImportFile, today: string, chunk: HistoryTextChunk, deadline: number): Promise<Awaited<ReturnType<typeof readPart>>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new AccessError("ai_incomplete", "No pudimos leer todo el historial a tiempo. No se cargó ninguna parte. Probá dividirlo en archivos más chicos.", 422);
  try {
    return await readPart({ ...f, text: chunk.text }, today, chunk.context, Math.min(AI_ATTEMPT_MS, remaining));
  } catch (e) {
    // Muchas series compactas pueden agotar la salida (o el tiempo) aunque el texto de entrada sea corto.
    // Se relee TODO ese bloque en partes menores: nunca se conserva una respuesta truncada.
    const retry = e instanceof AccessError && ["ai_incomplete", "ai_bad_output", "ai_timeout"].includes(e.code);
    if (!retry || chunk.text.length <= 375 || deadline - Date.now() < 15_000) {
      if (e instanceof AccessError && e.code === "ai_timeout") {
        logError("ai.request.historial_entrenamiento", new Error(`timeout sin margen para dividir (${chunk.text.length} caracteres)`));
        throw new AccessError("ai_incomplete", "Una parte del historial tardó demasiado en leerse. No se cargó nada; tocá «Continuar» para reintentar desde lo ya leído.", 422);
      }
      throw e;
    }
    const parts = splitHistoryText(chunk.text, Math.max(256, Math.floor(chunk.text.length / 2)));
    const results = [];
    for (const part of parts) results.push(await readTextChunk(f, today, { text: part.text, context: [chunk.context, part.context].filter(Boolean).join("\n") }, deadline));
    return { sets: results.flatMap((r) => r.sets), notes: results.flatMap((r) => r.notes) };
  }
}

/** Si falla una parte no se devuelve una lectura parcial ni se crea la vista previa. */
export async function readHistoryWithAi(f: ImportFile, today: string, onProgress?: (p: HistoryImportProgress) => void, context = "", deadline = Date.now() + 240_000): Promise<{ sets: ImportSet[]; notes: string[] }> {
  if (f.kind !== "text") {
    onProgress?.({ stage: "reading", completed: 0, total: 1 });
    const result = await readPart(f, today, "", Math.min(AI_ATTEMPT_MS, Math.max(1, deadline - Date.now())));
    onProgress?.({ stage: "reading", completed: 1, total: 1 });
    return result;
  }
  const chunks = splitHistoryText(f.text ?? "", AI_CHUNK_CHARS).map((chunk) => ({ ...chunk, context: [context, chunk.context].filter(Boolean).join("\n") }));
  onProgress?.({ stage: "reading", completed: 0, total: chunks.length });
  const results: Awaited<ReturnType<typeof readPart>>[] = new Array(chunks.length);
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

/** Formatos claros se estructuran en el servidor; sólo las sesiones desconocidas requieren transcripción. */
export async function readHistoryInput(f: ImportFile, today: string, onProgress?: (p: HistoryImportProgress) => void, context = "", deadline = Date.now() + 240_000) {
  onProgress?.({ stage: "reading" });
  if (f.kind === "text" && !context) {
    const csv = parseHistoryCsv(f.text ?? "");
    if (csv) return { sets: csv, notes: [], source: "csv" as const };
    const notes = parseHistoryNotes(f.text ?? "", today);
    if (notes) return { ...notes, source: "notes" as const };
    const partitioned = partitionHistoryNotes(f.text ?? "", today);
    if (partitioned) {
      type Segment = { text: string; days: Set<string>; requiredDays: Set<string>; count: number; result?: { sets: ImportSet[]; notes: string[] } };
      const segments: Segment[] = [];
      for (const block of partitioned.blocks) {
        if (block.parsed) segments.push({ text: "", days: new Set([block.day]), requiredDays: new Set([block.day]), count: 1, result: block.parsed });
        else {
          const last = segments.at(-1);
          if (last && !last.result && last.text.length + block.text.length + 1 <= AI_CHUNK_CHARS) {
            last.text += `\n${block.text}`; last.days.add(block.day); for (const day of numericDatedDays(block.text)) last.requiredDays.add(day); last.count++;
          } else segments.push({ text: block.text, days: new Set([block.day]), requiredDays: new Set(numericDatedDays(block.text)), count: 1 });
        }
      }
      const pending = segments.filter((segment) => !segment.result);
      let completed = partitioned.blocks.length - pending.reduce((count, segment) => count + segment.count, 0);
      const report = () => onProgress?.({ stage: "reading", completed, total: partitioned.blocks.length });
      report();
      let next = 0, failed = false;
      async function worker() {
        while (!failed && next < pending.length) {
          const segment = pending[next++];
          try {
            if (!aiOn()) throw new AccessError("ai_unavailable", "Hay sesiones que necesitan lectura automática. No se cargó una parte incompleta; podés continuar cuando el servicio esté disponible.", 503);
            const result = await readHistoryWithAi({ ...f, text: segment.text }, today, undefined, "", deadline);
            if (result.sets.some((set) => !segment.days.has(set.day)) || [...segment.requiredDays].some((day) => !result.sets.some((set) => set.day === day))) throw new AccessError("ai_bad_output", "La lectura cambió una fecha del historial. Probá de nuevo para revisarla.", 422);
            const emptyDays = [...segment.days].filter((day) => !result.sets.some((set) => set.day === day));
            segment.result = { ...result, notes: [...result.notes, ...emptyDays.map((day) => `${day}: no había series con números que se pudieran incorporar al progreso.`)] };
            completed += segment.count; report();
          } catch (e) { failed = true; throw e; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()));
      return { sets: segments.flatMap((segment) => segment.result!.sets), notes: [...new Set(segments.flatMap((segment) => segment.result!.notes))], source: pending.length ? "ai" as const : "notes" as const };
    }
  }
  if (!aiOn()) throw new AccessError("ai_unavailable", "Por ahora podemos leer planillas y notas con fechas, ejercicios y series claras. Revisá el formato o probá de nuevo en un rato.", 503);
  return { ...await readHistoryWithAi(f, today, onProgress, context, deadline), source: "ai" as const };
}
