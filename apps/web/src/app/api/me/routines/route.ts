// D158: «Mis rutinas». GET lista las rutinas propias del alumno; POST crea o actualiza una.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { listOwnRoutines, saveOwnRoutine } from "@/server/training/own-routines";

const Ex = z.object({
  exerciseId: z.string().max(64), sets: z.number().int(), reps: z.string().max(20),
  weightKg: z.number().nullable(), restSec: z.number().int().nullable(), note: z.string().max(200).nullable(),
});
const B = z.object({ id: z.string().max(64).nullable().optional(), name: z.string().max(80), exercises: z.array(Ex).max(20) });

export const GET = handle(async () => listOwnRoutines(await sessionUserId()));

export const POST = handle(async (req) => {
  const me = await sessionUserId();
  const b = await body(req, B);
  await limit(`own-routine:${me}`, 60, 3_600_000);
  return saveOwnRoutine(me, b);
});
