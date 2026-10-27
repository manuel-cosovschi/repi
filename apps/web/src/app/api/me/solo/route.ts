// Adaptive Coach fase 1 (D108): qué entrenar por mi cuenta hoy, con datos existentes y reglas (sin IA).
import { handle, limit, sessionUserId } from "@/server/access/http";
import { soloPlan } from "@/server/training/adaptive";

export const GET = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`solo:${me}`, 30);
  return soloPlan(me, new URL(req.url).searchParams.get("v") === "coach_absent" ? "coach_absent" : "solo");
});
