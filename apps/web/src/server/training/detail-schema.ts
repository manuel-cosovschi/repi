// Forma del detalle de prescripción (D134) para las rutas. Los rangos y reglas los valida `validateDetail` del dominio.
// D184: incluye los campos de D183 (identidad, serie principal y etapa de cada fila, AMRAP por tiempo, EMOM, revisión de
// clusters anteriores) y el tope de filas del dominio. Antes zod los descartaba en silencio: al guardar desde la app, las
// identidades se regeneraban, un cluster volvía a ser «series separadas» y se perdían el EMOM y la duración del AMRAP.
import { z } from "zod";
import { MAX_PLAN_ROWS, type ExerciseDetail } from "@repi/domain";

const n = z.number().nullable().optional();
const Set = z.object({
  kind: z.string().max(20), reps: z.string().max(20), weightKg: n, pct1rm: n, rir: n, rpe: n, restSec: n, note: z.string().max(120).nullable().optional(),
  id: z.string().max(24).optional(), block: z.number().int().min(0).max(40).optional(), stage: z.number().int().min(0).max(40).optional(),
  durationSec: n, countUnit: z.enum(["reps", "rounds"]).nullable().optional(), review: z.boolean().optional(),
  // D192: etiqueta visible del profe («Load Set») y tipo personalizado del que salió. Sin esto zod los descartaría.
  label: z.string().max(40).nullable().optional(), typeId: z.string().max(40).nullable().optional(),
});
const Shape = z.object({
  technique: z.string().max(30).optional(), setPlan: z.array(Set).max(MAX_PLAN_ROWS).nullable().optional(), group: z.string().max(2).nullable().optional(),
  groupKind: z.string().max(20).nullable().optional(), rounds: n, tempo: z.string().max(16).nullable().optional(), variant: z.string().max(80).nullable().optional(),
  unilateral: z.boolean().optional(), progression: z.string().max(160).nullable().optional(), emomSec: n,
  // D191: equipo y menor salto de carga (validado y normalizado por `validateDetail`).
  load: z.object({ equipment: z.string().max(20), incrementKg: z.number().nullable(), perSide: z.boolean().optional() }).nullable().optional(),
  // Ejercicios por tiempo (07/11/2026): actividad (cinta, bici, remo…) con sus valores; la duración sigue en `reps`. Sin esto zod
  // la descartaría en silencio y la cinta se guardaría como «1 × 10 min» sin velocidad ni inclinación. Rangos: `validateDetail`.
  activity: z.object({ profile: z.string().max(20), speedKmh: n, incline: n, level: n, distanceM: n, pace500Sec: n, cadenceRpm: n }).nullable().optional(),
}).nullable().optional();
/** Tipado como el detalle del dominio: `validateDetail` normaliza técnica, tipos de serie y rangos antes de guardar. */
export const DetailZ = Shape as unknown as z.ZodType<Partial<ExerciseDetail> | null | undefined> as z.ZodType<ExerciseDetail | null | undefined>;
