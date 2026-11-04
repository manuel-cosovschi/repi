import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D192 · Flujo del entrenador (pedido de Urko) en el navegador real, contra la build local y `repi_dev`, siempre dentro de la
// demo (organizaciones is_demo, se borran a las 6 h). Teléfono (Pixel 7) y escritorio.
//   · Editor rápido: pirámide con la tabla editable, distribución de cargas con vista previa, deshacer, kg/lb y teclado.
//   · Top set + Load Set: elegir Load Set como tipo, cargar su peso y guardarlo.
//   · Tipos propios: crear, usar, renombrar (el plan conserva su nombre) y quitar.
//   · Copiar un día de Valentina al programa de Martina, sin pesos; el historial de Martina no cambia.
//   · Sala: copiar un día del programa de un socio y pegarlo en el borrador de otro; se guarda como revisión.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
const orgOf = (href: string) => href.split("/")[2].split("?")[0];
const shot = async (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}-${test.info().project.name}.png`), fullPage: false });

async function openBench(page: Page) {
  const href = await openDemo(page, "coach");
  await page.goto(href.replace(/\?s=\w+/, "?s=builder"));
  await page.getByRole("button", { name: /Hipertrofia · 3 días/ }).first().click();
  await page.getByRole("button", { name: "Series y técnica de Press de banca" }).first().click();
  const dlg = page.getByRole("dialog", { name: /Series y técnica · Press de banca/ });
  await expect(dlg).toBeVisible();
  return { dlg, org: orgOf(href) };
}

test("editor rápido: pirámide, distribución de cargas con vista previa, deshacer, lb y teclado", async ({ page }) => {
  const errors = watchErrors(page);
  const { dlg } = await openBench(page);
  await dlg.getByRole("button", { name: "Pirámide", exact: true }).click();
  // Todas las series a la vista, editables en el mismo paso.
  const pv = dlg.getByRole("table", { name: /Vista previa de Pirámide/ });
  await expect(pv.getByRole("textbox", { name: /^Repeticiones de Serie/ })).toHaveCount(4);
  await expect(pv.getByRole("textbox", { name: "Repeticiones de Serie 1" })).toHaveValue("12");
  await expect(pv.getByRole("textbox", { name: "Repeticiones de Serie 4" })).toHaveValue("6");
  await dlg.getByRole("button", { name: "Distribuir cargas" }).click();
  const dist = dlg.getByRole("group", { name: "Distribuir cargas" });
  await dist.getByRole("textbox", { name: "Desde (kg)" }).fill("40");
  await dist.getByRole("textbox", { name: "Cada serie (kg)" }).fill("5");
  await expect(dist.getByRole("status")).toContainText("S1: 40 kg → S2: 45 kg → S3: 50 kg → S4: 55 kg");
  await shot(page, "pyramid-distribute");
  await dist.getByRole("button", { name: "Usar estas cargas" }).click();
  await expect(pv.getByRole("textbox", { name: "Peso de Serie 3 (kg)" })).toHaveValue("50");
  // Ajuste directo de una serie antes de aplicar.
  await pv.getByRole("textbox", { name: "Repeticiones de Serie 4" }).fill("5");
  await expect(dlg.getByRole("status").last()).toContainText("Serie 4: repeticiones 6 → 5.");
  await expect(dlg.getByRole("status").last()).toContainText("Serie 2: peso — → 45 kg.");
  await dlg.getByRole("button", { name: "Aplicar" }).click();
  const tbl = dlg.getByRole("table", { name: /Series de Press de banca/ });
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 4 (kg)" })).toHaveValue("55");
  await expect(tbl.getByRole("textbox", { name: "Repeticiones de Serie 4" })).toHaveValue("5");
  await shot(page, "pyramid-applied");
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "tabla de series en el teléfono");

  // Teclado: Enter pasa al mismo campo de la serie siguiente, con el valor seleccionado para reemplazarlo.
  await tbl.getByRole("textbox", { name: "Peso de Serie 1 (kg)" }).focus();
  await page.keyboard.press("Enter");
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 2 (kg)" })).toBeFocused();
  await page.keyboard.type("47,5");
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 2 (kg)" })).toHaveValue("47,5");

  // lb: se escribe y se ve en libras; se guarda en kg.
  await dlg.getByRole("group", { name: "Unidad de peso" }).getByRole("button", { name: "lb" }).click();
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 4 (lb)" })).toHaveValue("121,3");
  await tbl.getByRole("textbox", { name: "Peso de Serie 4 (lb)" }).fill("125");
  await dlg.getByRole("group", { name: "Unidad de peso" }).getByRole("button", { name: "kg" }).click();
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 4 (kg)" })).toHaveValue("56,7");

  // Deshacer de a un paso.
  await dlg.getByRole("button", { name: "Deshacer" }).click();
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 4 (kg)" })).toHaveValue("55");
  await dlg.getByRole("button", { name: "Deshacer" }).click();
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 2 (kg)" })).toHaveValue("45");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText(/Pirámide · 4 series/).first()).toBeVisible();
  await expect(page.getByText(/Guardado|Versión \d+ guardada/).first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("top set + Load Set y tipos propios: crear, usar, renombrar sin tocar el plan y quitar", async ({ page }) => {
  const errors = watchErrors(page);
  const { dlg, org } = await openBench(page);
  await dlg.getByRole("button", { name: "Top set + back-off", exact: true }).click();
  await dlg.getByRole("button", { name: "Aplicar" }).click();
  const tbl = dlg.getByRole("table", { name: /Series de Press de banca/ });
  // Load Set después del top set: una serie nueva insertada y elegida como Load Set (sin carga heredada).
  await tbl.getByRole("button", { name: "Insertar una serie después de la serie 1" }).click();
  await tbl.getByRole("combobox", { name: "Tipo de Serie 2" }).selectOption({ label: "Load Set (efectiva)" });
  await expect(tbl.getByRole("textbox", { name: "Peso de Serie 2 (kg)" })).toHaveValue("");
  await tbl.getByRole("textbox", { name: "Peso de Serie 2 (kg)" }).fill("90");
  await tbl.getByRole("textbox", { name: "Repeticiones de Serie 2" }).fill("6");
  await expect(tbl.getByText("cuenta como efectiva").first()).toBeVisible();

  // Tipo propio desde la misma tabla.
  await tbl.getByRole("combobox", { name: "Tipo de Serie 3" }).selectOption("new");
  const form = dlg.getByRole("group", { name: "Crear tipo personalizado" });
  await form.getByRole("textbox", { name: "Nombre" }).fill("Top set");
  await form.getByRole("button", { name: "Guardar tipo" }).click();
  await expect(form.getByRole("alert")).toContainText("ya es un tipo de REPI");
  await form.getByRole("textbox", { name: "Nombre" }).fill("Serie de control");
  await form.getByRole("button", { name: "Guardar tipo" }).click();
  await expect(tbl.getByRole("combobox", { name: "Tipo de Serie 3" }).locator("option:checked")).toHaveText("Serie de control (efectiva)");
  await shot(page, "load-set-custom");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText(/Guardado|Versión \d+ guardada/).first()).toBeVisible({ timeout: 15_000 });

  // Renombrar en «Mis tipos»: el plan ya guardado conserva «Serie de control».
  await page.getByRole("button", { name: "Series y técnica de Press de banca" }).first().click();
  const dlg2 = page.getByRole("dialog", { name: /Series y técnica · Press de banca/ });
  await dlg2.getByRole("button", { name: "Mis tipos de serie" }).click();
  const mine = dlg2.getByRole("group", { name: "Mis tipos de serie" });
  await mine.getByRole("button", { name: "Renombrar Serie de control" }).click();
  await mine.getByRole("textbox", { name: "Nuevo nombre de Serie de control" }).fill("Serie de chequeo");
  await mine.getByRole("button", { name: "Guardar" }).click();
  await expect(mine.getByText("Serie de chequeo")).toBeVisible();
  const t2 = dlg2.getByRole("table", { name: /Series de Press de banca/ });
  await expect(t2.getByRole("combobox", { name: "Tipo de Serie 2" }).locator("option:checked")).toHaveText("Load Set (efectiva)");
  await expect(t2.getByRole("combobox", { name: "Tipo de Serie 3" }).locator("option:checked")).toHaveText(/Serie de control \(en este plan/);
  page.once("dialog", (d) => void d.accept());
  await mine.getByRole("button", { name: "Quitar Serie de chequeo" }).click();
  await expect(mine.getByText("Serie de chequeo")).toHaveCount(0);
  const prog = await (await page.request.get(`/api/coach/${org}/programs`)).json() as { programs: { id: string; name: string }[] };
  const hip = prog.programs.find((p) => /Hipertrofia/.test(p.name))!;
  const doc = await (await page.request.get(`/api/coach/${org}/programs/${hip.id}`)).json() as { doc: { days: { exercises: { name: string; detail?: { setPlan?: { kind: string; label?: string; weightKg: number | null }[] } }[] }[] } };
  const bench = doc.doc.days[0].exercises.find((e) => e.name === "Press de banca")!;
  expect(bench.detail!.setPlan!.slice(0, 3).map((r) => [r.kind, r.label ?? null, r.weightKg])).toEqual([["top", null, null], ["work", "Load Set", 90], ["work", "Serie de control", null]]);
  expect(errors).toEqual([]);
});

test("copiar un día de Valentina al programa de Martina: sin pesos, vista previa, guardado; el historial no cambia", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = orgOf(href);
  const ov = await (await page.request.get(`/api/coach/${org}/overview`)).json() as { clients: { id: string; name: string }[] };
  const vale = ov.clients.find((c) => /Valentina/.test(c.name))!, marti = ov.clients.find((c) => /Martina/.test(c.name))!;
  const detail = async (id: string) => (await page.request.get(`/api/coach/${org}/clients/${id}`)).json() as Promise<{ program: { programId: string; version: number } | null; sessions?: unknown; log?: unknown }>;
  const v = await detail(vale.id), m = await detail(marti.id);
  const before = JSON.stringify({ ...(await detail(marti.id)), program: null });
  await page.goto(`/coach/${org}?s=builder&p=${v.program!.programId}`);
  await expect(page.getByRole("tab", { name: "Torso A" })).toBeVisible();
  await page.getByRole("button", { name: "Día ▾" }).click();
  await page.getByRole("menuitem", { name: /Copiar a…/ }).click();
  const dlg = page.getByRole("dialog", { name: "Copiar día a…" });
  await dlg.getByRole("combobox", { name: "Programa de destino" }).selectOption({ label: `${marti.name} · Hipertrofia · 3 días` });
  await expect(dlg.getByRole("radio", { name: /Sólo la estructura, sin pesos \(recomendado\)/ })).toBeChecked();
  await expect(dlg.getByRole("checkbox", { name: /Copiar las notas/ })).not.toBeChecked();
  await expect(dlg.getByRole("radio", { name: "Crear un día nuevo" })).toBeChecked(); // lo conservador por defecto
  const preview = dlg.getByRole("region", { name: "Vista previa" });
  await expect(preview).toContainText("Se copia: Torso A");
  await expect(preview).toContainText(/Día nuevo «Torso A» con 4 ejercicios/);
  // Reemplazar pide confirmación explícita.
  await dlg.getByRole("radio", { name: "Reemplazar el contenido del día" }).check();
  await expect(dlg.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  await dlg.getByRole("radio", { name: "Crear un día nuevo" }).check();
  await expect(dlg.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  await shot(page, "copy-day-preview");
  await dlg.getByRole("button", { name: "Confirmar" }).click();
  await expect(dlg.getByRole("status")).toContainText("Guardado");
  await dlg.getByRole("button", { name: "Abrir el día pegado" }).click();
  await expect(page.getByRole("tab", { name: "Torso A" }).last()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Series y técnica de Press de banca" })).toBeVisible();
  const m2 = await detail(marti.id);
  expect(m2.program!.programId).toBe(m.program!.programId);
  expect(JSON.stringify({ ...m2, program: null })).toBe(before); // sesiones y resultados de Martina sin cambios
  const doc = await (await page.request.get(`/api/coach/${org}/programs/${m.program!.programId}`)).json() as { doc: { days: { name: string; exercises: { detail?: { setPlan?: { weightKg: number | null }[] } }[] }[] } };
  expect(doc.doc.days.map((d) => d.name)).toEqual(["Torso A", "Piernas", "Torso B", "Torso A"]);
  expect(doc.doc.days[3].exercises.flatMap((e) => e.detail?.setPlan ?? []).every((r) => r.weightKg == null)).toBe(true);
  if (test.info().project.name === "mobile") await expectNoHorizontalOverflow(page, "constructor después de pegar");
  expect(errors).toEqual([]);
});

test("sala: copiar el día de un socio y pegarlo en el borrador de otro; se guarda como revisión con motivo", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  const org = orgOf(href);
  const c = await (await page.request.get(`/api/gym/${org}/context`)).json() as { locations: { id: string }[] };
  const loc = c.locations[0].id;
  const mem = await (await page.request.get(`/api/gym/${org}/members?loc=${loc}`)).json() as { members: { id: string; name: string; program: { name: string } | null }[] };
  const julian = mem.members.find((x) => /Julián/.test(x.name))!, vale = mem.members.find((x) => /Valentina/.test(x.name))!;
  await page.goto(`/gym/${org}?s=members&sel=${julian.id}&loc=${loc}`);
  await page.getByRole("button", { name: "Editar programa" }).click();
  let modal = page.getByRole("dialog", { name: /Editar programa · Julián/ });
  await modal.getByRole("button", { name: "Día ▾" }).click();
  await modal.getByRole("menuitem", { name: /Copiar día/ }).click();
  await modal.getByRole("button", { name: "Cancelar" }).last().click();
  await page.goto(`/gym/${org}?s=members&sel=${vale.id}&loc=${loc}`);
  await page.getByRole("button", { name: "Editar programa" }).click();
  modal = page.getByRole("dialog", { name: /Editar programa · Valentina/ });
  await modal.getByRole("button", { name: "Día ▾" }).click();
  await modal.getByRole("menuitem", { name: /Pegar día «Día A»/ }).click();
  const paste = modal.getByRole("region", { name: "Pegar día" });
  await expect(paste.getByRole("radio", { name: /Sólo la estructura \(recomendado\)/ })).toBeChecked();
  await expect(paste).toContainText("Sentadilla · Press de banca");
  await shot(page, "gym-paste");
  await paste.getByRole("button", { name: "Pegar en el borrador" }).click();
  await expect(modal.getByRole("tab", { name: "Día A" })).toHaveAttribute("aria-selected", "true");
  await expect(modal.getByRole("textbox", { name: /Motivo del cambio/ })).toHaveValue("Día copiado: Día A");
  await modal.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText(/Programa guardado/).first()).toBeVisible();
  const d = await (await page.request.get(`/api/gym/${org}/members/${vale.id}`)).json() as { program: { doc: { days: { name: string }[] } } };
  expect(d.program.doc.days.map((x) => x.name)).toEqual(["Full body", "Día A"]);
  expect(errors).toEqual([]);
});
