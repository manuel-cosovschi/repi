// Un mensaje a REPI (D210). El historial que ve el modelo sale de la base, nunca del navegador; la referencia de la pantalla
// se valida en el servidor (un id ajeno responde 404). `clientId` hace idempotente el reintento.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { rateLimit } from "@/server/access/util";
import { handleMessage } from "@/server/brain/orchestrator";

// Menor que el plazo del reclamo de una acción (ACTION_LEASE_MS, 120 s; BRAIN_ROUTE_MAX_S en server/brain/store.ts): una
// ejecución nunca sigue viva cuando otro pedido puede retomarla. Literal: Next lee la configuración de la ruta sin ejecutarla.
export const maxDuration = 60;

const Id = z.string().max(64).nullable().optional();
const B = z.object({
  text: z.string().max(1000),
  section: z.string().max(20).optional(),
  ref: z.object({ exerciseId: Id, sessionId: Id, programExerciseId: Id, routineId: Id, setIndex: z.number().int().min(0).max(39).nullable().optional() }).strict().nullable().optional(),
  clientId: z.string().max(64).optional(),
  offlinePending: z.boolean().optional(),
}).strict();

export const POST = handle(async (req) => {
  const userId = await sessionUserId();
  const b = await body(req, B);
  await rateLimit(`brain-message:${userId}`, 30, 60_000);
  return handleMessage(userId, b);
});
