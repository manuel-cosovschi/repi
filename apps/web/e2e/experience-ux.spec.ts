import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D195 · Experience Intelligence & UX 2.0 en el navegador real (Chromium emulado), contra la build local y `repi_dev`, dentro
// de la demo (datos ficticios is_demo). Teléfono (Pixel 7) y escritorio.
//   · Sesión: ayuda de primera vez, lista de ejercicios, «Salir un momento» y volver desde otra pestaña.
//   · Historial: corregir una serie, anularla y restaurarla, anular y restaurar el entrenamiento; el servidor lo confirma.
//   · Coach: vista previa de sólo lectura «Ver cómo lo verá…».
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Hx = { status: string; revision: number; exercises: { rows: { setIndex: number; log: { id: string; reps: number | null; voidedAt: string | null; corrected: boolean } | null }[] }[]; corrections: { action: string }[] };
const hx = async (page: Page, id: string) => { const r = await page.request.get(`/api/me/history/${id}`); expect(r.status()).toBe(200); return (await r.json()) as Hx; };
const firstLog = (h: Hx) => h.exercises.flatMap((e) => e.rows).find((r) => r.log)!.log!;

test("alumno: sesión con lista de ejercicios, salir un momento y volver; historial corregible y reversible", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();

  // Ayuda de primera vez: se cierra con un toque.
  const help = page.getByRole("note", { name: "Cómo registrar" });
  if (await help.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await help.getByRole("button", { name: "Entendido" }).click();
    await expect(help).toHaveCount(0);
  }
  await expect(page.getByRole("region", { name: /^Objetivo de serie 1$/ }).getByText("Real (hoy)")).toBeVisible();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  const sid = (await expect.poll(async () => (await (await page.request.get("/api/me/training")).json()).openSession ?? null, { timeout: 15_000 }).not.toBeNull()
    .then(async () => (await (await page.request.get("/api/me/training")).json()).openSession)) as string;
  await expect.poll(async () => (await (await page.request.get(`/api/me/sessions/${sid}`)).json()).exercises[0].logs.length, { timeout: 15_000 }).toBe(1);

  // Lista de ejercicios.
  await page.getByRole("button", { name: /^Ver los \d+ ejercicios$/ }).click();
  const list = page.getByRole("dialog", { name: "Ejercicios de hoy" });
  await expect(list).toBeVisible();
  await expect(list.getByText("En curso").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "lista de ejercicios");
  await list.getByRole("button", { name: "Cerrar" }).click();

  // Salir un momento: el entrenamiento sigue y se vuelve desde otra pestaña.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Seguís entrenando?" }).getByRole("button", { name: /Salir un momento/ }).click();
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Progreso/ }).click();
  const live = page.getByRole("button", { name: /^Entrenamiento en curso/ });
  await expect(live).toBeVisible();
  await expectNoHorizontalOverflow(page, "aviso de entrenamiento en curso");
  await live.click();
  // Vuelve al mismo punto: si el descanso sigue corriendo, se ve el reloj (no se reinició al salir).
  const skipRest = page.getByRole("button", { name: "Saltar descanso" });
  await expect(page.getByRole("button", { name: /^(Completar serie 2|Saltar descanso)$/ }).first()).toBeVisible();
  if (await skipRest.isVisible()) { await expect(page.getByRole("timer")).toBeVisible(); await skipRest.click(); }
  await expect(page.getByRole("button", { name: /^Completar serie 2$/ })).toBeVisible();
  expect((await (await page.request.get(`/api/me/sessions/${sid}`)).json()).status).toBe("in_progress");

  // Terminar y abrir el historial.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/me/sessions/${sid}`)).json()).status, { timeout: 20_000 }).toBe("completed");
  const before = firstLog(await hx(page, sid));
  await page.goto("/app?tab=prog");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Progreso/ }).click();
  await page.getByRole("tab", { name: "Historial" }).click(); // PP1: el historial es una sección de Progreso
  await page.getByRole("button", { name: /Abrir detalle$/ }).first().click();
  const sheet = page.getByRole("dialog").filter({ has: page.getByText("Repeticiones", { exact: true }) }).first();
  await expect(sheet).toBeVisible();
  await expectNoHorizontalOverflow(page, "detalle del historial");
  await expectAccessible(page, info, "history-detail");

  // Corregir las repeticiones de la serie 1 (cambio chico: sin confirmación extra).
  await page.getByRole("button", { name: /^Serie 1\b.*Tocá para corregir$/ }).first().click();
  const edit = page.getByRole("dialog", { name: /^Corregir · Serie 1/ });
  await expect(edit).toBeVisible();
  const next = (before.reps ?? 8) + 1;
  await edit.getByRole("textbox", { name: "Repeticiones" }).fill(String(next));
  await edit.getByRole("textbox", { name: /Motivo del cambio/ }).fill("Conté mal");
  await edit.getByRole("button", { name: "Guardar corrección" }).click();
  await expect.poll(async () => firstLog(await hx(page, sid)).reps, { timeout: 15_000 }).toBe(next);
  expect((await hx(page, sid)).corrections.map((c) => c.action)).toContain("set_edit");
  await expect(page.getByRole("button", { name: /^Serie 1\b.*corregida/ }).first()).toBeVisible();

  // Anular la serie (reversible) y restaurarla.
  await page.getByRole("button", { name: /^Serie 1\b.*Tocá para corregir$/ }).first().click();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("dialog", { name: /^Corregir · Serie 1/ }).getByRole("button", { name: /^Anular serie/ }).click();
  await expect.poll(async () => firstLog(await hx(page, sid)).voidedAt, { timeout: 15_000 }).not.toBeNull();
  await page.getByRole("button", { name: /^Serie 1\b.*anulada/ }).first().click();
  await page.getByRole("dialog", { name: /^Corregir · Serie 1/ }).getByRole("button", { name: "Restaurar serie" }).click();
  await expect.poll(async () => firstLog(await hx(page, sid)).voidedAt, { timeout: 15_000 }).toBeNull();

  // Anular el entrenamiento: explica que es reversible; sale del progreso y se restaura.
  await page.getByRole("button", { name: "Eliminar entrenamiento" }).click();
  const ask = page.getByRole("dialog", { name: "¿Eliminar este entrenamiento?" });
  await expect(ask.getByText(/No se borra: lo podés restaurar/)).toBeVisible();
  await ask.getByRole("button", { name: "Eliminar entrenamiento" }).click();
  await expect.poll(async () => (await hx(page, sid)).status, { timeout: 15_000 }).toBe("voided");
  await page.getByRole("button", { name: "Restaurar entrenamiento" }).click();
  await expect.poll(async () => (await hx(page, sid)).status, { timeout: 15_000 }).toBe("completed");
  // Nada se borró: la serie sigue con el valor corregido.
  expect(firstLog(await hx(page, sid)).reps).toBe(next);
  expect(errors).toEqual([]);
});

test("coach: «Ver cómo lo verá» muestra el programa del alumno en sólo lectura", async ({ page }, info) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  await page.goto(href.replace(/\?s=\w+/, "?s=clients"));
  // Un cliente con programa asignado (la demo trae a Martina con «Hipertrofia · 3 días»).
  await page.getByRole("button", { name: /Martina López/ }).first().click();
  const pv = page.getByRole("button", { name: /^Ver cómo lo verá / }).first();
  await expect(pv).toBeVisible({ timeout: 10_000 });
  const before = page.url();
  await pv.click();
  const dlg = page.getByRole("dialog", { name: /^Vista previa del programa de / });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("heading", { name: /^Así lo ve / })).toBeVisible();
  await expect(dlg.getByRole("list", { name: /^Series de / }).first()).toBeVisible();
  await expect(dlg.getByText(/sólo lectura/)).toBeVisible();
  // No hay acciones de registro dentro de la vista previa.
  await expect(dlg.getByRole("button", { name: /Completar|Comenzar|Registrar/ })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "vista previa del coach");
  await expectAccessible(page, info, "coach-preview");
  await dlg.getByRole("button", { name: "Cerrar" }).click();
  expect(page.url()).toBe(before);
  expect(errors).toEqual([]);
});
