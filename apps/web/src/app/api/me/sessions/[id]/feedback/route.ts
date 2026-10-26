import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const B = z.object({ rpe: z.number().int(), note: z.string().max(1000).nullable().optional() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => tr.sessionFeedback(await sessionUserId(), (await params).id, await body(req, B)));
