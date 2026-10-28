// Pausar, reactivar o terminar la relación con un alumno (D115).
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const B = z.object({ status: z.enum(["active", "paused", "ended"]) });
export const POST = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (req, { params }) => {
  const p = await params;
  return tr.setClientStatus(await sessionUserId(), p.orgId, p.relId, (await body(req, B)).status);
});
