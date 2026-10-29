// D153: empieza la rutina de hoy (sin programa asignado). Devuelve la sesión; la app la abre como cualquier entrenamiento.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { startSoloRoutine } from "@/server/training/services";

const B = z.object({
  id: z.string().max(64),
  dayName: z.string().max(60),
  exercises: z.array(z.object({ exerciseId: z.string().max(64), sets: z.number().int(), reps: z.string().max(20), restSec: z.number().int().nullable().optional(), weightKg: z.number().nullable().optional(), note: z.string().max(200).nullable().optional() })).max(12),
});

export const POST = handle(async (req) => {
  const me = await sessionUserId();
  const b = await body(req, B);
  await limit(`solo-start:${me}`, 20, 3_600_000);
  const s = await startSoloRoutine(me, b);
  return { id: s.id };
});
