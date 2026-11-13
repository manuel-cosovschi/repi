// Grabación en alta resolución de la demo local, por tramos (films 4.0). Reemplaza a rec-raw.mjs para el teléfono:
// el screencast de Chrome sale a 390×844 aunque el contexto esté a 3×, así que acá cada cuadro es una captura
// (Page.captureScreenshot con clip a 3×, ≈ 13 por segundo) a 1170×2532, con su marca de tiempo real → MP4 CFR 30.
// Los scrolls se graban cuadro a cuadro (h.glide*), a 30 exactos, para que no se vean a saltos.
// Cada tramo (`seg`) es un MP4 propio que arranca en 0: la navegación por el menú lateral queda fuera de cámara.
// Junto a cada MP4 se escribe <tramo>.json con las marcas de tiempo (segundos desde el inicio del tramo) de cada toque.
//
// Uso:  REPI_BASE=http://localhost:3280 node rec-hd.mjs <carpeta footage> [sesión,…]
//       (sesiones: member, coach, floor, owner y, para los films de la segunda tanda, member2 y owner2)
// Sólo demo local con base descartable y datos ficticios. Nunca producción.
// `member2` graba además a la profesora de sala de la MISMA demo que la socia (para que el pedido de ayuda que se ve llegar sea
// el que la socia acaba de mandar). La demo sólo abre la sesión del perfil elegido, así que la de la profesora se abre con una
// fila `session` en la base local descartable (mismo recurso que `ctl-results`, ver SPEC.md): hacen falta DATABASE_URL (sólo
// 127.0.0.1/localhost y una base `repi_e2e_*`) y BETTER_AUTH_SECRET del servidor local. Nunca contra dev ni producción.
//
// Qué se oculta al grabar (ruido de entorno, no producto) y nada más:
//   · la píldora y las tarjetas del recorrido guiado de la demo (.dt-*), que tapan contenido;
//   · el indicador de desarrollo de Next (nextjs-portal), que sólo existe en `next dev`;
//   · el cartel «Avisos push: no están configurados en este entorno» (sólo aparece porque la demo local no tiene push);
//   · los correos ficticios «…@demo-xxxx.invalid» se desenfocan (como cualquier dato de contacto en un video de producto).
// No se cambia ningún texto, número ni pantalla.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomInt, randomBytes, createHmac } from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = process.env.REPI_PW_PKG ? createRequire(process.env.REPI_PW_PKG)("@playwright/test") : require("playwright");
const B = process.env.REPI_BASE || "http://localhost:3000";
if (/repiclub\.com/.test(B)) { console.error("Nunca contra producción."); process.exit(1); }
const OUT = process.argv[2]; const only = process.argv[3];
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.REPI_CHROME || "/opt/pw-browsers/chromium" });
const ip = () => `10.${randomInt(1, 255)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
const HIDE = `.dt-pill,.dt-card,.dt-ring,nextjs-portal,.gy-incoming[aria-label="Avisos en este dispositivo"]{display:none!important} .rec-blur{filter:blur(5px)}`;

const CTX = (vp, dsf) => ({ viewport: vp, deviceScaleFactor: dsf, isMobile: vp.width < 600, hasTouch: true, colorScheme: "light", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
const hideInit = (p) => p.addInitScript((css) => {
  const put = () => { if (!document.getElementById("rec-hide") && document.head) { const s = document.createElement("style"); s.id = "rec-hide"; s.textContent = css; document.head.appendChild(s); } };
  const blur = () => { put(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/@demo-[0-9a-f]+\.invalid/.test(n.nodeValue) && n.parentElement && !n.parentElement.classList.contains("rec-blur")) n.parentElement.classList.add("rec-blur"); } };
  document.addEventListener("DOMContentLoaded", () => { blur(); new MutationObserver(blur).observe(document.body, { childList: true, subtree: true, characterData: true }); });
}, HIDE);

/** Herramientas de grabación sobre una página ya abierta (tramos, toques, scroll cuadro a cuadro). */
async function rig(ctx, p, vp, dsf) {
  const cdp = await ctx.newCDPSession(p);
  const base = p.url().split("?")[0];
  const h = {
    base,
    wait: (ms) => p.waitForTimeout(ms),
    /** Tramo grabado: MP4 propio + marcas. */
    seg: async (name, body) => {
      const dir = `${OUT}/.${name}-frames`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
      const frames = []; const marks = {}; let on = false, loop = null, vt = 0, vt0 = 0, wall0 = 0;
      const now = () => (on ? vt0 + (Date.now() - wall0) / 1000 : vt);
      // El recorte de captureScreenshot va en coordenadas de página: hay que sumarle el scroll de cada cuadro.
      const shot = async (t) => { const m = await cdp.send("Page.getLayoutMetrics"); const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 93, optimizeForSpeed: true, clip: { x: m.cssVisualViewport.pageX, y: m.cssVisualViewport.pageY, width: vp.width, height: vp.height, scale: dsf } }); const fn = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`; writeFileSync(fn, Buffer.from(data, "base64")); frames.push({ fn, t }); };
      const start = () => { on = true; vt0 = vt; wall0 = Date.now(); loop = (async () => { while (on) { const t = now(); try { await shot(t); } catch { break; } } })(); };
      const stop = async () => { vt = now(); on = false; await loop; };
      h.mark = (k) => { marks[k] = +now().toFixed(2); };
      // Scroll cuadro a cuadro (30 por segundo exactos, sin depender de la velocidad de captura): se detiene la captura en
      // tiempo real, se mueve la página con la curva y se toma un cuadro por paso.
      h.glide = async (to, ms = 900) => {
        await stop(); const from = await p.evaluate(() => scrollY); const n = Math.max(2, Math.round(ms / 1000 * 30));
        const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight); to = Math.max(0, Math.min(max, to));
        for (let i = 1; i <= n; i++) { const k = i / n; const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; await p.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), from + (to - from) * e); vt += 1 / 30; await shot(vt); }
        start();
      };
      h.glideTo = async (re, off = 120, ms = 900, hold = 0) => { const y = await p.getByText(re).first().evaluate((n, off) => n.getBoundingClientRect().top + scrollY - off, off); await h.glide(y, ms); if (hold) await p.waitForTimeout(hold); };
      h.glideBy = async (dy, ms = 900, hold = 0) => { const y = await p.evaluate(() => scrollY); await h.glide(y + dy, ms); if (hold) await p.waitForTimeout(hold); };
      start(); await p.waitForTimeout(250);
      await body();
      await p.waitForTimeout(250); await stop(); h.mark = null;
      let list = ""; frames.forEach((f, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - f.t) : 0.5; list += `file '${f.fn}'\nduration ${d.toFixed(4)}\n`; });
      list += `file '${frames.at(-1).fn}'\n`; writeFileSync(`${dir}/list.txt`, list);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-g", "30", "-movflags", "+faststart", "-an", `${OUT}/${name}.mp4`]);
      const dur = frames.at(-1).t - frames[0].t;
      writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dur: +dur.toFixed(2), fps: +(frames.length / dur).toFixed(1), marks }, null, 1));
      rmSync(dir, { recursive: true, force: true });
      console.log("ok", name, `${dur.toFixed(1)} s`, `${(frames.length / dur).toFixed(0)} cuadros/s`, JSON.stringify(marks));
    },
    tap: async (loc, ms = 900, mark) => { const el = loc.first(); await el.scrollIntoViewIfNeeded({ timeout: 8000 }); await p.waitForTimeout(200); if (mark && h.mark) h.mark(mark); await el.click({ timeout: 8000 }); await p.waitForTimeout(ms); },
    scrollTo: async (re, off = 120, ms = 900) => { await p.getByText(re).first().evaluate((n, off) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - off, behavior: "smooth" }), off); await p.waitForTimeout(ms); },
    jumpTo: async (re, off = 120) => { await p.getByText(re).first().evaluate((n, off) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - off, behavior: "instant" }), off); await p.waitForTimeout(400); },
    top: async (smooth = false) => { await p.evaluate((s) => window.scrollTo({ top: 0, behavior: s ? "smooth" : "instant" }), smooth); await p.waitForTimeout(smooth ? 800 : 300); },
    menu: async () => { const m = p.getByRole("button", { name: "Abrir menú" }); if (await m.isVisible().catch(() => false)) { await m.click(); await p.waitForTimeout(500); } },
    nav: async (label) => { await h.menu(); const el = p.locator(`button[title="${label}"], [aria-label="${label}"]`); if (await el.count()) await el.first().click(); else await p.getByRole("button", { name: new RegExp(`^${label}`) }).first().click(); await p.waitForTimeout(1800); },
    go: async (s) => { await p.goto(`${base}?s=${s}`); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(900); },
  };
  return h;
}

/** Sesión de la demo guiada (`role`). Con `o.anon`, una página pública sin sesión (`o.anon()` devuelve la ruta). */
async function session(role, fn, o = {}) {
  const vp = o.viewport ?? { width: 390, height: 844 }; const dsf = o.dsf ?? 3;
  const ctx = await b.newContext(CTX(vp, dsf));
  const p = await ctx.newPage();
  let href;
  if (o.anon) href = await o.anon();
  else { const r = await p.request.post(`${B}/api/demo`, { data: { role }, headers: { "x-forwarded-for": ip() } }); ({ href } = await r.json()); }
  if (o.extra) await o.extra(p);
  await p.addInitScript((role) => { try { sessionStorage.setItem(`repi:tour:${role}`, JSON.stringify({ i: 0, open: false })); } catch {} }, role);
  await hideInit(p);
  await p.goto(B + href); await p.waitForLoadState("networkidle").catch(() => {});
  const h = await rig(ctx, p, vp, dsf); h.ctx = ctx; h.vp = vp; h.dsf = dsf;
  try { await fn(p, h); } catch (e) { console.log("FAIL", role, e.message.split("\n").slice(0, 4).join(" / ")); await p.screenshot({ path: `${OUT}/fail-${role}.png` }).catch(() => {}); }
  await ctx.close();
}

/** Otra persona de la MISMA demo que `h.ctx` (p. ej. la profesora de sala del gimnasio de la socia): la demo sólo abre la sesión
 *  del perfil elegido, así que ésta se abre con una fila `session` en la base LOCAL descartable. Devuelve { p, h, close }. */
async function sameDemo(h, name, path) {
  const DB = process.env.DATABASE_URL || ""; const secret = process.env.BETTER_AUTH_SECRET;
  if (!/@(127\.0\.0\.1|localhost):\d+\/repi_e2e_[a-z0-9_]+$/.test(DB) || !secret) throw new Error("sameDemo: sólo con una base local descartable (repi_e2e_*) y BETTER_AUTH_SECRET del servidor local");
  if (!/^[\p{L} ]+$/u.test(name)) throw new Error("nombre inesperado");
  const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
  const ck = (await h.ctx.cookies()).find((c) => /session_token/.test(c.name)); const raw = decodeURIComponent(ck.value); const tok = raw.slice(0, raw.lastIndexOf("."));
  if (!/^[\w-]+$/.test(tok)) throw new Error("token inesperado");
  const uid = sql(`select user_id from session where token='${tok}'`);
  const who = sql(`select u.id from demo_sandbox d, jsonb_array_elements_text(d.user_ids) x join "user" u on u.id=x join staff_membership sm on sm.user_id=u.id where d.user_ids ? '${uid}' and u.name='${name}' limit 1`);
  if (!who) throw new Error(`no hay «${name}» en la demo`);
  const org = sql(`select org_id from staff_membership where user_id='${who}' limit 1`);
  const t2 = randomBytes(24).toString("base64url");
  sql(`insert into session (id, token, user_id, expires_at, user_agent) values ('${randomBytes(16).toString("hex")}', '${t2}', '${who}', now() + interval '2 hours', 'films-rec')`);
  const ctx = await b.newContext(CTX(h.vp, h.dsf));
  await ctx.addCookies([{ name: ck.name, value: encodeURIComponent(`${t2}.${createHmac("sha256", secret).update(t2).digest("base64")}`), domain: new URL(B).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const p = await ctx.newPage(); await hideInit(p);
  await p.goto(`${B}${path(org)}`); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1200);
  const h2 = await rig(ctx, p, h.vp, h.dsf);
  return { p, h: h2, close: () => ctx.close() };
}

const weights = async (p) => {
  for (const [d, w] of [[40, 84000], [25, 82600], [12, 81900], [2, 80400]]) await p.request.post(`${B}/api/me/progress/body/weights`, { data: { day: new Date(Date.now() - d * 86400000).toISOString().slice(0, 10), weightG: w } });
  await p.request.post(`${B}/api/me/progress/body/goal`, { data: { targetG: 76000 } });
};
const tips = async (p) => { const ok = p.getByRole("button", { name: "Entendido" }); while (await ok.first().isVisible().catch(() => false)) { await ok.first().click(); await p.waitForTimeout(300); } };

const S = {
  // El socio: inicio → check-in → la serie de Press de banca (indicado / REPI recomienda / anterior / real), la explicación,
  // la serie difícil (5 de 8), el ajuste de la próxima y el descanso → progreso por ejercicio.
  member: () => session("member", async (p, h) => {
    await h.seg("m-home", async () => { await h.wait(2200); h.mark("baja"); await h.glideBy(260, 900, 1800); });
    await h.top(); await h.nav("Entrenar");
    await h.seg("m-start", async () => {
      await h.wait(900); await h.tap(p.getByRole("button", { name: /Comenzar entrenamiento/ }), 2600, "comenzar");
    });
    const sk = p.getByRole("button", { name: "Saltar" }); if (await sk.isVisible().catch(() => false)) { await sk.click(); await h.wait(1800); }
    await tips(p);
    await h.jumpTo(/Press de banca/, 70);
    await h.seg("m-serie", async () => {
      await h.wait(3200);
      await h.tap(p.getByRole("button", { name: "¿Por qué?" }), 700, "porque");
      // La explicación puede quedar debajo del panel fijo de carga: se baja lo justo para leerla.
      const nb = await p.locator("p.sg-note[role=note]").last().evaluate((n) => { const r = n.getBoundingClientRect(); const pts = [...document.elementsFromPoint(r.left + 20, r.bottom - 4)]; return { bottom: r.bottom, top: r.top, covered: !pts.includes(n), text: n.textContent }; }).catch(() => null);
      console.log("  explicación:", JSON.stringify(nb));
      if (nb && nb.covered) { h.mark("lee"); await h.glideBy(nb.bottom - 520, 600); }
      await h.wait(2800);
      const ok = p.getByRole("button", { name: "Entendido" }); if (await ok.first().isVisible().catch(() => false)) { await ok.first().click(); await h.wait(400); }
      for (let i = 0; i < 3; i++) await h.tap(p.getByRole("button", { name: "Menos repeticiones" }), 300, `menos${i + 1}`);
      await h.wait(1300);
      await h.tap(p.getByRole("button", { name: /Completar serie 1/ }), 6500, "completar");
    });
    const skip = p.getByRole("button", { name: "Saltar descanso" }); if (await skip.isVisible().catch(() => false)) { await skip.click(); await h.wait(600); }
    const back = p.getByRole("button", { name: "Volver" }); if (await back.first().isVisible().catch(() => false)) { await back.first().click(); await h.wait(900); }
    const out = p.getByRole("button", { name: /Salir un momento/ }); if (await out.isVisible().catch(() => false)) { await out.click(); await h.wait(1400); }
    await h.nav("Progreso");
    const pt = p.locator("[data-pt]").last(); if (await pt.isVisible().catch(() => false)) await pt.click();
    await h.top();
    await h.seg("m-progreso", async () => { await h.wait(1500); h.mark("baja"); await h.glideTo(/Evolución por ejercicio/, 30, 1000, 3200); });
  }, { extra: weights }),
  // El coach: la ficha de Valentina (sesiones y «vs. la vez anterior»), el programa «Hipertrofia · 3 días» y su asignación.
  coach: () => session("coach", async (p, h) => {
    await h.nav("Clientes");
    await h.seg("c-clientes", async () => {
      await h.wait(1600); await h.tap(p.getByText("Valentina Gómez").locator("visible=true"), 2400, "ficha");
      h.mark("sesiones"); await h.glideTo(/^Registro de sesiones$/, 80, 900, 900);
      h.mark("vs"); await h.glideTo(/vs\. la vez anterior/, 200, 900, 2600);
    });
    await h.nav("Programas");
    await h.seg("c-programa", async () => {
      await h.wait(1500); await h.tap(p.getByText("6 sem · 3 días").locator("visible=true"), 2200, "abre");
      h.mark("torso"); await h.glideTo(/^Torso A$/, 120, 900, 900);
      h.mark("baja"); await h.glideBy(420, 1000, 1800);
    });
    await h.top();
    await h.seg("c-asigna", async () => {
      await h.wait(900); await h.tap(p.getByRole("button", { name: "Asignar a clientes" }), 1400, "abre");
      await h.tap(p.getByText("Valentina Gómez").locator("visible=true"), 750, "valentina");
      await h.tap(p.getByText("Julián Ortiz").locator("visible=true"), 1100, "julian");
      await h.tap(p.getByRole("button", { name: /^Asignar a 2 clientes/ }), 3400, "asigna");
    });
  }),
  // El entrenador de sala: «En sala ahora» con el pedido de Julián → «Voy»; y la vista Sala.
  floor: () => session("floor", async (p, h) => {
    await h.nav("Mi turno"); await h.top();
    await h.seg("f-turno", async () => {
      await h.wait(2600); const voy = p.getByRole("button", { name: "Voy" }); if (await voy.isVisible().catch(() => false)) await h.tap(voy, 3600, "voy");
    });
    await h.nav("Sala"); await h.top();
    await h.seg("f-sala", async () => { await h.wait(2000); h.mark("baja"); await h.glideBy(430, 1000, 1800); });
  }),
  // La gestión del gimnasio: Seguimiento de sala (pedidos y gráficos por semana), «En sala ahora» del Ejecutivo,
  // Acceso y presencia, y una solicitud de acceso aprobada por una persona.
  owner: () => session("owner", async (p, h) => {
    await h.go("connect");
    await h.seg("o-sala", async () => { await h.wait(2400); h.mark("baja"); await h.glideTo(/^Pedidos por semana$/, 150, 1300, 3000); });
    await h.go("exec");
    const hide = p.getByRole("button", { name: "Ocultar" }); if (await hide.isVisible().catch(() => false)) { await hide.click(); await h.wait(700); }
    // La tarjeta está al final de la página: se agrega aire abajo (sólo espacio en blanco) para poder llevarla arriba.
    await p.evaluate(() => { document.body.style.paddingBottom = "520px"; });
    await h.jumpTo(/^En sala ahora$/, 360);
    await h.seg("o-exec", async () => { await h.wait(1000); await h.glideTo(/^En sala ahora$/, 120, 800, 3600); });
    await h.go("presence");
    await h.seg("o-presencia", async () => { await h.wait(2200); h.mark("baja"); await h.glideTo(/^Por sede$/, 420, 1000, 2400); });
    await h.go("joins");
    await h.seg("o-altas", async () => {
      await h.wait(2200); await h.tap(p.getByRole("button", { name: "Aprobar" }), 1500, "aprobar");
      await h.tap(p.getByText("Lo conozco: es socio/a"), 1200, "conozco");
      await h.tap(p.getByRole("button", { name: "Confirmar acceso" }), 3600, "confirmar");
    });
  }),
  // ── Segunda tanda (films de perfiles y funciones) ──────────────────────────────────────────────────────────────────────
  // La socia pide ayuda al equipo de sala; la profesora de sala de la misma demo ve ese pedido y lo toma; la socia ve el
  // estado. Después: progreso por ejercicio (Press de banca), Mi cuerpo y el check-in de antes de entrenar.
  member2: () => session("member", async (p, h) => {
    await h.jumpTo(/^Pedir ayuda$/, 560);
    await h.seg("m-ayuda", async () => {
      await h.wait(1200); await h.tap(p.getByRole("button", { name: /^Pedir ayuda/ }), 1300, "abre");
      const d = p.getByRole("dialog");
      await h.tap(d.getByRole("button", { name: /Equipo de sala/ }), 600, "sala");
      await h.tap(d.getByRole("button", { name: "Ayuda con un ejercicio" }), 700, "motivo");
      h.mark("escribe"); await d.locator("textarea").pressSequentially("¿Me miran la técnica?", { delay: 55 }); await h.wait(700);
      await h.tap(d.getByRole("button", { name: "Enviar pedido" }), 3600, "envia");
    });
    const s = await sameDemo(h, "Sofía Ramírez", (org) => `/gym/${org}?s=shift`);
    try {
      const later = s.p.getByRole("button", { name: "Más tarde" }); if (await later.isVisible().catch(() => false)) { await later.click(); await s.h.wait(600); }
      await s.h.nav("Sala");
      await s.p.getByRole("tab", { name: /Pendientes/ }).or(s.p.getByRole("button", { name: /^Pendientes/ })).first().click(); await s.h.wait(1200);
      await s.h.jumpTo(/Me miran la técnica/, 300);
      await s.h.seg("s-sala", async () => {
        await s.h.wait(2000);
        const card = s.p.locator("div").filter({ hasText: "¿Me miran la técnica?" }).filter({ has: s.p.getByRole("button", { name: "Tomar" }) }).last();
        await s.h.tap(card.getByRole("button", { name: "Tomar" }), 3000, "tomar");
      });
      await s.h.top(); await s.p.getByRole("tab", { name: /Para vos/ }).or(s.p.getByRole("button", { name: /^Para vos/ })).first().click(); await s.h.wait(1200);
      await s.h.jumpTo(/Me miran la técnica/, 300);
      await s.h.seg("s-mio", async () => { await s.h.wait(2600); });
    } finally { await s.close(); }
    await p.reload(); await p.waitForLoadState("networkidle").catch(() => {}); await h.wait(900);
    await h.jumpTo(/^Tu pedido/, 330);
    await h.seg("m-pedido", async () => { await h.wait(1800); await h.tap(p.getByText(/^Tu pedido/), 3200, "ver"); });
    const x = p.getByRole("dialog").getByRole("button", { name: /Cerrar|Cancelar|Listo/ }); if (await x.first().isVisible().catch(() => false)) await x.first().click(); else await p.keyboard.press("Escape");
    await h.wait(500);
    await h.nav("Progreso");
    await p.getByRole("button", { name: "Cambiar ejercicio" }).click(); await h.wait(500);
    await p.getByRole("button", { name: /Press de banca/ }).or(p.getByRole("option", { name: /Press de banca/ })).first().click(); await h.wait(1500);
    await h.top();
    await h.seg("m-prog2", async () => {
      await h.wait(1700); h.mark("marcas"); await h.glideTo(/^Tus mejores marcas del período$/, 150, 900, 1500);
      h.mark("evol"); await h.glideTo(/^Evolución por ejercicio$/, 60, 1000, 3200);
      h.mark("graf"); await h.glideBy(420, 1000, 2400);
    });
    await h.top(); await p.getByRole("tab", { name: /Mi cuerpo/ }).click(); await h.wait(1500);
    await h.jumpTo(/^Objetivo$/, 130);
    await h.seg("m-cuerpo", async () => { await h.wait(2800); h.mark("graf"); await h.glideBy(330, 900, 2600); });
    await h.top(); await h.nav("Entrenar"); await h.top();
    await h.seg("m-checkin", async () => {
      await h.wait(1000); await h.tap(p.getByRole("button", { name: /Comenzar entrenamiento/ }), 1500, "comenzar");
      const d = p.getByRole("dialog");
      await h.tap(d.getByRole("button", { name: "4", exact: true }).nth(0), 480, "energia");
      await h.tap(d.getByRole("button", { name: "3", exact: true }).nth(1), 480, "sueno");
      await h.tap(d.getByRole("button", { name: "4", exact: true }).nth(2), 800, "animo");
      await h.tap(d.getByRole("button", { name: "Empezar entrenamiento" }), 2600, "empezar");
    });
  }, { extra: weights }),
  // El gimnasio muestra el QR de la sede desde «Solicitudes de acceso» y aprueba la solicitud pendiente; después, lo que abre
  // ese QR en el teléfono del socio (página pública, sin sesión).
  owner2: async () => {
    let slug = null;
    await session("owner", async (p, h) => {
      p.on("response", async (r) => { if (/join-qr/.test(r.url())) { try { slug = (await r.json()).qrs[0].slug; } catch {} } });
      await h.go("joins");
      await h.seg("o-qr", async () => { await h.wait(1800); await h.tap(p.getByRole("button", { name: "Mostrar QR de la sede" }), 3600, "qr"); });
      // La aprobación, en la misma demo que el QR (mismo código de solicitud y mismas horas que en el plano anterior).
      await p.getByRole("button", { name: "Cerrar" }).first().click(); await h.wait(900); await h.top();
      await h.seg("o-alta2", async () => {
        await h.wait(2200); await h.tap(p.getByRole("button", { name: "Aprobar" }), 1500, "aprobar");
        await h.tap(p.getByText("Lo conozco: es socio/a"), 1200, "conozco");
        await h.tap(p.getByRole("button", { name: "Confirmar acceso" }), 3600, "confirmar");
      });
    });
    if (!slug) { console.log("FAIL owner2: sin enlace de la sede"); return; }
    await session("join", async (p, h) => {
      await h.seg("j-unirse", async () => { await h.wait(3200); await h.tap(p.getByRole("button", { name: "Crear mi cuenta" }), 2200, "crear"); });
    }, { anon: async () => `/unirse/${slug}` });
  },
};
for (const [k, f] of Object.entries(S)) { if (only && !only.split(",").includes(k)) continue; await f(); }
await b.close();
