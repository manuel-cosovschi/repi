import { handle, sessionUserId } from "@/server/access/http";
import * as msg from "@/server/messages/services";

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => msg.coachThreads(await sessionUserId(), (await params).orgId));
