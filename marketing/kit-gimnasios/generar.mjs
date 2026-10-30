// Kit de difusión para gimnasios (D125): folleto A5 plastificable (frente y dorso), stickers y piezas para redes.
// Uso (desde la raíz del repo):
//   node marketing/kit-gimnasios/generar.mjs                                   → versión general, QR a repiclub.com/instalar
//   node marketing/kit-gimnasios/generar.mjs --gym "Gym Norte" --url "https://repiclub.com/unirse/<código-de-sede>"
// Con --url de una sede, el QR abre el pedido de acceso de esa sede (y antes la guía para agregar a inicio). Ese enlace
// sale de Gym › «Accesos y QR». Genera PDF vectorial para imprenta y PNG para ver o compartir en salida/<carpeta>/.
// Textos sin promesas de resultados: los números los ve cada gimnasio en su panel.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../apps/web/package.json"));
const { renderSVG } = require("uqr");

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const url = arg("url") ?? "https://repiclub.com/instalar";
const gym = (arg("gym") ?? "").trim();
// Logo del gimnasio (SVG) para el cartel co-marca «repi × gym». El SVG se incrusta: su texto usa las fuentes de la página.
const logo = arg("logo") ? readFileSync(arg("logo"), "utf8").replace(/<!--[\s\S]*?-->/g, "") : null;
const sede = /\/unirse\//.test(url);
const slug = gym ? gym.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "general";
const out = join(here, "salida", slug);
const tmp = join(out, ".html");
rmSync(out, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const A = (f) => pathToFileURL(join(here, "assets", f)).href;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const qr = renderSVG(url, { border: 2 });
const short = url.replace(/^https?:\/\//, "");
const G = esc(gym);

// Marca: Concepto 2 · G · Atlética. Barlow en interfaz y cuerpo, Barlow Condensed en titulares. Navy, cian y turquesa.
const base = (size, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&family=Montserrat:wght@500;700&display=block" rel="stylesheet">
<style>
@page { size: ${size}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #0B0F14; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Barlow, Arial, sans-serif; color: #F8FAFC; }
.pg { position: relative; overflow: hidden; background: #0B0F14; }
.glow { position: absolute; pointer-events: none; background: radial-gradient(closest-side, rgba(0,209,255,.28), transparent 70%), radial-gradient(closest-side at 70% 65%, rgba(93,230,216,.18), transparent 70%); }
.d { font-family: "Barlow Condensed", Arial, sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: -.01em; line-height: .92; }
.cy { color: #00D1FF; } .tq { color: #5DE6D8; } .mu { color: #BFCBDA; }
.wm { position: relative; display: inline-block; } .wm img { width: 100%; display: block; }
.wm i { position: absolute; left: 88.92%; top: 1.58%; width: 10.12%; aspect-ratio: 1; border-radius: 50%; background: #00D1FF; }
.qr { background: #fff; display: grid; place-items: center; } .qr svg { width: 100%; height: 100%; display: block; }
.chip { display: inline-flex; align-items: center; gap: .4em; border: 1px solid rgba(0,209,255,.45); color: #00D1FF; border-radius: 999px; font-weight: 600; }
</style></head><body>${body}</body></html>`;
const wm = (w) => `<span class="wm" style="width:${w}"><img src="${A("wordmark.png")}" alt="repi"><i></i></span>`;

const steps = sede
  ? [["1", "Escaneá el QR", "Con la cámara del teléfono"], ["2", "Creá tu cuenta y pedí acceso", "El equipo del gym te aprueba"], ["3", "Agregá REPI a inicio", "Y entrás con un toque"]]
  : [["1", "Escaneá el QR", "Con la cámara del teléfono"], ["2", "Agregá REPI a inicio", "Sin tiendas de apps"], ["3", "Entrá con tu email", "El que te dio tu gym o coach"]];

const pieces = [];
const mm = (name, w, h, html) => pieces.push({ name, kind: "mm", w, h, html: base(`${w}mm ${h}mm`, `<div class="pg" style="width:${w}mm;height:${h}mm">${html}</div>`) });
const px = (name, w, h, html) => pieces.push({ name, kind: "px", w, h, html: base(`${w}px ${h}px`, `<div class="pg" style="width:${w}px;height:${h}px">${html}</div>`) });

// 1 · Folleto A5 plastificable, frente: QR grande y tres pasos.
mm("folleto-a5-frente", 148, 210, `
<div class="glow" style="inset:-25% -30% auto;height:70%"></div>
<div style="position:relative;height:100%;padding:11mm 11mm 9mm;display:flex;flex-direction:column;align-items:center;text-align:center">
  <div style="width:100%;display:flex;justify-content:space-between;align-items:center">${wm("30mm")}<span class="tq" style="font-weight:600;font-size:9.5pt">Cada repetición cuenta.</span></div>
  <p class="cy" style="margin-top:8mm;font-weight:700;font-size:10pt;letter-spacing:.18em;text-transform:uppercase">${G ? `${G} entrena con REPI` : "Tu gym entrena con REPI"}</p>
  <h1 class="d" style="margin-top:3mm;font-size:39pt">Tu rutina<br>en tu teléfono</h1>
  <p class="mu" style="margin-top:3.5mm;font-size:10.5pt;line-height:1.4;max-width:112mm">Tu programa, cada serie que hacés, tu progreso y el equipo de sala, en una app que se agrega a tu pantalla de inicio.</p>
  <div class="qr" style="margin-top:6mm;width:62mm;height:62mm;padding:3mm;border-radius:6mm;box-shadow:0 0 0 1.6mm rgba(0,209,255,.4)">${qr}</div>
  <p class="cy" style="margin-top:3mm;font-weight:600;font-size:10.5pt">${esc(short)}</p>
  <div style="margin-top:auto;width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:3mm">
    ${steps.map(([n, t, d]) => `<div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:4mm;padding:3.5mm 3mm;text-align:left">
      <span class="d cy" style="font-size:20pt">${n}</span><p style="font-weight:700;font-size:9.5pt;line-height:1.2;margin-top:1mm">${t}</p><p class="mu" style="font-size:8pt;line-height:1.3;margin-top:1mm">${d}</p></div>`).join("")}
  </div>
  <p style="margin-top:4mm;font-size:8pt;color:#94A3B8">iPhone y Android · No se descarga nada de una tienda · Gratis para socios</p>
</div>`);

// 1b · Cartel de pared A4 (pedido del titular, 30/10): QR grande y tres pasos con íconos, para pegar en la sala. Todo lo
// importante queda lejos de los bordes: la imprenta puede recortarlo a otra proporción (un cartón 3:4) sin cortar nada.
const ico = {
  cam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M19 8v6M16 11h6"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>`,
  bar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>`,
  tap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 6 18l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L9 15"/></svg>`,
};
const wallSteps = sede
  ? [["1", ico.cam, "Escaneá", "con la cámara"], ["2", ico.plus, "Pedí acceso", "creá tu cuenta"], ["3", ico.bar, "Entrená", "anotá cada serie"]]
  : [["1", ico.cam, "Escaneá", "con la cámara"], ["2", ico.home, "Agregala", "a tu inicio"], ["3", ico.tap, "Entrá", "con un toque"]];
mm("cartel-pared-a4", 210, 297, `
<div class="glow" style="inset:-20% -35% auto;height:65%"></div>
<div style="position:absolute;inset:auto -30% -25% 20%;height:45%;background:radial-gradient(closest-side,rgba(93,230,216,.12),transparent 70%)"></div>
<div style="position:relative;height:100%;padding:22mm 18mm 22mm;display:flex;flex-direction:column;align-items:center;text-align:center">
  ${logo
    ? `<div style="display:flex;align-items:center;justify-content:center;gap:8mm">${wm("40mm")}<span class="cy" style="font-weight:500;font-size:30pt;line-height:1">×</span><span style="display:block;width:70mm">${logo.replace("<svg ", '<svg style="width:100%;height:auto;display:block" ')}</span></div>`
    : `<div style="width:100%;display:flex;justify-content:space-between;align-items:center">${wm("42mm")}
    <span class="tq" style="font-weight:700;font-size:10.5pt;letter-spacing:.2em;text-transform:uppercase;text-align:right;line-height:1.5">${G ? `Socios de<br>${G}` : "Para socios<br>y alumnos"}</span></div>`}
  <h1 class="d" style="margin-top:11mm;font-size:58pt">Tu rutina,<br>en tu teléfono<span class="cy">.</span></h1>
  <p class="mu" style="margin-top:5mm;font-size:13.5pt;line-height:1.45;max-width:172mm">${sede
    ? `${logo ? "" : `${G || "Tu gym"} entrena con REPI. `}Escaneá el código, creá tu cuenta y pedí acceso. El equipo te habilita y tu rutina, tus pesos y tu progreso quedan en tu teléfono.`
    : "Escaneá el código con la cámara y agregá REPI a tu pantalla de inicio. No hace falta pasar por ninguna tienda de apps."}</p>
  <div style="margin-top:8mm;padding:2.2mm;border-radius:11mm;background:#00D1FF">
    <div style="padding:3mm;border-radius:9mm;background:#0B0F14"><div class="qr" style="width:86mm;height:86mm;padding:5.5mm;border-radius:7mm">${qr}</div></div>
  </div>
  <p style="margin-top:5mm;font-weight:700;font-size:16pt">${esc(short)}</p>
  <div style="margin-top:auto;padding-top:8mm;width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:5mm">
    ${wallSteps.map(([n, i, t, d]) => `<div style="display:flex;align-items:center;gap:3mm;text-align:left">
      <span style="flex:none;width:11mm;height:11mm;border-radius:50%;background:#00D1FF;color:#0B0F14;display:grid;place-items:center;font-weight:700;font-size:12pt">${n}</span>
      <span class="tq" style="flex:none;width:9mm;height:9mm;display:block">${i}</span>
      <span><b style="display:block;font-size:13pt">${t}</b><span class="mu" style="font-size:10.5pt">${d}</span></span></div>`).join("")}
  </div>
  <p style="margin-top:7mm;font-size:10pt;color:#94A3B8">iPhone y Android · Sin tiendas de apps · Gratis para socios</p>
</div>`);

// 2 · Folleto A5, dorso: qué tiene el socio y cómo agregar a inicio.
const feats = [
  ["Tu programa del día", "Abrís y sabés qué te toca: ejercicios, series y repeticiones."],
  ["Anotás cada serie", "Peso, reps y sensación. Ves la serie anterior y tu progreso."],
  ["Pedís ayuda en sala", "Rutina nueva, una duda o una molestia: le llega al profe de turno."],
  ["Tu carnet en el teléfono", "Mostrás tu QR en recepción para el ingreso."],
  ["Desafíos y premios", "Comunidad, desafíos y premios de tu gimnasio."],
  ["Tus datos, tu decisión", "Elegís qué compartir. Tu salud y tus mensajes no se comparten sin tu permiso."],
];
mm("folleto-a5-dorso", 148, 210, `
<div class="glow" style="inset:auto -30% -30%;height:60%"></div>
<div style="position:relative;height:100%;padding:11mm;display:flex;flex-direction:column">
  <h2 class="d" style="font-size:26pt">Qué tenés<br><span class="cy">en REPI</span></h2>
  <div style="margin-top:6mm;display:grid;grid-template-columns:1fr 1fr;gap:3.2mm">
    ${feats.map(([t, d]) => `<div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:4mm;padding:3.5mm">
      <span style="display:block;width:6mm;height:1.2mm;border-radius:1mm;background:#00D1FF"></span>
      <p style="font-weight:700;font-size:10pt;margin-top:2mm">${t}</p><p class="mu" style="font-size:8.5pt;line-height:1.35;margin-top:1mm">${d}</p></div>`).join("")}
  </div>
  <h3 class="d" style="margin-top:7mm;font-size:16pt">Agregala a tu pantalla de inicio</h3>
  <div style="margin-top:3mm;display:grid;grid-template-columns:1fr 1fr;gap:3.2mm">
    <div style="border:1px solid rgba(0,209,255,.4);border-radius:4mm;padding:3.5mm"><p class="cy" style="font-weight:700;font-size:9.5pt">iPhone · Safari</p>
      <ol style="margin-top:1.5mm;padding-left:4mm;font-size:8.8pt;line-height:1.5"><li>Tocá <b>Compartir</b> (cuadrado con flecha)</li><li>Elegí <b>Agregar a inicio</b></li><li>Tocá <b>Agregar</b></li></ol></div>
    <div style="border:1px solid rgba(0,209,255,.4);border-radius:4mm;padding:3.5mm"><p class="cy" style="font-weight:700;font-size:9.5pt">Android · Chrome</p>
      <ol style="margin-top:1.5mm;padding-left:4mm;font-size:8.8pt;line-height:1.5"><li>Tocá el menú <b>⋮</b></li><li>Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b></li><li>Confirmá</li></ol></div>
  </div>
  <div style="margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:4mm">
    <div style="display:flex;align-items:center;gap:3mm"><img src="${A("icono.png")}" style="width:12mm;height:12mm;border-radius:3mm"><p style="font-size:8.5pt;line-height:1.35" class="mu">¿Dudas? Preguntá en recepción<br>o al profe de sala.</p></div>
    <div class="qr" style="width:22mm;height:22mm;padding:1mm;border-radius:2mm">${qr}</div>
  </div>
</div>`);

// 3 · Sticker redondo 80 mm (recepción, mostrador, vidrio).
mm("sticker-redondo-80mm", 80, 80, `
<div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 30%, #12324a, #0B0F14 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  ${wm("22mm")}
  <p class="d" style="margin-top:2.5mm;font-size:12pt">Escaneá y <span class="cy">entrená</span></p>
  <div class="qr" style="margin-top:2.5mm;width:30mm;height:30mm;padding:1.2mm;border-radius:2.5mm">${qr}</div>
  <p class="tq" style="margin-top:2mm;font-size:6.5pt;font-weight:600">${G || "Tu rutina en tu teléfono"}</p>
</div>`);

// 4 · Sticker para máquinas 70 × 50 mm.
mm("sticker-maquina-70x50", 70, 50, `
<div style="position:absolute;inset:0;border-radius:4mm;border:.6mm solid #00D1FF;padding:4mm;display:flex;align-items:center;gap:3.5mm">
  <div style="flex:1;min-width:0">${wm("15mm")}
    <p class="d" style="margin-top:2mm;font-size:15pt">Anotá esta<br><span class="cy">serie</span></p>
    <p class="mu" style="margin-top:1.5mm;font-size:6.5pt;line-height:1.3">Peso, reps y progreso en tu teléfono.</p></div>
  <div class="qr" style="width:29mm;height:29mm;padding:1mm;border-radius:2mm;flex:none">${qr}</div>
</div>`);

// 5 · Sticker de espejo 100 × 100 mm.
mm("sticker-espejo-100mm", 100, 100, `
<div class="glow" style="inset:-30%;"></div>
<div style="position:relative;height:100%;padding:7mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <p class="d" style="font-size:20pt">¿Y tu rutina<br>de hoy?</p>
  <p class="d cy" style="margin-top:1.5mm;font-size:20pt">Está en REPI</p>
  <div class="qr" style="margin-top:4mm;width:40mm;height:40mm;padding:1.5mm;border-radius:3mm">${qr}</div>
  <div style="margin-top:3.5mm">${wm("20mm")}</div>
</div>`);

// 6 · Vinilo de vidriera 200 × 200 mm.
mm("vinilo-vidriera-200mm", 200, 200, `
<div class="glow" style="inset:-20%"></div>
<div style="position:relative;height:100%;padding:16mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  ${wm("58mm")}
  <p class="d" style="margin-top:9mm;font-size:46pt">Acá entrenamos<br><span class="cy">con REPI</span></p>
  <p class="mu" style="margin-top:6mm;font-size:15pt">${G ? `Socios de ${G}: ` : ""}pedí tu acceso en recepción</p>
  <div class="qr" style="margin-top:8mm;width:50mm;height:50mm;padding:2mm;border-radius:4mm">${qr}</div>
</div>`);

// 7 · Historia de Instagram 1080 × 1920 con captura real de la app.
const phone = (img, w) => `<div style="width:${w}px;padding:${w * 0.035}px;border-radius:${w * 0.16}px;background:#1A2433;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.08)">
  <img src="${A(img)}" style="width:100%;display:block;border-radius:${w * 0.13}px"></div>`;
px("historia-1080x1920", 1080, 1920, `
<div class="glow" style="inset:-10% -40% auto;height:60%"></div>
<div style="position:relative;height:100%;padding:110px 80px 90px;display:flex;flex-direction:column;align-items:center;text-align:center">
  ${wm("190px")}
  <h1 class="d" style="margin-top:56px;font-size:118px">Tu rutina<br><span class="cy">en tu teléfono</span></h1>
  <p class="mu" style="margin-top:28px;font-size:38px;line-height:1.3">${G ? `${G} ahora entrena con REPI.` : "Programa, series y progreso en un toque."}</p>
  <div style="margin-top:56px;display:flex;gap:28px;align-items:flex-end">${phone("app-inicio.png", 400)}<div style="margin-bottom:80px">${phone("app-entreno.png", 330)}</div></div>
  <div style="margin-top:auto;display:flex;align-items:center;gap:30px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:32px;padding:26px 34px">
    <div class="qr" style="width:170px;height:170px;padding:8px;border-radius:16px">${qr}</div>
    <div style="text-align:left"><p style="font-weight:700;font-size:36px">Escaneá o entrá a</p><p class="cy" style="font-weight:600;font-size:34px;margin-top:6px">${esc(short)}</p><p class="mu" style="font-size:26px;margin-top:8px">Sin tiendas de apps · iPhone y Android</p></div>
  </div>
</div>`);

// 8 · Post de feed 1080 × 1350.
px("post-1080x1350", 1080, 1350, `
<div class="glow" style="inset:auto -30% -30% 20%;height:70%"></div>
<div style="position:relative;height:100%;padding:80px;display:grid;grid-template-columns:1fr 400px;gap:50px;align-items:center">
  <div>${wm("150px")}
    <h1 class="d" style="margin-top:50px;font-size:104px">Cada serie<br><span class="cy">cuenta</span></h1>
    <p class="mu" style="margin-top:28px;font-size:34px;line-height:1.35">Anotá peso y repeticiones, mirá tu serie anterior y pedí ayuda al profe de sala desde el teléfono.</p>
    <span class="chip" style="margin-top:40px;font-size:28px;padding:14px 26px">${G ? `Ya disponible en ${G}` : "Agregala a tu inicio"}</span>
  </div>
  ${phone("app-entreno.png", 400)}
</div>`);

// 9 · Imagen cuadrada 1080 × 1080 para WhatsApp y difusión del gym.
px("whatsapp-1080x1080", 1080, 1080, `
<div class="glow" style="inset:-30% -20% auto;height:80%"></div>
<div style="position:relative;height:100%;padding:80px;display:flex;flex-direction:column;align-items:center;text-align:center">
  ${wm("170px")}
  <h1 class="d" style="margin-top:44px;font-size:96px">${G ? `${G}<br><span class="cy">ya está en REPI</span>` : `Tu gym<br><span class="cy">ya está en REPI</span>`}</h1>
  <p class="mu" style="margin-top:24px;font-size:32px">Escaneá, creá tu cuenta y agregala a tu pantalla de inicio.</p>
  <div class="qr" style="margin-top:auto;width:330px;height:330px;padding:14px;border-radius:28px;box-shadow:0 0 0 10px rgba(0,209,255,.35)">${qr}</div>
  <p class="cy" style="margin-top:22px;font-weight:600;font-size:30px">${esc(short)}</p>
</div>`);

for (const p of pieces) {
  const f = join(tmp, `${p.name}.html`);
  writeFileSync(f, p.html);
  const href = pathToFileURL(f).href;
  const common = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000", `--user-data-dir=${join(tmp, ".chrome")}`];
  // PNG: piezas de imprenta a 300 ppp (mm → px a 96 ppp × 3.125); piezas de redes a su tamaño exacto.
  const [w, h, scale] = p.kind === "mm" ? [Math.round((p.w / 25.4) * 96), Math.round((p.h / 25.4) * 96), 3.125] : [p.w, p.h, 1];
  execFileSync(CHROME, [...common, `--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`, `--screenshot=${join(out, `${p.name}.png`)}`, href], { stdio: "ignore" });
  if (p.kind === "mm") execFileSync(CHROME, [...common, "--no-pdf-header-footer", `--print-to-pdf=${join(out, `${p.name}.pdf`)}`, href], { stdio: "ignore" });
  console.log("ok", p.name);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\nListo: ${out}\nQR → ${url}`);
