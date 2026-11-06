// Fotos de progreso privadas (PP1, D200). Registro visual de la propia persona, sin IA, sin análisis corporal, sin
// reconocimiento facial ni biometría, y sin enviar nada a proveedores externos. Garantías (requisito bloqueante):
// - Lectura sólo del dueño: cada consulta filtra por user_id y un id ajeno responde 404 (no se revela si existe). Ni coach,
//   ni sala, ni dueño o gerente, ni otros socios, ni REPI Admin tienen una ruta que las lea. `authorizeVideo` (/api/media)
//   también las niega a cualquiera que no sea su dueño, y no se pueden adjuntar a pedidos ni tareas (sólo «request_video»).
// - Sin URLs públicas: el archivo vive en el bucket privado con una clave no adivinable y se entrega desde el servidor con
//   la sesión de la persona, sin caché compartida (`private, no-store`). No hay miniaturas públicas.
// - Al subir: tipo real por contenido (no el declarado), tamaño, dimensiones y metadatos quitados (EXIF/GPS, XMP, IPTC,
//   comentarios). Se confirma recién después de verificar que el archivo quedó guardado con el tamaño esperado.
// - Al borrar: primero se quita la referencia (la foto deja de verse) y después el archivo; si Storage falla, el archivo
//   queda sin referencia y la purga diaria lo reintenta (D196 lee las referencias del catálogo, incluida progress_photo).
// - Menores de 18: no disponible en 1.0 (el consentimiento vigente del adulto responsable no contempla fotos corporales).
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { PROGRESS_PHOTO_LIMITS, imageInfo, isIsoDay, localDate, stripImageMetadata, type ProgressPose } from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { AccessError, audit } from "../access/util";
import { deleteObject, probeObject, putObject } from "../storage";
import { isMinor } from "./body";

const { progressPhoto, mediaObject } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos esa foto.", 404);
const BAD_FILE = () => new AccessError("invalid_file", "La foto tiene que ser JPG, PNG o WebP de hasta 3 MB.");
const POSES = new Set<ProgressPose>(["front", "side", "back", "other"]);

function requireOn() {
  if (!featureOn("progress_photos")) throw new AccessError("not_found", "No encontrado.", 404);
}
const view = (r: { id: string; takenOn: string; pose: string | null; width: number; height: number; createdAt: Date }) =>
  ({ id: r.id, day: r.takenOn, pose: r.pose as ProgressPose | null, width: r.width, height: r.height, createdAt: r.createdAt.toISOString() });

export async function uploadProgressPhoto(userId: string, p: { bytes: Uint8Array; mime: string; day: string; pose?: string | null }, now = new Date()) {
  requireOn();
  if (await isMinor(userId, now)) throw new AccessError("minor_restricted", "Las fotos de progreso no están disponibles para menores de 18 años.", 403);
  if (!isIsoDay(p.day) || p.day > localDate(new Date(now.getTime() + 86_400_000)) || p.day < "1990-01-01") throw new AccessError("invalid", "Elegí una fecha válida.");
  const pose = p.pose ? (POSES.has(p.pose as ProgressPose) ? (p.pose as ProgressPose) : null) : null;
  if (p.pose && !pose) throw new AccessError("invalid", "Categoría no válida.");
  if (!p.bytes.byteLength || p.bytes.byteLength > PROGRESS_PHOTO_LIMITS.maxBytes) throw BAD_FILE();
  const info = imageInfo(p.bytes);
  if (!info || info.mime !== p.mime) throw BAD_FILE(); // tipo real distinto del declarado: se rechaza
  const L = PROGRESS_PHOTO_LIMITS;
  if (Math.min(info.width, info.height) < L.minSide || Math.max(info.width, info.height) > L.maxSide) throw new AccessError("invalid_file", `La foto tiene que medir entre ${L.minSide} y ${L.maxSide} px por lado.`);
  let clean: Uint8Array;
  try { clean = stripImageMetadata(p.bytes); } catch { throw BAD_FILE(); }
  const after = imageInfo(clean);
  if (!after || after.width !== info.width || after.height !== info.height) throw BAD_FILE();

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(progressPhoto).where(eq(progressPhoto.userId, userId));
  if (total >= L.maxPerUser) throw new AccessError("limit", `Llegaste al máximo de ${L.maxPerUser} fotos. Borrá alguna para subir otra.`, 409);
  const [{ today }] = await db.select({ today: sql<number>`count(*)::int` }).from(progressPhoto).where(and(eq(progressPhoto.userId, userId), gte(progressPhoto.createdAt, new Date(now.getTime() - 86_400_000))));
  if (today >= L.maxPerDay) throw new AccessError("rate_limited", "Llegaste al límite de fotos por día. Probá mañana.", 429);

  const id = randomUUID(), mediaId = randomUUID();
  const key = `progress/${userId.replace(/[^a-z0-9]/gi, "")}/${randomUUID()}`; // no deriva de la foto ni de la fecha
  await putObject(key, clean);
  const probe = await probeObject(key).catch(() => null);
  if (!probe || probe.size !== clean.byteLength) {
    await deleteObject(key).catch(() => {});
    throw new AccessError("upload_failed", "No pudimos guardar la foto. Probá de nuevo.", 503);
  }
  try {
    await db.transaction(async (tx) => {
      await tx.insert(mediaObject).values({ id: mediaId, ownerUserId: userId, orgId: null, purpose: "progress_photo", storageKey: key, mime: info.mime, sizeBytes: clean.byteLength });
      await tx.insert(progressPhoto).values({ id, userId, mediaId, takenOn: p.day, pose, width: info.width, height: info.height });
      await audit(tx, { actorUserId: userId, action: "progress_photo.created", resourceType: "progress_photo", resourceId: id });
    });
  } catch (e) {
    await deleteObject(key).catch(() => {}); // sin fila no queda archivo suelto (y si esto falla, no tiene media_object: nadie lo sirve)
    throw e;
  }
  const [row] = await db.select().from(progressPhoto).where(eq(progressPhoto.id, id));
  return { photo: view(row), strippedBytes: p.bytes.byteLength - clean.byteLength };
}

export async function myProgressPhotos(userId: string) {
  requireOn();
  const rows = await db.select().from(progressPhoto).innerJoin(mediaObject, eq(mediaObject.id, progressPhoto.mediaId))
    .where(and(eq(progressPhoto.userId, userId), eq(mediaObject.ownerUserId, userId), isNull(mediaObject.deletedAt)))
    .orderBy(desc(progressPhoto.takenOn), desc(progressPhoto.createdAt)).limit(PROGRESS_PHOTO_LIMITS.maxPerUser);
  return { photos: rows.map((r) => view(r.progress_photo)), limit: PROGRESS_PHOTO_LIMITS.maxPerUser, canUpload: !(await isMinor(userId)) };
}

/** Archivo de una foto propia (para el endpoint que lo entrega). Ajena o inexistente: 404. */
export async function myPhotoFile(userId: string, id: string) {
  requireOn();
  const [r] = await db.select({ key: mediaObject.storageKey, mime: mediaObject.mime }).from(progressPhoto).innerJoin(mediaObject, eq(mediaObject.id, progressPhoto.mediaId))
    .where(and(eq(progressPhoto.id, id), eq(progressPhoto.userId, userId), eq(mediaObject.ownerUserId, userId), eq(mediaObject.purpose, "progress_photo"), isNull(mediaObject.deletedAt)));
  if (!r) throw NOT_FOUND();
  return r;
}

export async function updateProgressPhoto(userId: string, id: string, p: { day?: string; pose?: string | null }, now = new Date()) {
  requireOn();
  if (p.day !== undefined && (!isIsoDay(p.day) || p.day > localDate(new Date(now.getTime() + 86_400_000)))) throw new AccessError("invalid", "Elegí una fecha válida.");
  if (p.pose != null && !POSES.has(p.pose as ProgressPose)) throw new AccessError("invalid", "Categoría no válida.");
  const set: Partial<typeof progressPhoto.$inferInsert> = {};
  if (p.day !== undefined) set.takenOn = p.day;
  if (p.pose !== undefined) set.pose = (p.pose as ProgressPose | null) ?? null;
  if (!Object.keys(set).length) throw new AccessError("invalid", "Nada para cambiar.");
  const [row] = await db.update(progressPhoto).set(set).where(and(eq(progressPhoto.id, id), eq(progressPhoto.userId, userId))).returning();
  if (!row) throw NOT_FOUND();
  return { photo: view(row) };
}

/** Borra la foto propia: la referencia en una transacción y después el archivo (con reintento por la purga si falla). */
export async function deleteProgressPhoto(userId: string, id: string, now = new Date()) {
  requireOn();
  const m = await db.transaction(async (tx) => {
    const [row] = await tx.delete(progressPhoto).where(and(eq(progressPhoto.id, id), eq(progressPhoto.userId, userId))).returning();
    if (!row) throw NOT_FOUND();
    const [media] = await tx.select().from(mediaObject).where(and(eq(mediaObject.id, row.mediaId), eq(mediaObject.ownerUserId, userId)));
    await audit(tx, { actorUserId: userId, action: "progress_photo.deleted", resourceType: "progress_photo", resourceId: id });
    return media ?? null;
  });
  if (!m || m.deletedAt) return { ok: true, file: "deleted" as const };
  try {
    await deleteObject(m.storageKey);
    await db.update(mediaObject).set({ deletedAt: now }).where(eq(mediaObject.id, m.id));
    return { ok: true, file: "deleted" as const };
  } catch {
    // La foto ya no se ve (sin referencia y nadie más puede leerla); la purga diaria borra el archivo.
    return { ok: true, file: "pending" as const };
  }
}
