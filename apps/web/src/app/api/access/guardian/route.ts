import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ name: z.string().max(120), email: z.string().max(200), relation: z.string().max(40) });

export const POST = handle(async (req) => {
  await limit("guardian", 5);
  return svc.requestGuardianConsent(await sessionUserId(), await body(req, S));
});
export const GET = handle(async () => ({ status: await svc.guardianStatus(await sessionUserId()) }));
