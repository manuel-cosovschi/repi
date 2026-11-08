// Opinión sobre una respuesta de REPI (D210): útil (1), no útil (−1) o quitarla (null). Sólo mensajes propios de REPI.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { setFeedback } from "@/server/brain/conversation";

const B = z.object({ messageId: z.string().max(64), value: z.union([z.literal(1), z.literal(-1), z.null()]) }).strict();
export const POST = handle(async (req) => {
  const userId = await sessionUserId();
  const b = await body(req, B);
  return { message: await setFeedback(userId, b.messageId, b.value) };
});
