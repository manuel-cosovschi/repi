import { expect, test } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors, type DemoRole } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

// Coach, dueño y entrenador de sala: cada sección del menú abre con datos, sin errores, sin scroll lateral y accesible.
for (const role of ["coach", "owner", "floor"] as DemoRole[]) {
  test(`demo ${role}: recorre todas las secciones`, async ({ page }, info) => {
    const errors = watchErrors(page);
    const href = await openDemo(page, role);
    const nav = page.getByRole("navigation", { name: "Principal" }).first();
    // En el teléfono el menú es un panel que se abre con «Abrir menú».
    const menu = page.getByRole("button", { name: "Abrir menú" });
    const openMenu = async () => { if ((await menu.isVisible().catch(() => false)) && (await menu.getAttribute("aria-expanded")) !== "true") await menu.click(); };
    await openMenu();
    await expect(nav).toBeVisible();
    const items = await nav.getByRole("button").all();
    expect(items.length).toBeGreaterThan(1);
    for (const [i, item] of items.entries()) {
      await openMenu();
      const name = ((await item.getAttribute("title")) ?? (await item.innerText())).trim();
      if (name === "Guía") continue;
      await item.click();
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: /error|no se pudo|algo salió mal/i })).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `${role} › ${name}`);
      await expectAccessible(page, info, `${role}-${i}`);
    }
    expect(page.url()).toContain(href.split("?")[0]);
    expect(errors).toEqual([]);
  });
}

test("aislamiento: un alumno no puede leer el espacio de otro coach ni su API", async ({ browser }) => {
  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  const coachHref = await openDemo(coach, "coach");
  const orgId = coachHref.match(/\/coach\/([0-9a-f-]{36})/)?.[1];
  expect(orgId).toBeTruthy();

  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  await openDemo(member, "member");
  for (const p of [`/api/coach/${orgId}/overview`, `/api/coach/${orgId}/messages`, `/api/coach/${orgId}/programs`, `/api/gym/${orgId}/members`]) {
    const r = await member.request.get(p);
    expect([403, 404], p).toContain(r.status());
  }
  const page = await member.goto(`/coach/${orgId}`);
  expect([200, 404]).toContain(page?.status());
  await expect(member.getByText(/Clientes|Alumnos/).first()).toHaveCount(0);
  await coachCtx.close(); await memberCtx.close();
});

test("QR de la sede (D152): en el teléfono lleva directo a pedir el acceso, sin la guía de agregar a inicio antes", async ({ page, browser }, info) => {
  const href = await openDemo(page, "floor");
  const orgId = href.match(/\/gym\/([0-9a-f-]{36})/)?.[1];
  const qr = await (await page.request.get(`/api/gym/${orgId}/join-qr`)).json() as { qrs: { slug: string }[] };
  expect(qr.qrs.length).toBeGreaterThan(0);
  // Otra persona, sin sesión, escanea el QR con su teléfono.
  const socio = await browser.newContext({ ...info.project.use, storageState: undefined });
  const p = await socio.newPage();
  await p.goto(`/unirse/${qr.qrs[0].slug}`);
  await expect(p.getByRole("heading", { level: 1 })).toHaveText(/Pedí tu acceso|todavía no habilitó/);
  await expect(p.getByText("Agregá Repi a tu pantalla de inicio")).toHaveCount(0);
  if (await p.getByRole("button", { name: "Crear mi cuenta" }).isVisible()) {
    await p.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Tus datos");
  }
  await socio.close();
});
