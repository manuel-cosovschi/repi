import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// Ejercicios por tiempo (pedido del titular, 07/11/2026) en el navegador real, contra la build local y `repi_dev`, siempre dentro
// de la demo (organizaciones is_demo, se borran a las 6 h). Teléfono (Pixel 7) y escritorio.
//   · Coach: en el constructor, «Cinta caminadora» encuentra «Cinta (caminata)» y la fila muestra SÓLO duración (min), velocidad
//     (km/h) e inclinación (un número, sin «%»): sin series, repeticiones, RIR, descanso ni «Series y técnica». 10 / 5 / 3 queda
//     guardado en el programa de Valentina y se ve igual en su ficha y en «Ver cómo lo verá».
//   · Alumno: ve exactamente esos parámetros al entrenar, registra lo que hizo (12 min · 5,5 km/h · incl. 4) sin peso, reps ni
//     RIR, y lo ve en el resumen y en el historial.
//   · Ficha del coach: la sesión del alumno se lee con duración y valores reales, nunca «kg × s».
//   · Sala: el editor del programa de un socio agrega la cinta con los mismos tres campos y la guarda.
//   · Mis rutinas: una rutina propia con la cinta.
//   · Sin conexión: una actividad registrada sin red sobrevive a recargar y llega una sola vez al servidor con sus valores.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const CINTA = "Cinta (caminata)";
const orgOf = (href: string) => href.split("/")[2].split("?")[0];
const shot = async (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}-${test.info().project.name}.png`), fullPage: false });

/** La base local de desarrollo (nunca otra): la siembra de la ficha del coach sólo toca organizaciones demo. */
function devDb() {
  let url = process.env.DATABASE_URL ?? "";
  if (!url) {
    try {
      const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
      url = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.trim() ?? "";
    } catch { /* sin .env.local */ }
  }
  const u = new URL(url || "postgres://invalid/none");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.pathname !== "/repi_dev") throw new Error("La siembra de E2E sólo corre contra repi_dev local.");
  return postgres(url, { max: 1, onnotice: () => {} });
}

/**
 * Una sesión completada de Valentina (en la demo del coach) con la cinta registrada como la registra el teléfono: segundos en
 * `reps` y velocidad e inclinación en `metrics`. Las demos de coach y de alumno son entornos separados; así la ficha del coach
 * muestra exactamente lo que registró el alumno en la otra prueba (12 min · 5,5 km/h · incl. 4).
 */
async function seedTreadmillSession(relId: string) {
  const sql = devDb();
  try {
    const [a] = await sql<{ id: string; user_id: string; v: string; demo: boolean }[]>`
      select a.id, cc.user_id, p.current_version_id as v, o.is_demo as demo from program_assignment a join program p on p.id = a.program_id
      join coach_client cc on cc.id = a.coach_client_id join organization o on o.id = cc.coach_org_id where a.coach_client_id = ${relId} and a.status = 'active'`;
    if (!a?.demo) throw new Error("No es una demo: no se siembra nada.");
    const [pe] = await sql<{ id: string; exercise_id: string; day_id: string; day_name: string }[]>`
      select pe.id, pe.exercise_id, d.id as day_id, d.name as day_name from program_exercise pe join program_day d on d.id = pe.day_id
      where d.version_id = ${a.v} and pe.detail -> 'activity' ->> 'profile' = 'treadmill' order by d.position, pe.position limit 1`;
    if (!pe) throw new Error("El programa de la demo no tiene la cinta.");
    await sql`update program_version set locked = true where id = ${a.v}`;
    const start = new Date(Date.now() - 60 * 60_000), end = new Date(start.getTime() + 40 * 60_000), sid = randomUUID();
    await sql`insert into workout_session (id, user_id, coach_client_id, assignment_id, version_id, day_id, day_name, status, started_at, active_ms, ended_at, revision, updated_at)
      values (${sid}, ${a.user_id}, ${relId}, ${a.id}, ${a.v}, ${pe.day_id}, ${pe.day_name}, 'completed', ${start}, ${38 * 60_000}, ${end}, 2, ${end})`;
    await sql`insert into set_log (id, session_id, program_exercise_id, exercise_id, set_index, weight_kg, reps, rir, feel, metrics, completed_at, revision, updated_at)
      values (${randomUUID()}, ${sid}, ${pe.id}, ${pe.exercise_id}, 0, null, 720, null, 'bien', ${sql.json({ speedKmh: 5.5, incline: 4 })}, ${new Date(start.getTime() + 13 * 60_000)}, 1, ${end})`;
    return pe.day_name;
  } finally { await sql.end(); }
}

/** Alumno (demo): abre «Entrenar», elige el día con la cinta y empieza. */
async function startLegDay(page: Page) {
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  await page.getByRole("tab", { name: /: Piernas/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Piernas" }).getByText("10 min · 5 km/h · incl. 3")).toBeVisible();
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  const help = page.getByRole("note", { name: "Cómo registrar" });
  if (await help.isVisible({ timeout: 2_000 }).catch(() => false)) await help.getByRole("button", { name: "Entendido" }).click();
  await expect(page.getByRole("button", { name: "Completar actividad" })).toBeVisible();
}

/** Escribe un valor de la actividad en el entrenamiento: toca el número, escribe y confirma con Enter. */
async function typeValue(page: Page, label: string, value: string) {
  const fields = page.getByRole("group", { name: "Lo que hiciste" });
  await fields.getByRole("button", { name: new RegExp(`^${label.replace(/[()]/g, "\\$&")}: .*Tocá para escribir$`) }).click();
  const input = fields.getByRole("textbox", { name: label, exact: true });
  await input.fill(value);
  await input.press("Enter");
}

const openId = async (page: Page) => ((await (await page.request.get("/api/me/training")).json()).openSession ?? null) as string | null;
type Sess = { status: string; exercises: { name: string; logs: { setIndex: number; weightKg: number | null; reps: number | null; rir: number | null; metrics?: Record<string, number> | null }[] }[] };
const sess = async (page: Page, id: string) => (await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess;

test("coach: «Cinta caminadora» se configura sólo con duración, velocidad e inclinación y queda en el programa de Valentina", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = orgOf(href);
  const ov = await (await page.request.get(`/api/coach/${org}/overview`)).json() as { clients: { id: string; name: string }[] };
  const vale = ov.clients.find((c) => /Valentina/.test(c.name))!;
  const det = await (await page.request.get(`/api/coach/${org}/clients/${vale.id}`)).json() as { program: { programId: string; version: number } };
  await page.goto(`/coach/${org}?s=builder&p=${det.program.programId}`);
  await expect(page.getByRole("tab", { name: "Torso A" })).toBeVisible();

  // La búsqueda entiende el sinónimo: «cinta caminadora» encuentra la caminata y no la cinta de trote.
  await page.getByRole("textbox", { name: "Buscar ejercicio" }).fill("cinta caminadora");
  await expect(page.getByRole("button", { name: `Agregar ${CINTA}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar Cinta (trote)" })).toHaveCount(0);
  await page.getByRole("button", { name: `Agregar ${CINTA}` }).click();

  const row = page.locator(".exrow.is-activity").filter({ hasText: CINTA });
  await expect(row).toHaveCount(1);
  const dur = row.getByRole("textbox", { name: `Duración en minutos de ${CINTA}` });
  const speed = row.getByRole("textbox", { name: `Velocidad en km/h de ${CINTA}` });
  const incl = row.getByRole("textbox", { name: `Inclinación de ${CINTA}` });
  await expect(dur).toHaveValue("10");
  await expect(speed).toHaveValue("5");
  await expect(incl).toHaveValue("0");
  // Sólo esos tres campos: ni series, repeticiones, RIR, descanso ni «Series y técnica».
  await expect(row.getByRole("textbox")).toHaveCount(3);
  for (const n of ["Series de", "Repeticiones de", "RIR de", "Descanso de"]) await expect(page.getByRole("textbox", { name: `${n} ${CINTA}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Series y técnica de ${CINTA}` })).toHaveCount(0);
  await expect(row).not.toContainText("%");
  // Un valor fuera de rango no se guarda y explica por qué.
  await incl.fill("45");
  await incl.blur();
  await expect(row.getByRole("alert")).toContainText("La inclinación es un número de -5 a 40 (sin %).");
  await expect(incl).toHaveValue("0");
  await incl.fill("3");
  await incl.blur();
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/Guardado|Versión \d+ guardada/).first()).toBeVisible({ timeout: 15_000 });
  await row.scrollIntoViewIfNeeded();
  await shot(page, "coach-builder-row");
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "constructor con la cinta");

  // Lo guardado: un bloque de 10 minutos, sin RIR ni descanso, con la actividad en el detalle.
  type Doc = { doc: { days: { name: string; exercises: { name: string; sets: number; reps: string; rir: number | null; restSec: number; detail?: { activity?: Record<string, unknown> } | null }[] }[] } };
  const saved = await expect.poll(async () => {
    const d = await (await page.request.get(`/api/coach/${org}/programs/${det.program.programId}`)).json() as Doc;
    return d.doc.days[0].exercises.find((e) => e.name === CINTA) ?? null;
  }, { timeout: 15_000 }).toMatchObject({ sets: 1, reps: "10 min", rir: null, restSec: 0, detail: { activity: { profile: "treadmill", speedKmh: 5, incline: 3 } } })
    .then(async () => ((await (await page.request.get(`/api/coach/${org}/programs/${det.program.programId}`)).json()) as Doc).doc.days[0].exercises.find((e) => e.name === CINTA)!);
  expect(saved.detail?.activity).toEqual({ profile: "treadmill", speedKmh: 5, incline: 3 });

  // La ficha de Valentina (programa asignado) y la vista previa del alumno muestran lo mismo que verá al entrenar.
  await page.goto(`/coach/${org}?s=clients&c=${vale.id}`);
  await page.getByRole("tab", { name: "Rutinas" }).click();
  await expect(page.getByText(`${CINTA} 10 min · 5 km/h · incl. 3`).first()).toBeVisible();
  await page.getByRole("button", { name: /Ver cómo lo verá Valentina/ }).click();
  const prev = page.getByRole("dialog").filter({ has: page.getByRole("list", { name: `Indicación de ${CINTA}` }) });
  await expect(prev.getByRole("list", { name: `Indicación de ${CINTA}` }).first()).toContainText("10 min · 5 km/h · incl. 3");
  expect(errors).toEqual([]);
});

test("alumno: ve exactamente lo indicado, registra lo que hizo sin peso ni RIR y lo ve en el resumen y el historial", async ({ page }) => {
  const errors = watchErrors(page);
  await startLegDay(page);
  // Lo indicado por el profe, tal cual: duración, velocidad e inclinación (sin «%»), sin kilos, reps, RIR ni discos.
  await expect(page.locator(".excard-top")).toContainText(CINTA);
  await expect(page.locator(".excard-top")).toContainText("10 min · 5 km/h · incl. 3");
  const guide = page.getByRole("region", { name: /^Objetivo de serie 1$/ });
  await expect(guide.getByText("Tu profe indicó")).toBeVisible();
  await expect(guide).toContainText("10 min · 5 km/h · incl. 3");
  await expect(page.getByRole("button", { name: /Tocá para escribir el peso/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menos repeticiones" })).toHaveCount(0);
  await expect(page.getByText(/Reps en reserva/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Discos y entrada en calor" })).toHaveCount(0);
  const fields = page.getByRole("group", { name: "Lo que hiciste" });
  await expect(fields.getByRole("button", { name: "Duración (min): 10. Tocá para escribir" })).toBeVisible();
  await expect(fields.getByRole("button", { name: "Velocidad (km/h): 5. Tocá para escribir" })).toBeVisible();
  await expect(fields.getByRole("button", { name: "Inclinación: 3. Tocá para escribir" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Cronómetro de la actividad" })).toBeVisible();
  await expect(page.locator(".excard")).not.toContainText("%");
  await shot(page, "member-workout-card");
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "tarjeta de la cinta");

  // Lo que hizo de verdad: 12 min a 5,5 km/h con inclinación 4.
  await typeValue(page, "Duración (min)", "12");
  await typeValue(page, "Velocidad (km/h)", "5,5");
  await typeValue(page, "Inclinación", "4");
  await expect(fields.getByRole("button", { name: "Duración (min): 12. Tocá para escribir" })).toBeVisible();
  await expect(fields.getByRole("button", { name: "Velocidad (km/h): 5,5. Tocá para escribir" })).toBeVisible();
  await expect(fields.getByRole("button", { name: "Inclinación: 4. Tocá para escribir" })).toBeVisible();
  await page.getByRole("button", { name: "Completar actividad" }).click();
  const id = (await expect.poll(() => openId(page), { timeout: 15_000 }).not.toBeNull().then(() => openId(page)))!;
  await expect.poll(async () => (await sess(page, id)).exercises[0].logs.length, { timeout: 15_000 }).toBe(1);
  const log = (await sess(page, id)).exercises[0].logs[0];
  expect(log).toMatchObject({ setIndex: 0, reps: 720, rir: null });
  expect(log.weightKg ?? 0).toBe(0);
  expect(log.metrics).toEqual({ speedKmh: 5.5, incline: 4 });
  await expect(page.getByText(`${CINTA} completo · 12 min · 5,5 km/h · incl. 4`)).toBeVisible();

  // Terminar (el resto del día queda sin hacer) y ver el resumen con los valores reales.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect.poll(async () => (await sess(page, id)).status, { timeout: 20_000 }).toBe("completed");
  const sumRow = page.locator(".sumrow").filter({ hasText: CINTA });
  await expect(sumRow).toContainText("12 min · 5,5 km/h · incl. 4");
  await expect(page.locator(".sumrow").filter({ hasText: CINTA })).not.toContainText("kg");

  // Historial: la fila de la cinta con duración y valores (no «720 s»).
  await page.goto("/app?tab=prog");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Progreso/ }).click();
  await page.getByRole("tab", { name: "Historial" }).click();
  await page.getByRole("button", { name: /Abrir detalle$/ }).first().click();
  const sets = page.getByRole("list", { name: `Series de ${CINTA}` });
  await expect(sets).toContainText("12 min · 5,5 km/h · incl. 4");
  await expect(sets).not.toContainText("720 s");
  await sets.scrollIntoViewIfNeeded();
  await shot(page, "member-history");
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "historial con la cinta");
  // Corregir la actividad desde el historial: duración y valores, sin peso ni RIR.
  await sets.getByRole("button").first().click();
  const edit = page.getByRole("dialog", { name: /^Corregir · Serie 1/ });
  await expect(edit.getByRole("textbox", { name: "Duración (min)" })).toHaveValue("12");
  await expect(edit.getByRole("textbox", { name: "Velocidad (km/h)" })).toHaveValue("5,5");
  await expect(edit.getByRole("textbox", { name: "Inclinación" })).toHaveValue("4");
  await expect(edit.getByRole("textbox", { name: /Peso/ })).toHaveCount(0);
  await expect(edit.getByText(/Reps en reserva/)).toHaveCount(0);
  await edit.getByRole("textbox", { name: "Inclinación" }).fill("5");
  await edit.getByRole("textbox", { name: /Motivo del cambio/ }).fill("Era inclinación 5");
  await edit.getByRole("button", { name: "Guardar corrección" }).click();
  await expect.poll(async () => {
    const h = await (await page.request.get(`/api/me/history/${id}`)).json() as { exercises: { rows: { log: { reps: number | null; metrics?: Record<string, number> | null } | null }[] }[] };
    return h.exercises[0].rows[0].log?.metrics ?? null;
  }, { timeout: 15_000 }).toEqual({ speedKmh: 5.5, incline: 5 });
  await expect(sets).toContainText("12 min · 5,5 km/h · incl. 5");
  expect(errors).toEqual([]);
});

test("ficha del coach: la cinta registrada por el alumno se lee con duración y valores reales", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = orgOf(href);
  const ov = await (await page.request.get(`/api/coach/${org}/overview`)).json() as { clients: { id: string; name: string }[] };
  const vale = ov.clients.find((c) => /Valentina/.test(c.name))!;
  const dayName = await seedTreadmillSession(vale.id);
  await page.goto(`/coach/${org}?s=clients&c=${vale.id}`);
  const log = page.locator(".slog").filter({ hasText: dayName }).first();
  await expect(log.locator(".slog-item").filter({ hasText: CINTA })).toContainText("12 min · 5,5 km/h · incl. 4");
  await expect(log.locator(".slog-item").filter({ hasText: CINTA })).not.toContainText("kg");
  expect(errors).toEqual([]);
});

test("sala: el editor del programa de un socio agrega la cinta con duración, velocidad e inclinación y la guarda", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  const org = orgOf(href);
  const c = await (await page.request.get(`/api/gym/${org}/context`)).json() as { locations: { id: string }[] };
  const loc = c.locations[0].id;
  const mem = await (await page.request.get(`/api/gym/${org}/members?loc=${loc}`)).json() as { members: { id: string; name: string }[] };
  const vale = mem.members.find((x) => /Valentina/.test(x.name))!;
  await page.goto(`/gym/${org}?s=members&sel=${vale.id}&loc=${loc}`);
  // La ficha lee la cinta como se indicó (sin series × repeticiones ni RIR).
  await expect(page.getByText("10 min · 5 km/h · incl. 3").first()).toBeVisible();
  await page.getByRole("button", { name: "Editar programa" }).click();
  const modal = page.getByRole("dialog", { name: /Editar programa · Valentina/ });
  // La cinta que ya estaba: sólo sus tres campos con lo indicado.
  const old = modal.locator(".exrow.is-activity").filter({ hasText: CINTA });
  await expect(old.getByRole("textbox")).toHaveCount(3);
  await expect(old.getByRole("textbox", { name: `Inclinación de ${CINTA}` })).toHaveValue("3");
  await modal.getByRole("button", { name: `Quitar ${CINTA}` }).click();
  await expect(modal.locator(".exrow.is-activity")).toHaveCount(0);

  // Agregarla otra vez desde la biblioteca con el nombre de todos los días: entra como cinta (antes, como 3 × 10-12 · RIR 2).
  await modal.getByRole("textbox", { name: "Buscar ejercicio" }).fill("cinta caminadora");
  await expect(modal.getByRole("button", { name: "+ Cinta (trote)" })).toHaveCount(0);
  await modal.getByRole("button", { name: `+ ${CINTA}` }).click();
  const row = modal.locator(".exrow.is-activity").filter({ hasText: CINTA });
  await expect(row.getByRole("textbox")).toHaveCount(3);
  await expect(row.getByRole("textbox", { name: `Duración en minutos de ${CINTA}` })).toHaveValue("10");
  await expect(row.getByRole("textbox", { name: `Velocidad en km/h de ${CINTA}` })).toHaveValue("5");
  await expect(row.getByRole("textbox", { name: `Inclinación de ${CINTA}` })).toHaveValue("0");
  for (const n of ["Series de", "Repeticiones de", "RIR de", "Descanso de"]) await expect(modal.getByRole("textbox", { name: `${n} ${CINTA}` })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: `Series y técnica de ${CINTA}` })).toHaveCount(0);
  await row.getByRole("textbox", { name: `Duración en minutos de ${CINTA}` }).fill("15");
  await row.getByRole("textbox", { name: `Velocidad en km/h de ${CINTA}` }).fill("6");
  await row.getByRole("textbox", { name: `Inclinación de ${CINTA}` }).fill("2");
  await row.getByRole("textbox", { name: `Inclinación de ${CINTA}` }).blur();
  await row.scrollIntoViewIfNeeded();
  await shot(page, "gym-editor-row");
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "editor de sala con la cinta");
  const reason = modal.getByRole("textbox", { name: /Motivo del cambio/ });
  if (await reason.isVisible().catch(() => false)) await reason.fill("Entrada en calor en cinta");
  await modal.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText(/Programa guardado/).first()).toBeVisible();
  const d = await (await page.request.get(`/api/gym/${org}/members/${vale.id}`)).json() as { program: { doc: { days: { exercises: { name: string; sets: number; reps: string; rir: number | null; restSec: number; detail?: { activity?: unknown } | null }[] }[] } } };
  const cinta = d.program.doc.days[0].exercises.find((e) => e.name === CINTA);
  expect(cinta).toMatchObject({ sets: 1, reps: "15 min", rir: null, restSec: 0 });
  expect(cinta?.detail?.activity).toEqual({ profile: "treadmill", speedKmh: 6, incline: 2 });
  await expect(page.getByText("15 min · 6 km/h · incl. 2").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Mis rutinas: una rutina propia con la cinta (duración, velocidad e inclinación)", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await sheet.getByRole("textbox", { name: "Nombre" }).first().fill("Caminata en cinta");
  await sheet.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("cinta caminadora");
  // El sinónimo encuentra la cinta de la biblioteca: no hace falta crear un ejercicio propio repetido.
  await sheet.locator(".or-results button").filter({ hasText: CINTA }).first().click();
  const grp = sheet.getByRole("group", { name: `Cinta · ${CINTA}` });
  await expect(grp.getByRole("textbox", { name: `Duración en minutos de ${CINTA}` })).toHaveValue("10");
  await expect(grp.getByRole("textbox", { name: `Velocidad en km/h de ${CINTA}` })).toHaveValue("5");
  await expect(grp.getByRole("textbox", { name: `Inclinación de ${CINTA}` })).toHaveValue("0");
  await expect(sheet.getByRole("textbox", { name: `Series de ${CINTA}` })).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: new RegExp(`^Peso de ${CINTA.replace(/[()]/g, "\\$&")}`) })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: `Series y técnica de ${CINTA}` })).toHaveCount(0);
  await grp.getByRole("textbox", { name: `Inclinación de ${CINTA}` }).fill("3");
  await grp.getByRole("textbox", { name: `Inclinación de ${CINTA}` }).blur();
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "rutina propia con la cinta");
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  await expect(sheet).toHaveCount(0);
  const card = mine.locator(".or-card").filter({ hasText: "Caminata en cinta" });
  await expect(card.getByText("10 min · 5 km/h · incl. 3")).toBeVisible();
  const saved = (await (await page.request.get("/api/me/routines")).json()) as { name: string; exercises: { sets: number; reps: string; weightKg: number | null; detail?: { activity?: unknown } | null }[] }[];
  const ex = saved.find((r) => r.name === "Caminata en cinta")!.exercises[0];
  expect(ex).toMatchObject({ sets: 1, reps: "10 min", weightKg: null });
  expect(ex.detail?.activity).toEqual({ profile: "treadmill", speedKmh: 5, incline: 3 });
  expect(errors).toEqual([]);
});

test("sin conexión: la cinta registrada sin red sobrevive a recargar y llega una sola vez con sus valores", async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await startLegDay(page);
  const id = (await expect.poll(() => openId(page), { timeout: 15_000 }).not.toBeNull().then(() => openId(page)))!;
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await page.getByRole("button", { name: /^Continuar / }).first().click();
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  // La carcasa (HTML de /app, estáticos y la marca) termina de guardarse en el service worker antes de cortar la red: el
  // logo del encabezado se pide al recargar sin conexión.
  await expect.poll(() => page.evaluate(async () => !!(await caches.match("/brand/wm_full.png"))), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1_500);

  await context.setOffline(true);
  await typeValue(page, "Duración (min)", "15");
  await typeValue(page, "Velocidad (km/h)", "6");
  await typeValue(page, "Inclinación", "2");
  await page.getByRole("button", { name: "Completar actividad" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sin conexión|Pendiente/ }).first()).toBeVisible();
  expect((await sess(page, id)).exercises[0].logs).toHaveLength(0);

  // Recargar SIN conexión: la actividad sigue en el teléfono con su duración y sus valores.
  await page.reload();
  await page.getByRole("button", { name: /^Continuar / }).first().click();
  // Al volver, el entrenamiento sigue en el próximo ejercicio pendiente: se vuelve a la cinta para ver su serie.
  await expect(page.locator(".excard-top")).toBeVisible();
  for (let i = 0; i < 6 && !(await page.locator(".excard-top strong").first().innerText()).includes(CINTA); i++) await page.getByRole("button", { name: "Ejercicio anterior" }).click();
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem").first()).toHaveAccessibleName(/^Serie 1: 15 min, 6 km\/h · incl\. 2, completada/);

  await context.setOffline(false);
  await expect.poll(async () => (await sess(page, id)).exercises[0].logs.map((l) => [l.setIndex, l.reps, l.metrics]), { timeout: 30_000 })
    .toEqual([[0, 900, { speedKmh: 6, incline: 2 }]]);
  await page.reload();
  await page.getByRole("button", { name: /^Continuar / }).first().click();
  await page.waitForTimeout(3_000);
  expect((await sess(page, id)).exercises[0].logs.length).toBe(1);
  expect(errors.filter((e) => !/Failed to fetch|NetworkError|net::ERR_INTERNET_DISCONNECTED|Load failed/i.test(e))).toEqual([]);
});
