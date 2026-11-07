import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D209 · Adaptive Coaching 3.0 del lado de quien programa, en el navegador real contra la build local y `repi_dev`, siempre
// dentro de la demo (organizaciones is_demo, se borran a las 6 h).
//   · Coach: «Pendientes» del panel → ficha en Rendimiento → «Señales de REPI» (análisis de REPI, nunca la conversación ni la
//     memoria del alumno) → un pedido del alumno se revisa en el editor de siempre y se decide con confirmación.
//   · Sala con permiso para el programa: la misma sección en la ficha del socio. Dueño: 403 en la API y nada en pantalla.
//   · REPI Admin «Coaching IA»: sólo con un Admin de PRUEBA local (E2E_ADMIN_STATE, como theme-admin); sin eso, se omite.
// Límite de la demo: sealDemo deja una sola persona por mundo, así que el pedido del alumno no puede salir del alumno en la
// misma demo. La prueba lo siembra en SU demo (sólo si la organización es demo y la base es la local de desarrollo), como
// training-intelligence-roles. El circuito del alumno (propose_to_coach) está cubierto por las pruebas de integración.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

const SECRET = "NOTA-E2E-PRIVADA-DEL-ALUMNO";
function devDb() {
  let url = process.env.DATABASE_URL ?? "";
  if (!url) {
    const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    url = env.DATABASE_URL;
  }
  const u = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.pathname !== "/repi_dev") throw new Error("La siembra de E2E sólo corre contra repi_dev local.");
  return postgres(url, { max: 1, onnotice: () => {} });
}
/** Un pedido del alumno desde REPI (propuesta abierta + acción propose_to_coach ejecutada), sólo en una organización demo. */
async function seedStudentRequest(relId: string) {
  const sql = devDb();
  try {
    const [a] = await sql<{ user_id: string; demo: boolean; v: string }[]>`
      select cc.user_id, o.is_demo as demo, p.current_version_id as v from coach_client cc join organization o on o.id = cc.coach_org_id
      join program_assignment pa on pa.coach_client_id = cc.id and pa.status = 'active' join program p on p.id = pa.program_id where cc.id = ${relId}`;
    if (!a?.demo) throw new Error("No es una demo: no se siembra nada.");
    const [ex] = await sql<{ exercise_id: string; name: string }[]>`
      select pe.exercise_id, pe.name from program_exercise pe join program_day d on d.id = pe.day_id where d.version_id = ${a.v} order by d.position, pe.position limit 1`;
    const pid = randomUUID();
    await sql`insert into training_proposal (id, coach_client_id, exercise_id, kind, payload, algo_version)
      values (${pid}, ${relId}, ${ex.exercise_id}, 'rest', ${sql.json({ text: `Tu alumno pidió revisar ${ex.name}: «${SECRET}»`, weightKg: null, reps: null, basis: "Pedido del alumno desde REPI.", trend: "student_request", sessions: 0 })}, 'e2e')`;
    await sql`insert into brain_action (user_id, kind, idempotency_key, status, autonomy, input, result, executed_at)
      values (${a.user_id}, 'propose_to_coach', ${`propose_to_coach:${randomUUID().slice(0, 16)}`}, 'executed', 1, ${sql.json({ kind: "rest", note: SECRET })}, ${sql.json({ proposalId: pid })}, now())`;
    return ex.name;
  } finally { await sql.end(); }
}
const orgOf = (href: string) => href.split("/")[2].split("?")[0];
const signals = (page: Page) => page.locator("section.rs", { has: page.getByRole("heading", { name: "Señales de REPI" }) });
async function axeSection(page: Page, selector: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const r = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test("coach: «Pendientes» lleva a Señales de REPI; el pedido del alumno se revisa en el editor y se decide con confirmación", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = orgOf(href);
  const ov = await (await page.request.get(`/api/coach/${org}/overview`)).json() as { clients: { id: string; name: string }[] };
  const vale = ov.clients.find((c) => /Valentina/.test(c.name))!;
  const exName = await seedStudentRequest(vale.id);

  // Panel: una línea con cantidades (nunca el texto del pedido).
  await page.goto(`/coach/${org}`);
  const line = page.locator(".todo", { hasText: /propuesta para revisar/ }).filter({ hasText: vale.name.split(" ")[0] });
  await expect(line).toContainText(/pedido suyo desde REPI/i);
  await line.getByRole("button", { name: "Revisar" }).click();
  await expect(page.getByRole("tab", { name: "Rendimiento" })).toHaveAttribute("aria-selected", "true");

  // Ficha → Rendimiento: análisis de REPI, rotulado y con su origen; lo privado no aparece.
  const rs = signals(page);
  await expect(rs.getByText("Análisis de REPI")).toBeVisible();
  await expect(rs).toContainText("No es su conversación ni su memoria con REPI");
  await expect(rs.getByText("Dato registrado").first()).toBeVisible();
  const item = rs.locator(".rs-prop", { hasText: "Pedido del alumno" });
  await expect(item).toContainText(exName);
  await expect(page.locator("body")).not.toContainText(SECRET);
  await rs.getByText("¿Por qué?").first().click();
  await rs.getByText("Qué no incluye").click();
  await expect(rs).toContainText("Memoria y conversación del alumno con REPI");
  await expectNoHorizontalOverflow(page, "Señales de REPI del coach");
  await axeSection(page, "section.rs");

  // «Revisar en el editor»: el constructor de siempre con el pedido a la vista; nada cambia hasta que el coach edite y guarde.
  await item.getByRole("button", { name: "Revisar en el editor" }).click();
  const banner = page.getByRole("region", { name: "Pedido del alumno desde REPI" });
  await expect(banner).toContainText(exName);
  await expect(banner).toContainText(/editá el ejercicio a mano/);
  await expect(page.locator("body")).not.toContainText(SECRET);
  await banner.getByRole("button", { name: "Cerrar propuesta" }).click();

  // Decidir: vista previa + confirmación; el aviso llega recién con la respuesta del servidor.
  await page.goto(`/coach/${org}?s=clients&c=${vale.id}`);
  await page.getByRole("tab", { name: "Rendimiento" }).click();
  const again = signals(page).locator(".rs-prop", { hasText: "Pedido del alumno" });
  await again.getByRole("button", { name: "Rechazar" }).click();
  const confirm = again.getByRole("group");
  await expect(confirm).toContainText("El programa no cambia");
  await expect(confirm.getByRole("button", { name: "Confirmar" })).toBeFocused(); // el botón que la abrió desaparece
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(again.getByRole("button", { name: "Revisar en el editor" })).toBeFocused();
  await again.getByRole("button", { name: "Rechazar" }).click();
  await confirm.getByRole("button", { name: "Confirmar" }).click();
  await expect(signals(page).getByRole("status")).toContainText("Pedido rechazado. El programa no cambió.");
  await expect(signals(page).locator(".rs-prop", { hasText: "Pedido del alumno" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sala con permiso para el programa ve Señales de REPI del socio; el dueño no (ni en la API)", async ({ page, context }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  const org = orgOf(href);
  const c = await (await page.request.get(`/api/gym/${org}/context`)).json() as { locations: { id: string }[] };
  const mem = await (await page.request.get(`/api/gym/${org}/members?loc=${c.locations[0].id}`)).json() as { members: { id: string; name: string }[] };
  const julian = mem.members.find((m) => /Julián/.test(m.name))!;
  await page.goto(`/gym/${org}?s=members&sel=${julian.id}&loc=${c.locations[0].id}`);
  const rs = signals(page);
  await expect(rs.getByText("Análisis de REPI")).toBeVisible();
  await expect(rs).toContainText("en esta sede");
  await expect(rs.getByText("Qué no incluye")).toBeVisible();
  await expectNoHorizontalOverflow(page, "Señales de REPI de sala");
  await axeSection(page, "section.rs");
  expect(errors).toEqual([]);

  await context.clearCookies();
  const owner = await openDemo(page, "owner");
  const oorg = orgOf(owner);
  const oc = await (await page.request.get(`/api/gym/${oorg}/context`)).json() as { locations: { id: string }[] };
  const om = await (await page.request.get(`/api/gym/${oorg}/members?loc=${oc.locations[0].id}`)).json() as { members: { id: string }[] };
  const r = await page.request.get(`/api/gym/${oorg}/members/${om.members[0].id}/brain`);
  expect(r.status()).toBe(403);
  await page.goto(`/gym/${oorg}?s=members&sel=${om.members[0].id}&loc=${oc.locations[0].id}`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText("Señales de REPI")).toHaveCount(0);
});

const ADMIN = process.env.E2E_ADMIN_STATE;
test.describe("REPI Admin · Coaching IA", () => {
  test.skip(!ADMIN, "requiere E2E_ADMIN_STATE (Admin de prueba local, ver theme-admin.spec.ts)");
  test.use({ storageState: ADMIN ?? undefined });

  test("métricas agregadas y límites con validación, revisión y confirmación", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const menu = page.getByRole("button", { name: "Abrir menú" });
    if (await menu.isVisible()) await menu.click();
    await page.locator(".co-nav button", { hasText: /^Coaching IA$/ }).click();
    await expect(page.getByRole("heading", { name: "Coaching IA", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Estado de los motores" })).toBeVisible();
    await expect(page.getByText(/Con 0 \(o apagada\), la IA del cerebro no se usa y todo sigue andando con reglas/)).toBeVisible();
    await page.getByLabel("Período").selectOption("30");
    await expect(page.getByText(/\(30 días\)/)).toBeVisible();

    const calls = page.getByLabel("Llamadas por persona por día");
    const before = await calls.inputValue(); // lo que haya guardado en la base local: se restaura al final
    const target = before === "25" ? "26" : "25";
    await calls.fill("abc");
    await expect(page.getByText("Escribí un número entero.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revisá los valores" })).toHaveAttribute("aria-disabled", "true");
    await calls.fill(target);
    await page.getByRole("button", { name: "Revisar cambios" }).click();
    const dlg = page.getByRole("dialog", { name: "Confirmar límites de la IA" });
    await expect(dlg).toContainText("Llamadas por persona por día");
    await dlg.getByRole("button", { name: "Guardar límites" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText("Vigente ahora para toda la plataforma")).toBeVisible();
    await expect(calls).toHaveValue(target);
    // Vuelve a lo que había (vacío = heredado) para no dejar la base local cambiada.
    await calls.fill(before);
    await page.getByRole("button", { name: "Revisar cambios" }).click();
    const again = page.getByRole("dialog", { name: "Confirmar límites de la IA" });
    await again.getByRole("button", { name: "Guardar límites" }).click();
    await expect(again).toHaveCount(0);
    await expect(calls).toHaveValue(before);
    await expectNoHorizontalOverflow(page, "Coaching IA");
    await axeSection(page, ".ac");
    expect(errors).toEqual([]);
  });
});
