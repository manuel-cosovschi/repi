import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D182: editar el peso de una serie con el teclado no agrega ceros ni pierde lo escrito (reporte de alumnos).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const startWorkout = async (page: Page) => {
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
};
const field = (page: Page) => page.getByRole("textbox", { name: /Peso en/ });
const openField = (page: Page) => page.getByRole("button", { name: /Tocá para escribir el peso/ }).click();

test("peso: al abrir queda seleccionado y lo tipeado lo reemplaza; borrar todo no deja un 0", async ({ page }) => {
  const errors = watchErrors(page);
  await startWorkout(page);
  await openField(page);
  await page.keyboard.type("70");
  await expect(field(page)).toHaveValue("70");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^70 kg\. Tocá para escribir el peso/ })).toBeVisible();

  // Borrar todo: el campo queda vacío (sin «0»); escribir de nuevo desde vacío.
  await openField(page);
  await page.keyboard.press("Backspace");
  await expect(field(page)).toHaveValue("");
  await page.keyboard.type("0");
  await page.keyboard.type("62,5");
  await expect(field(page)).toHaveValue("62,5");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^62,5 kg\. Tocá para escribir el peso/ })).toBeVisible();

  // Vaciar y salir del campo: queda el peso anterior y no aparece «Peso inválido».
  await openField(page);
  await page.keyboard.press("Backspace");
  await field(page).blur();
  await expect(page.getByRole("button", { name: /^62,5 kg\. Tocá para escribir el peso/ })).toBeVisible();
  await expect(page.getByText(/Peso inválido/)).toHaveCount(0);

  // Pegar con unidad y punto decimal.
  await openField(page);
  await field(page).fill("47.5 kg");
  await expect(field(page)).toHaveValue("47.5");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^47,5 kg\. Tocá para escribir el peso/ })).toBeVisible();

  // ± sigue funcionando desde el valor escrito.
  await page.getByRole("button", { name: /^Más \d/ }).click();
  await expect(page.getByRole("button", { name: /^50 kg\. Tocá para escribir el peso/ })).toBeVisible();

  // FSA1: todo valor con hasta 2 decimales se acepta («8,2» daba «Peso inválido» por un error de coma flotante).
  for (const [typed, shown] of [["8,2", "8,2"], ["4,1", "4,1"], ["16,35", "16,35"]]) {
    await openField(page);
    await field(page).fill(typed);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: new RegExp(`^${shown} kg\\. Tocá para escribir el peso`) })).toBeVisible();
  }
  await expect(page.getByText(/Peso inválido/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
