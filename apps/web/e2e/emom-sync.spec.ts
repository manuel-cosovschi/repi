import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D184: el intervalo EMOM es del servidor, no de la pantalla. Empezarlo, recargar y abrir la sesión en otro dispositivo
// (otro contexto del navegador, misma cuenta) muestra el mismo intervalo en curso; pausar lo interrumpe y no se inventa
// el tiempo al volver. Se arma con una rutina propia del alumno (mismo editor que el coach).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const timerSec = async (page: Page) => {
  const t = await page.getByRole("timer").filter({ hasText: /Intervalo en curso/ }).innerText();
  const m = /(\d+):(\d{2})/.exec(t)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

test("EMOM: se recupera al recargar y desde otro dispositivo; la pausa lo interrumpe", async ({ page, context, browser }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await sheet.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Sentadilla");
  await sheet.locator(".or-results button").first().click();
  await sheet.getByRole("textbox", { name: "Nombre" }).fill("EMOM de prueba");
  await sheet.getByRole("button", { name: /^Series y técnica de / }).first().click();
  const dx = page.getByRole("dialog", { name: /Series y técnica · / });
  await dx.getByRole("button", { name: "EMOM", exact: true }).click();
  await dx.getByRole("button", { name: "Aplicar" }).click();
  await dx.getByRole("button", { name: "Guardar" }).click();
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  await mine.locator(".or-card").filter({ hasText: "EMOM de prueba" }).getByRole("button", { name: /Empezar/ }).click();

  await expect(page.getByText(/EMOM · intervalo 1 de 3 · cada 60 s/)).toBeVisible();
  await page.getByRole("button", { name: "Empezar el intervalo" }).click();
  await expect(page.getByRole("timer").filter({ hasText: /Intervalo en curso/ })).toBeVisible();
  const sid = async () => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;
  await expect.poll(async () => (await (await page.request.get(`/api/me/sessions/${await sid()}`)).json()).interval?.status ?? null, { timeout: 15_000 }).toBe("running");
  await page.waitForTimeout(2_000);
  const before = await timerSec(page);

  // Recargar: sigue el mismo intervalo (no vuelve a 1:00).
  await page.reload();
  await page.getByRole("button", { name: /Continuar entrenamiento/ }).first().click();
  await expect(page.getByRole("timer").filter({ hasText: /Intervalo en curso/ })).toBeVisible();
  expect(await timerSec(page)).toBeLessThanOrEqual(before);

  // Otro dispositivo: ve el intervalo en curso con el tiempo que le queda.
  const b = await browser.newContext({ storageState: await context.storageState(), viewport: page.viewportSize() ?? undefined });
  await b.addInitScript(() => { try { sessionStorage.setItem("repi:tour:member", JSON.stringify({ i: 0, open: false })); } catch { /* */ } });
  const pb = await b.newPage();
  const errorsB = watchErrors(pb);
  await pb.goto(new URL(page.url()).pathname);
  await pb.getByRole("button", { name: /Continuar entrenamiento/ }).first().click();
  await expect(pb.getByRole("timer").filter({ hasText: /Intervalo en curso/ })).toBeVisible();
  expect(Math.abs((await timerSec(pb)) - (await timerSec(page)))).toBeLessThanOrEqual(2);
  // Pausar en B interrumpe el intervalo en el servidor; A lo ve al volver a abrir y no se descuenta tiempo inventado.
  await pb.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/me/sessions/${await sid()}`)).json()).interval?.status ?? null, { timeout: 15_000 }).toBe("interrupted");
  await b.close();
  await page.reload();
  await page.getByRole("button", { name: /Continuar entrenamiento/ }).first().click();
  await expect(page.getByText(/Entrenamiento en pausa/)).toBeVisible(); // la pausa de B llegó a A
  await page.getByRole("button", { name: "Reanudar" }).last().click();
  await expect(page.getByText("El intervalo se interrumpió con la pausa.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Volver a empezar el intervalo" })).toBeVisible();
  expect(errors).toEqual([]);
  expect(errorsB).toEqual([]);
});
