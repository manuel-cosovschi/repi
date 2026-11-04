import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D188 (bloque 03/06): tema global Claro / Oscuro / Automático. La preferencia es de la cuenta (no del rol), se aplica
// antes de pintar, persiste, se sincroniza entre dispositivos, funciona sin conexión y no reinicia el entrenamiento.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const html = (page: Page) => page.locator("html");
const theme = (page: Page) => html(page).getAttribute("data-theme");
const remote = async (page: Page) => (await (await page.request.get("/api/me/settings")).json()) as { uid: string; theme: string; themeChangedAt: number | null };
const local = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("repi:theme") ?? "null") as { pref: string; pending: boolean; uid: string | null } | null);
const picker = (page: Page) => page.getByRole("group", { name: "Apariencia" });
const pick = (page: Page, name: "Claro" | "Oscuro" | "Automático") => picker(page).getByRole("radio", { name: new RegExp(`^${name}`) }).check();
const pageBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT_BG = "rgb(244, 241, 234)";
const DARK_BG = "rgb(11, 15, 20)";

async function openProfile(page: Page) {
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await picker(page).scrollIntoViewIfNeeded();
  await expect(picker(page)).toBeVisible();
}

test("preferencia: Claro, Oscuro y Automático se aplican al instante, se guardan en la cuenta y persisten al recargar", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page, "member");
  // Usuario existente sin elección: Automático (sigue al dispositivo).
  expect((await remote(page)).theme).toBe("system");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await openProfile(page);
  const url = page.url();

  await pick(page, "Oscuro");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  expect(await pageBg(page)).toBe(DARK_BG);
  await expect(picker(page).getByRole("status")).toHaveText(/Guardado en tu cuenta/);
  expect((await remote(page)).theme).toBe("dark");
  expect(page.url()).toBe(url); // sin recargar ni navegar

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await openProfile(page);
  await pick(page, "Claro");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  expect(await pageBg(page)).toBe(LIGHT_BG);
  await expect.poll(async () => (await remote(page)).theme).toBe("light");

  await pick(page, "Automático");
  await expect(html(page)).toHaveAttribute("data-theme-pref", "system");
  await expect.poll(async () => (await remote(page)).theme).toBe("system");
  expect(errors).toEqual([]);
});

test("sistema operativo: Automático acompaña los cambios en vivo; Claro y Oscuro no cambian con el sistema", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openDemo(page, "member");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  // Automático sigue guardado como «system» (no se convierte en claro u oscuro).
  expect((await local(page))?.pref ?? "system").toBe("system");

  await openProfile(page);
  await pick(page, "Claro");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  expect(await theme(page)).toBe("light");
  await pick(page, "Oscuro");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  expect(await theme(page)).toBe("dark");
  // La barra del navegador sigue al tema efectivo.
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#0B0F14");
});

test("primer render: el tema correcto está antes de hidratar, sin errores de hidratación y en rutas internas recargadas", async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page, "member");
  const r = await page.request.post("/api/me/settings", { data: { theme: "dark", themeChangedAt: Date.now() } });
  expect(r.status()).toBe(200);
  await page.evaluate(() => localStorage.setItem("repi:theme", JSON.stringify({ pref: "dark", at: Date.now(), pending: false, uid: null })));
  // Registro de lo que había al terminar de leer el HTML (antes de que React hidrate y ejecute efectos).
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __boot: unknown }).__boot = { theme: document.documentElement.getAttribute("data-theme"), bg: getComputedStyle(document.body).backgroundColor };
    }, { once: true });
  });
  await page.reload();
  const boot = await page.evaluate(() => (window as unknown as { __boot: { theme: string; bg: string } }).__boot);
  expect(boot).toEqual({ theme: "dark", bg: DARK_BG });
  // El script de arranque está en <head> (corre antes de pintar el <body>).
  const inHead = await page.evaluate(() => [...document.head.querySelectorAll("script")].some((x) => x.textContent?.includes("repi:theme")));
  expect(inHead).toBe(true);
  expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([]);
  expect(errors).toEqual([]);
});

test("misma cuenta en todos sus espacios y en otro dispositivo: se elige una vez", async ({ page, browser }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page, "coach");
  // Coach: selector compacto en la barra lateral (escritorio) o en el menú.
  const side = page.locator(".co-side");
  // En móvil la barra lateral es un cajón (fuera de pantalla hasta abrir el menú).
  const menu = page.getByRole("button", { name: "Abrir menú" });
  if (await menu.isVisible()) await menu.click();
  await side.getByRole("group", { name: "Apariencia" }).getByRole("radio", { name: /^Oscuro/ }).check();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect.poll(async () => (await remote(page)).theme).toBe("dark");

  // Mi cuenta (otro espacio): ya está oscuro y marcado.
  const back = page.url();
  await page.goto("/cuenta");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(picker(page).getByRole("radio", { name: /^Oscuro/ })).toBeChecked();
  await page.goto(back);
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  // Otro dispositivo: misma sesión (cookies), sin copia local. Toma la de la cuenta al abrir.
  const cookies = await page.context().cookies();
  const other: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  await other.addCookies(cookies);
  const p2 = await other.newPage();
  await p2.goto(back);
  await expect(html(p2)).toHaveAttribute("data-theme", "dark");
  // Cambio en el otro dispositivo: el primero lo toma al volver a abrir.
  await p2.locator(".co-side").getByRole("group", { name: "Apariencia" }).getByRole("radio", { name: /^Claro/ }).check().catch(async () => {
    await p2.request.post("/api/me/settings", { data: { theme: "light", themeChangedAt: Date.now() } });
  });
  await expect.poll(async () => (await remote(p2)).theme).toBe("light");
  await other.close();
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
});

test("sin conexión: se cambia igual, queda pendiente en el teléfono y se sincroniza al volver; un cambio más nuevo de otro dispositivo gana", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page, "member");
  await openProfile(page);
  await context.setOffline(true);
  await pick(page, "Oscuro");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(picker(page).getByRole("status")).toHaveText(/Guardado en este dispositivo/);
  expect(await local(page)).toMatchObject({ pref: "dark", pending: true });
  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event("online")));
  await expect.poll(async () => (await remote(page)).theme, { timeout: 10_000 }).toBe("dark");
  await expect.poll(async () => (await local(page))?.pending).toBe(false);

  // Conflicto: este dispositivo eligió Claro sin conexión hace 10 min; otro eligió Automático después. Gana el más nuevo.
  await page.request.post("/api/me/settings", { data: { theme: "system", themeChangedAt: Date.now() } });
  const me = (await remote(page)).uid;
  await page.evaluate((uid) => localStorage.setItem("repi:theme", JSON.stringify({ pref: "light", at: Date.now() - 600_000, pending: true, uid })), me);
  await page.reload();
  await expect.poll(async () => (await local(page))?.pref).toBe("system");
  expect((await remote(page)).theme).toBe("system");
});

test("cerrar sesión y entrar con otra cuenta: prevalece la de la cuenta nueva; nada pendiente pasa de una cuenta a otra", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page, "member");
  await openProfile(page);
  await pick(page, "Oscuro");
  await expect.poll(async () => (await remote(page)).theme).toBe("dark");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL(/\/acceso/);
  // Se conserva el aspecto (sin destello) pero sin dueño ni cambio pendiente.
  expect(await local(page)).toMatchObject({ pref: "dark", pending: false, uid: null });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  // Otra cuenta (otra demo): su preferencia es Automático → claro con este dispositivo.
  await openDemo(page, "member");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  expect((await remote(page)).theme).toBe("system");
});

test("seguridad: sin sesión no se lee ni se escribe; no acepta identificadores ni valores fuera de la lista", async ({ page, playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/me/settings")).status()).toBe(401);
  expect((await anon.post("/api/me/settings", { data: { theme: "dark" } })).status()).toBe(401);
  await anon.dispose();
  await openDemo(page, "member");
  const victim = "otra-cuenta";
  expect((await page.request.post("/api/me/settings", { data: { theme: "dark", userId: victim } })).status()).toBe(400);
  expect((await page.request.post("/api/me/settings", { data: { theme: "neon" } })).status()).toBe(400);
  expect((await remote(page)).theme).toBe("system");
});

test("entrenamiento activo: cambiar el tema no reinicia el descanso, no pierde la serie ni el peso y la sesión se recupera", async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 4_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  await page.getByRole("button", { name: /Tocá para escribir el peso/ }).click();
  await page.getByRole("textbox", { name: /Peso en/ }).fill("37,5");
  await page.getByRole("textbox", { name: /Peso en/ }).press("Enter");
  await page.getByRole("button", { name: "Completar serie 1" }).click();
  const timer = page.getByRole("timer");
  await expect(timer).toBeVisible();
  const secs = async () => { const [m, s] = (await timer.innerText()).split(":").map(Number); return m * 60 + s; };
  const before = await secs();

  // Cambio de tema desde otra pestaña (Mi cuenta) y por el sistema, con el descanso corriendo.
  const tab = await context.newPage();
  await tab.goto("/cuenta");
  await tab.getByRole("group", { name: "Apariencia" }).getByRole("radio", { name: /^Oscuro/ }).check();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await tab.close();
  const after = await secs();
  expect(after).toBeLessThanOrEqual(before);
  expect(before - after).toBeLessThan(15); // siguió contando, no volvió a empezar
  await expect(page.getByRole("button", { name: "Saltar descanso" })).toBeVisible();

  await page.getByRole("button", { name: "Saltar descanso" }).click();
  await expect(page.getByRole("button", { name: "Completar serie 2" })).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  const sid = (await (await page.request.get("/api/me/training")).json()).openSession as string;
  await expect.poll(async () => (await (await page.request.get(`/api/me/sessions/${sid}`)).json()).exercises[0].logs.length, { timeout: 15_000 }).toBe(1);
  // Recuperar la sesión: sigue en la serie 2 con la 1 guardada una vez.
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /Continuar entrenamiento/ }).first().click();
  await expect(page.getByRole("button", { name: "Completar serie 2" })).toBeVisible();
  const s = await (await page.request.get(`/api/me/sessions/${sid}`)).json();
  expect(s.exercises[0].logs).toHaveLength(1);
  expect(s.exercises[0].logs[0].weightKg).toBe(37.5);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/me/sessions/${sid}`)).json()).status, { timeout: 20_000 }).toBe("completed");
  expect(errors).toEqual([]);
});
