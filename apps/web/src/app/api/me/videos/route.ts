import { AccessError } from "@/server/access/util";
import { handle, limit, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";
import { VIDEO_LIMITS } from "@repi/domain";

// Subida de video de técnica (privado). El tamaño se controla antes de leer el cuerpo.
export const POST = handle(async (req) => {
  const uid = await sessionUserId();
  await limit("video-upload", 10);
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > VIDEO_LIMITS.maxBytes + 1024 * 1024) throw new AccessError("invalid_file", "El video tiene que ser MP4, MOV o WebM de hasta 60 MB.", 413);
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File)) throw new AccessError("invalid_file", "Elegí un video.");
  return fu.uploadRequestVideo(uid, { mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
});
