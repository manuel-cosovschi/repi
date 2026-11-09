import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, watchErrors } from "./helpers";

// REPI Control (D213): pantalla de consulta de rutinas con la demo «control» (Gimnasio Atlas ficticio, is_demo). Bienvenida →
// código y PIN → programa → terminar; errores, cierre por inactividad, consulta cortada del lado del servidor y no-store.
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

test("socio con programa: ve sus días y ejercicios, sin editar, y termina dejando la pantalla libre", async ({ page }, info) => {
  const errors = watchErrors(page);
  const [ana] = await openDemo(page);
  await expectAccessible(page, info, "rutinas-bienvenida");
  let token = "";
  page.on("request", (r) => { const t = r.headers()["x-repi-kiosk-session"]; if (t) token = t; });
  await enter(page, ana);
  await expect(page.getByText("Hola, Ana P.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Fuerza base/i })).toBeVisible();
  await expect(page.getByText(/versión 2/)).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: /Sentadilla/i })).toBeVisible();
  await page.getByRole("tab", { name: /Día 2/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Press de banca/i })).toBeVisible();
  await page.getByRole("tab", { name: /Día 2/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Día 3/ })).toHaveAttribute("aria-selected", "true");
  // Sólo consulta: no hay campos ni botones para cambiar el programa.
  await expect(page.locator("input, textarea, select")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /editar|guardar|registrar/i })).toHaveCount(0);
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
  // La consulta no deja entradas en el historial: volver atrás sale de la pantalla y no muestra a la persona anterior.
  await page.goBack().catch(() => {});
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("socio sin programa recibe un mensaje claro; PIN incorrecto no revela si el código existe", async ({ page }) => {
  const [ana, , sofia] = await openDemo(page);
  await enter(page, sofia);
  await expect(page.getByRole("heading", { name: "Todavía no tenés programa" })).toBeVisible();
  await expect(page.getByText(/Pedíselo al equipo de sala/)).toBeVisible();
  await page.getByRole("button", { name: "Terminar" }).click();
  await enter(page, { code: ana.code, pin: ana.pin === "0000" ? "1111" : "0000" });
  const a = await page.locator(".kq-err").textContent();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await enter(page, { code: "000001", pin: "1234" });
  const b = await page.locator(".kq-err").textContent();
  expect(a).toBe(b);
  expect(a).toMatch(/Código o PIN incorrectos/);
});

test("se cierra sola por inactividad y vuelve a la bienvenida", async ({ page }) => {
  await page.clock.install();
  const [ana] = await openDemo(page);
  await enter(page, ana);
  await expect(page.getByText("Hola, Ana P.")).toBeVisible();
  await page.clock.fastForward(50_000);
  await expect(page.getByText(/Se cierra en \d+ s/)).toBeVisible();
  await page.clock.fastForward(12_000);
  await expect(page.getByText("La consulta se cerró por inactividad.")).toBeVisible();
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
});

test("teclado físico: números, borrar y Enter", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "monitor con teclado");
  const [, martin] = await openDemo(page);
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.keyboard.type(martin.code);
  await page.keyboard.type(martin.pin + "9");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Hola, Martín G.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Hipertrofia/i })).toBeVisible();
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
