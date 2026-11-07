// REPI · Commercial Sales Kit 2026 — dossier para gimnasios y resumen de una página.
// HTML/CSS editorial → PDF A4 con Chromium (texto seleccionable, fuentes incrustadas, SVG vectorial, enlaces activos).
// Todos los números salen de precios.json: cambiar un precio y volver a generar recalcula textos y gráficos.
//
//   node marketing/dossier-gimnasios-2026/fuente/generar.mjs                 # genera ambos PDF y las vistas por página
//   node marketing/dossier-gimnasios-2026/fuente/generar.mjs --ref V-AB12CD --asesor "Nombre Apellido"
//
// --ref agrega el código del vendedor al QR (/conoce/gimnasios?ref=…) para que el contacto quede con su origen.
// --asesor muestra el nombre del vendedor en el cierre. Ninguno inventa teléfonos ni emails.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
// Chrome/Chromium a usar: CHROME (ruta) si se define; si no, el que trae Playwright; si no coincide la versión, el preinstalado.
const launch = async () => {
  if (process.env.CHROME) return chromium.launch({ executablePath: process.env.CHROME });
  try { return await chromium.launch(); } catch { return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
};
const { renderSVG } = createRequire(here("../../../apps/web/package.json"))("uqr");

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : a), []));
const P = JSON.parse(readFileSync(here("precios.json"), "utf8"));
const REF = typeof args.ref === "string" && /^V-[A-Z0-9]{6}$/i.test(args.ref) ? args.ref.toUpperCase() : null;
const ASESOR = typeof args.asesor === "string" ? args.asesor.trim().slice(0, 60) : null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ── Números (siempre calculados, nunca escritos a mano) ─────────────────────
const A = P.escenarioA, B = P.escenarioB;
const totA = A.socios * A.precioPorSocio, totB = B.socios * B.precioPorSocio;
const pct = (x) => Math.round(x * 10000) / 100; // 2 decimales
const sociosPct = pct(B.socios / A.socios - 1), precioPct = pct(B.precioPorSocio / A.precioPorSocio - 1), totalPct = pct(totB / totA - 1), diff = totB - totA;
const cuota = P.cuotaEjemplo, cuotaNueva = cuota + B.precioPorSocio, cuotaPct = (B.precioPorSocio / cuota) * 100;
const recupero = B.socios * B.precioPorSocio;
const $ = (n) => `$${n.toLocaleString("es-AR")}`;
const nPct = (n, d = 2) => `${n.toLocaleString("es-AR", { maximumFractionDigits: d })} %`;
const porDia = Math.floor((B.precioPorSocio / 30) * 100) / 100;
if (totA !== 80000 && P.escenarioA.socios === 400 && P.escenarioA.precioPorSocio === 200) throw new Error("Revisar cálculo"); // control
console.log(`A: ${A.socios}×${A.precioPorSocio}=${totA} · B: ${B.socios}×${B.precioPorSocio}=${totB} · socios ${sociosPct}% · precio ${precioPct}% · total ${totalPct}% · dif ${diff} · cuota ${cuotaPct.toFixed(4)}%`);

// ── QR y enlaces ────────────────────────────────────────────────────────────
const C = P.contacto;
const qrUrl = REF ? `${C.qrUrl}&ref=${REF}` : C.qrUrl;
const waText = encodeURIComponent("Hola, vi el dossier de REPI y me interesa una demostración para mi gimnasio.");
const waUrl = `${C.whatsappUrl}?text=${waText}`;
const mailUrl = `mailto:${C.email}?subject=${encodeURIComponent("Demostración de REPI para mi gimnasio")}`;
const qrSvg = (url, color = "#0B0F14") => renderSVG(url, { ecc: "M", border: 0, pixelSize: 10, whiteColor: "#FFFFFF", blackColor: color });

// ── Recursos ────────────────────────────────────────────────────────────────
const asset = (f) => pathToFileURL(here(`assets/${f}`)).href;
const cap = (f) => {
  const p = here(`../capturas/${f}.jpg`);
  if (!existsSync(p)) throw new Error(`Falta la captura real ${f}.jpg: correr fuente/capturas.mjs con la app local (nunca reemplazarla por una simulación).`);
  return pathToFileURL(p).href;
};
const wm = (w, dot = "#00D1FF") => `<span class="wm" style="width:${w}"><img src="${asset("wm_full.png")}" alt="repi"><i style="background:${dot}"></i></span>`;
const phone = (img, w = "62mm", extra = "") => `<div class="phone" style="width:${w};${extra}"><div class="screen"><img src="${cap(img)}" alt=""></div></div>`;
const browser = (img, w = "170mm", extra = "", ratio = "1280 / 800") => `<div class="browser" style="width:${w};${extra}"><div class="bar"><i></i><i></i><i></i><span>repiclub.com</span></div><img src="${cap(img)}" alt="" style="aspect-ratio:${ratio}"></div>`;

// Íconos (trazos simples, mismo grosor; no reemplazan el logo).
const ICON = {
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.6-5.5 7-5.5s6 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M22 20c-.6-2.6-2.2-4.4-4.5-5.1"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pin: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  body: '<circle cx="12" cy="5" r="2.5"/><path d="M6 9h12M12 9v6M9 22l3-7 3 7"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
};
const ic = (k, size = "6mm", color = "#00D1FF") => `<svg class="ic" viewBox="0 0 24 24" style="width:${size};height:${size}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// ── Estilos ─────────────────────────────────────────────────────────────────
const CSS = `
@font-face { font-family: Barlow; font-weight: 400; src: url(${asset("barlow-400.woff2")}) format("woff2"); }
@font-face { font-family: Barlow; font-weight: 500; src: url(${asset("barlow-500.woff2")}) format("woff2"); }
@font-face { font-family: Barlow; font-weight: 600 700; src: url(${asset("barlow-600.woff2")}) format("woff2"); }
@font-face { font-family: "Barlow Condensed"; font-weight: 700 800; src: url(${asset("barlowcondensed-700.woff2")}) format("woff2"); }
@page { size: A4; margin: 0; }
:root { --navy: #0B0F14; --navy2: #1A2433; --navy3: #2D3B4F; --cyan: #00D1FF; --cyanD: #0094B8; --tq: #5DE6D8; --ink: #0B0F14; --paper: #F4F1EA; --paper2: #EDE9E0; --mute: #5B6878; --muteD: #A9B6C6; --line: rgba(11,15,20,.12); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Barlow, Arial, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.42; font-variant-numeric: tabular-nums; hyphens: none; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; background: var(--paper); }
.page:last-child { page-break-after: auto; break-after: auto; }
.dark { background: var(--navy); color: #F8FAFC; }
.dark .mu { color: var(--muteD); }
.mu { color: var(--mute); }
.pad { position: absolute; inset: 16mm 16mm 18mm; display: flex; flex-direction: column; }
.d { font-family: "Barlow Condensed", Arial, sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: -.005em; line-height: .93; }
.kick { font-weight: 600; font-size: 8.6pt; letter-spacing: .2em; text-transform: uppercase; color: var(--cyanD); }
.dark .kick { color: var(--cyan); }
h2.d { font-size: 40pt; margin-top: 3mm; }
.lead { font-size: 12.5pt; line-height: 1.42; max-width: 150mm; margin-top: 4mm; }
.cy { color: var(--cyan); } .cyD { color: var(--cyanD); } .tq { color: var(--tq); }
.wm { position: relative; display: inline-block; } .wm img { width: 100%; display: block; }
.wm i { position: absolute; left: 88.92%; top: 1.58%; width: 10.12%; aspect-ratio: 1; border-radius: 50%; }
.foot { position: absolute; left: 16mm; right: 16mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: var(--mute); letter-spacing: .04em; }
.dark .foot { color: #7D8A9C; }
.glow { position: absolute; pointer-events: none; border-radius: 50%; filter: blur(2px); background: radial-gradient(closest-side, rgba(0,209,255,.30), rgba(0,209,255,0) 70%); }
.glow.tq { background: radial-gradient(closest-side, rgba(93,230,216,.22), rgba(93,230,216,0) 70%); }
.phone { position: relative; border-radius: 9mm; padding: 2.3mm; background: linear-gradient(145deg, #2a3546, #0b0f14 45%, #1d2735); box-shadow: 0 6mm 14mm rgba(0,0,0,.35), inset 0 0 0 .35mm rgba(255,255,255,.12); }
.phone .screen { border-radius: 7mm; overflow: hidden; background: #000; aspect-ratio: 390 / 844; }
.phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.browser { border-radius: 3.2mm; overflow: hidden; background: #fff; box-shadow: 0 6mm 16mm rgba(11,15,20,.28), 0 0 0 .3mm rgba(11,15,20,.12); }
.browser .bar { height: 6.5mm; background: #E9E6DF; display: flex; align-items: center; gap: 1.6mm; padding: 0 3mm; }
.dark .browser .bar { background: #1F2a3a; }
.browser .bar i { width: 2.2mm; height: 2.2mm; border-radius: 50%; background: #C9C4BA; display: block; }
.dark .browser .bar i { background: #3B4A60; }
.browser .bar span { margin-left: 3mm; font-size: 6.8pt; color: #7D8A9C; background: rgba(255,255,255,.55); border-radius: 1.5mm; padding: .5mm 3mm; }
.dark .browser .bar span { background: rgba(255,255,255,.06); }
.browser img { display: block; width: 100%; aspect-ratio: 1280 / 800; object-fit: cover; object-position: top left; }
.card { background: #fff; border-radius: 4.5mm; padding: 5mm; box-shadow: 0 .3mm 0 rgba(11,15,20,.06), 0 0 0 .25mm var(--line); }
.dark .card { background: rgba(255,255,255,.05); box-shadow: inset 0 0 0 .25mm rgba(255,255,255,.12); }
.card h3 { font-size: 12pt; font-weight: 700; line-height: 1.2; }
.card p { font-size: 9.6pt; line-height: 1.4; margin-top: 1.4mm; }
.pill { display: inline-flex; align-items: center; gap: 1.5mm; border-radius: 99mm; padding: 1mm 3mm; font-size: 8pt; font-weight: 600; letter-spacing: .02em; }
.pill.c { background: rgba(0,209,255,.14); color: var(--cyanD); } .dark .pill.c { color: var(--cyan); }
.pill.o { box-shadow: inset 0 0 0 .3mm currentColor; }
.callout { display: flex; gap: 3mm; align-items: flex-start; }
.callout b { display: block; font-size: 11pt; line-height: 1.2; }
.callout span { display: block; font-size: 9.2pt; line-height: 1.35; margin-top: .8mm; }
.num { font-family: "Barlow Condensed", Arial, sans-serif; font-weight: 700; line-height: .9; }
.note { font-size: 7.6pt; line-height: 1.4; color: var(--mute); }
.dark .note { color: #8C99AB; }
a { color: inherit; text-decoration: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4.5mm; }
.chip-row { display: flex; flex-wrap: wrap; gap: 1.6mm; }
.ul { list-style: none; } .ul li { position: relative; padding-left: 4mm; font-size: 9.4pt; line-height: 1.38; margin-top: 1.1mm; }
.ul li::before { content: ""; position: absolute; left: 0; top: 1.9mm; width: 1.5mm; height: 1.5mm; border-radius: 50%; background: var(--cyan); }
`;
const doc = (title, pages) => `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${pages.join("")}</body></html>`;
let pageNo = 0;
const foot = (dark = false) => `<div class="foot"><span>REPI · Dossier para gimnasios · 2026</span><span>${String(++pageNo).padStart(2, "0")}</span></div>`;

// ── Páginas del dossier ─────────────────────────────────────────────────────
const pages = [];

// 1 · Portada
pages.push(`<section class="page dark">
  <div class="glow" style="width:190mm;height:190mm;left:-40mm;top:-60mm"></div>
  <div class="glow tq" style="width:160mm;height:160mm;right:-60mm;bottom:20mm"></div>
  <div class="pad" style="inset:16mm 16mm 14mm">
    <div style="display:flex;justify-content:space-between;align-items:center">${wm("34mm")}<span class="kick">Dossier para gimnasios · 2026</span></div>
    <h1 class="d" style="font-size:64pt;margin-top:11mm">Tu gimnasio,<br><span class="cy">en otro nivel.</span></h1>
    <p class="lead" style="font-size:13.5pt;max-width:140mm;color:#D7E0EA">Una sola plataforma para potenciar la experiencia de tus socios, conectar a tus entrenadores y gestionar tu gimnasio de forma más inteligente.</p>
    <div style="position:relative;flex:1;min-height:0;margin-top:8mm">
      ${browser("sala-socios", "150mm", "position:absolute;left:0;top:8mm")}
      ${phone("socio-serie", "58mm", "position:absolute;right:2mm;top:0")}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <p class="d" style="font-size:22pt">Cada repetición <span class="cy">cuenta.</span></p>
      <p class="note" style="text-align:right;max-width:70mm">Capturas reales de REPI con datos de demostración.</p>
    </div>
  </div>
</section>`);

// 2 · Problema y oportunidad
const hub = `<svg viewBox="0 0 520 300" style="width:100%;height:auto;display:block" aria-label="REPI conecta gimnasio, entrenadores y socios">
  <defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#00D1FF" stop-opacity=".35"/><stop offset="1" stop-color="#00D1FF" stop-opacity="0"/></radialGradient></defs>
  <circle cx="260" cy="150" r="120" fill="url(#g)"/>
  ${[[80, 70, "GIMNASIO", "Dueño y gerencia"], [440, 70, "ENTRENADORES", "Sala y coordinación"], [260, 268, "SOCIOS", "Quien entrena"]].map(([x, y]) => `<line x1="260" y1="150" x2="${x}" y2="${y}" stroke="#0B0F14" stroke-opacity=".25" stroke-width="2" stroke-dasharray="5 6"/>`).join("")}
  <path d="M80 70 Q260 10 440 70" fill="none" stroke="#0B0F14" stroke-opacity=".12" stroke-width="2"/>
  <path d="M80 70 Q120 220 260 268" fill="none" stroke="#0B0F14" stroke-opacity=".12" stroke-width="2"/>
  <path d="M440 70 Q400 220 260 268" fill="none" stroke="#0B0F14" stroke-opacity=".12" stroke-width="2"/>
  <circle cx="260" cy="150" r="56" fill="#0B0F14"/>
  <image href="${asset("wm_full.png")}" x="222" y="132" width="72" height="35"/><circle cx="286" cy="133" r="3.6" fill="#00D1FF"/>
  ${[[80, 70, "GIMNASIO", "Dueño y gerencia"], [440, 70, "ENTRENADORES", "Sala y coordinación"], [260, 268, "SOCIOS", "Quien entrena"]].map(([x, y, t, s]) => `<g><rect x="${x - 74}" y="${y - 26}" width="148" height="52" rx="14" fill="#fff" stroke="#0B0F14" stroke-opacity=".1"/><text x="${x}" y="${y - 2}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="20" fill="#0B0F14">${t}</text><text x="${x}" y="${y + 16}" text-anchor="middle" font-family="Barlow" font-size="11.5" fill="#5B6878">${s}</text></g>`).join("")}
</svg>`;
pages.push(`<section class="page">
  <div class="pad">
    <span class="kick">El punto de partida</span>
    <h2 class="d">Tu gimnasio ya tiene lo más difícil.<br><span class="cyD">Falta conectarlo.</span></h2>
    <p class="lead">Desafíos frecuentes en la operación de un gimnasio, que la tecnología adecuada ayuda a resolver:</p>
    <div class="grid3" style="margin-top:6mm">
      ${[["list", "Rutinas dispersas", "En papel, en capturas o en la memoria del profe. Cuando cambia el entrenador, se pierde el hilo."],
        ["chart", "Progreso invisible", "El socio no sabe cuánto levantó la última vez ni si está avanzando."],
        ["users", "Un profe, muchos socios", "En hora pico, la sala no llega a todos y los pedidos de ayuda quedan sueltos."],
        ["layers", "Información fragmentada", "Planillas, mensajes y cuadernos: cuesta saber qué pasa en cada sede y en cada turno."],
        ["swap", "Turnos sin continuidad", "Lo que quedó pendiente a la mañana no siempre llega al equipo de la tarde."],
        ["spark", "Un servicio difícil de diferenciar", "Máquinas y profesionales hay en muchos lugares. La experiencia es lo que se recuerda."]]
        .map(([i, t, d]) => `<div class="card">${ic(i)}<h3 style="margin-top:2.5mm">${t}</h3><p class="mu">${d}</p></div>`).join("")}
    </div>
    <div style="margin-top:7mm;display:grid;grid-template-columns:1fr 92mm;gap:6mm;align-items:center">
      <div>
        <p class="d" style="font-size:25pt">Tu gimnasio ya ofrece el espacio y los profesionales.</p>
        <p class="d cyD" style="font-size:25pt;margin-top:1.5mm">REPI conecta toda esa experiencia.</p>
        <p class="mu" style="margin-top:3mm;font-size:10pt">Socios, entrenadores y gerencia trabajan sobre la misma información, cada uno con lo que necesita ver y nada más.</p>
      </div>
      ${hub}
    </div>
  </div>${foot()}
</section>`);

// 3 · Socio
const left3 = [["list", "Su rutina del día", "El programa que armó su entrenador, ordenado por días, en el teléfono."],
  ["bolt", "Cada serie con objetivo", "Training Intelligence muestra lo anterior, lo recomendado y lo real, con la razón."],
  ["clock", "Descanso que corre solo", "Registra carga, repeticiones, RIR o RPE y sensación con un toque."],
  ["wifi", "Funciona en la sala", "Lo que ya abrió sigue guardándose sin señal y se sincroniza después."]];
const right3 = [["chart", "Progreso a la vista", "Récords, cargas, volumen y 1RM estimado por ejercicio."],
  ["body", "Mi cuerpo", "Peso, objetivo y fotos privadas, sólo para el socio. Primera etapa, no es un diagnóstico."],
  ["trophy", "Comunidad y desafíos", "Desafíos con premio y ranking, novedades y publicaciones voluntarias del gimnasio."],
  ["chat", "Ayuda en el momento", "Puede pedir que venga un entrenador desde su serie (seguimiento de sala, se activa por gimnasio)."]];
const callCol = (items, align) => items.map(([i, t, d]) => `<div class="callout" style="${align === "r" ? "flex-direction:row-reverse;text-align:right" : ""}">${ic(i, "7mm")}<div><b>${t}</b><span class="mu">${d}</span></div></div>`).join("");
pages.push(`<section class="page dark">
  <div class="glow" style="width:170mm;height:170mm;left:20mm;top:70mm"></div>
  <div class="pad">
    <span class="kick">Para tus socios</span>
    <h2 class="d">Cada socio, una experiencia<br><span class="cy">más completa.</span></h2>
    <p class="lead" style="color:#D7E0EA">Una herramienta para organizar su entrenamiento y ver cómo evoluciona. Se agrega a la pantalla de inicio desde el navegador: iPhone o Android, sin pasar por las tiendas.</p>
    <div style="flex:1;display:grid;grid-template-columns:1fr 66mm 1fr;gap:6mm;align-items:center;margin-top:4mm">
      <div style="display:flex;flex-direction:column;gap:7mm">${callCol(left3)}</div>
      ${phone("socio-serie", "66mm")}
      <div style="display:flex;flex-direction:column;gap:7mm">${callCol(right3, "r")}</div>
    </div>
    <div style="display:flex;gap:4mm;margin-top:5mm">
      ${["socio-inicio", "socio-progreso", "socio-gym"].map((x) => phone(x, "26mm")).join("")}
      <div style="align-self:center;margin-left:3mm"><p class="d" style="font-size:20pt">Lo que hace en la sala<br><span class="cy">queda registrado.</span></p><p class="note" style="margin-top:2mm">Sus datos son suyos: elige qué comparte con su coach o su gimnasio, puede descargarlos o pedir que se borren.</p></div>
    </div>
  </div>${foot(true)}
</section>`);

// 4 · Entrenadores
pages.push(`<section class="page">
  <div class="pad">
    <span class="kick">Para tu equipo de sala</span>
    <h2 class="d" style="font-size:34pt">Tus entrenadores, con más herramientas<br><span class="cyD">para hacer lo que mejor saben.</span></h2>
    <p class="lead">REPI ordena el trabajo en sala y deja el criterio donde corresponde: en el profesional. La tecnología propone y organiza; las decisiones las toma tu equipo.</p>
    <div style="margin-top:5mm">${browser("sala-turno", "178mm", "", "1280 / 610")}</div>
    <div class="grid3" style="margin-top:5mm">
      ${[["clock", "Mi turno y cola de asistencia", "Qué hay pendiente en su sede, quién pidió ayuda y en qué orden atender."],
        ["swap", "Traspaso de turno", "Lo hecho y lo que falta pasa al turno siguiente con su historial."],
        ["user", "Ficha del socio", "Programa, notas y molestias informadas, para atender con contexto."],
        ["layers", "Programas y métodos", "Por días, con métodos avanzados y versiones: el socio ve qué cambió."],
        ["spark", "Borradores con IA", "Propuestas de programa a partir del pedido del socio. Nada se asigna sin revisión."],
        ["chat", "Mensajes y pedidos", "Pedidos de programa con preferencias, mensajes y un desempeño propio para mejorar."]]
        .map(([i, t, d]) => `<div class="card">${ic(i)}<h3 style="margin-top:2.2mm">${t}</h3><p class="mu">${d}</p></div>`).join("")}
    </div>
  </div>${foot()}
</section>`);

// 5 · Dueño
pages.push(`<section class="page dark">
  <div class="glow" style="width:200mm;height:200mm;right:-70mm;top:-50mm"></div>
  <div class="pad">
    <span class="kick">Para vos, que tomás las decisiones</span>
    <h2 class="d">Tu gimnasio,<br><span class="cy">de un vistazo.</span></h2>
    <p class="lead" style="color:#D7E0EA">Socios activos, asistencia, alertas y el servicio de tu equipo, por sede. Con permisos para que cada persona vea sólo lo que le corresponde.</p>
    <div style="margin-top:5mm">${browser("dueno-equipo-servicio", "178mm", "", "1280 / 430")}</div>
    <div class="grid2" style="margin-top:4mm;gap:4mm">${browser("dueno-comunidad", "87mm", "", "1280 / 720")}${browser("dueno-equipo", "87mm", "", "1280 / 720")}</div>
    <p class="note" style="margin-top:2mm">Performance Center, comunidad del gimnasio y equipo con su estado de turno. Capturas reales con datos de demostración.</p>
    <div class="grid3" style="margin-top:5mm">
      <div><p class="d cy" style="font-size:21pt">Más visibilidad</p><ul class="ul" style="margin-top:2mm"><li>Tablero ejecutivo y vista por sede</li><li>Equipo y servicio: tareas, tiempos de respuesta y reseñas</li><li>Participación de los socios</li></ul></div>
      <div><p class="d cy" style="font-size:21pt">Mejor organización</p><ul class="ul" style="margin-top:2mm"><li>Equipo con roles: gerencia, coordinación, sala y recepción</li><li>Turnos, tareas y avisos internos</li><li>Altas por QR que aprueba tu equipo</li></ul></div>
      <div><p class="d cy" style="font-size:21pt">Más conexión</p><ul class="ul" style="margin-top:2mm"><li>Comunidad con moderación del gimnasio</li><li>Desafíos con premio, novedades y catálogo</li><li>Tus novedades llegan a la app de cada socio</li></ul></div>
    </div>
  </div>${foot(true)}
</section>`);

// 6 · Diferencial
pages.push(`<section class="page">
  <div class="pad">
    <span class="kick">Por qué REPI</span>
    <h2 class="d">Mucho más que<br><span class="cyD">una app de rutinas.</span></h2>
    <div style="display:grid;grid-template-columns:1fr 64mm;gap:7mm;margin-top:6mm;flex:1">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4.5mm;align-content:start">
        ${[["bolt", "Training Intelligence", "Un motor propio que propone carga y repeticiones para cada serie desde el historial del socio, explica por qué y nunca sube la exigencia a mitad de sesión."],
          ["users", "Socio, entrenador y gimnasio conectados", "Lo que el socio registra lo ve su entrenador; lo que pasa en la sala lo ve la gerencia. Una sola información, tres miradas."],
          ["spark", "IA que ahorra trabajo", "Arma borradores de programa y la rutina del día si no vino el profe. Siempre revisables: no recibe nombres ni datos de salud."],
          ["chart", "Progreso real e historial", "Gráficos por ejercicio, récords y volumen. El historial anterior del socio también puede sumarse."],
          ["gauge", "Operación de sala", "Pedidos de ayuda en vivo, cola, traspasos y tiempos de respuesta: el servicio del equipo se puede medir."],
          ["shield", "Privacidad por diseño", "Permisos por rol y sede. El gimnasio no ve chats privados ni datos de salud sin autorización del socio."]]
          .map(([i, t, d]) => `<div class="card">${ic(i)}<h3 style="margin-top:2.2mm">${t}</h3><p class="mu">${d}</p></div>`).join("")}
      </div>
      <div style="display:flex;flex-direction:column;gap:5mm">
        ${phone("socio-progreso", "64mm")}
        <div class="card" style="background:var(--paper2);box-shadow:none"><span class="pill o" style="color:var(--mute)">En evolución</span><p class="mu" style="margin-top:2mm;font-size:8.8pt">Medidas corporales y análisis más completos están en desarrollo. Las apps en tiendas son una etapa futura. No forman parte de lo que se contrata hoy.</p></div>
      </div>
    </div>
  </div>${foot()}
</section>`);

// 7 · Inversión que escala
const barA = (h, max) => (h / max) * 62; // mm
const chartPrice = `<svg viewBox="0 0 240 165" style="width:100%;height:auto" aria-label="Precio por socio: ${$(A.precioPorSocio)} con ${A.socios} socios, ${$(B.precioPorSocio)} con ${B.socios} socios">
  <line x1="20" y1="140" x2="230" y2="140" stroke="#fff" stroke-opacity=".25"/>
  ${[[A, 55, "#2D3B4F"], [B, 145, "#00D1FF"]].map(([s, x, c]) => { const h = (s.precioPorSocio / A.precioPorSocio) * 92; return `<rect x="${x}" y="${140 - h}" width="56" height="${h}" rx="6" fill="${c}"/><text x="${x + 28}" y="${132 - h}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="24" fill="#F8FAFC">${$(s.precioPorSocio)}</text><text x="${x + 28}" y="158" text-anchor="middle" font-family="Barlow" font-size="11" fill="#A9B6C6">${s.socios} socios</text>`; }).join("")}
  <text x="20" y="12" font-family="Barlow" font-size="10.5" fill="#A9B6C6">Precio por socio por mes (desde $0)</text>
</svg>`;
const chartGrowth = `<svg viewBox="0 0 300 120" style="width:100%;height:auto" aria-label="Socios ${nPct(sociosPct)} más; inversión mensual ${nPct(totalPct)} más">
  ${[["Socios", sociosPct, "#5DE6D8", 30], ["Inversión mensual en REPI", totalPct, "#00D1FF", 82]].map(([t, v, c, y]) => { const w = (v / sociosPct) * 200; return `<text x="0" y="${y - 8}" font-family="Barlow" font-size="11" fill="#A9B6C6">${t}</text><rect x="0" y="${y}" width="200" height="20" rx="5" fill="#fff" fill-opacity=".07"/><rect x="0" y="${y}" width="${w}" height="20" rx="5" fill="${c}"/><text x="${Math.max(w, 10) + 8}" y="${y + 16}" font-family="Barlow Condensed" font-weight="700" font-size="22" fill="#F8FAFC">+${nPct(v)}</text>`; }).join("")}
</svg>`;
const scen = (s, tot, hl) => `<div class="card" style="${hl ? "box-shadow:inset 0 0 0 .5mm #00D1FF;background:rgba(0,209,255,.08)" : ""}">
  <p class="kick" style="color:${hl ? "#00D1FF" : "#A9B6C6"}">Ejemplo ${hl ? "B" : "A"}</p>
  <p class="num" style="font-size:38pt;margin-top:1.5mm">${s.socios}<span style="font-size:16pt"> socios</span></p>
  <p style="font-size:11pt;margin-top:2mm">${s.socios} × ${$(s.precioPorSocio)} por socio</p>
  <p class="num ${hl ? "cy" : ""}" style="font-size:30pt;margin-top:2mm">${$(tot)}<span style="font-size:14pt"> /mes</span></p>
</div>`;
pages.push(`<section class="page dark">
  <div class="glow" style="width:180mm;height:180mm;left:-50mm;bottom:-40mm"></div>
  <div class="pad">
    <span class="kick">Modelo comercial</span>
    <h2 class="d">Una inversión que<br><span class="cy">escala con tu gimnasio.</span></h2>
    <p class="lead" style="color:#D7E0EA">Pagás una mensualidad según la cantidad de socios acordada y el precio por socio que negociamos con vos. A mayor volumen, podemos ofrecerte un menor precio por socio.</p>
    <div class="grid2" style="margin-top:6mm">${scen(A, totA)}${scen(B, totB, true)}</div>
    <p class="d" style="font-size:32pt;margin-top:5mm">Más socios. <span class="cy">Menor costo por persona.</span></p>
    <div class="grid2" style="margin-top:4mm;align-items:end">
      <div class="card">${chartPrice}<p class="note" style="margin-top:1mm">El precio por socio baja un ${nPct(Math.abs(precioPct))}.</p></div>
      <div class="card">${chartGrowth}<p class="note" style="margin-top:2mm">Misma escala para las dos barras.</p></div>
    </div>
    <div style="margin-top:5mm;display:grid;grid-template-columns:repeat(4,1fr);gap:3mm">
      ${[[`+${nPct(sociosPct)}`, "más socios"], [`−${nPct(Math.abs(precioPct))}`, "precio por socio"], [`+${nPct(totalPct)}`, "inversión mensual"], [$(diff), "de diferencia por mes"]].map(([n, t]) => `<div style="border-top:.4mm solid rgba(255,255,255,.18);padding-top:2mm"><p class="num cy" style="font-size:24pt">${n}</p><p class="mu" style="font-size:9pt">${t}</p></div>`).join("")}
    </div>
    <p style="margin-top:4mm;font-size:11pt">En estos ejemplos, una base de socios un ${nPct(sociosPct)} mayor representa solamente un <b class="cy">${nPct(totalPct)} más</b> de inversión mensual en REPI.</p>
    <p class="note" style="margin-top:3mm">Ejemplos comerciales ilustrativos, no una lista de precios: el precio por socio se acuerda con cada gimnasio según la cantidad pactada. Se factura la cantidad de socios acordada, no la cantidad de usuarios activos en la app. Impuestos y demás condiciones, según la propuesta comercial.</p>
  </div>${foot(true)}
</section>`);

// 8 · Cuota
const dots = (() => { // 1.000 pesos de cuota = 1.000 puntos; REPI ocupa ~2,83 de cada 1.000.
  const perMil = (B.precioPorSocio / cuota) * 1000; const full = Math.floor(perMil); const part = perMil - full;
  const cols = 100, s = 6, g = 1.6; let out = "";
  for (let i = 0; i < 1000; i++) {
    const x = (i % cols) * (s + g), y = Math.floor(i / cols) * (s + g); const k = 999 - i;
    const fill = k < full ? "#00D1FF" : k === full && part > 0 ? "url(#part)" : "#D9D4C9";
    out += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.2" fill="${fill}"/>`;
  }
  const W = cols * (s + g), H = (1000 / cols) * (s + g);
  out += `<rect x="${W - 4 * (s + g) - 2}" y="${H - (s + g) - 2.5}" width="${4 * (s + g) + 2.5}" height="${s + g + 3}" rx="3" fill="none" stroke="#0094B8" stroke-width="1.6"/>`;
  return { svg: `<svg viewBox="-2 -2 ${W + 4} ${H + 4}" style="width:100%;height:auto" aria-label="De cada 1.000 pesos de cuota, unos ${perMil.toFixed(1)} corresponden a REPI"><defs><linearGradient id="part" x1="0" x2="1"><stop offset="${part}" stop-color="#00D1FF"/><stop offset="${part}" stop-color="#D9D4C9"/></linearGradient></defs>${out}</svg>`, perMil };
})();
pages.push(`<section class="page">
  <div class="pad">
    <span class="kick">Cómo se ve en la cuota</span>
    <h2 class="d">Sumar REPI sin alterar<br><span class="cyD">tu estructura de precios.</span></h2>
    <p class="lead">Un ejemplo con ${B.socios} socios, una cuota de ${$(cuota)} por mes y un precio ilustrativo de ${$(B.precioPorSocio)} por socio:</p>
    <div style="margin-top:5mm;text-align:center">
      <p class="d" style="font-size:58pt;line-height:.9">De ${$(cuota)}</p>
      <p class="d cyD" style="font-size:58pt;line-height:.9">a ${$(cuotaNueva)}.</p>
    </div>
    <div style="margin-top:7mm;display:grid;grid-template-columns:repeat(4,1fr);gap:3mm">
      ${[["Cuota actual", $(cuota), ""], ["Valor de REPI", `+${$(B.precioPorSocio)}`, "cyD"], ["Cuota con REPI", $(cuotaNueva), ""], ["Ajuste", `${nPct(Math.round(cuotaPct * 100) / 100)}`, "cyD"]].map(([t, n, c]) => `<div class="card" style="text-align:center;padding:4mm"><p class="mu" style="font-size:9pt">${t}</p><p class="num ${c}" style="font-size:26pt;margin-top:1.5mm">${n}</p></div>`).join("")}
    </div>
    <div class="card" style="margin-top:6mm">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h3>Cada punto es $${(cuota / 1000).toLocaleString("es-AR")} de la cuota</h3><p class="mu" style="font-size:9pt">REPI: unos ${dots.perMil.toLocaleString("es-AR", { maximumFractionDigits: 1 })} de cada 1.000</p></div>
      <div style="margin-top:3mm">${dots.svg}</div>
      <p class="mu" style="margin-top:2mm;font-size:9pt">Los puntos en cian (al final, abajo a la derecha) son la parte de la cuota que representa REPI en este ejemplo: ${$(B.precioPorSocio)} por mes, menos de ${$(Math.ceil(porDia))} por día.</p>
    </div>
    <div style="margin-top:5mm;display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:center">
      <p style="font-size:12.5pt;line-height:1.38">Un ajuste de apenas el <b class="cyD">${nPct(Math.round(cuotaPct * 100) / 100)}</b> permite incorporar una plataforma completa a la experiencia de tus socios.</p>
      <div style="background:var(--navy);color:#F8FAFC;border-radius:4.5mm;padding:5mm"><p class="mu" style="color:#A9B6C6;font-size:9pt">Con ${B.socios} socios que abonen el ajuste</p><p class="num" style="font-size:26pt;margin-top:1.5mm">${B.socios} × ${$(B.precioPorSocio)} = <span class="cy">${$(recupero)}</span></p><p style="font-size:9.4pt;margin-top:1.5mm;color:#D7E0EA">Igual a la mensualidad ilustrativa de REPI para ese gimnasio.</p></div>
    </div>
    <p class="d" style="font-size:21pt;margin-top:5mm">Más herramientas para tu gimnasio.<br><span class="cyD">Más valor para tus socios.</span></p>
    <p class="note" style="margin-top:3mm">Ejemplo ilustrativo. Se trata de sumar valor al servicio y comunicarlo a tus socios, no de un cargo oculto. Cubrir la mensualidad depende de cuántos socios abonen efectivamente el ajuste y de las condiciones comerciales acordadas; no implica un aumento automático de rentabilidad. Ingreso adicional expresado en bruto.</p>
  </div>${foot()}
</section>`);

// 9 · Todo lo que incluye
const inv = [
  ["phone", "Experiencia del socio", ["Rutina del día por programa, en el teléfono", "Registro de series: carga fina, repeticiones, RIR o RPE, descanso automático y sensación", "Training Intelligence: anterior, recomendado y real en cada serie", "Historial de sesiones y progreso por ejercicio con récords y 1RM estimado", "Mi cuerpo: peso, objetivo y fotos privadas (primera etapa)", "Registro sin señal de lo ya abierto", "Pedido de programa con sus preferencias"]],
  ["users", "Entrenadores y sala", ["Mi turno, cola de asistencia y traspaso de turno", "Ficha del socio con programa, notas y molestias", "Programas por días, métodos avanzados y versiones", "Borradores de programa con IA, siempre revisados", "Videos de ejercicios y equipamiento de tu gimnasio", "Mensajes y desempeño propio", "Pedidos de ayuda desde la serie (se activa por gimnasio)"]],
  ["gauge", "Gerencia y dueños", ["Tablero ejecutivo y vista por sede", "Equipo y servicio: tareas, tiempos y reseñas", "Equipo con roles, turnos y tareas", "Socios, participación y solicitudes de acceso", "Altas por QR por sede, aprobadas por tu equipo", "Control de ingreso con QR dinámico (se activa por gimnasio)", "Tus condiciones con REPI siempre visibles"]],
  ["trophy", "Comunidad", ["Comunidad voluntaria con moderación del gimnasio", "Desafíos con premio, ranking y validación", "Novedades, promociones y catálogo informativo", "Cada socio elige si participa y qué comparte"]],
  ["spark", "Tecnología e inteligencia", ["Training Intelligence: reglas explicables, sin subir la exigencia a mitad de sesión", "IA generativa sólo para borradores que una persona revisa", "Lectura de historiales desde planilla, texto, foto o PDF", "App web instalable en iPhone y Android, sin tiendas"]],
  ["shield", "Seguridad y acceso", ["Una cuenta por persona, con invitación o QR", "Permisos por rol y por sede", "Sin acceso del gimnasio a chats privados ni salud sin permiso", "Exportación de datos y pedidos de borrado", "Verificación en dos pasos opcional en cada cuenta"]],
];
pages.push(`<section class="page">
  <div class="pad">
    <span class="kick">Todo lo que incluye</span>
    <h2 class="d">Una plataforma.<br><span class="cyD">Todo tu gimnasio.</span></h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4.5mm;margin-top:6mm">
      ${inv.map(([i, t, items]) => `<div class="card" style="padding:4.5mm 5mm"><div style="display:flex;align-items:center;gap:2.5mm">${ic(i)}<h3>${t}</h3></div><ul class="ul" style="margin-top:1.5mm">${items.map((x) => `<li>${x}</li>`).join("")}</ul></div>`).join("")}
    </div>
    <p class="note" style="margin-top:auto">Disponible hoy en REPI. «Se activa por gimnasio»: está disponible y REPI lo enciende para tu gimnasio. «Primera etapa»: alcance acotado, no es un diagnóstico.</p>
  </div>${foot()}
</section>`);

// 10 · Implementación
const steps = [["Conversamos", "Nos contás cómo trabaja tu gimnasio: sedes, equipo y cantidad de socios. Te mostramos REPI en una demostración."],
  ["Acordamos", "Cantidad de socios, precio por socio y alcance, por escrito."],
  ["Habilitamos", "REPI registra el acuerdo, habilita tu espacio e invita al responsable con un enlace personal."],
  ["Preparás tu equipo", "Invitás a gerencia, sala y recepción con su rol, y cada sede tiene su QR."],
  ["Tus socios se suman", "Escanean el QR de su sede, crean su cuenta y tu equipo aprueba el acceso. Empiezan a entrenar."]];
pages.push(`<section class="page dark">
  <div class="glow" style="width:170mm;height:170mm;right:-50mm;top:40mm"></div>
  <div class="pad">
    <span class="kick">Implementación</span>
    <h2 class="d">Empezar es simple.<br><span class="cy">Y ordenado.</span></h2>
    <p class="lead" style="color:#D7E0EA">No hace falta instalar equipos ni cargar padrones. Cada paso tiene un responsable y quedan registrados.</p>
    <div style="display:grid;grid-template-columns:1fr 60mm;gap:8mm;margin-top:7mm;flex:1">
      <ol style="list-style:none;display:flex;flex-direction:column;gap:7.5mm">
        ${steps.map(([t, d], i) => `<li style="display:grid;grid-template-columns:13mm 1fr;gap:3mm;align-items:start"><span class="num cy" style="font-size:30pt">${i + 1}</span><div style="border-top:.3mm solid rgba(255,255,255,.16);padding-top:2mm"><b style="font-size:13.5pt">${t}</b><p class="mu" style="font-size:10.4pt;margin-top:1mm">${d}</p></div></li>`).join("")}
      </ol>
      <div style="display:flex;flex-direction:column;gap:5mm">
        ${phone("socio-inicio", "64mm")}
      </div>
    </div>
    <div class="grid3" style="margin-top:6mm">
      <div class="card"><h3>Acompañamiento incluido</h3><p class="mu">Avisanos cualquier error o duda de uso: está incluido en tu acuerdo. Si algo te impide trabajar, respondemos dentro de las 24 horas.</p></div>
      <div class="card"><h3>Socios, sin fricción</h3><p class="mu">La app se agrega a la pantalla de inicio desde el navegador. Una guía muestra cómo, en iPhone o Android.</p></div>
      <div class="card"><h3>Ya funciona en un gimnasio real</h3><p class="mu">REPI está en funcionamiento en Smart Center Gym, en Mar del Plata.</p></div>
    </div>
    <p class="note" style="margin-top:4mm">Los plazos de puesta en marcha dependen de cada gimnasio. Cambios a medida o mantenimiento específico se cotizan aparte, acordados antes de hacerlos.</p>
  </div>${foot(true)}
</section>`);

// 11 · Cierre
pages.push(`<section class="page dark">
  <div class="glow" style="width:230mm;height:230mm;left:-10mm;top:-30mm"></div>
  <div class="glow tq" style="width:150mm;height:150mm;right:-40mm;bottom:-30mm"></div>
  <div class="pad">
    ${wm("40mm")}
    <h2 class="d" style="font-size:58pt;margin-top:20mm">El próximo nivel<br>de tu gimnasio<br><span class="cy">empieza acá.</span></h2>
    <p class="lead" style="color:#D7E0EA;font-size:13pt">Ofrecé a tus socios una experiencia de entrenamiento más completa, conectá a tu equipo y sumá herramientas de gestión por un costo accesible y adaptado al tamaño de tu gimnasio.</p>
    <div style="margin-top:12mm;display:grid;grid-template-columns:58mm 1fr;gap:9mm;align-items:center">
      <a href="${esc(qrUrl)}" class="qr" style="display:block;background:#fff;border-radius:5mm;padding:4mm;box-shadow:0 0 0 1.4mm rgba(0,209,255,.45)">${qrSvg(qrUrl)}</a>
      <div>
        <p class="d" style="font-size:30pt">Conocé REPI en una <span class="cy">demostración.</span></p>
        <p style="margin-top:3mm;font-size:11pt;color:#D7E0EA">Escaneá el código o escribinos. Te mostramos REPI con tu gimnasio en mente y te armamos una propuesta.</p>
        <ul style="list-style:none;margin-top:5mm;display:flex;flex-direction:column;gap:2.5mm;font-size:12pt">
          <li><a href="${esc(qrUrl)}">${ic("spark", "5mm")} <b>${C.web}</b>/conoce/gimnasios</a></li>
          <li><a href="${esc(waUrl)}">${ic("chat", "5mm")} WhatsApp <b>${C.whatsappLabel}</b></a></li>
          <li><a href="${esc(mailUrl)}">${ic("bell", "5mm")} ${C.email}</a></li>
          ${ASESOR ? `<li>${ic("user", "5mm")} Tu asesor: <b>${esc(ASESOR)}</b>${REF ? ` · ${REF}` : ""}</li>` : ""}
        </ul>
      </div>
    </div>
    <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center">
      <p class="d" style="font-size:20pt">Cada repetición <span class="cy">cuenta.</span></p>
      <div style="display:flex;align-items:center;gap:3mm"><img src="${asset("sovare-isotipo.webp")}" alt="" style="height:9mm"><span style="font-size:8pt;line-height:1.2;color:#A9B6C6">Un producto de<br><b style="color:#F8FAFC;letter-spacing:.12em">SOVARE</b></span></div>
    </div>
    <p class="note" style="margin-top:4mm">Este documento es material comercial: no es un contrato, una factura ni una oferta con condiciones. Los importes son ejemplos ilustrativos; las condiciones se acuerdan en una propuesta para cada gimnasio.</p>
  </div>${foot(true)}
</section>`);

// ── Resumen de una página ───────────────────────────────────────────────────
const onePager = `<section class="page dark">
  <div class="glow" style="width:180mm;height:180mm;left:-50mm;top:-60mm"></div>
  <div class="glow tq" style="width:140mm;height:140mm;right:-50mm;bottom:60mm"></div>
  <div class="pad" style="inset:13mm 14mm 11mm">
    <div style="display:flex;justify-content:space-between;align-items:center">${wm("28mm")}<span class="kick">Para dueños de gimnasios</span></div>
    <h1 class="d" style="font-size:44pt;margin-top:6mm">Tu gimnasio, <span class="cy">en otro nivel.</span></h1>
    <p style="margin-top:2.5mm;font-size:11pt;color:#D7E0EA;max-width:170mm">Socios, entrenadores y gerencia conectados en una misma experiencia de entrenamiento, seguimiento y gestión.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm;margin-top:5mm">
      ${[["phone", "Una experiencia más completa para tus socios", "Rutina en el teléfono, objetivo para cada serie, progreso y comunidad."],
        ["users", "Más herramientas para tus entrenadores", "Turno, cola de asistencia, ficha del socio, programas y traspasos."],
        ["gauge", "Mejor información para gestionar", "Equipo y servicio por sede, roles, turnos y altas por QR."]]
        .map(([i, t, d]) => `<div class="card" style="padding:4mm">${ic(i, "6.5mm")}<h3 style="margin-top:2mm;font-size:11.5pt">${t}</h3><p class="mu" style="font-size:9pt">${d}</p></div>`).join("")}
    </div>
    <div style="position:relative;height:78mm;margin-top:6mm;flex:none">
      ${browser("sala-turno", "136mm", "position:absolute;left:0;top:6mm", "1280 / 640")}
      ${phone("socio-serie", "35mm", "position:absolute;right:4mm;top:0")}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm">
      <div class="card" style="box-shadow:inset 0 0 0 .5mm #00D1FF;background:rgba(0,209,255,.08)"><p class="kick">Ejemplo ilustrativo</p><p class="num" style="font-size:21pt;margin-top:1.5mm;white-space:nowrap">${B.socios} × ${$(B.precioPorSocio)} = <span class="cy">${$(totB)}</span><span style="font-size:11pt">/mes</span></p><p class="mu" style="font-size:8.8pt;margin-top:1.2mm">Mensualidad según socios acordados y precio por socio negociado. A mayor volumen, menor precio por socio.</p></div>
      <div class="card"><p class="kick">En la cuota</p><p class="num" style="font-size:21pt;margin-top:1.5mm;white-space:nowrap">${$(cuota)} → <span class="cy">${$(cuotaNueva)}</span></p><p class="mu" style="font-size:8.8pt;margin-top:1.2mm">En una cuota de ${$(cuota)}, incorporar ${$(B.precioPorSocio)} representa un ajuste de apenas el ${nPct(Math.round(cuotaPct * 100) / 100)}.</p></div>
    </div>
    <div style="margin-top:auto;display:grid;grid-template-columns:32mm 1fr;gap:6mm;align-items:center">
      <a href="${esc(qrUrl)}" style="display:block;background:#fff;border-radius:3.5mm;padding:2.4mm" class="qr">${qrSvg(qrUrl)}</a>
      <div><p class="d" style="font-size:23pt">Pedí tu <span class="cy">demostración.</span></p>
        <p style="font-size:10.2pt;margin-top:1.2mm;color:#D7E0EA"><a href="${esc(qrUrl)}"><b>${C.web}</b>/conoce/gimnasios</a> · <a href="${esc(waUrl)}">WhatsApp <b>${C.whatsappLabel}</b></a> · <a href="${esc(mailUrl)}">${C.email}</a>${ASESOR ? ` · Asesor: <b>${esc(ASESOR)}</b>` : ""}</p>
        <p class="note" style="margin-top:1.2mm">Importes ilustrativos, no una lista de precios. Capturas reales con datos de demostración. Material comercial, no un contrato.</p></div>
    </div>
  </div>
</section>`;

// ── Salida ──────────────────────────────────────────────────────────────────
const OUT = here("../salida/"), PAGES = here("../paginas/"), BUILD = here("build/");
for (const d of [OUT, PAGES, BUILD]) mkdirSync(d, { recursive: true });
const files = [
  ["REPI_DOSSIER_COMERCIAL_GIMNASIOS", doc("REPI · Dossier comercial para gimnasios 2026", pages)],
  ["REPI_RESUMEN_COMERCIAL_GIMNASIOS", doc("REPI · Resumen comercial para gimnasios", [onePager])],
];
const b = await launch();
try {
  for (const [name, html] of files) {
    const htmlPath = `${BUILD}${name}.html`;
    writeFileSync(htmlPath, html);
    const page = await b.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const missing = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
    if (missing.length) throw new Error(`Imágenes sin cargar: ${missing.join(", ")}`);
    const overflow = await page.evaluate(() => [...document.querySelectorAll(".page")].map((p, i) => [i + 1, (!!p.querySelector(".foot") && [...p.querySelectorAll(".pad")].some((x) => x.scrollHeight > x.clientHeight + 1)) || (!!p.querySelector(".foot") && [...p.querySelectorAll(".pad > *")].some((el) => el.getBoundingClientRect().bottom > p.getBoundingClientRect().bottom - 14 * 3.78))]).filter(([, o]) => o).map(([i]) => i));
    if (overflow.length) console.warn(`⚠ Contenido que no entra en la página: ${overflow.join(", ")}`);
    await page.pdf({ path: `${OUT}${name}.pdf`, preferCSSPageSize: true, printBackground: true, tagged: true, outline: false });
    await page.close();
    console.log("✓", `${name}.pdf`);
  }
} finally { await b.close(); }
// Vista de cada página para la revisión visual (pdftoppm, si está instalado).
try {
  for (const f of readdirSync(PAGES)) rmSync(`${PAGES}${f}`);
  for (const [name] of files) execFileSync("pdftoppm", ["-r", "80", "-png", `${OUT}${name}.pdf`, `${PAGES}${name}`]);
  console.log("✓ vistas por página en paginas/");
} catch { console.log("(sin pdftoppm: no se generaron las vistas por página)"); }
