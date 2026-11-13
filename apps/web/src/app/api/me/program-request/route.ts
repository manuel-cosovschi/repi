// D206: preferencias del pedido de programa. GET: pedidos esperando datos y precarga del formulario. POST: completa los
// pedidos que no tenían preferencias (los anteriores a D206 o los que creó el gimnasio), abiertos o ya respondidos.
// POST { later: true }: «Ahora no» en el aviso de un pedido ya respondido (lo pausa 14 días).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { completeProgramBrief, programRequestState, snoozeLateBrief } from "@/server/training/program-request";

export const GET = handle(async () => programRequestState(await sessionUserId()));
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`brief:${me}`, 10);
  const p = await body(req, z.union([z.object({ brief: z.record(z.string(), z.unknown()) }), z.object({ later: z.literal(true) }).strict()]));
  return "later" in p ? snoozeLateBrief(me) : completeProgramBrief(me, p.brief);
});
