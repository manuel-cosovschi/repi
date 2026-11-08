import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// M06 «Carril» (docs/MOTION_NAVEGACION.md): navegación fluida sin perder velocidad. Mide con cuadros reales (rAF) el arranque
// del indicador, los cuadros vacíos, los saltos de diseño (layout-shift), las tareas largas, los toques rápidos, el foco y
// el movimiento reducido. Con MOTION_BASELINE=1 sólo registra los números (línea base de main) y no exige los objetivos.
// Demos guiadas (entorno ficticio is_demo); nunca contra producción.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.use({ reducedMotion: "no-preference" });
const BASELINE = !!process.env.MOTION_BASELINE;

type Frame = { t: number; pillX: number | null; maxOp: number; content: boolean; leaving: number; panes: number };
type Step = { to: string; visit: "primera" | "vuelta"; pillFrames: number | null; pillMs: number | null; blank: number; cls: number; longTasks: number; maxTask: number; shifts?: string[] };

/** Instala el muestreo por cuadro y los observadores. Se llama una vez por página. */
async function installProbe(page: Page) {
  await page.evaluate(() => {
    type W = Window & { __mn?: Record<string, unknown> };
    const w = window as W;
    if (w.__mn) return;
    const eff = (el: Element | null) => { let o = 1; while (el && el !== document.documentElement) { o *= parseFloat(getComputedStyle(el).opacity || "1"); el = el.parentElement; } return o; };
    const pill = () => { const el = document.querySelector<HTMLElement>(".tab-ind:not([data-off]), .co-nav .slide-ind"); if (!el) return null; const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform); return Math.round((m.m41 + m.m42) * 10) / 10; };
    const state = { t0: 0, frames: [] as unknown[], shifts: [] as { t: number; v: number; src?: string }[], tasks: [] as { t: number; d: number }[] };
    // La navegación ocurre en el click (pointerup): desde ahí se cuentan los cuadros.
    document.addEventListener("click", () => { state.t0 = performance.now(); }, true);
    const desc = (n: Node | null) => { const e = n as HTMLElement | null; if (!e?.tagName) return "?"; const t = (e.querySelector?.("h1,h2,b,strong")?.textContent ?? e.textContent ?? "").trim().slice(0, 24); return `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}«${t}»`; };
    new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; sources?: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) state.shifts.push({ t: e.startTime, v: e.value, src: (e.sources ?? []).slice(0, 3).map((x) => `${desc(x.node)} ${Math.round(x.previousRect.y)}→${Math.round(x.currentRect.y)}`).join(" | ") }); }).observe({ type: "layout-shift", buffered: false });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) state.tasks.push({ t: e.startTime, d: e.duration }); }).observe({ type: "longtask", buffered: false }); } catch { /* sin longtask */ }
    const sample = (ms: number) => new Promise<unknown[]>((res) => {
      const out: unknown[] = []; const start = performance.now();
      const tick = () => {
        const now = performance.now();
        const panes = [...document.querySelectorAll<HTMLElement>("main .tab-pane, .co-content .co-pane, .co-content[data-section]")].filter((p) => getComputedStyle(p).display !== "none");
        let maxOp = 0, content = false;
        for (const p of panes) {
          const op = eff(p); maxOp = Math.max(maxOp, op);
          const head = [...p.querySelectorAll<HTMLElement>("h1, .mb-chathead")].find((h) => h.getBoundingClientRect().height > 0);
          if (op >= .45 && head) content = true;
        }
        out.push({ t: now, pillX: pill(), maxOp: Math.round(maxOp * 100) / 100, content, leaving: panes.filter((p) => p.hasAttribute("data-leaving")).length, panes: panes.length });
        if (now - start < ms) requestAnimationFrame(tick); else res(out);
      };
      requestAnimationFrame(tick);
    });
    w.__mn = { state, sample };
  });
}

/** Toca un destino y mide el cambio: indicador, cuadros vacíos, layout-shift (todos, con o sin entrada reciente) y tareas largas. */
async function measureTap(page: Page, click: () => Promise<void>, to: string, visit: Step["visit"], settle = 1000): Promise<Step> {
  await page.evaluate(() => { const s = (window as unknown as { __mn: { state: { shifts: unknown[]; tasks: unknown[]; t0: number } } }).__mn.state; s.shifts.length = 0; s.tasks.length = 0; s.t0 = 0; });
  const frames = page.evaluate((ms) => (window as unknown as { __mn: { sample: (ms: number) => Promise<Frame[]> } }).__mn.sample(ms), settle);
  await page.waitForTimeout(32);
  await click();
  const fr = await frames;
  const r = await page.evaluate(() => { const s = (window as unknown as { __mn: { state: { t0: number; shifts: { t: number; v: number; src?: string }[]; tasks: { t: number; d: number }[] } } }).__mn.state; return { t0: s.t0, shifts: s.shifts, tasks: s.tasks }; });
  const after = fr.filter((f) => f.t >= r.t0);
  const before = fr.filter((f) => f.t < r.t0).at(-1)?.pillX ?? after[0]?.pillX ?? null;
  const final = fr.at(-1)?.pillX ?? null;
  const moved = after.findIndex((f) => f.pillX != null && before != null && Math.abs(f.pillX - before) > .5);
  const arrived = after.find((f) => f.pillX != null && final != null && Math.abs(f.pillX - final) < 1 && (before == null || Math.abs(final - before) > .5));
  const win = after.filter((f) => f.t - r.t0 <= 400);
  return {
    to, visit,
    pillFrames: before != null && final != null && Math.abs(final - before) > .5 ? (moved < 0 ? null : moved + 1) : null,
    pillMs: arrived ? Math.round(arrived.t - r.t0) : null,
    blank: win.filter((f) => !f.content).length,
    cls: Math.round(r.shifts.filter((x) => x.t >= r.t0).reduce((a, x) => a + x.v, 0) * 1000) / 1000,
    longTasks: r.tasks.filter((x) => x.t >= r.t0 && x.d > 50).length,
    maxTask: Math.round(Math.max(0, ...r.tasks.filter((x) => x.t >= r.t0).map((x) => x.d))),
    ...(r.shifts.some((x) => x.t >= r.t0 && x.v > .001) ? { shifts: r.shifts.filter((x) => x.t >= r.t0 && x.v > .001).map((x) => `${Math.round(x.t - r.t0)}ms ${x.v.toFixed(3)} ${x.src ?? ""}`) } : {}),
  };
}

const tabBtn = (page: Page, name: string) => page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: new RegExp(`^${name}`) });

async function report(info: TestInfo, name: string, rows: unknown) {
  await info.attach(`${name}.json`, { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
  console.log(`MOTION_METRIC ${info.project.name} ${name} ${JSON.stringify(rows)}`);
}

async function throttle(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  return cdp;
}

async function memberReady(page: Page) {
  await openDemo(page, "member");
  await expect(page.getByRole("heading", { level: 1, name: /^Hola/ })).toBeVisible();
  await expect(tabBtn(page, "Gym")).toBeVisible(); // la pestaña Gym llega con el inbox
  await page.waitForTimeout(800); // BrandIntro y cargas iniciales
  await installProbe(page);
}

test.describe("alumno", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "la app del alumno se mide en el teléfono"));

  test("recorrido de la grabación: indicador, cuadros vacíos, saltos y tareas largas (CPU ×4)", async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await memberReady(page);
    await throttle(page, 4);
    const route: [string, string, Step["visit"]][] = [["Entrenar", "train", "primera"], ["Progreso", "prog", "primera"], ["Mensajes", "msgs", "primera"], ["Gym", "gym", "primera"],
      ["Inicio", "home", "vuelta"], ["Entrenar", "train", "vuelta"], ["Progreso", "prog", "vuelta"], ["Mensajes", "msgs", "vuelta"], ["Gym", "gym", "vuelta"], ["Inicio", "home", "vuelta"]];
    const rows: Step[] = [];
    for (const [name, key, visit] of route) {
      const b = tabBtn(page, name);
      await b.scrollIntoViewIfNeeded();
      const box = (await b.boundingBox())!;
      rows.push(await measureTap(page, () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2), key, visit, 1200));
    }
    await report(info, "recorrido", rows);
    expect(errors).toEqual([]);
    if (BASELINE) return;
    for (const r of rows) {
      expect.soft(r.pillFrames, `${r.to}: el indicador arranca en ≤ 2 cuadros`).not.toBeNull();
      expect.soft(r.pillFrames ?? 99, `${r.to}: cuadros hasta mover el indicador`).toBeLessThanOrEqual(2);
      expect.soft(r.pillMs ?? 9999, `${r.to}: indicador en destino`).toBeLessThanOrEqual(300);
      expect.soft(r.blank, `${r.to} (${r.visit}): cuadros sin contenido`).toBe(0);
      expect.soft(r.cls, `${r.to} (${r.visit}): layout-shift`).toBeLessThanOrEqual(r.visit === "vuelta" ? 0.01 : 0.05);
      if (r.visit === "vuelta") expect.soft(r.maxTask, `${r.to}: tarea más larga al volver`).toBeLessThanOrEqual(50);
    }
  });

  // QA M06: con la red de un teléfono real (450 ms por pedido) y CPU ×4, la primera visita a Progreso saltaba al llegar los
  // datos (CLS 0,08–0,10: esqueleto más bajo que lo real y las marcas «Nuevo» corrían las pestañas) y Tu gym pintaba el
  // contenido un cuadro, lo apagaba bajo el ambiente M03 y lo volvía a mostrar.
  test("primera visita con latencia: Progreso no salta y Tu gym no parpadea", async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.route("**/api/**", async (r) => { if (!r.request().url().includes("/api/demo")) await new Promise((s) => setTimeout(s, 450)); await r.continue(); });
    await memberReady(page);
    await page.waitForTimeout(1200); // con la latencia, las cargas iniciales tardan más
    await throttle(page, 4);
    const click = async (name: string) => { const box = (await tabBtn(page, name).boundingBox())!; await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); };
    const prog = await measureTap(page, () => click("Progreso"), "prog", "primera", 2600);
    const gymFrames = page.evaluate(() => new Promise<{ t: number; op: number | null }[]>((res) => {
      const eff = (el: Element | null) => { let o = 1; while (el && el !== document.documentElement) { const cs = getComputedStyle(el); if (cs.display === "none") return 0; o *= parseFloat(cs.opacity || "1"); el = el.parentElement; } return o; };
      const out: { t: number; op: number | null }[] = []; const t0 = performance.now();
      const tick = () => {
        const el = document.querySelector('[role="tablist"][aria-label="Secciones del gym"] + div');
        out.push({ t: Math.round(performance.now() - t0), op: el ? Math.round(eff(el) * 100) / 100 : null });
        if (performance.now() - t0 < 2600) requestAnimationFrame(tick); else res(out);
      };
      requestAnimationFrame(tick);
    }));
    await page.waitForTimeout(32);
    await click("Gym");
    const gf = await gymFrames;
    const firstFull = gf.findIndex((f) => (f.op ?? 0) >= .9);
    const dipAfterFull = firstFull < 0 ? null : Math.min(...gf.slice(firstFull).map((f) => f.op ?? 0));
    await report(info, "latencia", { prog, gym: { firstFullMs: firstFull < 0 ? null : gf[firstFull].t, dipAfterFull } });
    expect(errors).toEqual([]);
    if (BASELINE) return;
    expect.soft(prog.blank, "Progreso: cuadros sin contenido").toBe(0);
    expect.soft(prog.cls, "Progreso (primera, con latencia): layout-shift").toBeLessThanOrEqual(0.05);
    expect(firstFull, "Tu gym: el contenido termina a la vista").toBeGreaterThanOrEqual(0);
    expect(dipAfterFull ?? 0, "Tu gym: una vez a la vista, el contenido no se apaga").toBeGreaterThanOrEqual(.5);
  });

  test("cinco toques en 250 ms terminan en la última sección, sin paneles trabados", async ({ page }, info) => {
    await memberReady(page);
    await throttle(page, 4);
    const names = ["Entrenar", "Progreso", "Mensajes", "Gym", "Progreso"];
    // Cinco toques en 250 ms, despachados desde la página (Playwright con CPU ×4 no llega a ese ritmo).
    const spent = await page.evaluate((ns) => new Promise<number>((res) => {
      const t0 = performance.now();
      const btn = (n: string) => [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Principal"] button')].find((b) => b.querySelector(".tab-lbl")?.textContent === n)!;
      ns.forEach((n, i) => setTimeout(() => { const b = btn(n); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); b.click(); if (i === ns.length - 1) res(Math.round(performance.now() - t0)); }, i * 50));
    }), names);
    await page.waitForTimeout(350);
    const st = await page.evaluate(() => ({
      visible: [...document.querySelectorAll<HTMLElement>("main .tab-pane")].filter((p) => getComputedStyle(p).display !== "none" && !p.hasAttribute("data-leaving")).map((p) => p.dataset.sec ?? p.querySelector("h1")?.textContent ?? "?"),
      // Las secciones ocultas (Activity, display:none) pueden conservar atributos viejos hasta que React tenga tiempo libre:
      // sólo cuentan las que están a la vista.
      leaving: [...document.querySelectorAll<HTMLElement>("[data-leaving]")].filter((p) => getComputedStyle(p).display !== "none").length,
      fixed: [...document.querySelectorAll<HTMLElement>("main .tab-pane")].filter((p) => getComputedStyle(p).position === "fixed").length,
      current: document.querySelector('nav[aria-label="Principal"] [aria-current="page"] .tab-lbl')?.textContent,
      h1: [...document.querySelectorAll<HTMLElement>("main h1")].filter((h) => h.getBoundingClientRect().height > 0).map((h) => h.textContent),
    }));
    await report(info, "toques-rapidos", { spentMs: spent, ...st });
    if (BASELINE) return;
    expect(st.visible).toHaveLength(1);
    expect(st.leaving).toBe(0);
    expect(st.fixed).toBe(0);
    expect(st.current).toBe("Progreso");
    expect(st.h1).toEqual(["Progreso"]);
  });

  test("lo que entra responde al toque enseguida y el foco sigue la regla", async ({ page }, info) => {
    await memberReady(page);
    // Un toque dentro de la sección nueva 60 ms después del cambio funciona (nada queda tapado ni inerte).
    await tabBtn(page, "Progreso").click();
    await page.waitForTimeout(60);
    const seg = page.getByRole("tab", { name: "Historial" });
    const segOk = await seg.click({ timeout: 2000 }).then(() => true).catch(() => false);
    if (segOk) await expect(seg).toHaveAttribute("aria-selected", "true");
    // La barra conserva el foco en el botón tocado (convención nativa).
    await tabBtn(page, "Entrenar").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const barFocus = await page.evaluate(() => document.activeElement?.closest('nav[aria-label="Principal"]') != null);
    // Desde una acción dentro de la sección (foco en lo que sale), el foco pasa al h1 de la nueva.
    await tabBtn(page, "Inicio").click();
    await page.waitForTimeout(300);
    const avatar = page.getByRole("button", { name: "Perfil" });
    await avatar.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 40) }));
    await report(info, "foco", { segOk, barFocus, after });
    if (BASELINE) return;
    expect(segOk).toBe(true);
    expect(barFocus).toBe(true);
    expect(after).toEqual({ tag: "H1", text: "Perfil" });
  });

  test("movimiento reducido: cambio inmediato, sin animaciones", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await memberReady(page);
    await tabBtn(page, "Progreso").click();
    const st = await page.evaluate(() => new Promise<{ anims: number; op: number; leaving: number }>((res) => requestAnimationFrame(() => {
      const panes = [...document.querySelectorAll<HTMLElement>("main .tab-pane")].filter((p) => getComputedStyle(p).display !== "none");
      res({ anims: document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity).length, op: Math.min(...panes.map((p) => parseFloat(getComputedStyle(p).opacity))), leaving: panes.filter((p) => p.hasAttribute("data-leaving")).length });
    })));
    await report(info, "movimiento-reducido", st);
    if (BASELINE) return;
    expect(st.anims).toBe(0);
    expect(st.op).toBe(1);
    expect(st.leaving).toBe(0);
  });

  test("sin id duplicados ni dos h1 expuestos después de recorrer todas las secciones", async ({ page }, info) => {
    await memberReady(page);
    for (const n of ["Entrenar", "Progreso", "Mensajes", "Gym", "Inicio"]) { await tabBtn(page, n).click(); await page.waitForTimeout(350); }
    const st = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((e) => e.id).filter(Boolean);
      const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      const h1 = [...document.querySelectorAll<HTMLElement>("h1")].filter((h) => h.checkVisibility?.() ?? h.getBoundingClientRect().height > 0).length;
      return { dup, h1 };
    });
    await report(info, "ids", st);
    if (BASELINE) return;
    expect(st.dup).toEqual([]);
    expect(st.h1).toBe(1);
  });

  test("hojas: cierran en el acto, el foco vuelve y la copia de salida se va sola", async ({ page }, info) => {
    test.skip(BASELINE, "la copia de salida es nueva");
    await memberReady(page);
    const bell = page.getByRole("button", { name: /^Notificaciones/ });
    await bell.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 100 });
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")).toMatch(/^Notificaciones/);
    const ghost = await page.evaluate(() => { const g = document.querySelector("[data-ghost]"); return g ? { inert: g.hasAttribute("inert"), hidden: g.getAttribute("aria-hidden") } : null; });
    if (ghost) expect(ghost).toEqual({ inert: true, hidden: "true" });
    await expect(page.locator("[data-ghost]")).toHaveCount(0, { timeout: 300 });
    // Esc vuelve a cerrar una hoja abierta justo después.
    await bell.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await report(info, "hojas", { ghost });
  });
});

test.describe("entre documentos", () => {
  // S9: /app → /app/informe con View Transitions entre documentos (Chrome). Con movimiento reducido no hay transición.
  for (const reduce of [false, true]) {
    test(`Informe mensual: ${reduce ? "sin transición con movimiento reducido" : "fundido entre documentos en ≤ 250 ms"}`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile" || BASELINE, "una vez, en Chrome");
      if (reduce) await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => {
        type VT = { ready: Promise<void>; finished: Promise<void> } | null;
        addEventListener("pagereveal", (e) => {
          const vt = (e as Event & { viewTransition?: VT }).viewTransition ?? null;
          const w = window as unknown as { __vt: { has: boolean; t0: number; ready?: number; ms?: number; total?: number } };
          w.__vt = { has: !!vt, t0: performance.now() };
          // ready: empiezan las animaciones (tras pintar el documento nuevo); finished: terminan.
          vt?.ready.then(() => { w.__vt.ready = performance.now(); }).catch(() => {});
          vt?.finished.then(() => { const t = performance.now(); w.__vt.ms = Math.round(t - (w.__vt.ready ?? w.__vt.t0)); w.__vt.total = Math.round(t - w.__vt.t0); }).catch(() => {});
        });
      });
      await memberReady(page);
      await tabBtn(page, "Progreso").click();
      await page.getByRole("link", { name: "Informe mensual" }).click();
      await page.waitForURL(/\/app\/informe/);
      await page.waitForFunction(() => (window as unknown as { __vt?: { has: boolean; ms?: number } }).__vt && (!(window as unknown as { __vt: { has: boolean } }).__vt.has || (window as unknown as { __vt: { ms?: number } }).__vt.ms != null), null, { timeout: 5000 });
      const vt = await page.evaluate(() => (window as unknown as { __vt: { has: boolean; ms?: number } }).__vt);
      await report(info, reduce ? "vt-reducido" : "vt", vt);
      if (reduce) expect(vt.has).toBe(false);
      else { expect(vt.has).toBe(true); expect(vt.ms ?? 9999, "animación (ready → finished)").toBeLessThanOrEqual(250); }
    });
  }
});

test.describe("staff", () => {
  // QA M06, ronda 2 (teléfono): Ejecutivo a 600 px → Avisos → Ejecutivo volvía a 500 (un efecto de la guía del dueño movía la
  // página al mostrarse otra vez la pantalla viva); tocar en el cajón la pantalla que ya está a la vista dejaba el foco en
  // body; el cajón no se manejaba con el teclado (Tab se iba detrás, Escape no cerraba). Y un toque en el cajón que no
  // navegó una vez en 20: acá se repite el toque apenas termina de abrirse, con CPU ×4.
  test("teléfono Gym (dueño): scroll recuperado, foco al volver a tocar la pantalla actual, cajón con teclado y toques seguidos", async ({ page }, info) => {
    test.setTimeout(150_000);
    test.skip(info.project.name !== "mobile", "el cajón es del teléfono");
    const errors = watchErrors(page);
    const href = await openDemo(page, "owner");
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1, name: "Ejecutivo" })).toBeVisible();
    await page.waitForTimeout(800);
    const menu = page.getByRole("button", { name: "Abrir menú" });
    const item = (label: string) => page.locator(`.co-nav > button[title="${label}"]`);
    const active = () => page.evaluate(() => document.querySelector<HTMLElement>(".sec-stage > .sec-pane[data-active]")?.dataset.sec ?? null);
    const focused = () => page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return { tag: a?.tagName ?? null, text: a?.textContent?.trim().slice(0, 40) ?? null, label: a?.getAttribute("aria-label") ?? null, inSide: !!a?.closest(".co-side") }; });
    // Toque como el de una persona: en el centro del ítem tal como está al terminar de abrirse el cajón.
    const viaDrawer = async (label: string, wait = 420) => {
      await menu.tap();
      await page.waitForTimeout(wait);
      const b = (await item(label).boundingBox())!;
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    };

    // 1. Scroll por pantalla con la guía del dueño a la vista.
    const tall = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const target = Math.min(600, Math.max(0, tall));
    await page.evaluate((y) => window.scrollTo(0, y), target);
    await page.waitForTimeout(300);
    await viaDrawer("Avisos");
    await expect.poll(active).toBe("notices");
    await page.waitForTimeout(500);
    await viaDrawer("Ejecutivo");
    await expect.poll(active).toBe("exec");
    const trail: number[] = [];
    for (let i = 0; i < 8; i++) { trail.push(await page.evaluate(() => Math.round(scrollY))); await page.waitForTimeout(100); }

    // 1b. Red de seguridad: algo que mueva la página justo después de mostrarse la pantalla (como hacía la guía) no gana.
    await viaDrawer("Avisos");
    await expect.poll(active).toBe("notices");
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const mo = new MutationObserver(() => {
        if (document.querySelector<HTMLElement>(".sec-stage > .sec-pane[data-active]")?.dataset.sec !== "exec") return;
        mo.disconnect();
        window.scrollTo(0, 120);
      });
      mo.observe(document.querySelector(".sec-stage")!, { attributes: true, subtree: true, attributeFilter: ["data-active"] });
    });
    await viaDrawer("Ejecutivo");
    await expect.poll(active).toBe("exec");
    const trailNet: number[] = [];
    for (let i = 0; i < 6; i++) { trailNet.push(await page.evaluate(() => Math.round(scrollY))); await page.waitForTimeout(100); }

    // 2. Volver a tocar la pantalla a la vista: el cajón se cierra y el foco queda en su título (no en body).
    await viaDrawer("Ejecutivo");
    await page.waitForTimeout(700);
    const retap = await focused();
    const retapDrawer = await page.locator(".co").first().getAttribute("data-drawer");

    // 3. Teclado: abrir con Enter lleva el foco al ítem actual; Tab sigue dentro del cajón; Escape lo cierra y vuelve a «Abrir menú».
    await menu.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    const kbOpen = await focused();
    await page.keyboard.press("Tab");
    const kbTab = await focused();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const kbEsc = { ...(await focused()), drawer: await page.locator(".co").first().getAttribute("data-drawer") };

    // 4. Toques seguidos apenas se abre el cajón (CPU ×4): cada toque navega.
    const cdp = await throttle(page, 4);
    const lost: string[] = [];
    const loop = ["Equipo y servicio", "Ejecutivo", "Reseñas", "Avisos", "Equipo y servicio", "Sedes", "Ejecutivo", "Equipo y servicio"];
    const key: Record<string, string> = { "Ejecutivo": "exec", "Equipo y servicio": "pc", "Reseñas": "reviews", "Avisos": "notices", "Sedes": "locs" };
    for (const l of loop) {
      await viaDrawer(l);
      const ok = await expect.poll(active, { timeout: 3000 }).toBe(key[l]).then(() => true, () => false);
      if (!ok) lost.push(`${l} (quedó ${await active()}, cajón ${await page.locator(".co").first().getAttribute("data-drawer")})`);
      await page.waitForTimeout(300);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await report(info, "gym-telefono", { scroll: { target, trail, trailNet }, retap: { ...retap, drawer: retapDrawer }, kbOpen, kbTab, kbEsc, lost });
    expect(errors).toEqual([]);
    expect(trail.every((y) => Math.abs(y - target) <= 2), `scroll al volver a Ejecutivo: ${trail.join(", ")} (esperado ${target})`).toBe(true);
    expect(trailNet.every((y) => Math.abs(y - target) <= 2), `scroll con un efecto que mueve la página: ${trailNet.join(", ")} (esperado ${target})`).toBe(true);
    expect(retapDrawer).toBe("0");
    expect(retap.tag, "foco al volver a tocar la pantalla actual").toBe("H1");
    expect(retap.text).toBe("Ejecutivo");
    expect(kbOpen.inSide, "al abrir con Enter el foco va al cajón").toBe(true);
    expect(kbOpen.text).toContain("Ejecutivo");
    expect(kbTab.inSide, "Tab no se va detrás del cajón").toBe(true);
    expect(kbEsc.drawer).toBe("0");
    expect(kbEsc.label, "Escape devuelve el foco a «Abrir menú»").toBe("Abrir menú");
    expect(lost, "toques en el cajón que no navegaron").toEqual([]);
  });

  test("escritorio Gym: el lateral queda fijo, el h1 recibe el foco y cada pantalla recupera su scroll", async ({ page }, info) => {
    test.setTimeout(90_000);
    test.skip(info.project.name !== "desktop", "se mide en escritorio");
    const errors = watchErrors(page);
    const href = await openDemo(page, "owner");
    await page.goto(href);
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav).toBeVisible();
    await page.waitForTimeout(600);
    await installProbe(page);
    const side = await page.locator(".co-side").boundingBox();
    const items = await nav.getByRole("button").all();
    const names = (await Promise.all(items.slice(0, 4).map((b) => b.getAttribute("title")))).filter(Boolean) as string[];
    const rows: Step[] = [];
    for (const n of names.slice(1)) {
      const b = nav.getByRole("button", { name: n, exact: true }).first();
      const box = (await b.boundingBox())!;
      rows.push(await measureTap(page, () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2), n, "primera", 1000));
    }
    const first = nav.getByRole("button", { name: names[0], exact: true }).first();
    await first.click();
    await page.waitForTimeout(500);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const target = Math.min(600, Math.max(0, tall));
    await page.evaluate((y) => window.scrollTo(0, y), target);
    await page.waitForTimeout(100);
    await nav.getByRole("button", { name: names[1], exact: true }).first().click();
    await page.waitForTimeout(400);
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 40) }));
    rows.push(await measureTap(page, () => first.click(), names[0], "vuelta", 1000));
    const back = await page.evaluate(() => Math.round(scrollY));
    const side2 = await page.locator(".co-side").boundingBox();
    await report(info, "gym-escritorio", { rows, focus, scroll: { target, back }, sideMoved: Math.abs((side2?.x ?? 0) - (side?.x ?? 0)) + Math.abs((side2?.y ?? 0) - (side?.y ?? 0)) });
    expect(errors).toEqual([]);
    if (BASELINE) return;
    expect(focus.tag).toBe("H1");
    expect(Math.abs(back - target)).toBeLessThanOrEqual(2);
    expect(side2).toEqual(side);
    for (const r of rows) {
      expect.soft(r.blank, `${r.to}: cuadros sin contenido`).toBe(0);
      if (r.visit === "vuelta") expect.soft(r.cls, `${r.to}: layout-shift al volver`).toBeLessThanOrEqual(0.01);
    }
  });
});
