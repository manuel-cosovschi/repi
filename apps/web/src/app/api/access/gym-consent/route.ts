import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ orgId: z.string().max(64), grants: z.array(z.string().max(40)).max(20).default([]) });

export const POST = handle(async (req) => {
  const b = await body(req, S);
  return svc.completeGymConsent(await sessionUserId(), b.orgId, b.grants);
});
