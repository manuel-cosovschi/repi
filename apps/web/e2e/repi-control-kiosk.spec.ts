import { randomInt } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, watchErrors } from "./helpers";

// REPI Control (D213 · D216): pantalla de rutinas con la demo «control» (Gimnasio Atlas ficticio, is_demo). Bienvenida → código y
// PIN → elegir consultar o registrar → terminar; errores, cierre por inactividad, consulta cortada del lado del servidor y no-store.
// Registrar: las tres capas (profesor → REPI → real), borradores que no se guardan hasta confirmar, reintento sin duplicar,
// corrección de una serie guardada y el entrenamiento que sigue abierto entre visitas.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Person = { code: string; pin: string };
async function openDemo(page: Page) {
  // Otra IP simulada por demo (sólo en local) para no chocar con el límite de demos por hora.
  const r = await page.request.post("/api/demo", { data: { role: "control" }, headers: { "x-forwarded-for": `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}` } });
  expect(r.status()).toBe(200);
  const { href } = await r.json();
  expect(href).toMatch(/^\/rutinas#k=/);
  const res = await page.goto(href);
  expect(res?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("button", { name: "Empezar" })).toBeVisible();
  // El secreto no queda en la barra de direcciones.
  expect(page.url()).not.toContain("#k=");
  const rows = await page.locator(".kq-demo-guide li").allTextContents();
  const people = rows.map((t) => { const m = /código\s*(\d{6}).*PIN\s*(\d{4})/.exec(t)!; return { code: m[1], pin: m[2] } as Person; });
  expect(people).toHaveLength(3);
  return people;
}
async function type(page: Page, digits: string) { for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click(); }
async function enter(page: Page, p: Person) {
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByRole("heading", { name: "Tu código de socio" })).toBeFocused();
  await type(page, p.code);
  await expect(page.getByRole("heading", { name: "Tu PIN" })).toBeVisible();
  await type(page, p.pin);
  await page.getByRole("button", { name: "Ver" }).click();
}
const row = (page: Page, i: number) => page.locator(".kq-set").nth(i);
const stepper = (page: Page, name: string) => page.getByRole("group", { name });
/** Registrar → día sugerido → lista del entrenamiento. */
async function startDay(page: Page, day: RegExp) {
  await page.getByRole("button", { name: /Registrar mi entrenamiento/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "¿Qué día entrenás hoy?" })).toBeFocused();
  await expect(page.getByRole("radio", { name: day })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /^Empezar / }).click();
  await expect(page.getByRole("heading", { level: 1, name: day })).toBeVisible();
}
async function openExercise(page: Page, name: RegExp) {
  await page.locator(".kq-wlist").getByRole("button", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeFocused();
}
const value = (g: Locator) => g.locator(".kq-val b").textContent();

test("socio con programa: elige consultar, ve las tres capas sin editar y termina dejando la pantalla libre", async ({ page }, info) => {
  const errors = watchErrors(page);
  const [ana] = await openDemo(page);
  await expectAccessible(page, info, "rutinas-bienvenida");
  let token = "";
  page.on("request", (r) => { const t = r.headers()["x-repi-kiosk-session"]; if (t) token = t; });
  const writes: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/kiosk\/workout/.test(r.url())) writes.push(r.url()); });
  await enter(page, ana);
  await expect(page.getByRole("heading", { level: 1, name: "Hola, Ana P." })).toBeFocused();
  await expect(page.getByRole("button", { name: /Consultar mi rutina/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Registrar mi entrenamiento/ })).toBeVisible();
  await expectAccessible(page, info, "rutinas-elegir");
  await expectNoHorizontalOverflow(page, "rutinas-elegir");
  await page.getByRole("button", { name: /Consultar mi rutina/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Fuerza base/i })).toBeVisible();
  await expect(page.getByText(/versión 2/)).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: /Sentadilla/i })).toBeVisible();
  // Tres capas: lo indicado por el profe, lo que sugiere REPI con el historial de Ana y la última vez.
  await expect(page.locator(".kq-legend")).toHaveText(/Objetivo del profesor.*Sugerencia de REPI.*Última vez/);
  const squat = page.locator(".kq-ex", { has: page.getByRole("heading", { name: /Sentadilla/ }) });
  await expect(squat.locator(".kq-cell.coach").first()).toContainText("rep.");
  await expect(squat.locator(".kq-cell.repi").first()).toContainText(/\d kg/);
  await expect(squat.locator(".kq-cell.last").first()).toContainText(/\d kg × \d/);
  await page.getByRole("tab", { name: /Día 2/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Press de banca/i })).toBeVisible();
  await page.getByRole("tab", { name: /Día 2/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Día 3/ })).toHaveAttribute("aria-selected", "true");
  // Consultar no cambia nada: ni campos ni botones para editar, y ningún pedido que escriba.
  await expect(page.locator("input, textarea, select")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /editar|guardar|registrar/i })).toHaveCount(0);
  await expect(page.getByText(/consultar tu rutina y registrar lo que hiciste\. El programa lo cambia sólo el equipo de sala/)).toBeVisible();
  expect(writes).toEqual([]);
  await expectAccessible(page, info, "rutinas-programa");
  await expectNoHorizontalOverflow(page, "rutinas-programa");
  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByText("Listo, buen entrenamiento")).toBeVisible();
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  // La consulta quedó cerrada en el servidor: el token ya no sirve.
  expect(token).not.toBe("");
  const secret = await page.evaluate(() => localStorage.getItem("repi-routine-kiosk"));
  const again = await page.request.get("/api/kiosk/program", { headers: { "x-repi-kiosk": secret!, "x-repi-kiosk-session": token } });
  expect(again.status()).toBe(401);
  expect(again.headers()["cache-control"]).toContain("no-store");
  // El token nunca se guarda en el equipo.
  expect(await page.evaluate((t) => JSON.stringify({ ...localStorage }).includes(t) || JSON.stringify({ ...sessionStorage }).includes(t), token)).toBe(false);
  // La consulta no deja entradas en el historial: volver atrás sale de la pantalla y no muestra a la persona anterior.
  await page.goBack().catch(() => {});
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Ana registra: profesor → REPI → real, confirma con valores editados, sale y al volver sigue con sus series; corrige una", async ({ page }, info) => {
  const errors = watchErrors(page);
  const [ana] = await openDemo(page);
  await enter(page, ana);
  await startDay(page, /Día 1 · Piernas/);
  await openExercise(page, /Sentadilla/);
  await expect(page.locator(".kq-strip")).toHaveText(/Profesor.*REPI.*Real/);
  await expect(row(page, 0).locator(".kq-cell.coach")).toContainText("rep.");
  await expect(row(page, 0).locator(".kq-cell.repi")).toContainText(/\d kg/);
  // Lo precargado es un borrador hasta que se toca o se confirma.
  await expect(row(page, 0).locator(".kq-tag.draft")).toHaveText("Sugerido");
  await expect(row(page, 0)).toHaveClass(/draft/);
  const w1 = stepper(page, "Peso de la serie 1, en kilos");
  const before = Number((await value(w1))!.replace(",", "."));
  expect(before).toBeGreaterThan(20);
  await w1.getByRole("button", { name: "Más" }).click();
  await expect(row(page, 0)).not.toHaveClass(/draft/);
  const after = (await value(w1))!;
  expect(Number(after.replace(",", "."))).toBe(before + 2.5);
  const r1 = stepper(page, "Repeticiones de la serie 1");
  const reps = Number(await value(r1));
  await r1.getByRole("button", { name: "Menos" }).click();
  await expect(r1.locator(".kq-val b")).toHaveText(String(reps - 1));
  await page.getByRole("group", { name: /RIR de la serie 1/ }).getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: /Copiar «Serie 1» a las otras 3/ }).click();
  await expect(stepper(page, "Peso de la serie 4, en kilos").locator(".kq-val b")).toHaveText(after);
  await expectAccessible(page, info, "rutinas-registrar");
  await expectNoHorizontalOverflow(page, "rutinas-registrar");
  // Nada se guardó todavía.
  await expect(page.getByText("Nada se guarda hasta que confirmes.")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar ejercicio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado ✓ 4 series de Sentadilla" })).toBeVisible();
  const item = page.locator(".kq-wlist").getByRole("button", { name: /Sentadilla/ });
  await expect(item).toContainText("4/4 series");
  await expectAccessible(page, info, "rutinas-lista");
  await expectNoHorizontalOverflow(page, "rutinas-lista");
  // Sale sin terminar: el entrenamiento queda abierto y la pantalla, libre.
  await page.getByRole("button", { name: "Salir y seguir después" }).click();
  await expect(page.getByRole("heading", { name: "Tu entrenamiento queda abierto" })).toBeVisible();
  await expect(page.getByText(/seguí en esta pantalla o en la app/)).toBeVisible();
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Empezar" })).toBeVisible({ timeout: 15_000 });
  // Vuelve con código y PIN: sigue el mismo entrenamiento con las mismas series.
  await enter(page, ana);
  const resume = page.getByRole("button", { name: /Seguir mi entrenamiento/ });
  await expect(resume).toContainText("Día 1 · Piernas · 4 series registradas");
  await resume.click();
  await expect(page.getByRole("heading", { level: 1, name: /Día 1 · Piernas/ })).toBeVisible();
  await openExercise(page, /Sentadilla/);
  await expect(page.locator(".kq-set .kq-tag.ok")).toHaveCount(4);
  await expect(row(page, 0).locator(".kq-saved")).toContainText(`${after} kg × ${reps - 1} rep. · RIR 2`);
  await expect(page.getByRole("button", { name: "Confirmar ejercicio" })).toHaveCount(0);
  // Corregir una serie guardada: la misma serie (id y revisión), no una nueva.
  await row(page, 3).getByRole("button", { name: "Corregir" }).click();
  await stepper(page, "Repeticiones de la serie 4").getByRole("button", { name: "Menos" }).click();
  await page.getByRole("button", { name: "Confirmar ejercicio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado ✓ 1 serie de Sentadilla" })).toBeVisible();
  await expect(item).toContainText("4/4 series");
  await page.getByRole("button", { name: "Inicio" }).click();
  await expect(page.getByRole("button", { name: /Seguir mi entrenamiento/ })).toContainText("4 series registradas");
  expect(errors).toEqual([]);
});

test("Martín sin historial: «Sin referencia suficiente», peso vacío que hay que elegir, y termina el entrenamiento", async ({ page }, info) => {
  const errors = watchErrors(page);
  const [, martin] = await openDemo(page);
  await enter(page, martin);
  await page.getByRole("button", { name: /Consultar mi rutina/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Hipertrofia/i })).toBeVisible();
  await expect(page.locator(".kq-cell.repi").first()).toHaveText(/Sin referencia suficiente/);
  await expect(page.locator(".kq-cell.repi", { hasText: /\d kg/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Volver" }).click();
  await startDay(page, /Torso/);
  await openExercise(page, /Jalón al pecho/);
  await expect(row(page, 0).locator(".kq-cell.repi")).toHaveText(/Sin referencia suficiente/);
  const w1 = stepper(page, "Peso de la serie 1, en kilos");
  await expect(w1.locator(".kq-val b")).toHaveText("—");
  // Sin peso elegido no se puede confirmar (nunca se inventa una carga).
  await page.getByRole("button", { name: "Confirmar ejercicio" }).click();
  await expect(page.locator(".kq-save")).toHaveText(/Falta el peso de «Serie 1»/);
  // Escribe el peso con el teclado numérico y lo copia a las otras series.
  await w1.getByRole("button", { name: /Tocá para escribirlo/ }).click();
  const pad = page.getByRole("dialog", { name: /Peso de la serie 1/ });
  for (const d of ["4", "2"]) await pad.getByRole("button", { name: d, exact: true }).click();
  await pad.getByRole("button", { name: "Coma decimal" }).click();
  await pad.getByRole("button", { name: "5", exact: true }).click();
  await pad.getByRole("button", { name: "Listo" }).click();
  await expect(w1.locator(".kq-val b")).toHaveText("42,5");
  await page.getByRole("button", { name: /Copiar «Serie 1» a las otras 2/ }).click();
  await page.getByRole("button", { name: "Confirmar ejercicio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado ✓ 3 series de Jalón al pecho" })).toBeVisible();
  // Terminar: confirma en la pantalla y queda libre.
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  const dlg = page.getByRole("alertdialog", { name: "¿Terminar el entrenamiento?" });
  await expect(dlg).toContainText("3 series registradas");
  await expectAccessible(page, info, "rutinas-terminar");
  await dlg.getByRole("button", { name: "Sí, terminar" }).click();
  await expect(page.getByRole("heading", { name: "Entrenamiento terminado" })).toBeVisible();
  await expect(page.getByText(/Guardamos 3 series de Torso/)).toBeVisible();
  await expect(page.getByText("Hola, Martín")).toHaveCount(0);
  // Al volver ya no hay entrenamiento abierto: se registra de nuevo desde el día.
  await expect(page.getByRole("button", { name: "Empezar" })).toBeVisible({ timeout: 15_000 });
  await enter(page, martin);
  await expect(page.getByRole("button", { name: /Registrar mi entrenamiento/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("un corte de red al confirmar no pierde el borrador y «Reintentar» guarda una sola vez", async ({ page }) => {
  const [ana] = await openDemo(page);
  await enter(page, ana);
  await startDay(page, /Día 1 · Piernas/);
  await openExercise(page, /Peso muerto rumano/);
  const w1 = stepper(page, "Peso de la serie 1, en kilos");
  await w1.getByRole("button", { name: "Más" }).click();
  const kg = (await value(w1))!;
  const ids: string[][] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/kiosk/workout/sets")) ids.push((JSON.parse(r.postData() ?? "{}").sets ?? []).map((s: { id: string }) => s.id)); });
  await page.route("**/api/kiosk/workout/sets", (route) => route.abort("internetdisconnected"), { times: 1 });
  await page.getByRole("button", { name: "Confirmar ejercicio" }).click();
  await expect(page.locator(".kq-save")).toHaveText("No se guardó. Revisá la conexión y tocá Reintentar.");
  await expect(w1.locator(".kq-val b")).toHaveText(kg);
  await expect(page.locator(".kq-set .kq-tag.ok")).toHaveCount(0);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado ✓ 3 series de Peso muerto rumano" })).toBeVisible();
  // Mismos ids en el reintento: el servidor no duplica.
  expect(ids).toHaveLength(2);
  expect(ids[1]).toEqual(ids[0]);
  await expect(page.locator(".kq-wlist").getByRole("button", { name: /Peso muerto rumano/ })).toContainText("3/3 series");
  // La cinta (actividad por tiempo) se registra con su duración y sus valores.
  await openExercise(page, /Cinta/);
  const time = stepper(page, "Tiempo de la serie 1, en minutos y segundos");
  await expect(time.locator(".kq-val b")).toHaveText(/^\d+:\d\d$/);
  await time.getByRole("button", { name: "Más" }).click();
  await page.getByRole("button", { name: "Confirmar ejercicio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado ✓ 1 serie de Cinta" })).toBeVisible();
  await page.getByRole("button", { name: "Inicio" }).click();
  await expect(page.getByRole("button", { name: /Seguir mi entrenamiento/ })).toContainText("4 series registradas");
});

test("socio sin programa recibe un mensaje claro; PIN incorrecto no revela si el código existe", async ({ page }) => {
  const [ana, , sofia] = await openDemo(page);
  await enter(page, sofia);
  await expect(page.getByRole("heading", { name: "Todavía no tenés programa" })).toBeVisible();
  await expect(page.getByText(/Pedíselo al equipo de sala/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Registrar/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Terminar" }).click();
  await enter(page, { code: ana.code, pin: ana.pin === "0000" ? "1111" : "0000" });
  const a = await page.locator(".kq-err").textContent();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await enter(page, { code: "000001", pin: "1234" });
  const b = await page.locator(".kq-err").textContent();
  expect(a).toBe(b);
  expect(a).toMatch(/Código o PIN incorrectos/);
});

test("inactividad: avisa a los 15 s, un toque sigue, y al cerrarse borra todo lo que no se confirmó", async ({ page }, info) => {
  await page.clock.install();
  const [ana] = await openDemo(page);
  await enter(page, ana);
  await expect(page.getByText("Hola, Ana P.")).toBeVisible();
  await startDay(page, /Día 1 · Piernas/);
  await openExercise(page, /Sentadilla/);
  await stepper(page, "Peso de la serie 1, en kilos").getByRole("button", { name: "Más" }).click();
  await page.clock.fastForward(46_000);
  const warn = page.getByRole("alertdialog", { name: "¿Seguís ahí?" });
  await expect(warn).toBeVisible();
  await expect(warn).toContainText(/Se cierra en \d+ s/);
  await expect(warn.getByRole("button", { name: "Seguir" })).toBeFocused();
  await expectAccessible(page, info, "rutinas-inactividad");
  await warn.getByRole("button", { name: "Seguir" }).click();
  await expect(warn).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /Sentadilla/ })).toBeVisible();
  await page.clock.fastForward(50_000);
  await expect(warn).toBeVisible();
  await page.clock.fastForward(12_000);
  await expect(page.getByText("Se cerró por inactividad. Lo que no confirmaste no se guardó.")).toBeVisible();
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  await expect(page.locator(".kq-set")).toHaveCount(0);
  // Al volver, el entrenamiento sigue abierto pero sin lo que no se confirmó: la fila vuelve a ser un borrador.
  await enter(page, ana);
  await expect(page.getByRole("button", { name: /Seguir mi entrenamiento/ })).toContainText("0 series registradas");
  await page.getByRole("button", { name: /Seguir mi entrenamiento/ }).click();
  await openExercise(page, /Sentadilla/);
  await expect(row(page, 0)).toHaveClass(/draft/);
});

test("teclado físico: números, borrar y Enter", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "monitor con teclado");
  const [, martin] = await openDemo(page);
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.keyboard.type(martin.code);
  await page.keyboard.type(martin.pin + "9");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Hola, Martín G." })).toBeVisible();
  await expect(page.getByText(/Hipertrofia/)).toBeVisible();
});

test("sin autorizar: explica cómo registrar la pantalla y no expone nada", async ({ page }) => {
  await page.goto("/rutinas");
  await page.evaluate(() => localStorage.removeItem("repi-routine-kiosk"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pantalla de rutinas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Empezar" })).toHaveCount(0);
  const r = await page.request.get("/api/kiosk/hello", { headers: { "x-repi-kiosk": "x".repeat(43) } });
  expect(r.status()).toBe(401);
});
