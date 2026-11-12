// La conversación vigente con REPI (D210). Privada: sólo su dueño. No crea una conversación nueva.
import { handle, sessionUserId } from "@/server/access/http";
import { threadWithMessages } from "@/server/brain/conversation";

export const GET = handle(async (req) => {
  const n = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  return threadWithMessages(await sessionUserId(), Number.isInteger(n) ? Math.min(Math.max(n, 1), 200) : 50);
});
