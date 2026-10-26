import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ zone: z.string().max(40), level: z.number().int(), context: z.enum(["now", "after", "out"]), exerciseName: z.string().max(120).nullable().optional(), sessionId: z.string().max(64).nullable().optional(), note: z.string().max(500).nullable().optional(), shareThis: z.boolean().optional() });
export const POST = handle(async (req) => fu.reportPain(await sessionUserId(), await body(req, B)));
