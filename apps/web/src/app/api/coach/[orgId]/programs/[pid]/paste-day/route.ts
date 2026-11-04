// D192: confirmar pegar un día (idempotente por `requestId`; 409 si el destino cambió desde la vista previa).
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import { coachPasteDay } from "@/server/training/day-copy";
import { PasteZ } from "@/server/training/workflow-schema";

export const POST = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (req, { params }) => {
  const { orgId, pid } = await params;
  const me = await sessionUserId();
  await limit(`paste-day:${me}`, 60);
  const p = await body(req, PasteZ);
  if (!p.choice || !p.expect || !p.requestId) throw new AccessError("invalid", "Revisá la vista previa antes de confirmar.");
  return coachPasteDay(me, orgId, { from: p.from, to: { programId: pid, mode: p.mode, day: p.day }, choice: p.choice, expect: p.expect, requestId: p.requestId });
});
