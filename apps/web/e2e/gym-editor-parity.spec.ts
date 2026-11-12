import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// Editor del programa del socio en sala, a la par del constructor del coach (pedido del titular, 07/11/2026): subir
// ejercicios, quitar días, indicación para el socio y borrador local para que cerrar sin querer no pierda lo armado.
// Demo de sala (entorno ficticio is_demo).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("sala: subir ejercicio, indicación, quitar día y recuperar el borrador al cerrar sin querer", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=members"));
  await page.getByRole("button", { name: /Valentina/ }).first().click();
  const open = () => page.getByRole("button", { name: "Editar programa" }).click();
  await open();
  const ed = page.getByRole("dialog", { name: /Editar programa · Valentina/ });
  const names = ed.locator(".exrow .c-name");
  const a = (await names.nth(0).innerText()).split("\n")[0], b = (await names.nth(1).innerText()).split("\n")[0];
  await expect(ed.locator(".exrow").nth(0).locator("code")).toHaveText("01");
  await expect(ed.getByRole("button", { name: /^Subir / }).first()).toBeDisabled();
  await ed.locator(".exrow").nth(1).getByRole("button", { name: /^Subir / }).click();
  await expect(names.nth(0)).toContainText(b.replace(/^\d+/, ""));
  await ed.getByLabel(/Indicación para el socio/).fill("Entrá en calor 10 minutos");

  // Días: agregar uno vacío y quitarlo (sin ejercicios no pregunta).
  const tabs = ed.getByRole("tab");
  const nDays = await tabs.count();
  await ed.getByRole("button", { name: "Agregar día" }).click();
  await expect(tabs).toHaveCount(nDays + 1);
  await ed.getByRole("button", { name: "Quitar día" }).click();
  await expect(tabs).toHaveCount(nDays);

  // Escape cierra sin perder nada: al reabrir se recupera el borrador, y se puede descartar.
  // FSA1: aunque el foco haya quedado fuera del diálogo (el botón enfocado desapareció al quitar el día), Esc lo cierra.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(ed).toHaveCount(0);
  await expect(page.getByText(/Tus cambios quedaron en este navegador/).first()).toBeVisible();
  await open();
  await expect(ed.getByText(/Recuperamos cambios que no se habían guardado/)).toBeVisible();
  await expect(names.nth(0)).toContainText(b.replace(/^\d+/, ""));
  await expect(ed.getByLabel(/Indicación para el socio/)).toHaveValue("Entrá en calor 10 minutos");
  await ed.getByRole("button", { name: "Descartar cambios" }).click();
  await expect(names.nth(0)).toContainText(a.replace(/^\d+/, ""));
  await expect(ed.getByText(/Recuperamos cambios/)).toHaveCount(0);

  // Guardado: el orden y la indicación quedan en la revisión y no queda borrador.
  await ed.locator(".exrow").nth(1).getByRole("button", { name: /^Subir / }).click();
  await ed.getByLabel(/Indicación para el socio/).fill("Entrá en calor 10 minutos");
  await ed.getByLabel(/Motivo del cambio/).fill("Orden pedido por el socio");
  await ed.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(page.getByText(/Programa guardado/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar programa" })).toBeEnabled();
  await open();
  await expect(names.nth(0)).toContainText(b.replace(/^\d+/, ""));
  await expect(ed.getByLabel(/Indicación para el socio/)).toHaveValue("Entrá en calor 10 minutos");
  await expect(ed.getByText(/Recuperamos cambios/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
