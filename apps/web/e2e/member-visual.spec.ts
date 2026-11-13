// 13/11/2026 · Mejoras visuales del alumno (auditoría a 390×844 y 360×800): lista de ejercicios legible en pantallas angostas,
// áreas táctiles de 44 px en los controles chicos (sin cambiar su dibujo) e índice en Perfil con títulos parejos.
// Demo guiada (datos ficticios), servidor local. Viewports emulados: no reemplaza la prueba en un teléfono real.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.use({ viewport: { width: 360, height: 800 } });

/** Alto y ancho en los que un toque, medido desde el centro del control, sigue llegándole (cuenta el área ampliada). */
async function hitArea(el: Locator) {
  await el.page().waitForTimeout(600); // la sección terminó de cargar (un esqueleto se reemplaza por el contenido)
  await el.scrollIntoViewIfNeeded();
  // Con todo quieto: mientras una sección entra, lo que sale todavía puede recibir el toque.
  await el.page().waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  await el.page().waitForTimeout(150);
  return el.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "center" });
    const r = node.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = (px: number, py: number) => { const h = document.elementFromPoint(px, py); return !!h && (h === node || node.contains(h)); };
    let up = 0, down = 0, left = 0, right = 0;
    while (up < 40 && hit(x, y - up - 1)) up++;
    while (down < 40 && hit(x, y + down + 1)) down++;
    while (left < 40 && hit(x - left - 1, y)) left++;
    while (right < 40 && hit(x + right + 1, y)) right++;
    return { w: left + right + 1, h: up + down + 1, drawn: { w: Math.round(r.width), h: Math.round(r.height) } };
  });
}
const nav = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name });

test("Entrenar: cada ejercicio se lee de un vistazo (orden, nombre en un renglón, sugerencia de hoy aparte)", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await nav(page, /Entrenar/).click();
  const items = page.locator(".exlist:visible .exitem");
  await expect(items.first()).toBeVisible();
  const n = await items.count();
  expect(n).toBeGreaterThan(1);
  await expect(page.locator(".exlist:visible")).not.toContainText("foto"); // el cuadro rayado con la palabra «foto»
  expect(await items.locator(".thumb").allInnerTexts()).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)));
  for (let i = 0; i < n; i++) {
    const name = items.nth(i).locator("b").first();
    const oneLine = await name.evaluate((el) => el.getBoundingClientRect().height < parseFloat(getComputedStyle(el).fontSize) * 2);
    expect(oneLine, `nombre del ejercicio ${i + 1} en un renglón`).toBe(true);
  }
  await expect(items.first().locator(".ex-suggest")).toContainText("Hoy:");
  await expect(items.first().locator(".ex-rest")).toHaveAccessibleName(/^Descanso /);
  await expectNoHorizontalOverflow(page, "Entrenar 360");
  await expectAccessible(page, info, "entrenar-360");
  expect(errors).toEqual([]);
});

test("áreas táctiles: los controles chicos responden en 44 px (pestañas, rangos, flechas, sensaciones, «Pausar»)", async ({ page }) => {
  await openDemo(page, "member");
  const check = async (el: Locator, what: string) => { const a = await hitArea(el); expect(a.h, `${what}: alto efectivo (dibujado ${a.drawn.w}×${a.drawn.h})`).toBeGreaterThanOrEqual(44); expect(a.w, `${what}: ancho efectivo`).toBeGreaterThanOrEqual(44); };
  await nav(page, /Progreso/).click();
  await check(page.locator(".gtabs button:visible").first(), "pestaña de Progreso");
  await check(page.locator(".pp-ranges button:visible").first(), "rango de Progreso");
  await nav(page, /gym/i).click();
  await check(page.locator(".gtabs button:visible").nth(1), "pestaña de Tu gym");
  await nav(page, /Inicio/).click();
  const x = page.locator(".ndg-x:visible").first();
  if (await x.isVisible().catch(() => false)) await check(x, "cerrar un aviso de desafío");
  await page.getByRole("button", { name: "Comenzar entrenamiento" }).click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  const hint = page.getByRole("note").getByRole("button", { name: "Entendido" }).first();
  if (await hint.isVisible().catch(() => false)) await hint.click();
  await check(page.getByRole("button", { name: "Ejercicio siguiente" }), "ejercicio siguiente");
  await check(page.getByRole("button", { name: "Pausar", exact: true }), "«Pausar»");
  await check(page.locator(".feel button").first(), "sensación de la serie");
  // Nada cambió de tamaño a la vista: las flechas siguen de 36 px.
  expect((await page.getByRole("button", { name: "Ejercicio siguiente" }).boundingBox())!.height).toBe(36);
});

test("Perfil: el índice lleva a cada parte y los títulos de sección tienen el mismo tamaño", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("button", { name: "Perfil" }).click();
  const index = page.getByRole("navigation", { name: "Secciones del perfil" });
  await expect(index.getByRole("button", { name: "Configuración" })).toBeVisible();
  await expect(index.getByRole("button", { name: "Perfil de entrenamiento" })).toBeVisible(); // aparece cuando esa parte cargó
  for (const b of await index.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const [label, id] of [["Configuración", "pf-config"], ["Perfil de entrenamiento", "tp-h"], ["Salud", "pf-salud"]] as const) {
    await index.getByRole("button", { name: label, exact: true }).click();
    const at = await page.locator(`#${id}`).evaluate((el) => ({ top: Math.round(el.getBoundingClientRect().top), focus: document.activeElement === el }));
    expect(at.top, `${label} a la vista`).toBeGreaterThanOrEqual(0);
    expect(at.top, `${label} arriba`).toBeLessThan(400);
    expect(at.focus, `${label} con el foco`).toBe(true);
  }
  const sizes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("h2")].filter((h) => h.offsetParent && !h.closest("[inert], [hidden], .sheet")).map((h) => `${getComputedStyle(h).fontSize}`));
  expect(new Set(sizes).size, `tamaños de título en Perfil: ${[...new Set(sizes)].join(", ")}`).toBe(1);
  await expectNoHorizontalOverflow(page, "Perfil 360");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessible(page, info, "perfil-360");
  expect(errors).toEqual([]);
});
