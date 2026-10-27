import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { beginUpload } from "@/server/uploads";

// Paso 1 de la subida directa (D71): devuelve la URL firmada, o upload: null si el entorno sube por /api.
export const POST = handle(async (req) => {
  const uid = await sessionUserId();
  await limit("upload-begin", 20);
  const p = await body(req, z.object({ purpose: z.enum(["request_video", "attempt_video"]), orgId: z.string().max(64).nullable().optional(), mime: z.string().max(60), size: z.number().int().positive() }));
  return beginUpload(uid, p);
});
