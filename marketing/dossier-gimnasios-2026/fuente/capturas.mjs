// Capturas reales para el dossier: la demo guiada de REPI (entorno ficticio propio, datos inventados, se borra a las 6 h).
// Nunca contra producción con cuentas reales. Uso (con la app local levantada, `pnpm build && pnpm start`):
//   node marketing/dossier-gimnasios-2026/fuente/capturas.mjs [http://localhost:3000]
// Deja JPEG en marketing/dossier-gimnasios-2026/capturas/. Teléfono a 2× (390×844) y escritorio a 1,5× (1440×900), en JPEG para que el PDF pese poco.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { randomInt } from "node:crypto";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
// Chrome/Chromium a usar: CHROME (ruta) si se define; si no, el que trae Playwright; si no coincide la versión, el preinstalado.
const launch = async () => {
  if (process.env.CHROME) return chromium.launch({ executablePath: process.env.CHROME });
  try { return await chromium.launch(); } catch { return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
};
const BASE = process.argv[2] ?? "http://localhost:3000";
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) throw new Error("Las capturas se toman sólo de la app local con la demo guiada.");
const OUT = fileURLToPath(new URL("../capturas/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.75 };

async function demo(browser, role, device) {
  const ctx = await browser.newContext({ ...device, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", reducedMotion: "reduce", colorScheme: role === "member" ? "dark" : "light" });
  await ctx.addInitScript((r) => {
    try { sessionStorage.setItem(`repi:tour:${r}`, JSON.stringify({ i: 0, open: false })); localStorage.setItem("repi:guide", "added"); } catch { /* */ }
    // La píldora «Demo · Guía · Otro perfil» no es parte del producto: no aparece en las capturas.
    document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = ".dt-pill, .dt-card, .dt-ring { display: none !important; }"; document.head.appendChild(st); });
  }, role);
  const page = await ctx.newPage();
  const ip = `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}`;
  const r = await page.request.post(`${BASE}/api/demo`, { data: { role }, headers: { "x-forwarded-for": ip, origin: BASE } });
  if (!r.ok()) throw new Error(`demo ${role}: ${r.status()} ${await r.text()}`);
  const { href } = await r.json();
  await page.goto(BASE + href);
  await page.waitForTimeout(1500);
  const x = page.getByRole("button", { name: /Salir de la guía|Explorar por mi cuenta/ });
  if (await x.isVisible().catch(() => false)) await x.click();
  return { ctx, page, href };
}
const shot = async (page, name, full = false) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 86, fullPage: full }); console.log("•", name); };
async function nav(page, label) {
  const menu = page.getByRole("button", { name: "Abrir menú" });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await page.getByRole("navigation", { name: "Principal" }).first().getByRole("button", { name: new RegExp(`^${label}(\\s\\d.*)?$`) }).first().click();
  await page.waitForTimeout(1200);
}

const browser = await launch();
try {
  // Dueño (escritorio): ejecutivo, sedes, equipo y servicio, comunidad, accesos.
  const owner = await demo(browser, "owner", DESK);
  const hide = owner.page.getByRole("button", { name: "Ocultar" }).first();
  if (await hide.isVisible().catch(() => false)) await hide.click();
  await shot(owner.page, "dueno-ejecutivo");
  await shot(owner.page, "dueno-ejecutivo-completo", true);
  for (const [label, name] of [["Equipo y servicio", "dueno-equipo-servicio"], ["Sedes", "dueno-sedes"], ["Comunidad", "dueno-comunidad"], ["Solicitudes de acceso", "dueno-solicitudes"], ["Equipo", "dueno-equipo"]]) {
    try { await nav(owner.page, label); await shot(owner.page, name); } catch (e) { console.log("× no se pudo", name, e.message.split("\n")[0]); }
  }
  await owner.ctx.close();
  // Entrenador de sala (escritorio): turno, cola, socios.
  const floor = await demo(browser, "floor", DESK);
  await shot(floor.page, "sala-turno");
  for (const [label, name] of [["Sala", "sala-cola"], ["Socios", "sala-socios"], ["Traspaso de turno", "sala-traspaso"]]) {
    try { await nav(floor.page, label); await shot(floor.page, name); } catch (e) { console.log("× no se pudo", name, e.message.split("\n")[0]); }
  }
  await floor.ctx.close();
  // Socio (teléfono, tema oscuro de la app del alumno).
  const member = await demo(browser, "member", PHONE);
  await shot(member.page, "socio-inicio");
  for (const tab of ["Entrenar", "Progreso", "Gym"]) {
    try { await member.page.getByRole("button", { name: tab, exact: true }).first().click(); await shot(member.page, `socio-${tab.toLowerCase()}`); } catch (e) { console.log("× no se pudo", tab, e.message.split("\n")[0]); }
  }
  // Entrenamiento en curso: anterior, recomendado y real en la serie.
  try {
    await member.page.getByRole("button", { name: "Entrenar", exact: true }).first().click(); await member.page.waitForTimeout(1200);
    await member.page.getByRole("button", { name: /Empezar|Comenzar|Entrenar/ }).first().click(); await member.page.waitForTimeout(1800);
    await shot(member.page, "socio-checkin");
    const skip = member.page.getByRole("button", { name: "Saltar" }).first();
    if (await skip.isVisible().catch(() => false)) { await skip.click(); await member.page.waitForTimeout(1500); }
    for (let i = 0; i < 3; i++) { const e = member.page.getByRole("button", { name: "Entendido" }).first(); if (await e.isVisible().catch(() => false)) { await e.click(); await member.page.waitForTimeout(400); } }
    await shot(member.page, "socio-serie");
  } catch (e) { console.log("× no se pudo socio-serie", e.message.split("\n")[0]); }
  await member.ctx.close();
} finally { await browser.close(); }
