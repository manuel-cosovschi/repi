// «No vino el profe» con IA (D133): sugerencia de día y cargas para hoy. Se pide aparte para no demorar el plan con reglas.
// D138: con `follow`, la persona responde a la sugerencia (algo ocupado, que no hay o que molesta) y la IA la rearma.
import { z } from "zod";
import { EXERCISE_CHANGE_REASONS } from "@repi/domain";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { aiSoloAdvice } from "@/server/training/ai-coach";

const B = z.object({
  follow: z.object({
    dayId: z.string().max(64).nullable(),
    message: z.string().max(400),
    issues: z.array(z.object({ programExerciseId: z.string().max(64), reason: z.enum(Object.keys(EXERCISE_CHANGE_REASONS) as [keyof typeof EXERCISE_CHANGE_REASONS, ...(keyof typeof EXERCISE_CHANGE_REASONS)[]]) })).max(20),
    turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(600) })).max(8),
  }).optional(),
});

export const maxDuration = 60;
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  const { follow } = await body(req, B);
  await limit(`solo-ai:${me}`, 20, 3_600_000);
  await limit(`solo-ai-day:${me}`, 60, 86_400_000); // SEC-8: tope diario de costo de OpenAI por persona
  return aiSoloAdvice(me, new Date(), follow);
});
