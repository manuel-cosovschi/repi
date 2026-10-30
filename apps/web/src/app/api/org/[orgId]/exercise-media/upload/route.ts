// D164: subida por /api del video de un ejercicio cuando el entorno no ofrece URL firmada (disco local en desarrollo).
// En producción el video va directo al almacenamiento (/api/uploads); el cuerpo de una función no pasa de 4,5 MB.
import { randomUUID } from "node:crypto";
import { ATTEMPT_VIDEO_LIMITS, sniff } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "@/server/access/util";
import { handle, limit, sessionUserId } from "@/server/access/http";
import { putObject } from "@/server/storage";
import { requireMediaManager } from "@/server/training/exercise-media";

export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const me = await sessionUserId();
  const orgId = (await params).orgId;
  await requireMediaManager(me, orgId);
  await limit("exercise-video-upload", 10);
  const f = (await req.formData()).get("file");
  if (!(f instanceof File) || f.size > ATTEMPT_VIDEO_LIMITS.maxBytes || !(ATTEMPT_VIDEO_LIMITS.mimes as readonly string[]).includes(f.type)) throw new AccessError("invalid_file", "El video tiene que ser MP4, MOV o WebM de hasta 80 MB.");
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (!sniff(bytes.slice(0, 64))) throw new AccessError("invalid_file", "El video tiene que ser MP4, MOV o WebM de hasta 80 MB.");
  const id = randomUUID();
  const key = `exercise/${orgId.replace(/[^a-z0-9]/gi, "")}/${id}`;
  await putObject(key, bytes);
  await db.insert(schema.mediaObject).values({ id, ownerUserId: me, orgId, purpose: "exercise_video", storageKey: key, mime: f.type, sizeBytes: bytes.byteLength });
  return { id };
});
