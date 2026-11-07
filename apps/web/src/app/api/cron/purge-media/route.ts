import { purgeMedia } from "@/server/followup/services";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { purgeUploadIntents } from "@/server/uploads";
import { purgeRateLimits } from "@/server/access/util";
import { purgeSiteEvents } from "@/server/site/events";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:purge-media (D39): borra videos vencidos y huérfanos, subidas directas sin confirmar (D71), contadores de intentos viejos (D74) y eventos del sitio comercial de más de 400 días (D205). Una vez por día.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  try {
    return Response.json({ ...(await purgeMedia()), intents: await purgeUploadIntents(), rateLimits: await purgeRateLimits(), siteEvents: await purgeSiteEvents() });
  } catch (err) { logError("cron.purge", err, req); return Response.json({ error: "job falló" }, { status: 500 }); }
}
