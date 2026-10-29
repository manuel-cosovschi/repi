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
});
