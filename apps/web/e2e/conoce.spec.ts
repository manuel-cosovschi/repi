import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, watchErrors } from "./helpers";

// Experience 3.0 (D208): /conoce reconstruida. Rutas, QR con UTM, perfiles, films (con la versión 9:16 en teléfonos),
// eventos propios, formulario de leads, demos guiadas y WhatsApp. El escenario va en SVG (?sala=low): la escena 3D se
// prueba aparte con capturas; acá importa que todo funcione igual sin WebGL.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Ev = { name: string; profile: string | null; target: string | null; source: string; utmSource: string | null; path: string };
/** Junta los eventos que la página manda a /api/site/event. Se envuelve sendBeacon (los beacons no siempre pasan por los
 *  eventos de red de Playwright); el envío real sigue igual. */
async function collectEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ev: string[] }; w.__ev = [];
    const orig = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).endsWith("/api/site/event")) void (data instanceof Blob ? data.text() : Promise.resolve(String(data))).then((t) => w.__ev.push(t));
      return orig(url, data);
    };
  });
  return async (): Promise<Ev[]> => (await page.evaluate(() => (window as unknown as { __ev?: string[] }).__ev ?? []))
    .flatMap((t) => { try { const b = JSON.parse(t); return Array.isArray(b) ? b : [b]; } catch { return []; } });
}

const PATHS = ["/conoce", "/conoce/gimnasios", "/conoce/entrenadores", "/conoce/deportistas", "/conoce/aliados"];
for (const path of PATHS) {
  test(`${path}: carga, sin errores, sin scroll lateral y accesible`, async ({ page }, info) => {
    const errors = watchErrors(page);
    const res = await page.goto(`${path}?sala=low`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Cada repetición/i);
    await expectNoHorizontalOverflow(page, path);
    await expectAccessible(page, info, `conoce${path.replace(/\W+/g, "_")}`);
    expect(errors).toEqual([]);
  });
}

test("/conoce/<perfil> preselecciona la perspectiva y /conoce/otro no existe", async ({ page, request }) => {
  await page.goto("/conoce/entrenadores?sala=low");
  await expect(page.getByRole("tab", { name: /Entrenadores/ })).toHaveAttribute("aria-selected", "true");
  expect((await request.get("/conoce/marcianos")).status()).toBe(404);
});

test("el QR permanente lleva a /conoce con las UTM y la visita queda atribuida al QR", async ({ page, request }) => {
  const r = await request.get("/qr", { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  const to = new URL(r.headers().location, "http://localhost");
  expect(to.pathname).toBe("/conoce");
  expect(to.searchParams.get("utm_source")).toBe("qr");
  const events = await collectEvents(page);
  await page.goto(`${to.pathname}${to.search}&sala=low`);
  await page.getByRole("tab", { name: /Entrenadores/ }).click(); // «Gimnasios» ya está elegido por defecto
  await expect.poll(async () => (await events()).find((e) => e.name === "profile_select")).toMatchObject({ source: "qr", utmSource: "qr", profile: "entrenadores" });
});

test("el film de marca se abre con un toque, tiene la atribución de la música y se cierra con Escape", async ({ page }, info) => {
  const events = await collectEvents(page);
  await page.goto("/conoce?sala=low");
  await page.getByRole("button", { name: /Mirá REPI en acción/ }).click();
  const dialog = page.getByRole("dialog", { name: /Cada repetición cuenta/ });
  await expect(dialog).toBeVisible();
  const src = await dialog.locator("video source").getAttribute("src");
  expect(src).toBe("/conoce/videos/film-marca.mp4");
  expect((await page.request.get(src!)).status()).toBe(200);
  await expect(dialog).toContainText("Kevin MacLeod");
  await expect(dialog.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", /creativecommons\.org\/licenses\/by\/4\.0/);
  await expectAccessible(page, info, "conoce_film");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await events()).map((e) => e.name)).toEqual(expect.arrayContaining(["video_play", "film_open"]));
});

test("cada perspectiva tiene su film; en un teléfono en vertical, deportistas abre la versión 9:16", async ({ page }) => {
  await page.goto("/conoce/deportistas?sala=low");
  await page.getByRole("button", { name: /Ver el video/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const src = await dialog.locator("video source").getAttribute("src");
  const portrait = await page.evaluate(() => matchMedia("(orientation: portrait) and (max-width: 700px)").matches);
  expect(src).toBe(portrait ? "/conoce/videos/perfil-deportistas-vertical.mp4" : "/conoce/videos/perfil-deportistas.mp4");
  expect((await page.request.get(src!)).status()).toBe(200);
  await page.keyboard.press("Escape");
  for (const id of ["perfil-gimnasios", "perfil-entrenadores", "perfil-aliados", "f-intelligence", "f-progreso", "f-altas", "f-sala"]) {
    for (const ext of ["mp4", "webp"]) expect((await page.request.get(`/conoce/videos/${id}.${ext}`)).status(), `${id}.${ext}`).toBe(200);
  }
});

test("las escenas se cuentan una vez por visita al recorrer la página", async ({ page }) => {
  const events = await collectEvents(page);
  await page.goto("/conoce?sala=low");
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(80); }
  await expect.poll(async () => new Set((await events()).filter((e) => e.name === "scene_view").map((e) => e.target)).size).toBeGreaterThanOrEqual(6);
  const views = (await events()).filter((e) => e.name === "scene_view").map((e) => e.target);
  expect(views.length).toBe(new Set(views).size);
});

test("WhatsApp: cada botón lleva a wa.me con el mensaje de su caso", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  const hrefs = await page.$$eval("a[href*='wa.me']", (as) => as.map((a) => (a as HTMLAnchorElement).href));
  const texts = hrefs.map((h) => new URL(h).searchParams.get("text")).filter((t): t is string => !!t);
  expect(texts.length).toBeGreaterThanOrEqual(4);
  for (const t of texts) expect(t).toMatch(/REPI/);
  expect(new Set(texts).size).toBeGreaterThanOrEqual(3); // mensajes distintos según el caso
});

test("el formulario pide los datos mínimos y confirma el envío (base local)", async ({ page }) => {
  await page.goto("/conoce?sala=low#contacto");
  const form = page.getByRole("form", { name: "Solicitar una demo de REPI" });
  await form.getByRole("button", { name: /Solicitar una demo/ }).click();
  await expect(page.locator(".cn-form .cn-err, [role=alert]").first()).toBeVisible();
  await form.getByLabel("Tu nombre").fill("Prueba E2E Experience");
  await form.getByLabel(/Nombre del gimnasio/).fill("Gimnasio de prueba");
  await form.getByLabel("WhatsApp").fill("223 000-0000");
  await page.waitForTimeout(2200); // el antispam ignora envíos de menos de 2 s
  await form.getByRole("button", { name: /Solicitar una demo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Gracias|Recibimos|contacto/i })).toBeVisible();
});

test("una demo guiada arranca desde las puertas de /conoce", async ({ page }) => {
  await page.goto("/conoce?sala=low#demos");
  const btn = page.getByRole("button", { name: "Iniciar esta demo" }).first();
  await btn.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/conoce"), { timeout: 20_000 });
  expect(new URL(page.url()).pathname).not.toBe("/conoce");
});
