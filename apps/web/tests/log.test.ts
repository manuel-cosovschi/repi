import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "@/server/log";

afterEach(() => vi.restoreAllMocks());

describe("registro de errores", () => {
  it("recorta consultas fallidas: sin valores ni texto de la consulta", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new Error('Failed query: insert into "message" ("body") values ($1)\nparams: Me duele la rodilla,token123');
    (e as { cause?: unknown }).cause = { code: "23502" };
    logError("api", e, new Request("https://repi.test/api/me/requests?x=1", { method: "POST" }));
    const line = String(spy.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({ level: "error", scope: "api", where: "POST /api/me/requests", name: "Error", msg: "Failed query: insert", pg: "23502" });
    expect(line).not.toMatch(/rodilla|token123|message/);
  });
});
