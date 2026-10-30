// D158: empieza una rutina propia. Devuelve la sesión; la app la abre como cualquier entrenamiento.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { startOwnRoutine } from "@/server/training/own-routines";

const B = z.object({ id: z.string().max(64) });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await sessionUserId();
  const b = await body(req, B);
  await limit(`solo-start:${me}`, 20, 3_600_000);
  const s = await startOwnRoutine(me, (await ctx.params).id, b.id);
  return { id: s.id };
});
