// Genera REPI-Control-dossier.pdf (A4, 2 páginas) desde dossier.html con el Chromium ya instalado (sin descargar navegadores).
// Uso, desde cualquier carpeta:
//   node marketing/dossier/repi-control/render.mjs [--preview <carpeta>]
// --preview deja una vista PNG de cada página (con pdftoppm si está; si no, captura de pantalla). Por defecto, en la carpeta
// temporal del sistema: las vistas no se versionan.
// Se detiene si algo no entra en su página, si el PDF no tiene exactamente 2 páginas o si pesa 3 MB o más.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, "dossier.html");
const OUT = path.join(DIR, "REPI-Control-dossier.pdf");
const pi = process.argv.indexOf("--preview");
const PREVIEW = pi > 0 ? path.resolve(process.argv[pi + 1]) : path.join(os.tmpdir(), "repi-control-dossier-preview");
const PAGES = 2;
const MAX_BYTES = 3 * 1024 * 1024;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 })).newPage();
await page.emulateMedia({ media: "print" });
await page.goto(pathToFileURL(SRC).href, { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
});

// Controles: fuentes cargadas, imágenes presentes, nada fuera de su página, datos completos.
const problems = await page.evaluate(() => {
  const out = [];
  for (const f of ["400 10px Barlow", "500 10px Barlow", "600 10px Barlow", "700 10px 'Barlow Condensed'"]) if (!document.fonts.check(f)) out.push(`Fuente sin cargar: ${f}`);
  for (const i of document.images) if (!i.naturalWidth) out.push(`Imagen sin cargar: ${i.getAttribute("src")}`);
  document.querySelectorAll(".page").forEach((pg, n) => {
    const P = pg.getBoundingClientRect();
    for (const el of pg.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.bottom > P.bottom + 0.5 || r.right > P.right + 0.5 || r.left < P.left - 0.5) out.push(`Página ${n + 1}: «${(el.textContent || el.getAttribute("src") || el.tagName).trim().slice(0, 50)}» sale de la página`);
    }
    for (const el of pg.querySelectorAll(".body, .hero, .close, .two > div, .steps li, .process li, .feat > div")) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push(`Página ${n + 1}: contenido desbordado en «${el.textContent.trim().slice(0, 50)}»`);
    }
  });
  for (const el of document.querySelectorAll("[data-bind], [data-money]")) if (!el.textContent.trim() || /undefined|NaN/.test(el.textContent)) out.push(`Dato vacío: ${el.dataset.bind ?? el.dataset.money}`);
  return out;
});
if (problems.length) console.error(problems.join("\n"));

await page.pdf({ path: OUT, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });

// Vistas por página.
mkdirSync(PREVIEW, { recursive: true });
let viaPdf = false;
try { execFileSync("pdftoppm", ["-png", "-r", "110", OUT, path.join(PREVIEW, "pagina")]); viaPdf = true; } catch { /* sin pdftoppm */ }
if (!viaPdf) {
  await page.emulateMedia({ media: "screen" });
  const pages = await page.$$(".page");
  for (const [i, el] of pages.entries()) await el.screenshot({ path: path.join(PREVIEW, `pagina-${i + 1}.png`) });
}
await browser.close();

// Páginas y peso.
let count;
try { count = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [OUT]).toString())[1]); }
catch { count = (readFileSync(OUT, "latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length; }
const bytes = statSync(OUT).size;
console.log(`PDF: ${path.relative(process.cwd(), OUT)} · ${count} páginas · ${(bytes / 1024).toFixed(0)} KB`);
console.log(`Vistas: ${PREVIEW}`);
if (problems.length) { console.error("Hay contenido que no entra: revisar antes de compartir."); process.exit(1); }
if (count !== PAGES) { console.error(`Se esperaban ${PAGES} páginas.`); process.exit(1); }
if (bytes >= MAX_BYTES) { console.error("El PDF pesa 3 MB o más."); process.exit(1); }
