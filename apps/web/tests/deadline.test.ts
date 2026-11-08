// Incidente 07/11: tiempos máximos del servidor. Un servicio que no termina responde 503 «timeout» en vez de colgar el pedido.
import { describe, expect, it } from "vitest";
import { handle } from "@/server/access/http";
import { DeadlineError, withDeadline } from "@/server/deadline";

describe("withDeadline", () => {
  it("devuelve el resultado o el error propio cuando llega a tiempo", async () => {
    await expect(withDeadline(Promise.resolve(7), 1_000)).resolves.toBe(7);
    await expect(withDeadline(Promise.reject(new Error("propio")), 1_000)).rejects.toThrow("propio");
  });
  it("corta lo que no termina con DeadlineError", async () => {
    const t = Date.now();
    await expect(withDeadline(new Promise(() => {}), 50, "consulta")).rejects.toBeInstanceOf(DeadlineError);
    expect(Date.now() - t).toBeLessThan(1_000);
  });
});

describe("handle con deadlineMs", () => {
  const req = (method = "GET") => new Request("http://localhost/api/admin/summary", { method });
  it("responde 503 «timeout» si el servicio no termina", async () => {
    const t = Date.now();
    const res = await handle(() => new Promise(() => {}), { deadlineMs: 50 })(req(), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "timeout" });
    expect(Date.now() - t).toBeLessThan(1_000);
  });
  it("en una escritura avisa que puede haberse aplicado", async () => {
    const res = await handle(() => new Promise(() => {}), { deadlineMs: 50 })(req("POST"), {});
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Recargá/);
  });
  it("sin demora, responde igual que siempre", async () => {
    const res = await handle(async () => ({ ok: 1 }), { deadlineMs: 1_000 })(req(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });
});
