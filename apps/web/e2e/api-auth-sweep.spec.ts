// 06/06 (D197): barrido de TODAS las rutas de /api sin sesión. Ninguna devuelve datos (2xx) ni falla (5xx), salvo las
// públicas revisadas a mano. Una ruta nueva entra sola al barrido: si responde 2xx sin sesión, esta prueba lo marca.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Públicas a propósito: búsqueda de sedes con alta pública (sin demos, D197) y estado de la demo propia (null sin demo).
// Públicas a propósito: la medición anónima de /conoce (D205) responde 204 sin sesión y no devuelve datos.
const PUBLIC = new Set(["GET /api/access/locations", "GET /api/demo/me", "POST /api/site/event"]);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "api");
const ID = "00000000-0000-4000-8000-000000000000";

function routes() {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "route.ts") files.push(p); } };
  walk(ROOT);
  return files.flatMap((f) => {
    const rel = relative(ROOT, f).replace(/(^|\/)route\.ts$/, "");
    if (rel.startsWith("auth")) return []; // better-auth: su propio control de origen y límites
    const url = "/api/" + rel.split("/").map((s) => (s.startsWith("[") ? (s.includes("...") ? "x" : ID) : s)).join("/");
    const src = readFileSync(f, "utf8");
    return ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((m) => new RegExp(`export (const|async function) ${m}\\b`).test(src)).map((m) => ({ m, url }));
  });
}

test("ninguna ruta de la API entrega datos sin sesión", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "una pasada alcanza: no depende del dispositivo");
  test.setTimeout(240_000);
  const list = routes();
  expect(list.length).toBeGreaterThan(100);
  const bad: string[] = [];
  for (const { m, url } of list) {
    const r = await request.fetch(url, { method: m, headers: m === "GET" ? {} : { "content-type": "application/json", origin: baseURL! }, data: m === "GET" ? undefined : {}, maxRedirects: 0 });
    const key = `${m} ${url.replace(ID, ":id")}`;
    if (r.status() >= 500 || (r.status() < 400 && !PUBLIC.has(`${m} ${url}`))) bad.push(`${r.status()} ${key}`);
  }
  expect(bad, "rutas que responden sin sesión o fallan").toEqual([]);
});

test("una escritura desde otro sitio se rechaza antes de la sesión", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop", "una pasada alcanza");
  const r = await request.post("/api/me/deletion", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: {} });
  expect(r.status()).toBe(403);
  expect((await r.json()).code).toBe("cross_site");
});
