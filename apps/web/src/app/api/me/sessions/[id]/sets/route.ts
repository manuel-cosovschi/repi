import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

// Ejercicios por tiempo: `metrics` (velocidad, inclinación, nivel…) es opcional: sin el campo (una app anterior), las métricas
// guardadas no se tocan; `null` las borra. Los rangos los valida `cleanSetMetrics` con el perfil de la fila. Sin `.strict()`: una
// serie de una app más nueva con un campo desconocido no frena la sincronización sin conexión (el campo se descarta).
const N = z.number().nullable().optional();
const M = z.object({ speedKmh: N, incline: N, level: N, distanceM: N, pace500Sec: N, cadenceRpm: N }).nullable().optional();
const B = z.object({ id: z.string().max(36), programExerciseId: z.string().max(64), setIndex: z.number().int(), weightKg: z.number().nullable(), reps: z.number().int().nullable(), rir: z.number().int().nullable(), feel: z.string().max(20).nullable().optional(), note: z.string().max(400).nullable().optional(), metrics: M, baseRevision: z.number().int().min(0).optional(), at: z.string().max(40).optional() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => tr.logSet(await sessionUserId(), (await params).id, await body(req, B)));
