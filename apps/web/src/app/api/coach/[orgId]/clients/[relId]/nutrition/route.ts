// D221: Nutrición del alumno para su coach, sólo con permiso vigente (resumen y/o diario). Se comprueba en cada pedido.
import { handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

export const dynamic = "force-dynamic";
export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => {
  const p = await params;
  return fu.clientNutrition(await sessionUserId(), p.orgId, p.relId);
});
