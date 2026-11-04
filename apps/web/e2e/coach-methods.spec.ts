import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D183: el coach aplica un drop set sólo a la última serie sin perder la programación, revisa qué cambia, deshace y
// guarda. Arrastrar para seleccionar texto y soltar fuera del panel no lo cierra; cerrar con cambios pregunta antes.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("coach: método no destructivo con vista previa, deshacer y confirmación al descartar", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  await page.goto(href.replace(/\?s=\w+/, "?s=builder"));
  // Programa de la demo «Hipertrofia · 3 días» · Torso A · Press de banca: 4 series × 8-10.
  await page.getByRole("button", { name: /Hipertrofia · 3 días/ }).first().click();
  await page.getByRole("button", { name: "Series y técnica de Press de banca" }).first().click();
  const dlg = page.getByRole("dialog", { name: /Series y técnica · Press de banca/ });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText("4 series × 8-10")).toBeVisible();

  await dlg.getByRole("button", { name: "Drop set", exact: true }).click();
  await expect(dlg.getByRole("button", { name: "Serie 4", exact: true })).toHaveAttribute("aria-pressed", "true"); // por defecto, sólo la última
  await expect(dlg.getByRole("button", { name: "Serie 1", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(dlg.getByRole("status")).toContainText("Serie 4: 2 drops conectados");
  await expect(dlg.getByRole("status")).toContainText("4 series · 4.ª con drops (2)");
  await dlg.getByRole("button", { name: "Aplicar" }).click();
  await expect(dlg.getByText("Drop 1", { exact: true })).toBeVisible();
  await expect(dlg.getByText("Drop 2", { exact: true })).toBeVisible();
  await expect(dlg.getByText("Serie 4", { exact: true })).toBeVisible();
  await expect(dlg.getByText("Serie 5", { exact: true })).toHaveCount(0); // los drops no son series nuevas

  // Seleccionar el texto de una nota arrastrando y soltar fuera del panel: sigue abierto (D179).
  const note = dlg.getByRole("textbox", { name: "Nota" }).first();
  await note.fill("pausa abajo");
  const box = (await note.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.up();
  await expect(dlg).toBeVisible();

  // Deshacer vuelve atrás de a un paso (la nota y después el drop).
  await dlg.getByRole("button", { name: "Deshacer" }).click();
  await dlg.getByRole("button", { name: "Deshacer" }).click();
  await expect(dlg.getByText("Drop 1", { exact: true })).toHaveCount(0);
  await dlg.getByRole("button", { name: "Drop set", exact: true }).click();
  await dlg.getByRole("button", { name: "Aplicar" }).click();

  // Cerrar con cambios: pregunta; si se cancela, el panel queda con los cambios.
  page.once("dialog", (d) => { expect(d.message()).toMatch(/cambios sin guardar/); void d.dismiss(); });
  await dlg.getByRole("button", { name: "Cancelar", exact: true }).last().click();
  await expect(dlg.getByText("Drop 1", { exact: true })).toBeVisible();

  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText(/Drop set · 4 series · 4\.ª con drops \(2\)/).first()).toBeVisible();
  await expect(page.getByText(/Guardado|Versión \d+ guardada/).first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
