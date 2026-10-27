import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ email: z.string().max(200).nullable().optional() });

export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const inv = await svc.inviteCoachClient(await sessionUserId(), (await params).orgId, await body(req, S));
  return { id: inv.id, code: inv.code, expiresAt: inv.expiresAt, delivery: inv.delivery };
});
