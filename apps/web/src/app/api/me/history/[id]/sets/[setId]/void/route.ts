import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as h from "@/server/training/history";

const B = z.object({ requestId: z.string().max(64), voided: z.boolean(), reason: z.string().max(400).nullable().optional() }).strict();
// D195: anular (o restaurar) una serie registrada por error.
export const POST = handle<{ params: Promise<{ id: string; setId: string }> }>(async (req, { params }) => {
  const p = await params;
  return h.setVoided(await sessionUserId(), p.id, p.setId, await body(req, B));
});
