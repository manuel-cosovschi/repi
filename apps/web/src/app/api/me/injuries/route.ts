import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ zone: z.string().max(40), status: z.enum(["active", "monitoring", "resolved"]), detail: z.string().max(300).nullable().optional(), since: z.string().max(40).nullable().optional() });
export const GET = handle(async () => ({ injuries: await fu.myInjuries(await sessionUserId()) }));
export const POST = handle(async (req) => fu.addInjury(await sessionUserId(), await body(req, B)));
