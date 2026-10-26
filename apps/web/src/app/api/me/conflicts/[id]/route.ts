import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const B = z.object({ keep: z.enum(["local", "server"]) });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) =>
  tr.resolveConflict(await sessionUserId(), (await params).id, (await body(req, B)).keep));
