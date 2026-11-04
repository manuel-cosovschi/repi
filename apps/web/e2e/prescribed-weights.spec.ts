import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D193 · Hotfix P0: el alumno ve las cargas que le indicó su profe al entrenar. Con la demo del alumno (is_demo, base local
// repi_dev): el primer ejercicio de cada día pasa a tener 80 × 12, 90 × 10, 100 × 8 indicados por el profe (lo mismo que
// guarda el editor en `detail.setPlan`), y se recorre el entrenamiento: tarjeta, precarga, recarga, tema, kg/lb, sin
// conexión y reconexión sin duplicar ni pisar lo registrado.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

function devDb() {
  try { process.loadEnvFile(".env.local"); } catch { /* */ }
  const url = process.env.DATABASE_URL ?? "";
  const u = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.pathname !== "/repi_dev") throw new Error("Sólo contra la base local repi_dev.");
  return postgres(url, { max: 1, onnotice: () => {} });
}
const S = (reps: string, weightKg: number | null) => ({ kind: "work", reps, weightKg, pct1rm: null, rir: 1, rpe: null, restSec: 90, note: null });
type Sess = { exercises: { name: string; logs: { setIndex: number; weightKg: number | null }[] }[] };
const openId = async (page: Page) => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;

test("tu profe indicó: 80 × 12, 90 × 10, 100 × 8 a la vista, precargadas y separadas de lo real", async ({ page, context }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  const t = await (await page.request.get("/api/me/training")).json();
  expect(t.state).toBe("ready");
  const sql = devDb();
  try {
    const days = (t.program.days as { id: string; exercises: { id: string }[] }[]).filter((d) => d.exercises.length);
    const ids = days.map((d) => d.exercises[0].id);
    await sql`update program_exercise set sets = 3, reps = '8-12', rir = 1, detail = ${sql.json({ technique: "custom", setPlan: [S("12", 80), S("10", 90), S("8", 100)] })} where id in ${sql(ids)}`;
  } finally { await sql.end(); }

  await page.reload();
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();

  const card = page.getByRole("region", { name: /^Objetivo de serie 1$/ });
  await expect(card).toBeVisible();
  await expect(card.getByText("Tu profe indicó", { exact: true })).toBeVisible();
  await expect(card.getByText("80 kg × 12", { exact: true })).toBeVisible();
  await expect(card.getByText("Por registrar")).toBeVisible();
  await expect(card.getByText("Carga indicada por tu profe.")).toBeVisible();
  // Las tres series con su carga en la lista; la serie en curso precargada con 80 (no 0, ni historial, ni sugerencia).
  const rows = page.getByRole("list", { name: "Series" }).getByRole("listitem");
  await expect(rows.nth(0)).toHaveAccessibleName(/^Serie 1: 80 kg, 12 repeticiones/);
  await expect(rows.nth(1)).toHaveAccessibleName(/^Serie 2: 90 kg, 10 repeticiones/);
  await expect(rows.nth(2)).toHaveAccessibleName(/^Serie 3: 100 kg, 8 repeticiones/);
  await expectNoHorizontalOverflow(page, "entrenamiento con cargas del profe");
  await page.screenshot({ path: info.outputPath("tu-profe-indico-claro.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(card.getByText("80 kg × 12", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("tu-profe-indico-oscuro.png") });
  await page.emulateMedia({ colorScheme: "light" });

  // Recargar no pierde la carga del profe.
  const resume = async () => { await page.reload(); await page.getByRole("button", { name: /^Continuar / }).first().click(); };
  await resume();
  await expect(page.getByRole("region", { name: /^Objetivo de serie 1$/ }).getByText("80 kg × 12", { exact: true })).toBeVisible();

  // Sin conexión: completa la serie 1 con lo que hizo (el alumno baja a 77,5 con el −) y vuelve la conexión.
  await context.setOffline(true);
  const minus = page.getByRole("button", { name: /^Menos [\d,.]+ kg$/ }).first();
  await minus.click();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await context.setOffline(false);
  const id = (await expect.poll(() => openId(page), { timeout: 15_000 }).not.toBeNull().then(() => openId(page)))!;
  await expect.poll(async () => ((await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess).exercises[0].logs.length, { timeout: 20_000 }).toBe(1);
  const srv = (await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess;
  const real = srv.exercises[0].logs[0].weightKg!;
  expect(real).toBeLessThan(80); // lo real es lo que hizo, separado del plan
  // La serie 2 sigue con la carga del profe; la 1 muestra lo real.
  await page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(1).click();
  await expect(page.getByRole("region", { name: /^Objetivo de serie 2$/ }).getByText("90 kg × 10", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(0)).toHaveAccessibleName(new RegExp(`^Serie 1: ${String(real).replace(".", ",")} kg, .*completada`));

  // En libras: la misma carga del profe, convertida (el dato sigue en kg).
  expect((await page.request.post("/api/me/settings", { data: { weightUnit: "lb" } })).status()).toBe(200);
  await resume();
  await page.getByRole("list", { name: "Series" }).getByRole("listitem").nth(1).click();
  await expect(page.getByRole("region", { name: /^Objetivo de serie 2$/ }).getByText(/^198(,4)? lb × 10$/)).toBeVisible();
  await page.request.post("/api/me/settings", { data: { weightUnit: "kg" } });
  // Nada duplicado tras reconectar y recargar.
  expect(((await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess).exercises[0].logs).toHaveLength(1);
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});
