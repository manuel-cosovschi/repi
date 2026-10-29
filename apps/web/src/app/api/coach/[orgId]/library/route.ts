import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => ({ exercises: await tr.listLibrary(await sessionUserId(), (await params).orgId) }));

// Ejercicio propio (D129): lo que falta en el catálogo base, sólo para este espacio.
const S = z.object({ name: z.string().max(80), group: z.string().max(40), kind: z.string().max(20) });
export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  await limit("exercise-create", 30);
  return tr.coachCreateExercise(await sessionUserId(), (await params).orgId, await body(req, S));
});
