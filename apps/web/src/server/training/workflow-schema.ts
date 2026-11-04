// D192: formas de las rutas del flujo del entrenador (tipos de serie propios y copiar días). Las reglas viven en los servicios.
import { z } from "zod";

export const SetTypeZ = z.object({
  name: z.string().max(60).optional(), kind: z.string().max(20).optional(),
  defaults: z.object({ reps: z.string().max(20).nullable().optional(), rir: z.number().nullable().optional(), rpe: z.number().nullable().optional(), restSec: z.number().nullable().optional() }).nullable().optional(),
});

const ref = z.string().min(1).max(64);
export const CopyChoiceZ = z.object({ weights: z.enum(["keep", "strip"]), notes: z.boolean(), skipUnavailable: z.boolean().optional() });
/** Pegar un día en el programa de la ruta (destino). El origen va por referencia: el servidor lo vuelve a leer con permisos. */
export const PasteZ = z.object({
  from: z.object({ programId: ref, day: z.number().int().min(0).max(20) }),
  mode: z.enum(["append", "replace", "new_day"]), day: z.number().int().min(0).max(20).nullable(),
  choice: CopyChoiceZ.nullable().optional(), expect: z.string().max(64).optional(), requestId: z.string().max(64).optional(),
});
