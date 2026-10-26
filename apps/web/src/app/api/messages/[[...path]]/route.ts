// Mensajería (D40): lista de conversaciones del socio/alumno, lectura y envío para cualquier participante autorizado.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as msg from "@/server/messages/services";

type Ctx = { params: Promise<{ path?: string[] }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const [id] = (await params).path ?? [];
  const me = await sessionUserId();
  if (!id) return msg.myThreads(me);
  return msg.getThread(me, id, { before: new URL(req.url).searchParams.get("before") });
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const [id] = (await params).path ?? [];
  if (!id) throw new AccessError("not_found", "No encontramos esta conversación.", 404);
  const me = await sessionUserId();
  await limit(`msg:${me}`, 30);
  return msg.sendMessage(me, id, await body(req, z.object({ id: z.string().max(64), body: z.string().max(4000) })));
});
