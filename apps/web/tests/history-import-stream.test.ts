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

describe("historial largo · peticiones reanudables", () => {
  it("retoma desde el estado del servidor, no reenvía partes recibidas y prepara una sola vista previa completa", async () => {
    const { HistoryImportReadJob } = await import("@/lib/history-import-stream");
    const parts = Array.from({ length: 7 }, (_, index) => ({ text: `2024-01-0${index + 1}\nPress plano 4x10 50kg`, context: "" }));
    const completed = new Set<number>();
    const calls = new Map<number, number>();
    let starts = 0, statuses = 0, finishes = 0, fail = true;
    const status = () => ({ id: "job", completed: [...completed], total: parts.length, phase: "reading" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (path, init) => {
      const url = String(path);
      if (url === "/api/me/history-import-job") { starts++; return Response.json(status()); }
      if (url.endsWith("/status")) { statuses++; return Response.json(status()); }
      if (url.endsWith("/part")) {
        const { index, text, context } = JSON.parse(String(init?.body));
        expect(text).toBe(parts[index].text); expect(context).toBe(parts[index].context);
        calls.set(index, (calls.get(index) ?? 0) + 1);
        if (index === 1 && fail) { fail = false; return Response.json({ error: "Falló esta parte", code: "unavailable" }, { status: 503 }); }
        completed.add(index); return Response.json(status());
      }
      if (url.endsWith("/finish")) { expect(completed.size).toBe(parts.length); finishes++; return Response.json({ id: "preview", sets: 28 }); }
      throw new Error(`Unexpected request ${url}`);
    });
    try {
      const job = new HistoryImportReadJob<{ id: string; sets: number }>("Tres años.txt", parts, parts.map((p) => p.text).join("\n"));
      await expect(job.read(() => {})).rejects.toMatchObject({ code: "unavailable" });
      expect(finishes).toBe(0);
      const saved = [...completed], priorCalls = new Map(calls);
      const progress = vi.fn();
      expect(await job.read(progress)).toEqual({ id: "preview", sets: 28 });
      expect(starts).toBe(1); expect(statuses).toBe(1); expect(finishes).toBe(1);
      for (const index of saved) expect(calls.get(index)).toBe(priorCalls.get(index));
      expect(calls.get(1)).toBe(2);
      expect(progress).toHaveBeenCalledWith({ stage: "reading", completed: 7, total: 7 });
      await job.read(() => {});
      expect(finishes).toBe(1); // doble toque después del éxito tampoco crea otra vista previa
    } finally { fetchMock.mockRestore(); }
  });

  it("cancela las peticiones en curso y permite descartar el borrador sin preparar ni confirmar datos", async () => {
    const { HistoryImportReadJob } = await import("@/lib/history-import-stream");
    let started!: () => void;
    const partStarted = new Promise<void>((resolve) => { started = resolve; });
    let removed = false, finishes = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (path, init) => {
      const url = String(path);
      if (url === "/api/me/history-import-job") return Response.json({ id: "cancel-job", completed: [], total: 1, phase: "reading" });
      if (url.endsWith("/part")) return new Promise<Response>((_resolve, reject) => { started(); init!.signal!.addEventListener("abort", () => reject(new DOMException("Cancelado", "AbortError")), { once: true }); });
      if (url.endsWith("/remove")) { removed = true; return Response.json({ ok: true }); }
      if (url.endsWith("/finish")) finishes++;
      throw new Error(`Unexpected request ${url}`);
    });
    try {
      const job = new HistoryImportReadJob("notas.txt", [{ text: "texto", context: "" }], "texto");
      const controller = new AbortController();
      const reading = job.read(() => {}, controller.signal);
      await partStarted; controller.abort();
      await expect(reading).rejects.toMatchObject({ name: "AbortError" });
      await job.remove();
      expect(removed).toBe(true); expect(finishes).toBe(0);
    } finally { fetchMock.mockRestore(); }
  });

  it("un finish cuya respuesta se perdió se puede repetir usando el mismo borrador completo", async () => {
    const { HistoryImportReadJob } = await import("@/lib/history-import-stream");
    let finishes = 0, parts = 0, starts = 0;
    const status = { id: "complete", completed: [0], total: 1, phase: "review" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (path) => {
      const url = String(path);
      if (url === "/api/me/history-import-job") { starts++; return Response.json(status); }
      if (url.endsWith("/status")) return Response.json(status);
      if (url.endsWith("/part")) parts++;
      if (url.endsWith("/finish")) { if (++finishes === 1) throw new TypeError("Respuesta perdida"); return Response.json({ id: "same-preview" }); }
      throw new Error(`Unexpected request ${url}`);
    });
    try {
      const job = new HistoryImportReadJob("notas.txt", [{ text: "texto", context: "" }], "texto");
      await expect(job.read(() => {})).rejects.toMatchObject({ code: "network" });
      expect(await job.read(() => {})).toEqual({ id: "same-preview" });
      expect(starts).toBe(1); expect(parts).toBe(0); expect(finishes).toBe(2);
    } finally { fetchMock.mockRestore(); }
  });
});

describe("historial largo · límites por petición", () => {
  it("mantiene como máximo cuatro peticiones de partes simultáneas", async () => {
    const { HistoryImportReadJob } = await import("@/lib/history-import-stream");
    let ready!: () => void;
    const firstWave = new Promise<void>((resolve) => { ready = resolve; });
    const completed = new Set<number>(), release: (() => void)[] = [];
    let active = 0, maximum = 0, immediate = false;
    const status = () => ({ id: "parallel", total: 9, completed: [...completed], phase: "reading" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (path, init) => {
      if (String(path) === "/api/me/history-import-job") return Response.json(status());
      if (String(path).endsWith("/finish")) return Response.json({ id: "parallel" });
      const { index } = JSON.parse(String(init?.body));
      active++; maximum = Math.max(maximum, active);
      if (active === 4) ready();
      return new Promise<Response>((resolve) => {
        const finish = () => { completed.add(index); active--; resolve(Response.json(status())); };
        if (immediate) finish(); else release.push(finish);
      });
    });
    try {
      const job = new HistoryImportReadJob("notas.txt", Array.from({ length: 9 }, () => ({ text: "texto", context: "" })), "texto");
      const reading = job.read(() => {});
      await firstWave; expect(active).toBe(4);
      immediate = true; release.forEach((finish) => finish());
      await reading;
      expect(maximum).toBe(4); expect(completed.size).toBe(9);
    } finally { fetchMock.mockRestore(); }
  });
  it("corta una parte que no responde y deja el borrador disponible para continuar", async () => {
    const { HistoryImportReadJob } = await import("@/lib/history-import-stream");
    vi.useFakeTimers();
    let started!: () => void;
    const partStarted = new Promise<void>((resolve) => { started = resolve; });
    let finishCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (path, init) => {
      if (String(path) === "/api/me/history-import-job") return Response.json({ id: "timeout", total: 1, completed: [], phase: "reading" });
      if (String(path).endsWith("/finish")) finishCalls++;
      return new Promise<Response>((_resolve, reject) => { started(); init!.signal!.addEventListener("abort", () => reject(new DOMException("Cancelado", "AbortError")), { once: true }); });
    });
    try {
      const job = new HistoryImportReadJob("notas.txt", [{ text: "texto", context: "" }], "texto");
      const reading = job.read(() => {});
      const rejection = expect(reading).rejects.toMatchObject({ code: "timeout", status: 408 });
      await partStarted; await vi.advanceTimersByTimeAsync(75_001); await rejection;
      expect(finishCalls).toBe(0);
    } finally { fetchMock.mockRestore(); vi.useRealTimers(); }
  });
});
