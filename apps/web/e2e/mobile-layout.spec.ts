import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertLocalTarget, expectNoHorizontalOverflow, openDemo, watchErrors } from "./helpers";

// D184: en el teléfono nada tapa una acción (la píldora de la demo, la barra de acciones, los diálogos), también en pantallas
// chicas, y el alumno arma su propia rutina con un drop set con el mismo editor que el coach. Viewports emulados con
// Playwright (Chromium): no reemplaza la prueba en teléfonos físicos (Safari de iOS, teclado real, zona segura real).
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

/** Controles visibles dentro de `scope` cuyo centro recibe otro elemento (algo los tapa). */
async function covered(scope: Locator) {
  return scope.evaluate((root) => {
    const vw = innerWidth, vh = innerHeight;
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden" || cs.pointerEvents === "none" || el.closest("[inert]")) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > vw || y > vh) continue; // fuera de la pantalla: se llega desplazando
      // Recortado por un contenedor con scroll: tampoco es una superposición.
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const o = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(o.overflow + o.overflowY)) { const q = p.getBoundingClientRect(); if (y < q.top || y > q.bottom || x < q.left || x > q.right) { clipped = true; break; } }
        p = p.parentElement;
      }
      if (clipped) continue;
      const ok = () => { const q = el.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!h && (h === el || el.contains(h) || h.contains(el)); };
      if (ok()) continue;
      // Debajo de un pie fijo de un panel con scroll (p. ej. «Guardar»): se llega desplazando. Si centrado sigue tapado, es real.
      el.scrollIntoView({ block: "center", inline: "nearest" });
      if (ok()) continue;
      const hit = document.elementFromPoint(x, y);
      out.push(`${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)} ← ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}` : "nada"}`);
    }
    return out;
  });
}
const startWorkout = async (page: Page) => {
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie 1$/ })).toBeVisible();
};

test("pantallas chicas: descanso, etapas y barra de acciones sin nada encima (con la píldora de la demo)", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile", "viewports de teléfono");
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await expect(page.locator(".dt-pill")).toBeVisible(); // la píldora está: es justo el caso que se reportó
  for (const vp of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    expect(await covered(page.locator("body")), `inicio ${vp.width}×${vp.height}`).toEqual([]);
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await startWorkout(page);
  await page.getByRole("button", { name: "Completar serie 1" }).click();
  const skipRest = page.getByRole("button", { name: "Saltar descanso" });
  await expect(skipRest).toBeVisible();
  for (const vp of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    expect(await covered(page.locator(".dock")), `descanso ${vp.width}×${vp.height}`).toEqual([]);
    await expectNoHorizontalOverflow(page, `descanso ${vp.width}`);
  }
  await skipRest.click(); // se toca de verdad: Playwright falla si otro elemento recibe el toque
  await expect(page.getByRole("button", { name: "Completar serie 2" })).toBeVisible();
  // Barra de la serie en curso (peso, reps, RIR, sensación, completar) en la pantalla más chica.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  expect(await covered(page.locator(".dock")), "serie en curso 320").toEqual([]);
  // Teclado numérico: escribir el peso no deja el campo debajo de otra cosa.
  await page.getByRole("button", { name: /Tocá para escribir el peso/ }).click();
  const w = page.getByRole("textbox", { name: /Peso en/ });
  await expect(w).toBeFocused();
  expect(await covered(page.locator(".dock")), "peso en edición 320").toEqual([]);
  await w.press("Escape");
  expect(errors).toEqual([]);
});

test("alumno: arma su rutina con un drop set (mismo editor que el coach), la guarda y la entrena con etapas", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.scrollIntoViewIfNeeded();
  await mine.getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await sheet.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Elevaciones laterales");
  await sheet.getByRole("button", { name: /^Elevaciones laterales/ }).first().click();
  await sheet.getByRole("textbox", { name: "Nombre" }).fill("Hombros con drop");
  await sheet.getByRole("button", { name: /Series y técnica de Elevaciones laterales/ }).click();
  const dx = page.getByRole("dialog", { name: /Series y técnica · Elevaciones laterales/ });
  await expect(dx).toBeVisible();
  await dx.getByRole("button", { name: "Drop set", exact: true }).click();
  await expect(dx.getByRole("status")).toContainText("Serie 3: 2 drops conectados");
  if (test.info().project.name === "mobile") expect(await covered(dx), "editor de técnica").toEqual([]);
  await dx.getByRole("button", { name: "Aplicar" }).click();
  await expect(dx.getByText("Drop 2", { exact: true })).toBeVisible();
  // Esc con el editor encima de la hoja cierra sólo el editor (pregunta por los cambios), no la hoja de la rutina.
  page.once("dialog", (d) => void d.dismiss());
  await dx.getByRole("button", { name: "Deshacer" }).focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await dx.getByRole("button", { name: "Guardar" }).click();
  await expect(dx).toHaveCount(0);
  await expect(sheet.getByText(/Drop set · 3 series · 3\.ª con drops \(2\)/)).toBeVisible();
  await expect(sheet.getByRole("spinbutton", { name: "Series de Elevaciones laterales" }).or(sheet.getByRole("textbox", { name: "Series de Elevaciones laterales" }))).toBeDisabled();
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  await expect(sheet).toHaveCount(0);
  const card = mine.locator(".or-card").filter({ hasText: "Hombros con drop" });
  await expect(card.getByText(/Drop set/)).toBeVisible();
  await expect(card.getByText(/3×/)).toBeVisible(); // series principales, no 5 filas
  await card.getByRole("button", { name: /Empezar|Continuar el que está en curso/ }).click();
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem", { name: /^Drop 1 de la serie 3:/ })).toBeVisible();
  await expect(list.getByRole("listitem", { name: /^Drop 2 de la serie 3:/ })).toBeVisible();
  await expect(page.getByText(/3 series · /).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("alumno: importa una rutina con métodos escritos; lo claro se aplica, lo ambiguo se pregunta y todo se edita antes de guardar", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.getByRole("button", { name: /Subir foto, captura o archivo|Subir/ }).first().click();
  const up = page.getByRole("dialog", { name: "Subir mi rutina" });
  await up.getByRole("textbox").fill("Día,Ejercicio,Series,Reps,Peso,Técnica\nHombros,Elevaciones laterales,3,12,6,drop set en la última\nHombros,Remo en polea,3,10,40,pirámide");
  await up.getByRole("button", { name: "Leer el texto" }).click();
  const rev = page.getByRole("dialog", { name: "Revisá tu rutina" });
  // Smart Import 2.0: cada ejercicio es una fila plegable; lo que necesita respuesta se abre solo y cuenta «para revisar».
  const ask = rev.getByRole("group", { name: /Método de Remo en polea/ });
  await expect(ask).toContainText("¿Es Pirámide?"); // ambiguo: se pregunta (fila abierta sola), no se transforma
  await expect(rev.getByText("1 para revisar")).toBeVisible();
  await rev.getByRole("button", { name: /^Elevaciones laterales/ }).click();
  await expect(rev.getByText(/Método: .*Drop set/)).toBeVisible(); // claro: aplicado a la vista
  await expect(rev.getByText(/Leído de «drop set»/)).toBeVisible();
  await ask.getByRole("button", { name: "No, dejar como nota" }).click();
  await expect(rev.getByText(/para revisar/)).toHaveCount(0);
  if (test.info().project.name === "mobile") expect(await covered(rev)).toEqual([]);
  await rev.getByRole("button", { name: "Guardar rutina" }).click();
  const card = mine.locator(".or-card").filter({ hasText: "Hombros" });
  await expect(card.getByText(/Drop set/)).toBeVisible();
  await expect(card.getByText(/pirámide/)).toHaveCount(0); // la nota no se muestra en la tarjeta, pero no se convirtió en método
  expect(errors).toEqual([]);
});
