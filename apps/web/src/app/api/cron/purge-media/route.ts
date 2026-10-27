import { purgeMedia } from "@/server/followup/services";
import { cronAuthorized } from "@/server/cron";
import { purgeUploadIntents } from "@/server/uploads";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:purge-media (D39): borra videos vencidos y huérfanos, y subidas directas sin confirmar (D71). Una vez por día.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  return Response.json({ ...(await purgeMedia()), intents: await purgeUploadIntents() });
}
