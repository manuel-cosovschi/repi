import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, watchErrors } from "./helpers";

// Experience 4.0 «The Living Gym» (docs/comercial/EXPERIENCE_4.md): lo nuevo de /conoce. La sala que se recorre, el dato que
// viaja a la gráfica, la transformación del equipo entre modalidades, el escenario 3D (monta, se cae y vuelve al plano SVG),
// las correcciones de captación (modalidad elegida, campaña larga, referencia del vendedor) y la veracidad de lo que se afirma.
// Como el resto de la suite, corre contra la build local con datos ficticios.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Ev = { name: string; profile: string | null; target: string | null };
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
const zoneTab = (page: Page, name: string) => page.getByRole("tablist", { name: "Zonas de la sala" }).getByRole("tab", { name, exact: true });
const form = (page: Page) => page.getByRole("form", { name: "Solicitar una demo de REPI" });
async function fillGym(page: Page, name = "Prueba E2E X4") {
  await form(page).getByLabel("Tu nombre").fill(name);
  await form(page).getByLabel(/Nombre del gimnasio/).fill("Gimnasio de prueba");
  await form(page).getByLabel("WhatsApp").fill("223 000-0000");
  await page.waitForTimeout(2200); // el antispam ignora envíos de menos de 2 s
}

// ── «Una sala. Todo conectado.» ──────────────────────────────────────────────────────────────────────────────────────
test("la sala: las cuatro zonas se recorren con las pestañas y con el teclado, y cada una ofrece su demo", async ({ page }, info) => {
  const errors = watchErrors(page);
  const events = await collectEvents(page);
  await page.goto("/conoce?sala=low#sala");
  await expect(page.getByRole("heading", { level: 2, name: /Una sala\. Todo conectado\./ })).toBeVisible();
  const panel = page.locator("#con-panel");
  await expect(zoneTab(page, "Toda la sala")).toHaveAttribute("aria-selected", "true");
  await expect(panel).toContainText("Cuatro lugares, un mismo sistema.");
  await zoneTab(page, "Recepción").click();
  await expect(panel).toContainText("Altas sin papeles y la pantalla del gimnasio.");
  await expect(panel.getByRole("button", { name: "Probar la pantalla" })).toBeVisible();
  await expect(panel.getByRole("link", { name: /Ver REPI Control/ })).toHaveAttribute("href", "#modos");
  // Teclado: flecha derecha → Sala → Equipo de sala → Oficina; Inicio vuelve a toda la sala.
  await zoneTab(page, "Recepción").press("ArrowRight");
  await expect(zoneTab(page, "Sala")).toHaveAttribute("aria-selected", "true");
  await expect(panel).toContainText("Cada serie con su objetivo.");
  await zoneTab(page, "Sala").press("ArrowRight");
  await expect(panel).toContainText("«Que venga alguien»");
  await zoneTab(page, "Equipo de sala").press("End");
  await expect(zoneTab(page, "Oficina")).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("button", { name: "Probar como gimnasio" })).toBeVisible();
  await zoneTab(page, "Oficina").press("Home");
  await expect(zoneTab(page, "Toda la sala")).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => (await events()).filter((e) => e.name === "feature_click" && e.target?.startsWith("sala-")).length).toBeGreaterThanOrEqual(4);
  await expectAccessible(page, info, "conoce-x4-sala");
  expect(errors).toEqual([]);
});

test.describe("la sala, con movimiento", () => {
  test.use({ reducedMotion: "no-preference" });

  test("fijada, los botones sobre la sala eligen la zona y llevan la página a su tramo", async ({ page }) => {
    await page.goto("/conoce?sala=low");
    const track = page.locator(".x4-con-track");
    await page.evaluate(() => { const e = document.querySelector(".x4-con-track")!; window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY + 40); });
    const spots = page.locator(".x4-con-spots");
    await expect(spots).toHaveAttribute("data-on", "1");
    // En pantalla ancha están las cuatro zonas; en una angosta, las que no entran sin tapar la tarjeta ni pisarse se retiran
    // (las pestañas siguen ofreciendo las cuatro).
    const vp = page.viewportSize()!;
    const all = page.locator(".x4-spot");
    if (vp.width >= 900) await expect(all).toHaveCount(4); else expect(await all.count()).toBeGreaterThanOrEqual(2);
    // Cada botón queda dentro de la pantalla, mide al menos 40 px (se puede tocar) y no tapa la tarjeta ni a otro botón.
    const card = (await page.locator(".x4-con-card").boundingBox())!;
    const hit = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const boxes: (typeof card)[] = [];
    for (const b of await all.all()) {
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 1);
      expect(r.height).toBeGreaterThanOrEqual(40);
      expect(hit(r, card)).toBe(false);
      for (const o of boxes) expect(hit(r, o)).toBe(false);
      boxes.push(r);
    }
    const y0 = await page.evaluate(() => window.scrollY);
    await page.locator(".x4-spot", { hasText: /^Sala$/ }).click();
    await expect(zoneTab(page, "Sala")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#con-panel")).toContainText("Cada serie con su objetivo.");
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(y0);
    await expect(spots).not.toHaveAttribute("data-on", "1"); // con una zona elegida, los botones de la vista general se retiran
    // Volver arriba del tramo devuelve la vista general (la posición de la página y la zona dicen siempre lo mismo).
    await zoneTab(page, "Toda la sala").click();
    await expect(zoneTab(page, "Toda la sala")).toHaveAttribute("aria-selected", "true");
    await expect(track).toBeVisible();
  });

  test("el dato de la serie llega a la gráfica: al final del tramo están el punto de hoy, el recorrido y quién lo ve", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/conoce?sala=low");
    const data = page.locator(".x4-data");
    const at = async (f: number) => { await page.evaluate((k) => { const e = document.querySelector(".x4-data")!; const r = e.getBoundingClientRect(); window.scrollTo(0, r.top + window.scrollY + k * (r.height - window.innerHeight)); }, f); await page.waitForTimeout(900); };
    await at(0.02);
    await expect(data.locator(".x4-chart-today")).toHaveCSS("opacity", "0"); // todavía no llegó
    await at(0.98);
    await expect(data.locator(".x4-chart-today")).toHaveCSS("opacity", "1");
    await expect(data.locator(".x4-chip")).toHaveCSS("opacity", "0"); // el viajero ya se volvió el punto
    await expect(data.locator(".x4-chart-tag")).toBeVisible();
    await expect(data.locator(".x4-data-roles li")).toHaveCount(2);
    // Reversible: al volver arriba, el punto de hoy se va.
    await at(0.02);
    await expect(data.locator(".x4-chart-today")).toHaveCSS("opacity", "0");
    expect(errors).toEqual([]);
  });

  test("teléfonos de 320 a 430 px: las escenas nuevas no generan scroll lateral", async ({ page }) => {
    for (const [w, h] of [[320, 568], [360, 800], [430, 932]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/conoce?sala=low");
      for (const sel of [".x4-data", ".x4-con-track", "#cierre"]) {
        await page.evaluate((s) => { const e = document.querySelector(s)!; const r = e.getBoundingClientRect(); window.scrollTo(0, r.top + window.scrollY + 0.5 * Math.max(0, r.height - window.innerHeight)); }, sel);
        await page.waitForTimeout(500);
        await expectNoHorizontalOverflow(page, `${sel} a ${w} px`);
      }
    }
  });

  test("cierre: al final queda el logo real, entero, y la acción principal a la vista", async ({ page }) => {
    await page.goto("/conoce?sala=low");
    await page.evaluate(() => { const e = document.getElementById("cierre")!; const r = e.getBoundingClientRect(); window.scrollTo(0, r.top + window.scrollY + r.height - window.innerHeight); });
    const wm = page.locator("#cierre .x3-fin-wm img");
    await expect(wm).toHaveAttribute("src", "/brand/wm_full.png"); // el recurso aprobado, nunca un logo redibujado
    await expect.poll(async () => wm.evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
    await expect(page.locator("#cierre").getByRole("link", { name: /Quiero REPI en mi gimnasio/ })).toBeInViewport();
    await expect(page.locator(".x4-fin-pre")).toBeHidden(); // la frase de la sala entera ya se fue
  });
});

test("el progreso, sin movimiento: la gráfica completa dice de dónde salen sus datos y coincide con la serie de arriba", async ({ page }) => {
  await page.goto("/conoce?sala=low#en-accion");
  const real = (await page.locator(".x3-train-table dd").nth(2).textContent())!.trim(); // «62,5 kg × 6», del motor real
  const data = page.locator(".x4-data");
  await expect(data.getByRole("heading", { level: 3 })).toContainText("Cada serie deja un dato.");
  const label = await data.getByRole("img").getAttribute("aria-label");
  const [kg] = real.split("×").map((s) => s.trim());
  expect(label).toContain(kg);                 // el último punto es la carga de la serie registrada arriba
  expect(label).toContain("ejemplo ficticio"); // y se dice qué parte es un ejemplo
  await expect(data.locator("figcaption")).toContainText("ejemplo ficticio");
  await expect(data.locator(".x4-chip")).toHaveText(new RegExp(real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

// ── Escenario 3D ─────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe("escenario 3D", () => {
  test.use({ reducedMotion: "no-preference" });

  test("sin WebGL la página queda en el plano SVG y todo sigue funcionando", async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) { return /webgl/.test(type) ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...rest); } as typeof orig; });
    await page.goto("/conoce");
    await expect(page.locator("html")).toHaveAttribute("data-sala", "low");
    await expect(page.locator(".sala")).toHaveAttribute("data-3d", "0");
    await expect(page.locator(".sala-svg")).toBeVisible();
    await expect(page.locator(".sala canvas")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("con WebGL: el 3D monta, y si se pierde el contexto vuelve el plano SVG sin romper la página", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/conoce?sala=medium");
    const sala = page.locator(".sala");
    const mounted = await sala.locator("canvas").waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
    test.skip(!mounted, "este navegador no ofrece WebGL: el nivel 3D no se puede probar acá");
    await expect(sala).toHaveAttribute("data-3d", "1", { timeout: 20_000 });
    // El lienzo ocupa la pantalla y no intercepta toques (la página se usa por encima).
    const box = (await sala.locator("canvas").boundingBox())!;
    const vp = page.viewportSize()!;
    expect(Math.round(box.width)).toBe(vp.width);
    expect(await sala.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    // Cambio de tamaño: sigue en 3D.
    await page.setViewportSize({ width: vp.width, height: Math.max(560, vp.height - 120) });
    await expect(sala).toHaveAttribute("data-3d", "1");
    // Contexto perdido: se retira el lienzo y queda el SVG.
    await sala.locator("canvas").evaluate((c: HTMLCanvasElement) => { const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null; gl?.getExtension("WEBGL_lose_context")?.loseContext(); });
    await expect(sala).toHaveAttribute("data-3d", "0", { timeout: 10_000 });
    await expect(sala.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".sala-svg")).toBeVisible();
    await page.getByRole("link", { name: /Pedir demo/ }).first().click();
    await expect(form(page)).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test("si la sala 3D se dibuja lenta, baja la resolución y después deja el plano SVG; la visita ya no vuelve a intentarlo", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    // `guard` fija el umbral en 0,5 ms por cuadro: cualquier equipo «va lento» y la red de seguridad actúa siempre.
    await page.goto("/conoce?sala=medium&guard=0.5");
    const sala = page.locator(".sala");
    const mounted = await sala.locator("canvas").waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
    test.skip(!mounted, "este navegador no ofrece WebGL: el nivel 3D no se puede probar acá");
    await expect(page.locator("html")).toHaveAttribute("data-sala-guard", /dpr|svg/, { timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-sala-guard", "svg", { timeout: 45_000 });
    await expect(sala).toHaveAttribute("data-3d", "0");
    await expect(sala.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".sala-svg")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // En la misma visita, otra página de /conoce va directo al plano (sin volver a cargar el 3D).
    await page.goto("/conoce/gimnasios");
    await expect(page.locator("html")).toHaveAttribute("data-sala", "low");
    await expect(page.locator(".sala canvas")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("sin el pedido de prueba, forzar un nivel no activa la red de seguridad (modo de revisión)", async ({ page }) => {
    await page.goto("/conoce?sala=medium");
    const mounted = await page.locator(".sala canvas").waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
    test.skip(!mounted, "este navegador no ofrece WebGL: el nivel 3D no se puede probar acá");
    await page.waitForTimeout(9000);
    await expect(page.locator("html")).not.toHaveAttribute("data-sala-guard", /.+/);
    await expect(page.locator(".sala")).toHaveAttribute("data-3d", "1");
  });
});

// ── Modalidades y captación ──────────────────────────────────────────────────────────────────────────────────────────
test.describe("captación", () => {
  test("la modalidad que queda elegida en la escena es la que viaja con el contacto, aunque no se toque su botón", async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/access/lead", async (r) => { sent = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
    await page.goto("/conoce?sala=low#modos");
    await page.getByRole("tab", { name: /REPI Control/ }).click();
    await expect(form(page).getByRole("radio", { name: "REPI Control" })).toBeChecked();
    // Cambia de idea: Completo. El formulario no puede quedar con la anterior.
    await page.getByRole("tab", { name: /REPI Completo/ }).click();
    await expect(form(page).getByRole("radio", { name: "REPI Completo" })).toBeChecked();
    await page.getByRole("link", { name: /Pedir demo/ }).first().click(); // por la cabecera, no por el botón de la modalidad
    await fillGym(page);
    await form(page).getByRole("button", { name: /Solicitar una demo/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Recibimos/ })).toBeVisible();
    expect(sent).toMatchObject({ kind: "gym", productMode: "completo" });
  });

  test("cambiar a mano el tipo de consulta no deja el interés de otra escena", async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/access/lead", async (r) => { sent = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
    await page.goto("/conoce/entrenadores?sala=low#contacto");
    await form(page).getByRole("radio", { name: "Un gimnasio" }).check();
    await fillGym(page, "Prueba E2E interés");
    await form(page).getByRole("button", { name: /Solicitar una demo/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Recibimos/ })).toBeVisible();
    expect(sent).toMatchObject({ kind: "gym", interest: "gimnasios" });
  });

  test("una campaña con nombre muy largo no hace perder el contacto (base local)", async ({ page }) => {
    const long = "campania-" + "x".repeat(150);
    await page.goto(`/conoce?sala=low&utm_source=instagram&utm_medium=social&utm_campaign=${long}#contacto`);
    const req = page.waitForRequest("**/api/access/lead");
    await fillGym(page, "Prueba E2E campaña");
    await form(page).getByRole("button", { name: /Solicitar una demo/ }).click();
    const body = (await req).postDataJSON() as { campaign: string; source: string };
    expect(body.campaign.length).toBeLessThanOrEqual(80);
    expect(body.source).toBe("utm");
    await expect(page.getByRole("status").filter({ hasText: /Recibimos/ })).toBeVisible(); // el servidor lo aceptó
  });

  test("la referencia de un vendedor viaja en el formulario y en los mensajes de WhatsApp", async ({ page, context }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/access/lead", async (r) => { sent = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
    await context.route(/wa\.me|whatsapp\.com/, (r) => r.abort());
    await page.goto("/conoce?sala=low&ref=V-ABC123#contacto");
    const wa = page.locator("#contacto a[href*='wa.me']").first();
    const before = new URL((await wa.getAttribute("href"))!).searchParams.get("text")!;
    expect(before).not.toContain("V-ABC123"); // el HTML no cambia: la referencia se agrega al tocar
    const popup = context.waitForEvent("page").then((p) => p.close(), () => {});
    await wa.click();
    await popup;
    const after = new URL((await wa.getAttribute("href"))!).searchParams.get("text")!;
    expect(after).toBe(`${before} (Ref. V-ABC123)`);
    // Cambiar de modalidad o de perfil no la pierde.
    await page.getByRole("tab", { name: /REPI Control/ }).click();
    await page.getByRole("tab", { name: /Entrenadores/ }).click();
    await form(page).getByRole("radio", { name: "Un gimnasio" }).check();
    await fillGym(page, "Prueba E2E referencia");
    await form(page).getByRole("button", { name: /Solicitar una demo/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Recibimos/ })).toBeVisible();
    expect(sent).toMatchObject({ referralCode: "V-ABC123", productMode: "control" });
  });

  test("«Pedir demo» de la cabecera queda medido como contacto", async ({ page }) => {
    const events = await collectEvents(page);
    await page.goto("/conoce?sala=low");
    await page.locator(".x3-head").getByRole("link", { name: /Pedir demo/ }).click();
    await expect.poll(async () => (await events()).find((e) => e.name === "contact_click" && e.target === "cabecera")).toBeTruthy();
    await expect(form(page)).toBeInViewport();
  });
});

test.describe("modalidades, con movimiento", () => {
  test.use({ reducedMotion: "no-preference" });

  test("al cambiar de modalidad el equipo se transforma y queda quieto, sin restos de la pantalla anterior", async ({ page }) => {
    await page.goto("/conoce?sala=low#modos");
    await page.getByRole("tab", { name: /REPI Control/ }).click();
    const main = page.locator("#md-panel-control .x3-md-main");
    await expect(main).toBeVisible();
    // Terminada la transformación: sin atributo de transición, sin transformación y sin la pantalla del teléfono encima.
    await expect(main).not.toHaveAttribute("data-morph", "1", { timeout: 4000 });
    await expect.poll(async () => main.evaluate((el) => getComputedStyle(el).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    await expect(main.locator(".x4-md-ghost")).toHaveCount(0);
    await expect(main.locator("img[data-on]")).toHaveCount(1);
    // Ida y vuelta rápida: no quedan dos equipos ni contenido del modo anterior.
    await page.getByRole("tab", { name: /REPI Completo/ }).click();
    await page.getByRole("tab", { name: /REPI Control/ }).click();
    await page.getByRole("tab", { name: /REPI Completo/ }).click();
    await expect(page.locator("#md-panel-control")).toBeHidden();
    await expect(page.locator("#md-panel-completo .x3-md-main")).toBeVisible();
    await expect(page.locator(".x4-md-ghost")).toHaveCount(0, { timeout: 4000 });
  });
});

// ── Veracidad ────────────────────────────────────────────────────────────────────────────────────────────────────────
test("lo que la página afirma: sin precios, sin cifras de clientes y con la disponibilidad de cada cosa dicha", async ({ page }) => {
  await page.goto("/conoce?sala=low");
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/\$\s?\d|\bARS\b|\bUSD\b|por mes|mensuales/i);            // sin precios públicos
  expect(text).not.toMatch(/\d+\s?%\s+(más|menos|de mejora)|\+\s?\d+\s?% /i);        // sin porcentajes de mejora
  expect(text).not.toMatch(/Body Intelligence/);                                     // el módulo se llama «Mi cuerpo» y es una primera etapa
  expect(text).not.toMatch(/gimnasios reales|varios gimnasios de Mar del Plata\b(?! ,)/); // la prueba social es la autorizada
  expect(text).toContain("Ya funciona en Mar del Plata.");
  expect(text).toContain("en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil");
  expect(text).not.toMatch(/Sin cuentas ni descargas/);
  // REPI Control dice cómo se habilita.
  await page.getByRole("tab", { name: /REPI Control/ }).click();
  await expect(page.locator("#md-panel-control .x3-md-avail")).toContainText("REPI la activa por gimnasio");
});
