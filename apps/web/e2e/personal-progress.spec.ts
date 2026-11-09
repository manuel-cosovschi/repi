import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// Personal Progress & Body Tracking 1.0 + Product Updates & Trainer UX (D199–D202), en la app real con demos (servidor
// local, base repi_dev). El servidor tiene que correr con NEXT_PUBLIC_REPI_FEATURES=progress_photos,calories,announcements.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const openProgress = async (page: Page) => {
  await page.getByRole("button", { name: "Progreso", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Progreso", exact: true })).toBeVisible();
};
/** JPEG real (decodificable) generado por el navegador: 900×1200 con un degradé. */
async function realJpeg(page: Page, hue: number) {
  const b64 = await page.evaluate(async (h) => {
    const c = document.createElement("canvas"); c.width = 900; c.height = 1200;
    const g = c.getContext("2d")!; const gr = g.createLinearGradient(0, 0, 900, 1200);
    gr.addColorStop(0, `hsl(${h} 60% 40%)`); gr.addColorStop(1, `hsl(${h + 60} 60% 70%)`); g.fillStyle = gr; g.fillRect(0, 0, 900, 1200);
    const blob = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/jpeg", 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s);
  }, hue);
  return Buffer.from(b64, "base64");
}

test("progreso: secciones, gráfico por ejercicio con dato exacto al tocar y vista de registros", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openProgress(page);
  const tabs = page.getByRole("tablist", { name: "Secciones de Progreso" });
  for (const t of ["Entrenamiento", "Mi cuerpo", "Fotos", "Historial"]) await expect(tabs.getByRole("tab", { name: new RegExp(`^${t}`) })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /Mi cuerpo/ })).toContainText("Nuevo");
  await expect(page.getByRole("heading", { name: "Tu período" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolución por ejercicio" })).toBeVisible();
  const chart = page.locator("figure.pc").first();
  await expect(chart.or(page.getByText(/Cuando registres series|Sin registros/).first())).toBeVisible();
  if (await chart.isVisible()) {
    const pt = chart.locator("[data-pt]").first();
    await pt.click();
    await expect(chart.locator(".pc-tip b")).not.toBeEmpty();
    await page.keyboard.press("ArrowRight");
    await expect(chart.locator(".pc-tip")).toBeVisible();
  } else {
    await expect(page.getByText(/Cuando registres series|Sin registros/).first()).toBeVisible();
  }
  await tabs.getByRole("tab", { name: "Historial" }).click();
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expectAccessible(page, info, "progreso"); await expectNoHorizontalOverflow(page, "progreso");
  expect(errors).toEqual([]);
});

test("mi cuerpo: registrar, mismo día sin duplicar, objetivo y privacidad; otra persona recibe 404", async ({ page, browser }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openProgress(page);
  await page.getByRole("tab", { name: /Mi cuerpo/ }).click();
  await expect(page.getByText(/Privado: sólo lo ves vos/)).toBeVisible();
  await expect(page.getByRole("tab", { name: /Mi cuerpo/ })).not.toContainText("Nuevo"); // abrirla quita «Nuevo»
  await page.getByLabel(/^Peso \(kg\)/).fill("82,4");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Peso guardado.").first()).toBeVisible();
  await page.getByLabel(/^Peso \(kg\)/).fill("82,4");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Esa medición ya estaba guardada.").first()).toBeVisible();
  const body = await (await page.request.get("/api/me/progress/body?range=all")).json() as { entries: { id: string; weightG: number }[] };
  expect(body.entries.filter((e) => e.weightG === 82400)).toHaveLength(1);
  await page.getByRole("button", { name: "Definir objetivo" }).click();
  const dlg = page.getByRole("dialog", { name: "Objetivo de peso" });
  await dlg.getByLabel(/^Objetivo \(kg\)/).fill("78");
  await dlg.getByRole("button", { name: "Guardar objetivo" }).click();
  await expect(page.getByText("Objetivo guardado.").first()).toBeVisible();
  await expect(page.getByText(/Definí un objetivo|recorrido|Llegaste|mantener/).first()).toBeVisible();
  await expect(page.locator("figure.pc [data-pt]").first()).toBeVisible();
  await expectAccessible(page, info, "mi cuerpo"); await expectNoHorizontalOverflow(page, "mi cuerpo");
  // Otra persona (el coach de la demo) no lee ni edita esta medición.
  const other = await browser.newContext();
  const op = await other.newPage();
  await openDemo(op, "coach");
  const id = body.entries.find((e) => e.weightG === 82400)!.id;
  expect((await op.request.post(`/api/me/progress/body/weights/${id}`, { data: { weightG: 60000 } })).status()).toBe(404);
  expect((await op.request.delete(`/api/me/progress/body/weights/${id}`)).status()).toBe(404);
  await other.close();
  expect(errors).toEqual([]);
});

test("fotos: subir, comparar con deslizador por teclado y borrar; el coach y sin sesión no acceden", async ({ page, browser }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await openProgress(page);
  await page.getByRole("tab", { name: /Fotos/ }).click();
  await expect(page.getByText(/Privadas: sólo las ves vos/)).toBeVisible();
  for (const [i, hue] of [[0, 200], [1, 20]] as const) {
    await page.locator('input[type="file"]').setInputFiles({ name: `foto${i}.jpg`, mimeType: "image/jpeg", buffer: await realJpeg(page, hue) });
    const dlg = page.getByRole("dialog", { name: "Nueva foto de progreso" });
    await dlg.getByLabel("Categoría (opcional)").selectOption("front");
    await dlg.getByRole("button", { name: "Guardar foto" }).click();
    await expect(dlg).toHaveCount(0); // se cierra recién cuando el servidor confirmó
    await expect(page.locator("button.pp-photo")).toHaveCount(i + 1);
    await expect(page.getByText("Foto guardada en tu cuenta. Sólo la ves vos.").first()).toBeVisible();
  }
  const list = await (await page.request.get("/api/me/progress/photos")).json() as { photos: { id: string; width: number; height: number }[] };
  expect(list.photos.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(list.photos[0].width, list.photos[0].height)).toBeLessThanOrEqual(2048);
  const file = await page.request.get(`/api/me/photo-file/${list.photos[0].id}`);
  expect(file.status()).toBe(200);
  expect(file.headers()["cache-control"]).toContain("no-store");
  expect(Buffer.from(await file.body()).includes(Buffer.from("Exif"))).toBe(false);

  const tiles = page.locator("button.pp-photo");
  await tiles.nth(0).click(); await tiles.nth(1).click();
  await page.getByRole("button", { name: "Comparar", exact: true }).click();
  const cmp = page.getByRole("dialog", { name: "Comparar fotos" });
  await expect(cmp.locator(".pp-cmp img")).toHaveCount(2);
  await cmp.getByRole("button", { name: "Deslizador" }).click();
  const range = cmp.getByRole("slider");
  await range.focus(); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
  await expect(range).toHaveValue("48");
  await expectAccessible(page, info, "comparador"); await expectNoHorizontalOverflow(page, "comparador");
  await cmp.getByRole("button", { name: "Cerrar" }).click();

  // Otra persona y sin sesión: 404/401, nunca la foto.
  const other = await browser.newContext();
  const op = await other.newPage();
  await openDemo(op, "coach");
  expect((await op.request.get(`/api/me/photo-file/${list.photos[0].id}`)).status()).toBe(404);
  expect((await op.request.delete(`/api/me/progress/photos/${list.photos[0].id}`)).status()).toBe(404);
  await other.close();
  const anon = await browser.newContext();
  // El mismo servidor que la prueba (antes estaba fijo en :3000 y fallaba con otro puerto).
  expect((await anon.request.get(`${new URL(page.url()).origin}/api/me/photo-file/${list.photos[0].id}`)).status()).toBe(401);
  await anon.close();

  await tiles.nth(1).click(); // queda una elegida
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  const v = page.getByRole("dialog").last();
  await v.getByRole("button", { name: "Eliminar foto" }).click();
  await v.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByText("Foto eliminada de tu cuenta.").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("novedad de REPI en la campanita: origen REPI, botón y destino exacto (Progreso › Mi cuerpo); leída no vuelve", async ({ page }, info) => {
  const url = process.env.DATABASE_URL ?? "postgres://repi:repi-local-test@127.0.0.1:5432/repi_dev";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const [{ db }] = await sql<{ db: string }[]>`select current_database() as db`;
  expect(db).toMatch(/^repi_(dev|e2e_[a-z0-9_]+)$/); // sólo la base local de desarrollo o una propia de E2E
  const [a] = await sql<{ id: string }[]>`insert into product_announcement (kind, title, summary, cta_label, destination, audience, status, publish_at)
    values ('feature', 'E2E · ¡Ahora podés seguir tu progreso físico!', 'Registrá tu peso, revisá tus gráficos y compará tus avances desde Progreso.', 'Ver mi progreso', 'member.progress.body', array['member'], 'published', now()) returning id`;
  try {
    const errors = watchErrors(page);
    await openDemo(page, "member");
    await page.getByRole("button", { name: /Notificaciones/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Notificaciones" });
    const item = sheet.getByRole("button", { name: /E2E · ¡Ahora podés seguir tu progreso físico!/ });
    await expect(item).toContainText("REPI");
    await expect(item).toContainText("Ver mi progreso");
    await item.click();
    await expect(page.getByRole("heading", { name: "Progreso", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Mi cuerpo/ })).toHaveAttribute("aria-selected", "true");
    const f = await (await page.request.get("/api/me/notifications")).json() as { items: { id: string; unread: boolean }[] };
    expect(f.items.find((x) => x.id === `ann:${a.id}`)?.unread).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await sql`delete from product_announcement where id = ${a.id}`;
    await sql.end();
  }
});

test("Urko: agregar un reemplazo cierra el panel; con error queda abierto para reintentar; cambiar de día lo cierra", async ({ page }, info) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  await page.goto(href.replace(/\?s=\w+/, "?s=builder"));
  await page.getByRole("button", { name: /Hipertrofia · 3 días/ }).first().click();
  const subsBtn = page.getByRole("button", { name: /^Reemplazos.* de Press de banca$/ }).first();
  await subsBtn.click();
  const panel = page.getByRole("region", { name: "Reemplazos aprobados para Press de banca" });
  await expect(panel).toBeVisible();
  // Error de red: el panel queda abierto, con el error y lo escrito.
  await page.route("**/api/substitutions/**", (r) => (r.request().method() === "POST" ? r.abort("failed") : r.continue()));
  await panel.getByLabel("Indicación para el alumno").fill("si el banco está ocupado");
  const cand = panel.getByRole("button", { name: /^Aprobar / }).first();
  const candName = (await cand.getAttribute("aria-label"))!.replace(/^Aprobar /, "");
  await cand.click();
  await expect(panel.getByRole("alert")).toContainText("Podés reintentar");
  await expect(panel.getByLabel("Indicación para el alumno")).toHaveValue("si el banco está ocupado");
  await page.unroute("**/api/substitutions/**");
  // Reintento: se guarda, se cierra y se confirma; el contador se actualiza.
  await panel.getByRole("button", { name: `Aprobar ${candName}` }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(`${candName} aprobado como reemplazo de Press de banca. Los programas no cambian.`).first()).toBeVisible();
  await expect(subsBtn).toHaveAccessibleName(/^Reemplazos · \d+ de Press de banca$/);
  await expect(subsBtn).toHaveAttribute("aria-expanded", "false");
  // Abierto en un día y cambiar a otro: no queda ningún panel abierto.
  await subsBtn.click();
  await expect(panel).toBeVisible();
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByRole("region", { name: /Reemplazos aprobados para/ })).toHaveCount(0);
  await page.getByRole("tab").nth(0).click();
  await expect(page.getByRole("region", { name: /Reemplazos aprobados para/ })).toHaveCount(0);
  // Limpieza: quitar el reemplazo agregado (no cambia programas).
  await subsBtn.click();
  await panel.getByRole("button", { name: `Quitar ${candName} de los reemplazos` }).click();
  await expect(panel.getByRole("button", { name: `Quitar ${candName} de los reemplazos` })).toHaveCount(0);
  expect(errors.filter((e) => !/net::ERR_FAILED|Failed to fetch/.test(e))).toEqual([]);
});

test("edad desconocida (D203): Mi cuerpo pide confirmar la fecha una vez; entrenar no se bloquea; adulta habilita", async ({ page }, info) => {
  const url = process.env.DATABASE_URL ?? "postgres://repi:repi-local-test@127.0.0.1:5432/repi_dev";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const [{ db }] = await sql<{ db: string }[]>`select current_database() as db`;
  expect(db).toMatch(/^repi_(dev|e2e_[a-z0-9_]+)$/); // sólo la base local de desarrollo o una propia de E2E, sobre la persona ficticia de esta demo
  try {
    const errors = watchErrors(page);
    await openDemo(page, "member");
    const [u] = await sql<{ id: string }[]>`update "user" set birth_date = null where id = (select id from "user" where email like 'valentina.gomez@%' order by created_at desc limit 1) returning id`;
    await openProgress(page);
    await expect(page.getByRole("heading", { name: "Tu período" })).toBeVisible(); // Progreso general sigue
    await page.getByRole("tab", { name: /Mi cuerpo/ }).click();
    const gate = page.getByRole("region", { name: "Confirmá tu fecha de nacimiento" });
    await expect(gate).toBeVisible();
    expect((await page.request.post("/api/me/progress/body/weights", { data: { day: "2026-11-01", weightG: 80000 } })).status()).toBe(403);
    await expect(gate.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await gate.getByLabel("Fecha de nacimiento").fill("1992-03-04");
    await gate.getByRole("checkbox").check();
    await expectAccessible(page, info, "confirmar edad");
    await gate.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("heading", { name: "Registrar peso" })).toBeVisible();
    expect((await page.request.post("/api/me/birth-date", { data: { birth: "2012-01-01" } })).status()).toBe(409); // no se reemplaza
    const [after] = await sql<{ b: string }[]>`select birth_date as b from "user" where id = ${u.id}`;
    expect(after.b).toBe("1992-03-04");
    expect(errors.filter((e) => !/ 403 | 409 /.test(e))).toEqual([]);
  } finally { await sql.end(); }
});
