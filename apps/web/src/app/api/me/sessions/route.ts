import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const S = z.object({ id: z.string().max(36), dayId: z.string().max(64), startedAt: z.string().max(40).optional(), closeOther: z.boolean().optional() });
export const POST = handle(async (req) => tr.startSession(await sessionUserId(), await body(req, S)));
