import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D209 · Asistente REPI en la app del alumno (demo guiada: entorno ficticio propio, nunca datos reales). Sin OPENAI_API_KEY
// todo responde por reglas: así corre en CI y en local sin gastar.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const panelOf = (page: Page) => page.getByRole("dialog", { name: "Asistente REPI" });
const ORIGIN = /Dato registrado|Calculado por REPI|Sugerencia con IA|Seguridad/;

async function openPanelFromHome(page: Page) {
  const card = page.locator(".rp-card").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Hablar con REPI" }).first().click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  return panel;
}
async function ask(page: Page, text: string) {
  const panel = panelOf(page);
  const before = await panel.getByRole("article", { name: "Respuesta de REPI" }).count();
  await panel.getByRole("textbox", { name: "Mensaje para REPI" }).fill(text);
  await panel.getByRole("button", { name: "Enviar a REPI" }).click();
  await expect(panel.getByRole("article", { name: "Respuesta de REPI" })).toHaveCount(before + 1, { timeout: 15_000 });
  return panel.getByRole("article", { name: "Respuesta de REPI" }).last();
}

test("REPI en Inicio: la tarjeta se ve, el panel responde con datos y dice de dónde salen", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".rp-card").first()).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflow(page, "inicio con REPI");
  await expectAccessible(page, info, "repi-home");

  const panel = await openPanelFromHome(page);
  const reply = await ask(page, "¿Qué marca hice la última vez en press de banca?");
  await expect(reply).toContainText(/press de banca/i);
  await expect(reply.locator(".rp-origin").first()).toHaveText(ORIGIN);
  // Las respuestas se pueden valorar; el panel no tapa el contenido de forma modal (no hay fondo que bloquee).
  await expect(reply.getByRole("button", { name: "Me sirvió", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "panel de REPI abierto");
  await expectAccessible(page, info, "repi-panel");

  // Cerrar y retomar: la conversación sigue.
  await panel.getByRole("button", { name: "Cerrar el asistente" }).click();
  await expect(panel).toBeHidden();
  await openPanelFromHome(page);
  await expect(panelOf(page).getByText("¿Qué marca hice la última vez en press de banca?")).toBeVisible();
  expect(errors).toEqual([]);
});

test("REPI en el entrenamiento: máquina ocupada llega a la vista previa con confirmación (sin ejecutarla)", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
  // El inicio tiene que llegar al servidor para que REPI conozca la sesión (la referencia la valida el servidor).
  await expect.poll(async () => (await (await page.request.get("/api/me/training")).json()).openSession ?? null, { timeout: 15_000 }).not.toBeNull();

  await page.locator(".dock .wo-tools").getByRole("button", { name: "Preguntale a REPI" }).click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  // El dock (registrar la serie) sigue a la vista y usable con el panel abierto.
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeInViewport();
  await panel.getByRole("button", { name: "Máquina ocupada" }).click();
  await expect(panel.getByRole("article", { name: "Respuesta de REPI" }).last()).toBeVisible({ timeout: 15_000 });
  // «¿Te referís a…?» → «Sí» → alternativas con la acción para confirmar.
  const yes = panel.getByRole("button", { name: /^Sí$/ });
  if (await yes.isVisible({ timeout: 5_000 }).catch(() => false)) await yes.click();
  const proposal = panel.getByRole("region", { name: /^Propuesta:/ }).last();
  await expect(proposal).toBeVisible({ timeout: 15_000 });
  await expect(proposal.getByRole("button", { name: "Confirmar" })).toBeVisible();
  await expect(proposal.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(proposal).toContainText(/sólo por hoy|Tu rutina no cambia|por hoy/i);
  await expectNoHorizontalOverflow(page, "entrenamiento con REPI");
  expect(errors).toEqual([]);
});

test("Perfil → Asistente REPI: las preferencias persisten y «Lo que REPI recuerda» se puede borrar", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());
  await openDemo(page, "member");

  // Una preferencia dicha en el chat se guarda sólo al confirmarla (el texto final es el del servidor).
  await openPanelFromHome(page);
  const reply = await ask(page, "No me gusta el remo con barra");
  const save = reply.getByRole("region", { name: /^Propuesta:/ }).first();
  await expect(save).toBeVisible();
  await save.getByRole("button", { name: "Confirmar" }).click();
  await expect(save.getByRole("status")).toBeVisible({ timeout: 15_000 });
  await panelOf(page).getByRole("button", { name: "Cerrar el asistente" }).click();

  await page.getByRole("button", { name: "Perfil" }).click();
  const prefs = page.getByRole("region", { name: "Asistente REPI" });
  await expect(prefs).toBeVisible();
  const weekly = prefs.getByRole("switch", { name: /Resumen semanal/ });
  const was = await weekly.getAttribute("aria-checked");
  await weekly.click();
  await expect(weekly).toHaveAttribute("aria-checked", was === "true" ? "false" : "true");
  const brief = prefs.getByRole("radio", { name: "Breve" });
  await brief.click();
  await expect(brief).toHaveAttribute("aria-checked", "true");

  // Persisten en el servidor y al volver a abrir.
  const srv = await (await page.request.get("/api/me/brain/prefs")).json();
  expect(srv.prefs.tone).toBe("breve");
  expect(String(srv.prefs.categories.weekly)).toBe(was === "true" ? "false" : "true");
  await page.reload();
  await page.getByRole("button", { name: "Perfil" }).click();
  await expect(page.getByRole("region", { name: "Asistente REPI" }).getByRole("radio", { name: "Breve" })).toHaveAttribute("aria-checked", "true");

  const mem = page.getByRole("list", { name: "Lo que REPI recuerda" });
  await expect(mem).toBeVisible();
  const item = mem.getByRole("listitem").filter({ hasText: /remo/i }).first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: /^Borrar/ }).click();
  await expect(mem.getByRole("listitem").filter({ hasText: /remo/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Sin conexión: REPI lo dice sin alarmar y no bloquea nada", async ({ page, context }) => {
  await openDemo(page, "member");
  const panel = await openPanelFromHome(page);
  await context.setOffline(true);
  await expect(panel.getByRole("status").filter({ hasText: "REPI responde cuando vuelva la conexión" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Enviar a REPI" })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: /error|no se pudo/i })).toHaveCount(0);
  await context.setOffline(false);
  await expect(panel.getByRole("status").filter({ hasText: "REPI responde cuando vuelva la conexión" })).toHaveCount(0);
});
