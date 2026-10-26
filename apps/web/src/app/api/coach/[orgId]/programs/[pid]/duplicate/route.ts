import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const POST = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (_r, { params }) => { const p = await params; return { id: await tr.duplicateProgram(await sessionUserId(), p.orgId, p.pid) }; });
