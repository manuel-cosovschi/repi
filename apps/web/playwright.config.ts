import { defineConfig, devices } from "@playwright/test";

// E2E con el navegador real contra la build de producción local (`pnpm build && pnpm start`) y la base de desarrollo
// `repi_dev`. Cada prueba usa la demo guiada, que crea su propio entorno ficticio (is_demo, se borra a las 6 h): nunca
// toca datos reales ni producción. Usa el Chrome instalado (channel "chrome"), sin descargar navegadores.
// Uso (desde apps/web, con el servidor arriba): pnpm e2e
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "e2e-results/results.json" }]],
  outputDir: "e2e-results/artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "desktop", use: { viewport: { width: 1366, height: 860 } } },
  ],
});
