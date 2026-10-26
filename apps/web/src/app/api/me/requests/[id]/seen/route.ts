import { handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (_r, { params }) => { await fu.markResolvedSeen(await sessionUserId(), (await params).id); return { ok: true }; });
