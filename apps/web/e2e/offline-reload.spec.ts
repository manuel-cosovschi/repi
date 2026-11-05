// 06/06 (D197): series registradas SIN conexión sobreviven a recargar la app sin conexión (carcasa del service worker +
// IndexedDB) y, al volver la red, llegan al servidor exactamente una vez. Nunca se declara sincronizado lo que sólo está en el
// teléfono. Demo guiada (datos ficticios), servidor local.
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Sess = { exercises: { logs: { setIndex: number; reps: number | null }[] }[] };
const openId = async (page: Page) => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;
const logs = async (page: Page, id: string) => ((await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess).exercises[0].logs;

test("sin conexión: registrar, recargar sin red, reconectar y sincronizar una sola vez", async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  // El inicio llegó al servidor y el service worker ya controla la página (carcasa guardada para abrir sin red).
  const id = (await expect.poll(() => openId(page), { timeout: 15_000 }).not.toBeNull().then(() => openId(page)))!;
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await page.getByRole("button", { name: /^Continuar / }).first().click();
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1_500); // la página termina de pasarle al service worker lo que ya cargó

  await context.setOffline(true);
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await page.getByRole("button", { name: "Saltar descanso" }).click();
  await page.getByRole("button", { name: /^Completar serie 2$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sin conexión|Pendiente/ }).first()).toBeVisible();
  // page.request no pasa por el modo sin conexión del navegador: confirma que el servidor todavía NO tiene esas series
  // (están sólo en el teléfono) mientras la app muestra «Sin conexión/Pendiente», nunca «Guardado».
  expect(await logs(page, id)).toHaveLength(0);
  await expect(page.getByRole("status").filter({ hasText: /^Guardado/ })).toHaveCount(0);

  // Recargar SIN conexión: abre la carcasa guardada y recupera las series del teléfono.
  await page.reload();
  await page.getByRole("button", { name: /^Continuar / }).first().click();
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem").nth(0)).toHaveAccessibleName(/completada/);
  await expect(list.getByRole("listitem").nth(1)).toHaveAccessibleName(/completada/);

  await context.setOffline(false);
  await expect.poll(async () => (await logs(page, id)).map((l) => l.setIndex).join(","), { timeout: 30_000 }).toBe("0,1");
  // Reintentos y recargas posteriores no duplican.
  await page.reload();
  await page.getByRole("button", { name: /^Continuar / }).first().click();
  await page.waitForTimeout(3_000);
  expect((await logs(page, id)).length).toBe(2);
  expect(errors.filter((e) => !/Failed to fetch|NetworkError|net::ERR_INTERNET_DISCONNECTED|Load failed/i.test(e))).toEqual([]);
});
