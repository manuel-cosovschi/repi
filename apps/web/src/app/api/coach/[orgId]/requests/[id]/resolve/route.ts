import { handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

export const POST = handle<{ params: Promise<{ orgId: string; id: string }> }>(async (_r, { params }) => { const p = await params; return fu.resolveRequest(await sessionUserId(), p.orgId, p.id); });
