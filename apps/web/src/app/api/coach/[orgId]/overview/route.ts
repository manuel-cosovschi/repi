import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";
import { inboxCount } from "@/server/followup/services";
import { coachThreads } from "@/server/messages/services";

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => {
  const orgId = (await params).orgId;
  const me = await sessionUserId();
  const ov = await tr.coachOverview(me, orgId);
  return { ...ov, inbox: await inboxCount(orgId), msgs: (await coachThreads(me, orgId)).filter((t) => t.unread > 0).length };
});
