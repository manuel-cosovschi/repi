import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/log", () => ({ maskPath: (path: string) => path, logError: vi.fn() }));
vi.mock("@/server/access/util", () => ({
  AccessError: class extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } },
  audit: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("@/server/training/history-import-job", () => ({
  HISTORY_JOB_MAX_PARTS: 1000, HISTORY_JOB_PART_LENGTH: 16_000,
  startHistoryImportJob: vi.fn(), historyImportJobStatus: vi.fn(), readHistoryImportJobPart: vi.fn(), finishHistoryImportJob: vi.fn(), removeHistoryImportJob: vi.fn(),
}));
import { auth } from "@/server/auth";
import { AccessError, rateLimit } from "@/server/access/util";
import * as jobs from "@/server/training/history-import-job";
import { GET, POST } from "@/app/api/me/history-import-job/[[...path]]/route";

const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
const request = (payload: unknown, path: string[] = [], headers: Record<string, string> = {}) => new Request(`https://repiclub.com/api/me/history-import-job/${path.join("/")}`, {
  method: "POST", headers: { "content-type": "application/json", origin: "https://repiclub.com", ...headers }, body: JSON.stringify(payload),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue(undefined);
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "member" } } as never);
});

describe("API de lectura reanudable", () => {
  it("cobra los límites de inicio una sola vez; permite cientos de partes sin usar esos contadores", async () => {
    const input = { fileName: "Tres años", parts: 1000, inputHash: "a".repeat(64) };
    expect((await POST(request(input), context())).status).toBe(200);
    expect(jobs.startHistoryImportJob).toHaveBeenCalledWith("member", input);
    expect(rateLimit).toHaveBeenCalledWith("history-import:local", 12, 3_600_000);
    expect(rateLimit).toHaveBeenCalledWith("history-import:member:local", 30, 86_400_000);
    vi.mocked(rateLimit).mockClear();
    for (let index = 0; index < 40; index++) {
      const path = ["job", "part"];
      expect((await POST(request({ index, text: `Parte ${index}`, context: "Año 2023" }, path), context(path))).status).toBe(200);
    }
    expect(rateLimit).toHaveBeenCalledTimes(40);
    for (const call of vi.mocked(rateLimit).mock.calls) expect(call).toEqual(["history-import-parts:member:job:local", 3000, 3_600_000]);
    expect(jobs.readHistoryImportJobPart).toHaveBeenCalledTimes(40);
  });

  it("rechaza CSRF, sesión ausente, cuerpos fuera del máximo y límite agotado antes de empezar la lectura", async () => {
    const start = { fileName: "Notas", parts: 2 };
    expect((await POST(request(start, [], { origin: "https://otro.example" }), context())).status).toBe(403);
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    expect((await POST(request(start), context())).status).toBe(401);
    expect((await POST(request({ ...start, parts: 1001 }), context())).status).toBe(400);
    expect((await POST(request({ ...start, inputHash: "inválido" }), context())).status).toBe(400);
    for (const payload of [
      { index: 1000, text: "texto" }, { index: 0, text: "x".repeat(16_001) }, { index: 0, text: "texto", context: "x".repeat(16_001) },
    ]) expect((await POST(request(payload, ["job", "part"]), context(["job", "part"]))).status).toBe(400);
    vi.mocked(rateLimit).mockRejectedValueOnce(new AccessError("rate_limited", "Esperá un minuto.", 429));
    expect((await POST(request(start), context())).status).toBe(429);
    expect(jobs.startHistoryImportJob).not.toHaveBeenCalled();
    expect(jobs.readHistoryImportJobPart).not.toHaveBeenCalled();
  });

  it("consulta el avance, termina y descarta sólo en las rutas válidas de la persona autenticada", async () => {
    const status = { id: "job", completed: [0], total: 2, phase: "reading" as const };
    vi.mocked(jobs.historyImportJobStatus).mockResolvedValue(status);
    const response = await GET(new Request("https://repiclub.com/api/me/history-import-job/job/status"), context(["job", "status"]));
    expect(await response.json()).toEqual(status);
    expect(jobs.historyImportJobStatus).toHaveBeenCalledWith("member", "job");
    await POST(request({}, ["job", "finish"]), context(["job", "finish"]));
    expect(jobs.finishHistoryImportJob).toHaveBeenCalledWith("member", "job");
    expect(rateLimit).toHaveBeenCalledWith("history-import-finish:member:job:local", 60, 3_600_000);
    await POST(request({}, ["job", "remove"]), context(["job", "remove"]));
    expect(jobs.removeHistoryImportJob).toHaveBeenCalledWith("member", "job");
    expect((await POST(request({}, ["job", "part", "extra"]), context(["job", "part", "extra"]))).status).toBe(404);
    expect((await GET(new Request("https://repiclub.com/api/me/history-import-job"), context())).status).toBe(404);
  });

  it("propaga un intento de terminar incompleto como conflicto recuperable", async () => {
    vi.mocked(jobs.finishHistoryImportJob).mockRejectedValueOnce(new AccessError("incomplete", "Faltan partes.", 409));
    const response = await POST(request({}, ["job", "finish"]), context(["job", "finish"]));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Faltan partes.", code: "incomplete" });
  });
});
