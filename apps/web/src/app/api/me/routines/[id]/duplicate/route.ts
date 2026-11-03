// D184: duplica una rutina propia con sus métodos y etapas.
import { handle, limit, sessionUserId } from "@/server/access/http";
import { duplicateOwnRoutine } from "@/server/training/own-routines";

export const POST = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await sessionUserId();
  await limit(`own-routine:${me}`, 60, 3_600_000);
  return duplicateOwnRoutine(me, (await ctx.params).id);
});
