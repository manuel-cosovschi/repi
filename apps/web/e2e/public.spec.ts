import { expect, test } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const PAGES = ["/", "/demo", "/acceso", "/ayuda", "/instalar", "/legal/terms", "/legal/privacy", "/legal/dpa"];

for (const path of PAGES) {
  test(`página pública ${path}: carga, sin errores, sin scroll lateral, accesible`, async ({ page }, info) => {
    const errors = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expectNoHorizontalOverflow(page, path);
    await expectAccessible(page, info, path.replace(/\W+/g, "_") || "home");
    expect(errors).toEqual([]);
  });
}

test("enlaces internos del sitio público responden", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
  const internal = hrefs.filter((h) => h.startsWith("/") && !h.startsWith("//")).map((h) => h.split("#")[0]).filter(Boolean);
  for (const h of [...new Set(internal)]) {
    const r = await request.get(h, { maxRedirects: 5 });
    expect(r.status(), h).toBeLessThan(400);
  }
});

test("sin sesión, las APIs privadas responden 401 y no datos", async ({ request }) => {
  for (const path of ["/api/me/training", "/api/me/history", "/api/me/export", "/api/messages", "/api/admin/orgs"]) {
    const r = await request.get(path);
    expect([401, 403, 404], path).toContain(r.status());
  }
});

test("manifest y service worker de la PWA", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "REPI", display: "standalone", scope: "/", start_url: expect.stringMatching(/^\//) });
  for (const i of m.icons) expect((await request.get(i.src)).status(), i.src).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain('url.pathname.startsWith("/api/")');
});
