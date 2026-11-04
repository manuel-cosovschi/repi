// D192: vista previa de pegar un día (no escribe nada).
import { body, handle, sessionUserId } from "@/server/access/http";
import { coachDayCopyPreview } from "@/server/training/day-copy";
import { PasteZ } from "@/server/training/workflow-schema";

export const POST = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (req, { params }) => {
  const { orgId, pid } = await params;
  const p = await body(req, PasteZ);
  return coachDayCopyPreview(await sessionUserId(), orgId, { from: p.from, to: { programId: pid, mode: p.mode, day: p.day }, choice: p.choice ?? null });
});
