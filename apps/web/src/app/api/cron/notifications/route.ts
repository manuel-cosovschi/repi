import { escalatePending } from "@/server/join/services";
import { processOutbox } from "@/server/push/services";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { purgeSandboxes } from "@/server/sandbox/services";
import { trialNotices } from "@/server/commercial/notices";
import { connectSweep } from "@/server/gym/connect";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:notifications: vence/escala solicitudes y reintenta la cola push; además borra demos vencidas y
// avisa fin de prueba a clientes (F-BL-05). Cada minuto.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  try {
    const e = await escalatePending();
    const demos = await purgeSandboxes(); // demos vencidas (D85): consulta indexada, casi siempre vacía
    const trial = await trialNotices(); // F-BL-05: fin de prueba; idempotente por contrato y fecha
    const connect = await connectSweep(); // D126: pedidos esperando y seguimientos por vencer; deduplicado
    const p = await processOutbox();
    return Response.json({ escalated: e.escalated, processed: p.processed, sent: "sent" in p ? p.sent : 0, demos, trialNotices: trial.created, connect });
  } catch (err) { logError("cron.notifications", err, req); return Response.json({ error: "job falló" }, { status: 500 }); }
}
