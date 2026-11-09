// Capturas reales de REPI Control para /conoce (apps/web/public/conoce/shots/control-*.webp). Demo local con datos ficticios.
// Uso: node shots-control.mjs <carpeta de salida>   Variables: REPI_BASE (por defecto http://localhost:3000), REPI_PW_PKG.
// - Pantalla de rutinas (1280×800 a 2×, WebP de 1280): se abre en un contexto nuevo sólo con el enlace del equipo (#k=…), sin la
//   lista de personas de la demo; la píldora «Demo · datos ficticios» del producto queda a la vista. Bienvenida, PIN, la rutina
//   de Ana en «Consultar mi rutina» (Sentadilla: profesor, REPI y última vez) y «Registrar mi entrenamiento» con la serie 1
//   cargada (nada se guarda: la captura es antes de confirmar).
// - Equipo (teléfono 390×844 a 2×, WebP de 780): el profesor de sala de la demo «floor» ajusta el programa de un socio y la ficha
//   queda en la revisión 2 con el historial.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
const { chromium } = createRequire(process.env.REPI_PW_PKG || "/home/user/repi/apps/web/package.json")("@playwright/test");
const B = process.env.REPI_BASE || "http://localhost:3000"; const OUT = process.argv[2];
const ip = () => `10.${randomInt(1, 255)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const webp = (png, name, w) => execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-vf", `scale=${w}:-2:flags=lanczos`, "-c:v", "libwebp", "-quality", "82", `${OUT}/${name}.webp`]);
const opts = (vp) => ({ viewport: vp, deviceScaleFactor: 2, isMobile: vp.width < 600, hasTouch: true, colorScheme: "light", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });

// Pantalla de rutinas
const tmp = await b.newContext();
const { href } = await (await tmp.request.post(`${B}/api/demo`, { data: { role: "control" }, headers: { "x-forwarded-for": ip() } })).json();
await tmp.close();
const q = new URLSearchParams(href.split("#")[1]);
const ana = JSON.parse(decodeURIComponent(Buffer.from(decodeURIComponent(q.get("d")), "base64").toString()))[0];
const k = await b.newContext(opts({ width: 1280, height: 800 }));
const p = await k.newPage();
await p.goto(`${B}/rutinas#k=${q.get("k")}`); await p.waitForLoadState("networkidle").catch(() => {});
await p.getByRole("button", { name: "Empezar" }).waitFor(); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/control-bienvenida.png` }); webp(`${OUT}/control-bienvenida.png`, "control-bienvenida", 1280);
await p.getByRole("button", { name: "Empezar" }).click();
for (const d of ana.code) await p.getByRole("button", { name: d, exact: true }).click();
for (const d of ana.pin.slice(0, 3)) await p.getByRole("button", { name: d, exact: true }).click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/control-identificar.png` }); webp(`${OUT}/control-identificar.png`, "control-identificar", 1280);
await p.getByRole("button", { name: ana.pin.at(-1), exact: true }).click();
await p.getByRole("button", { name: "Ver", exact: true }).click();
// D216: consultar (objetivo del profesor → sugerencia de REPI → última vez) y registrar lo que hizo.
await p.getByRole("button", { name: /Consultar mi rutina/ }).click();
await p.locator(".kq-ex", { hasText: "Sentadilla" }).first().waitFor();
await p.locator(".kq-ex", { hasText: "Sentadilla" }).first().evaluate((n) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 375 }));
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/control-rutina.png` }); webp(`${OUT}/control-rutina.png`, "control-rutina", 1280);
await p.evaluate(() => window.scrollTo({ top: 0 }));
await p.getByRole("button", { name: "Volver" }).click();
await p.getByRole("button", { name: /Registrar mi entrenamiento/ }).click();
await p.getByRole("button", { name: /^Empezar / }).click();
await p.locator(".kq-wlist").getByRole("button", { name: /Sentadilla/ }).click();
await p.locator(".kq-set").first().waitFor();
await p.getByRole("group", { name: "Peso de la serie 1, en kilos" }).getByRole("button", { name: "Más" }).click();
await p.getByRole("group", { name: /RIR de la serie 1/ }).getByRole("button", { name: "2", exact: true }).click();
await p.evaluate(() => window.scrollTo({ top: 0 })); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/control-registro.png` }); webp(`${OUT}/control-registro.png`, "control-registro", 1280);
await k.close();

// El equipo modifica el programa: revisión 2 con autor y motivo
const s = await b.newContext(opts({ width: 390, height: 844 }));
const sp = await s.newPage();
await sp.addInitScript(() => { try { sessionStorage.setItem("repi:tour:floor", JSON.stringify({ i: 0, open: false })); } catch {} });
const f = await (await sp.request.post(`${B}/api/demo`, { data: { role: "floor" }, headers: { "x-forwarded-for": ip() } })).json();
await sp.goto(B + f.href.replace("s=shift", "s=members")); await sp.waitForLoadState("networkidle").catch(() => {});
await sp.getByText("Julián Ortiz").locator("visible=true").first().click();
await sp.getByRole("button", { name: "Editar programa" }).click();
await sp.getByLabel("Repeticiones de Sentadilla").fill("6-8");
await sp.getByLabel(/Motivo del cambio/).fill("Ajuste de cargas después de la evaluación");
await sp.getByRole("button", { name: "Guardar revisión" }).click();
await sp.getByText(/revisión 2/).first().waitFor(); await sp.waitForTimeout(4500); // el aviso de guardado se va solo
await sp.getByText(/^Programa institucional$/).first().evaluate((n) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 210 }));
await sp.waitForTimeout(900);
await sp.screenshot({ path: `${OUT}/control-equipo.png` }); webp(`${OUT}/control-equipo.png`, "control-equipo", 780);
await s.close();
await b.close();
console.log("ok capturas en", OUT);
