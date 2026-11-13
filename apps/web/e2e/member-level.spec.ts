// 13/11/2026 · El nivel a la vista: en Inicio (fila) y junto al título de Entrenar (píldora), con lo que la app ya calcula
// (/api/me/level) y un toque hasta el detalle en Progreso («Tu nivel y trofeos»). Demo guiada (datos ficticios), servidor local.
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Level = { level: number; xp: number; toNext: number; pct: number };
const level = async (page: Page) => (await (await page.request.get("/api/me/level")).json()) as Level;
const inView = (page: Page) => page.locator("#nivel").evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight / 2; });

for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`${vp.width}×${vp.height}: Inicio y Entrenar muestran el nivel real y llevan al detalle`, async ({ page }, info) => {
    await page.setViewportSize(vp);
    const errors = watchErrors(page);
    await openDemo(page, "member");
    const lv = await level(page);
    const text = `Te falta${lv.toNext === 1 ? "" : "n"} ${lv.toNext.toLocaleString("es-AR")} punto${lv.toNext === 1 ? "" : "s"} para el nivel ${lv.level + 1}`;

    // Inicio: en la primera pantalla, sin tapar el entrenamiento de hoy, con el dato dicho en palabras (no sólo la barra).
    const row = page.getByRole("button", { name: new RegExp(`^Nivel ${lv.level}\\. ${text}\\. Ver nivel y trofeos$`) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(text);
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThan(vp.height - 100); // por encima de la barra de pestañas
    expect(box.y).toBeGreaterThan((await page.getByRole("button", { name: /^Ver / }).first().boundingBox())!.y); // debajo del entrenamiento de hoy
    await expectNoHorizontalOverflow(page, "Inicio");
    await expectAccessible(page, info, `inicio-nivel-${vp.width}`);
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Progreso" })).toBeVisible();
    await expect.poll(() => inView(page)).toBe(true);
    await expect(page.getByRole("region", { name: "Tu nivel y trofeos" })).toContainText(`Nivel${lv.level}`);

    // Entrenar: la píldora junto al título, mismo dato y mismo destino.
    await page.getByRole("button", { name: "Entrenar", exact: true }).click();
    const pill = page.locator(".lvpill");
    await expect(pill).toHaveAccessibleName(new RegExp(`^Nivel ${lv.level}\\. ${text}\\.`));
    const pb = (await pill.boundingBox())!;
    expect(pb.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, "Entrenar");
    await expectAccessible(page, info, `entrenar-nivel-${vp.width}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await pill.click();
    await expect(page.getByRole("heading", { level: 1, name: "Progreso" })).toBeVisible();
    await expect.poll(() => inView(page)).toBe(true);
    expect(errors).toEqual([]);
  });
}
