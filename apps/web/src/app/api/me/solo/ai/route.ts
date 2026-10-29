// «No vino el profe» con IA (D133): sugerencia de día y cargas para hoy. Se pide aparte para no demorar el plan con reglas.
import { handle, limit, sessionUserId } from "@/server/access/http";
import { aiSoloAdvice } from "@/server/training/ai-coach";

export const maxDuration = 60;
export const POST = handle(async () => {
  const me = await sessionUserId();
  await limit(`solo-ai:${me}`, 8, 3_600_000);
  return aiSoloAdvice(me);
});
