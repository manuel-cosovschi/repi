import { z } from "zod";
import { body, handle, limit } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ approve: z.boolean() });

export const GET = handle<{ params: Promise<{ token: string }> }>(async (_req, { params }) => {
  await limit("tutor", 20);
  return svc.getGuardianRequest((await params).token);
});
export const POST = handle<{ params: Promise<{ token: string }> }>(async (req, { params }) => {
  await limit("tutor", 20);
  return svc.decideGuardian((await params).token, (await body(req, S)).approve);
});
