import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// REPI Exercise Motion 1.0 (D220): la demostración oficial en el entrenamiento del socio (con técnica, músculos, pausa y
// fases), con «reducir movimiento», sin conexión una vez abierta, y en REPI Control («Ver ejecución»).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

async function startWorkout(page: Page) {
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  for (let i = 0; i < 4; i++) { const ok = page.getByText("Entendido", { exact: true }).locator("visible=true").first(); if (!(await ok.count())) break; await ok.click(); }
}
/** Avanza hasta un ejercicio que tenga demostración oficial y la abre. */
async function openOfficialDemo(page: Page) {
  for (let i = 0; i < 12; i++) {
    await page.getByRole("button", { name: "Ver cómo se hace" }).click();
    const dlg = page.getByRole("dialog");
    if (await dlg.getByText("Cómo se hace: demostración de REPI.").isVisible({ timeout: 4_000 }).catch(() => false)) return dlg;
    await dlg.getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Ejercicio siguiente" }).click();
  }
  throw new Error("ningún ejercicio de la demo tiene demostración oficial");
}

test.describe("con movimiento", () => {
test.use({ reducedMotion: "no-preference" }); // la configuración general de las pruebas pide «reducir movimiento»
test("socio: «Ver cómo se hace» abre la demostración de REPI con técnica, músculos, pausa y fases", async ({ page }, info) => {
  const errors = watchErrors(page);
  await startWorkout(page);
  const dlg = await openOfficialDemo(page);
  const stage = dlg.getByRole("img", { name: /^Demostración animada: / });
  await expect(stage).toBeVisible();
  // Se mueve: dos capturas del escenario separadas en el tiempo son distintas.
  const a = await stage.innerHTML(); await page.waitForTimeout(700); const b = await stage.innerHTML();
  expect(a).not.toBe(b);
  // Pausa (WCAG 2.2.2) y velocidad.
  await dlg.getByRole("button", { name: "Pausar" }).click();
  await expect(dlg.getByRole("button", { name: "Reproducir" })).toHaveAttribute("aria-pressed", "false");
  const p1 = await stage.innerHTML(); await page.waitForTimeout(500); expect(await stage.innerHTML()).toBe(p1);
  await dlg.getByRole("button", { name: "Más lento" }).click();
  await expect(dlg.getByRole("button", { name: "Velocidad normal" })).toHaveAttribute("aria-pressed", "true");
  // Fases: tocar una lleva a esa pose y deja pausado.
  const phase = dlg.getByRole("group", { name: "Ir a una fase" }).getByRole("button").last();
  await phase.click();
  await expect(dlg.getByRole("button", { name: "Reproducir" })).toBeVisible();
  // Técnica escrita.
  await expect(dlg.getByRole("tab", { name: "Técnica" })).toHaveAttribute("aria-selected", "true");
  for (const h of ["Preparación", "Ejecución", "Claves", "Errores comunes"]) await expect(dlg.getByRole("heading", { name: h })).toBeVisible();
  await expectAccessible(page, info, "motion-tecnica");
  // Músculos: frente/espalda; tocar un músculo lo deja solo.
  await dlg.getByRole("tab", { name: "Músculos" }).click();
  await expect(dlg.getByRole("img", { name: /Vista de (frente|espalda)/ }).first()).toBeVisible();
  const chip = dlg.getByRole("group", { name: "Músculos principales" }).getByRole("button").first();
  const label = (await chip.textContent())!.trim();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(dlg.getByText(new RegExp(`^${label}: principal\\.$`))).toBeVisible();
  await expectAccessible(page, info, "motion-musculos");
  await expect(dlg.getByText(/Demostración animada de REPI · revisada por el equipo de REPI/)).toBeVisible();
  await expectNoHorizontalOverflow(page, "demostración");
  await dlg.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
});

test("socio con «reducir movimiento»: la demostración arranca quieta y se reproduce sólo si la persona lo pide", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, reducedMotion: "reduce", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await startWorkout(page);
  const dlg = await openOfficialDemo(page);
  const stage = dlg.getByRole("img", { name: /^Demostración animada: / });
  await expect(dlg.getByRole("button", { name: "Reproducir" })).toBeVisible();
  const a = await stage.innerHTML(); await page.waitForTimeout(600); expect(await stage.innerHTML()).toBe(a);
  await dlg.getByRole("button", { name: "Reproducir" }).click();
  await expect.poll(async () => (await stage.innerHTML()) !== a, { timeout: 3_000 }).toBe(true);
  await expectNoHorizontalOverflow(page, "demostración 320 px");
  await ctx.close();
});

test("sin conexión: una vez abierto el entrenamiento, la demostración se sigue viendo", async ({ page, context }) => {
  await startWorkout(page);
  await page.waitForTimeout(2_500); // el entrenamiento baja la biblioteca apenas se abre
  await context.setOffline(true);
  const dlg = await openOfficialDemo(page);
  await expect(dlg.getByRole("img", { name: /^Demostración animada: / })).toBeVisible();
  await context.setOffline(false);
});

test("REPI Control: «Ver ejecución» muestra la demostración en la pantalla del gimnasio sin guardar nada", async ({ page }) => {
  const errors = watchErrors(page);
  const r = await page.request.post("/api/demo", { data: { role: "control" }, headers: { "x-forwarded-for": `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}` } });
  const { href } = await r.json();
  await page.goto(href);
  await expect(page.getByRole("button", { name: "Empezar" })).toBeVisible();
  const rows = await page.locator(".kq-demo-guide li").allTextContents();
  const m = rows.map((t) => /código\s*(\d{6}).*PIN\s*(\d{4})/.exec(t)).find(Boolean)!;
  const writes: string[] = [];
  page.on("request", (q) => { if (q.method() !== "GET" && /\/api\/kiosk\//.test(q.url()) && !/\/(session|end|close|logout)/.test(q.url())) writes.push(q.url()); });
  await page.getByRole("button", { name: "Empezar" }).click();
  for (const d of m[1]) await page.getByRole("button", { name: d, exact: true }).click();
  for (const d of m[2]) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Ver" }).click();
  await page.getByRole("button", { name: /Consultar mi rutina/ }).click();
  const squat = page.locator(".kq-ex", { has: page.getByRole("heading", { name: /Sentadilla/ }) });
  await squat.getByRole("button", { name: "Ver ejecución" }).click();
  await expect(squat.getByRole("img", { name: /^Demostración animada: Sentadilla/ })).toBeVisible();
  await squat.getByRole("tab", { name: "Músculos" }).click();
  await expect(squat.getByRole("group", { name: "Músculos principales" })).toBeVisible();
  await squat.getByRole("button", { name: "Ocultar ejecución" }).click();
  expect(writes.filter((u) => /workout|log|set/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
});
