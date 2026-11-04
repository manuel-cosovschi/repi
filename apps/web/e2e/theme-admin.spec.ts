import { expect, test } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, watchErrors } from "./helpers";

// D188: REPI Admin en Claro, Oscuro y Automático. No hay demo de Admin: la prueba usa una sesión de un Admin de PRUEBA
// creado en la base local por el flujo legítimo (registro, email verificado, dos pasos y ticket del primer
// administrador, scripts/first-admin.ts). Se pasa con E2E_ADMIN_STATE=<storageState>; sin eso, se omite.
const STATE = process.env.E2E_ADMIN_STATE;
test.skip(!STATE, "requiere E2E_ADMIN_STATE (Admin de prueba local)");
test.use({ storageState: STATE ?? undefined });
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.describe.configure({ timeout: 180_000 });

const THEMES = [
  { name: "claro", pref: "light", scheme: "dark", want: "light" },
  { name: "oscuro", pref: "dark", scheme: "light", want: "dark" },
  { name: "auto-claro", pref: "system", scheme: "light", want: "light" },
  { name: "auto-oscuro", pref: "system", scheme: "dark", want: "dark" },
] as const;

for (const t of THEMES) {
  test(`admin · ${t.name}: secciones, tablas, formularios y modales legibles`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" && t.pref === "system", "Automático se recorre en escritorio");
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: t.scheme });
    await page.goto("/admin");
    expect((await page.request.post("/api/me/settings", { data: { theme: t.pref, themeChangedAt: Date.now() } })).status()).toBe(200);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", t.want);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const menu = page.getByRole("button", { name: "Abrir menú" });
    const nav = page.locator(".co-nav button");
    const n = await nav.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      if (await menu.isVisible()) await menu.click();
      await nav.nth(i).click();
      await page.waitForTimeout(500);
      await expect(page.locator("html")).toHaveAttribute("data-theme", t.want);
      await expectNoHorizontalOverflow(page, `admin ${t.name} sección ${i}`);
      await expectAccessible(page, info, `admin-${t.name}-sec${i}`);
      await info.attach(`admin-${t.name}-sec${i}.png`, { body: await page.screenshot(), contentType: "image/png" });
    }
    // Modal con formulario (portal): «Nuevo cliente» sigue el tema y es legible.
    if (await menu.isVisible()) await menu.click();
    await nav.filter({ hasText: /^Clientes$/ }).click();
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const dlg = page.getByRole("dialog", { name: "Nuevo cliente" });
    await expect(dlg).toBeVisible();
    const lum = await dlg.evaluate((el) => {
      const l = (c: string) => { const [r, g, b] = (c.match(/\d+/g) ?? []).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
      return { bg: l(getComputedStyle(el).backgroundColor), ink: l(getComputedStyle(el).color) };
    });
    if (t.want === "dark") expect(lum.bg).toBeLessThan(0.2); else expect(lum.bg).toBeGreaterThan(0.9);
    expect(Math.abs(lum.bg - lum.ink)).toBeGreaterThan(0.6);
    await expectAccessible(page, info, `admin-${t.name}-modal`);
    await info.attach(`admin-${t.name}-modal.png`, { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
