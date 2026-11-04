// D192: programas a los que el coach puede pegar un día (plantillas y programa vigente de cada cliente activo).
import { handle, sessionUserId } from "@/server/access/http";
import { coachPasteTargets } from "@/server/training/day-copy";

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => { const { orgId } = await params; return coachPasteTargets(await sessionUserId(), orgId); });
