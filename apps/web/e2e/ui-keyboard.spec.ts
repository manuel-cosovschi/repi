import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// FSA1 · teclado en las capas a pantalla completa (Chromium emulado, demo is_demo): al abrir, el foco entra; Tab no se va a la
// página de atrás; Esc cierra; al cerrar, el foco vuelve al botón que la abrió.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

async function expectTrappedAndRestored(page: Page, opener: Locator, dialogName: string | RegExp) {
  const dlg = page.getByRole("dialog", { name: dialogName });
  await expect(dlg).toBeVisible();
  await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await dlg.evaluate((d) => d.contains(document.activeElement)), `Tab ${i + 1} sigue dentro del diálogo`).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(opener).toBeFocused();
}

test("alumno · trofeo a pantalla completa: foco dentro, Esc cierra y vuelve a la vitrina", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  // La barra pasa de 4 a 5 pestañas cuando llega el gimnasio (se reacomoda): se toca cuando ya está quieta.
  await page.waitForLoadState("networkidle");
  const tab = page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Progreso/ });
  await expect(async () => { await tab.click(); await expect(tab).toHaveAttribute("aria-current", "page", { timeout: 1_000 }); }).toPass();
  const opener = page.locator(".tcase-it:not([disabled]):visible").first();
  await expect(opener).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle"); // la vitrina se vuelve a dibujar cuando llega el nivel actualizado
  // Al cambiar de sección el foco pasa al título (M06); se enfoca el trofeo cuando eso ya ocurrió.
  await expect(async () => { await opener.focus(); await page.waitForTimeout(300); await expect(opener).toBeFocused({ timeout: 200 }); }).toPass();
  await page.keyboard.press("Enter");
  await expectTrappedAndRestored(page, opener, /^Trofeo desbloqueado: /);
  expect(errors).toEqual([]);
});

test("gimnasio · QR de ingreso a pantalla completa: foco en «Cerrar», Esc cierra y vuelve al botón", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "owner");
  await expect(page.locator(".co-nav button").first()).toBeAttached();
  const m = page.getByRole("button", { name: "Abrir menú" });
  if (test.info().project.name === "mobile") { await expect(m).toBeVisible(); await m.click(); }
  await page.locator('.co-nav button[title="Acceso y presencia"]').click();
  const opener = page.getByRole("button", { name: "Mostrar QR de ingreso" }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "QR de ingreso" }).getByRole("button", { name: "Cerrar" })).toBeFocused();
  await expectTrappedAndRestored(page, opener, "QR de ingreso");
  expect(errors).toEqual([]);
});

test("modal con un campo en autoFocus (Nuevo mensaje): Esc cierra y el foco vuelve al botón, no a <body>", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "floor");
  await expect(page.locator(".co-nav button").first()).toBeAttached();
  const m = page.getByRole("button", { name: "Abrir menú" });
  if (test.info().project.name === "mobile") { await expect(m).toBeVisible(); await m.click(); }
  await page.locator('.co-nav button[title="Mensajes"]').click();
  const opener = page.getByRole("button", { name: "Nuevo mensaje" });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expectTrappedAndRestored(page, opener, "Nuevo mensaje");
  expect(errors).toEqual([]);
});

test("demo · guía: Esc la cierra y el foco vuelve a «Guía» (no a <body>)", async ({ page }) => {
  await openDemo(page, "coach");
  const guide = page.locator(".dt-pill").getByRole("button", { name: "Guía" });
  await guide.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dt-card")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dt-card")).toHaveCount(0);
  await expect(page.locator(".dt-pill").getByRole("button", { name: "Guía" })).toBeFocused();
});
