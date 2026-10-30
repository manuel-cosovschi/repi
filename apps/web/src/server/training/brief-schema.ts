// D155: datos que carga el profe para que REPI proponga un programa (validación de la API).
import { z } from "zod";

export const BriefZ = z.object({
  goal: z.enum(["strength", "muscle", "fat_loss", "health", "sport", "habit"]).nullable().optional(),
  daysPerWeek: z.number().int().min(1).max(6),
  minutes: z.number().int().min(15).max(180).nullable().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  likes: z.string().max(300).optional(),
  avoid: z.string().max(300).optional(),
  limitations: z.string().max(500).optional(),
  notes: z.string().max(300).optional(),
  // D161: cambio puntual sobre la propuesta actual (con lo editado a mano), sin rearmarla.
  change: z.string().trim().min(3).max(300).optional(),
  current: z.object({
    name: z.string().max(120), weeks: z.number().int(), note: z.string().max(500),
    days: z.array(z.object({ name: z.string().max(60), exercises: z.array(z.object({
      exerciseId: z.string().max(64), name: z.string().max(120), sets: z.number().int(), reps: z.string().max(20), rir: z.number().int().nullable(),
      restSec: z.number().int(), note: z.string().max(120).nullable().optional(),
    })).max(30) })).min(1).max(6),
  }).optional(),
});
