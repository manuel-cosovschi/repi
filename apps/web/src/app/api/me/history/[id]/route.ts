import { handle, sessionUserId } from "@/server/access/http";
import * as h from "@/server/training/history";

export const GET = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => h.historySession(await sessionUserId(), (await params).id));
