// Derechos sobre los datos propios (F-PR-02, D75). V1 según el plan de lanzamiento: canal autenticado y procedimiento
// verificable. La exportación es inmediata y sólo incluye lo que la persona aportó o se registró sobre ella; nunca datos
// privados de otras personas (mensajes ajenos, notas del equipo). La eliminación queda como pedido registrado que REPI
// atiende con docs/PRIVACIDAD_OPERACION.md: no hay borrado automático hasta definir retención y responsables.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireAdmin } from "../commercial/services";
import { mySettings } from "../settings/services";

const {
  user, coachClient, gymMember, organization, gymLocation, legalAcceptance, consentGrant, workoutSession, setLog, checkin, painReport, injury,
  studentRequest, message, clubPost, mediaObject, privacyRequest,
} = schema;

export async function exportMyData(userId: string, now = new Date()) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  const sessions = await db.select().from(workoutSession).where(eq(workoutSession.userId, userId)).orderBy(desc(workoutSession.startedAt));
  const sets = sessions.length ? await db.select().from(setLog).where(inArray(setLog.sessionId, sessions.map((s) => s.id))) : [];
  const setsBySession = new Map<string, typeof sets>();
  for (const x of sets) setsBySession.set(x.sessionId, [...(setsBySession.get(x.sessionId) ?? []), x]);
  const coaches = await db.select({ status: coachClient.status, since: coachClient.createdAt, org: organization.name }).from(coachClient)
    .innerJoin(organization, eq(organization.id, coachClient.coachOrgId)).where(eq(coachClient.userId, userId));
  const gyms = await db.select({ status: gymMember.status, since: gymMember.createdAt, org: organization.name, location: gymLocation.name }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId)).where(eq(gymMember.userId, userId));
  const data = {
    generatedAt: now.toISOString(),
    notice: "Copia de tus datos en REPI. Incluye lo que cargaste y lo que se registró sobre vos. Los videos e imágenes se listan sin el archivo: pedilos desde la app o a REPI.",
    account: { name: u.name, email: u.email, emailVerified: u.emailVerified, birthDate: u.birthDate, createdAt: u.createdAt, twoFactorEnabled: !!u.twoFactorEnabled },
    relations: { coaches, gyms },
    settings: await mySettings(userId), // unidad de peso y lo que busca entrenando (D139)
    legalAcceptances: await db.select({ document: legalAcceptance.document, version: legalAcceptance.version, acceptedAt: legalAcceptance.acceptedAt }).from(legalAcceptance).where(eq(legalAcceptance.userId, userId)),
    sharing: await db.select({ scope: consentGrant.scope, item: consentGrant.item, status: consentGrant.status, grantedAt: consentGrant.grantedAt, revokedAt: consentGrant.revokedAt }).from(consentGrant).where(eq(consentGrant.userId, userId)),
    training: sessions.map((s) => ({
      day: s.dayName, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, activeMinutes: Math.round(s.activeMs / 60_000), rpe: s.rpe, note: s.note,
      sets: (setsBySession.get(s.id) ?? []).sort((a, b) => a.setIndex - b.setIndex).map((x) => ({ set: x.setIndex + 1, weightKg: x.weightKg == null ? null : Number(x.weightKg), reps: x.reps, rir: x.rir, feel: x.feel, completedAt: x.completedAt })),
    })),
    checkins: await db.select({ date: checkin.date, energy: checkin.energy, sleep: checkin.sleep, mood: checkin.mood }).from(checkin).where(eq(checkin.userId, userId)),
    pains: await db.select({ zone: painReport.zone, level: painReport.level, context: painReport.context, exercise: painReport.exerciseName, note: painReport.note, createdAt: painReport.createdAt }).from(painReport).where(eq(painReport.userId, userId)),
    injuries: await db.select({ zone: injury.zone, detail: injury.detail, status: injury.status, since: injury.since, createdAt: injury.createdAt, deletedAt: injury.deletedAt }).from(injury).where(eq(injury.userId, userId)),
    requests: await db.select({ kind: studentRequest.kind, text: studentRequest.text, status: studentRequest.status, createdAt: studentRequest.createdAt }).from(studentRequest).where(eq(studentRequest.userId, userId)),
    messagesSent: await db.select({ body: message.body, createdAt: message.createdAt }).from(message).where(eq(message.senderUserId, userId)),
    clubPosts: await db.select({ kind: clubPost.kind, text: clubPost.text, status: clubPost.status, createdAt: clubPost.createdAt }).from(clubPost).where(eq(clubPost.userId, userId)),
    files: await db.select({ purpose: mediaObject.purpose, mime: mediaObject.mime, sizeBytes: mediaObject.sizeBytes, createdAt: mediaObject.createdAt, deletedAt: mediaObject.deletedAt }).from(mediaObject).where(eq(mediaObject.ownerUserId, userId)),
    privacyRequests: await db.select({ kind: privacyRequest.kind, status: privacyRequest.status, createdAt: privacyRequest.createdAt, resolvedAt: privacyRequest.resolvedAt }).from(privacyRequest).where(eq(privacyRequest.userId, userId)),
  };
  await audit(db, { actorUserId: userId, action: "privacy.export", resourceType: "user", resourceId: userId });
  return data;
}

/** Pedido de eliminación. Idempotente: si ya hay uno pendiente, devuelve ese. No corta el acceso ni borra nada todavía. */
export async function requestDeletion(userId: string, note?: string | null) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  const [open] = await db.select().from(privacyRequest).where(and(eq(privacyRequest.userId, userId), eq(privacyRequest.status, "pending")));
  if (open) return { id: open.id, status: open.status, createdAt: open.createdAt, already: true };
  const [r] = await db.insert(privacyRequest).values({ userId, emailAtRequest: u.email, kind: "delete", note: note?.trim().slice(0, 500) || null }).returning();
  await audit(db, { actorUserId: userId, action: "privacy.delete_requested", resourceType: "privacy_request", resourceId: r.id });
  return { id: r.id, status: r.status, createdAt: r.createdAt, already: false };
}

export async function cancelDeletion(userId: string, id: string) {
  const [r] = await db.update(privacyRequest).set({ status: "cancelled", resolvedAt: new Date() })
    .where(and(eq(privacyRequest.id, id), eq(privacyRequest.userId, userId), eq(privacyRequest.status, "pending"))).returning();
  if (!r) throw new AccessError("not_found", "No encontramos ese pedido.", 404);
  await audit(db, { actorUserId: userId, action: "privacy.delete_cancelled", resourceType: "privacy_request", resourceId: id });
  return { ok: true };
}

export const myPrivacyRequests = (userId: string) =>
  db.select({ id: privacyRequest.id, kind: privacyRequest.kind, status: privacyRequest.status, createdAt: privacyRequest.createdAt, resolvedAt: privacyRequest.resolvedAt, resolution: privacyRequest.resolution })
    .from(privacyRequest).where(eq(privacyRequest.userId, userId)).orderBy(desc(privacyRequest.createdAt));

// ── REPI Admin ──────────────────────────────────────────────────────────────
export async function listPrivacyRequests(adminId: string) {
  await requireAdmin(adminId);
  return db.select().from(privacyRequest).orderBy(desc(privacyRequest.createdAt)).limit(200);
}

/** Admin registra el resultado tras ejecutar el procedimiento manual. No borra datos por sí mismo. */
export async function resolvePrivacyRequest(adminId: string, id: string, p: { status: "done" | "rejected"; resolution: string }) {
  await requireAdmin(adminId);
  if (!p.resolution?.trim()) throw new AccessError("invalid", "Escribí qué se hizo (o por qué no se hizo).");
  const [r] = await db.update(privacyRequest).set({ status: p.status, resolution: p.resolution.trim().slice(0, 500), resolvedBy: adminId, resolvedAt: new Date() })
    .where(and(eq(privacyRequest.id, id), eq(privacyRequest.status, "pending"))).returning();
  if (!r) throw new AccessError("not_found", "El pedido no existe o ya se resolvió.", 404);
  await audit(db, { actorUserId: adminId, action: `privacy.delete_${p.status}`, resourceType: "privacy_request", resourceId: id });
  return r;
}
