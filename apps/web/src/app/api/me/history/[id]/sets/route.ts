import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as h from "@/server/training/history";

// Ejercicios por tiempo: `metrics` (velocidad, inclinación, nivel, distancia, ritmo, cadencia) se valida con el perfil de la fila.
const N = z.number().nullable().optional();
const V = z.object({ weightKg: z.number().nullable().optional(), reps: z.number().int().nullable().optional(), rir: z.number().int().nullable().optional(), feel: z.string().max(20).nullable().optional(), note: z.string().max(400).nullable().optional(),
  metrics: z.object({ speedKmh: N, incline: N, level: N, distanceM: N, pace500Sec: N, cadenceRpm: N }).strict().nullable().optional() }).strict();
const B = z.object({ requestId: z.string().max(64), programExerciseId: z.string().max(64), setIndex: z.number().int(), values: V, reason: z.string().max(400).nullable().optional(), confirm: z.boolean().optional() }).strict();
// D195: agregar una serie prescripta que se hizo y no se registró.
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => h.addMissingSet(await sessionUserId(), (await params).id, await body(req, B)));
