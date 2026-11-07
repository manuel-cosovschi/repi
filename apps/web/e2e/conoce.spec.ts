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

test("el film de marca se abre con un toque, muestra sólo qué hace REPI y se cierra con Escape", async ({ page }, info) => {
  const events = await collectEvents(page);
  await page.goto("/conoce?sala=low");
  await page.getByRole("button", { name: /Mirá REPI en acción/ }).click();
  const dialog = page.getByRole("dialog", { name: /Cada repetición cuenta/ });
  await expect(dialog).toBeVisible();
  const src = await dialog.locator("video source").getAttribute("src");
  expect(src).toBe("/conoce/videos/film-marca.mp4");
  expect((await page.request.get(src!)).status()).toBe(200);
  // Pedido del titular (07/11): debajo del video, una línea con lo que muestra; nada de licencias ni descripciones largas.
  await expect(dialog.locator(".x3-film-sum")).toContainText("objetivo para cada serie");
  await expect(dialog).not.toContainText("Kevin MacLeod");
  await expect(dialog).not.toContainText("Descripción del video en texto");
  // Sin voz: la pista WebVTT de descripciones sigue para los lectores de pantalla.
  const vtt = await dialog.locator("track[kind=descriptions]").getAttribute("src");
  expect(vtt).toBe("/conoce/videos/film-marca.descripcion.vtt");
  expect(await (await page.request.get(vtt!)).text()).toMatch(/^WEBVTT/);
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
    for (const ext of ["mp4", "webp", "descripcion.vtt"]) expect((await page.request.get(`/conoce/videos/${id}.${ext}`)).status(), `${id}.${ext}`).toBe(200);
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

test("elegir una perspectiva deja la URL compartible y prepara el formulario para ese caso", async ({ page }) => {
  await page.goto("/conoce?sala=low&utm_source=prueba");
  await page.getByRole("tab", { name: /Entrenadores/ }).click();
  await expect(page).toHaveURL(/\/conoce\/entrenadores\?sala=low&utm_source=prueba$/);
  const form = page.getByRole("form", { name: "Solicitar una demo de REPI" });
  await expect(form.getByLabel("Nombre comercial o tu marca")).toBeVisible();
  await page.getByRole("tab", { name: /Aliados/ }).click();
  await expect(page).toHaveURL(/\/conoce\/aliados\?/);
  await expect(form.getByLabel("Empresa (opcional)")).toBeVisible();
});

test("el pie y «Saltar al contenido» quedan por encima del escenario fijo", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  expect(await skip.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el; })).toBe(true);
  const legal = page.locator("footer.st-foot a").first();
  await legal.scrollIntoViewIfNeeded();
  expect(await legal.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === el || el.contains(top)); })).toBe(true);
});

test("«Pausar animaciones» detiene lo que se mueve solo y se recuerda", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  const btn = page.getByRole("button", { name: "Pausar animaciones" });
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await page.reload();
  await expect(page.getByRole("button", { name: "Pausar animaciones" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pausar animaciones" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", "paused");
});

test("la música de los films tiene su atribución CC BY 4.0 en /creditos, enlazada desde el pie", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  await page.locator("footer.st-foot").getByRole("link", { name: "Créditos" }).click();
  await expect(page).toHaveURL(/\/creditos$/);
  const main = page.locator("main");
  await expect(main).toContainText("Kevin MacLeod");
  await expect(main.getByRole("link", { name: "Creative Commons Atribución 4.0" })).toHaveAttribute("href", /creativecommons\.org\/licenses\/by\/4\.0/);
  await expect(main).toContainText("fragmento editado"); // CC BY 4.0 §3(a)(1)(B): se indica la modificación
  await expect(main).toContainText("«Heroic Age»");
});

test("Smart Center aparece una sola vez, como caso de éxito, y no al entrar", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  await expect(page.locator("#cn-hero")).not.toContainText("Smart");
  const mentions = await page.locator("main").evaluate((m) => (m.textContent ?? "").split("Smart Center").length - 1);
  expect(mentions).toBe(1);
  await expect(page.locator("#caso .x3-case")).toContainText("Caso de éxito");
  await expect(page.locator("#caso .x3-case img")).toHaveAttribute("alt", "Smart Center Gym");
});

test("arriba no hay íconos sin nombre y abajo no queda una barra fija tapando la página", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  const head = page.locator("header.x3-head");
  // El nombre que se lee: el texto visible o, en el logo (una imagen), su aria-label. Un ícono suelto no tiene ninguno de los dos.
  for (const b of await head.locator("a, button").all()) expect(((await b.innerText()).trim() || (await b.getAttribute("aria-label")) || "").length, await b.evaluate((e) => e.outerHTML.slice(0, 80))).toBeGreaterThan(0);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForTimeout(300);
  expect(await page.locator(".cn-sticky").count()).toBe(0);
});

test("en el pie, la firma de SOVARE va alineada a la izquierda", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  const foot = page.locator("footer.st-foot");
  await foot.scrollIntoViewIfNeeded();
  const [brand, sovare] = await Promise.all([foot.locator(".st-foot-brand").boundingBox(), foot.locator(".st-sovare a").boundingBox()]);
  expect(Math.abs(brand!.x - sovare!.x)).toBeLessThan(2);
});

test("los errores del formulario se leen sobre la tarjeta clara", async ({ page }) => {
  await page.goto("/conoce?sala=low#contacto");
  const form = page.getByRole("form", { name: "Solicitar una demo de REPI" });
  await form.getByRole("button", { name: /Solicitar una demo/ }).click();
  const err = page.locator(".cn-form .cn-err").first();
  await expect(err).toBeVisible();
  expect(await err.evaluate((el) => getComputedStyle(el).color)).not.toBe("rgb(255, 180, 168)");
});

// Motion 2 · ronda 2: en un teléfono bajo (iPhone 15, 393 × 659) no hay lugar para todos los pedazos de 02 alrededor del
// titular. Los que no entran no se muestran: ninguno puede quedar encima del texto.
test.describe("con movimiento, en un teléfono bajo", () => {
  test.use({ reducedMotion: "no-preference", viewport: { width: 393, height: 659 } });
  test("02: ningún pedazo pisa el titular ni el párrafo", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "una sola vez (el tamaño de pantalla es el mismo en los dos proyectos)");
    await page.goto("/conoce?sala=low");
    const top = await page.locator("#problema").evaluate((s) => s.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((z) => new Promise<void>((res) => {
      let y = 0, last = performance.now();
      const st = (n: number) => { y += (400 * Math.min(100, n - last)) / 1000; last = n; window.scrollTo(0, Math.min(y, z)); if (y >= z) return res(); requestAnimationFrame(st); };
      requestAnimationFrame(st);
    }), top + 60);
    await expect(page.locator(".x3-frag").first()).toHaveAttribute("style", /left/);
    await page.waitForTimeout(1200);
    const over = await page.evaluate(() => {
      type B = { x: number; y: number; w: number; h: number };
      const R = (e: Element): B => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
      const hit = (a: B, b: B) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const texts = [...document.querySelectorAll(".x3-prob-vis .l1, .x3-prob-vis .r.a, .x3-prob-p")].map(R);
      return [...document.querySelectorAll<HTMLElement>(".x3-frag")]
        .filter((f) => f.offsetParent && getComputedStyle(f).visibility !== "hidden" && +getComputedStyle(f).opacity > 0.05)
        .filter((f) => texts.some((t) => hit(R(f), t))).map((f) => f.className);
    });
    expect(over).toEqual([]);
  });
});
