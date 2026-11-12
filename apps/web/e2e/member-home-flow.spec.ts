// FSA1 (alumno · Inicio): la tarjeta del entrenamiento dice la verdad en cada paso. Sin entrenamiento abierto, «Próximo
// entrenamiento»; al salir con uno abierto, «Entrenamiento en curso» y continuar lleva al mismo (con lo registrado); al terminarlo,
// el siguiente día de la rotación y el entrenamiento en el historial. Demo guiada (datos ficticios), servidor local.
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const training = async (page: Page) => (await (await page.request.get("/api/me/training")).json()) as { openSession: string | null; program: { nextDay: number; days: { name: string }[] } };

test("Inicio: próximo → en curso (salir y continuar conserva lo registrado) → terminado avanza la rotación", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openDemo(page, "member");
  const t0 = await training(page);
  const today = t0.program.days[t0.program.nextDay].name;
  await expect(page.getByRole("button", { name: `Ver ${today}` })).toBeVisible();
  await expect(page.getByText("Hoy es un gran día para entrenar.")).toBeVisible();

  await page.getByRole("button", { name: "Comenzar entrenamiento" }).click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Guardado en tu cuenta/ }).first()).toBeVisible({ timeout: 20_000 });
  // Salir con el entrenamiento abierto (el reloj sigue).
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: /Salir un momento/ }).click();
  await expect(page.getByText("Tenés un entrenamiento en curso.")).toBeVisible();
  await expect(page.getByRole("button", { name: `Continuar ${today}` })).toBeVisible();
  await page.getByRole("button", { name: "Continuar entrenamiento" }).click();
  await expect(page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).toHaveAccessibleName(/completada/);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`${today} registrado`) })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Volver al inicio" }).click();
  const t1 = await training(page);
  expect(t1.openSession).toBeNull();
  const next = t1.program.days[t1.program.nextDay].name;
  expect(t1.program.days.length === 1 || next !== today).toBe(true);
  await expect(page.getByRole("button", { name: `Ver ${next}` })).toBeVisible();
  await expect(page.getByText("Tenés un entrenamiento en curso.")).toHaveCount(0);
  const h = (await (await page.request.get("/api/me/history")).json()) as { sessions: { dayName: string; sets: number }[] };
  expect(h.sessions[0]).toMatchObject({ dayName: today, sets: 1 });
  expect(errors).toEqual([]);
});
