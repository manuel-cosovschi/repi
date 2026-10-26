import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ status: z.enum(["active", "monitoring", "resolved"]).optional(), delete: z.boolean().optional() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => fu.updateInjury(await sessionUserId(), (await params).id, await body(req, B)));
