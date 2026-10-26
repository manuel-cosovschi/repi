import { handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => fu.coachInbox(await sessionUserId(), (await params).orgId));
