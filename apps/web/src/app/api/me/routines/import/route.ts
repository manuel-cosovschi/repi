// D162: la rutina que el alumno ya tiene, desde una foto, una captura, un PDF, una planilla o texto. Sólo vista previa:
// se guarda después, rutina por rutina, con POST /api/me/routines.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { previewRoutineImport } from "@/server/training/own-routines";

export const maxDuration = 120; // la lectura de una foto o un PDF puede tardar
const File = z.object({
  fileName: z.string().max(200), kind: z.enum(["text", "image", "pdf"]),
  text: z.string().max(400_000).optional(), dataUrl: z.string().max(4_200_000).optional(),
});
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  // Cada foto o PDF usa OpenAI: tope por hora para todos y diario por persona (como el historial, SEC-8).
  await limit("routine-import", 12, 3_600_000);
  await limit(`routine-import:${me}`, 20, 86_400_000);
  return previewRoutineImport(me, await body(req, File));
});
