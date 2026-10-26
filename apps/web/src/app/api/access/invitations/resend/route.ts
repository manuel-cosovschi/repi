// Reenvío de invitación (anexo §4–5): invalida la anterior y genera una nueva para el mismo email.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`resend:${me}`, 10);
  const inv = await svc.resendInvitation(me, (await body(req, z.object({ id: z.string().max(64) }))).id);
  return { id: inv.id, code: inv.code, expiresAt: inv.expiresAt };
});
