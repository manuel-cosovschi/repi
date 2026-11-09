// Toma las capturas reales de la Pantalla de rutinas (y del panel del equipo) desde la demo local, con datos ficticios.
// Uso, desde la raíz del repo y con la app local levantada:
//   node marketing/dossier/repi-control/capture.mjs [http://localhost:3240]
// Sólo contra localhost. Si una pantalla no se puede capturar, el script se detiene: nunca reemplazarla por una simulación.
// Las capturas se guardan en assets/ como WebP de 1600 px (el propio Chromium las convierte: sin dependencias nuevas).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3240";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Sólo contra la app local.");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const rnd = () => Math.floor(Math.random() * 250) + 1;
const VIEW = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" };
const demoHeaders = () => ({ "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.${rnd()}.${rnd()}.${rnd()}` });

// Chromium ya instalado en la máquina (CHROMIUM_PATH para otro); nunca descarga navegadores.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const enc = await (await browser.newContext()).newPage();
/** PNG → WebP de 1600 px de ancho, con el canvas de Chromium. */
async function save(png, name) {
  const url = await enc.evaluate(async ({ b64, w }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.round((img.height * w) / img.width);
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/webp", 0.88);
  }, { b64: png.toString("base64"), w: 1600 });
  await writeFile(path.join(OUT, `${name}.webp`), Buffer.from(url.split(",")[1], "base64"));
  console.log("captura", name);
}
async function shot(page, name, clip) {
  await page.mouse.move(1279, 799);
  await page.waitForTimeout(900);
  await save(await page.screenshot(clip ? { clip } : {}), name);
}

// 1) Pantalla de rutinas (demo «control»: Gimnasio Atlas, ficticio).
const res = await fetch(`${BASE}/api/demo`, { method: "POST", headers: demoHeaders(), body: JSON.stringify({ role: "control" }) });
if (!res.ok) throw new Error(`Demo control: ${res.status} ${await res.text()}`);
const { href } = await res.json();
const h = new URLSearchParams(href.split("#")[1]);
const secret = h.get("k");
const people = JSON.parse(decodeURIComponent(Buffer.from(h.get("d"), "base64").toString()));
const ana = people.find((p) => p.name.startsWith("Ana")) ?? people[0];

const kctx = await browser.newContext(VIEW);
const page = await kctx.newPage();
const key = (d) => page.locator(".kq-pad button", { hasText: new RegExp(`^${d}$`) }).click();
// Bienvenida limpia: sólo el secreto de la pantalla, sin la lista de personas de la demo (contexto nuevo).
await page.goto(`${BASE}/rutinas#k=${secret}`);
await page.getByRole("button", { name: "Empezar" }).waitFor();
await shot(page, "01-bienvenida");
await page.getByRole("button", { name: "Empezar" }).click();
for (const d of ana.code.slice(0, 4)) await key(d);
await shot(page, "02-codigo");
for (const d of ana.code.slice(4)) await key(d);
for (const d of ana.pin) await key(d);
await shot(page, "03-pin");
await page.getByRole("button", { name: "Ver" }).click();
// D216: «Consultar mi rutina» (objetivo del profesor → sugerencia de REPI → última vez) y «Registrar mi entrenamiento».
await page.getByRole("button", { name: /Consultar mi rutina/ }).click();
const squat = page.locator(".kq-ex", { hasText: "Sentadilla" }).first();
await squat.waitFor();
await squat.evaluate((n) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 375 }));
await shot(page, "04-programa");
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.getByRole("button", { name: "Volver" }).click();
await page.getByRole("button", { name: /Registrar mi entrenamiento/ }).click();
await page.getByRole("button", { name: /^Empezar / }).click();
await page.locator(".kq-wlist").getByRole("button", { name: /Sentadilla/ }).click();
await page.locator(".kq-set").first().waitFor();
await page.getByRole("group", { name: "Peso de la serie 1, en kilos" }).getByRole("button", { name: "Más" }).click();
await page.getByRole("group", { name: /RIR de la serie 1/ }).getByRole("button", { name: "2", exact: true }).click();
await page.evaluate(() => window.scrollTo({ top: 0 }));
await shot(page, "06-registro"); // la serie 1 cargada, antes de confirmar: no se guarda nada
await kctx.close();

// 2) Panel del equipo (demo «floor», gimnasio ficticio): ficha del socio con su programa institucional y las revisiones.
const sctx = await browser.newContext(VIEW);
const sres = await sctx.request.post(`${BASE}/api/demo`, { headers: demoHeaders(), data: { role: "floor" } });
if (!sres.ok()) throw new Error(`Demo floor: ${sres.status()}`);
const sp = await sctx.newPage();
await sp.goto(BASE + (await sres.json()).href);
await sp.getByRole("button", { name: "Salir de la guía" }).click();
await sp.getByRole("button", { name: /^Socios/ }).or(sp.getByRole("link", { name: /^Socios/ })).first().click();
await sp.getByText("Programa institucional").first().waitFor();
await shot(sp, "05-equipo-programa", { x: 272, y: 16, width: 992, height: 616 });
await browser.close();
