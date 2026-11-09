import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// FSA1 · Smart Program Import 2.0 en «Mis rutinas» (alumno), de punta a punta en el navegador: texto de WhatsApp sin IA,
// días en el orden del documento, lo que falta marcado (nunca inventado) y completado con el sugerido explícito, corte de red
// con la respuesta perdida (el servidor guardó), borrador recuperado después de recargar y reintento sin duplicar.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const WHATSAPP = [
  "[9/11/26, 10:15] Profe: Día 1 - Pecho",
  "Press banca 3x12/10/8 40/45/50 kg",
  "Remo c/barra",
  "[9/11/26, 10:16] Profe: Día 2 - Piernas",
  "Sentadilla 4x8 80kg desc 2 min",
].join("\n");

test("importar: WhatsApp → revisión → corte de red al guardar → borrador → reintento sin duplicar → se entrena", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  const goTrain = () => page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  await goTrain();
  const mine = page.locator("section.or");
  const before = await mine.locator(".or-card").count();
  await mine.getByRole("button", { name: /^Subir$|Subir foto, captura o archivo/ }).first().click();
  const start = page.getByRole("dialog", { name: "Subir mi rutina" });
  await start.getByLabel(/O pegá el texto/).fill(WHATSAPP);
  await start.getByRole("button", { name: "Leer el texto" }).click();

  const review = page.getByRole("dialog", { name: "Revisá tu rutina" });
  await expect(review.getByRole("status").filter({ hasText: "2 días · 3 ejercicios" })).toBeVisible();
  // El remo no trae series ni repeticiones: queda marcado, no se completa solo.
  await expect(review.getByText("Faltan las series.").first()).toBeVisible();
  await expect(review.getByText(/Sugerido \(no estaba en el documento\)/)).toHaveCount(0);
  await review.getByRole("button", { name: "Completar lo que falta con 3 × 10 (sugerido)" }).click();
  await expect(review.getByText(/Sugerido \(no estaba en el documento\): series, repeticiones/)).toBeVisible();

  // Corte de red: el servidor guarda, pero la respuesta no llega al teléfono.
  let saves = 0;
  await page.route("**/api/me/routines/import/save", async (route) => {
    saves++;
    if (saves === 1) { await route.fetch(); await route.abort("connectionreset"); return; }
    await route.continue();
  });
  await review.getByRole("button", { name: "Guardar 2 rutinas" }).click();
  await expect(review.getByRole("alert")).toBeVisible();
  expect(saves).toBe(1);

  // Recargar enseguida (sin esperar): el borrador sigue en el teléfono con el mismo identificador de operación.
  await page.reload();
  await goTrain();
  await expect(mine.locator(".or-card")).toHaveCount(before + 2); // lo que el servidor sí guardó
  await mine.getByRole("button", { name: /^Subir$/ }).click();
  await page.getByRole("dialog", { name: "Subir mi rutina" }).getByRole("button", { name: "Seguir revisando" }).click();
  await page.getByRole("dialog", { name: "Revisá tu rutina" }).getByRole("button", { name: "Guardar 2 rutinas" }).click();
  await expect(page.getByText("Ya estaba guardada: no se duplicó.").first()).toBeVisible();
  expect(saves).toBe(2);
  await expect(mine.locator(".or-card")).toHaveCount(before + 2);
  const cards = mine.locator(".or-card").filter({ hasText: "importada" });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Día 1 - Pecho");
  await expect(cards.nth(1)).toContainText("Día 2 - Piernas");
  await expect(cards.nth(0)).toContainText("Remo con barra");

  // Se entrena como cualquier rutina propia.
  await cards.nth(1).getByRole("button", { name: /Empezar/ }).click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByText("Sentadilla").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  expect(errors.filter((e) => !/net::ERR_|Failed to fetch|connectionreset/i.test(e))).toEqual([]);
});
