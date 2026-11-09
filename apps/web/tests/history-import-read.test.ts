import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitHistoryText } from "@repi/domain";
import { createThreeYearHistory } from "../../../packages/domain/tests/fixtures/three-year-history";

vi.mock("@/server/ai/openai", () => ({ aiJson: vi.fn(), aiOn: vi.fn(() => true) }));
vi.mock("@/server/log", () => ({ logError: vi.fn() }));
vi.mock("@/server/access/util", () => ({ AccessError: class extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
} }));
import { aiJson, aiOn } from "@/server/ai/openai";
import { logError } from "@/server/log";
import { AccessError } from "@/server/access/util";
import { AI_CHUNK_CHARS, readHistoryInput, readHistoryWithAi } from "@/server/training/history-import-read";

const response = (reps: number) => ({ sessions: [{ date: "2024-03-12", exercises: [{ name: "Press plano", sets: [{ weight_kg: 105, reps: [reps], seconds: [] }] }] }], notes: [] });
const mockAi = vi.mocked(aiJson);
beforeEach(() => { mockAi.mockReset(); vi.mocked(aiOn).mockReturnValue(true); vi.mocked(logError).mockReset(); });

describe("lectura completa del historial largo", () => {
  it("lee tres años y 21.900 series completas, sin pedir una transcripción externa", async () => {
    const fixture = createThreeYearHistory();
    vi.mocked(aiOn).mockReturnValue(false);
    const out = await readHistoryInput({ fileName: "Tres años de prueba", kind: "text", text: fixture.text }, "2026-11-06");
    expect(out.source).toBe("notes");
    expect(out.sets).toEqual(fixture.sets);
    expect(out.sets.at(-1)).toMatchObject({ day: fixture.lastDay, reps: 17, weightKg: 99.75 });
    expect(mockAi).not.toHaveBeenCalled();
  });

  it("un comentario en una sesión de tres años manda sólo esa sesión a transcribir", async () => {
    const fixture = createThreeYearHistory();
    const badDay = fixture.sets[300 * 30].day;
    const text = fixture.text.replace(`${badDay}\n`, `${badDay}\nNota: el equipo estaba ocupado.\n`);
    const expected = fixture.sets.filter((set) => set.day === badDay);
    mockAi.mockResolvedValue({ sessions: [{ date: badDay, exercises: [...new Set(expected.map((set) => set.exercise))].map((name) => ({
      name, sets: [{ weight_kg: expected.find((set) => set.exercise === name)!.weightKg, reps: expected.filter((set) => set.exercise === name).map((set) => set.reps), seconds: [] }],
    })) }], notes: ["Se conservó la anotación de esa sesión."] });
    const out = await readHistoryInput({ fileName: "Tres años con comentario", kind: "text", text }, "2026-11-06");
    expect(out.source).toBe("ai");
    expect(out.sets).toEqual(fixture.sets);
    expect(mockAi).toHaveBeenCalledTimes(1);
    const sent = mockAi.mock.calls[0][0].parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    expect(sent).toContain(badDay);
    expect(sent).toContain("el equipo estaba ocupado");
    expect(sent).not.toContain(fixture.firstDay);
    expect(sent).not.toContain(fixture.lastDay);
    expect(sent.length).toBeLessThan(1000);
  });

  it("no acepta una fecha numérica que desaparezca de la lectura automática", async () => {
    mockAi.mockResolvedValue({ sessions: [], notes: [] });
    await expect(readHistoryInput({ fileName: "Una sesión", kind: "text", text: "2024-03-12\nComentario: carga variable\nPress plano 3x10 50kg" }, "2026-11-06")).rejects.toMatchObject({ code: "ai_bad_output" });
  });

  it("estructura notas claras de más de 60.000 caracteres sin ninguna consulta externa", async () => {
    vi.mocked(aiOn).mockReturnValue(false);
    const text = "12/03/2024\nPress plano con barra para pecho (105kg)\n5;5;5;4\n".repeat(1200);
    expect(text.length).toBeGreaterThan(60_000);
    const out = await readHistoryInput({ fileName: "Notas", kind: "text", text }, "2026-11-06");
    expect(out.source).toBe("notes");
    expect(out.sets).toHaveLength(4800);
    expect(out.sets.at(-1)).toMatchObject({ weightKg: 105, reps: 4 });
    expect(mockAi).not.toHaveBeenCalled();
  });

  it("expande la salida compacta preservando cada serie, su peso y su duración", async () => {
    mockAi.mockResolvedValue({ sessions: [{ date: "2024-03-12", exercises: [{ name: "Press plano", sets: [
      { weight_kg: 105, reps: [5, 5, 5, 4], seconds: [] },
      { weight_kg: 80, reps: [6, 5], seconds: [30, 40] },
      { weight_kg: null, reps: [], seconds: [60, 45] },
    ] }] }], notes: [] });
    const updates: { stage: string; completed?: number; total?: number }[] = [];
    const out = await readHistoryWithAi({ fileName: "Notas", kind: "text", text: "notas complejas" }, "2026-11-06", (p) => updates.push(p));
    expect(out.sets.map((s) => [s.weightKg, s.reps, s.seconds])).toEqual([
      [105, 5, null], [105, 5, null], [105, 5, null], [105, 4, null], [80, 6, 30], [80, 5, 40], [null, null, 60], [null, null, 45],
    ]);
    expect(updates).toEqual([{ stage: "reading", completed: 0, total: 1 }, { stage: "reading", completed: 1, total: 1 }]);
  });

  it("no acepta arrays de series desalineados como una lectura completa", async () => {
    mockAi.mockResolvedValue({ sessions: [{ date: "2024-03-12", exercises: [{ name: "Press", sets: [{ weight_kg: 60, reps: [10, 8], seconds: [30] }] }] }], notes: [] });
    await expect(readHistoryWithAi({ fileName: "Notas", kind: "text", text: "nota" }, "2026-11-06")).rejects.toMatchObject({ code: "ai_bad_output" });
  });

  it("envía todo el texto, incluso el último número después de 60.000 caracteres, y reúne las partes en orden", async () => {
    const text = "12/03/2024\n" + "Press plano (105kg)\n5;5;5;4\n".repeat(2700) + "Polea (5 ladrillos)\n17;16;13";
    expect(text.length).toBeGreaterThan(60_000);
    const chunks = splitHistoryText(text, AI_CHUNK_CHARS);
    let active = 0, peak = 0;
    mockAi.mockImplementation(async (p) => {
      const index = mockAi.mock.calls.findIndex(([arg]) => arg === p);
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, index % 3));
      active--;
      return response(index + 1);
    });
    const out = await readHistoryWithAi({ fileName: "Notas", kind: "text", text }, "2026-11-06");
    expect(mockAi).toHaveBeenCalledTimes(chunks.length);
    const sent = mockAi.mock.calls.map(([p]) => p.parts.filter((part) => part.type === "text").at(-1)!.text.split("\n").slice(1).join("\n"));
    expect(sent.join("")).toBe(text);
    expect(sent.at(-1)).toMatch(/17;16;13$/);
    expect(out.sets.map((s) => s.reps)).toEqual(chunks.map((_, i) => i + 1));
    expect(peak).toBeLessThanOrEqual(4);
    for (const [p] of mockAi.mock.calls) expect(p.requireComplete).toBe(true);
    expect(mockAi.mock.calls[1][0].parts).toContainEqual(expect.objectContaining({ type: "text", text: expect.stringContaining("NO transcribir sus series") }));
  });

  it("si falla una parte rechaza toda la lectura", async () => {
    mockAi.mockResolvedValueOnce(response(5)).mockRejectedValueOnce(new Error("lectura incompleta"));
    await expect(readHistoryWithAi({ fileName: "Notas", kind: "text", text: "12/03/2024\nPress plano 105 kg\n5;5;5;4\n".repeat(500) }, "2026-11-06")).rejects.toThrow("lectura incompleta");
  });

  it("si la salida se corta, relee el bloque entero en partes menores sin aceptar sus datos parciales", async () => {
    const text = "12/03/2024\nPress plano (105kg)\n" + "5;5;5;4\n".repeat(180);
    mockAi.mockRejectedValueOnce(new AccessError("ai_incomplete", "salida cortada", 422)).mockResolvedValue(response(4));
    const out = await readHistoryWithAi({ fileName: "Notas", kind: "text", text }, "2026-11-06");
    const sent = mockAi.mock.calls.slice(1).map(([p]) => p.parts.filter((part) => part.type === "text").at(-1)!.text.split("\n").slice(1).join("\n"));
    expect(sent.join("")).toBe(text);
    expect(out.sets).toHaveLength(sent.length);
    expect(mockAi.mock.calls.at(-1)![0].parts).toContainEqual(expect.objectContaining({ type: "text", text: expect.stringContaining("12/03/2024") }));
  });

  // Incidente 09/11: un alumno pegó un historial muy largo y denso; cada bloque de 12 000 caracteres agotaba los 60 s de la IA y la
  // lectura se descartaba entera. Ahora los bloques son más chicos y, si uno tarda demasiado, se relee partido, sin datos parciales.
  it("si un bloque agota el tiempo de la IA, lo relee partido y completa la lectura sin avisar un error", async () => {
    const text = "12/03/2024\nPress plano (105kg)\n" + "5;5;5;4\n".repeat(400);
    expect(text.length).toBeLessThanOrEqual(AI_CHUNK_CHARS);
    mockAi.mockRejectedValueOnce(new AccessError("ai_timeout", "tardó", 504)).mockResolvedValue(response(5));
    const out = await readHistoryWithAi({ fileName: "Historial denso", kind: "text", text }, "2026-11-06");
    expect(mockAi.mock.calls[0][0]).toMatchObject({ splitOnTimeout: true, requireComplete: true });
    const sent = mockAi.mock.calls.slice(1).map(([p]) => p.parts.filter((part) => part.type === "text").at(-1)!.text.split("\n").slice(1).join("\n"));
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent.join("")).toBe(text); // todo el bloque se relee, nada se pierde ni se repite
    expect(out.sets).toHaveLength(sent.length);
    expect(logError).not.toHaveBeenCalled();
  });

  it("sin tiempo para partir el bloque, falla entera con un mensaje claro y lo registra", async () => {
    mockAi.mockRejectedValue(new AccessError("ai_timeout", "tardó", 504));
    const text = "12/03/2024\nPress plano (105kg)\n" + "5;5;5;4\n".repeat(400);
    await expect(readHistoryWithAi({ fileName: "Historial", kind: "text", text }, "2026-11-06", undefined, "", Date.now() + 10_000))
      .rejects.toMatchObject({ code: "ai_incomplete", message: expect.stringContaining("Continuar") });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("mantiene la lectura de fotos y PDF en una sola petición", async () => {
    mockAi.mockResolvedValue(response(4));
    await readHistoryWithAi({ fileName: "foto.jpg", kind: "image", dataUrl: "data:image/jpeg;base64,AAAA" }, "2026-11-06");
    expect(mockAi).toHaveBeenCalledTimes(1);
    expect(mockAi.mock.calls[0][0].parts).toContainEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA", detail: "high" } });
    mockAi.mockClear();
    await readHistoryWithAi({ fileName: "notas.pdf", kind: "pdf", dataUrl: "data:application/pdf;base64,AAAA" }, "2026-11-06");
    expect(mockAi).toHaveBeenCalledTimes(1);
    expect(mockAi.mock.calls[0][0].parts).toContainEqual({ type: "file", file: { filename: "notas.pdf", file_data: "data:application/pdf;base64,AAAA" } });
  });
});
