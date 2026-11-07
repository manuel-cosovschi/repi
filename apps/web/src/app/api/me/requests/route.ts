import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ kind: z.enum(["rutina", "tecnica", "consulta", "programa"]), text: z.string().max(1000), videoId: z.string().max(64).nullable().optional(), brief: z.record(z.string(), z.unknown()).optional() }); // D206
export const POST = handle(async (req) => fu.createRequest(await sessionUserId(), await body(req, B)));
