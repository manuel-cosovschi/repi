import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as h from "@/server/training/history";

// Ejercicios por tiempo: `metrics` (velocidad, inclinación, nivel, distancia, ritmo, cadencia) se valida con el perfil de la fila.
const N = z.number().nullable().optional();
const V = z.object({ weightKg: z.number().nullable().optional(), reps: z.number().int().nullable().optional(), rir: z.number().int().nullable().optional(), feel: z.string().max(20).nullable().optional(), note: z.string().max(400).nullable().optional(),
  metrics: z.object({ speedKmh: N, incline: N, level: N, distanceM: N, pace500Sec: N, cadenceRpm: N }).strict().nullable().optional() }).strict();
const B = z.object({ requestId: z.string().max(64), baseRevision: z.number().int().min(0), values: V, reason: z.string().max(400).nullable().optional(), confirm: z.boolean().optional() }).strict();
// D195: corregir una serie registrada.
export const POST = handle<{ params: Promise<{ id: string; setId: string }> }>(async (req, { params }) => {
  const p = await params;
  return h.correctSet(await sessionUserId(), p.id, p.setId, await body(req, B));
});
