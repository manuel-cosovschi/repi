// Cerrar la conversación con REPI (D210). Idempotente; la próxima pregunta empieza una nueva.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { closeThread } from "@/server/brain/conversation";

const B = z.object({ threadId: z.string().max(64).optional() }).strict();
export const POST = handle(async (req) => {
  const userId = await sessionUserId();
  const b = await body(req, B);
  return closeThread(userId, b.threadId);
});
