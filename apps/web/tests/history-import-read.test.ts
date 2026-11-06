import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitHistoryText } from "@repi/domain";

vi.mock("@/server/ai/openai", () => ({ aiJson: vi.fn() }));
vi.mock("@/server/access/util", () => ({ AccessError: class extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
} }));
import { aiJson } from "@/server/ai/openai";
import { AccessError } from "@/server/access/util";
import { readHistoryWithAi } from "@/server/training/history-import-read";

const response = (reps: number) => ({ sessions: [{ date: "2024-03-12", exercises: [{ name: "Press plano", sets: [{ weight_kg: 105, reps, seconds: null }] }] }], notes: [] });
const mockAi = vi.mocked(aiJson);
beforeEach(() => { mockAi.mockReset(); });

describe("lectura completa del historial largo", () => {
  it("envía todo el texto, incluso el último número después de 60.000 caracteres, y reúne las partes en orden", async () => {
    const text = "12/03/2024\n" + "Press plano (105kg)\n5;5;5;4\n".repeat(2700) + "Polea (5 ladrillos)\n17;16;13";
    expect(text.length).toBeGreaterThan(60_000);
    const chunks = splitHistoryText(text);
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
    await expect(readHistoryWithAi({ fileName: "Notas", kind: "text", text: "12/03/2024\nPress plano 105 kg\n5;5;5;4\n".repeat(200) }, "2026-11-06")).rejects.toThrow("lectura incompleta");
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
