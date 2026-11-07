import { purgeMedia } from "@/server/followup/services";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { purgeUploadIntents } from "@/server/uploads";
import { purgeRateLimits } from "@/server/access/util";
import { purgeSiteEvents } from "@/server/site/events";
import { purgeBrainRetention } from "@/server/privacy/brain";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:purge-media (D39): borra videos vencidos y huérfanos, subidas directas sin confirmar (D71), contadores de intentos viejos (D74) y eventos del sitio comercial de más de 400 días (D205). Una vez por día.
// D210: además, la retención de REPI (mensajes 180 días, avisos 90, uso de IA 400, memoria vencida), aislada: si falla, lo
// anterior ya corrió y la respuesta lo informa con 500 para que se vea.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  try {
    const out = { ...(await purgeMedia()), intents: await purgeUploadIntents(), rateLimits: await purgeRateLimits(), siteEvents: await purgeSiteEvents() };
    const brain = await purgeBrainRetention().catch((err) => { logError("cron.purge.brain", err, req); return null; });
    return brain ? Response.json({ ...out, brain }) : Response.json({ ...out, error: "job falló", failed: ["brain"] }, { status: 500 });
  } catch (err) { logError("cron.purge", err, req); return Response.json({ error: "job falló" }, { status: 500 }); }
}
