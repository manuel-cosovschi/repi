// Alertas de errores por email (D149, LB-06). Gratis, por el mismo Resend de REPI, a ALERT_EMAIL (variable de Vercel; nunca
// en el repositorio). Sin datos personales: el mismo resumen recortado que ya va a los logs (alcance, ruta, tipo, mensaje).
// Una alerta por hora por cada error igual y como máximo 20 por hora en total: un error repetido no llena la casilla.
// Un fallo al avisar nunca rompe la respuesta ni dispara otra alerta.
import { createHash } from "node:crypto";
import { providerConfigured, sendViaProvider } from "./mailer";
import { rateLimit } from "./access/util";
import { appVersion } from "./version";

export type ErrorSummary = { scope: string; where: string; name: string; msg: string; pg: string | null };
const HOUR = 3_600_000;

export async function alertError(e: ErrorSummary, now = new Date()) {
  const to = process.env.ALERT_EMAIL;
  if (!to || !providerConfigured()) return false;
  const key = createHash("sha256").update(`${e.scope}|${e.name}|${e.msg.slice(0, 80)}`).digest("hex").slice(0, 16);
  try { await rateLimit(`alert:${key}`, 1, HOUR); await rateLimit("alert:all", 20, HOUR); } catch { return false; }
  const when = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(now);
  try {
    await sendViaProvider({ to, subject: `Error en REPI: ${e.scope}`.slice(0, 120), body: [
      `Algo falló en ${process.env.NEXT_PUBLIC_APP_URL ?? "REPI"}.`,
      "",
      `Dónde: ${e.where || "tarea en segundo plano"}`,
      `Tipo: ${e.name}${e.pg ? ` (código ${e.pg})` : ""}`,
      `Detalle: ${e.msg || "sin mensaje"}`,
      `Versión: ${appVersion()} · ${when}`,
      "",
      "Si se repite, no llega otro aviso de este mismo error durante una hora. El historial completo está en los registros de Vercel:",
      "https://vercel.com/manuel-cosovschis-projects/repi/logs",
    ].join("\n") });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "alerts.send", name: err instanceof Error ? err.name : "Error" }));
    return false;
  }
}
