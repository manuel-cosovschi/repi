// Acciones de REPI (D210): proponer (desde un atajo de la interfaz), confirmar o cancelar. Confirmar exige una propuesta
// registrada por el servidor (por su clave) y vuelve a validar con el contexto actual; la respuesta trae el resultado real.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { rateLimit } from "@/server/access/util";
import { cancelAction, confirmAction, proposeFromClient } from "@/server/brain/actions";

// Menor que el plazo del reclamo de una acción (ACTION_LEASE_MS, 120 s; BRAIN_ROUTE_MAX_S en server/brain/store.ts): una
// ejecución nunca sigue viva cuando otro pedido puede retomarla. Literal: Next lee la configuración de la ruta sin ejecutarla.
export const maxDuration = 60;

const Key = z.string().max(120);
const B = z.discriminatedUnion("op", [
  z.object({ op: z.literal("propose"), kind: z.string().max(40), input: z.record(z.string(), z.unknown()).optional(), key: Key.optional(), section: z.string().max(20).optional() }).strict(),
  z.object({ op: z.literal("confirm"), key: Key, details: z.object({ level: z.number().int().min(0).max(10).optional(), zone: z.string().max(40).optional() }).strict().optional() }).strict(),
  z.object({ op: z.literal("cancel"), key: Key }).strict(),
]);

export const POST = handle(async (req) => {
  const userId = await sessionUserId();
  const b = await body(req, B);
  await rateLimit(`brain-action:${userId}`, 30, 60_000);
  if (b.op === "confirm") return confirmAction(userId, b.key, { details: b.details });
  if (b.op === "cancel") return cancelAction(userId, b.key);
  return proposeFromClient(userId, b);
});
