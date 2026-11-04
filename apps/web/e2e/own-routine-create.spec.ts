import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D186 (reporte con captura): al armar una rutina a mano con un ejercicio que no está en la biblioteca, había que tocar «Crear y
// agregar» (apagado sin explicar si faltaba el grupo) y después «Guardar»; si se tocaba sólo «Guardar», el ejercicio se perdía.
// Ahora: parecidos al buscar, grupo sugerido por el nombre y «Guardar rutina» crea y agrega lo que está a medio cargar.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("rutina a mano: un ejercicio nuevo se crea y se guarda con un solo «Guardar rutina»", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await sheet.getByRole("textbox", { name: "Nombre" }).first().fill("Espalda en Smith");
  await sheet.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Remo en smith");
  // No existe con ese nombre: propone los parecidos (los remos) antes de crear uno repetido.
  await expect(sheet.getByText(/¿Es alguno de estos\?/)).toBeVisible();
  await expect(sheet.locator(".or-results button").filter({ hasText: /^Remo/ }).first()).toBeVisible();
  await sheet.getByRole("button", { name: /Crear «Remo en smith»/ }).click();
  const form = sheet.getByRole("group", { name: "Crear ejercicio" });
  // Grupo sugerido por el nombre (se puede cambiar) y «con peso».
  await expect(form.getByRole("group", { name: "Grupo muscular del ejercicio nuevo" }).getByRole("button", { name: "Espalda" })).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByText(/Le pusimos Espalda por el nombre/)).toBeVisible();
  await expect(form.getByRole("button", { name: "Con peso" })).toHaveAttribute("aria-pressed", "true");
  // Directo a «Guardar rutina», sin «Crear y agregar»: se crea, se agrega y se guarda.
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  await expect(sheet).toHaveCount(0);
  const card = mine.locator(".or-card").filter({ hasText: "Espalda en Smith" });
  await expect(card.getByText("Remo en smith")).toBeVisible();
  await expect(card.getByText(/1 ejercicio\b/)).toBeVisible();

  // Sin grupo reconocible, «Crear y agregar» explica qué falta en lugar de quedar apagado.
  await card.getByRole("button", { name: "Editar" }).click();
  const ed = page.getByRole("dialog", { name: "Editar rutina" });
  await ed.getByRole("button", { name: /Agregar ejercicio/ }).click();
  await ed.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Máquina 7 xyz");
  await ed.getByRole("button", { name: /Crear «Máquina 7 xyz»/ }).click();
  await ed.getByRole("button", { name: "Crear y agregar" }).click();
  await expect(ed.getByRole("alert").filter({ hasText: "Elegí el grupo muscular del ejercicio." })).toBeVisible();
  await ed.getByRole("group", { name: "Grupo muscular del ejercicio nuevo" }).getByRole("button", { name: "Piernas" }).click();
  await ed.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(ed).toHaveCount(0);
  await expect(card.getByText(/2 ejercicios/)).toBeVisible();
  expect(errors).toEqual([]);
});
