import { randomInt } from "node:crypto";
import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Nunca contra producción ni un host remoto: las pruebas crean demos y registran series.
export function assertLocalTarget(baseURL: string | undefined) {
  const host = new URL(baseURL ?? "http://localhost:3000").hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new Error(`E2E sólo corre contra un servidor local (recibido: ${host}).`);
}

export type DemoRole = "owner" | "floor" | "member" | "coach";

/**
 * Abre una demo guiada: entorno ficticio propio (is_demo), sesión del rol elegido. Cada llamada usa otra IP simulada
 * (sólo vale en local; en Vercel el encabezado lo pone la plataforma) para no chocar con el límite de 6 demos por hora.
 */
export async function openDemo(page: Page, role: DemoRole) {
  const ip = `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}`;
  const res = await page.request.post("/api/demo", { data: { role }, headers: { "x-forwarded-for": ip } });
  expect(res.status(), await res.text()).toBe(200);
  const { href } = (await res.json()) as { href: string };
  // La guía de la demo queda cerrada (se guarda en sessionStorage): las pruebas recorren la app, no el tour.
  await page.addInitScript((r) => { try { sessionStorage.setItem(`repi:tour:${r}`, JSON.stringify({ i: 0, open: false })); } catch { /* */ } }, role);
  await page.goto(href);
  await dismissTour(page);
  return href;
}

export async function dismissTour(page: Page) {
  const x = page.getByRole("button", { name: /Salir de la guía|Explorar por mi cuenta/ });
  if (await x.isVisible().catch(() => false)) await x.click();
}

/** Junta errores de consola y respuestas 5xx de la app durante la prueba. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500 && new URL(r.url()).host === new URL(page.url() || "http://localhost:3000").host) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

/** Sin scroll horizontal accidental. */
export async function expectNoHorizontalOverflow(page: Page, where: string) {
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).position === "fixed") return false;
      let p: HTMLElement | null = el.parentElement;
      while (p) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return false; p = p.parentElement; }
      return r.right > w + 1;
    }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80));
    return { scroll: document.documentElement.scrollWidth - w, wide };
  });
  expect(over.scroll, `${where}: scroll horizontal (${over.wide.join(", ")})`).toBeLessThanOrEqual(1);
}

/** axe-core (WCAG 2.2 A/AA): falla con violaciones serias o críticas y adjunta el detalle. */
export async function expectAccessible(page: Page, info: TestInfo, name: string) {
  // Las entradas animadas (opacidad) dan contrastes falsos a mitad de camino: se mide con todo quieto.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  await info.attach(`axe-${name}.json`, { body: JSON.stringify(r.violations, null, 2), contentType: "application/json" });
  expect(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `axe ${name}`).toEqual([]);
}
