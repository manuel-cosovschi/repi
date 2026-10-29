// Forma del detalle de prescripción (D134) para las rutas. Los rangos y reglas los valida `validateDetail` del dominio.
import { z } from "zod";
import type { ExerciseDetail } from "@repi/domain";

const n = z.number().nullable().optional();
const Set = z.object({ kind: z.string().max(20), reps: z.string().max(20), weightKg: n, pct1rm: n, rir: n, rpe: n, restSec: n, note: z.string().max(120).nullable().optional() });
const Shape = z.object({
  technique: z.string().max(30).optional(), setPlan: z.array(Set).max(20).nullable().optional(), group: z.string().max(2).nullable().optional(),
  groupKind: z.string().max(20).nullable().optional(), rounds: n, tempo: z.string().max(16).nullable().optional(), variant: z.string().max(80).nullable().optional(),
  unilateral: z.boolean().optional(), progression: z.string().max(160).nullable().optional(),
}).nullable().optional();
/** Tipado como el detalle del dominio: `validateDetail` normaliza técnica, tipos de serie y rangos antes de guardar. */
export const DetailZ = Shape as unknown as z.ZodType<Partial<ExerciseDetail> | null | undefined> as z.ZodType<ExerciseDetail | null | undefined>;
