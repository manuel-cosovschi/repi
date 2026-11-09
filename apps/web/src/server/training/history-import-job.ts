// Lecturas largas reanudables: cada petición conserva sólo sus series, nunca el texto pegado.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { IMPORT_MAX_SETS, NO_DATES_MESSAGE, localDate, type ImportSet } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { aiFastModel } from "../ai/openai";
import { readHistoryInput } from "./history-import-read";
import { prepareHistoryPreview, removeHistoryImport, type ApproxInfo } from "./history-import";

const { historyImport } = schema;
export const HISTORY_JOB_MAX_PARTS = 1000;
export const HISTORY_JOB_PART_LENGTH = 16_000;
/** Plazo de lectura de una parte (la ruta permite 300 s): alcanza para dividir y releer un bloque denso. */
export const HISTORY_JOB_PART_MS = 240_000;
type Source = "csv" | "notes" | "ai";
type Part = { hash: string; sets: ImportSet[]; notes: string[]; source: Source; undated?: number };
type JobParsed = {
  phase: "reading" | "review"; total: number; today: string; parts?: Record<string, Part>;
  partHashes?: Record<string, string>; inputHash?: string;
  sets: ImportSet[]; notes: string[]; approx?: ApproxInfo;
};
type Row = typeof historyImport.$inferSelect;
type Reader = Pick<typeof db, "select">;

const closed = () => new AccessError("closed", "Esa importación se descartó. Volvé a elegir el historial.", 409);
const conflict = () => new AccessError("part_conflict", "Esa parte pertenece a otro texto. Volvé a iniciar la lectura.", 409);
const tooLarge = () => new AccessError("too_large", `El historial supera las ${IMPORT_MAX_SETS.toLocaleString("es-AR")} series. Dividilo en archivos; no se confirmó ningún dato.`, 413);

async function mine(userId: string, id: string, reader: Reader = db, lock = false) {
  const query = reader.select().from(historyImport).where(and(eq(historyImport.id, id), eq(historyImport.userId, userId))).limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AccessError("not_found", "No encontramos esa importación.", 404);
  return row;
}

function parsed(row: Row): JobParsed {
  if (row.status !== "draft") throw closed();
  const value = row.parsed as JobParsed;
  if (!["reading", "review"].includes(value.phase) || !Number.isInteger(value.total) || value.total < 1 || value.total > HISTORY_JOB_MAX_PARTS) {
    throw new AccessError("not_found", "No encontramos esa lectura.", 404);
  }
  return value;
}

function status(row: Row, value = parsed(row)) {
  const completed = value.phase === "review" ? Array.from({ length: value.total }, (_, i) => i)
    : Object.keys(value.parts ?? {}).map(Number).sort((a, b) => a - b);
  return { id: row.id, completed, total: value.total, phase: value.phase };
}

export async function startHistoryImportJob(userId: string, input: { fileName: string; parts: number; inputHash?: string; approx?: ApproxInfo }, now = new Date()) {
  if (!Number.isInteger(input.parts) || input.parts < 1 || input.parts > HISTORY_JOB_MAX_PARTS) throw new AccessError("invalid", "Dividí el historial en menos partes.");
  const value: JobParsed & { matches: Record<string, never>; dropped: number; capped: boolean } = {
    phase: "reading", total: input.parts, today: localDate(now), parts: {}, sets: [], matches: {}, notes: [], dropped: 0, capped: false,
    ...(input.inputHash ? { inputHash: input.inputHash } : {}), ...(input.approx ? { approx: input.approx } : {}),
  };
  const [row] = await db.insert(historyImport).values({ userId, source: "notes", fileName: input.fileName.slice(0, 200), parsed: value }).returning();
  return status(row, value);
}

export async function historyImportJobStatus(userId: string, id: string) {
  return status(await mine(userId, id));
}

function checkPart(value: JobParsed, index: number, hash: string) {
  if (!Number.isInteger(index) || index < 0 || index >= value.total) throw new AccessError("invalid", "La parte no pertenece a esta lectura.");
  const priorHash = value.parts?.[index]?.hash ?? value.partHashes?.[index];
  if (priorHash && priorHash !== hash) throw conflict();
  if (priorHash) return true;
  if (value.phase !== "reading") throw new AccessError("closed", "La lectura ya terminó. Revisá el historial antes de confirmarlo.", 409);
  return false;
}

export async function readHistoryImportJobPart(userId: string, id: string, input: { index: number; text: string; context?: string }) {
  const row = await mine(userId, id);
  const value = parsed(row);
  const context = input.context ?? "";
  if (!input.text.trim()) throw new AccessError("invalid", "La parte está vacía.");
  if (input.text.length > HISTORY_JOB_PART_LENGTH || context.length > HISTORY_JOB_PART_LENGTH) throw new AccessError("too_large", "La parte es demasiado larga. Volvé a iniciar la lectura.", 413);
  const hash = createHash("sha256").update(JSON.stringify([input.text, context])).digest("hex");
  if (checkPart(value, input.index, hash)) return status(row, value);

  // No se mantiene una conexión de DB mientras responde el lector. Distintas partes pueden leerse en paralelo.
  const result = await readHistoryInput({ fileName: row.fileName ?? "Historial", kind: "text", text: input.text }, value.today, undefined, context, Date.now() + HISTORY_JOB_PART_MS);
  if (result.sets.length > IMPORT_MAX_SETS) throw tooLarge();
  return db.transaction(async (tx) => {
    // Volver a leer con bloqueo evita perder partes paralelas o revivir un borrador descartado durante la lectura.
    const current = await mine(userId, id, tx, true);
    const currentValue = parsed(current);
    if (checkPart(currentValue, input.index, hash)) return status(current, currentValue);
    const parts: Record<string, Part> = { ...currentValue.parts, [input.index]: { hash, ...result } };
    let sets = 0;
    for (const part of Object.values(parts)) {
      sets += part.sets.length;
      if (sets > IMPORT_MAX_SETS) throw tooLarge();
    }
    const next = { ...currentValue, parts };
    await tx.update(historyImport).set({ parsed: next }).where(and(eq(historyImport.id, id), eq(historyImport.userId, userId), eq(historyImport.status, "draft")));
    return status(current, next);
  });
}

export async function finishHistoryImportJob(userId: string, id: string, now = new Date()) {
  const row = await mine(userId, id);
  const value = parsed(row);
  let sets: ImportSet[], notes: string[], source: Source, undated = 0;
  if (value.phase === "review") {
    sets = value.sets; notes = value.notes; source = row.source;
  } else {
    const parts: Part[] = [];
    for (let i = 0; i < value.total; i++) {
      const part = value.parts?.[i];
      if (!part) throw new AccessError("incomplete", "Todavía faltan partes del historial por leer. Reintentá para continuar.", 409);
      parts.push(part);
    }
    sets = parts.flatMap((part) => part.sets);
    notes = [...new Set(parts.flatMap((part) => part.notes))];
    undated = parts.reduce((n, part) => n + (part.undated ?? 0), 0);
    source = parts.some((part) => part.source === "ai") ? "ai" : parts.some((part) => part.source === "notes") ? "notes" : "csv";
  }
  if (sets.length > IMPORT_MAX_SETS) throw tooLarge();
  // Ninguna parte tenía fechas escritas: no hay nada que ubicar en el tiempo (antes se cargaba todo en el día de hoy).
  if (!sets.length && undated > 0) throw new AccessError("no_dates", NO_DATES_MESSAGE, 422);
  return prepareHistoryPreview(userId, { fileName: row.fileName ?? "Historial", sets, notes, undated, approx: value.approx ?? null, source, model: source === "ai" ? aiFastModel() : null }, now, undefined, id);
}

export async function removeHistoryImportJob(userId: string, id: string) {
  // Verifica que sea una lectura propia antes de reutilizar el descarte y su bloqueo existentes.
  await mine(userId, id);
  return removeHistoryImport(userId, id);
}
