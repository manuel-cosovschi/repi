import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// FSA1 · lo que la pantalla dice contra lo que pasó en el servidor (Chromium emulado, demo is_demo). Con el pedido forzado a
// fallar (500) no aparece un «guardado», el diálogo no se cierra y el error se anuncia; con el pedido bien, un doble toque
// manda un solo pedido, el diálogo se cierra y el cambio sigue después de recargar. También teclado: Esc cierra y el foco
// vuelve al botón que abrió el diálogo.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const menu = async (page: Page, title: string) => {
  await expect(page.locator(".co-nav button").first()).toBeAttached();
  const m = page.getByRole("button", { name: "Abrir menú" });
  if (test.info().project.name === "mobile") { await expect(m).toBeVisible(); await m.click(); }
  await page.locator(`.co-nav button[title="${title}"]`).click();
};
const fail500 = { status: 500, contentType: "application/json", body: JSON.stringify({ error: "Falla forzada por la prueba." }) };

test("coach · agenda: un 500 no se muestra como agendado; doble toque = un pedido; persiste; Esc devuelve el foco", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "coach");
  await menu(page, "Agenda");
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
  const opener = page.getByRole("button", { name: "Agendar" }).last();
  await opener.click();
  const dlg = page.getByRole("dialog", { name: "Nueva sesión" });
  await expect(dlg).toBeVisible();
  // Esc cierra y el foco vuelve a «Agendar».
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await dlg.getByLabel("Hora").fill("21:35");
  await dlg.getByLabel("Nota (opcional)").fill("FSA1 sesión de prueba");
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/agenda$/.test(new URL(r.url()).pathname)) posts.push(r.url()); });
  await page.route(/\/api\/coach\/[^/]+\/agenda$/, (r) => (r.request().method() === "POST" ? r.fulfill(fail500) : r.continue()));
  await dlg.getByRole("button", { name: "Agendar" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Falla forzada");
  await expect(dlg).toBeVisible();
  await expect(page.getByText(/Sesión agendada/)).toHaveCount(0);
  await page.unroute(/\/api\/coach\/[^/]+\/agenda$/);

  posts.length = 0;
  await dlg.getByRole("button", { name: "Agendar" }).dblclick();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText(/Sesión agendada/).first()).toBeVisible();
  expect(posts.length, "doble toque: un solo pedido").toBe(1);
  await page.reload();
  await expect(page.getByText("21:35").first()).toBeVisible();
  expect(errors.filter((e) => !e.includes("500") && !/status of 500/.test(e))).toEqual([]);
});

test("gimnasio · vigencia de la membresía: un 500 no se muestra como guardado y el valor no se pierde; bien, persiste", async ({ page }) => {
  await openDemo(page, "owner");
  await menu(page, "Accesos y QR");
  const date = page.getByLabel(/^Vigente hasta · /).first();
  await expect(date).toBeVisible();
  const who = ((await date.getAttribute("aria-label")) ?? "").replace("Vigente hasta · ", "");
  const row = date.locator("xpath=..");
  await date.fill("2027-03-15");
  await page.route(/\/accesses\/[^/]+\/until$/, (r) => r.fulfill(fail500));
  await row.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Falla forzada por la prueba.").first()).toBeVisible();
  await expect(page.getByText(new RegExp(`Vigencia de ${who} hasta`))).toHaveCount(0);
  await expect(date).toHaveValue("2027-03-15");
  await expect(row.getByRole("button", { name: "Guardar" })).toBeVisible(); // sigue pendiente
  await page.unroute(/\/accesses\/[^/]+\/until$/);
  await row.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(new RegExp(`Vigencia de ${who} hasta`)).first()).toBeVisible();
  await page.reload();
  await menu(page, "Accesos y QR");
  await expect(page.getByLabel(`Vigente hasta · ${who}`)).toHaveValue("2027-03-15");
});

test("Mi cuenta · apariencia: si el servidor falla no dice «Guardado en tu cuenta»", async ({ page }) => {
  await openDemo(page, "member");
  await page.goto("/cuenta");
  const group = page.getByRole("group", { name: "Apariencia" });
  await expect(group).toBeVisible();
  await page.route("**/api/me/settings", (r) => (r.request().method() === "POST" ? r.fulfill(fail500) : r.continue()));
  await group.getByRole("radio", { name: /^Oscuro/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // se aplica en el dispositivo
  await expect(page.getByText("Guardado en tu cuenta")).toHaveCount(0);
  await expect(group.getByText(/Guardado en este dispositivo|No pudimos|Falla forzada/).first()).toBeVisible();
});

test("alumno · «Ahora no» a una reseña: si el servidor falla no dice «no te volveremos a preguntar»", async ({ page }) => {
  // La demo no trae invitaciones a reseñar: se agrega una a la respuesta real de la bandeja (sólo en el navegador).
  const invite = { id: "00000000-0000-4000-8000-0000000000aa", trainer: "Lucas Medina", kind: "Rutina", place: "Gym Norte · Palermo" };
  await page.route("**/api/me/inbox", async (r) => {
    const res = await r.fetch();
    const body = await res.json();
    await r.fulfill({ response: res, json: { ...body, reviewInvites: [invite] } });
  });
  await page.route(`**/api/me/gym/reviews/${invite.id}/dismiss`, (r) => r.fulfill(fail500));
  await openDemo(page, "member");
  const banner = page.locator(".hbanner", { hasText: "¿Cómo te atendió Lucas?" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Ahora no" }).click();
  await expect(page.getByText("Falla forzada por la prueba.").first()).toBeVisible();
  await expect(page.getByText(/no te volveremos a preguntar/)).toHaveCount(0);
  await expect(banner).toBeVisible(); // sigue pendiente: se puede volver a intentar
});
