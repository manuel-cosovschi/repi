import puppeteer from "puppeteer-core";
const CH = process.env.HOME + "/.cache/hyperframes/chrome/chrome-headless-shell/mac_arm-152.0.7977.30/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = process.argv[2], B = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: CH });
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const AND = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const IG = AND + " Instagram 350.0";
async function page(ua) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setUserAgent(ua); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return p;
}
const txt = (p) => p.$eval("main", (m) => m.innerText.replace(/\s+/g, " ").slice(0, 260));
const click = async (p, label) => { const ok = await p.evaluate((l) => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim().startsWith(l)); b?.click(); return !!b; }, label); if (!ok) throw new Error("sin botón " + label); await new Promise((r) => setTimeout(r, 400)); };
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

// iPhone: QR de sede sin sesión → guía → pasos → continuidad → navegador
let p = await page(IOS);
await p.goto(B + "/unirse/demo-palermo", { waitUntil: "networkidle0" });
console.log("ios0:", await txt(p)); await shot(p, "ios-0");
await click(p, "Ver cómo hacerlo"); console.log("ios1:", await txt(p)); await shot(p, "ios-1");
await click(p, "Siguiente"); console.log("ios2:", await txt(p)); await shot(p, "ios-2");
console.log("sin salida al navegador:", !(await p.$$eval("button", (bs) => bs.some((b) => /navegador/i.test(b.innerText)))));
await click(p, "Ya lo agregué"); console.log("ios3:", await txt(p)); await shot(p, "ios-3");
console.log("entry:", await p.evaluate(() => localStorage.getItem("repi:entry")), "guide:", await p.evaluate(() => localStorage.getItem("repi:guide")));
await p.goto(B + "/unirse/demo-palermo", { waitUntil: "networkidle0" });
console.log("ios-again (no guía):", (await txt(p)).slice(0, 80));
// Abrir desde el ícono en el mismo almacenamiento: / → acceso con «Retomá tu alta»
await p.goto(B + "/?source=pwa", { waitUntil: "networkidle0" });
console.log("ios-home:", p.url(), (await txt(p)).slice(0, 160)); await shot(p, "ios-home");

// App agregada a inicio sin almacenamiento compartido: recuperar por código
p = await page(IOS);
await p.emulateMediaFeatures([{ name: "display-mode", value: "standalone" }]).catch(() => {});
await p.goto(B + "/?source=pwa", { waitUntil: "networkidle0" });
await click(p, "¿Venís de un QR");
console.log("recover:", (await txt(p)).slice(0, 140)); await shot(p, "recover");
await p.type("#f-rec", "https://evil.example/unirse/demo-palermo"); await click(p, "Continuar");
console.log("recover-bad:", await p.$eval("[role=alert]", (e) => e.textContent).catch(() => "sin error"));
await p.$eval("#f-rec", (e) => { e.value = ""; }); await p.click("#f-rec", { clickCount: 3 }); await p.keyboard.press("Backspace");
await p.type("#f-rec", "demo-palermo"); await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), click(p, "Continuar")]);
console.log("recover-ok:", p.url());

// Android sin evento de instalación → pasos manuales; con navegador interno → copiar enlace
p = await page(AND);
await p.goto(B + "/acceso?code=R7K2QX", { waitUntil: "networkidle0" });
await click(p, "Ver cómo hacerlo"); console.log("and1:", (await txt(p)).slice(0, 200)); await shot(p, "and-1");
await click(p, "Siguiente"); console.log("and2:", (await txt(p)).slice(0, 200));
p = await page(IG);
await p.goto(B + "/unirse/demo-palermo", { waitUntil: "networkidle0" });
console.log("inapp:", (await txt(p)).slice(0, 240)); await shot(p, "inapp");
// Escritorio: sin guía
p = await page("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36");
await p.setViewport({ width: 1280, height: 800 });
await p.goto(B + "/unirse/demo-palermo", { waitUntil: "networkidle0" });
console.log("desk:", (await txt(p)).slice(0, 80));
await p.goto(B + "/instalar", { waitUntil: "networkidle0" }); await click(p, "Ver cómo hacerlo"); console.log("desk-help:", (await txt(p)).slice(0, 160)); await shot(p, "desk-help");
const mf = await (await fetch(B + "/manifest.webmanifest")).json(); console.log("manifest:", mf.id, mf.start_url);
await browser.close();
