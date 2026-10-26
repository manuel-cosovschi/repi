import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ code: z.string().max(12), grants: z.array(z.string().max(40)).max(20).default([]) });

export const POST = handle(async (req) => {
  const uid = await sessionUserId();
  const b = await body(req, S);
  return svc.acceptInvitation(uid, b.code, b.grants);
});
