import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo } from "./helpers";

// La guía de la demo vive sólo dentro de las apps (/app, /coach, /gym). Pedido del titular (07/11): al salir de la demo a
// /conoce, /demo o al inicio, la píldora «Demo · Guía · Otro perfil» quedaba flotando abajo.
test.beforeEach(({ baseURL }) => assertLocalTarget(baseURL));

test("la guía de la demo aparece en la app y no en /conoce ni en /demo", async ({ page }) => {
  const href = await openDemo(page, "floor");
  const pill = page.locator(".dt-pill");
  const card = page.locator(".dt-card");
  await expect(pill).toBeVisible(); // en la app de sala, con la guía cerrada, queda la píldora para volver a abrirla

  for (const path of ["/conoce", "/demo"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(pill, `píldora en ${path}`).toHaveCount(0);
    await expect(card, `tarjeta en ${path}`).toHaveCount(0);
  }

  // «Otro perfil» (navegación del cliente) lleva a /demo: la píldora no debe seguir encima del selector.
  await page.goto(href);
  await expect(pill).toBeVisible();
  await pill.getByRole("link", { name: "Otro perfil" }).click();
  await page.waitForURL(/\/demo$/);
  await page.waitForLoadState("networkidle");
  await expect(pill).toHaveCount(0);

  // Con la guía abierta tampoco.
  await page.goto(href);
  await pill.getByRole("button", { name: "Guía", exact: true }).click();
  await expect(card).toBeVisible();
  await page.goto("/conoce");
  await page.waitForLoadState("networkidle");
  await expect(card).toHaveCount(0);

  // Y al volver a la app, la guía sigue donde estaba.
  await page.goto(href);
  await expect(card.or(pill).first()).toBeVisible();
});
