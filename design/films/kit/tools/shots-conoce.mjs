// Capturas reales de la app para /conoce (apps/web/public/conoce/shots/): training, intelligence, adaptive, owner, access y
// control-equipo. Demo LOCAL con datos ficticios; nunca contra producción (el script se niega si la base no es local).
// Uso: DATABASE_URL=postgres://…@127.0.0.1/… REPI_BASE=http://localhost:3280 node shots-conoce.mjs <carpeta de salida> [tarea]
//
// Qué se ajusta respecto de la demo tal cual, y por qué:
// - Socio: el historial de press de banca de la demo recién creada pasa a 60 kg × 10 (dos sesiones), el mismo ejemplo que la
//   escena en vivo de /conoce (x3/EngineScreen.tsx). Lo que se ve después —«Anterior» y «REPI recomienda»— lo calcula el motor
//   real con ese historial; no se escribe ningún número a mano en la pantalla.
// - Se cierra la ayuda «Cómo registrar» y se ocultan los elementos del recorrido de demo (píldora «DEMO · Guía · Otro perfil»).
// - Solicitudes de acceso: se oculta el aviso «Avisos push no están configurados en este entorno» (sólo aparece donde no hay
//   claves de push, como este servidor local) y el email ficticio de la demo (`…@demo-xxxx.invalid`) se muestra con un dominio
//   de ejemplo. Sigue siendo una persona ficticia.
// - Dueño: `owner.webp` es «Seguimiento de sala» (pedidos recibidos, resueltos y tiempos), que es lo que la página describe.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(process.env.REPI_PW_PKG || "/home/user/repi/apps/web/package.json")("@playwright/test");
const B = process.env.REPI_BASE || "http://localhost:3000"; const OUT = process.argv[2]; const only = process.argv[3];
const DB = process.env.DATABASE_URL || "";
if (!OUT) throw new Error("falta la carpeta de salida");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(B)) throw new Error("sólo contra un servidor local");
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(DB)) throw new Error("DATABASE_URL tiene que ser la base local de la demo");
mkdirSync(OUT, { recursive: true });
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-Atc", q]).toString().trim();
const ip = () => `10.${randomInt(1, 255)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const webp = (name, w) => execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${OUT}/${name}.png`, "-vf", `scale=${w}:-2:flags=lanczos`, "-c:v", "libwebp", "-quality", "84", `${OUT}/${name}.webp`]);
const HIDE = ".dt-pill,.dt-card,.dt-ring{display:none!important}";
async function demo(role, start) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.addInitScript((role) => { try { sessionStorage.setItem(`repi:tour:${role}`, JSON.stringify({ i: 0, open: false })); } catch {} }, role);
  await p.addInitScript((css) => { const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); }, HIDE);
  const { href } = await (await p.request.post(`${B}/api/demo`, { data: { role }, headers: { "x-forwarded-for": ip() } })).json();
  if (start) await start();
  return { ctx, p, href };
}
const open = async (p, href) => { await p.goto(`${B}${href}`); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1500); };
const menu = async (p) => { const m = p.getByRole("button", { name: "Abrir menú" }); if (await m.isVisible().catch(() => false)) { await m.click(); await p.waitForTimeout(500); } };
const nav = async (p, label) => { await menu(p); const el = p.locator(`button[title="${label}"], [aria-label="${label}"]`).first(); if (await el.count()) await el.click(); else await p.getByRole("button", { name: new RegExp(`^${label}`) }).first().click(); await p.waitForTimeout(1800); };
const top = async (p, re, off = 70) => { await p.getByText(re).first().evaluate((n, off) => window.scrollTo(0, n.getBoundingClientRect().top + scrollY - off), off); await p.waitForTimeout(800); };
const shot = async (p, name, w = 600) => { await p.screenshot({ path: `${OUT}/${name}.png` }); webp(name, w); };

const tasks = {
  // Socio: Entrenar (adaptive), la serie en curso (training) y la tabla del objetivo (intelligence).
  async member() {
    const { ctx, p, href } = await demo("member", async () => {
      const u = sql(`select id from "user" where name ilike 'Valentina%' order by created_at desc limit 1`);
      const ss = sql(`select ws.id from workout_session ws where ws.user_id='${u}' and ws.day_name='Torso A' and ws.status='completed' order by ws.started_at`).split("\n").filter(Boolean);
      if (ss.length < 2) throw new Error("la demo no trae dos sesiones de Torso A");
      const bench = (sid) => `session_id='${sid}' and program_exercise_id in (select id from program_exercise where name='Press de banca')`;
      sql(`update set_log set weight_kg='60', reps=case when set_index=0 then 10 else 9 end where ${bench(ss.at(-2))}`);
      sql(`update set_log set weight_kg='60', reps=10 where ${bench(ss.at(-1))}`);
    });
    await open(p, href);
    await nav(p, "Entrenar");
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
    await shot(p, "adaptive");
    await p.getByRole("button", { name: /Comenzar entrenamiento/ }).first().click(); await p.waitForTimeout(1500);
    const sk = p.getByRole("button", { name: "Saltar" }); if (await sk.isVisible().catch(() => false)) { await sk.click(); await p.waitForTimeout(3000); }
    // Ayudas de primera vez («Cómo registrar», qué es «REPI recomienda»): se cierran todas.
    for (let i = 0; i < 4; i++) { const ok = p.getByText("Entendido", { exact: true }).locator("visible=true").first(); if (!(await ok.count())) break; await ok.click(); await p.waitForTimeout(500); }
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
    await shot(p, "training");
    console.log("serie:", JSON.stringify((await p.locator("body").innerText()).match(/REPI recomienda[^\n]*\n[^\n]*|Anterior[^\n]*\n[^\n]*/gi)));
    // «Objetivo por serie»: con la serie 1 registrada, la app deja la tabla entera a la vista (lo que indicó el profe, lo que
    // recomienda REPI, la vez anterior y lo real de hoy) y abajo el descanso con la serie que sigue.
    await p.getByRole("button", { name: /Completar serie 1/ }).click(); await p.waitForTimeout(2500);
    await shot(p, "intelligence");
    await ctx.close();
  },
  // Dueño: Seguimiento de sala y Solicitudes de acceso.
  async owner() {
    const { ctx, p, href } = await demo("owner");
    await open(p, href);
    await nav(p, "Seguimiento de sala");
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
    await shot(p, "owner");
    await nav(p, "Solicitudes de acceso");
    await p.evaluate(() => {
      for (const el of document.querySelectorAll("main *")) {
        if (el.children.length === 0 && /@demo-[a-z0-9]+\.invalid/.test(el.textContent ?? "")) el.textContent = el.textContent.replace(/@demo-[a-z0-9]+\.invalid/, "@gmail.com");
      }
      const t = [...document.querySelectorAll("main *")].find((el) => el.children.length === 0 && el.textContent?.trim() === "Avisos push");
      let box = t; while (box && box.parentElement && !/no están configurados/.test(box.textContent ?? "")) box = box.parentElement;
      while (box && box.parentElement && box.parentElement.textContent?.trim() === box.textContent?.trim()) box = box.parentElement; // el recuadro entero
      if (box) box.style.display = "none";
    });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
    await shot(p, "access");
    await ctx.close();
  },
  // Equipo de sala: la ficha del socio con el programa en la revisión 2 y su historial.
  async floor() {
    const { ctx, p, href } = await demo("floor");
    await open(p, href.replace("s=shift", "s=members"));
    await p.getByText("Julián Ortiz").locator("visible=true").first().click();
    await p.getByRole("button", { name: "Editar programa" }).click();
    await p.getByLabel("Repeticiones de Sentadilla").fill("6-8");
    await p.getByLabel(/Motivo del cambio/).fill("Ajuste de cargas después de la evaluación");
    await p.getByRole("button", { name: "Guardar revisión" }).click();
    await p.getByText(/revisión 2/).first().waitFor(); await p.waitForTimeout(4500); // el aviso de guardado se va solo
    await top(p, /^Programa institucional$/, 400);
    await shot(p, "control-equipo", 780);
    await ctx.close();
  },
};
let bad = 0;
for (const [k, f] of Object.entries(tasks)) { if (only && k !== only) continue; try { await f(); console.log("ok", k); } catch (e) { bad++; console.log("FALLA", k, e.message.split("\n")[0]); } }
await b.close();
process.exit(bad ? 1 : 0);
