// D158: biblioteca de ejercicios para armar «Mis rutinas» (catálogo de REPI y los propios del coach o gimnasio).
// D163: POST crea un ejercicio propio del alumno (sólo lo ve él).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { createMyExercise, myExerciseLibrary } from "@/server/training/own-routines";

export const GET = handle(async () => myExerciseLibrary(await sessionUserId()));

const B = z.object({ name: z.string().max(80), group: z.string().max(40), kind: z.string().max(20) });
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`member-exercise:${me}`, 40, 3_600_000);
  return createMyExercise(me, await body(req, B));
});
