import { purgeMedia } from "@/server/followup/services";
import { cronAuthorized } from "@/server/cron";

export const dynamic = "force-dynamic";

// Mismo trabajo que pnpm jobs:purge-media (D39): borra videos vencidos y huérfanos. Una vez por día.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  return Response.json(await purgeMedia());
}
