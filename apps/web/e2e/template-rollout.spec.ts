import { expect, test } from "@playwright/test";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D194 · «Actualizar programas de alumnos» con la demo del coach (is_demo): la plantilla con clientes recibe cargas, el
// profe abre la comparación, elige y confirma; las cargas llegan al programa de cada alumno elegido (versión nueva) y la
// segunda vista dice «Al día». Móvil y escritorio, claro y oscuro.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

type Pv = { template: { fingerprint: string }; students: { name: string; programId: string; upToDate: boolean; version: number; changes: { key: string; conflict: boolean }[] }[] };

test("plantilla → comparar → elegir → confirmar: las cargas llegan al programa de cada alumno", async ({ page }, info) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "coach");
  const org = href.split("/")[2].split("?")[0];
  const list = (await (await page.request.get(`/api/coach/${org}/programs`)).json()).programs as { id: string; name: string; clients: number }[];
  const tpl = list.find((p) => p.clients > 0)!;
  const g = await (await page.request.get(`/api/coach/${org}/programs/${tpl.id}`)).json();
  const S = (reps: string, weightKg: number) => ({ kind: "work", reps, weightKg, pct1rm: null, rir: 1, rpe: null, restSec: 90, note: null });
  const doc = g.doc;
  doc.days[0].exercises[0].sets = 3;
  doc.days[0].exercises[0].detail = { technique: "custom", setPlan: [S("12", 80), S("10", 90), S("8", 100)] };
  const put = await page.request.put(`/api/coach/${org}/programs/${tpl.id}`, { data: { name: doc.name, weeks: doc.weeks, note: doc.note, days: doc.days.map((d: { name: string; exercises: Record<string, unknown>[] }) => ({ name: d.name, exercises: d.exercises.map(({ id: _id, ...e }) => e) })) } });
  expect(put.status()).toBe(200);

  await page.goto(`/coach/${org}?s=builder&p=${tpl.id}`);
  await expect(page.getByText(/Los cambios de esta plantilla no le llegan solos a/)).toBeVisible();
  await page.getByRole("button", { name: "Actualizar programas de alumnos" }).click();
  const dlg = page.getByRole("dialog", { name: "Actualizar programas de alumnos" });
  await expect(dlg).toBeVisible();
  const students = dlg.getByRole("list", { name: "Alumnos con esta plantilla" }).getByRole("listitem").filter({ has: page.getByRole("checkbox") });
  await expect(dlg.getByText(/Su programa: versión \d+/).first()).toBeVisible();
  const n = await dlg.getByRole("button", { name: /^(Ver|Ocultar) comparación$/ }).count();
  expect(n).toBeGreaterThan(0);
  const first = dlg.getByRole("button", { name: "Ver comparación" }).first();
  if (await first.isVisible().catch(() => false)) await first.click();
  await expect(dlg.getByText(/80, 90, 100 kg/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "actualizar alumnos");
  await page.screenshot({ path: info.outputPath("rollout-claro.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: info.outputPath("rollout-oscuro.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await expectAccessible(page, info, "template-rollout");
  // Sin la confirmación explícita, no se puede aplicar.
  const go = dlg.getByRole("button", { name: /^Actualizar \d+ programas?$/ });
  await expect(go).toBeDisabled();
  await dlg.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
  await go.click();
  await expect(dlg.getByRole("status").filter({ hasText: /Listo: \d+ programas? actualizados?/ })).toBeVisible({ timeout: 15_000 });
  expect(await students.count()).toBeGreaterThan(0);

  // Servidor: todos al día y con las cargas del profe en SU programa.
  const after = (await (await page.request.get(`/api/coach/${org}/programs/${tpl.id}/rollout`)).json()) as Pv;
  expect(after.students.length).toBeGreaterThan(0);
  for (const s of after.students) {
    expect(s.upToDate).toBe(true);
    const p = await (await page.request.get(`/api/coach/${org}/programs/${s.programId}`)).json();
    expect(p.doc.days[0].exercises[0].detail.setPlan.map((r: { weightKg: number }) => r.weightKg)).toEqual([80, 90, 100]);
  }
  expect(errors).toEqual([]);
});
