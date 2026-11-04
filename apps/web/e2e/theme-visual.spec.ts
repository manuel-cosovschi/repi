import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors, type DemoRole } from "./helpers";

// D188: auditoría visual del tema global. Matriz Claro / Oscuro / Automático (dispositivo claro y oscuro) × anchos
// 320–1366 × roles. No compara contra capturas guardadas (cambian con fuentes y antialiasing del equipo): verifica
// invariantes — tema aplicado, sin scroll lateral, sin texto ilegible (axe-core WCAG 2.2 AA, incluye contraste) — y
// adjunta una captura por combinación para revisión humana. Una diferencia no se «aprueba»: se corrige o se explica.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.describe.configure({ timeout: 180_000 });

const THEMES = [
  { name: "claro", pref: "light", scheme: "dark", expect: "light" },
  { name: "oscuro", pref: "dark", scheme: "light", expect: "dark" },
  { name: "auto-claro", pref: "system", scheme: "light", expect: "light" },
  { name: "auto-oscuro", pref: "system", scheme: "dark", expect: "dark" },
] as const;
const WIDTHS = [320, 375, 390, 430, 768, 1366];

async function setTheme(page: Page, pref: string, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  const r = await page.request.post("/api/me/settings", { data: { theme: pref, themeChangedAt: Date.now() } });
  expect(r.status()).toBe(200);
  await page.evaluate((p) => localStorage.setItem("repi:theme", JSON.stringify({ pref: p, at: Date.now(), pending: false, uid: null })), pref);
}

async function shot(page: Page, info: TestInfo, name: string) {
  await info.attach(`${name}.png`, { body: await page.screenshot(), contentType: "image/png" });
}

/** Recorre los anchos: tema aplicado y sin desborde; axe en el ancho de teléfono y el de escritorio. */
async function sweep(page: Page, info: TestInfo, label: string, want: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w >= 768 ? 900 : 800 });
    await page.waitForTimeout(150);
    await expect(page.locator("html")).toHaveAttribute("data-theme", want);
    await expectNoHorizontalOverflow(page, `${label} @${w}`);
    if (w === 390 || w === 1366) await expectAccessible(page, info, `${label}-${w}`);
    if (w === 390 || w === 1366 || w === 320) await shot(page, info, `${label}-${w}`);
  }
}

const ROLES: DemoRole[] = ["member", "coach", "owner", "floor"];

for (const role of ROLES) {
  for (const t of THEMES) {
    test(`${role} · ${t.name}: pantallas principales legibles y sin desborde en 320–1366`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "la matriz recorre todos los anchos en un solo proyecto");
      const errors = watchErrors(page);
      await openDemo(page, role);
      await setTheme(page, t.pref, t.scheme);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await sweep(page, info, `${role}-${t.name}-inicio`, t.expect);

      if (role === "member") {
        // Cada pestaña del alumno y el perfil (selector de apariencia).
        await page.setViewportSize({ width: 390, height: 800 });
        const tabs = await page.getByRole("navigation", { name: "Principal" }).getByRole("button").all();
        for (const [i, tab] of tabs.entries()) {
          if (i === 0) continue;
          await tab.click();
          await page.waitForTimeout(400);
          await expect(page.locator("html")).toHaveAttribute("data-theme", t.expect);
          await expectNoHorizontalOverflow(page, `alumno pestaña ${i}`);
          await expectAccessible(page, info, `${role}-${t.name}-tab${i}`);
          await shot(page, info, `${role}-${t.name}-tab${i}`);
        }
        await tabs[0].click();
        await page.getByRole("button", { name: "Perfil", exact: true }).click();
        await expect(page.getByRole("group", { name: "Apariencia" })).toBeVisible();
        await expectAccessible(page, info, `${role}-${t.name}-perfil`);
        await shot(page, info, `${role}-${t.name}-perfil`);
      } else {
        // Paneles: cada sección de la navegación lateral (escritorio).
        await page.setViewportSize({ width: 1366, height: 900 });
        const nav = page.locator(".co-nav button");
        const n = Math.min(await nav.count(), 8);
        for (let i = 1; i < n; i++) {
          await nav.nth(i).click();
          await page.waitForTimeout(500);
          await expectNoHorizontalOverflow(page, `${role} sección ${i}`);
          await expectAccessible(page, info, `${role}-${t.name}-sec${i}`);
          await shot(page, info, `${role}-${t.name}-sec${i}`);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("alumno · entrenamiento y editor de técnica en ambos temas: estados distinguibles, modal con el tema de quien lo abre", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "una vez alcanza");
  await openDemo(page, "member");
  for (const t of [THEMES[0], THEMES[1]]) {
    await setTheme(page, t.pref, t.scheme);
    await page.goto("/app");
    await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
    const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
    if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
    await expect(page.getByRole("button", { name: /^Completar serie \d+$/ }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", t.expect);
    for (const w of [320, 390, 430]) {
      await page.setViewportSize({ width: w, height: 800 });
      await expectNoHorizontalOverflow(page, `entrenamiento ${t.name} @${w}`);
    }
    await expectAccessible(page, info, `workout-${t.name}`);
    await shot(page, info, `workout-${t.name}`);
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(page.getByText(/Entrenamiento en pausa/).first()).toBeVisible();
    await expectAccessible(page, info, `workout-pausa-${t.name}`);
    await shot(page, info, `workout-pausa-${t.name}`);
    await page.getByRole("button", { name: "Reanudar" }).last().click();
  }
  // Editor de técnica (portal .dx-host) desde «Mis rutinas»: sigue el tema activo.
  await page.goto("/app");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  await page.locator("section.or").getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await expect(sheet).toBeVisible();
  for (const t of [THEMES[0], THEMES[1]]) {
    await page.emulateMedia({ colorScheme: t.scheme });
    await page.evaluate((p) => { localStorage.setItem("repi:theme", JSON.stringify({ pref: p, at: Date.now() + 5_000, pending: false, uid: null })); dispatchEvent(new StorageEvent("storage", { key: "repi:theme", newValue: localStorage.getItem("repi:theme") })); }, t.pref);
    await expect(page.locator("html")).toHaveAttribute("data-theme", t.expect);
    // La hoja (y su texto) siguen al tema activo: fondo claro en Claro, oscuro en Oscuro.
    const lum = await sheet.evaluate((el) => {
      const l = (c: string) => { const [r, g, b] = (c.match(/\d+/g) ?? []).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
      return { bg: l(getComputedStyle(el).backgroundColor), ink: l(getComputedStyle(el).color) };
    });
    if (t.expect === "dark") expect(lum.bg, `hoja en ${t.name}`).toBeLessThan(0.2); else expect(lum.bg, `hoja en ${t.name}`).toBeGreaterThan(0.9);
    expect(Math.abs(lum.bg - lum.ink), "texto distinguible del fondo").toBeGreaterThan(0.6);
    await expectAccessible(page, info, `rutina-${t.name}`);
    await shot(page, info, `rutina-${t.name}`);
  }
});

test("acceso, Mi cuenta y sitio público: el formulario sigue el tema; el sitio conserva su diseño navy", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "una vez alcanza");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/acceso");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    for (const w of [320, 390, 1366]) {
      await page.setViewportSize({ width: w, height: 860 });
      await expectNoHorizontalOverflow(page, `acceso ${scheme} @${w}`);
      await expectAccessible(page, info, `acceso-${scheme}-${w}`);
      await shot(page, info, `acceso-${scheme}-${w}`);
    }
    await page.goto("/");
    expect(await page.locator(".st").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(11, 15, 20)");
  }
  await openDemo(page, "member");
  for (const t of [THEMES[0], THEMES[1]]) {
    await setTheme(page, t.pref, t.scheme);
    await page.goto("/cuenta");
    await expect(page.getByRole("group", { name: "Apariencia" })).toBeVisible();
    await expectAccessible(page, info, `cuenta-${t.name}`);
    await shot(page, info, `cuenta-${t.name}`);
  }
});
