// Revocar una invitación pendiente (F-08): el código deja de servir. Mismos permisos que reenviar.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`revoke:${me}`, 20);
  await svc.revokeInvitation(me, (await body(req, z.object({ id: z.string().max(64) }))).id);
  return { ok: true };
});
