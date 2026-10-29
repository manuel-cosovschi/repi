import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, maskPath } from "@/server/log";
import { pushHostAllowed } from "@/server/push/services";

afterEach(() => vi.restoreAllMocks());

describe("registro de errores", () => {
  it("SEC-11 (QA 29/10): los secretos del camino no llegan al registro", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("api", new Error("x"), new Request("https://repi.test/api/activate/tok_SECRETO123/accept", { method: "POST" }));
    const line = String(spy.mock.calls[0][0]);
    expect(line).not.toContain("tok_SECRETO123");
    expect(line).toContain("/api/activate/…/accept");
    expect(maskPath("/api/access/tutor/abc")).toBe("/api/access/tutor/…");
    expect(maskPath("/api/me/sessions/abc")).toBe("/api/me/sessions/abc");
  });
  it("SEC-7 (QA 29/10): sólo servicios de push de navegadores", () => {
    expect(pushHostAllowed("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(pushHostAllowed("https://web.push.apple.com/QK")).toBe(true);
    expect(pushHostAllowed("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    for (const bad of ["https://169.254.169.254/latest", "https://evil.com/fcm.googleapis.com", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "nada"]) expect(pushHostAllowed(bad)).toBe(false);
  });
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
