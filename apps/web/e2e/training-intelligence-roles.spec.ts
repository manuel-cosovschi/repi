import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D191 · Cierre: Training Intelligence por rol en el navegador real, contra la build local y `repi_dev`, siempre dentro de la
// demo (organizaciones is_demo, se borran a las 6 h). Para que el coach tenga propuestas, la prueba agrega a SU demo cuatro
// sesiones ficticias en subida (sólo si la organización es demo y la base es la local de desarrollo).
//   · Coach: propuestas aceptadas (sin aplicar), mantenidas y rechazadas; «Revisar en el editor» → constructor de siempre →
//     «Aplicar» → versión nueva; los entrenamientos registrados no cambian.
//   · Sala con turno: ve la sección del socio que comparte. Dueño: no (403 en la API, sin sección en la ficha).
//   · Alumno en lb: tarjeta y explicaciones en lb; cambio a kg en medio de la sesión; molestia → mensaje y sin subir.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

function devDb() {
  // Como las demás pruebas que siembran: primero DATABASE_URL del entorno, si no .env.local.
  let raw = process.env.DATABASE_URL ?? "";
  if (!raw) raw = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])).DATABASE_URL;
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/repi_(dev|e2e_[a-z0-9_]+)$/.test(url.pathname)) throw new Error("La siembra de E2E sólo corre contra repi_dev o repi_e2e_* locales.");
  return postgres(raw, { max: 1, onnotice: () => {} });
}
/** Cuatro sesiones del primer día con el rango completo y la carga en subida (sólo en una organización demo). */
async function seedProgress(relId: string) {
  const sql = devDb();
  try {
    const [a] = await sql<{ id: string; user_id: string; v: string; demo: boolean }[]>`
      select a.id, cc.user_id, p.current_version_id as v, o.is_demo as demo from program_assignment a join program p on p.id = a.program_id
      join coach_client cc on cc.id = a.coach_client_id join organization o on o.id = cc.coach_org_id where a.coach_client_id = ${relId} and a.status = 'active'`;
    if (!a?.demo) throw new Error("No es una demo: no se siembra nada.");
    // Como al empezar un entrenamiento real (startSession), la versión usada queda bloqueada: editarla crea una nueva.
    await sql`update program_version set locked = true where id = ${a.v}`;
    const [d] = await sql<{ id: string; name: string }[]>`select id, name from program_day where version_id = ${a.v} order by position limit 1`;
    const exs = await sql<{ id: string; exercise_id: string; sets: number; reps: string; detail: { setPlan?: unknown[] } | null; name: string }[]>`
      select id, exercise_id, sets, reps, detail, name from program_exercise where day_id = ${d.id} order by position`;
    const ok = exs.filter((e) => /^\d+\s*-\s*\d+$/.test(e.reps) && !e.detail?.setPlan).slice(0, 3);
    for (const k of [0, 1, 2, 3]) {
      const start = new Date(Date.now() - (12 - 3 * k) * 86_400_000 + 60_000), end = new Date(start.getTime() + 50 * 60_000), sid = randomUUID();
      await sql`insert into workout_session (id, user_id, coach_client_id, assignment_id, version_id, day_id, day_name, status, started_at, active_ms, ended_at, revision, updated_at)
        values (${sid}, ${a.user_id}, ${relId}, ${a.id}, ${a.v}, ${d.id}, ${d.name}, 'completed', ${start}, ${45 * 60_000}, ${end}, 2, ${end})`;
      for (const [j, e] of ok.entries()) {
        const max = Number(e.reps.split("-")[1]);
        for (let i = 0; i < e.sets; i++) await sql`insert into set_log (id, session_id, program_exercise_id, exercise_id, set_index, weight_kg, reps, rir, completed_at, revision, updated_at)
          values (${randomUUID()}, ${sid}, ${e.id}, ${e.exercise_id}, ${i}, ${String(100 + j * 20 + k * 2.5)}, ${max}, 2, ${new Date(start.getTime() + (i + 1) * 60_000)}, 1, ${end})`;
      }
    }
    return ok.map((e) => e.name);
  } finally { await sql.end(); }
}
const orgOf = (href: string) => href.split("/")[2].split("?")[0];

test("coach: aceptar (sin aplicar), mantener y rechazar; revisar en el editor y aplicar crea una versión nueva", async ({ page }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = orgOf(href);
  const ov = await (await page.request.get(`/api/coach/${org}/overview`)).json() as { clients: { id: string; name: string }[] };
  const vale = ov.clients.find((c) => /Valentina/.test(c.name))!;
  const names = await seedProgress(vale.id);
  expect(names.length).toBeGreaterThanOrEqual(3);
  const sessionsBefore = await (await page.request.get(`/api/coach/${org}/clients/${vale.id}`)).text();

  await page.goto(`/coach/${org}?s=clients&c=${vale.id}`);
  await page.getByRole("tab", { name: "Rendimiento" }).click();
  const ti = page.getByRole("region", { name: "Training Intelligence" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Training Intelligence" }) })).first();
  await expect(ti.getByRole("heading", { name: "Training Intelligence" })).toBeVisible();
  const row = (name: string) => ti.locator(".trow", { hasText: name });
  for (const n of names) await expect(row(n).locator(".ti-proposal")).toBeVisible();
  await expect(ti.getByText(/Decidir no cambia la rutina/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "Training Intelligence del coach");

  await row(names[1]).getByRole("button", { name: "Mantener programación" }).click();
  await expect(ti.getByRole("status")).toContainText("Se mantiene la programación original");
  await expect(row(names[1]).getByText("Se mantuvo la programación")).toBeVisible();
  await row(names[2]).getByRole("button", { name: "Rechazar" }).click();
  await expect(row(names[2]).getByText("Rechazada", { exact: true })).toBeVisible();
  await row(names[0]).getByRole("button", { name: "Aceptar (sin aplicar)" }).click();
  await expect(ti.getByRole("status")).toContainText("La rutina todavía no cambió");
  await expect(row(names[0]).getByText(/Aceptada: todavía no se aplicó/)).toBeVisible();

  // Revisar en el editor: abre el constructor de siempre con la propuesta a la vista; nada cambia hasta «Aplicar».
  const progBefore = await (await page.request.get(`/api/coach/${org}/clients/${vale.id}`)).json() as { program: { version: number; doc: { id?: string } } | null };
  await row(names[0]).getByRole("button", { name: "Revisar en el editor" }).click();
  const banner = page.getByRole("region", { name: "Propuesta de Training Intelligence" });
  await expect(banner).toContainText(names[0]);
  await expect(banner).toContainText(/se guarda como cualquier edición tuya/);
  const apply = banner.getByRole("button", { name: /^Aplicar .* al borrador$/ });
  const kgText = (await apply.innerText()).replace(/^Aplicar | al borrador$/g, "");
  await apply.click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByText(/Versión \d+ guardada/).first()).toBeVisible({ timeout: 15_000 });
  const progAfter = await (await page.request.get(`/api/coach/${org}/clients/${vale.id}`)).json() as { program: { version: number; doc: { days: { exercises: { name: string; detail?: { setPlan?: { weightKg: number | null }[] } }[] }[] } } };
  expect(progAfter.program.version).toBeGreaterThan(progBefore.program!.version);
  const ex = progAfter.program.doc.days.flatMap((d) => d.exercises).find((e) => e.name === names[0])!;
  expect(ex.detail?.setPlan?.every((s) => `${s.weightKg!.toLocaleString("es-AR")} kg` === kgText)).toBe(true);
  // Las sesiones registradas siguen iguales (la ficha lista las mismas).
  const sessionsAfter = await (await page.request.get(`/api/coach/${org}/clients/${vale.id}`)).json() as { sessions?: unknown };
  expect(JSON.stringify(sessionsAfter.sessions ?? null)).toBe(JSON.stringify((JSON.parse(sessionsBefore) as { sessions?: unknown }).sessions ?? null));
  expect(errors).toEqual([]);
});

test("sala con turno ve la sección del socio; el dueño no (ni en la API)", async ({ page, context }) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  const org = orgOf(href);
  const c = await (await page.request.get(`/api/gym/${org}/context`)).json() as { locations: { id: string }[] };
  const mem = await (await page.request.get(`/api/gym/${org}/members?loc=${c.locations[0].id}`)).json() as { members: { id: string; name: string }[] };
  const julian = mem.members.find((m) => /Julián/.test(m.name))!;
  await page.goto(`/gym/${org}?s=members&sel=${julian.id}&loc=${c.locations[0].id}`);
  await expect(page.getByRole("heading", { name: "Training Intelligence" })).toBeVisible();
  await expect(page.getByText(/datos insuficientes|Sin programa activo/).first()).toBeVisible(); // historial insuficiente: no inventa tendencias
  await expectNoHorizontalOverflow(page, "Training Intelligence de sala");
  expect(errors).toEqual([]);

  await context.clearCookies();
  const owner = await openDemo(page, "owner");
  const oorg = orgOf(owner);
  const oc = await (await page.request.get(`/api/gym/${oorg}/context`)).json() as { locations: { id: string }[] };
  const om = await (await page.request.get(`/api/gym/${oorg}/members?loc=${oc.locations[0].id}`)).json() as { members: { id: string; name: string }[] };
  const r = await page.request.get(`/api/gym/${oorg}/members/${om.members[0].id}/intelligence`);
  expect(r.status()).toBe(403);
  // El dueño ni siquiera tiene la pantalla «Socios»: pedirla por la dirección lo deja en su panel, sin la sección.
  await page.goto(`/gym/${oorg}?s=members&sel=${om.members[0].id}&loc=${oc.locations[0].id}`);
  await expect(page.getByRole("heading", { name: /Ejecutivo/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training Intelligence" })).toHaveCount(0);
});

type Sess = { exercises: { targets: { setIndex: number; weightKg: number | null; id?: string }[]; logs: { setIndex: number; weightKg: number | null; feel: string | null }[] }[] };
const sess = async (page: Page, id: string) => (await (await page.request.get(`/api/me/sessions/${id}`)).json()) as Sess;

test("alumno en lb: tarjeta en lb, cambio a kg en medio de la sesión sin tocar objetivos; molestia frena la subida", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  expect((await page.request.post("/api/me/settings", { data: { weightUnit: "lb" } })).status()).toBeLessThan(300);
  await page.reload();
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  const card = page.getByRole("region", { name: /^Objetivo de serie 1$/ });
  await expect(card).toBeVisible();
  await expect(page.getByText("Peso (lb)")).toBeVisible();
  const id = (await expect.poll(async () => (await (await page.request.get("/api/me/training")).json()).openSession ?? null, { timeout: 15_000 }).not.toBeNull()
    .then(async () => (await (await page.request.get("/api/me/training")).json()).openSession)) as string;
  await expect.poll(async () => (await sess(page, id)).exercises[0].targets.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const t0 = (await sess(page, id)).exercises[0].targets;
  // Ningún «kg» en la tarjeta (incluidas la explicación y la revisión) mientras la unidad es lb.
  await expect(card).not.toContainText(/\d\s?kg\b/);
  if (t0[0].weightKg) await expect(card).toContainText(/lb/);

  // Molestia en la serie 1: mensaje de seguridad durante el descanso y nada sube.
  await page.getByRole("group", { name: /¿Cómo se sintió la serie\?/ }).getByRole("button", { name: "Con molestia" }).click();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect(page.locator(".ti-rest")).toContainText(/molestia/i);
  await expect.poll(async () => (await sess(page, id)).exercises[0].logs.length, { timeout: 15_000 }).toBe(1);
  const after = await sess(page, id);
  expect(after.exercises[0].logs[0].feel).toBe("molestia");
  for (const t of after.exercises[0].targets.filter((x) => x.setIndex > 0)) {
    const before = t0.find((x) => x.setIndex === t.setIndex)!;
    if (before.weightKg != null && t.weightKg != null) expect(t.weightKg).toBeLessThanOrEqual(before.weightKg);
  }

  // Cambio a kg en medio de la sesión: misma sesión, mismos objetivos guardados (en kg), ahora a la vista en kg.
  const snap = JSON.stringify(after.exercises[0].targets.map((t) => [t.setIndex, t.weightKg]));
  expect((await page.request.post("/api/me/settings", { data: { weightUnit: "kg" } })).status()).toBeLessThan(300);
  await page.reload();
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  await expect(page.getByText("Peso (kg)")).toBeVisible();
  expect(JSON.stringify((await sess(page, id)).exercises[0].targets.map((t) => [t.setIndex, t.weightKg]))).toBe(snap);
  expect((await sess(page, id)).exercises[0].logs).toHaveLength(1);
  await expect(page.getByRole("region", { name: /^Objetivo de serie 2$/ })).not.toContainText(/\d\s?lb\b/);
  expect(errors).toEqual([]);
});
