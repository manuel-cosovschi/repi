// Comprobación después de subir un archivo por el proxy de Storage (D83). La URL firmada de Supabase ignora Range y
// responde 200 con el archivo entero: probeObject tiene que devolver el tamaño real y los primeros bytes y terminar, sin
// quedar esperando el resto (en producción colgaba la subida de fotos dentro de Next: ver docs/continuidad/PROXIMA_SESION.md).
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const store = new Map<string, Buffer>();
let srv: http.Server;
let base = "";
beforeAll(async () => {
  srv = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const key = u.searchParams.get("key") ?? "";
    if (u.pathname === "/fn" && u.searchParams.get("op") === "put") { store.set(key, Buffer.concat(chunks)); res.end("{}"); return; }
    if (u.pathname === "/fn" && u.searchParams.get("op") === "sign_read") {
      if (!store.has(key)) { res.writeHead(404); res.end(); return; }
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ url: `${base}/obj?key=${encodeURIComponent(key)}` })); return;
    }
    if (u.pathname === "/obj") { const b = store.get(key)!; res.writeHead(200, { "content-length": b.length }); res.end(b); return; } // sin 206
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.SUPABASE_STORAGE_PROXY_URL = `${base}/fn`;
  process.env.STORAGE_PROXY_SECRET = "prueba";
});
afterAll(() => { delete process.env.SUPABASE_STORAGE_PROXY_URL; delete process.env.STORAGE_PROXY_SECRET; srv.close(); });

describe("probeObject por el proxy de Storage", () => {
  it("con una respuesta 200 entera (Range ignorado) devuelve tamaño y cabecera, y no queda esperando", async () => {
    const { putObject, probeObject } = await import("@/server/storage");
    const bytes = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
    await putObject("progress/prueba/archivo", bytes);
    const t = Date.now();
    const p = await probeObject("progress/prueba/archivo");
    expect(p?.size).toBe(bytes.byteLength);
    expect(Array.from(p!.head)).toEqual(Array.from(bytes.subarray(0, 64)));
    expect(Date.now() - t).toBeLessThan(5_000);
    expect(await probeObject("progress/prueba/no-existe")).toBeNull();
  });
});
