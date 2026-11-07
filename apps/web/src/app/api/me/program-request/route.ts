// D206: preferencias del pedido de programa. GET: pedidos esperando datos y precarga del formulario. POST: completa los
// pedidos abiertos que no tenían preferencias (los anteriores a D206 o los que creó el gimnasio).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { completeProgramBrief, programRequestState } from "@/server/training/program-request";

export const GET = handle(async () => programRequestState(await sessionUserId()));
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`brief:${me}`, 10);
  return completeProgramBrief(me, (await body(req, z.object({ brief: z.record(z.string(), z.unknown()) }))).brief);
});
