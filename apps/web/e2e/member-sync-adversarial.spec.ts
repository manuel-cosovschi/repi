// FSA1 (alumno): una serie registrada guarda exactamente lo que la persona cargó, sin cambios silenciosos, aunque la red
// falle en el peor momento. Demo guiada (datos ficticios), servidor local. Casos:
//  · el servidor procesó la serie pero el teléfono perdió la respuesta, y reintenta (una sola serie, mismos valores);
//  · la persona corrige una serie mientras su guardado viaja (queda la corrección, en el servidor y en pantalla);
//  · el servidor falla (500) y después responde (se reintenta solo, sin duplicar);
//  · peso, reps, RIR, sensación y nota llegan tal cual (coma decimal incluida).
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, dismissTour, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Log = { id: string; setIndex: number; weightKg: number | null; reps: number | null; rir: number | null; feel?: string | null; note?: string | null; revision: number };
type Sess = { exercises: { id: string; logs: Log[] }[]; conflicts?: unknown[] };
const openId = async (page: Page) => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;
const sess = async (page: Page, id: string) => (await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess;
const logs0 = async (page: Page, id: string) => (await sess(page, id)).exercises[0].logs;

async function start(page: Page) {
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  return (await expect.poll(() => openId(page), { timeout: 15_000 }).not.toBeNull().then(() => openId(page)))!;
}
async function typeWeight(page: Page, v: string) {
  await page.getByRole("button", { name: /Tocá para escribir el peso/ }).click();
  await page.getByRole("textbox", { name: /Peso en/ }).fill(v);
  await page.getByRole("textbox", { name: /Peso en/ }).press("Enter");
}
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /Guardado en tu cuenta/ }).first()).toBeVisible({ timeout: 30_000 });
const netNoise = (e: string) => /Failed to fetch|NetworkError|net::ERR_|Load failed|status of 500|^500 .*\/sets$/i.test(e);

test("respuesta perdida: el servidor guardó la serie, el teléfono reintenta y queda una sola, con los mismos valores", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const id = await start(page);
  let first = true;
  await page.route("**/api/me/sessions/*/sets", async (route) => {
    if (!first) return route.continue();
    first = false;
    await route.fetch(); // el servidor la procesa…
    await route.abort("connectionreset"); // …y el teléfono no recibe la respuesta
  });
  await typeWeight(page, "82,5");
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect.poll(async () => (await logs0(page, id)).length, { timeout: 10_000 }).toBe(1);
  // Reintento: al volver la conexión (evento «online») o por el temporizador de la cola.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await saved(page);
  const l = await logs0(page, id);
  expect(l).toHaveLength(1);
  expect(l[0]).toMatchObject({ setIndex: 0, weightKg: 82.5 });
  expect((await sess(page, id)).conflicts ?? []).toHaveLength(0);
  expect(errors.filter((e) => !netNoise(e))).toEqual([]);
});

test("respuesta perdida y corrección antes del reintento: queda la corrección, sin conflicto ni duplicado", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const id = await start(page);
  let first = true;
  await page.route("**/api/me/sessions/*/sets", async (route) => {
    if (!first) return route.continue();
    first = false;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await typeWeight(page, "60");
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect.poll(async () => (await logs0(page, id)).length, { timeout: 10_000 }).toBe(1);
  // Corregir la serie 1 (ya hecha) antes de que la cola reintente.
  const skipRest = page.getByRole("button", { name: "Saltar descanso" });
  if (await skipRest.isVisible().catch(() => false)) await skipRest.click();
  await page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0).click();
  await typeWeight(page, "62,5");
  await page.getByRole("button", { name: /^Guardar serie 1$/ }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await saved(page);
  await expect.poll(async () => (await logs0(page, id))[0]?.weightKg, { timeout: 20_000 }).toBe(62.5);
  expect(await logs0(page, id)).toHaveLength(1);
  expect((await sess(page, id)).conflicts ?? []).toHaveLength(0);
  await expect(page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).toHaveAccessibleName(/62,5 kg/);
  expect(errors.filter((e) => !netNoise(e))).toEqual([]);
});

test("corregir una serie mientras su guardado viaja: el servidor y la pantalla quedan con la corrección", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const id = await start(page);
  let n = 0;
  await page.route("**/api/me/sessions/*/sets", async (route) => {
    if (n++ === 0) await new Promise((r) => setTimeout(r, 2_500)); // el primer guardado tarda
    await route.continue();
  });
  await typeWeight(page, "70");
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  const skipRest = page.getByRole("button", { name: "Saltar descanso" });
  if (await skipRest.isVisible().catch(() => false)) await skipRest.click();
  await page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0).click();
  await typeWeight(page, "72,5");
  await page.getByRole("button", { name: /^Guardar serie 1$/ }).click();
  await saved(page);
  await expect.poll(async () => (await logs0(page, id))[0]?.weightKg, { timeout: 20_000 }).toBe(72.5);
  expect(await logs0(page, id)).toHaveLength(1);
  await page.waitForTimeout(1_000);
  await expect(page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).toHaveAccessibleName(/72,5 kg/);
  // Recargar: lo del servidor coincide con lo que se ve.
  await page.reload();
  await page.getByRole("button", { name: /^Continuar / }).first().click();
  await expect(page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).toHaveAccessibleName(/72,5 kg.*completada/);
  expect(errors).toEqual([]);
});

test("servidor caído (500) y después disponible: la serie se reintenta sola y queda una sola vez", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const id = await start(page);
  let fail = true;
  await page.route("**/api/me/sessions/*/sets", (route) => (fail ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "caído" }) }) : route.continue()));
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sin conexión|Pendiente|teléfono/i }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Guardado en tu cuenta/ })).toHaveCount(0);
  expect(await logs0(page, id)).toHaveLength(0);
  fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await saved(page);
  expect(await logs0(page, id)).toHaveLength(1);
  expect(errors.filter((e) => !netNoise(e))).toEqual([]);
});

test("RIR, sensación, nota, peso con coma y reps llegan tal cual al servidor", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const id = await start(page);
  await typeWeight(page, "47,25");
  await page.getByRole("button", { name: "Más repeticiones" }).click();
  const reps = Number(await page.locator(".stepper:not(.wstep) strong").first().innerText());
  await page.getByRole("button", { name: /Reps en reserva: sin registrar/ }).click();
  await page.getByRole("slider", { name: "Reps en reserva" }).press("Home"); // 0
  await page.getByRole("slider", { name: "Reps en reserva" }).press("ArrowRight"); // 1
  await page.getByRole("slider", { name: "Reps en reserva" }).press("ArrowRight"); // 2
  await page.getByRole("button", { name: "Bien", exact: true }).click();
  await page.getByRole("button", { name: "Nota de la serie" }).click();
  await page.getByRole("textbox").last().fill("agarre cerrado");
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await saved(page);
  const l = (await expect.poll(async () => (await logs0(page, id)).length).toBe(1).then(() => logs0(page, id)))[0];
  expect(l).toMatchObject({ setIndex: 0, weightKg: 47.25, reps, rir: 2, feel: "bien", note: "agarre cerrado" });
  expect(errors).toEqual([]);
});

test("peso escrito con decimales que la coma flotante no representa exacto (64,1 kg) se acepta y se guarda tal cual", async ({ page }) => {
  const errors = watchErrors(page);
  const id = await start(page);
  await typeWeight(page, "64,1");
  await expect(page.getByText(/Peso inválido/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^64,1 kg\. Tocá para escribir el peso/ })).toBeVisible();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await saved(page);
  await expect.poll(async () => (await logs0(page, id))[0]?.weightKg, { timeout: 15_000 }).toBe(64.1);
  expect(await logs0(page, id)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("dos pestañas sin conexión: una pestaña atrasada no borra la serie registrada en la otra", async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const id = await start(page);
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await saved(page);
  // Segunda pestaña con el mismo entrenamiento (misma base del teléfono).
  const b = await context.newPage();
  await b.addInitScript(() => { try { sessionStorage.setItem("repi:tour:member", JSON.stringify({ i: 0, open: false })); } catch { /* */ } });
  await b.goto(page.url());
  await dismissTour(b);
  await b.getByRole("button", { name: /^Continuar / }).first().click();
  await expect(b.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).toHaveAccessibleName(/completada/);
  await context.setOffline(true);
  const skipB = b.getByRole("button", { name: "Saltar descanso" });
  if (await skipB.isVisible().catch(() => false)) await skipB.click();
  await b.getByRole("button", { name: /^Completar serie 2$/ }).click();
  await expect(b.getByRole("list", { name: "Series" }).getByRole("listitem").nth(1)).toHaveAccessibleName(/completada/);
  // La primera pestaña (que no vio la serie 2) cambia el peso de la serie en curso: guarda su copia en el teléfono.
  const skipA = page.getByRole("button", { name: "Saltar descanso" });
  if (await skipA.isVisible().catch(() => false)) await skipA.click();
  await page.getByRole("button", { name: /^Más \d/ }).click();
  await page.waitForTimeout(500);
  await context.setOffline(false);
  for (const p of [page, b]) await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await logs0(page, id)).map((l) => l.setIndex).join(","), { timeout: 30_000 }).toBe("0,1");
  await b.close();
  expect(errors.filter((e) => !netNoise(e))).toEqual([]);
});

test("sin almacenamiento en el teléfono: la serie que no se pudo guardar no aparece como hecha y la pantalla lo dice", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const id = await start(page);
  // El almacenamiento del navegador se llena (o se bloquea) a mitad del entrenamiento.
  await page.evaluate(() => {
    const fail = () => { throw new DOMException("Sin espacio", "QuotaExceededError"); };
    IDBObjectStore.prototype.put = fail as never;
    IDBObjectStore.prototype.add = fail as never;
  });
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /No se pudo guardar/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).not.toHaveAccessibleName(/completada/);
  await expect(page.getByRole("status").filter({ hasText: /Guardado en tu cuenta/ })).toHaveCount(0);
  expect(await logs0(page, id)).toHaveLength(0);
  expect(errors.filter((e) => !netNoise(e) && !/Sin espacio|QuotaExceeded/.test(e))).toEqual([]);
});
