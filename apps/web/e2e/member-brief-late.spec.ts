// 13/11/2026 · Aviso para quien pidió su programa sin datos y ya lo recibió («Contale a REPI qué buscás»). Antes sólo se
// avisaba mientras el pedido seguía abierto. Acá se prueba la pantalla (el servidor tiene sus pruebas en
// tests/program-brief-late.test.ts): la respuesta de /api/me/program-request se simula; la demo guiada pone el resto.
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.use({ viewport: { width: 390, height: 844 } });

const PREFILL = { goal: null, daysPerWeek: null, minutes: null, level: null, hasLimitations: null, limitationsDetail: null, focus: [], place: "gym", likes: null, avoid: null, notes: null };
const LATE = { id: "t-late", source: "gym", to: "el equipo de Gym Norte", createdAt: "2026-11-01T15:00:00.000Z", snoozed: false };

/** Simula el estado del pedido; devuelve lo que la app mandó por POST. */
async function mockState(page: Page, state: { late: typeof LATE | null }) {
  const posts: unknown[] = [];
  await page.route("**/api/me/program-request", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { pending: [], late: state.late, prefill: PREFILL } });
    const b = req.postDataJSON() as { later?: boolean; brief?: unknown };
    posts.push(b);
    if (b.later) { state.late = state.late && { ...state.late, snoozed: true }; return route.fulfill({ json: { ok: true } }); }
    state.late = null;
    return route.fulfill({ json: { completed: 1, late: true } });
  });
  return posts;
}

test("pedido ya respondido sin datos: el aviso se ve en Inicio, abre el formulario y se apaga al completar", async ({ page }) => {
  const errors = watchErrors(page);
  const state = { late: LATE as typeof LATE | null };
  const posts = await mockState(page, state);
  await openDemo(page, "member");
  const card = page.locator("[data-late-brief]");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Contale a REPI qué buscás");
  await expect(card).toContainText("el equipo de Gym Norte");
  // Un solo aviso por lo mismo: la tarjeta genérica del perfil no se suma.
  await expect(page.getByRole("button", { name: /Tu objetivo, experiencia, días y tiempo/ })).toHaveCount(0);
  // Áreas táctiles de 44 px.
  for (const b of await card.getByRole("button").all()) { const r = (await b.boundingBox())!; expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44); }

  await card.getByRole("button", { name: /Contale a REPI qué buscás/ }).click();
  const sheet = page.getByRole("dialog", { name: "Contale a REPI qué buscás" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Enviar mis datos" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Elegí tu objetivo principal");
  const pick = (g: RegExp, o: string | RegExp) => sheet.getByRole("group", { name: g }).getByRole("button", { name: o, exact: typeof o === "string" }).click();
  await pick(/Objetivo principal/, "Ganar músculo");
  await pick(/Días por semana/, "4");
  await pick(/Tiempo por entrenamiento/, "60 min");
  await pick(/Experiencia/, /Intermedio/);
  await pick(/lesión/, "No tengo");
  await sheet.getByRole("button", { name: "Enviar mis datos" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(card).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect((posts[0] as { brief: Record<string, unknown> }).brief).toMatchObject({ goal: "muscle", daysPerWeek: 4, minutes: 60, level: "intermediate", hasLimitations: false });
  expect(errors).toEqual([]);
});

test("«Ahora no» lo deja para después sin perder nada; sin aviso pendiente no aparece", async ({ page }) => {
  const state = { late: LATE as typeof LATE | null };
  const posts = await mockState(page, state);
  await openDemo(page, "member");
  const card = page.locator("[data-late-brief]");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Ahora no/ }).click();
  await expect(card).toHaveCount(0);
  expect(posts).toEqual([{ later: true }]);
  // En pausa: al volver a abrir la app sigue escondido y tampoco aparece la tarjeta genérica (no se insiste por otro lado).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /Hola/ })).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Tu objetivo, experiencia, días y tiempo/ })).toHaveCount(0);
});
