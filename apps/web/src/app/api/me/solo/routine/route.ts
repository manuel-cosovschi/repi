// D153: rutina de hoy sin programa asignado (biblioteca + lo que busca la persona). Con `message`, la rearma con su pedido.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { soloRoutine } from "@/server/training/solo-routine";

const B = z.object({ message: z.string().max(400).optional() });

export const maxDuration = 60;
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  const { message } = await body(req, B);
  await limit(`solo-ai:${me}`, 20, 3_600_000);
  await limit(`solo-ai-day:${me}`, 60, 86_400_000); // SEC-8: mismo tope diario que «No vino el profe»
  return soloRoutine(me, new Date(), message);
});
