import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ approve: z.boolean() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => fu.decideAccess(await sessionUserId(), (await params).id, (await body(req, B)).approve));
