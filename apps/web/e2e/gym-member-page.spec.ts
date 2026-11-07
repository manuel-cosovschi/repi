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
  await expect(page.getByLabel("Buscar socio")).toHaveCount(0);
  await expect(page.locator(".crow")).toHaveCount(0);
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
