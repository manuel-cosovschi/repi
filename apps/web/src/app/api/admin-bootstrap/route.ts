import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { claimFirstAdmin } from "@/server/admin/bootstrap";

export const POST = handle(async (req: Request) => {
  const uid = await sessionUserId();
  await limit("admin-bootstrap", 5);
  const { token } = await body(req, z.object({ token: z.string().min(20).max(100) }));
  return claimFirstAdmin(uid, token);
});
