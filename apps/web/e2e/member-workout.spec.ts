import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Sess = { id: string; status: string; exercises: { id: string; name: string; logs: { setIndex: number; weightKg: number | null; reps: number | null }[] }[] };
const sessionFromApi = async (page: Page, id: string) => {
  const r = await page.request.get(`/api/me/sessions/${id}`);
  expect(r.status()).toBe(200);
  return (await r.json()) as Sess;
};
const openSessionId = async (page: Page) => {
  const t = await (await page.request.get("/api/me/training")).json();
  return (t.openSession ?? null) as string | null;
};

test("alumno: entrena, registra una serie, recarga y la serie sigue guardada en el servidor (una sola vez)", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page, "/app inicio");
  await expectAccessible(page, info, "member-home");

  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  // Check-in optativo antes de empezar.
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  const done = page.getByRole("button", { name: /^Completar serie 1$/ });
  await expect(done).toBeVisible();
  await expectNoHorizontalOverflow(page, "entrenamiento");

  // Peso con decimales escrito a mano (coma, como en es-AR).
  await page.getByRole("button", { name: /Tocá para escribir el peso/ }).click();
  await page.getByRole("textbox", { name: /Peso en/ }).fill("42,5");
  await page.getByRole("textbox", { name: /Peso en/ }).press("Enter");
  // Doble toque: no debe duplicar.
  await done.dblclick();
  await expect(page.getByRole("status").filter({ hasText: /Guardado|guardad/i }).first()).toBeVisible({ timeout: 15_000 });

  const id = await expect.poll(() => openSessionId(page), { timeout: 15_000 }).not.toBeNull().then(() => openSessionId(page));
  const s = await expect.poll(async () => (await sessionFromApi(page, id!)).exercises[0].logs.length, { timeout: 15_000 }).toBe(1).then(() => sessionFromApi(page, id!));
  expect(s.exercises[0].logs[0]).toMatchObject({ setIndex: 0, weightKg: 42.5 });

  await page.reload();
  const again = await sessionFromApi(page, id!);
  expect(again.exercises[0].logs).toHaveLength(1);
  expect(again.exercises[0].logs[0].weightKg).toBe(42.5);
  expect(errors).toEqual([]);
});

test("alumno: cada pestaña principal abre sin errores ni scroll lateral", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  const nav = page.getByRole("navigation", { name: "Principal" });
  const tabs = await nav.getByRole("button").all();
  expect(tabs.length).toBeGreaterThanOrEqual(4);
  for (const [i, tab] of tabs.entries()) {
    const name = (await tab.getAttribute("aria-label")) ?? (await tab.innerText());
    await tab.click();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /error|no se pudo/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, `tab ${name}`);
    if (i < 4) await expectAccessible(page, info, `member-tab-${i}`);
  }
  expect(errors).toEqual([]);
});
