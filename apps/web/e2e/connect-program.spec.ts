import { expect, test } from "@playwright/test";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// Sala (REPI Connect): un pedido «Programa nuevo» se atiende armando el programa desde la misma solicitud, sin pasar por
// Socios, y al guardarlo la solicitud queda completada. Corre sobre la demo de sala (entorno ficticio is_demo).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("sala: «Crear programa» desde la solicitud del socio y la solicitud queda resuelta", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  await page.goto(href.replace("s=shift", "s=queue"));
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  const card = page.locator(".cx-task").filter({ hasText: "Martina" }).filter({ hasText: "Programa nuevo" });
  await card.getByRole("button", { name: "Abrir" }).click();

  const req = page.getByRole("dialog", { name: /· Programa nuevo$/ });
  const ref = (await req.getByRole("heading", { level: 2 }).innerText()).split(" · ")[0];
  await req.getByRole("button", { name: "Crear programa" }).click();

  const ed = page.getByRole("dialog", { name: /Editar programa · Martina/ });
  // La solicitud abierta es la que se completa (Martina tiene además un onboarding y un traspaso de programa).
  await expect(ed.getByRole("checkbox", { name: new RegExp(`Completar ${ref} · Programa nuevo`) })).toBeChecked();
  await expectNoHorizontalOverflow(page);
  await ed.getByRole("button", { name: /^\+ / }).first().click();
  await ed.getByLabel(/Motivo del cambio/).fill("Programa armado desde el pedido");
  await ed.getByRole("button", { name: "Guardar revisión" }).click();

  await expect(page.getByText(new RegExp(`Programa guardado \\(revisión 1\\) y ${ref} completada`)).first()).toBeVisible();
  await expect(ed).toBeHidden();
  await expect(req.getByText("Resuelta", { exact: true })).toBeVisible();
  await expect(req.getByRole("button", { name: /(Crear|Editar) programa/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
