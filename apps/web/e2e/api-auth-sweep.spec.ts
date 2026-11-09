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

/**
 * FSA1 (seguridad): barrido entre espacios. Con la sesión de un coach y de un dueño de OTRA demo (otra organización),
 * ninguna ruta con `[orgId]` de la víctima entrega datos ni cambia nada (4xx, nunca 2xx ni 5xx), y tampoco con los ids de la
 * víctima bajo la organización propia. Una ruta nueva con `[orgId]` entra sola al barrido.
 */
const ORG_ROOTS = ["coach/[orgId]", "gym/[orgId]", "org/[orgId]", "conditions/[orgId]", "substitutions/[orgId]", "access/coach/[orgId]", "access/gym/[orgId]"];
const GYM_PATHS = ["context", "members", "team", "panel", "exec", "config", "reviews", "cases", "access-history", "messages", "community", "validations", "proposals", "club",
  "joins", "join-links", "join-qr", "accesses", "alerts", "access/settings", "access/report", "access/members", "floor-now", "setup", "connect/board", "connect/report", "equipment", "shifts", "perf", "engage", "hours", "queue", "tasks", "notices"];
function orgRoutes(org: string, id: string) {
  return routes().filter(({ url }) => ORG_ROOTS.some((r) => url.startsWith(`/api/${r.replace("[orgId]", ID)}`)))
    .flatMap(({ m, url }) => {
      const u = url.replace(ID, org).replaceAll(ID, id);
      // La API del gym es un único punto de entrada: se prueban sus secciones.
      return u.endsWith(`/api/gym/${org}/x`) ? GYM_PATHS.map((p) => ({ m, url: u.replace(/\/x$/, `/${p}`) })) : [{ m, url: u }];
    });
}
test("ningún coach ni dueño entra a la organización de otro", async ({ playwright, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "una pasada alcanza");
  test.setTimeout(300_000);
  const rnd = () => 1 + Math.floor(Math.random() * 250);
  const session = async (role: "coach" | "owner") => {
    const ctx = await playwright.request.newContext({ baseURL });
    const r = await ctx.post("/api/demo", { data: { role }, headers: { "x-forwarded-for": `10.${rnd()}.${rnd()}.${rnd()}` } });
    expect(r.status(), await r.text()).toBe(200);
    return { ctx, org: ((await r.json()) as { href: string }).href.split("/")[2].split("?")[0] };
  };
  const [coachA, coachB, ownerA, ownerB] = [await session("coach"), await session("coach"), await session("owner"), await session("owner")];
  // Ids reales de la víctima (un alumno y un programa del coach B; un socio del gym B) para probarlos también bajo la org propia.
  const ov = await (await coachB.ctx.get(`/api/coach/${coachB.org}/overview`)).json() as { clients: { id: string }[] };
  const ctxB = await (await ownerB.ctx.get(`/api/gym/${ownerB.org}/context`)).json() as { locations: { id: string }[] };
  const memB = await (await ownerB.ctx.get(`/api/gym/${ownerB.org}/members?loc=${ctxB.locations[0].id}`)).json() as { members: { id: string }[] };
  const bad: string[] = [];
  for (const [who, attacker, victim] of [["coach", coachA, coachB], ["dueño", ownerA, ownerB], ["coach→gym", coachA, ownerB], ["dueño→coach", ownerA, coachB]] as const) {
    const victimId = victim === coachB ? ov.clients[0].id : memB.members[0].id;
    for (const { m, url } of [...orgRoutes(victim.org, victimId), ...orgRoutes(attacker.org, victimId)]) {
      const r = await attacker.ctx.fetch(url, { method: m, headers: m === "GET" ? {} : { "content-type": "application/json", origin: baseURL! }, data: m === "GET" ? undefined : {}, maxRedirects: 0 });
      // En la org propia, una ruta sin id (p. ej. la lista) responde 200 con lo propio: sólo cuentan las que llevan el id ajeno.
      if (url.includes(attacker.org) && !url.includes(victimId)) continue;
      // Pendientes de invitación del equipo: a quien no gestiona ese gym le responde la lista vacía (no revela nada).
      if (r.status() === 200 && url.endsWith(`/api/access/gym/${victim.org}/invitations`) && JSON.stringify(await r.json()) === '{"invitations":[]}') continue;
      if (r.status() >= 500 || r.status() < 400) bad.push(`${who}: ${r.status()} ${m} ${url.replace(victim.org, "<víctima>").replace(attacker.org, "<propia>").replace(victimId, ":id")}`);
    }
  }
  for (const s of [coachA, coachB, ownerA, ownerB]) await s.ctx.dispose();
  expect(bad, "rutas que dejan entrar a otra organización").toEqual([]);
});

test("una escritura desde otro sitio se rechaza antes de la sesión", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop", "una pasada alcanza");
  const r = await request.post("/api/me/deletion", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: {} });
  expect(r.status()).toBe(403);
  expect((await r.json()).code).toBe("cross_site");
});
