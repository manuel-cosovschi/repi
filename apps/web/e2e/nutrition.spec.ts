import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// REPI Nutrition Intelligence 1.0 (D221) · Progreso › Nutrición del alumno, en la app real con la demo guiada (servidor
// local; la demo tiene Nutrición como piloto y una semana de registros ficticios). Recorridos: A (primera vez: bienvenida →
// registrar → resumen), registro rápido y edición, D (sin conexión → recargar → sincronizar una sola vez), E (receta →
// porción), F (día parcial → respuesta prudente de REPI) y progreso/ajustes.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const BASE = "/api/me/nutrition";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
type Day = { status: string; complete: boolean; meals: { meal: string; entries: { id: string; revision: number; food: { name: string; refId: string }; quantity: { amount: number; unit: string } }[] }[] };
const dayOf = async (page: Page, d = today()) => (await (await page.request.get(`${BASE}/day/${d}`)).json()) as Day;
const entries = (d: Day) => d.meals.flatMap((m) => m.entries.map((e) => ({ ...e, meal: m.meal })));
const benign = (errors: string[]) => errors.filter((e) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|Load failed/i.test(e));

async function openNutrition(page: Page) {
  await page.getByRole("button", { name: "Progreso", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Progreso", exact: true })).toBeVisible();
  await page.getByRole("tablist", { name: "Secciones de Progreso" }).getByRole("tab", { name: "Nutrición" }).click();
}
const sub = (page: Page, name: "Hoy" | "Progreso" | "Ajustes") => page.getByRole("tablist", { name: "Secciones de Nutrición" }).getByRole("tab", { name });

/** Base local descartable (nunca otra): sólo repi_dev o una repi_e2e_* propia. */
async function localSql() {
  const sql = postgres(process.env.DATABASE_URL ?? "postgres://repi:repi-local-test@127.0.0.1:5432/repi_dev", { max: 1, onnotice: () => {} });
  const [{ db }] = await sql<{ db: string }[]>`select current_database() as db`;
  expect(db).toMatch(/^repi_(dev|e2e_[a-z0-9_]+)$/);
  return sql;
}

test("A · primera vez: bienvenida (privada, saltable, sin objetivo elegido), registrar y ver el resumen del día", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  // La demo ya trae a Valentina con su semana: se la deja como alguien que entra por primera vez (sólo en la base local).
  const me = (await (await page.request.get("/api/auth/get-session")).json()) as { user: { id: string } };
  const sql = await localSql();
  try {
    await sql`delete from nutrition_profile where user_id = ${me.user.id}`;
    await sql`delete from nutrition_entry where user_id = ${me.user.id}`;
    await sql`delete from nutrition_day where user_id = ${me.user.id}`;
  } finally { await sql.end(); }
  await openNutrition(page);
  await expect(page.getByRole("heading", { name: "Nutrición, a tu ritmo" })).toBeVisible();
  await expect(page.getByText(/REPI Admin nunca lo ven/)).toBeVisible();
  await expect(page.getByText(/No reemplaza a un nutricionista/)).toBeVisible();
  await expectAccessible(page, info, "bienvenida");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "¿Para qué querés usarla?" })).toBeFocused();
  const chips = page.getByRole("group", { name: /Objetivo general/ }).getByRole("button");
  await expect(chips.first()).toBeVisible();
  for (const c of await chips.all()) await expect(c).toHaveAttribute("aria-pressed", "false"); // ninguno elegido de antemano
  await page.getByRole("button", { name: "Llegar a mi proteína" }).click();
  await page.getByRole("button", { name: "Empezar a registrar" }).click();

  await expect(sub(page, "Hoy")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Todavía no registraste comidas este día.")).toBeVisible();
  await page.getByRole("button", { name: "Registrar comida" }).click();
  const sheet = page.getByRole("dialog", { name: "Registrar comida" });
  await sheet.getByRole("button", { name: "Almuerzo", exact: true }).click();
  await sheet.getByRole("searchbox").fill("banana");
  await sheet.getByRole("button", { name: /^Banana/ }).first().click();
  const qty = page.getByRole("dialog", { name: "¿Cuánto?" });
  await expect(qty.getByRole("radio", { name: /unidad mediana/ })).toHaveAttribute("aria-checked", "true");
  await expect(qty.getByRole("radio", { name: /^ml$/ })).toHaveCount(0); // nunca ml para un alimento en gramos
  await expect(qty.getByText(/Valores por 100 g según USDA/)).toBeVisible();
  await qty.getByRole("button", { name: "Agregar a almuerzo" }).dblclick(); // doble toque: un solo registro
  await expect(page.getByRole("heading", { name: "Almuerzo" })).toBeVisible();
  await expect(page.getByText("Parcial: muestra sólo lo que registraste")).toBeVisible();
  await expect(page.getByText(/todavía no podemos evaluar tu alimentación del día completo/)).toBeVisible();
  await expect.poll(async () => entries(await dayOf(page)).length).toBe(1);
  const p = (await (await page.request.get(`${BASE}/profile`)).json()) as { goal: string; onboarded: boolean };
  expect(p).toMatchObject({ goal: "protein", onboarded: true });
  await expectAccessible(page, info, "hoy"); await expectNoHorizontalOverflow(page, "hoy");
  expect(benign(errors)).toEqual([]);
});

test("hoy: reciente en un toque con deshacer, texto, alimento a mano sin dato, favorita, copiar, completo, edición vieja y borrar", async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openNutrition(page);
  await expect(page.getByRole("heading", { name: "Desayuno" })).toBeVisible();
  const n0 = entries(await dayOf(page)).length;

  // Reciente: un toque registra con la última cantidad y se puede deshacer.
  await page.getByRole("button", { name: "Registrar comida" }).click();
  let sheet = page.getByRole("dialog", { name: "Registrar comida" });
  await sheet.getByRole("button", { name: "Merienda", exact: true }).click();
  await sheet.getByRole("button", { name: /^Registrar Banana/ }).click();
  await expect(page.getByRole("heading", { name: "Merienda" })).toBeVisible();
  await expect.poll(async () => entries(await dayOf(page)).length).toBe(n0 + 1);
  await page.locator(".nu-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByRole("heading", { name: "Merienda" })).toHaveCount(0);
  await expect.poll(async () => entries(await dayOf(page)).length).toBe(n0);

  // Escribir lo que comí: propuesta editable; sólo se agregan las filas confirmadas.
  await page.getByRole("button", { name: "Registrar comida" }).click();
  sheet = page.getByRole("dialog", { name: "Registrar comida" });
  await sheet.getByRole("button", { name: "Escribir lo que comí" }).click();
  sheet = page.getByRole("dialog", { name: "Escribir lo que comí" });
  await sheet.getByRole("textbox", { name: /Contá qué comiste/ }).fill("Almorcé 200 g de pollo cocido y una taza de arroz cocido");
  await sheet.getByRole("button", { name: "Interpretar" }).click();
  const rows = sheet.getByRole("list", { name: "Propuesta" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "Almuerzo", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(entries(await dayOf(page)).length).toBe(n0); // nada se guarda solo
  const add = sheet.getByRole("button", { name: /^Agregar todo \(\d\)$/ });
  await expect(add).toBeEnabled();
  const k = Number((await add.textContent())!.match(/\((\d)\)/)![1]);
  await add.click();
  await expect(page.getByRole("heading", { name: "Almuerzo" })).toBeVisible();
  await expect.poll(async () => entries(await dayOf(page)).length).toBe(n0 + k);

  // A mano: lo que no se sabe queda «sin dato» (nunca 0) y el total pasa a «al menos».
  await page.getByRole("button", { name: "Registrar comida" }).click();
  sheet = page.getByRole("dialog", { name: "Registrar comida" });
  await sheet.getByRole("button", { name: "Cena", exact: true }).click();
  await sheet.getByRole("button", { name: "Cargar a mano" }).click();
  sheet = page.getByRole("dialog", { name: "Cargar a mano" });
  await expect(sheet.getByText(/se guarda como «sin dato», nunca como 0/)).toBeVisible();
  await sheet.getByLabel("Nombre").fill("Yogur casero E2E");
  await sheet.getByLabel("Proteínas (g)").fill("4");
  await sheet.getByRole("button", { name: "Crear y elegir cantidad" }).click();
  await page.getByRole("dialog", { name: "¿Cuánto?" }).getByRole("button", { name: "Agregar a cena" }).click();
  const yog = page.getByRole("button", { name: /^Yogur casero E2E/ });
  await expect(yog).toContainText("sin dato");
  await expect(page.locator(".nu-totals dd strong").first()).toHaveText(/^≥ /);

  // Favorita: guardar el desayuno y registrarlo en la colación en un toque.
  await page.getByRole("region", { name: "Desayuno" }).getByRole("button", { name: "Guardar como favorita" }).click();
  await page.getByRole("dialog", { name: "Guardar como favorita" }).getByLabel("Nombre").fill("Desayuno E2E");
  await page.getByRole("button", { name: "Guardar favorita" }).click();
  await expect(page.getByText("Guardamos «Desayuno E2E» en tus favoritas.").first()).toBeVisible();
  await page.getByRole("button", { name: "+ Colación" }).click();
  await page.getByRole("button", { name: "Registrar la favorita Desayuno E2E en colación" }).click();
  await expect(page.getByRole("heading", { name: "Colación" })).toBeVisible();

  // Copiar el día anterior (con deshacer) y marcar el día completo.
  const before = entries(await dayOf(page)).length;
  await page.getByRole("button", { name: "Copiar todo el día anterior" }).click();
  await expect(page.locator(".nu-toast")).toContainText(/Copiamos \d+ registros? del día anterior/);
  await expect.poll(async () => entries(await dayOf(page)).length).toBeGreaterThan(before);
  await page.locator(".nu-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => entries(await dayOf(page)).length).toBe(before);
  await page.getByRole("switch", { name: /Registré todo lo que comí hoy/ }).check();
  await expect(page.locator(".nu-totals .nu-chip")).toHaveText("Completo");
  expect((await dayOf(page)).complete).toBe(true);

  // Edición sobre una copia vieja: otro dispositivo la cambió; se avisa y se muestra la vigente.
  const banana = entries(await dayOf(page)).find((e) => e.food.name === "Banana" && e.meal === "desayuno")!;
  await page.getByRole("region", { name: "Desayuno" }).getByRole("button", { name: /^Banana/ }).click();
  const edit = page.getByRole("dialog", { name: "Banana" });
  await expect(edit.getByText(/Valores por 100 g según USDA/)).toBeVisible();
  expect((await page.request.post(`${BASE}/entries/${banana.id}`, { data: { revision: banana.revision, quantity: { amount: 2, unit: banana.quantity.unit } } })).status()).toBe(200);
  await edit.getByLabel("Cantidad").fill("3");
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /cambió en otro dispositivo/ })).toBeVisible();
  await page.getByRole("button", { name: "Entendido" }).click();
  await expect(page.getByRole("region", { name: "Desayuno" }).getByRole("button", { name: /^Banana, 2 × / })).toBeVisible();

  // Borrar con confirmación.
  await yog.click();
  await page.getByRole("button", { name: "Eliminar registro" }).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Yogur casero E2E/ })).toHaveCount(0);
  await expect.poll(async () => entries(await dayOf(page)).some((e) => e.food.name === "Yogur casero E2E")).toBe(false);
  await expectAccessible(page, info, "hoy completo"); await expectNoHorizontalOverflow(page, "hoy completo");
  expect(benign(errors)).toEqual([]);
});

test("D · sin conexión: registrar un reciente, recargar sin red, reconectar y sincronizar una sola vez", async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openNutrition(page);
  await expect(page.getByRole("heading", { name: "Desayuno" })).toBeVisible();
  // Abrir una vez la hoja con conexión deja recientes y favoritas guardados en el teléfono.
  await page.getByRole("button", { name: "Registrar comida" }).click();
  await expect(page.getByRole("dialog", { name: "Registrar comida" }).getByRole("button", { name: /^Registrar Banana/ })).toBeVisible();
  await page.getByRole("dialog", { name: "Registrar comida" }).getByRole("button", { name: "Cerrar" }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await openNutrition(page); }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1_500);
  const n0 = entries(await dayOf(page)).length;

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: /Sin conexión\. Podés registrar/ })).toBeVisible();
  await page.getByRole("button", { name: "Registrar comida" }).click();
  const sheet = page.getByRole("dialog", { name: "Registrar comida" });
  await sheet.getByRole("button", { name: "Cena", exact: true }).click();
  await sheet.getByRole("button", { name: /^Registrar Banana/ }).click();
  const pending = page.getByRole("region", { name: "Cena" }).getByRole("button", { name: /^Banana.*pendiente de sincronizar/ });
  await expect(pending).toBeVisible();
  await expect(pending).toContainText("Pendiente de sincronizar");
  expect(entries(await dayOf(page)).length).toBe(n0); // page.request no pasa por el modo sin conexión: el servidor todavía no lo tiene

  await page.reload();
  await openNutrition(page);
  await expect(page.getByRole("region", { name: "Cena" }).getByRole("button", { name: /^Banana.*pendiente de sincronizar/ })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole("region", { name: "Cena" }).getByRole("button", { name: /^Banana/ })).not.toContainText("Pendiente", { timeout: 30_000 });
  await expect.poll(async () => entries(await dayOf(page)).length, { timeout: 30_000 }).toBe(n0 + 1);
  await page.reload();
  await openNutrition(page);
  await expect(page.getByRole("region", { name: "Cena" })).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(entries(await dayOf(page)).filter((e) => e.meal === "cena").length).toBe(1); // sin duplicados
  expect(benign(errors)).toEqual([]);
});

test("E · receta con peso final: se registra por porción y en gramos de la preparación", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openNutrition(page);
  await page.getByRole("button", { name: "Registrar comida" }).click();
  await page.getByRole("dialog", { name: "Registrar comida" }).getByRole("button", { name: "Mis recetas" }).click();
  const sheet = page.getByRole("dialog", { name: "Mis recetas" });
  await sheet.getByRole("button", { name: "Nueva receta" }).click();
  await sheet.getByLabel("Nombre").fill("Guiso E2E");
  for (const q of ["lentejas", "arroz"]) {
    await sheet.getByRole("searchbox", { name: "Buscar ingrediente" }).fill(q);
    await sheet.getByRole("list", { name: "Ingredientes encontrados" }).getByRole("button").first().click();
  }
  await expect(sheet.getByRole("list", { name: "Ingredientes" }).getByRole("listitem")).toHaveCount(2);
  await expect(sheet.getByText(/no es la suma de los ingredientes crudos/)).toBeVisible();
  await sheet.getByLabel("Porciones que rinde").fill("4");
  await sheet.getByLabel("Peso final cocido (g)").fill("1200");
  await expect(sheet.getByText(/^Por porción \(4\)/)).toBeVisible();
  await sheet.getByRole("button", { name: "Guardar receta" }).click();
  await sheet.getByRole("button", { name: "Registrar Guiso E2E" }).click();
  const qty = page.getByRole("dialog", { name: "¿Cuánto?" });
  await expect(qty.getByRole("radio", { name: "porciones" })).toHaveAttribute("aria-checked", "true");
  await expect(qty.getByRole("radio", { name: "gramos" })).toBeVisible(); // con peso final, también en gramos
  await expectAccessible(page, info, "receta");
  await qty.getByRole("button", { name: /^Agregar a / }).click();
  await expect(page.getByRole("button", { name: /^Guiso E2E, 1 porción \(300 g\)/ })).toBeVisible();
  const e = entries(await dayOf(page)).find((x) => x.food.name === "Guiso E2E")!;
  expect(e.quantity).toEqual({ amount: 1, unit: "porcion" });
  expect(benign(errors)).toEqual([]);
});

test("F · día parcial: la nota lo aclara y REPI responde con prudencia (no es todo lo que comiste)", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openNutrition(page);
  await expect(page.getByText("Parcial: muestra sólo lo que registraste")).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: /todavía no podemos evaluar tu alimentación del día completo/ })).toBeVisible();
  await page.getByRole("button", { name: "Preguntale a REPI por tus comidas" }).click();
  const panel = page.getByRole("dialog", { name: "Asistente REPI" });
  // D217: la primera consulta a REPI puede ofrecer (una vez) completar el perfil; nunca bloquea.
  const later = page.getByRole("dialog").getByRole("button", { name: "Ahora no" });
  await expect(panel.or(later)).toBeVisible();
  if (await later.isVisible()) await later.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("textbox", { name: "Mensaje para REPI" }).fill("¿Cuánta proteína llevo hoy?");
  await panel.getByRole("button", { name: "Enviar a REPI" }).click();
  const reply = panel.getByRole("article", { name: "Respuesta de REPI" }).last();
  await expect(reply).toContainText(/proteína/, { timeout: 15_000 });
  await expect(reply).toContainText(/no necesariamente todo lo que comiste/);
  expect(benign(errors)).toEqual([]);
});

test("progreso (7 días, promedios sólo de días completos) y ajustes (1100 kcal propio se rechaza)", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openNutrition(page);
  await sub(page, "Progreso").click();
  await expect(page.getByRole("button", { name: "7 días" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^En estos 7 días registraste comidas en \d días/)).toBeVisible();
  await expect(page.getByText(/días completos/).first()).toBeVisible();
  await expect(page.getByText(/Cumpliste tu objetivo de proteína en \d+ de \d+ días completos/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proteína por día" })).toBeVisible();
  await expect(page.locator("figure.pc").first()).toBeVisible();
  await page.getByText("Ver cada día").click();
  await expect(page.getByRole("list", { name: "Días con registro" }).getByText("Parcial").first()).toBeVisible();
  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByLabel("Desde", { exact: true }).fill("2024-01-01");
  await expect(page.getByText("Elegí un período de hasta 365 días.")).toBeVisible();
  await expectAccessible(page, info, "progreso"); await expectNoHorizontalOverflow(page, "progreso");

  await sub(page, "Ajustes").click();
  await expect(page.getByText(/Open Food Facts/).first()).toBeVisible();
  await expect(page.getByRole("switch", { name: /Información nutricional de REPI/ })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: /Recordatorios/ })).not.toBeChecked();
  await page.getByLabel("Energía (kcal)").fill("1100");
  await page.getByRole("button", { name: "Guardar ajustes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /1200|profesional/ })).toBeVisible();
  await page.getByLabel("Energía (kcal)").fill("2200");
  await page.getByRole("button", { name: "Guardar ajustes" }).click();
  await expect(page.getByText("Ajustes guardados.").first()).toBeVisible();
  const prof = (await (await page.request.get(`${BASE}/profile`)).json()) as { targets: Record<string, { value: number; mode: string }>; targetSource: string };
  expect(prof.targets.energyKcal).toEqual({ value: 2200, mode: "approx" });
  expect(prof.targets.proteinG).toEqual({ value: 110, mode: "min" });
  await expectAccessible(page, info, "ajustes"); await expectNoHorizontalOverflow(page, "ajustes");
  expect(benign(errors)).toEqual([]);
});

// C · Coach personal: ve el resumen que el alumno compartió (sin comidas) y el diario bloqueado con «Pedir acceso».
test("C · coach: resumen compartido sin comidas, diario bloqueado y pedido de acceso", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = /\/coach\/([^?]+)/.exec(href)![1];
  const ov = (await (await page.request.get(`/api/coach/${org}/overview`)).json()) as { clients: { id: string; name: string }[] };
  const vale = ov.clients.find((c) => /Valentina/.test(c.name))!;
  await page.goto(`/coach/${org}?s=client&c=${vale.id}`);
  await page.getByRole("tablist", { name: "Ficha del cliente" }).getByRole("tab", { name: "Nutrición" }).click();
  await expect(page.getByRole("heading", { name: "Nutrición · resumen" })).toBeVisible();
  await expect(page.getByText(/Registró comidas en \d+ de 7 días/)).toBeVisible();
  await expect(page.getByText(/Pechuga|Banana|Avena/)).toHaveCount(0); // el resumen no lista comidas
  await expect(page.getByRole("heading", { name: "Diario de comidas: no compartido" })).toBeVisible();
  await page.getByRole("button", { name: "Pedir acceso" }).click();
  await expect(page.getByText("Solicitud enviada · esperando respuesta")).toBeVisible();
  const r = (await (await page.request.get(`/api/coach/${org}/clients/${vale.id}/nutrition`)).json()) as { journal: boolean; journalView: unknown };
  expect(r).toMatchObject({ journal: false, journalView: null }); // pedir no da acceso: decide el alumno
  await expectNoHorizontalOverflow(page);
  expect(benign(errors)).toEqual([]);
});

// G · REPI Control: la pantalla compartida del gimnasio no muestra ni ofrece nada de Nutrición.
test("G · REPI Control: la pantalla del gimnasio no muestra Nutrición", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "control");
  await expect(page.getByRole("button", { name: "Empezar" })).toBeVisible();
  expect(await page.content()).not.toMatch(/nutrici|nutrition|comidas/i);
  expect(benign(errors)).toEqual([]);
});
