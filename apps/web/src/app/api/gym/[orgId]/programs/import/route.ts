// SI2: quien arma programas en el gimnasio (`program.edit`) importa un programa que ya existe al borrador del programa de un
// socio. Sólo vista previa con la biblioteca del gimnasio: el editor lo muestra y se guarda recién con «Guardar revisión»
// (versión nueva con su motivo). No toca programas de otros socios.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as gym from "@/server/gym/services";
import { programImportPreview } from "@/server/training/program-import";

export const maxDuration = 120;
const File = z.object({
  fileName: z.string().max(200), kind: z.enum(["text", "image", "pdf"]), sheet: z.boolean().optional(),
  text: z.string().max(400_000).optional(), dataUrl: z.string().max(4_200_000).optional(),
});
export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const me = await sessionUserId();
  const { orgId } = await params;
  await limit(`program-import-read:${me}`, 60, 3_600_000);
  const lib = await gym.gymLibrary(me, orgId); // controla `program.edit` en este gimnasio
  const beforeAi = async () => { await limit("program-import", 30, 3_600_000); await limit(`program-import:${me}`, 30, 86_400_000); };
  return programImportPreview(me, orgId, lib, await body(req, File), beforeAi);
});
