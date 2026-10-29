// D155: propuesta de programa armada por REPI con los datos que carga el coach. Borrador: queda en el editor.
import { BriefZ } from "@/server/training/brief-schema";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { coachProgramDraft } from "@/server/training/services";

export const maxDuration = 60;
export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`program-draft:${me}`, 20, 3_600_000);
  return coachProgramDraft(me, (await params).orgId, await body(req, BriefZ));
});
