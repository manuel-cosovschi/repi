import { handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => { const p = await params; return fu.clientHealth(await sessionUserId(), p.orgId, p.relId); });
