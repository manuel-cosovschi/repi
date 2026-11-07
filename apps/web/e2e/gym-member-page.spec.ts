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
  await expect(page.getByRole("button", { name: "Socios" }).first()).toHaveAttribute("aria-current", "page");
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
