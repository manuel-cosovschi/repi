// Historial anterior a REPI (D132): vista previa de un archivo (planilla, texto, foto o PDF), confirmar, quitar y ver la evolución.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as hi from "@/server/training/history-import";

export const maxDuration = 120; // la lectura con IA de una foto o un PDF puede tardar
type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

export const GET = handle<Ctx>(async () => hi.myHistoryImports(await sessionUserId()));

const File = z.object({
  fileName: z.string().max(200), kind: z.enum(["text", "image", "pdf"]),
  text: z.string().max(400_000).optional(), dataUrl: z.string().max(4_200_000).optional(),
});
export const POST = handle<Ctx>(async (req, { params }) => {
  const [a, b] = (await params).path ?? [];
  const me = await sessionUserId();
  // SEC-8 (QA 29/10): cada lectura usa OpenAI; además del tope por hora, uno diario por persona.
  if (!a) { await limit("history-import", 12, 3_600_000); await limit(`history-import:${me}`, 30, 86_400_000); return hi.previewHistoryImport(me, await body(req, File)); }
  if (b === "confirm") return hi.confirmHistoryImport(me, a.slice(0, 64));
  if (b === "remove") return hi.removeHistoryImport(me, a.slice(0, 64));
  throw NF();
});
