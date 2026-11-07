// D162 → SI2: la rutina que el alumno ya tiene, desde una foto, una captura, un PDF, una planilla o texto. Sólo vista previa:
// se guarda después, todo junto, con POST /api/me/routines/import/save.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { previewRoutineImport } from "@/server/training/own-routines";

export const maxDuration = 120; // la lectura de una foto o un PDF puede tardar
const File = z.object({
  fileName: z.string().max(200), kind: z.enum(["text", "image", "pdf"]), sheet: z.boolean().optional(),
  text: z.string().max(400_000).optional(), dataUrl: z.string().max(4_200_000).optional(),
});
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`routine-import-read:${me}`, 60, 3_600_000); // lecturas sin IA (planillas y texto): sin costo, con un tope sano
  // Sólo si hace falta la IA (fotos, PDF, texto difícil): tope por hora y diario por persona (como el historial, SEC-8).
  const beforeAi = async () => { await limit("routine-import", 30, 3_600_000); await limit(`routine-import:${me}`, 20, 86_400_000); };
  return previewRoutineImport(me, await body(req, File), beforeAi);
});
