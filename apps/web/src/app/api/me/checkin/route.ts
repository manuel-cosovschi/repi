import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ energy: z.number().int(), sleep: z.number().int(), mood: z.number().int() });
export const POST = handle(async (req) => fu.saveCheckin(await sessionUserId(), await body(req, B)));
export const GET = handle(async () => ({ checkin: await fu.todayCheckin(await sessionUserId()) }));
