import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => {
  const p = await params;
  return tr.clientDetail(await sessionUserId(), p.orgId, p.relId);
});
