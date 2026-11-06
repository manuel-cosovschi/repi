// Ejecutar con la suite de integración: su globalSetup exige y recrea una base descartable repi_test.
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import * as access from "@/server/access/services";
import { confirmHistoryImport } from "@/server/training/history-import";
import { finishHistoryImportJob, historyImportJobStatus, readHistoryImportJobPart, removeHistoryImportJob, startHistoryImportJob } from "@/server/training/history-import-job";

vi.mock("@/server/training/history-import-read", () => ({ readHistoryInput: vi.fn() }));
import { readHistoryInput } from "@/server/training/history-import-read";

const reader = vi.mocked(readHistoryInput);
const now = new Date("2026-11-06T12:00:00Z");
const one = (reps = 5) => ({ sets: [{ day: "2023-01-02", exercise: "Press plano", weightKg: 105, reps, seconds: null }], notes: [], source: "notes" as const });
let serial = 0;
async function person() {
  const result = await access.signUpPerson({ name: "Historial reanudable", email: `history-job-${Date.now()}-${++serial}@test.repi.local`, password: "prueba1234", terms: true, birth: "01/01/1990" });
  return result.userId!;
}
beforeAll(() => { delete process.env.OPENAI_API_KEY; });
beforeEach(() => { reader.mockReset(); reader.mockResolvedValue(one()); });

describe("historial por partes con bloqueos reales", () => {
  it("conserva partes concurrentes, impide confirmar incompleto y reintenta finish sin duplicar el historial", async () => {
    const owner = await person(), other = await person();
    const { id } = await startHistoryImportJob(owner, { fileName: "Tres años", parts: 4 }, now);
    await expect(historyImportJobStatus(other, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(readHistoryImportJobPart(other, id, { index: 0, text: "Privado" })).rejects.toMatchObject({ code: "not_found" });
    await expect(finishHistoryImportJob(other, id, now)).rejects.toMatchObject({ code: "not_found" });
    await expect(removeHistoryImportJob(other, id)).rejects.toMatchObject({ code: "not_found" });
    await readHistoryImportJobPart(owner, id, { index: 0, text: "Parte 0" });
    await expect(confirmHistoryImport(owner, id)).rejects.toMatchObject({ code: "incomplete" });
    await expect(finishHistoryImportJob(owner, id, now)).rejects.toMatchObject({ code: "incomplete" });
    await Promise.all([1, 2, 3].map((index) => readHistoryImportJobPart(owner, id, { index, text: `Parte ${index}` })));
    expect(await historyImportJobStatus(owner, id)).toMatchObject({ phase: "reading", completed: [0, 1, 2, 3] });
    expect(reader).toHaveBeenCalledTimes(4);

    const [first, retry] = await Promise.all([finishHistoryImportJob(owner, id, now), finishHistoryImportJob(owner, id, now)]);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({ id, summary: { sets: 4, sessions: 1 }, capped: false });
    expect(await historyImportJobStatus(owner, id)).toMatchObject({ phase: "review", total: 4, completed: [0, 1, 2, 3] });
    const [draft] = await db.select().from(schema.historyImport).where(eq(schema.historyImport.id, id));
    expect(draft.parsed).toMatchObject({ phase: "review", total: 4, partHashes: { 0: expect.any(String), 3: expect.any(String) } });
    expect(draft.parsed).not.toHaveProperty("parts");
    await readHistoryImportJobPart(owner, id, { index: 0, text: "Parte 0" });
    expect(reader).toHaveBeenCalledTimes(4);
    await expect(readHistoryImportJobPart(owner, id, { index: 0, text: "Otro contenido" })).rejects.toMatchObject({ code: "part_conflict" });
    await Promise.all([confirmHistoryImport(owner, id), confirmHistoryImport(owner, id)]);
    const entries = await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.importId, id));
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.setIndex).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("dos peticiones simultáneas de la misma parte no repiten las series", async () => {
    const owner = await person();
    const { id } = await startHistoryImportJob(owner, { fileName: "Notas", parts: 1 }, now);
    await Promise.all([
      readHistoryImportJobPart(owner, id, { index: 0, text: "Misma parte" }),
      readHistoryImportJobPart(owner, id, { index: 0, text: "Misma parte" }),
    ]);
    const preview = await finishHistoryImportJob(owner, id, now);
    expect(preview.summary.sets).toBe(1);
  });

  it("un descarte durante la lectura gana y la respuesta pendiente no vuelve a guardar datos", async () => {
    const owner = await person();
    const { id } = await startHistoryImportJob(owner, { fileName: "Notas", parts: 1 }, now);
    let resolve!: (value: ReturnType<typeof one>) => void;
    reader.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const pending = readHistoryImportJobPart(owner, id, { index: 0, text: "Parte en lectura" });
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
    await removeHistoryImportJob(owner, id);
    resolve(one());
    await expect(pending).rejects.toMatchObject({ code: "closed" });
    const [row] = await db.select().from(schema.historyImport).where(eq(schema.historyImport.id, id));
    expect(row).toMatchObject({ status: "discarded", parsed: { sets: [], matches: {}, notes: [] } });
    expect(row.parsed).not.toHaveProperty("parts");
  });
});
