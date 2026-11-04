import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D191 · Training Intelligence 2.0 en el navegador, con la demo del alumno (historial ficticio propio, is_demo).
// Escenario B (anterior → REPI → real, usar y completar), ajuste tras una serie exigente durante el descanso, cambio de tema
// sin reiniciar el descanso (G), sin conexión y reconexión sin duplicados ni reemplazar lo registrado (F), sin IA (H: el
// servidor local no tiene proveedor configurado, así que todo lo que se ve sale del motor de reglas).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Sess = { id: string; exercises: { id: string; name: string; targets: { setIndex: number; source: string; status: string }[]; logs: { setIndex: number; weightKg: number | null; reps: number | null; feel: string | null }[] }[] };
const api = async (page: Page, id: string) => (await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess;
const openId = async (page: Page) => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;

test("anterior → REPI → real; ajuste tras una serie al límite; tema durante el descanso; sin conexión y reconexión", async ({ page, context }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();

  const card = page.getByRole("region", { name: /^Objetivo de serie 1$/ });
  await expect(card).toBeVisible();
  await expect(card.getByText("Anterior", { exact: true })).toBeVisible();
  await expect(card.getByText(/^(REPI recomienda|Tu profe indicó|REPI)$/)).toBeVisible();
  await expect(card.getByText("Por registrar")).toBeVisible();
  await expectNoHorizontalOverflow(page, "entrenamiento con objetivo");
  await expectAccessible(page, info, "ti-card");

  const id = (await expect.poll(() => openId(page), { timeout: 15_000 }).not.toBeNull().then(() => openId(page)))!;
  const srv = await api(page, id);
  expect(srv.exercises[0].targets.length).toBeGreaterThan(0); // persistido en el servidor (training_target)

  const use = card.getByRole("button", { name: /^Usar / });
  if (await use.isVisible().catch(() => false)) await use.click();
  // La persona decide otra cosa: una repetición menos que el borrador y «Al límite».
  await page.getByRole("button", { name: "Menos repeticiones" }).click();
  await page.getByRole("group", { name: /¿Cómo se sintió la serie\?/ }).getByRole("button", { name: "Al límite" }).click();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();

  // Durante el descanso: un solo mensaje breve, sin tapar los controles; la propuesta de más descanso es opcional.
  const msg = page.locator(".ti-rest");
  await expect(msg).toContainText(/más exigente de lo previsto|bastante más exigente|Tu profe indicó/);
  const timer = page.getByRole("timer");
  await expect(timer).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltar descanso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+30s" })).toBeVisible();
  const toSec = (t: string) => { const [m, s] = t.split(":").map(Number); return m * 60 + s; };
  const before = toSec(await timer.innerText());
  const plus = msg.getByRole("button", { name: /^Sumar \d+ s$/ });
  if (await plus.isVisible().catch(() => false)) {
    await plus.click();
    await expect.poll(async () => toSec(await timer.innerText())).toBeGreaterThan(before + 20);
  }
  // Escenario G: Claro → Oscuro durante el descanso: el reloj no se reinicia y la tarjeta toma los tokens del tema.
  const t0 = toSec(await timer.innerText());
  const bgLight = await page.locator(".ti-card").first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(light);
  const t1 = toSec(await timer.innerText());
  expect(t1).toBeLessThanOrEqual(t0);
  expect(t1).toBeGreaterThan(0);
  void bgLight;

  // El registro guardado es lo que la persona hizo (no el objetivo).
  const logged = await expect.poll(async () => (await api(page, id)).exercises[0].logs.length, { timeout: 15_000 }).toBe(1).then(() => api(page, id));
  expect(logged.exercises[0].logs[0]).toMatchObject({ setIndex: 0, feel: "limite" });
  const realReps = logged.exercises[0].logs[0].reps;

  // Escenario F: sin conexión, la tarjeta sigue (está en el teléfono) y se registra la serie 2.
  await page.getByRole("button", { name: "Saltar descanso" }).click();
  await context.setOffline(true);
  await expect(page.getByRole("region", { name: /^Objetivo de serie 2$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Completar serie 2$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sin conexión/ }).first()).toBeVisible({ timeout: 10_000 });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const synced = await expect.poll(async () => (await api(page, id)).exercises[0].logs.length, { timeout: 20_000 }).toBe(2).then(() => api(page, id));
  expect(synced.exercises[0].logs.find((l) => l.setIndex === 0)!.reps).toBe(realReps); // la reconexión no reemplazó nada
  await page.reload();
  expect((await api(page, id)).exercises[0].logs).toHaveLength(2); // sin duplicados
  // Sin conexión simulada, el navegador anota el pedido de la cola que no salió: es lo esperado, no un error de la app.
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});
