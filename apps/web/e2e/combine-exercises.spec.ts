import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// Pedido de un entrenador de sala (07/11/2026): combinar ejercicios desde la fila del editor, sin buscar la opción dentro de
// «Series y técnica». Demo de sala (organización is_demo, ficticia).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("sala: «Combinar con el siguiente» arma la superserie, se guarda y «Separar» la deshace", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=members"));
  await page.getByRole("button", { name: /Valentina/ }).first().click();
  await page.getByRole("button", { name: "Editar programa" }).click();
  const ed = page.getByRole("dialog", { name: /Editar programa · Valentina/ });
  const first = ed.locator(".exrow").nth(0), second = ed.locator(".exrow").nth(1);
  const [a, b] = [await first.locator(".c-name").innerText(), await second.locator(".c-name").innerText()];
  await first.getByRole("button", { name: /^Combinar .+ con / }).click();
  await expect(first.locator("code")).toHaveText("A1");
  await expect(second.locator("code")).toHaveText("A2");
  await expect(first.getByRole("button", { name: /^Combinar / })).toHaveCount(0);
  await ed.getByLabel(/Motivo del cambio/).fill("Superserie pedida en sala");
  await ed.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(page.getByText(/Programa guardado/).first()).toBeVisible();
  // Reabierto, sigue combinado; «Separar» lo deshace (el que queda solo también se separa).
  await page.getByRole("button", { name: "Editar programa" }).click();
  await expect(ed.locator(".exrow").nth(0).locator("code")).toHaveText("A1");
  await ed.locator(".exrow").nth(0).getByRole("button", { name: /^Separar / }).click();
  await expect(ed.locator(".exrow code").nth(0)).toHaveText("01"); // sueltos: numerados, como en el constructor del coach
  await expect(ed.locator(".exrow code").nth(1)).toHaveText("02");
  expect(a && b).toBeTruthy();
  expect(errors).toEqual([]);
});

test("coach: el constructor también combina desde la fila", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  await page.goto(href.replace("s=dash", "s=builder"));
  await page.locator(".exrow").first().waitFor();
  const rows = page.locator(".exrow");
  await rows.nth(0).getByRole("button", { name: /^Combinar .+ con / }).click();
  await expect(rows.nth(0).locator("code").first()).toHaveText(/^[A-H]1$/);
  await expect(rows.nth(1).locator("code").first()).toHaveText(/^[A-H]2$/);
  expect(errors).toEqual([]);
});
