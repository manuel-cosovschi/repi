import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ email: z.string().max(200).nullable().optional() });

export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  // SEC-3 (QA 29/10): cada invitación manda un correo real; tope por persona para que no sirva para mandar spam.
  const me = await sessionUserId();
  await limit(`invite:${me}`, 30, 3_600_000);
  const inv = await svc.inviteCoachClient(me, (await params).orgId, await body(req, S));
  return { id: inv.id, code: inv.code, expiresAt: inv.expiresAt, delivery: inv.delivery };
});
