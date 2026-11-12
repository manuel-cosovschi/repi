import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import postgres from "postgres";
import { assertLocalTarget, expectAccessible, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// REPI Control (D213) y STF-09 (D214) en la interfaz, con el navegador real contra la build local. Siempre dentro de la demo
// (organizaciones is_demo, se borran a las 6 h) y sólo contra una base descartable repi_e2e_* (nunca repi_dev ni producción):
// la política supervisada y la pantalla de rutinas las enciende REPI Admin; acá se encienden en la organización de la demo.
//   · Alumno: sin «Mis rutinas», «No vino el profe» ni rutina propia desde el historial; nota del gimnasio y pedido al equipo;
//     una pantalla vieja que intenta empezar una rutina propia recibe el 403 «supervised» y se actualiza; código de la
//     pantalla y cambio de PIN en Perfil.
//   · Dueño: «Pantalla de rutinas» (no habilitada → habilitada), registrar una pantalla (enlace una sola vez, con QR) y
//     revocarla; código y PIN del socio en su ficha (una sola vez); política en Configuración; STF-09 en Equipo.
// Capturas (sólo en el proyecto de escritorio, factor 1): CTL_SHOTS=<carpeta> guarda cada estado a 390×844 y 1440×900.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

function e2eDb() {
  const url = process.env.DATABASE_URL ?? "";
  const u = new URL(url || "postgres://x@invalid/none");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || !/^\/repi_e2e_[a-z0-9_]+$/.test(u.pathname)) test.skip(true, "Necesita DATABASE_URL de una base local repi_e2e_* (nunca repi_dev).");
  return postgres(url, { max: 1, onnotice: () => {} });
}
async function control(orgId: string, p: { supervised?: boolean; kiosk?: boolean }) {
  const sql = e2eDb();
  try {
    const r = await sql`update organization set routine_policy = ${p.supervised ? "supervised" : "open"}, kiosk_enabled = ${!!p.kiosk} where id = ${orgId} and is_demo returning id`;
    expect(r.length, "la organización tiene que ser de la demo").toBe(1);
  } finally { await sql.end(); }
}

async function shots(page: Page, info: TestInfo, name: string, focus?: Locator) {
  const dir = process.env.CTL_SHOTS;
  if (!dir || info.project.name !== "desktop") return;
  mkdirSync(dir, { recursive: true });
  const prev = page.viewportSize();
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    if (focus) { await focus.first().evaluate((el) => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(300); }
    await expectNoHorizontalOverflow(page, `${name} ${w}`);
    await page.screenshot({ path: `${dir}/${name}-${w}.png`, fullPage: false });
  }
  if (prev) await page.setViewportSize(prev);
}

test("alumno en un gimnasio supervisado: sin rutinas propias, nota del gimnasio, 403 de una pantalla vieja y código de la pantalla", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  let t = await (await page.request.get("/api/me/training")).json();
  const gymRel = (t.relations as { id: string; kind: string }[]).find((r) => r.kind === "gym");
  expect(gymRel, "la demo del alumno tiene gimnasio").toBeTruthy();
  if (t.relation?.kind !== "gym") { expect((await page.request.post("/api/me/relation", { data: { relationId: gymRel!.id } })).ok()).toBeTruthy(); t = await (await page.request.get("/api/me/training")).json(); }
  const orgId = t.relation.orgId as string;
  // Una rutina propia guardada de antes y un código de pantalla emitido (PIN de relleno: se reemplaza al cambiarlo).
  const sql = e2eDb();
  try {
    const [ex] = await sql<{ id: string }[]>`select id from exercise where name = 'Sentadilla' and org_id is null and owner_user_id is null limit 1`;
    await sql`insert into own_routine (user_id, name, exercises) values (${t.userId}, 'Mi rutina de casa', ${sql.json([{ exerciseId: ex.id, sets: 3, reps: "10", weightKg: null, restSec: 90, note: null }])})`;
    const [gm] = await sql<{ id: string }[]>`select gm.id from gym_member gm join organization o on o.id = gm.org_id where gm.user_id = ${t.userId} and gm.org_id = ${orgId} and o.is_demo`;
    await sql`insert into kiosk_credential (org_id, gym_member_id, member_code, pin_hash) values (${orgId}, ${gm.id}, '482913', 's1$AAAAAAAAAAAAAAAAAAAAAA$AAAA')`;
  } finally { await sql.end(); }
  await control(orgId, { supervised: false, kiosk: true });

  // Pantalla abierta antes de que el gimnasio pase a supervisar: «Mis rutinas» con su «Empezar».
  await page.reload();
  await page.getByRole("button", { name: "Entrenar", exact: true }).last().click();
  const own = page.getByRole("region", { name: "Mis rutinas" });
  await expect(own).toBeVisible();
  await control(orgId, { supervised: true, kiosk: true });
  await own.getByRole("button", { name: /Empezar|Continuar/ }).first().click();
  // El servidor la rechaza (403 supervised): se ve el motivo y la sección se actualiza sola, sin errores.
  await expect(page.getByText("En tu gimnasio las rutinas las planifica el equipo.").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Tu gimnasio planifica tus rutinas" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mis rutinas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /No vino el profe/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quiero entrenar por mi cuenta" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first()).toBeVisible(); // el programa asignado sigue
  await shots(page, info, "alumno-entrenar-supervisado", page.getByRole("region", { name: "Tu gimnasio planifica tus rutinas" }));
  // «Pedir un cambio al equipo» abre el pedido de siempre, dirigido al gimnasio.
  await page.getByRole("button", { name: "Pedir un cambio al equipo" }).click();
  const help = page.getByRole("dialog").last();
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: /Cerrar|Cancelar/ }).first().click();

  // Historial anterior: se puede cargar, pero unas notas de rutina no se ofrecen como rutina propia.
  await page.getByRole("button", { name: "Progreso", exact: true }).last().click();
  await page.getByRole("button", { name: "Cargar historial anterior" }).click();
  const imp = page.getByRole("dialog", { name: "Cargar historial anterior" });
  await imp.getByLabel(/O pegá el texto/).fill("Día A\nSentadilla 4x8 60 kg\n\nDía B:\nRemo con barra 3x12 40,5 kg");
  await imp.getByRole("button", { name: "Leer el texto" }).click();
  await expect(imp.getByRole("alert")).toContainText("Esto parece una rutina");
  await expect(page.getByRole("dialog", { name: /rutina/i })).toHaveCount(0);
  await imp.getByRole("button", { name: "Cerrar" }).click();

  // Inicio no ofrece cargar una rutina propia.
  await page.getByRole("button", { name: "Inicio", exact: true }).last().click();
  await expect(page.getByRole("button", { name: /¿Tenés tu propia rutina\?/ })).toHaveCount(0);

  // Perfil (avatar de Inicio): el código (nunca el PIN) y el cambio de PIN con las reglas del servidor.
  await page.getByRole("button", { name: "Perfil", exact: true }).first().click();
  const card = page.getByRole("region", { name: "Pantalla de rutinas del gimnasio" });
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Código 4 8 2 9 1 3")).toHaveText("482 913");
  await card.scrollIntoViewIfNeeded();
  await shots(page, info, "alumno-perfil-codigo", card);
  await card.getByRole("button", { name: "Cambiar mi PIN" }).click();
  await card.getByLabel("PIN nuevo").fill("1234");
  await card.getByLabel("Repetilo").fill("1234");
  await card.getByRole("button", { name: "Guardar PIN" }).click();
  await expect(card.getByRole("alert")).toContainText("menos obvio");
  await card.getByLabel("PIN nuevo").fill("4827");
  await card.getByLabel("Repetilo").fill("4826");
  await card.getByRole("button", { name: "Guardar PIN" }).click();
  await expect(card.getByRole("alert")).toContainText("no coinciden");
  await card.getByLabel("Repetilo").fill("4827");
  await shots(page, info, "alumno-perfil-pin", card.getByRole("button", { name: "Guardar PIN" }));
  await card.getByRole("button", { name: "Guardar PIN" }).click();
  await expect(page.getByText("Listo: tu PIN nuevo ya sirve en la pantalla del gimnasio.").first()).toBeVisible();
  await expect(card.getByLabel("PIN nuevo")).toHaveCount(0);
  await expect(card).not.toContainText("4827");
  await expectAccessible(page, info, "alumno-perfil-codigo");
  expect(errors.filter((e) => !/403/.test(e))).toEqual([]);
});

test("dueño: pantalla de rutinas, código y PIN del socio, política y gestión del equipo", async ({ page }, info) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "owner");
  const orgId = /\/gym\/([^?]+)/.exec(href)![1];
  await control(orgId, { supervised: false, kiosk: false });
  const go = (s: string, extra = "") => page.goto(href.replace("s=exec", `s=${s}${extra}`));

  // Sin habilitar: explica cómo pedirla y muestra la planificación (sólo lectura).
  await go("kiosk");
  await expect(page.getByRole("heading", { level: 1, name: "Pantalla de rutinas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Todavía no está habilitada" })).toBeVisible();
  await expect(page.getByText("Desactivada", { exact: true })).toBeVisible();
  await shots(page, info, "gym-pantalla-no-habilitada");

  await control(orgId, { supervised: true, kiosk: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pantallas autorizadas" })).toBeVisible();
  await expect(page.getByText("Activa", { exact: true })).toBeVisible();
  await page.getByLabel("Nombre de la pantalla").fill("Tablet sala de musculación");
  await page.getByRole("button", { name: "Registrar pantalla" }).click();
  const link = page.getByRole("region", { name: "Enlace de Tablet sala de musculación" });
  await expect(link).toBeVisible();
  await expect(link.locator("code")).toContainText("/rutinas#k=");
  await expect(link.getByRole("img", { name: /Código QR/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Tablet sala de musculación/ })).toBeVisible();
  await shots(page, info, "gym-pantalla-enlace", link);
  await expectAccessible(page, info, "gym-pantalla-enlace");
  await link.getByRole("button", { name: "Listo, ya la abrí" }).click();
  await expect(link).toHaveCount(0);
  await page.getByRole("button", { name: "Revocar Tablet sala de musculación" }).click();
  const conf = page.getByRole("dialog", { name: "¿Revocar «Tablet sala de musculación»?" });
  await expect(conf).toBeVisible();
  await shots(page, info, "gym-pantalla-revocar");
  await conf.getByRole("button", { name: "Revocar pantalla" }).click();
  await expect(conf).toHaveCount(0);
  await expect(page.getByText("Todavía no hay pantallas.")).toBeVisible();

  // Código y PIN de un socio desde la misma pantalla (el dueño no abre fichas): emitir (una sola vez), volver a emitir y revocar.
  await page.getByLabel("Buscar socio para su código").fill("Martina");
  await page.getByRole("listitem").filter({ hasText: "Martina López" }).click();
  const kc = page.locator(".kc-sel");
  await kc.getByRole("button", { name: "Emitir código y PIN" }).click();
  const issued = page.getByRole("dialog", { name: "Código y PIN de Martina López" });
  await expect(issued).toBeVisible();
  await expect(issued.getByLabel(/^PIN \d \d \d \d$/)).toBeVisible();
  const pin = (await issued.getByLabel(/^PIN \d \d \d \d$/).textContent())!.trim();
  await shots(page, info, "gym-socio-codigo-pin");
  await expectAccessible(page, info, "gym-socio-codigo-pin");
  await issued.getByRole("button", { name: "Listo, ya se lo di" }).click();
  await expect(issued).toHaveCount(0);
  await expect(kc.getByText(/Emitido/)).toBeVisible();
  await expect(kc.locator(".kc-cred")).not.toContainText(pin); // el PIN no se vuelve a ver
  await kc.getByRole("button", { name: "Generar código y PIN nuevos" }).click();
  const re = page.getByRole("dialog", { name: /Generar código y PIN nuevos/ });
  await expect(re).toContainText("dejan de servir");
  await re.getByRole("button", { name: "Generar nuevos" }).click();
  await expect(page.getByRole("dialog", { name: "Código y PIN de Martina López" })).toBeVisible();
  await page.keyboard.press("Escape");
  await kc.getByRole("button", { name: "Revocar", exact: true }).click();
  await page.getByRole("dialog", { name: /Revocar el código/ }).getByRole("button", { name: "Revocar código" }).click();
  await expect(kc.getByRole("button", { name: "Emitir código y PIN" })).toBeVisible();

  // Configuración: la política, sólo lectura.
  await go("config");
  await expect(page.getByRole("heading", { name: "Rutinas y pantalla del gimnasio" })).toBeVisible();
  await expect(page.getByText("Planificación supervisada (REPI Control)")).toBeVisible();

  // STF-09: cambiar el rol y quitar del equipo, con confirmación y resultado.
  await go("staff");
  await page.getByRole("button", { name: "Gestionar acceso de Lucas Medina" }).click();
  const dlg = page.getByRole("dialog", { name: "Acceso de Lucas Medina" });
  await expect(dlg.getByRole("group", { name: "Acceso actual" })).toContainText("Entrenador de sala · Palermo");
  await expect(dlg.getByRole("button", { name: "Guardar cambio" })).toBeDisabled(); // sin cambios
  await shots(page, info, "gym-equipo-gestionar");
  await expectAccessible(page, info, "gym-equipo-gestionar");
  await dlg.getByRole("button", { name: "Recepción" }).click();
  await dlg.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(dlg.getByRole("status")).toContainText("Actualizaste el acceso de Lucas");
  await dlg.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByRole("row", { name: /Lucas Medina/ })).toContainText("Recepción");
  await page.getByRole("button", { name: "Gestionar acceso de Lucas Medina" }).click();
  await dlg.getByRole("button", { name: "Quitar del equipo" }).click();
  await expect(dlg.getByRole("heading", { name: "¿Quitar a Lucas del equipo?" })).toBeFocused();
  await expect(dlg).toContainText("Pierde el acceso al instante");
  await expect(dlg).toContainText("vuelven a la cola");
  await expect(dlg).toContainText("se conserva");
  await dlg.getByLabel(/Motivo/).fill("Dejó de trabajar en el gimnasio");
  await shots(page, info, "gym-equipo-quitar");
  await dlg.getByRole("button", { name: "Sí, quitar acceso" }).click();
  await expect(dlg.getByRole("status")).toContainText("Lucas Medina ya no tiene acceso al gimnasio.");
  await shots(page, info, "gym-equipo-quitado");
  await dlg.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByRole("row", { name: /Lucas Medina/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ficha del socio (gerencia de la sede): bloque «Pantalla de rutinas» con el código vigente", async ({ page }, info) => {
  const errors = watchErrors(page);
  const href = await openDemo(page, "floor");
  const orgId = /\/gym\/([^?]+)/.exec(href)![1];
  await control(orgId, { supervised: true, kiosk: true });
  // La demo de sala no tiene gerencia: Sofía suma ese rol en su sede (sólo en la organización de la demo) para ver el bloque.
  const sql = e2eDb();
  let memberId = "";
  try {
    const [f] = await sql<{ user_id: string; location_id: string }[]>`select sm.user_id, sm.location_id from staff_membership sm join "user" u on u.id = sm.user_id join organization o on o.id = sm.org_id
      where sm.org_id = ${orgId} and o.is_demo and u.name = 'Sofía Ramírez' and sm.role = 'floor_trainer'`;
    await sql`insert into staff_membership (user_id, org_id, location_id, role) values (${f.user_id}, ${orgId}, ${f.location_id}, 'manager')`;
    const [m] = await sql<{ id: string }[]>`select gm.id from gym_member gm join "user" u on u.id = gm.user_id where gm.org_id = ${orgId} and u.name = 'Martina López'`;
    memberId = m.id;
  } finally { await sql.end(); }
  await page.goto(href.replace("s=shift", `s=member&sel=${memberId}`));
  const kc = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Pantalla de rutinas" }) });
  await expect(kc).toBeVisible();
  await kc.getByRole("button", { name: "Emitir código y PIN" }).click();
  const issued = page.getByRole("dialog", { name: "Código y PIN de Martina López" });
  await expect(issued).toBeVisible();
  await issued.getByRole("button", { name: "Listo, ya se lo di" }).click();
  await expect(kc.getByText("Código", { exact: true })).toBeVisible();
  await expect(kc.getByText(/último uso nunca/)).toBeVisible();
  await kc.scrollIntoViewIfNeeded();
  await shots(page, info, "gym-ficha-pantalla", kc);
  await expectNoHorizontalOverflow(page, "ficha del socio con pantalla de rutinas");
  expect(errors).toEqual([]);
});
