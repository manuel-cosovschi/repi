// SI2: el coach importa un programa que ya tiene (foto, PDF, planilla o texto). Sólo vista previa con su biblioteca; se crea
// como programa nuevo sin asignar con POST /api/coach/:orgId/programs ({ doc, imported }).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";
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
  const lib = await tr.listLibrary(me, orgId); // controla que sea el coach de este espacio
  const beforeAi = async () => { await limit("program-import", 30, 3_600_000); await limit(`program-import:${me}`, 30, 86_400_000); };
  return programImportPreview(me, orgId, lib, await body(req, File), beforeAi);
});
