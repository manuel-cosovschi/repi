// Historial anterior a REPI (D132): vista previa de un archivo (planilla, texto, foto o PDF), confirmar, quitar y ver la evolución.
import { z } from "zod";
import { IMPORT_MAX_TEXT_LENGTH } from "@repi/domain";
import { body, handle, limit, recordDenied, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import { logError } from "@/server/log";
import type { HistoryImportEvent, HistoryImportProgress } from "@/lib/history-import-stream";
import * as hi from "@/server/training/history-import";

export const maxDuration = 300; // la lectura con IA de una foto o un PDF puede tardar
type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

export const GET = handle<Ctx>(async () => hi.myHistoryImports(await sessionUserId()));

const File = z.object({
  fileName: z.string().max(200), kind: z.enum(["text", "image", "pdf"]),
  text: z.string().max(IMPORT_MAX_TEXT_LENGTH, "El historial supera los 400.000 caracteres. Dividilo en partes; no se cargó ningún dato.").optional(), dataUrl: z.string().max(4_200_000).optional(),
}).superRefine((file, ctx) => {
  if (file.kind === "text" && !file.text?.trim()) ctx.addIssue({ code: "custom", path: ["text"], message: "El archivo está vacío." });
  if (file.kind !== "text" && !/^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/.test(file.dataUrl ?? "")) ctx.addIssue({ code: "custom", path: ["dataUrl"], message: "Subí una foto, un PDF o una planilla." });
});
const Confirm = z.object({ mode: z.enum(["all", "new_only"]).optional() });
export const POST = handle<Ctx>(async (req, { params }) => {
  const [a, b] = (await params).path ?? [];
  const me = await sessionUserId();
  // SEC-8 (QA 29/10): cada lectura usa OpenAI; además del tope por hora, uno diario por persona.
  if (!a) {
    await limit("history-import", 12, 3_600_000);
    await limit(`history-import:${me}`, 30, 86_400_000);
    const file = await body(req, File);
    if (!req.headers.get("accept")?.includes("application/x-ndjson")) return hi.previewHistoryImport(me, file);
    // Sesión, CSRF, límites y validación ya pasaron antes de abrir el stream.
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: HistoryImportEvent<Awaited<ReturnType<typeof hi.previewHistoryImport>>>) => {
          if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        void (async () => {
          try {
            const data = await hi.previewHistoryImport(me, file, new Date(), (progress: HistoryImportProgress) => emit({ type: "progress", progress }));
            emit({ type: "result", data });
          } catch (e) {
            if (e instanceof AccessError) {
              await recordDenied(req, e);
              emit({ type: "error", error: e.message, code: e.code });
            } else {
              logError("history_import.stream", e, req);
              emit({ type: "error", error: "No pudimos terminar la lectura. Probá de nuevo.", code: "error" });
            }
          } finally { if (!cancelled) { cancelled = true; controller.close(); } }
        })();
      },
      cancel() { cancelled = true; },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
  }
  // D182: si parte ya estaba importado, la persona elige «sólo lo nuevo» o «todo».
  if (b === "confirm") return hi.confirmHistoryImport(me, a.slice(0, 64), (await body(req, Confirm)).mode);
  if (b === "remove") return hi.removeHistoryImport(me, a.slice(0, 64));
  throw NF();
});
