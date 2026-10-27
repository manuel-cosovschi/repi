import { escalatePending } from "@/server/join/services";
import { processOutbox } from "@/server/push/services";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { purgeSandboxes } from "@/server/sandbox/services";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:notifications: vence/escala solicitudes y reintenta la cola push; además borra demos vencidas. Cada minuto.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  try {
    const e = await escalatePending();
    const p = await processOutbox();
    const demos = await purgeSandboxes(); // demos vencidas (D85): consulta indexada, casi siempre vacía
    return Response.json({ escalated: e.escalated, processed: p.processed, sent: "sent" in p ? p.sent : 0, demos });
  } catch (err) { logError("cron.notifications", err, req); return Response.json({ error: "job falló" }, { status: 500 }); }
}
