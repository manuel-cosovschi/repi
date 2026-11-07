// Grabación de videos reales de la demo (D205). Datos ficticios de la demo guiada local; sólo se superponen títulos y subtítulos.
import { createRequire } from "node:module"; const { chromium } = createRequire("/home/user/repi/apps/web/package.json")("@playwright/test");
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const RAW = true; const B = "http://localhost:3000"; const OUT = process.argv[2]; const only = process.argv[3];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let ipn = 10;
const CSS = `.dt-pill,.dt-card,.dt-ring{display:none!important}
#rv-cap{pointer-events:none;position:fixed;left:16px;right:16px;bottom:118px;z-index:2147483646;background:rgba(11,15,20,.94);color:#F8FAFC;font:600 17px/1.35 var(--font-ui);padding:14px 16px 14px 18px;border-radius:16px;border-left:4px solid #00D1FF;box-shadow:0 12px 32px rgba(0,0,0,.35);opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s}
#rv-cap.on{opacity:1;transform:none}
#rv-card{pointer-events:none;position:fixed;inset:0;z-index:2147483647;background:#0B0F14;color:#F8FAFC;display:flex;flex-direction:column;justify-content:center;padding:0 28px;transition:opacity .45s}
#rv-card .k{font:500 13px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:#00D1FF;margin:26px 0 10px}
#rv-card h1{margin:0;font:700 54px/.95 var(--font-display);text-transform:uppercase;letter-spacing:-.01em}
#rv-card p{margin:16px 0 0;font:500 20px/1.35 var(--font-ui);color:#E2E8F0}
#rv-card .wm{width:110px}
#rv-tap{position:fixed;z-index:2147483645;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(0,209,255,.35);border:2px solid #00D1FF;pointer-events:none;transition:transform .5s,opacity .5s}`;
function helpers(p) {
  const h = {
    css: () => p.addStyleTag({ content: CSS }),
    card: async (k, t, sub, ms = 2600, keep = false) => { if (RAW) { await p.waitForTimeout(keep ? 400 : 300); return; }
      await p.evaluate(([k, t, sub]) => {
        document.getElementById("rv-card")?.remove();
        const d = document.createElement("div"); d.id = "rv-card";
        d.innerHTML = `<span class="wm" style="position:relative;display:block;width:110px"><img src="/brand/wm_full.png" style="width:100%;display:block"><i style="position:absolute;left:88.92%;top:1.58%;width:10.12%;aspect-ratio:1;border-radius:50%;background:#00D1FF"></i></span><div class="k">${k}</div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ""}`;
        document.body.appendChild(d);
      }, [k, t, sub]);
      await p.waitForTimeout(ms);
      if (!keep) { await p.evaluate(() => { const d = document.getElementById("rv-card"); if (d) { d.style.opacity = "0"; setTimeout(() => d.remove(), 500); } }); await p.waitForTimeout(500); }
    },
    cap: async (t, ms = 0) => { if (RAW) { if (ms) await p.waitForTimeout(Math.min(ms, 1800)); return; }
      await p.evaluate((t) => {
        let d = document.getElementById("rv-cap"); if (!d) { d = document.createElement("div"); d.id = "rv-cap"; document.body.appendChild(d); }
        if (!t) { d.classList.remove("on"); return; }
        d.textContent = t; d.classList.remove("on"); void d.offsetWidth; d.classList.add("on");
      }, t);
      if (ms) await p.waitForTimeout(ms);
    },
    tap: async (loc, ms = 900) => {
      const el = loc.first(); try { await el.scrollIntoViewIfNeeded({ timeout: 8000 }); } catch (e) { console.log('  no visible:', String(loc)); await p.screenshot({ path: OUT + '/fail.png' }); throw e; } const bb = await el.boundingBox();
      if (bb && !RAW) await p.evaluate(([x, y]) => { const d = document.createElement("div"); d.id = "rv-tap"; d.style.left = x + "px"; d.style.top = y + "px"; document.body.appendChild(d); setTimeout(() => { d.style.transform = "scale(1.6)"; d.style.opacity = "0"; }, 250); setTimeout(() => d.remove(), 800); }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
      await p.waitForTimeout(300); try { await el.click({ timeout: 8000 }); } catch (e) { console.log('  tap falló:', String(loc), e.message.split('\n').slice(0,6).join(' / ')); await p.screenshot({ path: OUT + '/fail.png' }); throw e; } await p.waitForTimeout(ms);
    },
    scrollTo: async (re, off = 120) => { await p.getByText(re).first().evaluate((n, off) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - off, behavior: "smooth" }), off); await p.waitForTimeout(900); },
    menu: async () => { const m = p.getByRole("button", { name: "Abrir menú" }); if (await m.isVisible().catch(() => false)) { await h.tap(m, 500); } },
    nav: async (label) => { await h.menu(); const el = p.locator(`button[title="${label}"], [aria-label="${label}"]`); if (await el.count()) await h.tap(el, 1600); else await h.tap(p.getByRole("button", { name: new RegExp(`^${label}`) }), 1600); },
  };
  return h;
}
async function record(name, role, scenes, extra) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  const p = await ctx.newPage();
  const r = await p.request.post(`${B}/api/demo`, { data: { role }, headers: { "x-forwarded-for": `10.92.${ipn++}.1` } });
  const { href } = await r.json();
  if (extra) await extra(p);
  await p.addInitScript((role) => { try { sessionStorage.setItem(`repi:tour:${role}`, JSON.stringify({ i: 0, open: false })); } catch {} }, role);
  await p.goto(B + href); await p.waitForLoadState("networkidle").catch(() => {});
  const h = helpers(p); await h.css();
  // Captura: screencast de Chrome (cuadros con su marca de tiempo) → ffmpeg con la duración real de cada cuadro.
  const cdp = await ctx.newCDPSession(p); const frames = [];
  cdp.on("Page.screencastFrame", async (f) => { frames.push({ data: f.data, t: f.metadata.timestamp }); try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {} });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  await scenes(p, h);
  await p.waitForTimeout(300); await cdp.send("Page.stopScreencast"); await ctx.close();
  const dir = `${OUT}/${name}-frames-${Date.now()}`; mkdirSync(dir, { recursive: true });
  let list = "";
  frames.forEach((f, i) => { const fn = `${dir}/${String(i).padStart(5, "0")}.jpg`; writeFileSync(fn, Buffer.from(f.data, "base64")); const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - f.t) : 0.6; list += `file '${fn}'\nduration ${d.toFixed(4)}\n`; });
  list += `file '${dir}/${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
  writeFileSync(`${dir}/list.txt`, list);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", "-an", `${OUT}/${name}.mp4`]);
  console.log("ok", name, frames.length, "cuadros", ((frames.at(-1).t - frames[0].t)).toFixed(1), "s");
}
const END = async (h) => { await h.cap(""); await h.card("Demo guiada", "Probalo sin cuenta", "repiclub.com/conoce<br>Datos ficticios, desde tu teléfono.", 3000, true); };
const weights = async (p) => {
  for (const [d, w] of [[40, 84000], [25, 82600], [12, 81900], [2, 80400]]) await p.request.post(`${B}/api/me/progress/body/weights`, { data: { day: new Date(Date.now() - d * 86400000).toISOString().slice(0, 10), weightG: w } });
  await p.request.post(`${B}/api/me/progress/body/goal`, { data: { targetG: 76000 } });
};
const startSession = async (p, h) => {
  await h.nav("Entrenar");
  await h.tap(p.getByRole("button", { name: /Comenzar entrenamiento/ }), 1000);
  const sk = p.getByRole("button", { name: "Saltar" }); if (await sk.isVisible().catch(() => false)) await h.tap(sk, 1800);
  const ok = p.getByRole("button", { name: "Entendido" }); while (await ok.first().isVisible().catch(() => false)) { await ok.first().click(); await p.waitForTimeout(300); }
};
const V = {
  "f-intelligence": () => record("f-intelligence", "member", async (p, h) => {
    await h.card("Training Intelligence", "Un objetivo para cada serie", "Con la razón a la vista.", 2600);
    await startSession(p, h);
    await h.scrollTo(/Press de banca/, 70);
    await h.cap("Tu profe indicó 8–10 repeticiones. REPI recomienda 53 kg × 8 a partir de tu serie anterior.", 4200);
    await h.tap(p.getByRole("button", { name: "¿Por qué?" }), 600);
    await h.cap("Cada número trae su explicación, y lo que indicó tu profe se ve siempre primero.", 3600);
    const ok = p.getByRole("button", { name: "Entendido" }); if (await ok.first().isVisible().catch(() => false)) await ok.first().click();
    await h.cap("Hoy la primera serie costó más: salieron 5 repeticiones.", 600);
    for (let i = 0; i < 3; i++) await h.tap(p.getByRole("button", { name: "Menos repeticiones" }), 350);
    await p.waitForTimeout(1600);
    await h.tap(p.getByRole("button", { name: /Completar serie 1/ }), 1500);
    await h.cap("REPI ajusta la próxima serie. Sólo mantiene o baja la exigencia: nunca te empuja a subir a mitad de sesión.", 5200);
    await END(h);
  }),
  "perfil-deportistas": () => record("perfil-deportistas", "member", async (p, h) => {
    await h.card("REPI para deportistas", "Cada serie cuenta", "Tu rutina, tu objetivo y tu progreso en el teléfono.", 2600);
    await h.cap("Tu próximo entrenamiento y las novedades de tu coach y tu gimnasio.", 3200);
    await startSession(p, h);
    await h.cap("Cargás peso y repeticiones con un toque, con el objetivo de REPI al lado.", 3400);
    await h.tap(p.getByRole("button", { name: "Bien", exact: true }), 500);
    await h.tap(p.getByRole("button", { name: /Completar serie 1/ }), 900);
    await h.cap("El descanso corre solo. Y si te quedás sin señal, se sigue guardando.", 3600);
    await h.tap(p.getByRole("button", { name: "Saltar descanso" }), 600);
    await h.cap("", 0);
    await h.tap(p.getByRole("button", { name: "Volver" }), 900);
    const out = p.getByRole("button", { name: /Salir un momento/ }); if (await out.isVisible().catch(() => false)) await h.tap(out, 1400);
    await h.nav("Progreso");
    const pt = p.locator("[data-pt]").last(); if (await pt.isVisible().catch(() => false)) await pt.click();
    await h.scrollTo(/Evolución por ejercicio/, 30);
    await h.cap("Tu evolución por ejercicio y tus récords, desde lo que registrás.", 3800);
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await p.waitForTimeout(700);
    await h.tap(p.getByRole("tab", { name: /Mi cuerpo/ }), 1200);
    await h.scrollTo(/^Objetivo$/, 120);
    await h.cap("Tu peso y tu objetivo, privados: sólo los ves vos.", 3600);
    await END(h);
  }, weights),
  "perfil-entrenadores": () => record("perfil-entrenadores", "coach", async (p, h) => {
    await h.card("REPI para entrenadores", "Tus alumnos en un solo lugar", "Programas, seguimiento y mensajes.", 2600);
    await h.cap("Tu panel: quién entrenó, quién no y qué necesita tu atención hoy.", 3600);
    await h.nav("Clientes");
    await h.cap("Cada alumno con su programa y su adherencia.", 2600);
    await h.tap(p.getByText(/Valentina Gómez/).first(), 1600);
    const rend = p.getByRole("tab", { name: /Rendimiento/ }).or(p.getByRole("button", { name: /^Rendimiento/ }));
    if (await rend.first().isVisible().catch(() => false)) { await h.tap(rend, 1600); await h.cap("Rendimiento con 1RM estimado y volumen, desde lo que registra tu alumno.", 3600); }
    else await h.cap("La ficha de cada alumno: sesiones, rendimiento y objetivos.", 3400);
    await h.nav("Programas");
    await h.cap("Programas por días con métodos avanzados. Cada cambio queda versionado.", 3800);
    await h.nav("Mensajes");
    await h.cap("Chat con cada alumno, separado de tu WhatsApp personal.", 3400);
    await END(h);
  }),
  "gym-owner": () => record("gym-owner", "owner", async (p, h) => {
    await h.card("REPI para gimnasios", "Que cada socio tenga su entrenador", "Altas, sala y comunidad en un solo lugar.", 2600);
    await h.nav("Ejecutivo");
    await h.cap("Tu gimnasio de un vistazo, por sede, con una guía de primeros pasos.", 3600);
    await h.nav("Solicitudes de acceso");
    await h.cap("Camila escaneó el QR de la sede y pidió acceso. Tu equipo confirma que es socia.", 3800);
    await h.tap(p.getByRole("button", { name: "Aprobar" }), 1000);
    await h.cap("Elegís cómo confirmaste que es socia y aprobás.", 600);
    await h.tap(p.getByText("Lo conozco: es socio/a"), 900);
    await h.tap(p.getByRole("button", { name: "Confirmar acceso" }), 1500);
    await h.cap("Aprobada: Camila ya entrena con su rutina en el teléfono.", 2800);
    await h.nav("Comunidad");
    await h.cap("Novedades, descuentos y desafíos que tus socios ven en la app.", 3200);
    await h.cap("", 0);
  }),
  "gym-floor": () => record("gym-floor", "floor", async (p, h) => {
    await h.nav("Mi turno");
    await h.cap("En la sala: Julián marcó «Quiero que venga un entrenador» en su serie.", 3600);
    const voy = p.getByRole("button", { name: "Voy" }); if (await voy.isVisible().catch(() => false)) await h.tap(voy, 1500);
    await h.cap("Sofía toca «Voy» y el resto del equipo ve que ya lo atiende.", 3400);
    await h.nav("Sala");
    await h.cap("Pedidos, traspasos de turno y seguimientos: nada queda sin atender.", 3600);
    await END(h);
  }),
};
for (const [k, f] of Object.entries(V)) { if (only && !only.split(",").includes(k)) continue; try { await f(); } catch (e) { console.log("FAIL", k, e.message.split("\n")[0]); } }
await b.close();
