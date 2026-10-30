// Subida directa de videos al almacenamiento (D71). Vercel limita el cuerpo de las funciones a 4,5 MB: los videos
// (60 y 80 MB) van del navegador al bucket con una URL firmada y el servidor sólo confirma.
// 1) beginUpload valida tipo declarado, tamaño y permiso, y crea una intención que vence en 2 h.
// 2) El navegador sube a esa URL (un solo uso, sólo esa clave).
// 3) completeUpload comprueba que el archivo exista, su tamaño real y su firma; recién ahí crea el media_object.
// Sin almacenamiento con URL firmada (disco local) devuelve upload: null y el cliente usa la subida por /api.
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { ATTEMPT_VIDEO_LIMITS, VIDEO_LIMITS, sniff } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "./access/util";
import { memberOf } from "./community/services";
import { requireMediaManager } from "./training/exercise-media";
import { deleteObject, directUploadTarget, probeObject } from "./storage";

const { uploadIntent, mediaObject } = schema;
export type UploadPurpose = "request_video" | "attempt_video" | "exercise_video";
const RULES: Record<UploadPurpose, { limits: { maxBytes: number; mimes: readonly string[] }; msg: string }> = {
  request_video: { limits: VIDEO_LIMITS, msg: "El video tiene que ser MP4, MOV o WebM de hasta 60 MB." },
  attempt_video: { limits: ATTEMPT_VIDEO_LIMITS, msg: "El video tiene que ser MP4, MOV o WebM de hasta 80 MB." },
  exercise_video: { limits: ATTEMPT_VIDEO_LIMITS, msg: "El video tiene que ser MP4, MOV o WebM de hasta 80 MB." }, // D164
};
const INTENT_TTL_MS = 2 * 3_600_000;
const iso = (m: string) => (m === "video/quicktime" ? "video/mp4" : m); // mp4 y mov comparten contenedor
const clean = (s: string) => s.replace(/[^a-z0-9]/gi, "");

export async function beginUpload(userId: string, p: { purpose: UploadPurpose; orgId?: string | null; mime: string; size: number }) {
  const rule = RULES[p.purpose];
  if (!rule) throw new AccessError("invalid", "Tipo de archivo no admitido.");
  if (!rule.limits.mimes.includes(p.mime) || !(p.size > 0) || p.size > rule.limits.maxBytes) throw new AccessError("invalid_file", rule.msg);
  let key: string;
  const id = randomUUID();
  if (p.purpose === "attempt_video") {
    if (!p.orgId || !(await memberOf(userId, p.orgId))) throw new AccessError("not_found", "No encontrado.", 404);
    key = `attempt/${clean(p.orgId)}/${id}`;
  } else if (p.purpose === "exercise_video") {
    if (!p.orgId) throw new AccessError("not_found", "No encontrado.", 404);
    await requireMediaManager(userId, p.orgId);
    key = `exercise/${clean(p.orgId)}/${id}`;
  } else key = `request-video/${clean(userId)}/${id}`;
  const upload = await directUploadTarget(key);
  if (!upload) return { id: null, upload: null };
  await db.insert(uploadIntent).values({ id, ownerUserId: userId, purpose: p.purpose, orgId: p.orgId ?? null, storageKey: key, mime: p.mime, sizeBytes: p.size, expiresAt: new Date(Date.now() + INTENT_TTL_MS) });
  return { id, upload: { ...upload, headers: { "content-type": p.mime, "x-upsert": "false" } } };
}

export async function completeUpload(userId: string, id: string, now = new Date()) {
  const [it] = await db.select().from(uploadIntent).where(and(eq(uploadIntent.id, id), eq(uploadIntent.ownerUserId, userId)));
  if (!it) throw new AccessError("not_found", "No encontrado.", 404);
  const discard = async () => {
    // Si Storage falla, conservar la referencia y vencerla para que la purga pueda reintentar.
    await db.update(uploadIntent).set({ expiresAt: now }).where(eq(uploadIntent.id, id));
    try { await deleteObject(it.storageKey); } catch { return; }
    await db.delete(uploadIntent).where(eq(uploadIntent.id, id));
  };
  const rule = RULES[it.purpose as UploadPurpose];
  if (it.expiresAt <= now) { await discard(); throw new AccessError("expired", "La subida venció. Probá de nuevo.", 410); }
  const o = await probeObject(it.storageKey);
  if (!o) throw new AccessError("upload_missing", "El video no terminó de subir. Probá de nuevo.", 409);
  const real = sniff(o.head);
  if (!o.size || o.size > rule.limits.maxBytes || !real || iso(real) !== iso(it.mime)) { await discard(); throw new AccessError("invalid_file", rule.msg); }
  await db.transaction(async (tx) => {
    await tx.insert(mediaObject).values({ id: it.id, ownerUserId: userId, orgId: it.orgId, purpose: it.purpose, storageKey: it.storageKey, mime: it.mime, sizeBytes: o.size });
    await tx.delete(uploadIntent).where(eq(uploadIntent.id, id));
  });
  return { id: it.id };
}

/** Intenciones vencidas sin confirmar: se borra el archivo (si llegó) y la intención. Lo llama el job diario de archivos. */
export async function purgeUploadIntents(now = new Date()) {
  const old = await db.select().from(uploadIntent).where(lt(uploadIntent.expiresAt, now)).limit(500);
  let removed = 0;
  for (const it of old) {
    try { await deleteObject(it.storageKey); } catch { continue; }
    await db.delete(uploadIntent).where(eq(uploadIntent.id, it.id));
    removed++;
  }
  return removed;
}
