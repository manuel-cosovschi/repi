import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D183: drop set de la demo (última serie de «Elevaciones laterales» con 2 drops conectados). El alumno ve 3 series, la
// tercera con sus drops debajo; registra uno sin conexión, corta la serie antes del segundo, recarga y nada se duplica.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Sess = { id: string; exercises: { id: string; name: string; sets: number; logs: { setIndex: number; weightKg: number | null; reps: number | null }[] }[] };
const openSessionId = async (page: Page) => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;
const sessionFromApi = async (page: Page, id: string) => (await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess;

test("drop set: series principales con etapas conectadas, registro offline, cortar la serie y recargar", async ({ page, context }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();

  // Ir al ejercicio con drops del día (la demo pone drops en la última serie de un ejercicio por día).
  const card = page.locator(".excard-top strong");
  for (let i = 0; i < 6 && !/Elevaciones laterales|Hip thrust|Remo en polea/.test(await card.innerText()); i++) await page.getByRole("button", { name: "Ejercicio siguiente" }).click();
  const name = (await card.innerText()).replace(/^[A-Z]\d · /, "");
  expect(name).toMatch(/Elevaciones laterales|Hip thrust|Remo en polea/);
  await expect(page.getByText(/3 series · /).first()).toBeVisible(); // series principales, no 5 filas
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem", { name: /^Drop 1 de la serie 3:/ })).toBeVisible();
  await expect(list.getByRole("listitem", { name: /^Drop 2 de la serie 3:.*peso por elegir/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, "drop set");

  // Durante el descanso, tocar la serie siguiente en la lista la abre (en la demo, la pastilla «Otro perfil» tapa «Saltar descanso» en móvil).
  for (const k of [1, 2, 3]) {
    if (k > 1) await list.getByRole("listitem", { name: new RegExp(`^Serie ${k}:`) }).click();
    await page.getByRole("button", { name: `Completar serie ${k}` }).click();
  }
  // El drop no hereda la carga: se elige (o se usa la referencia) y se completa sin descanso.
  await expect(page.getByRole("note").filter({ hasText: "Drop 1 · serie 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltar descanso" })).toHaveCount(0);
  await context.setOffline(true);
  await page.getByRole("button", { name: /^Usar / }).click();
  await page.getByRole("button", { name: "Completar Drop 1 de la serie 3" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sin conexión|Pendiente/ }).first()).toBeVisible();
  await context.setOffline(false);
  // Cortar la serie antes del segundo drop: queda sin hacer y el ejercicio, completo.
  await page.getByRole("button", { name: "Terminar la serie acá" }).click();
  await expect(page.getByText(`${name} completo · 3 series`)).toBeVisible();
  await expect(list.getByRole("listitem", { name: /^Drop 2 de la serie 3:.*sin hacer/ })).toBeVisible();

  const id = await expect.poll(() => openSessionId(page), { timeout: 15_000 }).not.toBeNull().then(() => openSessionId(page));
  const logsOf = async () => (await sessionFromApi(page, id!)).exercises.find((e) => e.name === name)!.logs;
  await expect.poll(async () => (await logsOf()).map((l) => l.setIndex).join(","), { timeout: 20_000 }).toBe("0,1,2,3");
  await page.reload();
  await expect.poll(async () => (await logsOf()).length, { timeout: 10_000 }).toBe(4); // sin duplicados tras reintentos y recarga
  await page.getByRole("button", { name: /Continuar entrenamiento/ }).first().click();
  for (let i = 0; i < 6 && (await card.innerText()).replace(/^[A-Z]\d · /, "") !== name; i++) await page.getByRole("button", { name: "Ejercicio siguiente" }).click();
  await expect(list.getByRole("listitem", { name: /^Drop 2 de la serie 3:.*sin hacer/ })).toBeVisible(); // lo omitido sigue omitido
  // El corte de conexión es a propósito: su error de red es esperado; cualquier otro error falla la prueba.
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});
