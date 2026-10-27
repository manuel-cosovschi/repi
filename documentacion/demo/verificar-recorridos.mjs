import puppeteer from "puppeteer-core";
const CH = process.env.HOME + "/.cache/hyperframes/chrome/chrome-headless-shell/mac_arm-152.0.7977.30/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = process.argv[2], B = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: CH });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const labels = { owner: "Dueño", floor: "Entrenador de sala", member: "Alumno", coach: "Personal trainer" };
for (const role of ["owner", "floor", "member", "coach"]) {
  const p = await (await browser.createBrowserContext()).newPage();
  if (role === "member") await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  else await p.setViewport({ width: 1366, height: 860 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(B + "/demo", { waitUntil: "networkidle0" });
  const t0 = Date.now();
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }), p.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.innerText.includes(l)).click(), labels[role])]);
  console.log(`\n== ${role}: entra a ${new URL(p.url()).pathname} en ${Date.now() - t0} ms`);
  await wait(1500);
  for (let i = 0; i < 9; i++) {
    const info = await p.evaluate(() => { const c = document.querySelector(".dt-card"); if (!c) return null; return { n: c.querySelector(".dt-n")?.textContent, t: c.querySelector("h2")?.textContent, ring: !!document.querySelector(".dt-ring"), cur: document.querySelector('[aria-current="page"]')?.textContent?.trim().slice(0, 30) }; });
    if (!info) { console.log("sin tarjeta"); break; }
    console.log(`${info.n} · ${info.t} · anillo:${info.ring} · pantalla:${info.cur}`);
    await p.screenshot({ path: `${OUT}/${role}-${i}.png` });
    const more = await p.evaluate(() => { const b = [...document.querySelectorAll(".dt-card button.dt-pri")][0]; if (!b) return false; b.click(); return true; });
    if (!more) break;
    await wait(1400);
  }
  if (errs.length) console.log("errores:", errs.slice(0, 3));
}
await browser.close();
