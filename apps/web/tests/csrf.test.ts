// D197: una escritura de otro sitio se rechaza antes de llegar al servicio; la misma app, el cron y los servidores siguen igual.
import { describe, expect, it, vi } from "vitest";
import { crossSiteWrite, handle } from "@/server/access/http";

const req = (method: string, h: Record<string, string>) => new Request("https://repiclub.com/api/me/prefs", { method, headers: { host: "repiclub.com", ...h } });

describe("CSRF: escrituras de otro sitio", () => {
  it("rechaza Origin ajeno, inválido o Sec-Fetch-Site cross-site; acepta la propia app y llamadas sin navegador", () => {
    expect(crossSiteWrite(req("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(crossSiteWrite(req("DELETE", { origin: "null" }))).toBe(true);
    expect(crossSiteWrite(req("PATCH", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(crossSiteWrite(req("POST", { origin: "https://repiclub.com" }))).toBe(false);
    expect(crossSiteWrite(req("POST", { origin: "https://repiclub.com", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(crossSiteWrite(req("POST", {}))).toBe(false); // cron / servidor: sin cookie de persona
    expect(crossSiteWrite(req("GET", { origin: "https://evil.example" }))).toBe(false); // lectura: CORS no la expone
    expect(crossSiteWrite(req("POST", { origin: "https://repiclub.com.evil.example" }))).toBe(true);
  });

  it("el servicio no se ejecuta y la respuesta es 403 cross_site", async () => {
    const fn = vi.fn(async () => ({ ok: true }));
    const res = await handle(fn)(req("POST", { origin: "https://evil.example" }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("cross_site");
    expect(fn).not.toHaveBeenCalled();
    expect((await handle(fn)(req("POST", { origin: "https://repiclub.com" }), {})).status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
