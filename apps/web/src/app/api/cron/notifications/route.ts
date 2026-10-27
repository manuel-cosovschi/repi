import { escalatePending } from "@/server/join/services";
import { processOutbox } from "@/server/push/services";
import { cronAuthorized } from "@/server/cron";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:notifications: vence/escala solicitudes y reintenta la cola push. Programar cada minuto.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  const e = await escalatePending();
  const p = await processOutbox();
  return Response.json({ escalated: e.escalated, processed: p.processed, sent: "sent" in p ? p.sent : 0 });
}
