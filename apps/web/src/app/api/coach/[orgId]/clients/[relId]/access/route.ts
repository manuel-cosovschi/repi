import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ item: z.string().max(40), reason: z.string().max(300).optional() });
type P = { params: Promise<{ orgId: string; relId: string }> };
export const GET = handle<P>(async (_r, { params }) => { const p = await params; return fu.accessStates(await sessionUserId(), p.orgId, p.relId); });
export const POST = handle<P>(async (req, { params }) => { const p = await params; const b = await body(req, B); return fu.requestAccess(await sessionUserId(), p.orgId, p.relId, b.item, b.reason); });
