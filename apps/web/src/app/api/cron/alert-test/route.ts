import { cronAuthorized } from "@/server/cron";
import { alertError } from "@/server/alerts";

export const dynamic = "force-dynamic";

// Operación (D149): manda una alerta de prueba a ALERT_EMAIL por el mismo camino que las reales (con su límite por hora).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  const sent = await alertError({ scope: "prueba.alertas", where: "GET /api/cron/alert-test", name: "AlertaDePrueba", msg: "Esto es una prueba: las alertas de errores de REPI llegan a esta casilla.", pg: null });
  return Response.json({ sent, configured: !!process.env.ALERT_EMAIL });
}
