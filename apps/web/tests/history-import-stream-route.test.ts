import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/log", () => ({ maskPath: (path: string) => path, logError: vi.fn() }));
vi.mock("@/server/access/util", () => ({
  AccessError: class AccessError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } },
  audit: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("@/server/training/history-import", () => ({ previewHistoryImport: vi.fn(), myHistoryImports: vi.fn(), confirmHistoryImport: vi.fn(), removeHistoryImport: vi.fn() }));

import { auth } from "@/server/auth";
import { AccessError, rateLimit } from "@/server/access/util";
import * as hi from "@/server/training/history-import";
import { POST } from "@/app/api/me/history-import/[[...path]]/route";

const ctx = () => ({ params: Promise.resolve({}) });
const request = (payload: unknown = { fileName: "notas.txt", kind: "text", text: "12/03/2024\nPress banca 3x10 50kg" }, extra: Record<string, string> = {}) => new Request("https://repiclub.com/api/me/history-import", { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson", origin: "https://repiclub.com", ...extra }, body: JSON.stringify(payload) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue(undefined);
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "member" } } as never);
});

describe("historial · ruta de progreso", () => {
  it("emite progreso antes del resultado y handle conserva la respuesta streaming", async () => {
    let finish!: (result: unknown) => void;
    const complete = new Promise((resolve) => { finish = resolve; });
    vi.mocked(hi.previewHistoryImport).mockImplementation(async (_user, _file, _now, progress) => { progress?.({ stage: "reading", completed: 1, total: 3 }); return await complete as never; });
    const res = await POST(request(), ctx());
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"completed":1');
    finish({ id: "draft" });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"result"');
    expect((await reader.read()).done).toBe(true);
    expect(rateLimit).toHaveBeenCalledTimes(2);
  });
  it("conserva clientes JSON y transmite errores posteriores al inicio", async () => {
    vi.mocked(hi.previewHistoryImport).mockResolvedValue({ id: "legacy" } as never);
    const legacy = await POST(request(undefined, { accept: "application/json" }), ctx());
    expect(await legacy.json()).toEqual({ id: "legacy" });
    vi.mocked(hi.previewHistoryImport).mockRejectedValue(new AccessError("ai_incomplete", "Lectura incompleta", 422));
    expect(await (await POST(request(), ctx())).text()).toContain('"type":"error","error":"Lectura incompleta","code":"ai_incomplete"');
  });
  it("ignora progresos tardíos después de cerrar el stream con error", async () => {
    let report!: (progress: { stage: "reading"; completed: number; total: number }) => void;
    vi.mocked(hi.previewHistoryImport).mockImplementation(async (_user, _file, _now, progress) => { report = progress!; throw new AccessError("ai_incomplete", "Falta una parte", 422); });
    expect(await (await POST(request(), ctx())).text()).toContain('"type":"error"');
    expect(() => report({ stage: "reading", completed: 2, total: 3 })).not.toThrow();
  });
  it("rechaza CSRF, falta de sesión, datos inválidos y límites antes del stream", async () => {
    expect((await POST(request(undefined, { origin: "https://otro.example" }), ctx())).status).toBe(403);
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    expect((await POST(request(), ctx())).status).toBe(401);
    const invalid = await POST(request({ fileName: "x", kind: "bad" }), ctx());
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("content-type")).toContain("application/json");
    expect((await POST(request({ fileName: "x", kind: "text", text: "  " }), ctx())).status).toBe(400);
    expect((await POST(request({ fileName: "x", kind: "image", dataUrl: "data:text/html;base64,abcd" }), ctx())).status).toBe(400);
    vi.mocked(rateLimit).mockRejectedValueOnce(new AccessError("rate_limited", "Esperá un minuto.", 429));
    expect((await POST(request(), ctx())).status).toBe(429);
    expect(hi.previewHistoryImport).not.toHaveBeenCalled();
  });
});
