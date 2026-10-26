import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";

const B = z.object({ item: z.string().max(40), on: z.boolean() });
export const GET = handle(async () => fu.myPrivacy(await sessionUserId()));
export const POST = handle(async (req) => { const b = await body(req, B); return fu.setShare(await sessionUserId(), b.item, b.on); });
