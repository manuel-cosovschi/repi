import { describe, expect, it, vi } from "vitest";
import { previewHistoryImport, readHistoryImportResponse } from "@/lib/history-import-stream";

const ndjson = (pieces: Uint8Array[]) => new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const piece of pieces) controller.enqueue(piece); controller.close(); } }), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
const encode = (events: unknown[]) => new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join("\n") + "\n");

describe("historial · progreso transmitido", () => {
  it("preserva UTF-8 partido dentro de una tilde y entrega todas las etapas antes del resultado", async () => {
    const bytes = encode([{ type: "progress", progress: { stage: "reading", completed: 1, total: 3 } }, { type: "progress", progress: { stage: "matching" } }, { type: "result", data: { exercise: "Extensión de cuádriceps" } }]);
    const progress = vi.fn();
    expect(await readHistoryImportResponse(ndjson(Array.from(bytes, (byte) => Uint8Array.of(byte))), progress)).toEqual({ exercise: "Extensión de cuádriceps" });
    expect(progress.mock.calls.map(([p]) => p)).toEqual([{ stage: "reading", completed: 1, total: 3 }, { stage: "matching" }]);
  });
  it("rechaza un error tardío, incluso si antes llegó un resultado", async () => {
    await expect(readHistoryImportResponse(ndjson([encode([{ type: "result", data: { id: "draft" } }, { type: "error", error: "Falta una parte", code: "ai_incomplete" }])]), () => {})).rejects.toMatchObject({ message: "Falta una parte", code: "ai_incomplete" });
  });
  it("rechaza un stream cortado sin resultado y JSON incompleto", async () => {
    await expect(readHistoryImportResponse(ndjson([encode([{ type: "progress", progress: { stage: "reading", completed: 0, total: 2 } }])]), () => {})).rejects.toMatchObject({ code: "incomplete" });
    await expect(readHistoryImportResponse(ndjson([new TextEncoder().encode('{"type":"result","data":')]), () => {})).rejects.toMatchObject({ code: "incomplete" });
  });
  it("admite JSON anterior y conserva errores HTTP previos al stream", async () => {
    expect(await readHistoryImportResponse(Response.json({ id: "legacy" }), () => {})).toEqual({ id: "legacy" });
    await expect(readHistoryImportResponse(Response.json({ error: "Ingresá para continuar.", code: "unauthorized" }, { status: 401 }), () => {})).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
  it("solicita NDJSON sin cambiar credenciales ni texto pegado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "draft" }));
    try {
      const body = { fileName: "Texto pegado", kind: "text", text: "Press plano (105kg)\n5;5;5;4\n" };
      await previewHistoryImport(body, () => {});
      expect(fetchMock).toHaveBeenCalledWith("/api/me/history-import", expect.objectContaining({ credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify(body) }));
    } finally { fetchMock.mockRestore(); }
  });
});
