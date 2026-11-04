// D193 · Verificación autorizada en producción: el alumno ve «Tu profe indicó X kg» con un profe y un alumno REALMENTE
// vinculados. La demo guiada no alcanza: cada perfil abre otra demo y no se puede entrar como el profe y su alumno a la vez.
//
// Requiere DOS CUENTAS DE PRUEBA AUTORIZADAS por el titular (no cuentas de clientes reales): un coach y un alumno ya
// vinculados (invitación aceptada), sin 2FA, y el alumno SIN un entrenamiento abierto. No toca a nadie más.
//
// Qué hace:
//   1. Como el coach: crea la plantilla «Verificación D193 (prueba)» (Sentadilla hack: 80 × 12, 90 × 10, 100 × 8) y se la
//      asigna al alumno de prueba. Esto reemplaza el programa activo DE ESA CUENTA DE PRUEBA.
//   2. Como el alumno: abre el entrenamiento en un Chromium con emulación de teléfono y comprueba la tarjeta
//      «Tu profe indicó 80 kg × 12», las tres series precargadas (80/90/100) y la API (objetivo con origen «coach»).
//   3. Limpieza: termina el entrenamiento sin series (queda abandonado, sin resultados) y elimina la plantilla de la lista.
//
// Uso (desde apps/web; las claves sólo por variables de entorno, nunca se imprimen):
//   REPI_BASE=https://repiclub.com COACH_EMAIL=… COACH_PASSWORD=… COACH_ORG_ID=… STUDENT_EMAIL=… STUDENT_PASSWORD=… \
//   [STUDENT_RELATION_ID=…] node scripts/operations/verify-coach-weights-prod.mjs
import { chromium, devices } from "playwright";

const BASE = process.env.REPI_BASE ?? "https://repiclub.com";
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Falta ${k}.`); process.exit(2); } return v; };
const C = { email: need("COACH_EMAIL"), password: need("COACH_PASSWORD"), org: need("COACH_ORG_ID") };
const A = { email: need("STUDENT_EMAIL"), password: need("STUDENT_PASSWORD") };
const ok = (m) => console.log(`✓ ${m}`);
const fail = (m) => { console.error(`✗ ${m}`); process.exitCode = 1; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
async function signedIn(who, device) {
  const ctx = await browser.newContext({ ...(device ? devices[device] : {}), baseURL: BASE, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  const r = await ctx.request.post("/api/auth/sign-in/email", { data: { email: who.email, password: who.password }, headers: { origin: BASE } });
  if (r.status() !== 200) throw new Error(`No se pudo iniciar sesión (${r.status()}).`);
  return ctx;
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
let tplId = null, sid = null, coach = null, student = null;
try {
  coach = await signedIn(C);
  const ov = await (await coach.request.get(`/api/coach/${C.org}/overview`)).json();
  const clients = (ov.clients ?? []).filter((c) => c.status === "active" || c.status == null);
  const rel = process.env.STUDENT_RELATION_ID ?? (clients.length === 1 ? clients[0].id : null);
  if (!rel) throw new Error("Indicá STUDENT_RELATION_ID: el coach de prueba tiene más de un alumno.");
  student = await signedIn(A, "Pixel 7");
  const t0 = await (await student.request.get("/api/me/training")).json();
  if (t0.openSession) throw new Error("El alumno de prueba tiene un entrenamiento abierto: no se toca. Terminalo y volvé a correr.");
  const lib = await (await coach.request.get(`/api/coach/${C.org}/library`)).json();
  const hack = (lib.exercises ?? lib).find((e) => /sentadilla hack/i.test(e.name)) ?? (lib.exercises ?? lib).find((e) => e.kind === "load_reps");
  const S = (reps, weightKg) => ({ kind: "work", reps, weightKg, pct1rm: null, rir: 1, rpe: null, restSec: 120, note: null });
  const doc = { name: "Verificación D193 (prueba)", weeks: 1, note: "Prueba autorizada del hotfix D193.", days: [{ name: "Prueba", exercises: [
    { exerciseId: hack.id, name: hack.name, sets: 3, reps: "8-12", rir: 1, restSec: 120, note: null, detail: { technique: "custom", setPlan: [S("12", 80), S("10", 90), S("8", 100)] } }] }] };
  const created = await coach.request.post(`/api/coach/${C.org}/programs`, { data: { doc } });
  if (created.status() !== 200) throw new Error(`No se creó la plantilla (${created.status()}).`);
  tplId = (await created.json()).id;
  const asg = await coach.request.post(`/api/coach/${C.org}/programs/${tplId}/assign`, { data: { coachClientIds: [rel], startsOn: today } });
  if (asg.status() !== 200) throw new Error(`No se asignó (${asg.status()}).`);
  ok(`plantilla creada y asignada (${hack.name}: 80/90/100 kg)`);

  const page = await student.newPage();
  await page.goto("/app");
  await page.getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento|^Continuar / }).first().click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  const card = page.getByRole("region", { name: /^Objetivo de serie 1$/ });
  await card.waitFor({ timeout: 20000 });
  const txt = (await card.innerText()).replace(/\s+/g, " ");
  /TU PROFE INDICÓ|Tu profe indicó/i.test(txt) ? ok("tarjeta: «Tu profe indicó»") : fail(`tarjeta sin «Tu profe indicó»: ${txt.slice(0, 160)}`);
  /80 kg × 12/.test(txt) ? ok("tarjeta: 80 kg × 12") : fail(`tarjeta sin 80 kg × 12: ${txt.slice(0, 160)}`);
  const rows = page.getByRole("list", { name: "Series" }).getByRole("listitem");
  for (const [i, w] of [[0, 80], [1, 90], [2, 100]]) {
    const name = await rows.nth(i).getAttribute("aria-label");
    new RegExp(`: ${w} kg`).test(name ?? "") ? ok(`serie ${i + 1}: ${w} kg precargados`) : fail(`serie ${i + 1}: ${name}`);
  }
  await page.screenshot({ path: "verify-coach-weights-prod.png" });
  sid = (await (await student.request.get("/api/me/training")).json()).openSession;
  const s = await (await student.request.get(`/api/me/sessions/${sid}`)).json();
  const tg = s.exercises[0].targets.filter((t) => t.source === "coach").map((t) => t.weightKg);
  JSON.stringify(tg) === "[80,90,100]" ? ok("API: objetivos con origen «coach» 80/90/100") : fail(`API: ${JSON.stringify(tg)}`);
} catch (e) {
  fail(e.message);
} finally {
  // Limpieza: sin series registradas, terminar deja el entrenamiento abandonado (sin resultados); la plantilla sale de la lista.
  if (student && sid) await student.request.post(`/api/me/sessions/${sid}/action`, { data: { action: "finish" } }).catch(() => {});
  if (coach && tplId) await coach.request.delete(`/api/coach/${C.org}/programs/${tplId}`).catch(() => {});
  await browser.close();
}
