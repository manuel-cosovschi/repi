import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D189: reporte del titular (04/11/2026). Una persona del equipo (o Admin) que pide ser socia de un gimnasio no queda
// encerrada en «Tu solicitud llegó a la sede»: entra a sus espacios y la solicitud aparece en el selector como pendiente.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("equipo con solicitud de socio pendiente: ve sus espacios, la solicitud y vuelve desde su estado", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "owner");
  const org = new URL(page.url()).pathname.split("/")[2];
  const links = await (await page.request.get(`/api/gym/${org}/join-links`)).json() as { location: { id: string } }[];
  const reg = await page.request.post(`/api/gym/${org}/join-links/${links[0].location.id}/regenerate`, { data: {} });
  expect(reg.status(), await reg.text()).toBe(200);
  const { slug } = await reg.json() as { slug: string };
  const req = await page.request.post(`/api/join/${slug}`, { data: { terms: true } });
  expect(req.status(), await req.text()).toBe(200);

  // Desde el inicio (lo que abre el ícono): selector de espacios, no la pantalla de espera.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "¿A dónde querés entrar?" })).toBeVisible();
  const pending = page.getByRole("button", { name: /falta la aprobación de la sede/ });
  await expect(pending).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  // El espacio del gimnasio sigue disponible.
  await expect(page.getByRole("button", { name: /Dueño/ }).first()).toBeVisible();

  // Estado de la solicitud y regreso a los espacios.
  await pending.click();
  await expect(page.getByRole("heading", { name: "Tu solicitud llegó a la sede" })).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis espacios" }).click();
  await expect(page.getByRole("heading", { name: "¿A dónde querés entrar?" })).toBeVisible();
  await page.getByRole("button", { name: /Dueño/ }).first().click();
  await page.waitForURL(new RegExp(`/gym/${org}`));
  expect(errors).toEqual([]);
});
