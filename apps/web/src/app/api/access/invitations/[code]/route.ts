import { handle, limit } from "@/server/access/http";
import * as svc from "@/server/access/services";

export const GET = handle<{ params: Promise<{ code: string }> }>(async (_req, { params }) => {
  await limit("invite-lookup", 12);
  return svc.lookupInvitation((await params).code);
});
