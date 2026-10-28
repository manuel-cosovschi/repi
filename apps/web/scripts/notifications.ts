// Job de avisos (anexo 26/10 §6–7): vence solicitudes viejas, escala las que esperan más de 5 minutos y reintenta la cola push.
// Uso: pnpm jobs:notifications (programar cada minuto). Sin VAPID configurado los avisos quedan «skipped»; la bandeja no pierde nada.
import { sqlClient } from "@/db";
import { escalatePending } from "@/server/join/services";
import { processOutbox } from "@/server/push/services";
import { trialNotices } from "@/server/commercial/notices";
import { connectSweep } from "@/server/gym/connect";

(async () => {
  const e = await escalatePending();
  const t = await trialNotices();
  const c = await connectSweep(); // REPI Connect (D126)
  const p = await processOutbox();
  console.log(`solicitudes escaladas: ${e.escalated} · avisos procesados: ${p.processed}${"sent" in p ? ` (aceptados por el proveedor: ${p.sent})` : ""} · avisos de prueba: ${t.created} · Connect: ${c.waiting} esperando, ${c.due} seguimientos`);
  await sqlClient.end();
})();
