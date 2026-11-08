import { expect, test } from "@playwright/test";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// Pedido del titular (07/11/2026): «Abrir ficha del socio» desde Sala abre una página sólo con la ficha de ese socio, no el
// listado de todos con la ficha al final. En el teléfono, «Socios» muestra la lista o la ficha elegida, una por vez.
// Demo de sala (entorno ficticio is_demo).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("sala: «Abrir ficha del socio» abre su ficha sola y «Volver a Sala» regresa", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=queue"));
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  const card = page.locator(".cx-task").filter({ hasText: "Martina" }).filter({ hasText: "Programa nuevo" });
  await card.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("dialog", { name: /· Programa nuevo$/ }).getByRole("button", { name: "Abrir ficha del socio" }).click();

  // Sólo la ficha: el nombre es el título, sin la lista de socios ni el buscador.
  await expect(page).toHaveURL(/[?&]s=member&sel=/);
  await expect(page.getByRole("heading", { level: 1, name: /Martina/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Programa institucional" })).toBeInViewport();
  // M06: las pantallas visitadas quedan vivas y ocultas (Activity): se mira sólo lo que está a la vista.
  await expect(page.getByLabel("Buscar socio")).toBeHidden();
  await expect(page.locator(".crow:visible")).toHaveCount(0);
  // En el teléfono el cajón cerrado queda oculto para los lectores (QA M06): se mira el botón del menú directamente.
  await expect(page.locator('.co-nav button[title="Socios"]')).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalOverflow(page, "ficha del socio");

  // Recargar deja la misma ficha (la URL la describe).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /Martina/ })).toBeVisible();
  await page.getByRole("button", { name: "Todos los socios" }).first().click();
  await expect(page.getByLabel("Buscar socio")).toBeVisible();

  // Desde Sala, «Volver a Sala» regresa a la bandeja.
  await page.goto(href.replace("s=shift", "s=queue"));
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  await card.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("dialog", { name: /· Programa nuevo$/ }).getByRole("button", { name: "Abrir ficha del socio" }).click();
  await page.getByRole("button", { name: "Volver a Sala" }).click();
  await expect(page).toHaveURL(/[?&]s=queue/);
  await expect(page.getByRole("tab", { name: /^Pendientes/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("socios: en pantallas angostas se ve la lista o la ficha, una por vez", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "en escritorio la lista y la ficha van lado a lado");
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=members"));
  await expect(page.getByLabel("Buscar socio")).toBeVisible();
  await expect(page.locator(".detail-pane")).toBeHidden(); // antes la ficha del primero quedaba debajo de toda la lista
  await page.getByRole("button", { name: /Valentina/ }).first().click();
  await expect(page.getByLabel("Buscar socio")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Programa institucional" })).toBeInViewport();
  await page.getByRole("button", { name: "Todos los socios" }).click();
  await expect(page.getByLabel("Buscar socio")).toBeVisible();
  await expectNoHorizontalOverflow(page, "socios en el teléfono");
});

// M06 (docs/MOTION_NAVEGACION.md §10): el título es el nombre y recibe el foco, «Programa institucional» se ve sin pasar por
// ninguna lista en un teléfono de 390×844, y tanto «Volver a Sala» como el «atrás» del sistema regresan a Sala.
test("sala → ficha: foco en el nombre, programa a la vista en 390×844 y el «atrás» del sistema vuelve a Sala", async ({ page }, info) => {
  const errors = watchErrors(page);
  if (info.project.name === "mobile") await page.setViewportSize({ width: 390, height: 844 });
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=queue"));
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  const card = page.locator(".cx-task").filter({ hasText: "Martina" }).filter({ hasText: "Programa nuevo" });
  await card.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("dialog", { name: /· Programa nuevo$/ }).getByRole("button", { name: "Abrir ficha del socio" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); // el pedido se cierra antes de navegar
  const h1 = page.getByRole("heading", { level: 1, name: /Martina/ });
  await expect(h1).toBeVisible();
  await expect(h1).toBeFocused();
  await expect(page.getByRole("heading", { name: "Programa institucional" })).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/[?&]s=queue/);
  await expect(page.getByRole("heading", { level: 1, name: "Sala" })).toBeVisible();
  // Otra vez la ficha y ahora «Volver a Sala»: la bandeja sigue en la pestaña elegida.
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  await card.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("dialog", { name: /· Programa nuevo$/ }).getByRole("button", { name: "Abrir ficha del socio" }).click();
  await page.getByRole("button", { name: "Volver a Sala" }).click();
  await expect(page).toHaveURL(/[?&]s=queue/);
  await expect(page.getByRole("tab", { name: /^Pendientes/ })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("mi turno: «Abrir socio» abre la ficha sola y «Volver a Mi turno» regresa", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href);
  const open = page.getByRole("button", { name: "Abrir socio" }).first();
  test.skip(!(await open.isVisible({ timeout: 8_000 }).catch(() => false)), "la demo no tiene pendientes con socio en Mi turno");
  await open.click();
  await expect(page).toHaveURL(/[?&]s=member&sel=.*&from=shift/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByLabel("Buscar socio")).toBeHidden();
  await page.getByRole("button", { name: "Volver a Mi turno" }).click();
  await expect(page).toHaveURL(/[?&]s=shift/);
  expect(errors).toEqual([]);
});

test("coach: «Ver ficha» desde Solicitudes abre sólo la ficha del cliente, con «Volver a Solicitudes»", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "coach");
  if (await page.getByRole("button", { name: "Abrir menú" }).isVisible()) await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /^Solicitudes/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Solicitudes" })).toBeVisible();
  const ver = page.getByRole("button", { name: "Ver ficha" }).first();
  await expect(ver).toBeVisible();
  await ver.click();
  await expect(page).toHaveURL(/[?&]s=client&c=/);
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeFocused();
  await expect(h1).not.toHaveText("Clientes");
  await expect(page.getByLabel("Buscar cliente")).toBeHidden(); // sin la lista de todos los clientes
  await expect(page.getByRole("tablist", { name: "Ficha del cliente" })).toBeVisible();
  await page.reload(); // la URL describe la ficha
  await expect(page.getByRole("tablist", { name: "Ficha del cliente" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a Solicitudes" }).click();
  await expect(page).toHaveURL(/[?&]s=inbox/);
  await expect(page.getByRole("heading", { level: 1, name: "Solicitudes" })).toBeVisible();
  expect(errors).toEqual([]);
});

// QA M06 (07/11): con movimiento normal, Sala seguía viva y visible durante su salida y tomaba el id del socio como pedido:
// abría un segundo diálogo «Solicitud» con error que quedaba abierto al volver. playwright.config corre con movimiento
// reducido; acá se prueba con movimiento y se cuentan también los diálogos ocultos (pantallas vivas con Activity).
test.describe("con movimiento", () => {
  test.use({ reducedMotion: "no-preference" });
  const dialogs = (page: import("@playwright/test").Page) => page.locator('[role="dialog"]');

  test("sala → ficha → volver: ningún diálogo de más y el título de la ficha no cambia mientras sale", async ({ page }) => {
    const errors = watchErrors(page);
    const href = await openDemo(page, "floor");
    await page.goto(href.replace("s=shift", "s=queue"));
    const card = page.locator(".cx-task").filter({ hasText: "Martina" }).filter({ hasText: "Programa nuevo" });
    const openFile = async () => {
      await page.getByRole("tab", { name: /^Pendientes/ }).click();
      await card.getByRole("button", { name: "Abrir" }).click();
      await page.getByRole("dialog", { name: /· Programa nuevo$/ }).getByRole("button", { name: "Abrir ficha del socio" }).click();
      await expect(page.getByRole("heading", { level: 1, name: /Martina/ })).toBeVisible();
      await page.waitForTimeout(400); // pasa la salida de Sala
      await expect(dialogs(page)).toHaveCount(0);
    };
    await openFile();
    // Mientras la ficha sale, su título sigue siendo el nombre (no «Ficha del socio»).
    const titles = page.evaluate(() => new Promise<string[]>((res) => {
      const seen = new Set<string>(); const t0 = performance.now();
      const tick = () => {
        for (const h of document.querySelectorAll<HTMLElement>(".co-pane h1")) if (h.getClientRects().length && getComputedStyle(h.closest(".co-pane")!).display !== "none") seen.add(h.textContent?.trim() ?? "");
        if (performance.now() - t0 < 400) requestAnimationFrame(tick); else res([...seen]);
      };
      requestAnimationFrame(tick);
    }));
    await page.getByRole("button", { name: "Volver a Sala" }).click();
    expect((await titles).filter((x) => /Ficha del socio/i.test(x))).toEqual([]);
    const sala = page.getByRole("heading", { level: 1, name: "Sala" });
    await expect(sala).toBeVisible();
    await page.waitForTimeout(400);
    await expect(dialogs(page)).toHaveCount(0);
    await expect(sala).toBeFocused();
    await expect(page.getByRole("tab", { name: /^Pendientes/ })).toHaveAttribute("aria-selected", "true");
    // Otra vez, ahora con el «atrás» del navegador.
    await openFile();
    await page.goBack();
    await expect(sala).toBeVisible();
    await page.waitForTimeout(400);
    await expect(dialogs(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // QA M06: «Ver perfil →» desde Mensajes dejaba en Mensajes el id del cliente como si fuera una conversación; al volver no
  // quedaba ninguna abierta.
  test("coach: Mensajes → «Ver perfil →» → «Volver a Mensajes» conserva la conversación abierta", async ({ page }) => {
    const errors = watchErrors(page);
    await openDemo(page, "coach");
    const menu = page.getByRole("button", { name: "Abrir menú" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /^Mensajes/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mensajes" })).toBeVisible();
    const rows = page.locator(".list-pane .crow:visible");
    await expect(rows.first()).toBeVisible();
    const pick = (await rows.count()) > 1 ? rows.nth(1) : rows.first(); // otra que la abierta por defecto, si hay
    const name = (await pick.locator("b").innerText()).trim();
    await pick.click();
    const conv = page.getByRole("region", { name: `Conversación con ${name}` });
    await expect(conv).toBeVisible();
    await conv.getByRole("button", { name: "Ver perfil →" }).click();
    await expect(page).toHaveURL(/[?&]s=client&c=/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.getByRole("button", { name: "Volver a Mensajes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mensajes" })).toBeVisible();
    await expect(conv).toBeVisible();
    await expect(page.locator(".list-pane .crow:visible").filter({ hasText: name }).first()).toHaveAttribute("aria-current", "true");
    expect(errors).toEqual([]);
  });

  // QA M06: la primera visita a Programas pasaba por el vacío «Creá tu primer programa», «Cargando programa…» y el editor,
  // y el foco terminaba en body porque el h1 se reemplazaba por el nombre editable.
  test("coach: Programas la primera vez no muestra el vacío falso y el foco queda en el título", async ({ page }) => {
    const errors = watchErrors(page);
    await page.route("**/api/coach/*/programs**", async (r) => { await new Promise((s) => setTimeout(s, 500)); await r.continue(); });
    await openDemo(page, "coach");
    const menu = page.getByRole("button", { name: "Abrir menú" });
    if (await menu.isVisible()) await menu.click();
    const seen = page.evaluate(() => new Promise<string[]>((res) => {
      const out = new Set<string>(); const t0 = performance.now();
      const tick = () => {
        const pane = document.querySelector<HTMLElement>(".co-pane[data-active]");
        if (pane?.querySelector(".empty")) out.add(pane.querySelector(".empty")!.textContent!.trim().slice(0, 40));
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res([...out]);
      };
      requestAnimationFrame(tick);
    }));
    await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: "Programas", exact: true }).click();
    await expect(page.getByLabel("Nombre del programa")).toBeVisible();
    expect((await seen).filter((x) => /Creá tu primer programa|Cargando programa/.test(x))).toEqual([]);
    await expect(page.getByRole("heading", { level: 1, name: "Programas" })).toBeFocused();
    expect(errors).toEqual([]);
  });
});
