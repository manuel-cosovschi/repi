import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const B = z.object({ action: z.enum(["pause", "resume", "finish"]), at: z.string().max(40).optional() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => { const b = await body(req, B); return tr.sessionAction(await sessionUserId(), (await params).id, b.action, new Date(), b.at); });
