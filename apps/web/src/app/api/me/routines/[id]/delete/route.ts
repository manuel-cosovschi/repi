// D158: borra una rutina propia. Lo ya entrenado con ella queda en el historial.
import { handle, sessionUserId } from "@/server/access/http";
import { deleteOwnRoutine } from "@/server/training/own-routines";

export const POST = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => deleteOwnRoutine(await sessionUserId(), (await ctx.params).id));
