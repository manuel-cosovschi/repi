import { escalatePending } from "@/server/join/services";
import { processOutbox } from "@/server/push/services";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { purgeSandboxes } from "@/server/sandbox/services";
import { trialNotices } from "@/server/commercial/notices";
import { connectSweep } from "@/server/gym/connect";
import { closeShiftsAfterHours } from "@/server/gym/services";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:notifications: vence/escala solicitudes y reintenta la cola push; además borra demos vencidas y
// avisa fin de prueba a clientes (F-BL-05). Cada minuto.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  // Auditoría 30/10: cada tarea por separado. Antes un error en una (por ejemplo, borrar una demo) cortaba todas las demás:
  // sin push, sin cierre de turnos a las 22 y sin avisos de fin de prueba mientras durara.
  const failed: string[] = [];
  const step = async <T>(name: string, run: () => Promise<T>, fallback: T) => {
    try { return await run(); } catch (err) { logError(`cron.notifications.${name}`, err, req); failed.push(name); return fallback; }
  };
  const e = await step("escalate", escalatePending, { escalated: 0 });
  const demos = await step("demos", () => purgeSandboxes(), 0); // demos vencidas (D85): consulta indexada, casi siempre vacía
  const trial = await step("trial", () => trialNotices(), { created: 0 }); // F-BL-05: fin de prueba; idempotente por contrato y fecha
  const connect = await step("connect", () => connectSweep(), null); // D126: pedidos esperando y seguimientos por vencer; deduplicado
  const shiftsClosed = await step("shifts", () => closeShiftsAfterHours(), 0); // D158: nadie queda en turno fuera de 6 a 22
  const p = await step("outbox", () => processOutbox(), { processed: 0 });
  const out = { escalated: e.escalated, processed: p.processed, sent: "sent" in p ? p.sent : 0, demos, trialNotices: trial.created, connect, shiftsClosed };
  return failed.length ? Response.json({ ...out, error: "job falló", failed }, { status: 500 }) : Response.json(out);
}
