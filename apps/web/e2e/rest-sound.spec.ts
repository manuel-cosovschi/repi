// 13/11/2026 · Alerta sonora del descanso: opcional (apagada de entrada), se enciende desde el temporizador o desde Perfil,
// suena en los últimos segundos y sigue hasta «Arrancar serie». El navegador de la prueba no tiene parlante: se cuentan los
// osciladores que la página programa (Web Audio) y se mira la pantalla. La lógica de tiempos tiene pruebas con reloj falso en
// packages/domain/src/rest-alarm.test.ts y tests/rest-sound.test.ts. Demo guiada (datos ficticios), servidor local.
import { expect, test, type Page } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));
test.use({ viewport: { width: 390, height: 844 } });

/** Anota los tonos que la página programa (Web Audio): cuándo terminan y si se cortaron antes. */
async function spyAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: { ctx: AudioContext; until: number; cut: boolean }[] };
    w.__tones = [];
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      const osc = make.call(this);
      const rec = { ctx: this, until: Infinity, cut: false };
      w.__tones.push(rec);
      const stop = osc.stop.bind(osc);
      osc.stop = (t?: number) => { if (t === undefined) rec.cut = true; else rec.until = t; stop(t); };
      return osc;
    };
  });
}
/** `all`: tonos programados desde que abrió la página · `pending`: los que todavía van a sonar. */
const tones = (page: Page) => page.evaluate(() => {
  const t = (window as unknown as { __tones: { ctx: AudioContext; until: number; cut: boolean }[] }).__tones;
  return { all: t.length, pending: t.filter((x) => !x.cut && x.until > x.ctx.currentTime).length };
});

async function startAndCompleteSet(page: Page) {
  await page.getByRole("button", { name: "Comenzar entrenamiento" }).click();
  const skip = page.getByRole("dialog", { name: "¿Cómo llegás hoy?" }).getByRole("button", { name: "Saltar" });
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click();
  await page.getByRole("button", { name: /^Completar serie 1$/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
}

test("apagada de entrada: el descanso termina sin programar ningún sonido", async ({ page }) => {
  const errors = watchErrors(page);
  await spyAudio(page);
  await page.clock.install();
  await openDemo(page, "member");
  await startAndCompleteSet(page);
  const sound = page.getByRole("switch", { name: /Sonido en los últimos 10 segundos/ });
  await expect(sound).toHaveAttribute("aria-checked", "false");
  await expect(sound).toContainText("No");
  for (const b of await page.getByRole("group", { name: "Avisos al terminar el descanso" }).getByRole("switch").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.clock.fastForward("05:00");
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.locator(".rest-ring")).toHaveCount(0);
  expect((await tones(page)).all).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("repi:rest-sound"))).toBeNull();
  expect(errors).toEqual([]);
});

test("encendida desde el temporizador: suena al final y sigue hasta «Arrancar serie»; Perfil muestra y cambia lo mismo", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await spyAudio(page);
  await page.clock.install();
  await openDemo(page, "member");
  await startAndCompleteSet(page);
  const sound = page.getByRole("switch", { name: /Sonido en los últimos 10 segundos/ });
  await sound.click();
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await expect(sound).toContainText("Sí");
  await expect(page.getByText(/Con el teléfono en silencio no suena/).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("repi:rest-sound"))).toBe("1");
  // La muestra más la cuenta regresiva y la señal de fin del descanso en curso.
  await expect.poll(async () => (await tones(page)).pending).toBeGreaterThan(20);

  // El descanso llega a cero: la alerta queda sonando con su aviso hasta que la persona responde.
  await page.clock.fastForward("05:00");
  await page.clock.runFor(1_000);
  const ring = page.locator(".rest-ring");
  await expect(ring).toBeVisible();
  await expect(ring).toContainText("Descanso terminado");
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.clock.runFor(8_000);
  await expect(ring).toBeVisible(); // no se apaga sola a los pocos segundos
  const stop = ring.getByRole("button", { name: /Arrancar la serie/ });
  expect((await stop.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await stop.click();
  await expect(ring).toHaveCount(0);
  // Los tonos de la alerta quedaban programados para varios minutos: cortados, en un par de segundos no queda ninguno por sonar
  // (la muestra del encendido dura poco más de un segundo y termina sola).
  await expect.poll(async () => (await tones(page)).pending, { timeout: 5_000 }).toBe(0);

  // La serie siguiente vuelve a programar el sonido; saltar el descanso lo corta sin dejar el aviso.
  await page.getByRole("button", { name: /^Completar serie 2$/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect.poll(async () => (await tones(page)).pending).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Saltar descanso" }).click();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(ring).toHaveCount(0);
  await expect.poll(async () => (await tones(page)).pending, { timeout: 5_000 }).toBe(0);

  // Perfil → Configuración: el mismo interruptor, encendido; apagarlo ahí lo apaga en el dispositivo.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  const leave = page.getByRole("button", { name: /Salir un momento/ }); // «¿Seguís entrenando?» (D160), si lo pregunta
  if (await leave.isVisible({ timeout: 3_000 }).catch(() => false)) await leave.click();
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Inicio/ }).click(); // según cómo se salió, queda en Inicio o en Entrenar
  await page.getByRole("button", { name: "Perfil" }).click();
  const row = page.getByRole("switch", { name: /Sonido al terminar el descanso/ });
  await row.scrollIntoViewIfNeeded();
  await expect(row).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Probar el sonido" })).toBeVisible();
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("repi:rest-sound"))).toBeNull();
  expect(errors).toEqual([]);
});
