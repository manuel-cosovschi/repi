import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// Pedido del titular (07/11/2026): desde Mensajes, el entrenador de sala elige un socio y le escribe. Antes no había cómo, y
// «Escribir» desde la ficha llevaba a Mensajes sin la conversación (la lista sólo mostraba las que ya tenían mensajes).
// Demo de sala (entorno ficticio is_demo).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("sala: «Nuevo mensaje» → elegir socio → escribir el primer mensaje; queda en la lista", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=msgs"));
  await page.getByRole("button", { name: "Nuevo mensaje" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo mensaje" });
  await dlg.getByLabel("Buscar socio para escribirle").fill("Valentina");
  await dlg.getByRole("button", { name: /Valentina/ }).first().click();
  await expect(dlg).toHaveCount(0);
  const chat = page.getByRole("region", { name: /Conversación con Valentina/ });
  await chat.getByLabel("Mensaje", { exact: true }).fill("Hola, ¿cómo venís con la rutina?");
  await chat.getByRole("button", { name: "Enviar" }).click();
  await expect(chat.getByText("Hola, ¿cómo venís con la rutina?")).toBeVisible();
  await page.reload();
  await expect(page.locator(".crow", { hasText: /Valentina/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("sala: «Escribir» desde la ficha abre la conversación aunque no tenga mensajes", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=members"));
  await page.getByRole("button", { name: /Martina/ }).first().click();
  await page.getByRole("button", { name: "Escribir" }).click();
  await expect(page).toHaveURL(/[?&]s=msgs/);
  await expect(page.locator(".crow", { hasText: /Martina/ }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: /Conversación con Martina/ }).getByLabel("Mensaje", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
