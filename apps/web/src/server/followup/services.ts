// Seguimiento y consentimiento (Etapa 4). Salud = dato sensible: el coach lo ve sólo con grant 'health'
// activo para esa relación (o un reporte compartido explícitamente). Toda lectura sensible queda en el historial del alumno.
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  ACCESS_ITEMS, ACCESS_REQUEST_TTL_DAYS, ORPHAN_VIDEO_HOURS, VIDEO_RETENTION_DAYS, accessRetryAt, INJURY_ZONES, PAIN_ZONES, coachSeesPain, isAccessItem, localDate, resolveGrants,
  gymCan, scale10, scale5, videoOk, type AccessItem, type InjuryStatus, type RequestKind, TERMS_VERSION, CONSENT_CATALOG,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit, type Tx } from "../access/util";
import { minorWithoutGuardian } from "../access/services";
import { requireCoach } from "../training/services";
import { deleteObject, putObject } from "../storage";
import { authorizeCommunityMedia } from "../community/services";

const { user, organization, staffMembership, coachClient, consentGrant, invitation, checkin, painReport, injury, mediaObject,
  studentRequest, accessRequest, dataAccessLog } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

// ── Utilidades ──────────────────────────────────────────────────────────────
async function myRelation(userId: string) {
  const [r] = await db.select({ rel: coachClient, org: organization }).from(coachClient).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(and(eq(coachClient.userId, userId), eq(coachClient.status, "active"))).orderBy(coachClient.createdAt).limit(1);
  if (!r) return null;
  const [c] = await db.select({ name: user.name }).from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
    .where(and(eq(staffMembership.orgId, r.org.id), eq(staffMembership.role, "coach_owner"), eq(staffMembership.status, "active")));
  return { ...r, coachName: c?.name ?? r.org.name };
}
const activeItems = async (relationId: string, tx: Tx | typeof db = db) =>
  (await tx.select({ item: consentGrant.item }).from(consentGrant).where(and(eq(consentGrant.relationId, relationId), eq(consentGrant.status, "active")))).map((g) => g.item);
const log = (tx: Tx | typeof db, v: typeof dataAccessLog.$inferInsert) => tx.insert(dataAccessLog).values(v);

async function coachRelation(actorId: string, orgId: string, relId: string) {
  await requireCoach(actorId, orgId);
  const [r] = await db.select({ rel: coachClient, name: user.name }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(coachClient.id, relId), eq(coachClient.coachOrgId, orgId)));
  if (!r) throw NOT_FOUND();
  return r;
}

// ── Alumno: check-in, molestias, lesiones ───────────────────────────────────
export async function saveCheckin(userId: string, p: { energy: number; sleep: number; mood: number }, now = new Date()) {
  if (!scale5(p.energy) || !scale5(p.sleep) || !scale5(p.mood)) throw new AccessError("invalid", "Completá los datos marcados.");
  const date = localDate(now);
  const [row] = await db.insert(checkin).values({ userId, date, ...p })
    .onConflictDoUpdate({ target: [checkin.userId, checkin.date], set: { energy: p.energy, sleep: p.sleep, mood: p.mood } }).returning();
  return row;
}
export async function todayCheckin(userId: string, now = new Date()) {
  const [row] = await db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, localDate(now))));
  return row ?? null;
}

export async function reportPain(userId: string, p: { zone: string; level: number; context: "now" | "after" | "out"; exerciseName?: string | null; sessionId?: string | null; note?: string | null; shareThis?: boolean }) {
  if (!(PAIN_ZONES as readonly string[]).includes(p.zone) || !scale10(p.level) || !["now", "after", "out"].includes(p.context)) throw new AccessError("invalid", "Completá los datos marcados.");
  const rel = await myRelation(userId);
  if (p.shareThis && !rel) throw new AccessError("invalid", "No tenés coach con quien compartirla.");
  if (p.shareThis && await minorWithoutGuardian(userId)) throw new AccessError("minor", "Los datos de salud se comparten cuando tu adulto responsable lo autorice.", 403);
  const [row] = await db.insert(painReport).values({
    userId, zone: p.zone, level: p.level, context: p.context, exerciseName: p.exerciseName?.slice(0, 120) || null, sessionId: p.sessionId ?? null,
    note: p.note?.trim().slice(0, 500) || null, sharedWithRelationId: p.shareThis && rel ? rel.rel.id : null,
  }).returning();
  const healthShared = rel ? (await activeItems(rel.rel.id)).includes("health") : false;
  return { id: row.id, visibleToCoach: !!rel && coachSeesPain(row, rel.rel.id, healthShared), coachName: rel?.coachName ?? null };
}

const INJ_STATUS: InjuryStatus[] = ["active", "monitoring", "resolved"];
export async function addInjury(userId: string, p: { zone: string; status: InjuryStatus; detail?: string | null; since?: string | null }) {
  if (!(INJURY_ZONES as readonly string[]).includes(p.zone) || !INJ_STATUS.includes(p.status)) throw new AccessError("invalid", "Completá los datos marcados.");
  const [row] = await db.insert(injury).values({ userId, zone: p.zone, status: p.status, detail: p.detail?.trim().slice(0, 300) || null, since: p.since?.slice(0, 40) || null }).returning();
  return row;
}
export async function updateInjury(userId: string, id: string, p: { status?: InjuryStatus; delete?: boolean }) {
  const [row] = await db.select().from(injury).where(and(eq(injury.id, id), eq(injury.userId, userId), isNull(injury.deletedAt)));
  if (!row) throw NOT_FOUND();
  if (p.delete) { await db.update(injury).set({ deletedAt: new Date() }).where(eq(injury.id, id)); return { deleted: true }; }
  if (!p.status || !INJ_STATUS.includes(p.status)) throw new AccessError("invalid", "Estado inválido.");
  await db.update(injury).set({ status: p.status, updatedAt: new Date() }).where(eq(injury.id, id));
  return { status: p.status };
}
export const myInjuries = (userId: string) =>
  db.select().from(injury).where(and(eq(injury.userId, userId), isNull(injury.deletedAt))).orderBy(desc(injury.createdAt));

// ── Alumno: pedidos y video ─────────────────────────────────────────────────
export async function uploadRequestVideo(userId: string, f: { mime: string; bytes: Uint8Array }) {
  if (!videoOk(f.mime, f.bytes.byteLength)) throw new AccessError("invalid_file", "El video tiene que ser MP4, MOV o WebM de hasta 60 MB.");
  const id = randomUUID();
  const key = `request-video/${userId.replace(/[^a-z0-9]/gi, "")}/${id}`;
  await putObject(key, f.bytes);
  const [row] = await db.insert(mediaObject).values({ id, ownerUserId: userId, purpose: "request_video", storageKey: key, mime: f.mime, sizeBytes: f.bytes.byteLength }).returning();
  return { id: row.id };
}

export async function createRequest(userId: string, p: { kind: RequestKind; text: string; videoId?: string | null }) {
  if (!["rutina", "tecnica", "consulta", "programa"].includes(p.kind) || (p.text ?? "").trim().length < 3) throw new AccessError("invalid", "Contá qué necesitás.");
  const rel = await myRelation(userId);
  if (!rel) throw new AccessError("no_coach", "Todavía no tenés coach. Los pedidos al equipo de sala del gym llegan pronto.", 409);
  if (p.videoId) {
    const [v] = await db.select().from(mediaObject).where(and(eq(mediaObject.id, p.videoId), eq(mediaObject.ownerUserId, userId), isNull(mediaObject.deletedAt)));
    const used = await db.select({ id: studentRequest.id }).from(studentRequest).where(eq(studentRequest.videoId, p.videoId));
    if (!v || used.length) throw new AccessError("invalid", "El video no es válido.");
  }
  if (p.kind === "programa") {
    const [open] = await db.select().from(studentRequest).where(and(eq(studentRequest.userId, userId), eq(studentRequest.kind, "programa"), eq(studentRequest.status, "open")));
    if (open) return { id: open.id, coachName: rel.coachName, duplicate: true };
  }
  const [row] = await db.insert(studentRequest).values({ userId, coachClientId: rel.rel.id, kind: p.kind, text: p.text.trim().slice(0, 1000), videoId: p.videoId ?? null }).returning();
  return { id: row.id, coachName: rel.coachName, duplicate: false };
}

// ── Alumno: bandeja, privacidad y decisiones ────────────────────────────────
async function expireOld(tx: Tx | typeof db = db) {
  await tx.update(accessRequest).set({ status: "expired" }).where(and(eq(accessRequest.status, "pending"), lt(accessRequest.expiresAt, new Date())));
}

export async function myInbox(userId: string) {
  await expireOld();
  const rel = await myRelation(userId);
  const pending = rel ? await db.select().from(accessRequest).where(and(eq(accessRequest.coachClientId, rel.rel.id), eq(accessRequest.status, "pending"))).orderBy(desc(accessRequest.createdAt)) : [];
  const reqs = await db.select().from(studentRequest).where(eq(studentRequest.userId, userId)).orderBy(desc(studentRequest.createdAt)).limit(20);
  return {
    coach: rel ? { name: rel.coachName, org: rel.org.name } : null,
    accessRequests: pending.map((a) => ({ id: a.id, item: a.item, phrase: ACCESS_ITEMS[a.item as AccessItem]?.phrase ?? a.item, reason: a.reason, from: rel!.coachName, expiresAt: a.expiresAt, createdAt: a.createdAt })),
    requests: reqs.map((r) => ({ id: r.id, kind: r.kind, text: r.text, status: r.status, createdAt: r.createdAt, resolvedAt: r.resolvedAt, unseenResolved: r.status === "done" && !r.seenResolvedAt, hasVideo: !!r.videoId })),
    checkinToday: !!(await todayCheckin(userId)),
  };
}
export async function markResolvedSeen(userId: string, id: string) {
  await db.update(studentRequest).set({ seenResolvedAt: new Date() }).where(and(eq(studentRequest.id, id), eq(studentRequest.userId, userId)));
}

async function setItem(tx: Tx, userId: string, rel: { id: string; coachOrgId: string }, item: AccessItem, on: boolean) {
  const restricted = await minorWithoutGuardian(userId);
  if (on && resolveGrants("coach_client", [item], { minorWithoutGuardian: restricted }).indexOf(item) < 0) {
    throw new AccessError("minor", "Este dato se comparte cuando tu adulto responsable lo autorice.", 403);
  }
  const current = await tx.select().from(consentGrant).where(and(eq(consentGrant.relationId, rel.id), eq(consentGrant.item, item), eq(consentGrant.status, "active")));
  if (on && !current.length) {
    await tx.insert(consentGrant).values({ userId, scope: "coach_client", relationId: rel.id, granteeOrgId: rel.coachOrgId, item, termsVersion: TERMS_VERSION });
    await log(tx, { subjectUserId: userId, actorUserId: userId, orgId: rel.coachOrgId, item, action: "granted" });
  }
  if (!on && current.length) {
    await tx.update(consentGrant).set({ status: "revoked", revokedAt: new Date() }).where(inArray(consentGrant.id, current.map((g) => g.id)));
    await log(tx, { subjectUserId: userId, actorUserId: userId, orgId: rel.coachOrgId, item, action: "revoked" });
  }
  await audit(tx, { actorUserId: userId, orgId: rel.coachOrgId, action: on ? "consent.granted" : "consent.revoked", resourceType: "relation", resourceId: rel.id, meta: { item } });
}

export async function decideAccess(userId: string, requestId: string, approve: boolean) {
  const rel = await myRelation(userId);
  if (!rel) throw NOT_FOUND();
  return db.transaction(async (tx) => {
    await expireOld(tx);
    const [a] = await tx.select().from(accessRequest).where(and(eq(accessRequest.id, requestId), eq(accessRequest.coachClientId, rel.rel.id))).for("update");
    if (!a) throw NOT_FOUND();
    if (a.status !== "pending") throw new AccessError("decided", a.status === "expired" ? "La solicitud venció." : "Ya respondiste esta solicitud.", 409);
    if (approve) await setItem(tx, userId, rel.rel, a.item as AccessItem, true);
    else await log(tx, { subjectUserId: userId, actorUserId: userId, orgId: rel.org.id, item: a.item, action: "denied" });
    await tx.update(accessRequest).set({ status: approve ? "granted" : "denied", decidedAt: new Date() }).where(eq(accessRequest.id, a.id));
    return { status: approve ? "granted" : "denied" };
  });
}

/** Encender/apagar un tipo de dato desde Privacidad. Apagar revoca al instante para el coach. */
export async function setShare(userId: string, item: string, on: boolean) {
  if (!isAccessItem(item)) throw new AccessError("invalid", "Ese dato siempre se comparte o no existe.");
  const rel = await myRelation(userId);
  if (!rel) throw new AccessError("no_coach", "No tenés coach con quien compartir.", 409);
  return db.transaction(async (tx) => {
    await setItem(tx, userId, rel.rel, item, on);
    if (on) await tx.update(accessRequest).set({ status: "granted", decidedAt: new Date() }).where(and(eq(accessRequest.coachClientId, rel.rel.id), eq(accessRequest.item, item), eq(accessRequest.status, "pending")));
    return { item, on };
  });
}

export async function myPrivacy(userId: string) {
  const rel = await myRelation(userId);
  const restricted = await minorWithoutGuardian(userId);
  const items = rel ? await activeItems(rel.rel.id) : [];
  const logs = await db.select({ l: dataAccessLog, actor: user.name, org: organization.name }).from(dataAccessLog)
    .leftJoin(user, eq(user.id, dataAccessLog.actorUserId)).leftJoin(organization, eq(organization.id, dataAccessLog.orgId))
    .where(eq(dataAccessLog.subjectUserId, userId)).orderBy(desc(dataAccessLog.at)).limit(30);
  return {
    coach: rel ? { name: rel.coachName, org: rel.org.name } : null,
    items: CONSENT_CATALOG.coach_client.map((c) => ({
      key: c.key, title: c.title, desc: c.desc, locked: !!c.locked, on: c.locked ? true : items.includes(c.key),
      restricted: restricted && !!c.minorRestricted,
    })),
    history: logs.map((x) => ({ action: x.l.action, item: x.l.item, label: ACCESS_ITEMS[x.l.item as AccessItem]?.label ?? x.l.item, actor: x.l.actorUserId === userId ? "Vos" : (x.actor ?? x.org ?? "—"), at: x.l.at })),
    injuries: await myInjuries(userId),
  };
}

// ── Coach: bandeja, salud de la ficha, pedir acceso ─────────────────────────
export async function coachInbox(actorId: string, orgId: string) {
  await requireCoach(actorId, orgId);
  await expireOld();
  const rels = await db.select({ rel: coachClient, name: user.name }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(eq(coachClient.coachOrgId, orgId));
  const relIds = rels.map((r) => r.rel.id);
  const nameOf = (relId: string) => rels.find((r) => r.rel.id === relId)?.name ?? "";
  const reqs = relIds.length ? await db.select().from(studentRequest).where(inArray(studentRequest.coachClientId, relIds))
    .orderBy(sql`case when ${studentRequest.status} = 'open' then 0 else 1 end`, desc(studentRequest.createdAt)).limit(30) : [];
  const grants = relIds.length ? await db.select({ rel: consentGrant.relationId, item: consentGrant.item }).from(consentGrant)
    .where(and(inArray(consentGrant.relationId, relIds), eq(consentGrant.status, "active"))) : [];
  const healthRel = new Set(grants.filter((g) => g.item === "health").map((g) => g.rel));
  const userToRel = new Map(rels.map((r) => [r.rel.userId, r.rel.id]));
  const since = addDays(new Date(), -21);
  const pains = rels.length ? await db.select().from(painReport).where(and(inArray(painReport.userId, rels.map((r) => r.rel.userId)), gte(painReport.createdAt, since))).orderBy(desc(painReport.createdAt)) : [];
  const visiblePains = pains.filter((p) => { const rid = userToRel.get(p.userId)!; return coachSeesPain(p, rid, healthRel.has(rid)); });
  const cks = rels.length ? await db.select().from(checkin).where(and(inArray(checkin.userId, rels.map((r) => r.rel.userId)), gte(checkin.createdAt, since))).orderBy(desc(checkin.createdAt)).limit(30) : [];
  const access = relIds.length ? await db.select().from(accessRequest).where(inArray(accessRequest.coachClientId, relIds)).orderBy(desc(accessRequest.createdAt)).limit(30) : [];
  const invs = await db.select().from(invitation).where(and(eq(invitation.orgId, orgId), eq(invitation.status, "pending"), gte(invitation.expiresAt, new Date()))).orderBy(desc(invitation.createdAt));
  // Ver la bandeja marca como vistas las molestias visibles.
  const unseen = visiblePains.filter((p) => !p.seenByCoachAt).map((p) => p.id);
  if (unseen.length) await db.update(painReport).set({ seenByCoachAt: new Date() }).where(inArray(painReport.id, unseen));
  const vids = reqs.filter((r) => r.videoId).map((r) => r.videoId!);
  const gone = new Set(vids.length ? (await db.select({ id: mediaObject.id }).from(mediaObject).where(and(inArray(mediaObject.id, vids), sql`${mediaObject.deletedAt} is not null`))).map((v) => v.id) : []);
  return {
    requests: reqs.map((r) => ({ id: r.id, relId: r.coachClientId, member: nameOf(r.coachClientId), kind: r.kind, text: r.text, status: r.status, createdAt: r.createdAt, videoId: r.videoId && !gone.has(r.videoId) ? r.videoId : null, videoDeleted: !!r.videoId && gone.has(r.videoId) })),
    pains: visiblePains.map((p) => ({ id: p.id, relId: userToRel.get(p.userId)!, member: nameOf(userToRel.get(p.userId)!), zone: p.zone, level: p.level, context: p.context, exerciseName: p.exerciseName, note: p.note, createdAt: p.createdAt, shared: !healthRel.has(userToRel.get(p.userId)!) })),
    checkins: cks.map((c) => ({ id: c.id, relId: userToRel.get(c.userId)!, member: nameOf(userToRel.get(c.userId)!), date: c.date, energy: c.energy, sleep: c.sleep, mood: c.mood })),
    access: access.map((a) => ({ id: a.id, relId: a.coachClientId, member: nameOf(a.coachClientId), item: a.item, label: ACCESS_ITEMS[a.item as AccessItem]?.label ?? a.item, status: a.status, createdAt: a.createdAt })),
    invitations: invs.map((i) => ({ id: i.id, code: i.code, email: i.email, expiresAt: i.expiresAt })),
  };
}

export async function inboxCount(orgId: string) {
  const rels = await db.select({ id: coachClient.id, userId: coachClient.userId }).from(coachClient).where(eq(coachClient.coachOrgId, orgId));
  if (!rels.length) return 0;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(studentRequest).where(and(inArray(studentRequest.coachClientId, rels.map((r) => r.id)), eq(studentRequest.status, "open")));
  const health = new Set((await db.select({ rel: consentGrant.relationId }).from(consentGrant)
    .where(and(inArray(consentGrant.relationId, rels.map((r) => r.id)), eq(consentGrant.item, "health"), eq(consentGrant.status, "active")))).map((g) => g.rel));
  const pains = await db.select().from(painReport).where(and(inArray(painReport.userId, rels.map((r) => r.userId)), isNull(painReport.seenByCoachAt)));
  return n + pains.filter((p) => { const rid = rels.find((r) => r.userId === p.userId)!.id; return coachSeesPain(p, rid, health.has(rid)); }).length;
}

export async function resolveRequest(actorId: string, orgId: string, requestId: string) {
  await requireCoach(actorId, orgId);
  const [r] = await db.select({ r: studentRequest }).from(studentRequest).innerJoin(coachClient, eq(coachClient.id, studentRequest.coachClientId))
    .where(and(eq(studentRequest.id, requestId), eq(coachClient.coachOrgId, orgId)));
  if (!r) throw NOT_FOUND();
  if (r.r.status === "done") return { status: "done" };
  await db.update(studentRequest).set({ status: "done", resolvedBy: actorId, resolvedAt: new Date() }).where(eq(studentRequest.id, requestId));
  await audit(db, { actorUserId: actorId, orgId, action: "request.resolved", resourceType: "student_request", resourceId: requestId });
  return { status: "done" };
}

export async function requestAccess(actorId: string, orgId: string, relId: string, item: string, reason?: string) {
  if (!isAccessItem(item)) throw new AccessError("invalid", "Tipo de dato inválido.");
  const r = await coachRelation(actorId, orgId, relId);
  if (r.rel.status !== "active") throw new AccessError("invalid", "La relación no está activa.");
  if ((await activeItems(relId)).includes(item)) throw new AccessError("already", "Ya tenés acceso a este dato.", 409);
  await expireOld();
  const [pending] = await db.select().from(accessRequest).where(and(eq(accessRequest.coachClientId, relId), eq(accessRequest.item, item), eq(accessRequest.status, "pending")));
  if (pending) return { id: pending.id, status: "pending", duplicate: true };
  // D38: tras un rechazo, el mismo dato se puede volver a pedir recién a los 7 días.
  const [lastDenied] = await db.select().from(accessRequest).where(and(eq(accessRequest.coachClientId, relId), eq(accessRequest.item, item), eq(accessRequest.status, "denied")))
    .orderBy(desc(accessRequest.decidedAt)).limit(1);
  const retry = accessRetryAt(lastDenied?.decidedAt ?? null, new Date());
  if (retry) {
    const fecha = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "long" }).format(retry);
    throw new AccessError("cooldown", `${r.name.split(" ")[0]} rechazó este pedido. Podés volver a pedirlo desde el ${fecha}.`, 409, { retryAt: retry.toISOString() });
  }
  const [a] = await db.insert(accessRequest).values({
    coachClientId: relId, item, reason: (reason?.trim() || ACCESS_ITEMS[item].reason).slice(0, 300), requestedBy: actorId,
    expiresAt: addDays(new Date(), ACCESS_REQUEST_TTL_DAYS),
  }).returning();
  await log(db, { subjectUserId: r.rel.userId, actorUserId: actorId, orgId, item, action: "requested" });
  return { id: a.id, status: "pending", duplicate: false };
}

/** Estado de acceso por tipo de dato para la ficha (y desde cuándo se puede volver a pedir tras un rechazo, D38). */
export async function accessStates(actorId: string, orgId: string, relId: string) {
  await coachRelation(actorId, orgId, relId);
  await expireOld();
  const items = await activeItems(relId);
  const reqs = await db.select().from(accessRequest).where(eq(accessRequest.coachClientId, relId)).orderBy(desc(accessRequest.createdAt));
  const now = new Date();
  return Object.fromEntries((Object.keys(ACCESS_ITEMS) as AccessItem[]).map((k) => {
    const last = reqs.find((r) => r.item === k);
    const denied = reqs.filter((r) => r.item === k && r.status === "denied").sort((x, y) => (y.decidedAt?.getTime() ?? 0) - (x.decidedAt?.getTime() ?? 0))[0];
    const retryAt = accessRetryAt(denied?.decidedAt ?? null, now);
    return [k, { status: items.includes(k) ? "granted" : (last?.status ?? "none"), retryAt: retryAt?.toISOString() ?? null }];
  })) as Record<AccessItem, { status: string; retryAt: string | null }>;
}

/** Salud del cliente. Con grant: lesiones y molestias (y queda registrada la lectura). Sin grant: sólo molestias compartidas una a una. */
export async function clientHealth(actorId: string, orgId: string, relId: string) {
  const r = await coachRelation(actorId, orgId, relId);
  const granted = (await activeItems(relId)).includes("health");
  const pains = (await db.select().from(painReport).where(eq(painReport.userId, r.rel.userId)).orderBy(desc(painReport.createdAt)).limit(40))
    .filter((p) => coachSeesPain(p, relId, granted));
  const checkins = await db.select().from(checkin).where(eq(checkin.userId, r.rel.userId)).orderBy(desc(checkin.date)).limit(14);
  if (granted) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const [already] = await db.select({ id: dataAccessLog.id }).from(dataAccessLog)
      .where(and(eq(dataAccessLog.subjectUserId, r.rel.userId), eq(dataAccessLog.actorUserId, actorId), eq(dataAccessLog.item, "health"), eq(dataAccessLog.action, "read"), gte(dataAccessLog.at, today)));
    if (!already) await log(db, { subjectUserId: r.rel.userId, actorUserId: actorId, orgId, item: "health", action: "read" });
  }
  return {
    granted,
    injuries: granted ? await myInjuries(r.rel.userId) : [],
    pains: pains.map((p) => ({ id: p.id, zone: p.zone, level: p.level, context: p.context, exerciseName: p.exerciseName, note: p.note, createdAt: p.createdAt, sharedOne: !granted })),
    checkins: checkins.map((c) => ({ date: c.date, energy: c.energy, sleep: c.sleep, mood: c.mood })),
    access: await accessStates(actorId, orgId, relId),
  };
}

/** Autoriza la descarga de un video: su dueño o el coach de la relación del pedido que lo usa. */
export async function authorizeVideo(actorId: string, videoId: string) {
  const [v] = await db.select().from(mediaObject).where(and(eq(mediaObject.id, videoId), isNull(mediaObject.deletedAt)));
  if (!v) throw NOT_FOUND();
  if (v.ownerUserId === actorId) return v;
  const [ok] = await db.select({ id: studentRequest.id }).from(studentRequest).innerJoin(coachClient, eq(coachClient.id, studentRequest.coachClientId))
    .innerJoin(staffMembership, and(eq(staffMembership.orgId, coachClient.coachOrgId), eq(staffMembership.userId, actorId), eq(staffMembership.role, "coach_owner"), eq(staffMembership.status, "active")))
    .where(eq(studentRequest.videoId, videoId));
  if (ok) return v;
  // Video de un pedido al equipo de sala: lo ve el personal de sala de esa sede (no gerencia ni dueño).
  const [t] = await db.select({ orgId: schema.gymTask.orgId, loc: schema.gymTask.locationId }).from(schema.gymTask).where(eq(schema.gymTask.videoId, videoId));
  if (t) {
    const roles = await db.select({ role: staffMembership.role, loc: staffMembership.locationId }).from(staffMembership)
      .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, t.orgId), eq(staffMembership.status, "active")));
    if (gymCan(roles.filter((r) => !r.loc || r.loc === t.loc).map((r) => r.role), "floor.work")) return v;
  }
  // Comunidad (Etapa 6): imágenes para socios y staff de la organización; videos de intento para quien valida.
  if (v.purpose !== "request_video" && await authorizeCommunityMedia(actorId, v)) return v;
  throw NOT_FOUND();
}


/**
 * D39: borra videos de técnica 90 días después de resolver su pedido y los subidos sin pedido tras 24 h.
 * Se borra el archivo y se marca el registro (metadata sin contenido queda para auditoría). Pensado para un job programado.
 */
export async function purgeMedia(now = new Date()) {
  const limitResolved = new Date(now.getTime() - VIDEO_RETENTION_DAYS * 86_400_000);
  const limitOrphan = new Date(now.getTime() - ORPHAN_VIDEO_HOURS * 3_600_000);
  const expired = await db.select({ m: mediaObject }).from(mediaObject).innerJoin(studentRequest, eq(studentRequest.videoId, mediaObject.id))
    .where(and(isNull(mediaObject.deletedAt), eq(studentRequest.status, "done"), lt(studentRequest.resolvedAt, limitResolved)));
  // También el video adjunto a un pedido al equipo de sala (D41): mismo plazo desde que la tarea se completa o cancela.
  const expiredGym = await db.select({ m: mediaObject }).from(mediaObject).innerJoin(schema.gymTask, eq(schema.gymTask.videoId, mediaObject.id))
    .where(and(isNull(mediaObject.deletedAt), eq(schema.gymTask.status, "done"), lt(schema.gymTask.completedAt, limitResolved)));
  const orphans = await db.select().from(mediaObject)
    .where(and(isNull(mediaObject.deletedAt), lt(mediaObject.createdAt, limitOrphan), sql`not exists (select 1 from student_request r where r.video_id = ${mediaObject.id})`,
      sql`not exists (select 1 from gym_task t where t.video_id = ${mediaObject.id})`, sql`not exists (select 1 from challenge_attempt a where a.video_id = ${mediaObject.id})`,
      sql`not exists (select 1 from community_post p where p.image_id = ${mediaObject.id} and p.deleted_at is null)`, sql`not exists (select 1 from catalog_item c where c.image_id = ${mediaObject.id} and c.deleted_at is null)`));
  // Video de intento de récord: 90 días después de la decisión (05_BUSINESS_RULES · Comunidad).
  const expiredAttempts = await db.select({ m: mediaObject }).from(mediaObject).innerJoin(schema.challengeAttempt, eq(schema.challengeAttempt.videoId, mediaObject.id))
    .where(and(isNull(mediaObject.deletedAt), inArray(schema.challengeAttempt.status, ["approved", "rejected"]), lt(schema.challengeAttempt.decidedAt, limitResolved)));
  expired.push(...expiredGym, ...expiredAttempts);
  const all = [...expired.map((e) => e.m), ...orphans];
  for (const m of all) {
    await deleteObject(m.storageKey);
    await db.update(mediaObject).set({ deletedAt: now }).where(eq(mediaObject.id, m.id));
  }
  if (all.length) await audit(db, { action: "media.purged", resourceType: "media_object", meta: { retention: expired.length, orphans: orphans.length } });
  return { retention: expired.length, orphans: orphans.length };
}
