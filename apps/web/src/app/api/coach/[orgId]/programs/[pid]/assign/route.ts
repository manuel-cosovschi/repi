import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const S = z.object({ coachClientIds: z.array(z.string().max(64)).max(200), startsOn: z.string().max(10) });
export const POST = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (req, { params }) => { const p = await params; return tr.assignProgram(await sessionUserId(), p.orgId, p.pid, await body(req, S)); });
