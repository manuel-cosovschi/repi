import { escalatePending, remindPendingConsent } from "@/server/join/services";
import { processOutbox } from "@/server/push/services";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { purgeSandboxes } from "@/server/sandbox/services";
import { trialNotices } from "@/server/commercial/notices";
import { connectSweep } from "@/server/gym/connect";
import { closeShiftsAfterHours, syncScheduledShifts } from "@/server/gym/services";
import { closeIdleWorkouts } from "@/server/training/services";
import { checkBackupFreshness } from "@/server/ops/backup-watch";
import { remindProgramBriefs } from "@/server/training/program-request";
import { runProactive } from "@/server/brain/proactive";
import { leadsTick } from "@/server/leads/pipeline";
import { after } from "next/server";
import { CRON_DEADLINE_MS, DeadlineError, withDeadline } from "@/server/deadline";

export const dynamic = "force-dynamic";
// Incidente 07/11: tope duro de la función (antes, 300 s). Las tareas comparten un presupuesto de 45 s (CRON_DEADLINE_MS).
export const maxDuration = 60;

// Mismo trabajo que pnpm jobs:notifications: vence/escala solicitudes y reintenta la cola push; además borra demos vencidas y
// avisa fin de prueba a clientes (F-BL-05). Cada minuto.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  // Auditoría 30/10: cada tarea por separado. Antes un error en una (por ejemplo, borrar una demo) cortaba todas las demás:
  // sin push, sin cierre de turnos a las 22 y sin avisos de fin de prueba mientras durara.
  const failed: string[] = [];
  // Incidente 07/11: una tarea que no termina (consulta trabada, push sin respuesta) ya no deja esperando al resto hasta el corte
  // de la función: cada una corre con lo que queda del presupuesto; agotado, las siguientes se saltean y se informan como fallidas.
  const until = Date.now() + CRON_DEADLINE_MS;
  const step = async <T>(name: string, run: () => Promise<T>, fallback: T) => {
    const left = until - Date.now();
    if (left <= 0) { failed.push(name); return fallback; }
    const work = Promise.resolve().then(() => run());
    try { return await withDeadline(work, left, `cron.${name}`); } catch (err) {
      if (err instanceof DeadlineError) { const late = work.then(() => {}, () => {}); try { after(() => late); } catch { /* fuera de un pedido */ } }
      logError(`cron.notifications.${name}`, err, req); failed.push(name); return fallback;
    }
  };
  const e = await step("escalate", escalatePending, { escalated: 0 });
  const demos = await step("demos", () => purgeSandboxes(), 0); // demos vencidas (D85): consulta indexada, casi siempre vacía
  const trial = await step("trial", () => trialNotices(), { created: 0 }); // F-BL-05: fin de prueba; idempotente por contrato y fecha
  const connect = await step("connect", () => connectSweep(), null); // D126: pedidos esperando y seguimientos por vencer; deduplicado
  const shiftsClosed = await step("shifts", () => closeShiftsAfterHours(), 0); // D158: nadie queda en turno fuera de 6 a 22
  const scheduled = await step("scheduled", () => syncScheduledShifts(), { opened: 0, closed: 0 }); // D170: turnos por horario
  const workoutsClosed = await step("workouts", () => closeIdleWorkouts(), 0); // D160: entrenamientos olvidados (22 h en el gym, 6 h sin actividad)
  const consentReminders = await step("consent", () => remindPendingConsent(), 0); // D160: altas aprobadas sin terminar, a las 8
  const briefReminders = await step("brief", () => remindProgramBriefs(), 0); // D206: pedidos de programa sin preferencias, un push por pedido (10 a 21)
  // D210: Asistente REPI. Sólo a las 9 y a las 18 (hora AR); cada minuto de la franja evalúa 1/60 de las personas activas, con
  // tope de personas y de tiempo; idempotente (claves únicas y lock por persona). Antes de la cola: su push sale en este mismo minuto.
  const brain = await step("brain", () => runProactive(), null);
  // D218: Captación. Si la programación está encendida, un paso diario como máximo por minuto (hora AR); nunca envía mensajes.
  const leads = await step("leads", () => leadsTick(), { ran: null });
  const p = await step("outbox", () => processOutbox(), { processed: 0 });
  // D198: vigilante de respaldos, una vez por hora (minuto 7), independiente del cronograma de GitHub.
  const backup = new Date().getUTCMinutes() === 7 ? await step("backup", () => checkBackupFreshness(), null) : null;
  const brainOut = brain?.ran ? { evaluated: brain.evaluated, emitted: brain.emitted, pushed: brain.pushed, duplicates: brain.duplicates, failed: brain.failed, ms: brain.ms, budgetHit: brain.budgetHit } : null;
  const out = { escalated: e.escalated, processed: p.processed, sent: "sent" in p ? p.sent : 0, demos, trialNotices: trial.created, connect, shiftsClosed, scheduled, workoutsClosed, consentReminders, briefReminders, brain: brainOut, backup, leads: leads.ran };
  return failed.length ? Response.json({ ...out, error: "job falló", failed }, { status: 500 }) : Response.json(out);
}
