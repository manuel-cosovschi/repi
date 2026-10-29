// Registro de errores del servidor (N-O10). Va a los logs del hosting (Vercel). Nunca cuerpos, parámetros de consultas,
// tokens ni contenido de salud/chat: los errores de Drizzle traen la consulta con sus valores y se recortan antes.
export function logError(scope: string, e: unknown, req?: Request) {
  logErrorAt(scope, e, req ? `${req.method} ${new URL(req.url).pathname}` : "");
}
/** SEC-11 (QA 29/10): rutas que llevan un secreto en el camino (activación, tutor, ingreso por QR) se registran sin él. */
export const maskPath = (path: string) => path.replace(/^(\/api\/(?:activate|access\/tutor|join|access\/invitations)\/)[^/]+/, "$1…");
/** Igual que logError cuando no hay un Request a mano (errores que captura Next en instrumentation.ts). */
export function logErrorAt(scope: string, e: unknown, where: string) {
  const err = e instanceof Error ? e : new Error(String(e));
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  const msg = err.message.split(/\nparams:/)[0].replace(/^Failed query: (\w+)[\s\S]*$/, "Failed query: $1").slice(0, 200);
  const summary = { scope, where: where.replace(/\/api\/\S*/, (p) => maskPath(p)), name: err.name, msg, pg: cause?.code ?? null };
  console.error(JSON.stringify({ level: "error", ...summary }));
  notify(summary);
}

/** D149: aviso por email al titular (si ALERT_EMAIL está cargada). Después de responder cuando se puede; nunca frena ni rompe. */
function notify(summary: { scope: string; where: string; name: string; msg: string; pg: string | null }) {
  if (!process.env.ALERT_EMAIL) return;
  const run = () => import("./alerts").then((m) => m.alertError(summary)).catch(() => {});
  import("next/server").then(({ after }) => { try { after(run); } catch { void run(); } }).catch(() => void run());
}
