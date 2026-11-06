import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/access/util", () => ({ AccessError: class extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
} }));
import { aiJson } from "@/server/ai/openai";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("historial: una respuesta parcial de IA no es una lectura completa", () => {
  const request = { name: "historial_entrenamiento", system: "Transcribí", parts: [], schema: {}, requireComplete: true };
  it("rechaza salida truncada aunque el JSON sea válido", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "length", message: { content: '{"sessions":[]}' } }] })));
    await expect(aiJson(request)).rejects.toMatchObject({ code: "ai_incomplete" });
  });
  it("acepta salida completa", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"sessions":[]}' } }] })));
    await expect(aiJson(request)).resolves.toEqual({ sessions: [] });
  });
});
