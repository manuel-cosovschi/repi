// SI2: guardar todos los días de una importación revisada juntos (todo o nada), idempotente por `opId`.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { saveImportedRoutines } from "@/server/training/own-routines";
import { DetailZ } from "@/server/training/detail-schema";

const Ex = z.object({
  exerciseId: z.string().max(64), sets: z.number().int(), reps: z.string().max(20),
  weightKg: z.number().nullable(), restSec: z.number().int().nullable(), note: z.string().max(200).nullable(), detail: DetailZ,
});
const F = z.array(z.string().max(10)).max(8);
const N = z.number().nullable().optional();
const SetV = z.object({ reps: z.string().max(20).nullable(), weightKg: z.number().nullable() });
const Origin = z.object({
  written: z.string().max(120), exerciseId: z.string().max(64).optional(), sets: z.number().nullable(), reps: z.string().max(20).nullable(), weightKg: z.number().nullable(),
  perSet: z.array(SetV).max(20).nullable(), restSec: z.number().nullable(), rir: z.number().nullable(), rpe: z.number().nullable(), tempo: z.string().max(16).nullable(),
  technique: z.string().max(80).nullable(), unknown: F, completed: F, suggested: F,
  // Ejercicios por tiempo: la actividad leída del documento (cinta, bici, remo…), como procedencia.
  activity: z.object({ profile: z.string().max(20), speedKmh: N, incline: N, level: N, distanceM: N, pace500Sec: N, cadenceRpm: N }).nullable().optional(),
});
const B = z.object({
  opId: z.string().min(8).max(64), source: z.enum(["sheet", "text", "ai"]), file: z.enum(["text", "sheet", "image", "pdf"]),
  routines: z.array(z.object({ name: z.string().max(80), exercises: z.array(Ex).max(20), origin: z.array(Origin).max(20) })).min(1).max(30),
});

export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`own-routine-import-save:${me}`, 30, 3_600_000);
  const b = await body(req, B);
  return saveImportedRoutines(me, { ...b, routines: b.routines.map((r) => ({ ...r, origin: r.origin.map((o) => ({ ...o, exerciseId: o.exerciseId ?? "" })) as never })) });
});
