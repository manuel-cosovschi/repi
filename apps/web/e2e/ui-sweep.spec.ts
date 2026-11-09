import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { assertLocalTarget, expectAccessible, openDemo, watchErrors, type DemoRole } from "./helpers";

// FSA1 · barrido de UI (Chromium emulado; no reemplaza Safari de iOS ni teléfonos físicos). Recorre cada sección de cada rol de
// la demo y las páginas públicas en anchos de teléfono (proyecto «mobile», táctil) y de tableta y escritorio (proyecto
// «desktop») y verifica invariantes que se rompen sin que nadie lo note:
//   · sin scroll horizontal ni controles fuera de la pantalla;
//   · ningún control tapado por la barra de pestañas, la píldora de la demo u otra capa (se prueba desplazándolo al centro);
//   · en pantallas táctiles, los campos con ≥ 16 px (con menos, iOS hace zoom al enfocarlos);
//   · nada queda «Cargando…» o en esqueleto más de 10 s;
//   · sin errores de consola, de página ni 5xx.
// Contraste, nombres accesibles y tamaño mínimo de toque (WCAG 2.2 AA, axe) ya los cubren theme-visual.spec.ts y roles.spec.ts
// en cada sección; acá axe corre en las pantallas de profundidad que esas pruebas no abren. UI_SWEEP_FULL=1 recorre todos
// los anchos del barrido (320, 360, 375, 390, 430 · 768, 1024, 1366); por defecto, los extremos.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.describe.configure({ timeout: 420_000 });

const FULL = !!process.env.UI_SWEEP_FULL;
const PHONES = (FULL ? [320, 360, 375, 390, 430] : [320, 390]).map((width) => ({ width, height: width <= 320 ? 568 : width <= 375 ? 667 : 844 }));
const BIG = FULL ? [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1366, height: 860 }] : [{ width: 768, height: 1024 }, { width: 1366, height: 860 }];
const widths = (info: TestInfo) => (info.project.name === "mobile" ? PHONES : BIG);

/** Problemas de diseño de la pantalla actual (lista vacía = bien). */
async function layoutProblems(page: Page, touch: boolean): Promise<string[]> {
  return page.evaluate((touch) => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const label = (el: Element) => ((el.getAttribute("aria-label") || (el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.getAttribute("title") || el.tagName) ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
    const visible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest("[inert],[aria-hidden=true]"); };
    const clipper = (el: HTMLElement) => { let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(o.overflowX + o.overflowY + o.overflow)) return p; p = p.parentElement; } return null; };
    const scroll = document.documentElement.scrollWidth - vw;
    if (scroll > 1) out.push(`scroll horizontal de ${scroll}px`);
    const controls = [...document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=radio], summary")].filter(visible);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      const cp = clipper(el);
      if (!cp && getComputedStyle(el).position !== "fixed" && (r.right > vw + 1 || r.left < -1)) out.push(`fuera de la pantalla: «${label(el)}» (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`);
      if (touch && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/(checkbox|radio|range|file|button|submit|reset|color|image)/.test((el as HTMLInputElement).type)) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) out.push(`campo con ${fs}px en pantalla táctil (iOS hace zoom): «${label(el)}»`);
      }
      if (getComputedStyle(el).pointerEvents === "none") continue;
      const hitOk = () => { const q = el.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; if (x < 0 || y < 0 || x > vw || y > vh) return true; const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h) || h.contains(el) || (!!el.closest("label") && h.closest("label") === el.closest("label"))); };
      if (hitOk()) continue;
      const sy = scrollY;
      // Se prueba en el centro y arriba: una barra fija alta (la del entrenamiento en una tableta apaisada) tapa el centro
      // pero deja libre la parte de arriba, adonde la persona desplaza.
      el.scrollIntoView({ block: "center", inline: "nearest" });
      if (!hitOk()) el.scrollIntoView({ block: "start", inline: "nearest" });
      if (!hitOk()) {
        const q = el.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        // Dentro de un contenedor con scroll recortado (carrusel, lista): se llega desplazando ese contenedor.
        const inClip = cp && (() => { const c = cp.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; return x < c.left || x > c.right || y < c.top || y > c.bottom; })();
        if (!inClip) out.push(`tapado: «${label(el)}» ← ${h ? `${h.tagName.toLowerCase()}.${String(h.className).split(" ")[0]}` : "nada"}`);
      }
      scrollTo(0, sy);
    }
    return [...new Set(out)];
  }, touch);
}

/** Nada queda cargando (texto «Cargando…» o esqueleto visibles) después de 10 s. */
async function expectSettled(page: Page, where: string) {
  await expect.poll(() => page.evaluate(() => {
    const vis = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert],.sr-only"); };
    const loading = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => el.children.length === 0 && /^Cargando/.test(el.textContent?.trim() ?? "") && vis(el));
    const skel = [...document.querySelectorAll<HTMLElement>(".skel")].filter(vis);
    return [...loading.map((e) => e.textContent!.trim().slice(0, 40)), ...(skel.length ? [`${skel.length} esqueletos`] : [])];
  }), { message: `${where}: sigue cargando`, timeout: 10_000, intervals: [250, 500, 1000] }).toEqual([]).catch((e: Error) => { expect.soft(e.message, where).toBe(""); });
}

async function check(page: Page, info: TestInfo, where: string) {
  await expectSettled(page, where);
  for (const vp of widths(info)) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(120);
    // Blando: un recorrido junta todos los problemas de todas las pantallas en vez de cortar en el primero.
    expect.soft(await layoutProblems(page, info.project.name === "mobile"), `${where} @${vp.width}`).toEqual([]);
  }
}

async function staffSections(page: Page) {
  // El menú está en el DOM aunque el cajón del teléfono esté cerrado: se lee de ahí y se navega con el mismo botón.
  await expect(page.locator(".co-nav button").first()).toBeAttached();
  return page.locator(".co-nav button").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
}
async function goStaff(page: Page, title: string) {
  // En el teléfono el menú es un cajón: se espera su botón (la app ya cargó) y se abre.
  const menu = page.getByRole("button", { name: "Abrir menú" });
  if (test.info().project.name === "mobile") { await expect(menu).toBeVisible(); await menu.click(); }
  const item = page.locator(`.co-nav button[title="${title}"]`);
  await item.click();
  await expect(page.locator(".co")).toHaveAttribute("data-drawer", "0");
  await expect(item).toHaveAttribute("aria-current", "page");
  // Las secciones visitadas siguen montadas (ocultas): se mira sólo la visible.
  await expect(page.locator(".co-content :is(h1, h2):visible").first()).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => {});
}

for (const role of ["coach", "owner", "floor"] as DemoRole[]) {
  test(`${role}: cada sección sin desborde, sin controles tapados, campos táctiles ≥ 16 px y sin cargas eternas`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await openDemo(page, role);
    for (const title of await staffSections(page)) {
      await goStaff(page, title);
      await check(page, info, `${role} › ${title}`);
    }
    expect(errors).toEqual([]);
  });
}

test("alumno: cada pestaña, el perfil y el entrenamiento en curso", async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav).toBeVisible();
  await page.waitForLoadState("networkidle");
  for (const tab of await nav.getByRole("button").all()) {
    const name = (await tab.innerText()).trim();
    await tab.click();
    await check(page, info, `alumno › ${name}`);
  }
  await nav.getByRole("button").first().click();
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
  await check(page, info, "alumno › Perfil");
  await nav.getByRole("button").first().click();
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: /^Completar serie \d+$/ }).first()).toBeVisible();
  await check(page, info, "alumno › entrenamiento");
  await expectAccessible(page, info, "alumno-entrenamiento");
  expect(errors).toEqual([]);
});

for (const [role, section, where] of [["coach", "Clientes", "ficha del cliente"], ["floor", "Socios", "ficha del socio"]] as const) {
  test(`pantalla de profundidad: ${where} (${role})`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await openDemo(page, role);
    await goStaff(page, section);
    const row = page.locator(".list-pane .crow:visible").nth(1);
    const name = (await row.locator("b").first().innerText({ timeout: 15_000 })).trim();
    await row.click();
    // Teléfono: la ficha sola. Escritorio: lista y ficha lado a lado, con la fila marcada. En ambos, el nombre a la vista
    // fuera de la lista.
    await expect(page.locator(".co-content").getByText(name, { exact: true }).filter({ visible: true }).and(page.locator(":not(.list-pane *)")).first()).toBeVisible();
    await check(page, info, `${role} › ${where}`);
    await expectAccessible(page, info, `${role}-ficha`);
    expect(errors).toEqual([]);
  });
}

const PUBLIC = ["/", "/conoce", "/conoce/gimnasios", "/conoce/entrenadores", "/conoce/deportistas", "/conoce/aliados", "/qr", "/acceso", "/ingreso", "/unirse/no-existe", "/activar/no-existe", "/tutor/no-existe",
  "/legal/terms", "/legal/privacy", "/legal/dpa", "/ayuda", "/instalar", "/instalar/cartel", "/ranking/pantalla", "/ingreso/pantalla", "/creditos", "/demo"];
test("páginas públicas: sin desborde, sin controles tapados, campos táctiles ≥ 16 px", async ({ page }, info) => {
  const errors = watchErrors(page);
  for (const path of PUBLIC) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle").catch(() => {});
    await check(page, info, path);
  }
  expect(errors).toEqual([]);
});

test("QR o invitación vencidos: no queda «Cargando…» para siempre; se explica y hay cómo seguir", async ({ page }) => {
  for (const [path, title] of [["/unirse/qr-que-no-existe", "No pudimos abrir tu sede"], ["/activar/enlace-que-no-existe", "No pudimos abrir tu invitación"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible(); // el motivo (QR vencido, enlace inválido)
    await expect(page.getByText(/^Cargando/)).toHaveCount(0);
    await page.getByRole("button", { name: "Ir a ingresar" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  }
});
