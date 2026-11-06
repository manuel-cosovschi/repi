import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_MAX_SETS, type ImportSet } from "@repi/domain";

// Aislamiento deliberado: estas pruebas no abren ni recrean una base de datos.
const memory = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  const rows = new Map<string, Row>();
  const copy = <T>(value: T): T => structuredClone(value);
  let serial = 0, transactions = 0, tail: Promise<void> = Promise.resolve();
  const db = {
    select: () => ({ from: () => {
      let predicate: (row: Row) => boolean = () => true;
      const query = {
        where: (condition: typeof predicate) => { predicate = condition; return query; },
        limit: () => query,
        for: () => query,
        then: (resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve([...rows.values()].filter(predicate).map(copy)).then(resolve, reject),
      };
      return query;
    } }),
    insert: () => ({ values: (value: Record<string, unknown>) => ({ returning: async () => {
      const row = { id: `job-${++serial}`, status: "draft", ...copy(value) };
      rows.set(row.id, row); return [copy(row)];
    } }) }),
    update: () => ({ set: (value: Record<string, unknown>) => ({ where: async (predicate: (row: Row) => boolean) => {
      for (const row of rows.values()) if (predicate(row)) Object.assign(row, copy(value));
    } }) }),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous; transactions++;
      try { return await fn(db); } finally { release(); }
    },
  };
  return { rows, db, transactions: () => transactions, reset: () => { rows.clear(); serial = 0; transactions = 0; tail = Promise.resolve(); } };
});
vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => (row: Record<string, unknown>) => row[field] === value,
  and: (...conditions: ((row: Record<string, unknown>) => boolean)[]) => (row: Record<string, unknown>) => conditions.every((condition) => condition(row)),
}));
vi.mock("@/db", () => ({ db: memory.db, schema: { historyImport: { id: "id", userId: "userId", status: "status" } } }));
vi.mock("@/server/access/util", () => ({ AccessError: class extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
} }));
vi.mock("@/server/training/history-import-read", () => ({ readHistoryInput: vi.fn() }));
vi.mock("@/server/training/history-import", () => ({ prepareHistoryPreview: vi.fn(), removeHistoryImport: vi.fn() }));
vi.mock("@/server/ai/openai", () => ({ aiFastModel: () => "model-fast-test" }));

import { readHistoryInput } from "@/server/training/history-import-read";
import { prepareHistoryPreview, removeHistoryImport } from "@/server/training/history-import";
import { finishHistoryImportJob, historyImportJobStatus, readHistoryImportJobPart, removeHistoryImportJob, startHistoryImportJob } from "@/server/training/history-import-job";

const now = new Date("2026-11-06T12:00:00Z");
const set: ImportSet = { day: "2023-01-02", exercise: "Press plano", weightKg: 105, reps: 5, seconds: null };
const result = (reps = 5) => ({ sets: [{ ...set, reps }], notes: [], source: "notes" as const });
const reader = vi.mocked(readHistoryInput);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
async function job(parts = 2) { return startHistoryImportJob("owner", { fileName: "Tres años de notas", parts }, now); }
beforeEach(() => { memory.reset(); vi.clearAllMocks(); reader.mockReset(); reader.mockResolvedValue(result()); });

describe("lectura reanudable del historial largo", () => {
  it("crea un borrador sin el texto fuente y sólo expone el avance", async () => {
    const started = await startHistoryImportJob("owner", { fileName: "Notas", parts: 80, inputHash: "a".repeat(64) }, now);
    expect(started).toEqual({ id: "job-1", total: 80, completed: [], phase: "reading" });
    expect(memory.rows.get(started.id)).toMatchObject({ status: "draft", parsed: { today: "2026-11-06", inputHash: "a".repeat(64), sets: [], parts: {} } });
    expect(await historyImportJobStatus("owner", started.id)).toEqual(started);
    await expect(job(1001)).rejects.toMatchObject({ code: "invalid" });
  });

  it("otra persona no puede consultar, leer, terminar ni quitar el borrador", async () => {
    const { id } = await job();
    for (const operation of [
      () => historyImportJobStatus("other", id),
      () => readHistoryImportJobPart("other", id, { index: 0, text: "privado" }),
      () => finishHistoryImportJob("other", id),
      () => removeHistoryImportJob("other", id),
    ]) await expect(operation()).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(reader).not.toHaveBeenCalled();
    expect(prepareHistoryPreview).not.toHaveBeenCalled();
    expect(removeHistoryImport).not.toHaveBeenCalled();
  });

  it("conserva sólo el resultado y usa el contexto y la fecha inicial al leer", async () => {
    const { id } = await job();
    const input = { index: 0, text: "Texto fuente privado", context: "Contexto privado" };
    expect(await readHistoryImportJobPart("owner", id, input)).toMatchObject({ completed: [0], total: 2, phase: "reading" });
    expect(reader).toHaveBeenCalledWith({ fileName: "Tres años de notas", kind: "text", text: input.text }, "2026-11-06", undefined, input.context, expect.any(Number));
    const saved = memory.rows.get(id)!;
    expect(JSON.stringify(saved)).not.toContain(input.text);
    expect(JSON.stringify(saved)).not.toContain(input.context);
    expect(saved).toMatchObject({ parsed: { parts: { 0: { sets: [set], source: "notes", hash: expect.stringMatching(/^[a-f0-9]{64}$/) } } } });
  });

  it("reintentar una parte idéntica no vuelve a leer; cambiar texto o contexto produce conflicto", async () => {
    const { id } = await job();
    const input = { index: 0, text: "Parte original", context: "Año 2023" };
    const first = await readHistoryImportJobPart("owner", id, input);
    expect(await readHistoryImportJobPart("owner", id, input)).toEqual(first);
    await expect(readHistoryImportJobPart("owner", id, { ...input, text: "Texto distinto" })).rejects.toMatchObject({ code: "part_conflict", status: 409 });
    await expect(readHistoryImportJobPart("owner", id, { ...input, context: "Año 2024" })).rejects.toMatchObject({ code: "part_conflict" });
    await expect(readHistoryImportJobPart("owner", id, { index: 2, text: "Fuera de rango" })).rejects.toMatchObject({ code: "invalid" });
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it("cuatro lecturas paralelas conservan todas las partes sin mantener transacciones durante la lectura", async () => {
    const { id } = await job(4);
    const reads = Array.from({ length: 4 }, () => deferred<ReturnType<typeof result>>());
    for (const read of reads) reader.mockImplementationOnce(() => read.promise);
    const requests = reads.map((_, index) => readHistoryImportJobPart("owner", id, { index, text: `Parte ${index}` }));
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(4));
    expect(memory.transactions()).toBe(0);
    for (const index of [3, 1, 0, 2]) reads[index].resolve(result(index + 1));
    await Promise.all(requests);
    expect(await historyImportJobStatus("owner", id)).toMatchObject({ completed: [0, 1, 2, 3] });
    const parts = (memory.rows.get(id)!.parsed as { parts: Record<string, { sets: ImportSet[] }> }).parts;
    expect(Object.keys(parts)).toHaveLength(4);
    expect([0, 1, 2, 3].map((index) => parts[index].sets[0].reps)).toEqual([1, 2, 3, 4]);
  });

  it("dos reintentos simultáneos de la misma parte guardan sus series una sola vez", async () => {
    const { id } = await job(1);
    const read = deferred<ReturnType<typeof result>>(); reader.mockReturnValue(read.promise);
    const input = { index: 0, text: "Una única parte" };
    const first = readHistoryImportJobPart("owner", id, input);
    const retry = readHistoryImportJobPart("owner", id, input);
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(2));
    read.resolve(result());
    expect(await first).toEqual(await retry);
    expect(memory.rows.get(id)).toMatchObject({ parsed: { parts: { 0: { sets: [set] } } } });
  });

  it("si dos textos distintos compiten por el mismo índice, el segundo no pisa al que ya se guardó", async () => {
    const { id } = await job(1);
    const firstRead = deferred<ReturnType<typeof result>>(), otherRead = deferred<ReturnType<typeof result>>();
    reader.mockReturnValueOnce(firstRead.promise).mockReturnValueOnce(otherRead.promise);
    const first = readHistoryImportJobPart("owner", id, { index: 0, text: "Parte original" });
    const other = readHistoryImportJobPart("owner", id, { index: 0, text: "Otro texto" });
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(2));
    firstRead.resolve(result(5)); await first;
    otherRead.resolve(result(13));
    await expect(other).rejects.toMatchObject({ code: "part_conflict", status: 409 });
    expect(memory.rows.get(id)).toMatchObject({ parsed: { parts: { 0: { sets: [set] } } } });
  });

  it("si una lectura falla, conserva el avance y sólo vuelve a leer la parte pendiente", async () => {
    const { id } = await job();
    await readHistoryImportJobPart("owner", id, { index: 0, text: "Parte correcta" });
    reader.mockRejectedValueOnce(new Error("red interrumpida"));
    await expect(readHistoryImportJobPart("owner", id, { index: 1, text: "Parte pendiente" })).rejects.toThrow("red interrumpida");
    expect(await historyImportJobStatus("owner", id)).toMatchObject({ completed: [0] });
    await readHistoryImportJobPart("owner", id, { index: 1, text: "Parte pendiente" });
    expect(await historyImportJobStatus("owner", id)).toMatchObject({ completed: [0, 1] });
    expect(reader).toHaveBeenCalledTimes(3);
  });

  it("descartar mientras responde el lector impide que la respuesta reviva el borrador", async () => {
    const { id } = await job();
    const read = deferred<ReturnType<typeof result>>(); reader.mockReturnValueOnce(read.promise);
    const request = readHistoryImportJobPart("owner", id, { index: 0, text: "Parte en curso" });
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
    Object.assign(memory.rows.get(id)!, { status: "discarded", parsed: { sets: [] } });
    read.resolve(result());
    await expect(request).rejects.toMatchObject({ code: "closed", status: 409 });
    expect(memory.rows.get(id)).toMatchObject({ status: "discarded", parsed: { sets: [] } });
  });

  it("rechaza terminar con partes faltantes y luego arma la vista completa en orden sin deduplicar series", async () => {
    const { id } = await job();
    reader.mockResolvedValueOnce({ ...result(13), notes: ["Carga desconocida"], source: "ai" });
    await readHistoryImportJobPart("owner", id, { index: 1, text: "Última parte" });
    await expect(finishHistoryImportJob("owner", id, now)).rejects.toMatchObject({ code: "incomplete", status: 409 });
    expect(prepareHistoryPreview).not.toHaveBeenCalled();
    reader.mockResolvedValueOnce({ sets: [set, set], notes: ["Carga desconocida"], source: "notes" });
    await readHistoryImportJobPart("owner", id, { index: 0, text: "Primera parte" });
    await finishHistoryImportJob("owner", id, now);
    expect(prepareHistoryPreview).toHaveBeenCalledWith("owner", { fileName: "Tres años de notas", sets: [set, set, { ...set, reps: 13 }], notes: ["Carga desconocida"], source: "ai", model: "model-fast-test" }, now, undefined, id);
  });

  it("reconcilia el avance y permite reintentar finish cuando ya hay vista previa", async () => {
    const { id } = await job(1);
    await readHistoryImportJobPart("owner", id, { index: 0, text: "Parte original" });
    const row = memory.rows.get(id)!;
    const value = row.parsed as { parts: Record<string, { hash: string }> };
    row.parsed = { phase: "review", total: 1, today: "2026-11-06", sets: [set], notes: [], partHashes: { 0: value.parts[0].hash } };
    expect(await historyImportJobStatus("owner", id)).toMatchObject({ phase: "review", completed: [0], total: 1 });
    await readHistoryImportJobPart("owner", id, { index: 0, text: "Parte original" });
    expect(reader).toHaveBeenCalledTimes(1);
    await finishHistoryImportJob("owner", id, now);
    expect(prepareHistoryPreview).toHaveBeenCalledWith("owner", { fileName: "Tres años de notas", sets: [set], notes: [], source: "notes", model: null }, now, undefined, id);
  });

  it("no acepta un historial que excede el límite de series entre varias partes", async () => {
    const { id } = await job();
    reader.mockResolvedValueOnce({ sets: Array.from({ length: IMPORT_MAX_SETS }, () => set), notes: [], source: "notes" });
    await readHistoryImportJobPart("owner", id, { index: 0, text: "Primera parte" });
    await expect(readHistoryImportJobPart("owner", id, { index: 1, text: "Supera el máximo" })).rejects.toMatchObject({ code: "too_large", status: 413 });
    expect(await historyImportJobStatus("owner", id)).toMatchObject({ completed: [0] });
    await expect(finishHistoryImportJob("owner", id)).rejects.toMatchObject({ code: "incomplete" });
  });
});
